/* Browser UI checks use local HTTP fixtures, never a real provider or credentials. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { network } = require('../lib/knowledge.cjs');
const puppeteer = require(process.env.PUPPETEER_PATH || path.join(process.env.APPDATA || '', 'npm/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer'));
const browserPath = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const root = path.resolve(__dirname, '..');
const results = [], requests = [], runtimeErrors = [];
let configured = false, fixture = 'route';
const input = { x: 100, y: 380, destinationId: 'mall', minWidth: 100, scenario: 'liftClosed' };
const route = { ...network.plan(input), input };
const resultFor = mode => ({ mode, answer: fixture === 'unsafe' ? '<img src=x onerror="window.__unsafe=true"> 这是文本，不应作为 HTML 执行。' : fixture === 'long' ? '资料说明。'.repeat(850) : '已按你的通行条件检查路径。E4 停运时绕行东侧坡道，计算结果见下方。',
  route: fixture === 'source' || fixture === 'unsafe' || fixture === 'long' ? null : route,
  sources: fixture === 'source' || fixture === 'unsafe' ? [{ id: 'hk-central', title: '港铁 · 中环站无障碍设施', url: fixture === 'unsafe' ? 'javascript:window.__unsafe=true' : 'https://www.mtr.com.hk/ch/customer/services/free_search.php?query_type=search&station=1', excerpt: 'A 出口列有闸外升降机；实时状态需要向运营方确认。', retrievedAt: '2026-11-17', accessMethod: '官方网页' }] : [],
  trace: [{ tool: fixture === 'source' ? 'search_station_knowledge' : 'plan_accessible_route', label: fixture === 'source' ? '检索站点资料' : '计算满足净宽要求的路径', status: 'ok' }],
  notice: '路线为虚构演示，站点资料不是实时设备状态。' });

const server = http.createServer((req, res) => {
  if (req.url === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ configured, model: configured ? 'browser-test-fixture' : null, mode: configured ? 'live' : 'unconfigured' })); return; }
  if (req.url === '/api/assistant') {
    let text = '';
    req.on('data', data => { text += data; });
    req.on('end', () => {
      const body = JSON.parse(text); requests.push(body);
      if (fixture === 'http-error') { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'AI_UNAVAILABLE', message: '测试服务暂不可用，请重试。' } })); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: stage\r\ndata: {"label":"正在查询可用路径…"}\r\n\r\n');
      if (fixture === 'pending') { const timer = setInterval(() => res.write(': heartbeat\n\n'), 100); res.on('close', () => clearInterval(timer)); return; }
      if (fixture === 'stream-error') { res.end('event: error\ndata: {"code":"FAILED","message":"工具调用未完成，请重试。"}\n\n'); return; }
      const data = Buffer.from('event: result\r\ndata: ' + JSON.stringify(resultFor(body.mode)) + '\r\n\r\n');
      // Split UTF-8 sequences and frame delimiters to exercise streaming decoding.
      let offset = 0;
      const timer = setInterval(() => {
        if (offset >= data.length) { clearInterval(timer); res.end(); return; }
        res.write(data.subarray(offset, offset + 71)); offset += 71;
      }, 2);
      res.on('close', () => clearInterval(timer));
    });
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { res.writeHead(400); res.end(); return; }
  const file = path.resolve(root, 'dist', '.' + pathname);
  if (!file.startsWith(path.join(root, 'dist') + path.sep)) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  });
});

(async () => {
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, pipe: true, args: ['--disable-background-networking', '--no-first-run', '--disable-default-apps'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => runtimeErrors.push(error.message));
    async function fresh({ live = false, width = 1440 } = {}) {
      configured = live; fixture = 'route';
      await page.setViewport({ width, height: 1050, deviceScaleFactor: 1 });
      await page.goto(base + '/assistant.html', { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => !document.getElementById('send-reference').disabled);
    }
    async function submit(mode = 'reference') {
      const count = await page.$$eval('.turn', nodes => nodes.length);
      await page.click(mode === 'live' ? '#send-live' : '#send-reference');
      await page.waitForFunction(count => document.querySelectorAll('.turn').length > count && document.getElementById('assistant-form').getAttribute('aria-busy') === 'false', {}, count);
    }
    async function message(text) { await page.$eval('#request', (node, value) => { node.value = value; node.dispatchEvent(new Event('input')); }, text); }
    async function check(name, fn) {
      try { await fn(); results.push({ name, passed: true }); console.log('PASS', name); }
      catch (error) { results.push({ name, passed: false, error: error.message }); console.error('FAIL', name, error.message); await page.screenshot({ path: path.join(root, 'artifacts', 'assistant-failure-' + results.length + '.png'), fullPage: true }).catch(() => {}); }
    }
    await check('Home keeps routes and exposes the assistant as its main action', async () => {
      await page.goto(base + '/index.html');
      assert.ok(await page.$('.welcome-card a[href="assistant.html"]'));
      assert.ok(await page.$('a[href="navigate.html"]'));
      assert.ok(await page.$('[data-action="open-route"][data-route="A"]'));
    });
    await check('File preview explicitly requires the local service', async () => {
      await page.goto(pathToFileURL(path.join(root, 'dist/assistant.html')).href);
      assert.match(await page.$eval('#service-note', node => node.textContent), /node server.cjs/);
      assert.equal(await page.$eval('#send-live', node => node.disabled), true);
      assert.equal(await page.$eval('#send-reference', node => node.disabled), true);
    });
    await check('No configuration never presents rule output as real AI', async () => {
      await fresh();
      assert.equal(await page.$eval('#send-live', node => node.disabled), true);
      await page.click('[data-example="route"]'); await submit();
      assert.match(await page.$eval('.mode-tag', node => node.textContent), /非 AI/);
      assert.equal(requests.at(-1).mode, 'reference');
      assert.equal(requests.at(-1).context.minWidth, 100);
      assert.equal(requests.at(-1).context.scenario, 'liftClosed');
    });
    await check('Computed route links preserve every planning constraint', async () => {
      const href = await page.$eval('.computed-route a', node => node.href);
      const url = new URL(href);
      assert.equal(url.searchParams.get('x'), '100'); assert.equal(url.searchParams.get('y'), '380');
      assert.equal(url.searchParams.get('destinationId'), 'mall'); assert.equal(url.searchParams.get('minWidth'), '100');
      assert.equal(url.searchParams.get('scenario'), 'liftClosed'); assert.equal(url.hash, '#demo');
      assert.match(await page.$eval('.trace-details', node => node.textContent), /计算满足净宽要求/);
    });
    await check('Real-model requests and rule examples keep separate context histories', async () => {
      await fresh({ live: true }); await page.click('[data-example="route"]'); await submit('reference');
      await message('请继续解释'); await submit('live');
      assert.equal(requests.at(-1).history.length, 0);
      await message('还有哪些注意事项？'); await submit('live');
      assert.equal(requests.at(-1).history.length, 2);
      assert.equal(requests.at(-1).history[0].content, '请继续解释');
    });
    await check('Long answers are bounded before inclusion in later history', async () => {
      await fresh({ live: true }); fixture = 'long'; await message('给我资料说明'); await submit('live');
      fixture = 'route'; await message('继续'); await submit('live');
      assert.equal(requests.at(-1).history[1].content.length, 3000);
    });
    await check('Station sources retain retrieval date and safe external link', async () => {
      await fresh(); fixture = 'source'; await page.click('[data-example="station"]'); await submit();
      assert.match(await page.$eval('.source-card', node => node.textContent), /2026-11-17/);
      assert.match(await page.$eval('.source-card a', node => node.href), /^https:\/\/www.mtr.com.hk/);
      assert.match(await page.$eval('.source-card a', node => node.rel), /noopener/);
    });
    await check('Model HTML and executable source URLs remain inert', async () => {
      await fresh({ live: true }); fixture = 'unsafe'; await message('显示资料'); await submit('live');
      assert.equal(await page.$('.turn-answer img'), null);
      assert.match(await page.$eval('.turn-answer', node => node.textContent), /<img/);
      assert.equal(await page.$('.source-card a'), null);
      assert.equal(await page.evaluate(() => window.__unsafe), undefined);
    });
    await check('Cancellation restores controls without storing a partial answer', async () => {
      await fresh(); fixture = 'pending'; await message('模拟查询'); await page.click('#send-reference');
      await page.waitForSelector('.request-stage'); await page.click('#cancel-request');
      await page.waitForSelector('.turn-cancelled');
      assert.equal(await page.$eval('#send-reference', node => node.disabled), false);
      fixture = 'route'; await message('再试一次'); await submit();
      assert.equal(requests.at(-1).history.length, 0);
    });
    await check('HTTP errors and stream errors show actionable retry controls', async () => {
      await fresh(); fixture = 'http-error'; await message('模拟查询'); await submit();
      assert.match(await page.$eval('.turn-error', node => node.textContent), /暂不可用/);
      assert.match(await page.$eval('.turn', node => node.textContent), /重试这次请求/);
      fixture = 'stream-error'; await message('再次查询'); await submit();
      assert.match(await page.$$eval('.turn-error', nodes => nodes.at(-1).textContent), /工具调用未完成/);
    });
    await check('Stricter tool-resolved width persists in the form for later requests', async () => {
      await fresh(); fixture = 'route';
      await page.select('#minimum-width', '80');
      await message('通道至少 100 厘米宽，请规划到商场'); await submit();
      assert.equal(await page.$eval('#minimum-width', node => node.value), '100');
      await message('请再规划一次'); await submit();
      assert.equal(requests.at(-1).context.minWidth, 100);
    });
    await check('Clear conversation removes all request context and returns keyboard focus', async () => {
      await page.click('#clear-conversation');
      assert.equal(await page.$$eval('.turn', nodes => nodes.length), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'request');
      fixture = 'route'; await message('重新开始'); await submit();
      assert.equal(requests.at(-1).history.length, 0);
    });
    await check('Desktop and 390px layouts remain within viewport and preserve result focus', async () => {
      await fresh(); await page.click('[data-example="route"]'); await submit();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(root, 'artifacts', 'assistant-desktop.png'), fullPage: true });
      await fresh({ width: 390 });
      assert.equal(await page.$eval('#route-options', node => node.open), false);
      await page.click('[data-example="route"]'); await submit();
      assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H3');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(root, 'artifacts', 'assistant-mobile.png'), fullPage: true });
    });
    await check('Old guidance advances with focus retained and an accessible announcement', async () => {
      await page.goto(base + '/index.html');
      await page.click('[data-action="open-route"][data-route="A"]'); await page.click('[data-action="start"]');
      await page.click('[data-action="next"]');
      await page.waitForFunction(() => document.activeElement.dataset.action === 'next');
      assert.match(await page.$eval('#guide-announcement', node => node.textContent), /第 2 步/);
    });
    await check('No unhandled browser exceptions', async () => { assert.deepEqual(runtimeErrors, []); });
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(root, 'artifacts', 'assistant-browser-check.json'), JSON.stringify({ scope: 'Local HTTP fixtures; no real model or user location', results, runtimeErrors }, null, 2));
  }
  if (results.some(result => !result.passed)) process.exitCode = 1;
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
