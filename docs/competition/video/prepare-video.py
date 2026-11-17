"""Generate offline Mandarin narration and measure the chapter timeline."""
from pathlib import Path
import json, subprocess, wave
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
BUILD=ROOT/'artifacts'/'video-build';BUILD.mkdir(parents=True,exist_ok=True)
plan=json.loads((HERE/'video-plan.json').read_text(encoding='utf8'))
voice={'sections':[{'id':s['id']+'-'+str(i+1),'narration':text} for s in plan['sections'] for i,text in enumerate(s['sentences'])]}
manifest=BUILD/'voice-manifest.json';manifest.write_text(json.dumps(voice,ensure_ascii=False),encoding='utf8')
subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(HERE/'synthesize.ps1'),'-ManifestPath',str(manifest),'-OutputDirectory',str(BUILD)],check=True)
total=0
for section in plan['sections']:
    durations=[]
    for i in range(len(section['sentences'])):
        with wave.open(str(BUILD/(section['id']+'-'+str(i+1)+'.wav'))) as w:
            durations.append(w.getnframes()/w.getframerate())
    section['speechDurations']=durations
    section['duration']=max(section['minimumSeconds'],sum(durations)+len(durations)*.5+2)
    total+=section['duration']
assert 300<=total<=475,'Adjust narration to competition length before recording.'
plan['duration']=total
(HERE/'video-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf8')
(HERE/'narration.txt').write_text(plan['title']+'\n'+plan['team']+'\n'+plan['voiceDisclosure']+'\n\n'+'\n\n'.join(s['title']+'\n'+'\n'.join(s['sentences']) for s in plan['sections']),encoding='utf8')
print('Planned seconds:',round(total,2))
