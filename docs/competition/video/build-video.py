"""Revoice the preserved browser recording with cached neural Mandarin narration.

Requires Python, Pillow, imageio_ffmpeg and Microsoft YaHei.
Run after synthesize-cloud.cjs --live. No provider key is read here.
"""
from pathlib import Path
import json, wave, subprocess, shutil, re, math, hashlib
import imageio_ffmpeg

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BUILD = ROOT / 'artifacts' / 'video-build'
PLAN = json.loads((HERE / 'video-plan.json').read_text(encoding='utf8'))
VOICE = json.loads((HERE / 'voice-config.json').read_text(encoding='utf8'))
NEURAL = BUILD / 'neural'
GENERATION = json.loads((NEURAL / 'generation.json').read_text(encoding='utf8'))
assert GENERATION['config'] == VOICE, 'Regenerate narration after changing the voice configuration.'
assert len(GENERATION['records']) == sum(len(s['sentences']) for s in PLAN['sections'])
RECORDING = json.loads((BUILD / 'recording.json').read_text(encoding='utf8'))
assert RECORDING['passed'], 'Do not publish incomplete recording.'
assert 300 <= RECORDING['duration'] <= 480, 'Competition duration requirement.'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
from PIL import Image
frame_lines=(BUILD/'frames.ffconcat').read_text(encoding='utf8').splitlines()
opening=[(i,Path(line[6:-1])) for i,line in enumerate(frame_lines) if line.startswith("file '")][:30]
stable=next((file for _,file in opening if Image.open(file).size==(1920,1080)),None)
normalized=0
if stable:
    for index,file in opening:
        if Image.open(file).size!=(1920,1080):
            frame_lines[index]="file '"+stable.as_posix()+"'";normalized+=1
