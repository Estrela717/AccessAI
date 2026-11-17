"""Build a submission archive from tracked source, real history, and final video.

Run after committing the reviewed source: python scripts/package-submission.py
This never includes .env, provider credentials, caches, or a .git directory.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
TARGET = ROOT.parent / f'AccessAI-submission-v{VERSION}.zip'
VIDEO = ROOT / 'docs/competition/video/AccessAI-demo-1080p.mp4'
HISTORY = ROOT / 'docs/competition/AccessAI-source-history.bundle'
PDF = ROOT / 'docs/competition/AccessAI-technical-report.pdf'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def main():
    for file in (VIDEO, PDF, ROOT / 'docs/competition/evidence/model-evaluation.json'):
        if not file.is_file():
            raise SystemExit(f'Required delivery file missing: {file.relative_to(ROOT)}')
    if git('status', '--porcelain').strip():
        raise SystemExit('Commit reviewed changes before packaging so the source and history agree.')
    tracked = [Path(value.decode('utf-8')) for value in git('ls-files', '-z').split(b'\0') if value]
    for relative in tracked:
        if relative.name == '.env' or relative.name.startswith('.env.') and relative.name != '.env.example':
            raise SystemExit('Refusing to package a local environment file.')
        if '.git' in relative.parts or 'node_modules' in relative.parts or any(part.startswith('.build-') for part in relative.parts):
            raise SystemExit(f'Unexpected tracked cache or private directory: {relative}')
    HISTORY.parent.mkdir(exist_ok=True)
    subprocess.run(['git', 'bundle', 'create', str(HISTORY), '--all'], cwd=ROOT, check=True)
    subprocess.run(['git', 'bundle', 'verify', str(HISTORY)], cwd=ROOT, check=True, capture_output=True)
    files = sorted(set(tracked + [VIDEO.relative_to(ROOT), HISTORY.relative_to(ROOT)]), key=str)
    manifest = {
        'version': VERSION,
        'commit': git('rev-parse', 'HEAD').decode().strip(),
        'files': [{'path': relative.as_posix(), 'bytes': (ROOT / relative).stat().st_size,
                   'sha256': hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()} for relative in files],
        'note': 'Credentials are excluded. Video uses disclosed synthetic Mandarin narration. Refer to current verification evidence for limits and external submission status.'
    }
    with ZipFile(TARGET, 'w', ZIP_DEFLATED) as archive:
        for relative in files:
            archive.write(ROOT / relative, 'accessai-demo/' + relative.as_posix())
        archive.writestr('accessai-demo/SUBMISSION-MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2))
    with ZipFile(TARGET) as archive:
        if archive.testzip() is not None:
            raise SystemExit('Archive integrity check failed.')
    print(json.dumps({'archive': str(TARGET), 'bytes': TARGET.stat().st_size, 'files': len(files) + 1,
                      'commit': manifest['commit'], 'sha256': hashlib.sha256(TARGET.read_bytes()).hexdigest()}, ensure_ascii=False))

if __name__ == '__main__':
    main()
