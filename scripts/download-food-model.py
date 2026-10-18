"""Pinned public model download with range verification. No user data is transmitted."""
import concurrent.futures
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'models/chinese-food'
REV='1ce5801e5905f15de1c4e55c89ef2a8cd6d6a97c'
BASE=f'https://huggingface.co/Albertbeta123/resnet-50-chinese-food/resolve/{REV}/'
SIZE=95221032
SHA='301c5262348a25beeb782d11cbd083dfad8d478f92672ef5a237b4f557d79849'
CHUNK=4*1024*1024

def part(start):
 end=min(SIZE-1,start+CHUNK-1)
 target=ROOT/'.local/model-download'/f'{start}.part'
 if target.exists() and target.stat().st_size==end-start+1:return target
 for attempt in range(3):
  try:
   req=urllib.request.Request(BASE+f'model.safetensors?download=true&fit_part={start}&try={attempt}',headers={'Range':f'bytes={start}-{end}'})
   with urllib.request.urlopen(req,timeout=100) as response:
    if response.headers.get('Content-Range')!=f'bytes {start}-{end}/{SIZE}':raise ValueError('Unexpected range')
    data=response.read()
   if len(data)!=end-start+1:raise ValueError('Incomplete chunk')
   target.write_bytes(data)
   return target
  except Exception:
   if attempt==2:raise

if __name__=='__main__':
 DEST.mkdir(parents=True,exist_ok=True);(ROOT/'.local/model-download').mkdir(parents=True,exist_ok=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
  parts=list(executor.map(part,range(0,SIZE,CHUNK)))
 temporary=DEST/'model.safetensors.download'
 with temporary.open('wb') as output:
  for path in parts:output.write(path.read_bytes())
 if hashlib.sha256(temporary.read_bytes()).hexdigest()!=SHA:raise ValueError('Model checksum mismatch')
 temporary.replace(DEST/'model.safetensors')
 files=[]
 for name in ['config.json','preprocessor_config.json','README.md','metadata.json']:
  path=DEST/name
  if not path.exists():path.write_bytes(urllib.request.urlopen(BASE+name,timeout=25).read())
 for path in DEST.iterdir():
  if path.name!='provenance.json' and path.is_file():files.append({'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size})
 (DEST/'provenance.json').write_text(json.dumps({'model':'Albertbeta123/resnet-50-chinese-food','revision':REV,'license':'apache-2.0','files':files},indent=2),encoding='utf-8')
 print('Complete model downloaded and SHA256 verified.',flush=True)