(BUILD/'frames-normalized.ffconcat').write_text('\n'.join(frame_lines),encoding='utf8')
channels, width, rate = 1, 2, 48000
tempo = .90  # A modest pitch-preserving slowdown for clear presentation delivery.
prepared = NEURAL / 'prepared'; prepared.mkdir(exist_ok=True)
segments = {}
segment_evidence = []
for section in PLAN['sections']:
    for i, text in enumerate(section['sentences']):
        identity = section['id'] + '-' + str(i + 1)
        source = NEURAL / (identity + '.wav')
        metadata = json.loads((NEURAL / (identity + '.json')).read_text(encoding='utf8'))
        assert metadata['text'] == text, 'Narration cache does not match the current script: ' + identity
        assert metadata['model'] == VOICE['model'] and metadata['voice'] == VOICE['voice']
        assert metadata['audioSha256'] == hashlib.sha256(source.read_bytes()).hexdigest()
        target = prepared / (identity + '.wav')
        subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y','-i',str(source),
            '-af',f'atempo={tempo}', '-ac','1','-ar',str(rate),'-c:a','pcm_s16le',str(target)],check=True)
        with wave.open(str(target)) as w:
            assert (w.getnchannels(),w.getsampwidth(),w.getframerate()) == (channels,width,rate)
            pcm = w.readframes(target.stat().st_size // (channels * width))
        seconds = len(pcm) / (channels * width * rate)
        assert 1 < seconds < 30, identity
        segments[identity] = (pcm, seconds)
        segment_evidence.append({'id':identity,'seconds':round(seconds,4),'sourceSha256':metadata['audioSha256']})
frame_size = channels * width
duration = RECORDING['duration']
audio = bytearray(math.ceil(duration * rate) * frame_size)
subtitles = []

def chunks(text, maximum=32):
    parts = re.findall(r'.+?[，。、；：！？]|.+$', text)
    result, current = [], ''
    for part in parts:
        if current and len(current + part) > maximum:
            result.append(current); current = ''
        while len(part) > maximum:
            result.append(part[:maximum]); part = part[maximum:]
        current += part
    if current: result.append(current)
    for i in range(len(result)-1,0,-1):
        if len(result[i])<6:
            result[i-1]+=result.pop(i)
    # Two readable lines per subtitle; timings follow recorded sentence length.
    return ['\n'.join(result[i:i+2]) for i in range(0,len(result),2)]

timing = []
for section, recorded in zip(PLAN['sections'], RECORDING['sections']):
    assert section['id'] == recorded['id']
    speech_seconds = sum(segments[section['id'] + '-' + str(i+1)][1] for i in range(len(section['sentences'])))
    count = len(section['sentences'])
    gap = min(2.5, (recorded['duration'] - .8 - 1.5 - speech_seconds) / (count - 1))
    assert gap >= .55, 'Narration exceeds its preserved chapter: ' + section['id']
    cursor = recorded['start'] + .8
    chapter_durations = []
    for i, text in enumerate(section['sentences']):
        pcm, seconds = segments[section['id'] + '-' + str(i+1)]
        chapter_durations.append(seconds)
        offset=round(cursor*rate)*frame_size
        assert offset+len(pcm)<=len(audio)
        audio[offset:offset+len(pcm)]=pcm
        lines=chunks(text); weights=[len(t.replace('\n','')) for t in lines]; total=sum(weights)
        sub_cursor=cursor
        for line,weight in zip(lines,weights):
            end=sub_cursor+seconds*weight/total
            subtitles.append((sub_cursor,end,line));sub_cursor=end
        timing.append({'id':section['id'] + '-' + str(i+1),'start':round(cursor,4),'end':round(cursor+seconds,4)})
        cursor += seconds + (gap if i < count-1 else 0)
    assert cursor < recorded['start']+recorded['duration']-.4, section['id']
    section['speechDurations'] = [round(d,4) for d in chapter_durations]
    section['duration'] = recorded['duration']
    section['sentenceGapSeconds'] = round(gap,4)
PLAN['duration'] = duration
PLAN['voiceDisclosure'] = '旁白采用 AI 普通话合成语音，不是参赛者本人录音。'
(HERE/'video-plan.json').write_text(json.dumps(PLAN,ensure_ascii=False,indent=2),encoding='utf8')

with wave.open(str(BUILD/'narration.wav'),'wb') as w:
    w.setnchannels(channels);w.setsampwidth(width);w.setframerate(rate);w.writeframes(audio)

# Two-pass loudness normalization; the video is encoded only after audio is ready.
measure = subprocess.run([FFMPEG,'-hide_banner','-i',str(BUILD/'narration.wav'),
    '-af','highpass=f=65,loudnorm=I=-18:TP=-1.5:LRA=7:print_format=json','-f','null','-'],
    capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
stats = json.loads(re.findall(r'\{[\s\S]*?\}',measure.stderr)[-1])
normalizer = ('highpass=f=65,loudnorm=I=-18:TP=-1.5:LRA=7:linear=true:print_format=json'
    + f":measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}"
    + f":measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}")
master = subprocess.run([FFMPEG,'-hide_banner','-y','-i',str(BUILD/'narration.wav'),'-af',normalizer,
    '-ac','1','-ar','48000','-c:a','pcm_s16le',str(BUILD/'narration-master.wav')],
    capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
master_stats = json.loads(re.findall(r'\{[\s\S]*?\}',master.stderr)[-1])

def srt_time(t):
    ms=round(t*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'
def ass_time(t):
    cs=round(t*100);h,cs=divmod(cs,360000);m,cs=divmod(cs,6000);s,cs=divmod(cs,100)
    return f'{h}:{m:02}:{s:02}.{cs:02}'

(HERE/'AccessAI-subtitles.srt').write_text('\n\n'.join(f'{i+1}\n{srt_time(a)} --> {srt_time(b)}\n{text}' for i,(a,b,text) in enumerate(subtitles))+'\n',encoding='utf8')
ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,34,&H00FFFFFF,&H00FFFFFF,&H00142F4C,&H00142F4C,0,0,0,0,100,100,0,0,1,0,0,2,90,90,24,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
for a,b,text in subtitles:
    ass+=f'Dialogue: 0,{ass_time(a)},{ass_time(b)},Default,,0,0,0,,{text.replace(chr(10),chr(92)+"N")}\n'
(BUILD/'subtitles.ass').write_text(ass,encoding='utf8')
fonts=BUILD/'fonts';fonts.mkdir(exist_ok=True)
shutil.copyfile('C:/Windows/Fonts/msyh.ttc',fonts/'msyh.ttc')
output=BUILD/'AccessAI-demo-neural-candidate.mp4'
cmd=[FFMPEG,'-hide_banner','-y','-f','concat','-safe','0','-i','frames-normalized.ffconcat','-i','narration-master.wav',
     '-vf',"scale=1920:1080,setsar=1,fps=30,drawbox=x=0:y=ih-116:w=iw:h=116:color=0x123352@0.96:t=fill,ass=filename='subtitles.ass':fontsdir='fonts'",
     '-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-threads','4',
     '-c:a','aac','-b:a','160k','-ar','48000','-t',str(duration),'-movflags','+faststart',str(output)]
with (BUILD/'encoding.log').open('w',encoding='utf8') as log:
    subprocess.run(cmd,cwd=BUILD,stdout=log,stderr=log,check=True)
probe=subprocess.run([FFMPEG,'-hide_banner','-i',str(output)],capture_output=True,text=True,encoding='utf8',errors='replace').stderr
assert '1920x1080' in probe and 'Video: h264' in probe and 'Audio: aac' in probe
duration_match=re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)',probe)
assert duration_match,'Encoded duration is unavailable.'
actual_duration=int(duration_match[1])*3600+int(duration_match[2])*60+float(duration_match[3])
assert 300<=actual_duration<=480 and abs(actual_duration-duration)<.2
audio_check = subprocess.run([FFMPEG,'-hide_banner','-i',str(output),'-vn',
    '-af','loudnorm=I=-18:TP=-1.5:LRA=7:print_format=json','-f','null','-'],
    capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
encoded_audio = json.loads(re.findall(r'\{[\s\S]*?\}',audio_check.stderr)[-1])
assert abs(float(encoded_audio['input_i']) + 18) < 1, 'Unexpected encoded loudness.'
assert float(encoded_audio['input_tp']) < -.8, 'Unexpected encoded true peak.'
verify={'durationSeconds':duration,'resolution':'1920x1080','videoCodec':'H.264','audioCodec':'AAC','fps':30,'fileBytes':output.stat().st_size,
    'voice':f"Bailian {VOICE['model']} / {VOICE['voice']}, Mandarin synthetic narration; not the entrant's own voice",
    'voiceModel':VOICE['model'],'voiceId':VOICE['voice'],'voiceName':VOICE['voiceName'],'speechGenerationRate':VOICE['rate'],
    'pitchPreservingTempo':tempo,'audioSampleRate':48000,'neuralSegments':len(segment_evidence),'narrationTiming':timing,
    'audioLoudness':{'integratedLufs':float(encoded_audio['input_i']),'truePeakDbtp':float(encoded_audio['input_tp']),'rangeLu':float(encoded_audio['input_lra'])},
    'realBrowserRecording':True,'reusedRecordingRunId':RECORDING['runId'],'newChatModelRequestsForRevoice':0,
    'actualApiRequests':RECORDING['apiAttempts'],'actualApiHttpStatuses':RECORDING['apiStatuses'],'providerHttpStatuses':RECORDING.get('providerStatuses',[]),'apiWaitsPreserved':True,'openingResizeFramesReplacedWithStableTitle':normalized,'subtitles':len(subtitles),'scope':'Synthetic route demonstration and saved official station records; no field or GPS validation.'}
verify['encodedDurationSeconds']=actual_duration
verify['sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
(BUILD/'neural-audio-verification.json').write_text(json.dumps({'segments':segment_evidence,'firstPass':stats,'master':master_stats,'encoded':encoded_audio},indent=2),encoding='utf8')
final = HERE/'AccessAI-demo-1080p.mp4'
previous = BUILD/'AccessAI-demo-huihui-original.mp4'
if final.exists() and not previous.exists(): shutil.copy2(final, previous)
shutil.copy2(output, final)
(HERE/'video-verification.json').write_text(json.dumps(verify,ensure_ascii=False,indent=2),encoding='utf8')
qa=BUILD/'qa';qa.mkdir(exist_ok=True)
for i,s in enumerate(RECORDING['sections']):
    moment=s['start']+s['duration']*.65
    subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y','-ss',str(moment),'-i',str(output),'-frames:v','1',str(qa/f'{i+1}.jpg')],check=True)
from PIL import Image, ImageDraw
contact=Image.new('RGB',(1920,4*540),'white')
for i in range(8):
    picture=Image.open(qa/f'{i+1}.jpg');picture.thumbnail((960,540));contact.paste(picture,((i%2)*960,(i//2)*540))
contact.save(qa/'contact-sheet.jpg',quality=92)
subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y','-i',str(BUILD/'narration-master.wav'),
    '-t',str(RECORDING['sections'][0]['start'] + RECORDING['sections'][0]['duration']),
    '-c:a','libmp3lame','-b:a','192k',str(NEURAL/'voice-preview.mp3')],check=True)
print(json.dumps(verify,ensure_ascii=False))
