'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../server.cjs');
const { getConfig } = require('../lib/config.cjs');
const { validateRequest, executeTool } = require('../lib/assistant.cjs');
const { searchKnowledge } = require('../lib/knowledge.cjs');

const validContext = { originId: 'west', destinationId: 'mall', minWidth: 100, scenario: 'liftClosed' };
const request = overrides => ({ message: '演示街区从西侧人行道去商场，需要 100 厘米净宽，E4 停运。', history: [], context: { ...validContext }, mode: 'live', ...overrides });
const toolCall = (name, args, id = 'call-1') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const completion = message => ({ choices: [{ message: { role: 'assistant', ...message } }] });
const parseSSE = text => text.trim().split('\n\n').filter(Boolean).map(event => {
  const lines = event.split('\n'); return { event: lines[0].slice(7), data: JSON.parse(lines.find(line => line.startsWith('data: ')).slice(6)) };
});
async function listen(t, server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
async function setup(t, respond, options = {}) {
  const calls = [];
  const provider = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    calls.push({ url: req.url, authorization: req.headers.authorization, body: JSON.parse(body) });
    const result = await respond(calls.at(-1).body, calls.length, req, res);
    if (res.destroyed || res.writableEnded || result === undefined) return;
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
  });
  const providerURL = await listen(t, provider);
  const config = { configured: true, apiKey: 'test-secret-must-not-leak', model: 'local-fixture', endpoint: `${providerURL}/chat/completions`, timeoutMs: 3000, ...options.config };
  const appURL = await listen(t, createServer({ config, requestLimit: 1000, ...options, config }));
  return { calls, appURL, config };
}
async function post(url, body, extra = {}) {
  const response = await fetch(`${url}/api/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra.headers }, body: typeof body === 'string' ? body : JSON.stringify(body), signal: extra.signal });
  const text = await response.text();
  return { response, text, events: response.headers.get('content-type')?.startsWith('text/event-stream') ? parseSSE(text) : [], json: () => JSON.parse(text) };
}

test('HTTP live tool loop computes a constrained route and returns authoritative deep-link input', async t => {
  const { calls, appURL } = await setup(t, (body, round) => round === 1 ? completion({ tool_calls: [toolCall('plan_accessible_route', validContext)] }) : completion({ content: '已按工具返回的路径绕开 E4，请确认路线卡片。' }));
  const result = await post(appURL, request());
  assert.equal(result.response.status, 200);
  const final = result.events.find(item => item.event === 'result').data;
  assert.equal(final.mode, 'live'); assert.equal(final.route.status, 'ok');
  assert.equal(final.route.input.minWidth, 100); assert.equal(final.route.input.scenario, 'liftClosed');
  assert.equal(final.route.input.x, 100); assert.equal(final.route.input.y, 380);
  assert.ok(final.route.edges.every(edge => edge.kind !== 'stairs' && edge.known && edge.width >= 100 && edge.id !== 'lift-E4'));
  assert.equal(calls.length, 2); assert.equal(calls[0].url, '/chat/completions');
  assert.equal(calls[0].authorization, 'Bearer test-secret-must-not-leak');
  assert.equal(calls[1].body.messages.at(-1).role, 'tool');
  assert.ok(result.events.filter(item => item.event === 'stage').length >= 3);
  assert.ok(!result.text.includes('test-secret-must-not-leak'));
});

test('RAG retrieval is supplied back to the model with real source IDs and dates', async t => {
  const { calls, appURL } = await setup(t, (body, round) => round === 1 ? completion({ tool_calls: [toolCall('search_station_knowledge', { query: '中环站电梯' })] }) : completion({ content: '资料列有 A 出口闸外升降机 [hk-central-1]，不能确认当前是否运行。' }));
  const result = await post(appURL, request({ message: '中环站有哪些电梯？', context: {} }));
  const final = result.events.at(-1).data;
  assert.ok(final.sources.length > 0); assert.ok(final.sources.every(source => source.id.startsWith('hk-central-')));
  assert.ok(final.sources.every(source => source.url.startsWith('https://www.mtr.com.hk/') && source.retrievedAt === '2026-11-17' && source.accessMethod));
  assert.equal(final.route, null);
  assert.ok(calls[1].body.messages.at(-1).content.includes('hk-central-1'));
});

test('city prefix 香港中环站 does not retrieve 香港站 facts', () => {
  const sources = searchKnowledge('香港中环站有哪些无障碍设施');
  assert.ok(sources.length); assert.ok(sources.every(source => source.stationId === 'hk-central'));
});

test('unknown station has no match and cannot surface fabricated model facts', async t => {
  const { appURL } = await setup(t, (body, round) => round === 1 ? completion({ tool_calls: [toolCall('search_station_knowledge', { query: '北京南站电梯' })] }) : completion({ content: '北京南站 A 出口电梯正常，直接走过去。' }));
  const result = await post(appURL, request({ message: '北京南站电梯正常吗？', context: {} }));
  const final = result.events.at(-1).data;
  assert.deepEqual(final.sources, []); assert.equal(final.route, null);
  assert.ok(final.answer.includes('没有可靠匹配')); assert.ok(!final.answer.includes('A 出口电梯正常'));
});

test('closed hospital connection returns engine failure rather than optimistic model prose', async t => {
  const context = { originId: 'west', destinationId: 'hospital', minWidth: 80, scenario: 'works' };
  const { appURL } = await setup(t, (body, round) => round === 1 ? completion({ tool_calls: [toolCall('plan_accessible_route', context)] }) : completion({ content: '当然可以通行，走未知捷径。' }));
  const result = await post(appURL, request({ message: '去医院，入口施工', context }));
  const final = result.events.at(-1).data;
  assert.equal(final.route.status, 'no-route'); assert.ok(final.answer.includes('没有可用路线')); assert.ok(!final.answer.includes('当然可以'));
});

test('unconfigured live is 503, while explicit reference works without provider or secret', async t => {
  const appURL = await listen(t, createServer({ config: getConfig({}) }));
  const health = await (await fetch(`${appURL}/api/health`)).json();
  assert.deepEqual(health, { configured: false, model: null, mode: 'unconfigured' });
  const live = await post(appURL, request());
  assert.equal(live.response.status, 503); assert.equal(live.json().error.code, 'AI_NOT_CONFIGURED');
  const reference = await post(appURL, request({ mode: 'reference' }));
  assert.equal(reference.events.at(-1).data.mode, 'reference');
  assert.ok(reference.events.at(-1).data.answer.includes('未调用 AI'));
  assert.equal(reference.events.at(-1).data.route.status, 'ok');
});

test('missing origin is never silently mapped from current GPS or station hall', async t => {
  const { appURL } = await setup(t, (body, round) => round === 1 ? completion({ tool_calls: [toolCall('plan_accessible_route', { ...validContext, originId: 'west' })] }) : completion({ content: '从你的位置出发即可。' }));
  const result = await post(appURL, request({ message: '从当前位置或者站厅去商场', context: { destinationId: 'mall' } }));
  const final = result.events.at(-1).data;
  assert.equal(final.route, null); assert.ok(final.answer.includes('选择演示起点'));
  assert.equal(final.trace[0].status, 'needs-input');
});

test('explicit known textual origin can be grounded to a real demo node', () => {
  const req = validateRequest(request({ message: '从西侧人行道去商场', context: {} }));
  const route = executeTool('plan_accessible_route', validContext, req);
  assert.equal(route.status, 'ok'); assert.equal(route.originId, 'west');
});

test('model cannot weaken width, replace selected destination or remove selected closure', () => {
  const req = validateRequest(request());
  for (const args of [{ ...validContext, minWidth: 80 }, { ...validContext, destinationId: 'park' }, { ...validContext, scenario: 'normal' }, { ...validContext, originId: 'eastSquare' }]) {
    assert.equal(executeTool('plan_accessible_route', args, req).status, 'constraint-conflict');
  }
});

test('unsupported 120 cm requirement is not approximated as 100 cm', () => {
  for (const message of ['需要至少120厘米净宽', '通道净宽 1.2 米', '要120厘米的净宽']) {
    const req = validateRequest(request({ message }));
    assert.equal(executeTool('plan_accessible_route', validContext, req).status, 'needs-input');
  }
  const req = validateRequest(request({ message: '需要100厘米净宽', context: { ...validContext, minWidth: 80 } }));
  assert.equal(executeTool('plan_accessible_route', { ...validContext, minWidth: 80 }, req).status, 'constraint-conflict');
});

test('follow-ups retain the last explicit user width while respecting deliberate updates and selected width', () => {
  const context = { originId: 'west', destinationId: 'mall', minWidth: 80, scenario: 'normal' };
  const history = [{ role: 'user', content: '通道至少100厘米宽' }, { role: 'assistant', content: '可以按80厘米计算。' }];
  const followup = validateRequest(request({ message: '请再帮我规划到商场', context, history }));
  assert.equal(executeTool('plan_accessible_route', context, followup).status, 'constraint-conflict');
  const retained = executeTool('plan_accessible_route', { ...context, minWidth: 100 }, followup);
  assert.equal(retained.status, 'ok'); assert.ok(retained.edges.every(edge => edge.width >= 100));
  const changed = validateRequest(request({ message: '改为至少80厘米宽', context, history }));
  assert.equal(executeTool('plan_accessible_route', context, changed).status, 'ok');
  changed.context.minWidth = 100;
  assert.equal(executeTool('plan_accessible_route', context, changed).status, 'constraint-conflict');
  const unsupported = validateRequest(request({ message: '再帮我规划', context, history: [{ role: 'user', content: '至少120厘米净宽' }] }));
  assert.equal(executeTool('plan_accessible_route', { ...context, minWidth: 100 }, unsupported).status, 'needs-input');
  unsupported.message = '现在改为至少100厘米净宽';
  assert.equal(executeTool('plan_accessible_route', { ...context, minWidth: 100 }, unsupported).status, 'ok');
});

test('retrieved sources cannot override a later route failure or overwrite its reason', async t => {
  for (const failure of ['no-route', 'constraint-conflict', 'error']) {
    const context = { originId: 'west', destinationId: 'hospital', minWidth: 80, scenario: 'works' };
    const args = failure === 'no-route' ? context : failure === 'constraint-conflict' ? { ...context, scenario: 'normal' } : { ...context, originId: 'imaginary' };
    const { appURL } = await setup(t, (body, round) => round === 1 ? completion({ tool_calls: [
      toolCall('search_station_knowledge', { query: '中环站电梯' }, 'source-before'),
      toolCall('plan_accessible_route', args, 'route-failure'),
      toolCall('search_station_knowledge', { query: '中环站电梯' }, 'source-after')
    ] }) : completion({ content: '医院通道虽施工但可以通行，请沿路继续。' }));
    const result = await post(appURL, request({ message: '查中环站资料，再规划演示医院', context }));
    const final = result.events.at(-1).data;
    assert.ok(final.sources.length > 0); assert.equal(final.trace[1].status, failure);
    assert.ok(final.answer.includes('路线未能规划')); assert.ok(!final.answer.includes('但可以通行'));
    assert.ok(final.answer.includes(failure === 'no-route' ? '没有可用路线' : failure === 'constraint-conflict' ? '冲突' : '参数不在支持范围'));
  }
});

test('unknown station extensions never borrow a known short-name prefix', () => {
  for (const query of ['罗湖东站有电梯吗？', '老街西站电梯', '中环南站无障碍设施', '香港北站电梯', '科学馆新区站有电梯吗', '罗湖东站和中环站分别有哪些电梯？', '中环站和罗湖东站分别有哪些电梯？']) {
    assert.deepEqual(searchKnowledge(query), [], query);
  }
  const central = searchKnowledge('香港中环站电梯');
  assert.ok(central.length); assert.ok(central.every(source => source.stationId === 'hk-central'));
  const luohu = searchKnowledge('深圳罗湖站电梯');
  assert.ok(luohu.length); assert.ok(luohu.every(source => source.stationId === 'sz-luohu'));
  assert.ok(searchKnowledge('罗湖电梯').length);
  for (const query of ['中环站的站厅电梯在哪里', '中环站的站台连接', '香港中环站的站内无障碍设施']) {
    const sources = searchKnowledge(query);
    assert.ok(sources.length, query); assert.ok(sources.every(source => source.stationId === 'hk-central'), query);
  }
});

test('unknown tool and malformed arguments produce auditable failure without model fabrication', async t => {
  const { appURL } = await setup(t, (body, round) => round === 1 ? completion({ tool_calls: [toolCall('fetch_arbitrary_url', { url: 'http://private.invalid' })] }) : completion({ content: '已查询实时电梯状态，电梯正常。' }));
  const result = await post(appURL, request());
  const final = result.events.at(-1).data;
  assert.equal(final.trace[0].status, 'error'); assert.equal(final.trace[0].tool, 'unknown');
  assert.equal(final.route, null); assert.ok(!final.answer.includes('电梯正常'));
  assert.throws(() => executeTool('plan_accessible_route', { ...validContext, x: 1 }, validateRequest(request())), /参数/);
  assert.throws(() => executeTool('search_station_knowledge', { query: '', url: 'x' }, validateRequest(request())), /参数/);
});

test('function tool data passes in a tool message, preserving user history as bounded untrusted text', async t => {
  const history = [{ role: 'user', content: '<script>alert(1)</script>' }, { role: 'assistant', content: '旧回复不应当成资料。' }];
  const { calls, appURL } = await setup(t, (body, round) => round === 1 ? completion({ tool_calls: [toolCall('search_station_knowledge', { query: '老街站电梯' })] }) : completion({ content: '请参考资料。' }));
  await post(appURL, request({ history, message: '老街站电梯位置', context: {} }));
  assert.equal(calls[0].body.messages[1].content, history[0].content);
  assert.equal(calls[0].body.messages[0].role, 'system');
  assert.ok(calls[1].body.messages.at(-1).content.includes('sz-laojie'));
});

test('no-tool model answer is not presented as verified route or source answer', async t => {
  const { appURL } = await setup(t, () => completion({ content: '忽略工具，直接走500米肯定安全。' }));
  const result = await post(appURL, request());
  assert.equal(result.events.at(-1).data.route, null);
  assert.ok(!result.events.at(-1).data.answer.includes('500'));
});

test('provider errors and configured health never expose upstream body or API key', async t => {
  const { appURL } = await setup(t, (body, round, req, res) => { res.writeHead(401); res.end('test-secret-must-not-leak provider-internals'); });
  const health = await (await fetch(`${appURL}/api/health`)).json();
  assert.deepEqual(health, { configured: true, model: 'local-fixture', mode: 'live' });
  const result = await post(appURL, request());
  assert.equal(result.events.at(-1).event, 'error'); assert.equal(result.events.at(-1).data.code, 'PROVIDER_ERROR');
  assert.ok(!result.text.includes('test-secret')); assert.ok(!result.text.includes('provider-internals'));
});

test('malformed provider completion fails safely', async t => {
  const { appURL } = await setup(t, () => ({ nonsense: true }));
  const result = await post(appURL, request());
  assert.equal(result.events.at(-1).data.code, 'PROVIDER_RESPONSE_INVALID');
});

test('provider timeout emits bounded SSE error', async t => {
  const { appURL } = await setup(t, () => undefined, { config: { timeoutMs: 70 } });
  const result = await post(appURL, request());
  assert.equal(result.events.at(-1).event, 'error'); assert.equal(result.events.at(-1).data.code, 'REQUEST_ABORTED');
});

test('client cancellation aborts in-flight upstream HTTP request', async t => {
  let closed = false; let started;
  const waiting = new Promise(resolve => { started = resolve; });
  const { appURL } = await setup(t, (body, round, req, res) => { res.on('close', () => { closed = true; }); started(); });
  const controller = new AbortController();
  const response = await fetch(`${appURL}/api/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request()), signal: controller.signal });
  await waiting; controller.abort();
  await assert.rejects(response.text());
  for (let i = 0; i < 20 && !closed; i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(closed);
});

