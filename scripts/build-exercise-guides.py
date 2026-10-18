"""Record the reviewed image-to-exercise mapping. No image transformation."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CUES={
 '杠铃平板卧推':['肩背贴稳、双脚踩实。','控制下放至胸前，再平稳推起；不要弹震。'],
 '上斜哑铃卧推':['肩背贴住上斜凳，双脚踩稳。','双侧平稳推起，缓慢还原，避免耸肩。'],
 '器械夹胸（蝴蝶机）':['座椅调至手柄与胸部同高，背部贴垫。','双臂向前合拢，再控制打开，不甩动。'],
 '俯卧撑':['双手撑地，头、背、髋保持一线。','屈肘下放，再推回支撑位置，避免塌腰。'],
 '绳索下压':['大臂靠近身体，手肘位置稳定。','向下伸肘，底部展开绳端，再缓慢还原。'],
 '双杠臂屈伸':['握稳双杠，保持肩部稳定。','控制屈肘下降，再推起；吃力时使用辅助。'],
 '辅助引体向上':['图为弹力带辅助变式，先确认辅助装置固定稳妥。','收紧躯干、肘部向下拉起，缓慢下降，避免摆动。'],
 '坐姿划船':['双脚踩稳、脊柱中立，肩部自然放松。','把手拉向腹部，控制伸臂还原，不前后甩身。'],
 '高位下拉':['固定大腿，挺胸坐稳。','将杠拉到胸前，再控制还原，不做颈后下拉。'],
 '直臂下压':['站稳、躯干收紧，肘部微屈并保持。','将把手拉向大腿，再控制回到前上方。'],
 '杠铃弯举':['大臂贴近身体，手腕保持稳定。','屈肘抬起杠铃，再缓慢放下，不甩动躯干。'],
 '站姿哑铃交替弯举':['双脚站稳、大臂靠近身体。','左右交替弯举并转掌，控制下放；目标次数按每侧。'],
 '坐姿哑铃推肩':['坐稳、背部靠垫，哑铃置于肩侧。','平稳上推后缓慢下放，避免过度后仰。'],
 '哑铃侧平举':['站稳，手肘略弯，肩部放松。','向两侧抬至接近肩高，再控制下放，不借力甩动。'],
 '俯身哑铃反向飞鸟':['图为额头支撑凳面的俯身变式，躯干保持稳定。','手肘微屈，将哑铃向两侧展开，再控制回落。'],
 '绳索面拉':['面向高位滑轮站稳，握住绳端。','肘部向两侧打开，绳端拉向面部两侧，再缓慢还原。'],
 '悬垂屈膝举腿':['握稳横杆、肩部稳定，身体避免摆动。','屈膝向上抬起，配合收腹，再缓慢下降。'],
 '平板支撑':['双肘位于肩下，以前臂和脚尖支撑。','头、背、髋保持一线，均匀呼吸；按时间保持。'],
 '反向山羊挺身卷腹':['按原参考器械固定脚部，身体呈斜体位、双臂抱胸。','腹部发力小幅卷起，控制还原；不要做普通背伸。'],
}

if __name__=='__main__':
 candidates=json.loads((ROOT/'assets/exercise-candidates.json').read_text(encoding='utf-8'))
 guides={}
 # Visually reviewed 2026-10-17 in asset-review.html. Some source files are reversed.
 reversed_names={'杠铃平板卧推','器械夹胸（蝴蝶机）','俯卧撑'}
 for item in candidates:
  name=item['name'];indices=[1,0] if name in reversed_names else [0,1]
  if name=='平板支撑':indices=[1]  # frame 0 is a kneeling setup, not a plank
  frames=[{**item['frames'][i],'label':('标准保持姿势' if name=='平板支撑' else ('起始姿势' if j==0 else '结束姿势'))} for j,i in enumerate(indices)]
  guides[name]={'status':'verified','sourceId':item['sourceId'],'source':'https://github.com/yuhonas/free-exercise-db',
                'review':'已核对动作、器械与照片姿势；成年人示范。非专业教练认证。',
                'frames':frames,'cues':CUES[name]}
 guides['反向山羊挺身卷腹']={'status':'verified','source':'用户此前提供的参考图','reference':True,
   'frames':[{'path':'roman-chair-reference.jpg','label':'用户原参考 · 含起始与卷起两个姿势'}],
   'review':'保留原始参考图，不以背伸或其他卷腹图片替换。','cues':CUES['反向山羊挺身卷腹']}
 output={'reviewedOn':'2026-10-17','guides':guides,'pending':[]}
 (ROOT/'assets/exercise-guides.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
 (ROOT/'exercise-guides.js').write_text("'use strict';\nconst EXERCISE_GUIDES = "+json.dumps(guides,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
 print(f'Recorded {len(guides)} verified mappings.')
