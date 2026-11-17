'use strict';
// Copy the deliverable source without .env into a fresh directory, run tests,
// and start the documented server with no provider credentials.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync, spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const artifactDir = path.join(root, 'artifacts');
fs.mkdirSync(artifactDir, { recursive: true });
const destination = fs.mkdtempSync(path.join(artifactDir, 'clean-room-'));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^AI_|^DASHSCOPE_API_KEY$/.test(key)) delete env[key];
const report = { checkedAt: new Date().toISOString(), runtime: process.version, source: 'Current reviewed working tree; copies tracked and non-ignored source.', credentialsIncluded: false, copiedFileCount: 0, passed: false };
let server;
async function main() {
  for (const relative of new Set(files)) {
    assert.ok(!relative.split(/[\\/]/).includes('.git'));
    assert.ok(!/^\.env(?:\.|$)/.test(relative) || relative === '.env.example');
    const source = path.resolve(root, relative), target = path.resolve(destination, relative);
    assert.ok(source.startsWith(root + path.sep) && target.startsWith(destination + path.sep));
    assert.ok(!fs.lstatSync(source).isSymbolicLink(), 'Review symbolic links before packaging.');
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target); report.copiedFileCount++;
  }
  assert.ok(!fs.existsSync(path.join(destination, '.env')));
  const tests = fs.readdirSync(path.join(destination, 'tests')).filter(name => name.endsWith('.test.cjs')).map(name => path.join(destination, 'tests', name));
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], { cwd: destination, env, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(path.join(artifactDir, 'clean-room-tests.tap'), output);
  report.tests = { total: Number(output.match(/^# tests (\d+)/m)?.[1]), passed: Number(output.match(/^# pass (\d+)/m)?.[1]), failed: Number(output.match(/^# fail (\d+)/m)?.[1]) };
  assert.ok(report.tests.total > 0 && report.tests.total === report.tests.passed && report.tests.failed === 0);
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const startup = new Promise((resolve, reject) => {
    server = spawn(process.execPath, ['server.cjs'], { cwd: destination, env: { ...env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('Clean server startup timed out.')), 10000);
    server.once('error', () => { clearTimeout(timer); reject(new Error('Clean server failed to start.')); });
    server.once('exit', code => { if (code) { clearTimeout(timer); reject(new Error('Clean server exited.')); } });
    server.stdout.on('data', chunk => { if (chunk.toString().includes('AccessAI:')) { clearTimeout(timer); resolve(); } });
  });
  await startup;
  const baseURL = `http://127.0.0.1:${port}`;
  const health = await (await fetch(baseURL + '/api/health')).json();
  assert.deepEqual(health, { configured: false, model: null, mode: 'unconfigured' });
  assert.equal((await fetch(baseURL + '/assistant.html')).status, 200);
  assert.equal((await fetch(baseURL + '/.env')).status, 403);
  const body = { message: '从西侧人行道去商场，E4电梯停运，通道净宽至少100厘米。', context: { originId: 'west', destinationId: 'mall', minWidth: 100, scenario: 'liftClosed' }, history: [], mode: 'reference' };
  const response = await fetch(baseURL + '/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const resultText = await response.text();
  assert.equal(response.status, 200); assert.ok(resultText.includes('event: result')); assert.ok(resultText.includes('890')); assert.ok(resultText.includes('未调用 AI'));
  const live = await fetch(baseURL + '/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, mode: 'live' }) });
  assert.equal(live.status, 503);
  report.startup = { pageStatus: 200, configuredWithoutCredentials: false, referenceRouteMetres: 890, liveWithoutCredentialsStatus: 503, environmentFileStatus: 403 };
  report.passed = true;
}
main().catch(error => { report.error = error.code === 'ERR_ASSERTION' ? 'ASSERTION_FAILED' : 'VERIFICATION_FAILED'; process.exitCode = 1; }).finally(() => {
  if (server) server.kill();
  fs.writeFileSync(path.join(root, 'docs/competition/evidence/clean-room.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
});
