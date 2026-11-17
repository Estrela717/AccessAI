'use strict';
// Records actual browser frames and actual API waits, with no accelerated playback.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const out=path.join(root,'artifacts/video-build');fs.mkdirSync(out,{recursive:true});
const runId=new Date().toISOString().replace(/[^0-9]/g,'');
const framesDir=path.join(out,'frames',runId);fs.mkdirSync(framesDir,{recursive:true});
const plan=JSON.parse(fs.readFileSync(path.join(__dirname,'video-plan.json'),'utf8'));
const puppeteer=require(path.join(process.env.APPDATA,'npm/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer'));
let base=process.env.ACCESSAI_DEMO_URL||null;
const report={runId,recordedAt:new Date().toISOString(),source:'Actual browser screenshot stream with original elapsed times',voice:'Windows Microsoft Huihui, Mandarin synthetic narration, speaking rate 1.25',width:1920,height:1080,sections:[],requests:[],apiAttempts:0,apiStatuses:[],passed:false};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let browser, page, client, started, localServer, frameIndex=0;const frames=[];
async function decorate(title){await page.evaluate(title=>{
  document.querySelector('#video-chapter')?.remove();
  const bar=document.createElement('div');bar.id='video-chapter';bar.textContent='AccessAI  /  '+title+'   ·   真实 API 录屏，保留等待时间';
  bar.style.cssText='position:fixed;top:0;left:0;right:0;height:64px;background:#123352;color:#fff;z-index:99999;padding:18px 34px;font:600 20px Microsoft YaHei;pointer-events:none;box-sizing:border-box';document.body.append(bar);
  document.documentElement.style.scrollPaddingTop='88px';document.body.style.paddingTop='72px';document.body.style.paddingBottom='130px';document.body.style.zoom='1.18';
},title);}
async function slide(section,heading,subtitle,items){await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f2f6fb;color:#142f4c;font-family:'Microsoft YaHei',sans-serif;padding:80px 115px}small{font-size:22px;letter-spacing:3px;color:#2459a8}h1{font-size:55px;line-height:1.35;margin:40px 0 25px;max-width:1500px}p{font-size:27px;line-height:1.8;color:#52677b;margin:12px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px}.card{padding:28px 32px;border:1px solid #d9e3ef;border-radius:18px;background:#fff;min-height:160px}.card strong{font-size:28px;color:#2459a8}.card p{font-size:24px}.footer{position:absolute;bottom:140px;left:115px;font-size:23px;color:#62778a}</style><small>ACCESSAI v4.1.0 · ${section.title}</small><h1>${heading}</h1><p>${subtitle}</p><div class="grid">${items.map(([a,b])=>`<div class="card"><strong>${a}</strong><p>${b}</p></div>`).join('')}</div><div class="footer">云南大学 · A 组 · 曲珈莹　｜　普通话合成旁白</div></html>`);}
async function fresh(title){await page.goto(base+'/assistant.html',{waitUntil:'networkidle0'});await page.waitForFunction(()=>!document.getElementById('send-live').disabled);await decorate(title);}
async function request(text,context){
  if(report.requests.length>=6)throw new Error('Recording request cap');
  if(context){for(const [id,value]of Object.entries(context))await page.select('#'+id,String(value));}
  await page.$eval('#request',(el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},text);
  await delay(2000);
  const start=Date.now(), before=await page.$$('.turn-answer');report.apiAttempts++;await page.click('#send-live');
  await page.waitForFunction(n=>document.querySelectorAll('.turn-answer').length>n||document.querySelector('.turn-error'),{},before.length);
  const error=await page.$('.turn-error');if(error){report.apiError=await page.$eval('.turn-error',e=>e.textContent);throw new Error('Live API request failed during recording');}
  await page.waitForFunction(()=>!document.getElementById('send-live').disabled);
  const cards=await page.$$eval('.computed-route',els=>els.map(e=>e.textContent));
  report.requests.push({elapsedMs:Date.now()-start,mode:'live',routeCard:cards.at(-1)||null,sourceIds:await page.$$eval('.source-card a',els=>els.map(e=>e.textContent)),toolStatus:await page.$$eval('.trace-details code',els=>els.map(e=>e.textContent))});
}
async function focus(selector){await page.$eval(selector,el=>el.scrollIntoView({behavior:'smooth',block:'center'}));await delay(1600);}
async function section(index,fn){const s=plan.sections[index],begin=Date.now();report.sections.push({id:s.id,title:s.title,start:(begin-started)/1000,plannedDuration:s.duration});console.log('CHAPTER',s.id);await fn(s);await delay(Math.max(0,s.duration*1000-(Date.now()-begin)));report.sections.at(-1).duration=(Date.now()-begin)/1000;}
(async()=>{
try{
 if(!base){
   const {loadEnv,getConfig}=require(path.join(root,'lib/config.cjs'));
   const env={};loadEnv(path.join(root,'.env'),env);const config=getConfig(env);assert.ok(config.configured);
   const endpoint=new URL(config.endpoint);assert.ok(endpoint.protocol==='https:'&&(/\.cn-beijing\.maas\.aliyuncs\.com$/.test(endpoint.hostname)||endpoint.hostname==='dashscope.aliyuncs.com'));
   report.providerStatuses=[];report.providerNetworkErrors=[];
   localServer=require(path.join(root,'server.cjs')).createServer({config,fetchImpl:async(url,options)=>{
     try{const response=await fetch(url,options);report.providerStatuses.push(response.status);return response;}
     catch(error){const code=error.cause?.code||error.code;report.providerNetworkErrors.push(['EACCES','EPERM','ENOTFOUND','ECONNRESET','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(code)?code:'NETWORK_OR_ABORT');throw error;}
   }});
   await new Promise((resolve,reject)=>{localServer.once('error',reject);localServer.listen(0,'127.0.0.1',resolve);});
   base='http://127.0.0.1:'+localServer.address().port;report.serviceMode='Isolated temporary server in the recording process; genuine configured provider';
 }
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,pipe:true,args:['--disable-background-networking','--no-first-run','--disable-default-apps']});
 page=await browser.newPage();await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});page.setDefaultTimeout(60000);
 page.on('response',response=>{if(new URL(response.url()).pathname==='/api/assistant')report.apiStatuses.push(response.status());});
 await page.setRequestInterception(true);page.on('request',request=>{const u=new URL(request.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==base)request.abort();else request.continue();});
 await slide(plan.sections[0],'可追溯的无障碍出行助手','从表达需求，到核对依据，再进入可确认的分步指引。',[
 ['真实问题','入口、电梯、坡道和通道是否连续连接？'],['AI 工作流','自然语言 → 工具调用 → 有依据的回答'],['当前范围','虚构街区规划 + 六站官方资料问答'],['演示说明','实际模型请求；普通话合成旁白；不展示密钥']]);
 client=await page.createCDPSession();started=Date.now();
 client.on('Page.screencastFrame',event=>{const t=(Date.now()-started)/1000;const file=String(frameIndex++).padStart(6,'0')+'.jpg';fs.writeFileSync(path.join(framesDir,file),Buffer.from(event.data,'base64'));frames.push({file,t});client.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});});
 await client.send('Page.startScreencast',{format:'jpeg',quality:88,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
 await section(0,async()=>{});
 await section(1,async s=>{await fresh(s.title);await request('在虚构云桥街区，从西侧人行道去星河商场，通道净宽至少100厘米，设施正常，请规划并说明依据。',{'origin-id':'west','destination-id':'mall','minimum-width':100,'route-scenario':'normal'});await focus('.computed-route');assert.match(await page.$eval('.computed-route',e=>e.textContent),/560/);await delay(8000);await page.$eval('.trace-details',e=>e.open=true);await focus('.trace-details');});
 await section(2,async s=>{await fresh(s.title);await page.click('[data-example="route"]');await request('在虚构云桥街区，从西侧人行道去星河商场，通道净宽至少100厘米，E4电梯停运，请规划并说明绕行原因。');await focus('.computed-route');assert.match(await page.$eval('.computed-route',e=>e.textContent),/890/);await delay(8000);await page.$eval('.trace-details',e=>e.open=true);await focus('.trace-details');});
 await section(3,async s=>{await focus('.computed-route');await page.click('.computed-route a');await page.waitForSelector('[data-action="confirm-origin"]');await decorate(s.title);await delay(6000);await page.click('[data-action="confirm-origin"]');await page.click('[data-action="guide"]');await page.waitForSelector('.nav-landmark');await focus('.nav-landmark');await delay(9000);const next=await page.$('[data-action="next"]');if(next)await next.click();await delay(8000);await focus('.network-panel');});
 await section(4,async s=>{await fresh(s.title);await request('请查询香港站的无障碍设施，并注明信息来源。');await focus('.turn-answer');await delay(12000);await focus('.source-card');await delay(12000);await page.$eval('.trace-details',e=>e.open=true);await focus('.trace-details');});
 await section(5,async s=>{await fresh(s.title);await request('在虚构街区，从西侧人行道去医院，医院通道施工，通道净宽至少100厘米。请按这些条件规划。',{'origin-id':'west','destination-id':'hospital','minimum-width':100,'route-scenario':'works'});await focus('.computed-route');assert.match(await page.$eval('.computed-route',e=>e.textContent),/暂不能生成可用路线/);await delay(7000);await page.$eval('.trace-details',e=>e.open=true);await focus('.trace-details');});
 await section(6,async s=>{await slide(s,'让结果有依据，让条件不丢失','模型负责理解与解释，工具负责资料与计算，界面保留来源与确认步骤。',[
 ['① 前端与接入层','自然语言和条件 → 请求校验、超时、取消'],['② 模型与工具','千问 Plus → 路线规划 / 官方片段检索'],['③ 约束与边界','净宽、起点、停运条件；无资料不推断'],['④ 验证分层','程序规则 / 模拟协议 / 真实模型 / 浏览器流程']]);});
 await section(7,async s=>{await slide(s,'从可验证的原型，走向真实场景验证','当前成果与尚未完成的工作分别说明，避免把演示当成现实通行保证。',[
 ['已完成','真实模型接入、受限工具、来源问答、分步指引'],['尚未覆盖','真实连续路网、实时设施、现场轮椅用户测试'],['下一步','采集单条校园路径，记录来源、连接与核验时间'],['参赛交付','代码、技术报告、评测记录与本演示视频']]);});
 report.duration=(Date.now()-started)/1000;report.passed=true;
}catch(error){report.failureType=error.name;report.failedSection=report.sections.at(-1)?.id;console.error('RECORDING_FAILED',report.failedSection,error.name);process.exitCode=1;}
finally{
 if(client)await client.send('Page.stopScreencast').catch(()=>{});await delay(300);
 report.frameCount=frames.length;report.duration??=(Date.now()-started)/1000;
 const lines=['ffconcat version 1.0'];for(let i=0;i<frames.length;i++){lines.push("file '"+path.join(framesDir,frames[i].file).replace(/\\/g,'/')+"'");lines.push('duration '+Math.max(.001,(frames[i+1]?.t??report.duration)-frames[i].t).toFixed(6));}if(frames.length)lines.push("file '"+path.join(framesDir,frames.at(-1).file).replace(/\\/g,'/')+"'");
 fs.writeFileSync(path.join(out,'frames.ffconcat'),lines.join('\n'));fs.writeFileSync(path.join(out,'recording.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'recording-'+runId+'.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(__dirname,'recording-evidence.json'),JSON.stringify(report,null,2));
 if(browser)await browser.close();if(localServer?.listening){localServer.closeAllConnections();await new Promise(resolve=>localServer.close(resolve));}console.log(JSON.stringify({passed:report.passed,seconds:report.duration,frames:report.frameCount,requests:report.requests.length}));
}
})();
