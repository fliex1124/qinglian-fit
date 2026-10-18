"""Download candidate public exercise photos. Review before marking verified."""
import concurrent.futures
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
CANDIDATES={
 '杠铃平板卧推':'Barbell_Bench_Press_-_Medium_Grip',
 '上斜哑铃卧推':'Incline_Dumbbell_Press',
 '器械夹胸（蝴蝶机）':'Butterfly',
 '俯卧撑':'Pushups',
 '绳索下压':'Triceps_Pushdown_-_Rope_Attachment',
 '双杠臂屈伸':'Dips_-_Triceps_Version',
 '辅助引体向上':'Band_Assisted_Pull-Up',
 '坐姿划船':'Seated_Cable_Rows',
 '高位下拉':'Wide-Grip_Lat_Pulldown',
 '直臂下压':'Straight-Arm_Pulldown',
 '杠铃弯举':'Barbell_Curl',
 '站姿哑铃交替弯举':'Dumbbell_Alternate_Bicep_Curl',
 '坐姿哑铃推肩':'Dumbbell_Shoulder_Press',
 '哑铃侧平举':'Side_Lateral_Raise',
 '俯身哑铃反向飞鸟':'Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench',
 '绳索面拉':'Face_Pull',
 '悬垂屈膝举腿':'Hanging_Leg_Raise',
 '平板支撑':'Plank',
 '跪姿绳索卷腹':'Cable_Crunch',
}

def download(item):
 name,source=item
 paths=[]
 for i in range(2):
  local=ROOT/'assets'/'exercises'/source/f'{i}.jpg';local.parent.mkdir(parents=True,exist_ok=True)
  if not local.exists():local.write_bytes(urllib.request.urlopen(BASE+source+f'/{i}.jpg',timeout=30).read())
  paths.append({'path':local.relative_to(ROOT).as_posix(),'url':BASE+source+f'/{i}.jpg','sha256':hashlib.sha256(local.read_bytes()).hexdigest()})
 return {'name':name,'sourceId':source,'verified':False,'frames':paths}

if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
  results=list(executor.map(download,CANDIDATES.items()))
 (ROOT/'assets'/'exercise-candidates.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 source=urllib.request.urlopen('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/LICENSE.md',timeout=20).read()
 (ROOT/'assets'/'exercise-library-LICENSE').write_bytes(source)
 print(f'Downloaded {len(results)} candidate pairs; not yet verified.')
