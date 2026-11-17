/* Model text is rendered as text, never HTML. Conversation stays in memory. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const network = window.ACCESS_NETWORK;
  const state = { health: null, busy: false, requestId: 0, controller: null,
    history: { live: [], reference: [] }, speech: null, connectionId: 0 };
  const fields = ['request', 'origin-id', 'destination-id', 'minimum-width', 'route-scenario'];
  const announce = message => { $('assistant-announcement').textContent = message; };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function option(value, label) {
    const node = element('option', '', label);
    node.value = value;
    return node;
  }

  for (const node of network.nodes) $('origin-id').append(option(node.id, node.label));
  for (const destination of network.destinations) $('destination-id').append(option(destination.id, destination.name));
  for (const [id, scenario] of Object.entries(network.scenarios)) $('route-scenario').append(option(id, scenario.label));
  if (matchMedia('(max-width: 700px)').matches) $('route-options').open = false;
  try { document.body.classList.toggle('large-text', JSON.parse(localStorage.getItem('accessai:settings') || '{}').large === true); } catch { /* Reading preferences is optional. */ }

  function updateControls() {
    const connected = state.health !== null;
    $('send-live').disabled = state.busy || !state.health?.configured;
    $('send-reference').disabled = state.busy || !connected;
    $('cancel-request').hidden = !state.busy;
    $('clear-conversation').disabled = state.busy;
    $('check-connection').disabled = state.busy;
    fields.forEach(id => { $(id).disabled = state.busy; });
    document.querySelectorAll('[data-example]').forEach(button => { button.disabled = state.busy; });
    $('assistant-form').setAttribute('aria-busy', String(state.busy));
  }

  async function checkConnection() {
    const connectionId = ++state.connectionId;
    state.health = null;
    $('connection-badge').textContent = '正在检查服务';
    $('connection-badge').dataset.state = 'checking';
    updateControls();
    if (!['http:', 'https:'].includes(location.protocol)) {
      setConnection(null, '当前为文件预览', '出行助手需要本地服务。请在项目目录运行 node server.cjs，再打开 http://127.0.0.1:4173/assistant.html。原有路线体验仍可离线打开。');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const health = await response.json();
      if (typeof health.configured !== 'boolean') throw new Error('invalid');
      if (connectionId !== state.connectionId) return;
      if (health.configured) {
        setConnection(health, 'AI 已配置', '将使用已配置的模型理解需求、查询资料或调用路线工具。'+(health.model ? '模型：' + String(health.model).slice(0,100) + '。' : ''));
      } else {
        setConnection(health, 'AI 尚未配置', '当前尚未连接模型。可以选择“规则演示（非 AI）”检查路线与资料查询流程；它不会调用模型。');
      }
    } catch {
      if (connectionId !== state.connectionId) return;
      setConnection(null, '服务暂未连接', '无法连接出行助手服务。请确认已运行新版项目服务，再重新检查连接；原有路线体验和站点资料仍可使用。');
    } finally { clearTimeout(timer); }
  }

  function setConnection(health, badge, note) {
    state.health = health;
    const status = health?.configured ? 'live' : health ? 'unconfigured' : 'offline';
    $('connection-badge').textContent = badge;
    $('connection-badge').dataset.state = status;
    $('service-note').textContent = note;
    $('service-note').dataset.state = status;
    updateControls();
  }

  function readContext() {
    return { originId: $('origin-id').value || null, destinationId: $('destination-id').value || null,
      minWidth: Number($('minimum-width').value), scenario: $('route-scenario').value };
  }

  function makeTurn(message, mode) {
    $('empty-conversation').hidden = true;
    const turn = element('article', 'turn');
    turn.append(element('div', 'turn-question', message));
    const content = element('div', 'turn-content');
    const title = element('div', 'turn-title');
    const heading = element('h3', '', mode === 'live' ? '出行助手' : '规则演示');
    heading.tabIndex = -1;
    const tag = element('span', 'mode-tag' + (mode === 'reference' ? ' reference' : ''), mode === 'live' ? 'AI 请求' : '非 AI · 本地规则');
    title.append(heading, tag);
    content.append(title);
    const stage = element('div', 'request-stage', '请求已发送，等待服务响应…');
    stage.setAttribute('role', 'status');
    stage.setAttribute('aria-live', 'polite');
    content.append(stage);
    turn.append(content);
    $('conversation').append(turn);
    turn.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    return { turn, content, stage, heading, tag };
  }

  function safeLink(value) {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  function navigationLink(route) {
    const input = route.input;
    if (!input || !Number.isFinite(input.x) || !Number.isFinite(input.y) ||
      !network.destinations.some(destination => destination.id === input.destinationId) ||
      !Object.hasOwn(network.scenarios, input.scenario) || ![80,100].includes(input.minWidth)) return null;
    const params = new URLSearchParams({ x: input.x, y: input.y, destinationId: input.destinationId,
      minWidth: input.minWidth, scenario: input.scenario });
    return 'navigate.html?' + params.toString() + '#demo';
  }

  function renderRoute(content, route) {
    if (!route || typeof route !== 'object') return;
    const card = element('section', 'computed-route');
    card.append(element('span', 'route-kicker', '路线工具计算结果 · 虚构街区'));
    if (route.status === 'ok') {
      const destination = route.destination?.name || '所选目的地';
      card.append(element('h4', '', (route.origin?.label || '所选起点') + ' → ' + destination));
      const metrics = element('div', 'route-metrics');
      if (Number.isFinite(route.distance)) metrics.append(element('strong', '', Math.round(route.distance)), document.createTextNode(' 米 · 演示距离'));
      card.append(metrics);
      const input = route.input;
      if (input) card.append(element('p', '', '通道净宽要求：' + input.minWidth + ' 厘米 · ' + (network.scenarios[input.scenario]?.label || '状态待确认')));
      const steps = Array.isArray(route.steps) ? route.steps : [];
      if (steps.length) {
        const list = element('ol', 'route-preview');
        steps.slice(0,3).forEach(step => list.append(element('li', '', step.text || '查看路线详情')));
        card.append(list);
        if (steps.length > 3) card.append(element('p', '', '共 ' + steps.length + ' 个路段说明，进入指引可查看全部。'));
      }
      const href = navigationLink(route);
      if (href) {
        const link = element('a', 'btn primary', '确认模拟起点，进入分步指引 →');
        link.href = href;
        card.append(link);
      }
    } else {
      card.append(element('h4', '', '暂不能生成可用路线'));
      card.append(element('p', '', route.message || '缺少可确认的连续路径，请补充或调整演示条件。'));
    }
    card.append(element('p', 'turn-notice', '路线、尺寸与设施状态均为合成演示数据，不用于实际出行。'));
    content.append(card);
  }

  function renderSources(content, sources) {
    if (!Array.isArray(sources) || !sources.length) return;
    const section = element('section', 'source-section');
    section.append(element('h4', '', '本次检索的资料来源'));
    sources.slice(0,12).forEach(source => {
      const card = element('div', 'source-card');
      const url = safeLink(source.url);
      const label = (source.id ? '[' + source.id + '] ' : '') + (source.title || '站点资料');
      if (url) {
        const link = element('a', '', label);
        link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        card.append(link);
      } else card.append(element('strong', '', label));
      if (source.excerpt) card.append(element('p', '', source.excerpt));
      card.append(element('small', '', '检索日期：' + (source.retrievedAt || '未记录') + ' · ' + (source.accessMethod || '读取方式未记录') + ' · 非实时状态'));
      section.append(card);
    });
    content.append(section);
  }

  function renderTrace(content, trace) {
    if (!Array.isArray(trace) || !trace.length) return;
    const details = element('details', 'trace-details');
    details.append(element('summary', '', '查看本次工具执行记录（' + trace.length + '）'));
    const list = element('ol');
    trace.slice(0,20).forEach(item => {
      const row = element('li', '', item.label || item.tool || '工具调用');
      if (item.status) row.append(element('code', '', item.status));
      list.append(row);
    });
    details.append(list);
    content.append(details);
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (state.speech) state.speech.textContent = '朗读回答';
    state.speech = null;
  }

  function addSpeech(content, answer) {
    const controls = element('div', 'turn-tools');
    const button = element('button', 'text-btn', '朗读回答');
    button.type = 'button';
    button.addEventListener('click', () => {
      if (state.speech === button) { stopSpeech(); return; }
      stopSpeech();
      if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
        announce('当前浏览器不支持朗读，请查看文字回答。'); return;
      }
      const voice = speechSynthesis.getVoices().find(item => /^zh/i.test(item.lang) && item.localService);
      if (!voice) { announce('未检测到本地中文语音，请查看文字回答或安装系统中文语音包。'); return; }
      const utterance = new SpeechSynthesisUtterance(answer);
      utterance.lang = 'zh-CN'; utterance.voice = voice; utterance.rate = 0.9;
      utterance.onend = () => { if (state.speech === button) { button.textContent = '朗读回答'; state.speech = null; } };
      utterance.onerror = () => { if (state.speech === button) { button.textContent = '朗读回答'; state.speech = null; announce('朗读未能完成，文字回答仍可查看。'); } };
      state.speech = button; button.textContent = '停止朗读';
      speechSynthesis.speak(utterance);
    });
    controls.append(button); content.append(controls);
  }

  function showResult(turn, result, mode) {
    if (!result || typeof result.answer !== 'string' || result.mode !== mode) throw new Error('服务返回的结果格式或运行模式不一致，请重试。');
    turn.stage.remove();
    turn.tag.textContent = mode === 'live' ? 'AI 回答 · 结合工具结果核对' : '非 AI · 本地规则';
    turn.content.append(element('div', 'turn-answer', result.answer));
    // Retain a stricter resolved preference even after old messages leave the
    // bounded conversation history. Never silently lower the selected width.
    const resolvedWidth = result.route?.input?.minWidth;
    if ([80, 100].includes(resolvedWidth) && resolvedWidth > Number($('minimum-width').value)) {
      $('minimum-width').value = String(resolvedWidth);
      turn.content.append(element('p', 'turn-notice', '已将路线偏好的最小净宽保留为 ' + resolvedWidth + ' 厘米，用于后续规划。'));
    }
    renderRoute(turn.content, result.route);
    renderSources(turn.content, result.sources);
    renderTrace(turn.content, result.trace);
    if (result.notice) turn.content.append(element('p', 'turn-notice', result.notice));
    addSpeech(turn.content, result.answer);
    turn.heading.focus({ preventScroll: true });
    announce(mode === 'live' ? 'AI 回答已完成，可查看路线依据或资料来源。' : '规则演示已完成，本次未调用 AI 模型。');
  }

  // Parse SSE frames across arbitrary network chunk boundaries, including CRLF.
  async function readEvents(response, callback) {
    if (!response.body || !/text\/event-stream/i.test(response.headers.get('content-type') || '')) throw new Error('服务没有返回可识别的响应，请确认正在运行新版服务。');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    function consume(final = false) {
      let match;
      while ((match = /\r?\n\r?\n/.exec(pending))) {
        const frame = pending.slice(0, match.index); pending = pending.slice(match.index + match[0].length); dispatch(frame);
      }
      if (final && pending.trim()) { dispatch(pending); pending = ''; }
    }
    function dispatch(frame) {
      let event = 'message'; const lines = [];
      frame.split(/\r?\n/).forEach(line => {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
      });
      if (lines.length) callback(event, JSON.parse(lines.join('\n')));
    }
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { pending += decoder.decode(); consume(true); return; }
        pending += decoder.decode(value, { stream: true });
        if (pending.length > 500000) throw new Error('服务响应超出可显示范围，请缩短问题后重试。');
        consume();
      }
    } finally { reader.releaseLock(); }
  }

  async function send(mode, previousPayload = null) {
    if (state.busy) return;
    if (!previousPayload && !$('assistant-form').reportValidity()) return;
    if (!state.health || (mode === 'live' && !state.health.configured)) {
      announce('当前模式尚不可用，请先检查连接。'); return;
    }
    const message = previousPayload?.message || $('request').value.trim();
    if (!message) { $('request').focus(); return; }
    const payload = previousPayload || { message, mode, context: readContext(), history: state.history[mode].slice(-8) };
    const requestId = ++state.requestId;
    const controller = new AbortController();
    state.controller = controller; state.busy = true;
    updateControls(); stopSpeech();
    const turn = makeTurn(message, mode);
    let completed = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 90000);
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      if (!response.ok) {
        let error; try { error = await response.json(); } catch { /* Error pages are not displayed as HTML. */ }
        throw new Error(error?.message || error?.error?.message || (response.status === 503 ? 'AI 暂不可用，请检查模型配置或选择规则演示。' : '请求未完成，请稍后重试。'));
      }
      await readEvents(response, (event, data) => {
        if (requestId !== state.requestId || controller.signal.aborted || completed) return;
        if (event === 'stage') turn.stage.textContent = String(data.label || '正在处理…');
        if (event === 'error') throw new Error(data.message || '请求未能完成，请重试。');
        if (event === 'result') {
          showResult(turn, data, mode); completed = true;
          state.history[mode] = [...payload.history, { role: 'user', content: message }, { role: 'assistant', content: data.answer.slice(0,3000) }].slice(-8);
        }
      });
      if (!completed && requestId === state.requestId) throw new Error('连接已结束，但尚未收到完整结果，请重试。');
    } catch (error) {
      if (requestId !== state.requestId || completed) return;
      turn.stage.remove();
      const cancelled = controller.signal.aborted && !timedOut;
      const message = cancelled ? '本次请求已取消，未将未完成的回答加入后续上下文。' : timedOut ? '等待响应超时，请稍后重试。' : error.message || '连接失败，请检查服务后重试。';
      turn.content.append(element('p', cancelled ? 'turn-cancelled' : 'turn-error', message));
      turn.tag.textContent = cancelled ? '已取消' : '未完成';
      const retry = element('button', 'text-btn', '重试这次请求'); retry.type = 'button';
      retry.addEventListener('click', () => send(mode, payload));
      turn.content.append(retry); turn.heading.focus({ preventScroll: true }); announce(message);
    } finally {
      clearTimeout(timer);
      if (requestId === state.requestId) { state.busy = false; state.controller = null; updateControls(); }
    }
  }

  $('assistant-form').addEventListener('submit', event => { event.preventDefault(); send('live'); });
  $('send-reference').addEventListener('click', () => send('reference'));
  $('cancel-request').addEventListener('click', () => state.controller?.abort());
  $('check-connection').addEventListener('click', checkConnection);
  $('request').addEventListener('input', () => { $('character-count').textContent = $('request').value.length + ' / 1200'; });
  $('request').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && state.health?.configured) { event.preventDefault(); send('live'); } });
  $('clear-conversation').addEventListener('click', () => {
    if (state.busy) return;
    stopSpeech(); state.history = { live: [], reference: [] };
    $('conversation').replaceChildren(); $('empty-conversation').hidden = false;
    $('request').value = ''; $('character-count').textContent = '0 / 1200';
    $('request').focus(); announce('对话已清空，后续请求不再携带这些记录。');
  });
  document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.example === 'route') {
      $('request').value = '在虚构云桥街区，我坐轮椅，从云桥路西侧人行道去星河商场，通道至少 100 厘米宽，E4 电梯停运了，请帮我规划并解释绕行原因。';
      $('origin-id').value = 'west'; $('destination-id').value = 'mall'; $('minimum-width').value = '100'; $('route-scenario').value = 'liftClosed';
      announce('已填入虚构起点、商场目的地、100 厘米净宽和电梯停运条件。请检查后发送。');
    } else {
      $('request').value = '中环站的无障碍升降机在哪里？请注明资料来源，并说明哪些运行状态还需要确认。';
      $('origin-id').value = ''; $('destination-id').value = ''; $('route-scenario').value = 'normal';
      announce('已填入真实站点资料问题，请检查后发送。');
    }
    $('character-count').textContent = $('request').value.length + ' / 1200';
    $('request').focus();
  }));
  window.addEventListener('pagehide', () => { state.requestId++; state.controller?.abort(); stopSpeech(); state.history = { live: [], reference: [] }; });
  checkConnection();
})();
