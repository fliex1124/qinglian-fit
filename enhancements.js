'use strict';
const oldBody=baseViews.body, oldFood=baseViews.food, oldSettings=baseViews.settings, oldPlans=baseViews.plans, oldHome=baseViews.home;
const field=(label,name,type='text',value='',extra='')=>`<div class="field"><label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label></div>`;
const formDate=()=>field('记录日期','date','date',datekey(),'required');
const aerobic=d=>({name:d.cardioName||'楼梯机',target:d.cardioTarget??40});
let recordDate='', compareAngle='正面', visionDraft=null, visionBusy=false;
function validateState(s){
 const object=(v,label)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error(label+'必须是对象')};
 const text=(v,label,optional=false)=>{if(optional&&v==null)return;if(typeof v!=='string')throw Error(label+'必须是文字')};
 const num=(v,label,min=0,max=Number.MAX_SAFE_INTEGER,optional=false)=>{if(optional&&v==null)return;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(label+'数值无效')};
 const date=(v,label,optional=false)=>{if(optional&&v==null)return;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||datekey(new Date(v+'T12:00:00'))!==v)throw Error(label+'日期无效')};
 const id=(v,label,optional=false)=>{if(optional&&v==null)return;if(typeof v!=='string'||!v||!/^[A-Za-z0-9_-]+$/.test(v)||['__proto__','constructor','prototype'].includes(v))throw Error(label+'标识无效')};
 const optionalText=(v,keys,label)=>keys.forEach(k=>text(v[k],label+'.'+k,true));
 const numericInput=(v,label,max=Number.MAX_SAFE_INTEGER)=>{if(v==null||v==='')return;if(!['number','string'].includes(typeof v)||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>max)throw Error(label+'数值无效')};
 const checkMap=(v,label,inputs=false)=>{object(v,label);for(const [key,rows] of Object.entries(v)){if(!/^\d+$/.test(key)||!Array.isArray(rows))throw Error(label+'逐组格式无效');for(const row of rows){if(row==null)continue;if(inputs){object(row,label);for(const k of ['kg','reps','right'])numericInput(row[k],label+'.'+k)}else if(typeof row!=='boolean')throw Error(label+'完成状态无效')}}};
 const session=(v,label)=>{object(v,label);checkMap(v.checks,label+'.checks');checkMap(v.inputs,label+'.inputs',true);id(v.id,label,true);numericInput(v.cardio,label+'有氧分钟',600);for(const k of ['started','paused'])if(v[k]!=null&&typeof v[k]!=='boolean')throw Error(label+k+'状态无效');if(v.exerciseChecks!=null){object(v.exerciseChecks,label+'动作状态');for(const [key,done] of Object.entries(v.exerciseChecks))if(!/^\d+$/.test(key)||typeof done!=='boolean')throw Error(label+'动作状态无效')}if(v.cardioClock!=null){const c=v.cardioClock;object(c,label+'计时器');num(c.elapsedMs,label+'累计用时',0,600*60000);num(c.runningSince,label+'开始时间',0,Number.MAX_SAFE_INTEGER,true);if(c.recorded!=null&&typeof c.recorded!=='boolean')throw Error(label+'计时状态无效')}};
 const progressEntry=(v,label,days=31)=>{object(v,label);if(!Number.isInteger(v.index)||v.index<0||v.index>=days||typeof v.choice!=='boolean')throw Error(label+'进度无效');date(v.restDate,label,true);session(v.session,label+'草稿')};
 const day=(v,label)=>{object(v,label);text(v.name,label+'名称');text(v.emoji,label+'图标',true);text(v.cardioName,label+'有氧名称',true);num(v.cardioTarget,label+'有氧目标',0,600,true);if(!Array.isArray(v.exercises)||!v.exercises.length)throw Error(label+'缺少动作');for(const a of v.exercises){if(!Array.isArray(a)||typeof a[0]!=='string'||!a[0]||!Number.isInteger(a[1])||a[1]<1||a[1]>12||typeof a[2]!=='string'||!a[2])throw Error(label+'动作无效');text(a[3],label+'动作要领',true);numericInput(a[4],label+'目标重量')}};
 const planEntry=(v,label)=>{object(v,label);id(v.id,label);text(v.name,label+'名称');if(!Array.isArray(v.days)||!v.days.length||v.days.length>31)throw Error(label+'训练天数无效');v.days.forEach(d=>day(d,label));if(v.system!=null&&typeof v.system!=='boolean')throw Error(label+'类型无效')};
 const range=(v,label)=>{if(v==null)return;object(v,label);num(v.low,label+'下限');num(v.high,label+'上限');if(v.low>v.high)throw Error(label+'上下限无效')};
 const foodReference=(v,label)=>{object(v,label);text(v.name,label+'食物名称');optionalText(v,['id','barcode','brand','source','sourceUrl','note'],label);if(v.aliases!=null&&(!Array.isArray(v.aliases)||v.aliases.some(a=>typeof a!=='string')))throw Error(label+'别名无效');for(const k of ['estimated','requiresUnitConfirmation','manualNutrition'])if(v[k]!=null&&typeof v[k]!=='boolean')throw Error(label+'.'+k+'状态无效');num(v.uncertainty,label+'估算误差',0,1,true);for(const k of ['kcal','protein','carbs','fat'])num(v[k],label+'.'+k,0,Number.MAX_SAFE_INTEGER,true);if(v.basis!=null&&!['100g','100ml'].includes(v.basis))throw Error(label+'单位无效');num(v.servingGrams,label+'参考份量',0,Number.MAX_SAFE_INTEGER,true);range(v.range,label+'估算范围');if(v.missing!=null&&(!Array.isArray(v.missing)||v.missing.some(k=>typeof k!=='string')))throw Error(label+'缺失字段无效')};
 object(s,'备份');if(!Array.isArray(s.plans)||!s.plans.length)throw Error('缺少计划');object(s.progress,'进度');object(s.settings,'设置');
 const ids=new Set();for(const p of s.plans){planEntry(p,'计划');if(ids.has(p.id))throw Error('计划标识重复');ids.add(p.id);progressEntry(s.progress[p.id],'当前进度',p.days.length)}
 for(const [key,value] of Object.entries(s.progress)){id(key,'进度计划');if(!ids.has(key))progressEntry(value,'保留计划进度')}
 if(!ids.has(s.selected))throw Error('当前计划不存在');
 for(const k of ['history','meals','weights','photos','chat'])if(!Array.isArray(s[k]))throw Error(k+'记录必须是数组');
 for(const h of s.history){object(h,'训练历史');id(h.id,'训练历史',true);date(h.date,'训练历史');text(h.name,'训练名称');id(h.planId,'历史计划',true);text(h.planName,'历史计划名称',true);if(!['done','rest'].includes(h.type))throw Error('训练记录类型无效');for(const k of ['done','total','dayIndex','cardio','cardioTarget'])num(h[k],'训练历史.'+k,0,Number.MAX_SAFE_INTEGER,true);optionalText(h,['at','cardioName','completionMode'],'训练历史');if(h.snapshot!=null)day(h.snapshot,'历史动作快照');if(h.before!=null)progressEntry(h.before,'历史待练进度');if(h.checks!=null)checkMap(h.checks,'历史组数');if(h.inputs!=null)checkMap(h.inputs,'历史重量',true);if(h.exerciseChecks!=null&&(!Array.isArray(h.exerciseChecks)||h.exerciseChecks.some(x=>typeof x!=='boolean')))throw Error('历史动作状态无效')}
 for(const m of s.meals){object(m,'饮食记录');id(m.id,'饮食记录',true);date(m.date,'饮食记录');for(const k of ['food','meal'])text(m[k],'饮食记录.'+k);num(m.grams,'饮食份量',0,Number.MAX_SAFE_INTEGER);for(const k of ['kcal','protein','carbs','fat'])num(m[k],'饮食记录.'+k,0,Number.MAX_SAFE_INTEGER,true);optionalText(m,['note','source','nutritionMode'],'饮食记录');if(m.estimated!=null&&typeof m.estimated!=='boolean')throw Error('饮食估算标记无效');if(m.unit!=null&&!['g','ml'].includes(m.unit))throw Error('饮食单位无效');if(m.foodSnapshot!=null)foodReference(m.foodSnapshot,'食物快照');range(m.range,'饮食估算范围');if(m.photo!=null&&(typeof m.photo!=='string'||m.photo.length>300000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(m.photo)))throw Error('餐食照片格式无效');if(m.recognition!=null&&!['photo-only','ai-confirmed','manual-confirmed'].includes(m.recognition))throw Error('饮食识别状态无效');if(m.recognition==='photo-only'&&(!m.photo||m.grams!==0||['kcal','protein','carbs','fat'].some(k=>m[k]!=null)))throw Error('待识别照片不得伪造份量或营养')}
 for(const w of s.weights){object(w,'体重记录');id(w.id,'体重记录',true);date(w.date,'体重记录');num(w.kg,'体重',20,400);text(w.note,'体重备注',true);numericInput(w.waist,'腰围',300);numericInput(w.thigh,'大腿围',200)}
 for(const p of s.photos){object(p,'照片记录');id(p.id,'照片记录',true);date(p.date,'照片记录');text(p.angle,'照片角度');if(typeof p.src!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.src))throw Error('照片格式无效')}
 for(const c of s.chat){object(c,'聊天记录');text(c.role,'聊天角色');text(c.text,'聊天内容')}
 for(const k of ['dailyBase','cardioPerMin','strengthPerSession'])num(s.settings[k],'消耗设置.'+k,0,Number.MAX_SAFE_INTEGER,true);if(s.settings.ai!=null&&typeof s.settings.ai!=='boolean')throw Error('AI设置无效');if(s.settings.profile!=null){const p=s.settings.profile;object(p,'个人参数');for(const k of ['age','height','weight','activity'])num(p[k],'个人参数.'+k,0,Number.MAX_SAFE_INTEGER);if(!['male','female'].includes(p.sex))throw Error('个人参数性别无效')}
 if(s.customFoods!=null){if(!Array.isArray(s.customFoods))throw Error('自定义食物必须是数组');s.customFoods.forEach(f=>foodReference(f,'自定义食物'))}
 if(s.archivedSessions!=null){if(!Array.isArray(s.archivedSessions))throw Error('归档草稿必须是数组');for(const a of s.archivedSessions){object(a,'归档草稿');if(a.plan!=null)planEntry(a.plan,'归档计划');id(a.planId,'归档计划',true);progressEntry(a.progress,'归档进度')}}
 return s;
}

