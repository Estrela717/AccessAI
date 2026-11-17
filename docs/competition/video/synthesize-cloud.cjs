'use strict';
// Explicit opt-in cloud narration. Only the published narration is sent to Bailian.
// API credentials stay in memory. Audio URLs and response headers are never logged.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadEnv } = require('../../../lib/config.cjs');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, 'artifacts/video-build/neural');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'voice-config.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'video-plan.json'), 'utf8'));
const args = process.argv.slice(2);
if (!args.includes('--live')) {
  console.log('Use --live to synthesize the published narration through the configured Bailian account. Add --preview for the first sentence only.');
  process.exit(0);
}
loadEnv(path.join(root, '.env'));
const base = new URL(process.env.AI_BASE_URL || 'https://invalid.local');
if (base.protocol !== 'https:' || !base.hostname.endsWith('.cn-beijing.maas.aliyuncs.com') || !process.env.AI_API_KEY) {
  throw new Error('A configured Bailian Beijing workspace and local AI_API_KEY are required.');
}
const endpoint = new URL('/api/v1/services/audio/tts/SpeechSynthesizer', base);
fs.mkdirSync(output, { recursive: true });
const selected = args.includes('--preview')
  ? [{ id: plan.sections[0].id + '-1', text: plan.sections[0].sentences[0] }]
  : plan.sections.flatMap(s => s.sentences.map((text, i) => ({ id: `${s.id}-${i + 1}`, text })));

async function generate(item) {
  const signature = crypto.createHash('sha256').update(JSON.stringify({config, text:item.text})).digest('hex');
  const audioFile = path.join(output, item.id + '.wav');
  const metaFile = path.join(output, item.id + '.json');
  if (fs.existsSync(metaFile) && fs.existsSync(audioFile)) {
    const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (metadata.signature === signature && metadata.audioSha256 === crypto.createHash('sha256').update(fs.readFileSync(audioFile)).digest('hex')) {
      console.log(JSON.stringify({ id: item.id, cached: true }));
      return metadata;
    }
  }
  const payload = {model:config.model,input:{text:item.text,voice:config.voice,format:'wav',sample_rate:config.sampleRate,
    rate:config.rate,language_hints:[config.language],instruction:config.instruction,seed:17,
    hot_fix:{pronunciation:[{'曲珈莹':'qu1 jia1 ying2'}]}}};
  const started = Date.now();
  const response = await fetch(endpoint, {method:'POST',headers:{'Authorization':`Bearer ${process.env.AI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(90000)});
  const result = await response.json();
  if (!response.ok || !result.output?.audio?.url) {
    console.log(JSON.stringify({id:item.id,status:response.status,code:result.code || 'NO_AUDIO',message:String(result.message || '').slice(0,240)}));
    throw new Error('Speech synthesis failed; no automatic paid retry was made.');
  }
  const audioUrl = new URL(result.output.audio.url);
  if (!audioUrl.hostname.endsWith('.aliyuncs.com')) throw new Error('Unexpected audio storage host.');
  audioUrl.protocol = 'https:';
  const audioResponse = await fetch(audioUrl,{signal:AbortSignal.timeout(60000)});
  if (!audioResponse.ok) throw new Error(`Audio download HTTP ${audioResponse.status}`);
  const bytes = Buffer.from(await audioResponse.arrayBuffer());
  if (bytes.toString('ascii',0,4)!=='RIFF' || bytes.toString('ascii',8,12)!=='WAVE') throw new Error('Expected a WAV audio file.');
  fs.writeFileSync(audioFile,bytes);
  const metadata = {id:item.id,signature,text:item.text,model:config.model,voice:config.voice,sampleRate:config.sampleRate,
    rate:config.rate,requestId:result.request_id,usage:result.usage,elapsedMs:Date.now()-started,createdAt:new Date().toISOString(),
    bytes:bytes.length,audioSha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  fs.writeFileSync(metaFile,JSON.stringify(metadata,null,2));
  console.log(JSON.stringify({id:item.id,status:response.status,bytes:bytes.length,usage:result.usage,elapsedMs:metadata.elapsedMs}));
  return metadata;
}
(async()=>{
  const records=[];
  for (const item of selected) {
    records.push(await generate(item));
    if (selected.length>1) await new Promise(resolve=>setTimeout(resolve,500));
  }
  fs.writeFileSync(path.join(output,args.includes('--preview')?'preview-generation.json':'generation.json'),JSON.stringify({config,records},null,2));
})().catch(error=>{console.error(error.name==='TypeError'?'Speech service connection failed.':error.message);process.exitCode=1;});
