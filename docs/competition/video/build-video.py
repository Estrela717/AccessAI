"""Assemble real-time browser frames, offline Mandarin narration, and subtitles.

Requires Python, Pillow, imageio_ffmpeg, Windows Chinese speech and Microsoft YaHei.
Run after synthesize.ps1 and record-video.cjs. No provider key is read here.
"""
from pathlib import Path
import json, wave, subprocess, shutil, re, math
import imageio_ffmpeg

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BUILD = ROOT / 'artifacts' / 'video-build'
PLAN = json.loads((HERE / 'video-plan.json').read_text(encoding='utf8'))
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
sample_file = BUILD / (PLAN['sections'][0]['id'] + '-1.wav')
with wave.open(str(sample_file)) as w:
    channels, width, rate = w.getnchannels(), w.getsampwidth(), w.getframerate()
frame_size = channels * width
duration = RECORDING['duration']
audio = bytearray(math.ceil(duration * rate) * frame_size)
subtitles = []

def chunks(text, maximum=32):
    parts = re.findall(r'.+?[，。；：！？]|.+$', text)
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

for section, recorded in zip(PLAN['sections'], RECORDING['sections']):
    cursor = recorded['start'] + .6
    for i, text in enumerate(section['sentences']):
        with wave.open(str(BUILD / (section['id'] + '-' + str(i+1) + '.wav'))) as w:
            assert (w.getnchannels(),w.getsampwidth(),w.getframerate()) == (channels,width,rate)
            pcm=w.readframes(w.getnframes()); seconds=len(pcm)/frame_size/rate
        offset=round(cursor*rate)*frame_size
        assert offset+len(pcm)<=len(audio)
        audio[offset:offset+len(pcm)]=pcm
        lines=chunks(text); weights=[len(t.replace('\n','')) for t in lines]; total=sum(weights)
        sub_cursor=cursor
        for line,weight in zip(lines,weights):
            end=sub_cursor+seconds*weight/total
            subtitles.append((sub_cursor,end,line));sub_cursor=end
        cursor+=seconds+.5
    assert cursor < recorded['start']+recorded['duration'], section['id']

with wave.open(str(BUILD/'narration.wav'),'wb') as w:
    w.setnchannels(channels);w.setsampwidth(width);w.setframerate(rate);w.writeframes(audio)

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
output=HERE/'AccessAI-demo-1080p.mp4'
cmd=[FFMPEG,'-hide_banner','-y','-f','concat','-safe','0','-i','frames-normalized.ffconcat','-i','narration.wav',
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
verify={'durationSeconds':duration,'resolution':'1920x1080','videoCodec':'H.264','audioCodec':'AAC','fps':30,'fileBytes':output.stat().st_size,'voice':'Microsoft Huihui zh-CN synthetic, rate 1.25','realBrowserRecording':True,'actualApiRequests':RECORDING['apiAttempts'],'actualApiHttpStatuses':RECORDING['apiStatuses'],'providerHttpStatuses':RECORDING.get('providerStatuses',[]),'apiWaitsPreserved':True,'openingResizeFramesReplacedWithStableTitle':normalized,'subtitles':len(subtitles),'scope':'Synthetic route demonstration and saved official station records; no field or GPS validation.'}
verify['encodedDurationSeconds']=actual_duration
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
print(json.dumps(verify,ensure_ascii=False))
