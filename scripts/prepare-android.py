"""Stage only reviewed app resources; never include records, credentials, Python, or models."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
STAGE=ROOT/'android/build/assets'
STATIC=['index.html','app.js','exercise-guides.js','training-details.js','training-details.css',
        'food-database.js','nutrition.js','nutrition.css','enhancements.js',
        'meal-photo.js','meal-photo.css','mobile-ai.js','mobile-bootstrap.js','mobile-app.js','mobile.css','roman-chair-reference.jpg',
        'assets/exercise-guides.json','assets/exercise-library-LICENSE','assets/food-database.json']

def prepare():
    guides=json.loads((ROOT/'assets/exercise-guides.json').read_text(encoding='utf-8'))['guides']
    images=set()
    for name,guide in guides.items():
        if guide.get('status')!='verified':raise ValueError('Unreviewed exercise: '+name)
        for frame in guide['frames']:
            rel=Path(frame['path'])
            if rel.is_absolute() or '..' in rel.parts:raise ValueError('Invalid exercise asset path')
            images.add(rel.as_posix())
    if len(guides)!=19:raise ValueError('Expected all 19 built-in exercise guides')
    files=sorted(set(STATIC)|images)
    expected=set(files)|{'bundle-manifest.json'}
    STAGE.mkdir(parents=True,exist_ok=True)
    # Refuse unknown files, rather than silently packaging a copied personal directory.
    extras=[p.relative_to(STAGE).as_posix() for p in STAGE.rglob('*') if p.is_file() and p.relative_to(STAGE).as_posix() not in expected]
    if extras:raise ValueError('Unexpected staging files: '+', '.join(extras))
    manifest={'app':'qinglian-fit','version':'0.7.0','exerciseCount':len(guides),'files':[]}
    for name in files:
        source=(ROOT/name).resolve()
        if ROOT.resolve() not in source.parents:raise ValueError('Asset escapes project')
        raw=source.read_bytes()
        target=STAGE/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        manifest['files'].append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    (STAGE/'bundle-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f"Android assets: {len(files)} files, {len(guides)} exercises, {sum(x['bytes'] for x in manifest['files'])} bytes; no user records or keys")

if __name__=='__main__':prepare()