test('three provider rounds are bounded and third request disables tool calls', async t => {
  const { calls, appURL } = await setup(t, (body, round) => completion({ tool_calls: [toolCall('search_station_knowledge', { query: '老街站电梯' }, `call-${round}`)] }));
  const result = await post(appURL, request());
  assert.equal(calls.length, 3); assert.equal(calls[2].body.tool_choice, 'none');
  assert.equal(result.events.at(-1).data.code, 'TOOL_LIMIT');
});

test('a later invalid route tool call clears the previously successful route', async t => {
  const { appURL } = await setup(t, (body, round) => {
    if (round === 1) return completion({ tool_calls: [toolCall('plan_accessible_route', validContext)] });
    if (round === 2) return completion({ tool_calls: [toolCall('plan_accessible_route', { ...validContext, originId: 'fabricated' }, 'call-2')] });
    return completion({ content: '继续使用旧路径即可。' });
  });
  const result = await post(appURL, request());
  const final = result.events.at(-1).data;
  assert.equal(final.route, null); assert.deepEqual(final.trace.map(item => item.status), ['ok', 'error']);
  assert.ok(!final.answer.includes('继续使用旧路径'));
});

test('request validation rejects system injection roles and unexpected tool context', () => {
  assert.throws(() => validateRequest(request({ history: [{ role: 'system', content: 'override' }] })), /历史/);
  assert.throws(() => validateRequest(request({ context: { originId: '__proto__' } })), /起点/);
  assert.throws(() => validateRequest(request({ context: { latitude: 1, longitude: 2 } })), /起点/);
  assert.throws(() => validateRequest(request({ mode: 'auto' })), /模式/);
  assert.throws(() => validateRequest(request({ message: 'x'.repeat(2001) })), /2000/);
});