function pauseBackupClocks(state, capturedAt){
 const pause=progress=>pauseCardioClockSnapshot(progress?.session,capturedAt);
 Object.values(state.progress).forEach(pause);
 state.history.forEach(h=>pause(h.before));
 (state.archivedSessions||[]).forEach(a=>pause(a.progress));
 return state;
}
function createBackupPayload(){
 const capturedAt=Date.now(),snapshot=structuredClone(st);
 validateState(snapshot);pauseBackupClocks(snapshot,capturedAt);
 return {app:'qinglian-fit',version:1,exported:new Date(capturedAt).toISOString(),state:snapshot};
}
function createBackupPacket(){return createBackupPayload()}
function restoreBackupPacket(packet,options={}){
 const candidate=prepareBackupRestore(packet);
 if(options.confirm!==false&&!confirm('将覆盖当前所有数据，确定恢复吗？'))return false;
 return restorePreparedState(candidate);
}
function prepareBackupRestore(payload){
 if(!payload||payload.app!=='qinglian-fit'||!payload.state)throw Error('不是轻练FIT备份');
 const candidate=structuredClone(payload.state);validateState(candidate);
 // Older exports kept runningSince. Count only up to their export time, never up to restoration.
 const exported=typeof payload.exported==='string'?Date.parse(payload.exported):NaN;
 pauseBackupClocks(candidate,Number.isFinite(exported)?Math.min(exported,Date.now()):null);
 for(const p of Object.values(candidate.progress))if(p.restDate&&p.restDate!==datekey())p.restDate=null;
 validateState(candidate);return candidate;
}
function restorePreparedState(candidate){
 validateState(candidate);
 const old={state:st,persisted,raw:persistedRaw,broken:storageBroken,tab};
 const currentRaw=localStorage.getItem(KEY);
 if(!storageBroken&&currentRaw!==persistedRaw)throw Error('另一个页面已更新数据，请刷新后再恢复');
 // Check all views against the candidate before touching the only durable browser copy.
 try{st=candidate;storageBroken=false;for(const view of [home,workout,food,body,plans,records,ai,settings])view()}
 finally{st=old.state;storageBroken=old.broken}
 const raw=JSON.stringify(candidate);
 try{localStorage.setItem(KEY,raw)}catch(e){throw Error(e.name==='QuotaExceededError'?'存储空间不足，当前记录未替换，请先导出备份。':'无法写入备份，当前记录未替换。')}
 st=candidate;persisted=raw;persistedRaw=raw;storageBroken=false;tab='home';
 try{render()}catch(e){
   // setItem replaces one value atomically; rollback reuses memory, without a second storage key.
   try{if(currentRaw===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,currentRaw)}
   catch(rollbackError){st=old.state;persisted=old.persisted;persistedRaw=raw;storageBroken=true;tab='settings';try{render()}catch(ignored){}throw Error('存储故障导致回滚失败，旧记录仍在当前页面内存，请立即导出完整备份。')}
   st=old.state;persisted=old.persisted;persistedRaw=old.raw;storageBroken=old.broken;tab=old.tab;
   try{render()}catch(ignored){}
   throw Error('备份无法正常显示，已恢复原来的记录。');
 }
 notifyMobilePersist();return true;
}
function checkpoint(){return {progress:structuredClone(progress()),day:structuredClone(curday()),planName:plan().name};}
function rest(cycle=false){
 if(!confirm('确定把点击选择的今天记为休息日？待练内容保留，明天继续。'))return;
 const p=progress(),before=structuredClone(p);
 if(p.session.cardioClock){const elapsed=cardioElapsedMs(p.session);p.session.cardioClock.elapsedMs=elapsed;p.session.cardioClock.runningSince=null;before.session.cardioClock.elapsedMs=elapsed;before.session.cardioClock.runningSince=null;}
 if(cycle){if(!p.choice)return;p.index=0;p.choice=false;p.session=resetSession();}
 if(p.restDate===datekey())return;p.restDate=datekey();
 st.history.push({id:uid(),date:datekey(),type:'rest',planId:plan().id,name:'主动休息',before});save();render();toast('今天已休息，待练日没有跳过');
}
function finish(){return finishTrainingDetail();}
function workout(){return trainingDetail();}
function records(){return trainingRecords();}
function movementStats(logs){return legacyMovementStats(logs);}
function body(){
 let html=oldBody();const recent=st.weights.filter(w=>{const t=new Date(datekey()+'T00:00:00')-new Date(w.date+'T00:00:00');return t>=0&&t<7*86400000});
 // One average per date prevents multiple weigh-ins from overweighting a day.
 const daily=new Map();recent.forEach(w=>daily.set(w.date,w.kg));
 html=html.replace('<div class="spaced">'+weightChart(),`<p class="note">最近7日已记录 ${daily.size} 天 · 均值 ${daily.size?rnd([...daily.values()].reduce((a,b)=>a+b,0)/daily.size)+' kg':'—'}</p><div class="spaced">`+weightChart());
 html=html.replace('<form id="weightForm" class="row wrap">', '<form id="weightForm" class="row wrap">'+formDate()+field('备注','note')+field('腰围cm（选填）','waist','number','','min="0" max="300" step="0.1"')+field('大腿围cm（选填）','thigh','number','','min="0" max="200" step="0.1"'));
 html=html.replace('<form id="photoForm">','<form id="photoForm">'+formDate());
 const list=st.photos.filter(p=>p.angle===compareAngle).sort((a,b)=>a.date.localeCompare(b.date));
 html+=`<div class="card spaced"><h2>同角度前后对比</h2><label>角度 <select id="compareAngle">${['正面','侧面','背面','自由拍照'].map(v=>`<option ${v===compareAngle?'selected':''}>${v}</option>`).join('')}</select></label><div class="split spaced">${list.length?['前','后'].map((label,i)=>{const p=i?list.at(-1):list[0];return `<div class="photo"><img style="height:360px;object-fit:contain" src="${p.src}" alt="${label} ${esc(p.angle)}"><div class="label">${label} · <select class="compare-pick" data-position="${i}">${list.map(x=>`<option value="${x.id}" ${x===p?'selected':''}>${x.date}</option>`).join('')}</select></div></div>`}).join(''):'<p class="muted">上传相同角度的照片后可选择日期对比。</p>'}</div></div>`;
 html+=`<div class="card spaced"><h2>围度与备注</h2>${st.weights.slice().reverse().map(w=>`<p>${esc(w.date)} · 腰围 ${esc(w.waist||'—')}cm · 大腿围 ${esc(w.thigh||'—')}cm · ${esc(w.note||'')}</p>`).join('')||'<p class="muted">尚无记录</p>'}</div>`;return html;
}
function weight(form){const f=new FormData(form),kg=n(f.get('kg'));if(kg<20||kg>400)return toast('体重范围20–400kg');st.weights.push({id:uid(),date:f.get('date')||datekey(),kg,note:String(f.get('note')||''),waist:f.get('waist')||'',thigh:f.get('thigh')||''});st.weights.sort((a,b)=>a.date.localeCompare(b.date));save();render();toast('已保存体重和围度');}
async function imageData(file){if(!file||!file.size||file.size>25*1024*1024)throw Error('请选择25MB以内图片');const img=await createImageBitmap(file);const ratio=Math.min(1,1000/img.width,1000/img.height),c=document.createElement('canvas');c.width=Math.round(img.width*ratio);c.height=Math.round(img.height*ratio);c.getContext('2d').drawImage(img,0,0,c.width,c.height);img.close();return c.toDataURL('image/jpeg',.75);}
async function photos(form){try{const f=new FormData(form),src=await imageData(f.get('photo'));st.photos.push({id:uid(),date:f.get('date')||datekey(),angle:String(f.get('angle')),src});save();render();toast('照片已保存本机，请定期备份')}catch(e){toast(e.message)}}
function food(){return nutritionPage();}
function eat(form){return saveNutritionMeal(form);}
function plans(){return oldPlans().replace('训练天数（1–7）','训练天数（1–31）').replace('max="7"','max="31"').replace('动作名称 | 组数 | 次数','动作名称 | 组数 | 次数或秒 | 目标kg（选填）').replace('可复制已有计划再改。','每个训练日可添加一行“@有氧 | 名称 | 分钟”。动作顺序就是文本行顺序。')+`<div class="card spaced"><button class="btn" data-action="copy-template">复制内置四天模板后编辑</button> <button class="btn danger" data-action="reset-plan">重置当前计划进度</button><p class="muted small">修改计划会归档进行中的训练，历史保留当时动作快照。</p></div>`;}
function parsePlan(form){const f=new FormData(form),title=String(f.get('title')||'').trim(),count=n(f.get('days')),id=String(f.get('id')||'');if(!title||!Number.isInteger(count)||count<1||count>31)return toast('天数需为1–31整数');const days=[];
 for(let line of String(f.get('lines')).split(/\r?\n/)){line=line.trim();if(!line)continue;if(line.startsWith('##')){days.push({name:line.replace(/^#+/,'').trim(),emoji:'🏋️',exercises:[],cardioName:'楼梯机',cardioTarget:40});continue}const b=line.split('|').map(v=>v.trim()),d=days.at(-1);if(!d)return toast('请先写 ## 训练日标题');if(b[0]==='@有氧'){if(!b[1]||!Number.isFinite(Number(b[2]))||n(b[2])<0||n(b[2])>600)return toast('有氧分钟数无效');d.cardioName=b[1];d.cardioTarget=n(b[2]);continue}if(!b[0]||!Number.isInteger(n(b[1]))||n(b[1])<1||n(b[1])>12||!b[2])return toast('动作格式错误：名称 | 整数组数1–12 | 次数或秒');if(b[3]&&(!Number.isFinite(Number(b[3]))||n(b[3])<0))return toast('目标重量无效');d.exercises.push([b[0],n(b[1]),b[2],'自定义动作',b[3]||'']);}
 if(days.length!==count||days.some(d=>!d.name||!d.exercises.length))return toast('天数需与标题数一致，每天至少一个动作');
 if(id){const x=st.plans.find(p=>p.id===id);if(!x||x.system)return toast('系统模板请先复制');const p=st.progress[id];if(p.session.started&&!confirm('当前有未完成训练，编辑后将归档草稿并重新开始，继续？'))return;if(p.session.started){st.archivedSessions??=[];st.archivedSessions.push({plan:structuredClone(x),progress:structuredClone(p)});}x.name=title;x.days=days;p.index=Math.min(p.index,days.length-1);p.session=resetSession();p.choice=false;}else{const newId=uid();st.plans.push({id:newId,name:title,days,system:false});st.progress[newId]={index:0,choice:false,restDate:null,session:resetSession()};st.selected=newId;}save();render();toast('已保存计划，旧记录快照保留');}
function editPlan(id){const p=st.plans.find(x=>x.id===id);if(!p||p.system)return;tab='plans';render();const f=el('planForm');f.elements.id.value=id;f.elements.title.value=p.name;f.elements.days.value=p.days.length;f.elements.lines.value=p.days.map(d=>`## ${d.name}\n${d.exercises.map(a=>`${a[0]} | ${a[1]} | ${a[2]} | ${a[4]||''}`).join('\n')}\n@有氧 | ${aerobic(d).name} | ${aerobic(d).target}`).join('\n');}
function settings(){return (storageBroken?'<div class="warning">原记录无法读取，已阻止覆盖。可先导出原始存储，或从有效备份恢复。</div><button class="btn" data-action="raw-export">导出原始存储用于恢复</button>':'')+oldSettings()+`<div class="card spaced"><h2>个人消耗估算</h2><p class="muted small">按基础代谢公式 × 不含专项训练的日常活动水平，再加已记录运动估算。填写后更新日常消耗基准；体重变化时自动更新。</p><form id="profileForm" class="formgrid">${field('年龄','age','number',st.settings.profile?.age||'','min="18" max="100" required')}${field('身高cm','height','number',st.settings.profile?.height||'','min="100" max="230" required')}${field('体重kg（有体重记录时用最新值）','weight','number',st.settings.profile?.weight||'','min="20" max="400" required step="0.1"')}<label>公式中的生理性别<select name="sex"><option value="male">男</option><option value="female" ${st.settings.profile?.sex==='female'?'selected':''}>女</option></select></label><label>日常活动（不含健身）<select name="activity">${[[1.2,'久坐'],[1.35,'少量走动'],[1.5,'经常走动'],[1.7,'体力工作']].map(([v,label])=>`<option value="${v}" ${n(st.settings.profile?.activity)===v?'selected':''}>${label}</option>`).join('')}</select></label><button class="btn primary">保存个人参数</button></form><p class="muted">摄入与消耗均有误差，可将热量差理解为范围约 ±20–30%，不要仅凭差值减少进食。</p></div>`;}
function expended(){return estimateDailyEnergy().total;}
function home(){return oldHome().replace('四天滚动顺序',`${plan().days.length}天滚动顺序`).replace('力量后楼梯机 40 分钟',`力量后${aerobic(curday()||{}).name} ${aerobic(curday()||{}).target} 分钟`);}
document.addEventListener('click',e=>{const t=e.target.closest('[data-action]');if(!t)return;const a=t.dataset.action;
 if(a==='begin'){const s=progress().session;s.paused=s.started?!s.paused:false;s.started=true;s.id??=uid();save();render();toast(s.paused?'已暂停，进度保留':'训练进行中，进度已保存');}
 if(a==='set-check'){const s=progress().session;s.started=true;s.id??=uid();save();}
 if(a==='undo'){const h=st.history.find(x=>x.id===t.dataset.id);if(st.history.filter(x=>x.planId===h.planId).at(-1)!==h)return toast('请先撤销此计划中更晚的记录');if(!confirm('撤销记录并恢复当时待练日和草稿？当前草稿会归档。'))return;st.archivedSessions??=[];st.archivedSessions.push({planId:h.planId,progress:structuredClone(st.progress[h.planId])});st.progress[h.planId]=structuredClone(h.before);st.history=st.history.filter(x=>x.id!==h.id);save();render();}
 if(a==='raw-export'){const raw=localStorage.getItem(KEY)||'';const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='轻练FIT_原始存储.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
 if(a==='all-history'){recordDate='';render();}
 if(a==='copy-template'){const p=structuredClone(seedPlan);p.id=uid();p.system=false;p.name+='（副本）';st.plans.push(p);st.progress[p.id]={index:0,choice:false,restDate:null,session:resetSession()};st.selected=p.id;save();editPlan(p.id);}
 if(a==='reset-plan'&&confirm('只重置当前计划进度，保留历史；当前训练草稿会归档。')){st.archivedSessions??=[];st.archivedSessions.push({planId:plan().id,progress:structuredClone(progress())});st.progress[plan().id]={index:0,choice:false,restDate:null,session:resetSession()};save();render();}
 if(a==='edit-meal')openNutritionMealEditor(t.dataset.id);
});
document.addEventListener('change',e=>{const t=e.target;if(t.id==='historyDate'){recordDate=t.value;render();}if(t.id==='compareAngle'){compareAngle=t.value;render();}if(t.matches('.compare-pick')){const p=st.photos.find(p=>p.id===t.value);t.closest('.photo').querySelector('img').src=p.src;}if(t.dataset.record||t.id==='cardioMin'){progress().session.started=true;progress().session.id??=uid();save();}});
document.addEventListener('submit',async e=>{const f=e.target,fd=new FormData(f);try{
 if(f.id==='profileForm'){st.settings.profile={age:n(fd.get('age')),height:n(fd.get('height')),weight:n(fd.get('weight')),sex:fd.get('sex'),activity:n(fd.get('activity'))};save();render();toast('个人参数已更新');}
 if(f.id==='mealEdit')saveEditedNutritionMeal(f);
 }catch(err){toast(err.message)}finally{}});
window.addEventListener('error',e=>{if(e.message.includes('保存失败'))toast(e.message)});
try{validateState(st)}catch(e){storageBroken=true;st=defaultState();persisted=JSON.stringify(st)}
render();if(storageBroken)toast('原存储读取异常，已停止覆盖。请先检查并导出原始数据。');

