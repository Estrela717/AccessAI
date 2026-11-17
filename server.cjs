'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadEnv, getConfig } = require('./lib/config.cjs');
const { AppError, validateRequest, runAssistant } = require('./lib/assistant.cjs');

const root = path.resolve(__dirname, 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };
const headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-store' };

function json(res, status, body) { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function publicError(error) { return error instanceof AppError ? { code: error.code, message: error.message } : { code: 'INTERNAL_ERROR', message: '请求暂时无法完成，请重试。' }; }

async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new AppError('INVALID_CONTENT_TYPE', '请使用 JSON 提交请求。', 415);
  if (Number(req.headers['content-length']) > 32000) throw new AppError('BODY_TOO_LARGE', '请求内容过长，请缩短对话。', 413);
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 32000) throw new AppError('BODY_TOO_LARGE', '请求内容过长，请缩短对话。', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('INVALID_JSON', '请求内容不是有效 JSON。'); }
}

/** Dependency injection is for local automated tests, never client-controlled. */
function createServer(options = {}) {
  const config = options.config || getConfig();
  const requestLimit = options.requestLimit ?? 20;
  const concurrentLimit = options.concurrentLimit ?? 3;
  const buckets = new Map(); let active = 0;
  function takeRateSlot(address) {
    const now = Date.now();
    for (const [key, value] of buckets) if (now - value.start > 60000) buckets.delete(key);
    const bucket = buckets.get(address) || { start: now, count: 0 };
    bucket.count++; buckets.set(address, bucket);
    return bucket.count <= requestLimit;
  }
  const server = http.createServer(async (req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { json(res, 400, { error: { code: 'INVALID_URL', message: '地址无效。' } }); return; }
    // Local server does not trust arbitrary Host/Origin headers or DNS rebinding.
    const allowedHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host || '');
    if (!allowedHost) { json(res, 403, { error: { code: 'HOST_NOT_ALLOWED', message: '仅支持本机访问。' } }); return; }
    if (pathname === '/api/health') {
      if (req.method !== 'GET') { json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持。' } }); return; }
      json(res, 200, { configured: config.configured, model: config.configured ? config.model : null, mode: config.configured ? 'live' : 'unconfigured' }); return;
    }
    if (pathname === '/api/assistant') {
      if (req.method !== 'POST') { json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请通过 POST 提交需求。' } }); return; }
      const expectedOrigin = `http://${req.headers.host}`;
      if ((req.headers.origin && req.headers.origin !== expectedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') { json(res, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: '仅接受从本应用发起的请求。' } }); return; }
      if (!takeRateSlot(req.socket.remoteAddress || 'local')) { json(res, 429, { error: { code: 'RATE_LIMIT', message: '请求较多，请一分钟后再试。' } }); return; }
      if (active >= concurrentLimit) { json(res, 429, { error: { code: 'BUSY', message: '服务正在处理其他请求，请稍后重试。' } }); return; }
      const controller = new AbortController();
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      let sse = false;
      const emit = (event, value) => { if (!res.destroyed && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`); };
      active++;
      try {
        const request = validateRequest(await readBody(req));
        if (request.mode === 'live' && !config.configured) throw new AppError('AI_NOT_CONFIGURED', '尚未配置模型。请在本机 .env 配置服务地址、模型与密钥，或明确选择规则演示。', 503);
        res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.flushHeaders(); sse = true;
        const result = await runAssistant(request, { config, emit, signal: controller.signal, fetchImpl: options.fetchImpl });
        emit('result', result);
      } catch (error) {
        if (!res.destroyed) { if (sse) emit('error', publicError(error)); else json(res, error instanceof AppError ? error.status : 500, { error: publicError(error) }); }
      } finally { active--; if (!res.writableEnded) res.end(); }
      return;
    }
    if (pathname.startsWith('/api/')) { json(res, 404, { error: { code: 'NOT_FOUND', message: '接口不存在。' } }); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持。' } }); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep) || pathname.includes('\\') || pathname.split('/').some(segment => segment.startsWith('.'))) { json(res, 403, { error: { code: 'FORBIDDEN', message: '无法访问此路径。' } }); return; }
    fs.readFile(file, (error, data) => {
      if (error) { json(res, 404, { error: { code: 'NOT_FOUND', message: '页面不存在。' } }); return; }
      res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (require.main === module) {
  loadEnv();
  const server = createServer();
  const port = Number(process.env.PORT) || 4173;
  server.listen(port, '127.0.0.1', () => console.log(`AccessAI: http://127.0.0.1:${server.address().port} (AI ${getConfig().configured ? 'configured; connection not yet verified' : 'not configured'})`));
}
module.exports = { createServer };