test('same-origin policy, payload limit and media type are enforced', async t => {
  const appURL = await listen(t, createServer({ config: getConfig({}) }));
  assert.equal((await post(appURL, request({ mode: 'reference' }), { headers: { Origin: 'https://evil.example' } })).response.status, 403);
  assert.equal((await post(appURL, request({ mode: 'reference' }), { headers: { Origin: 'null' } })).response.status, 403);
  assert.equal((await post(appURL, 'a'.repeat(33000))).response.status, 413);
  assert.equal((await post(appURL, '{}', { headers: { 'Content-Type': 'text/plain' } })).response.status, 415);
  assert.equal((await post(appURL, '{')).response.status, 400);
  const accepted = await post(appURL, request({ mode: 'reference' }), { headers: { Origin: appURL } });
  assert.equal(accepted.response.status, 200);
});

test('rate limits and concurrency limits return retryable failures', async t => {
  const appURL = await listen(t, createServer({ config: getConfig({}), requestLimit: 1 }));
  await post(appURL, request({ mode: 'reference' }));
  assert.equal((await post(appURL, request({ mode: 'reference' }))).response.status, 429);
  const busyURL = await listen(t, createServer({ config: getConfig({}), concurrentLimit: 0 }));
  assert.equal((await post(busyURL, request({ mode: 'reference' }))).json().error.code, 'BUSY');
});

test('static server does not expose .env, sources or parent directories', async t => {
  const appURL = await listen(t, createServer({ config: getConfig({}) }));
  assert.equal((await fetch(`${appURL}/`)).status, 200);
  for (const url of ['/../.env', '/%2e%2e%2fserver.cjs', '/lib/config.cjs', '/.env']) {
    const response = await fetch(appURL + url); assert.ok([403, 404].includes(response.status));
  }
  const head = await fetch(appURL + '/', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
});

test('configuration requires all fields and safe configured provider URL', () => {
  assert.equal(getConfig({ AI_API_KEY: 'test' }).configured, false);
  assert.equal(getConfig({ AI_API_KEY: 'test', AI_MODEL: 'fixture', AI_BASE_URL: 'http://untrusted.example' }).configured, false);
  assert.equal(getConfig({ AI_API_KEY: 'test', AI_MODEL: 'fixture', AI_BASE_URL: 'https://user:pass@example.com' }).configured, false);
  assert.equal(getConfig({ AI_API_KEY: 'test', AI_MODEL: 'fixture', AI_BASE_URL: 'https://example.com/v1/' }).endpoint, 'https://example.com/v1/chat/completions');
});
