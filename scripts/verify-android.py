"""Verify packaged resources and exclusion of private files, without an Android device."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
apk=ROOT/'dist/qinglian-fit-0.7.0.apk'
with zipfile.ZipFile(apk) as bundle:
    assert bundle.testzip() is None,'APK CRC failure'
    names=set(bundle.namelist())
    assert {'AndroidManifest.xml','classes.dex','resources.arsc'}.issubset(names)
    assert bundle.read('classes.dex').startswith(b'dex\n'),'Invalid Android bytecode'
    manifest=json.loads(bundle.read('assets/bundle-manifest.json'))
    assert manifest['exerciseCount']==19
    expected={'assets/'+item['path'] for item in manifest['files']}|{'assets/bundle-manifest.json'}
    assert {name for name in names if name.startswith('assets/')}==expected,'Unexpected packaged asset'
    for item in manifest['files']:
        raw=bundle.read('assets/'+item['path'])
        assert len(raw)==item['bytes']
        assert hashlib.sha256(raw).hexdigest()==item['sha256'],item['path']
        assert (ROOT/item['path']).read_bytes()==raw,'Rebuild needed for '+item['path']
    forbidden=['.local/','models/','signing/','password.txt','.sqlite3','.p12','server.py','review-','-qa.js']
    assert not any(word in name for name in names for word in forbidden),'Private or development file packaged'
    html=bundle.read('assets/index.html').decode()
    assert html.index('mobile-bootstrap.js')<html.index('app.js')
    assert html.index('mobile-app.js')>html.index('enhancements.js')
    guides=json.loads(bundle.read('assets/assets/exercise-guides.json'))['guides']
    for guide in guides.values():
        for frame in guide['frames']:
            assert bundle.read('assets/'+frame['path']).startswith(b'\xff\xd8\xff')
result={'app':'轻练 FIT','version':'0.7.0','package':'cn.local.qinglianfit','minAndroid':'8.0 / API26',
        'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),
        'reviewedExercises':19,'packagedAssets':len(manifest['files']),
        'sourceHashesMatch':True,'noPrivateRecordsOrKeys':True,'realDeviceTested':False}
(ROOT/'dist/package-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
