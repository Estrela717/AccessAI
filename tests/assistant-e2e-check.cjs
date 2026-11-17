/* Real browser -> real local API -> mock provider. No external model or secret. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createServer } = require('../server.cjs');
const puppeteer = require(process.env.PUPPETEER_PATH || path.join(process.env.APPDATA || '', 'npm/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer'));
const browserPath = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
const results = [], errors = [], providerRequests = [];
let fixture = 'route';
const provider = http.createServer(async (req, res) => {
  const parts = [];for await (const part of req) parts.push(part);
  const body = JSON.parse(Buffer.concat(parts));providerRequests.push(body);
  const last = body.messages.at(-1);
  let message;
  if(last.role === 'tool') {
    message = {role:'assistant',content:fixture==='station'?'根据已检索资料，中环站 A 出口列有闸外升降机；当前状态仍需确认。':'已按所选条件计算绕行路径。请查看工具结果并确认模拟起点。'};
  } else {
    const name=fixture==='station'?'search_station_knowledge':'plan_accessible_route';
    const args=fixture==='station'?{query:'香港中环站升降机'}:{originId:'west',destinationId:fixture==='blocked'?'hospital':'mall',minWidth:100,scenario:fixture==='blocked'?'works':'liftClosed'};
    message={role:'assistant',content:null,tool_calls:[{id:'mock-'+providerRequests.length,type:'function',function:{name,arguments:JSON.stringify(args)}}]};
  }
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message}]}));
});
(async()=>{
  const providerPort=await listen(provider);
  const app=createServer({config:{configured:true,model:'LOCAL-MOCK-NOT-A-REAL-MODEL',apiKey:'local-test-only',endpoint:`http://127.0.0.1:${providerPort}/chat/completions`,timeoutMs:5000},requestLimit:1000});
  const appPort=await listen(app);let browser;
  try {
    browser=await puppeteer.launch({executablePath:browserPath,headless:true,pipe:true,args:['--disable-background-networking','--no-first-run','--disable-default-apps']});
    const page=await browser.newPage();page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    async function fresh(){await page.goto(`http://127.0.0.1:${appPort}/assistant.html`,{waitUntil:'networkidle0'});await page.waitForFunction(()=>!document.getElementById('send-live').disabled);}
    async function send(){await page.click('#send-live');await page.waitForSelector('.turn-answer');await page.waitForFunction(()=>!document.getElementById('send-live').disabled);}
    async function check(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name);}
    await check('Browser sends selected conditions through real API and function calling, then opens verified guide',async()=>{
      await fresh();await page.click('[data-example="route"]');await send();
      assert.match(await page.$eval('.computed-route',el=>el.textContent),/890/);
      assert.match(await page.$eval('.trace-details',el=>el.textContent),/计算路径/);
      const link=await page.$eval('.computed-route a',el=>el.href);
      assert.match(link,/minWidth=100/);assert.match(link,/scenario=liftClosed/);
      await page.click('.computed-route a');await page.waitForSelector('[data-action="confirm-origin"]');
      assert.equal(await page.$('[data-action="guide"]'),null);
      await page.click('[data-action="confirm-origin"]');await page.click('[data-action="guide"]');
      assert.ok(await page.$('.nav-landmark'));
    });
    await check('Real API retrieval returns only Central station sources for 香港中环站',async()=>{
      fixture='station';await fresh();await page.click('[data-example="station"]');await send();
      const links=await page.$$eval('.source-card a',els=>els.map(el=>({label:el.textContent,href:el.href})));
      assert.ok(links.length);assert.ok(links.every(link=>link.label.includes('hk-central-')));
      assert.ok(links.every(link=>link.href.startsWith('https://www.mtr.com.hk/')));
    });
    await check('Blocked deterministic route remains blocked after provider explanation',async()=>{
      fixture='blocked';await fresh();
      await page.select('#origin-id','west');await page.select('#destination-id','hospital');await page.select('#minimum-width','100');await page.select('#route-scenario','works');
      await page.type('#request','在虚构街区从西侧人行道去医院，医院通道施工。');await send();
      assert.match(await page.$eval('.computed-route',el=>el.textContent),/暂不能生成可用路线/);
      assert.equal(await page.$('.computed-route a'),null);
      assert.match(await page.$eval('.turn-answer',el=>el.textContent),/没有可用路线|无法规划|施工/);
    });
    await check('Reference mode never reaches provider, even on configured server',async()=>{
      await fresh();await page.click('[data-example="route"]');const count=providerRequests.length;
      await page.click('#send-reference');await page.waitForSelector('.turn-answer');
      assert.equal(providerRequests.length,count);assert.match(await page.$eval('.mode-tag',el=>el.textContent),/非 AI/);
    });
    assert.deepEqual(errors,[]);
  } finally {
    if(browser)await browser.close();await close(app);await close(provider);
    const report={checkedAt:new Date().toISOString(),scope:'Real local HTTP and browser with mock provider. No real model inference or GPS.',totals:{passed:results.length},results,runtimeErrors:errors,providerRequestCount:providerRequests.length};
    fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../artifacts/assistant-e2e-check.json'),JSON.stringify(report,null,2));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
