'use strict';
const fs = require('node:fs');
const path = require('node:path');

function loadEnv(file = path.join(__dirname, '..', '.env'), env = process.env) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[2].startsWith('#') || env[match[1]] !== undefined) continue;
    let value = match[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    env[match[1]] = value;
  }
}

function getConfig(env = process.env) {
  const apiKey = env.AI_API_KEY?.trim() || '';
  const model = env.AI_MODEL?.trim() || '';
  const baseURL = env.AI_BASE_URL?.trim().replace(/\/+$/, '') || '';
  let endpoint = null;
  try {
    const url = new URL(baseURL + '/chat/completions');
    const localHTTP = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol === 'https:' || localHTTP) && !url.username && !url.password && !url.search && !url.hash) endpoint = url.href;
  } catch {}
  return { apiKey, model, endpoint, configured: !!(apiKey && model && endpoint), timeoutMs: 45000 };
}
module.exports = { loadEnv, getConfig };
