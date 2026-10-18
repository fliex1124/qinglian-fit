"use strict";

// Photo-first meal check-in. Photos and model replies remain drafts until explicit save.
let mealPhotoEpoch=0;
function emptyMealCapture(){return {id:++mealPhotoEpoch,date:nutritionDate,meal:'午餐',image:'',photo:'',loading:false,status:'empty',message:'',result:null,pending:null,revision:0,note:'',recordId:null,abort:null};}
let mealCapture=emptyMealCapture();
const originalNutritionPage=nutritionPage,originalNutritionMealEditHTML=nutritionMealEditHTML,originalUpdateNutritionMealEditor=updateNutritionMealEditor,originalSaveEditedNutritionMeal=saveEditedNutritionMeal,originalRestoreMealState=restorePreparedState;
const mealCameraIcon='<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 14h9l3-5h8l3 5h9v25H8z"/><circle cx="24" cy="26" r="8"/><path d="M34 19h2"/></svg>';
function validMealDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&datekey(new Date(day+'T12:00:00'))===day;}
function mealPhotoRender(){if(el('mealEdit')?.elements)return;render();}
function cancelMealRecognition(message='识别已停止，照片保留。'){
  const draft=mealCapture;draft.id=++mealPhotoEpoch;draft.abort?.abort();draft.abort=null;
  if(draft.status==='recognizing')draft.status=draft.result?'review':'ready';
  draft.message=message;
}
function resetMealCapture(){cancelMealRecognition('');mealCapture=emptyMealCapture();nutritionPendingAI=null;try{localStorage.removeItem('qinglian_meal_photo_meta')}catch(_){}}
function rememberMealCameraMeta(){try{localStorage.setItem('qinglian_meal_photo_meta',JSON.stringify({date:mealCapture.date,meal:mealCapture.meal,note:mealCapture.note}))}catch(_){}}
async function compressMealPhoto(source){
  const isFile=typeof source!=='string';
  if(isFile&&(!source?.size||source.size>25*1024*1024))throw Error('请选择25MB以内的餐食照片。');
  let blob=source;
  if(!isFile){const match=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.exec(source);if(!match||source.length>2200000)throw Error('恢复照片格式不正确，请重新拍照。');const raw=atob(source.split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));blob=new Blob([bytes],{type:'image/'+match[1]});}
  const bitmap=await createImageBitmap(blob);
  try{
    if(!bitmap.width||!bitmap.height)throw Error('图片尺寸无效');
    function encode(max,quality){const scale=Math.min(1,max/bitmap.width,max/bitmap.height),c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);return c.toDataURL('image/jpeg',quality);}
    const image=encode(1000,.72);let photo=encode(600,.6);if(photo.length>300000)photo=encode(480,.5);
    if(photo.length>300000||image.length>2000000)throw Error('照片压缩后仍过大，请换一张照片。');
    return {image,photo};
  }finally{bitmap.close();}
}
async function selectMealPhoto(source,recovered=false,record=null){
  if(!source)return;
  cancelMealRecognition('');const draft=mealCapture,id=draft.id;
  draft.loading=true;draft.message='正在准备照片…';mealPhotoRender();
  try{
    const encoded=await compressMealPhoto(source);if(mealCapture!==draft||draft.id!==id)return false;
    draft.id=++mealPhotoEpoch;Object.assign(draft,encoded,{loading:false,status:'ready',result:null,pending:null,recordId:null,message:recovered?'已恢复相机照片，请确认餐次后识别或打卡。':'照片已准备好，识别后确认即可打卡。',revision:draft.revision+1});
    if(record)Object.assign(draft,{recordId:record.id,date:record.date,meal:record.meal==='加餐'?'零食':record.meal,note:record.note||'',message:'原记录保留；识别并确认后才会更新。'});
    nutritionPendingAI=null;nutritionDraftRevision++;mealPhotoRender();return true;
  }catch(error){if(mealCapture===draft&&draft.id===id){draft.loading=false;draft.message='照片无法读取：'+error.message+' 原来的照片仍保留。';mealPhotoRender();}return false;}
}
function mealPhotoSummary(){
  const stats=nutritionDayStats(nutritionDate),energy=estimateDailyEnergy(nutritionDate),unknown=stats.meals.filter(m=>nutrientNumber(m.kcal)===null).length;
  return `<section class="meal-summary" aria-label="全天营养估算"><div><span>${unknown?'已知摄入':'今日摄入'} · 估算</span><strong>${unknown&&unknown===stats.meals.length?'待补充':Math.round(stats.kcal)+'<small> kcal</small>'}</strong></div><div><span>蛋白质 · 估算</span><strong>${stats.missing.includes('protein')&&stats.protein===0?'待补充':stats.protein+'<small> g</small>'}</strong></div><p>${stats.meals.length}条记录${unknown?'，'+unknown+'条热量待补充':''}。</p><details><summary>查看全天消耗与热量差</summary><p>全天消耗约 ${Math.round(energy.total)} kcal；摄入－消耗：${unknown?'待补全饮食热量后估算':Math.round(stats.kcal-energy.total)+' kcal'}。餐次未记全时不能判断真实热量缺口。</p></details></section>`;
}
function mealPhotoReview(){
  const draft=mealCapture;if(!draft.result)return '';
  return `<section class="card meal-review"><h2>确认这一餐</h2><p class="muted small">食物、份量和营养均为估算，可直接修正。</p><form id="foodForm"><input type="hidden" name="date" value="${esc(draft.date)}"><input type="hidden" name="meal" value="${esc(draft.meal)}"><input type="hidden" name="food" value="0"><div class="formgrid">${field('食物名称','foodName','text',nutritionDraft.foodName,'required maxlength="160"')}${field('整餐份量（克）','grams','number',nutritionDraft.grams,'min="1" max="5000" step="1" required')}</div><div id="nutritionCalculation" class="nutrition-calculation spaced"></div><details class="spaced"><summary>修正本份营养估算</summary><div class="formgrid spaced">${[['热量 kcal','manualKcal',15000],['蛋白质 g','manualProtein',1000],['碳水 g','manualCarbs',5000],['脂肪 g','manualFat',1000]].map(([label,key,max])=>field(label,key,'number',nutritionDraft[key],`min="0" max="${max}" step="0.1"`)).join('')}</div></details>${field('备注','note','text',nutritionDraft.note,'maxlength="500"')}<p class="small muted spaced">${esc(draft.result.note)}</p><button class="btn primary block spaced" ${draft.status==='recognizing'?'disabled':''}>${draft.recordId?'确认并更新这条打卡':'确认并打卡'}</button></form></section>`;
}
function mealPhotoJournal(){
 const meals=st.meals.filter(m=>m.date===nutritionDate);
 return `<section class="meal-journal"><div class="row between"><h2>这一天的饮食</h2><span class="small muted">${meals.length}条记录</span></div><div class="meal-journal-grid">${['早餐','午餐','晚餐','零食'].map(slot=>{const rows=meals.filter(m=>(m.meal==='加餐'?'零食':m.meal)===slot);return `<section class="meal-slot"><h3>${slot}<span>${rows.length?'已打卡':'未记录'}</span></h3>${rows.length?rows.map(m=>`<article class="meal-entry">${m.photo?`<button type="button" class="meal-entry-image" data-action="meal-photo-view" data-id="${esc(m.id)}" aria-label="查看${esc(slot)}照片"><img src="${esc(m.photo)}" alt="${esc(m.food)}" loading="lazy"></button>`:''}<div class="meal-entry-body"><strong>${esc(m.food)}</strong><p>${m.kcal==null?'热量待补充':'约 '+Math.round(m.kcal)+' kcal'}${m.protein==null?'':' · 蛋白质约 '+rnd(m.protein)+'g'}</p><span class="small muted">${m.grams>0?'份量约 '+m.grams+(m.unit==='ml'?'ml':'g'):'照片打卡，尚未确认营养'}${m.recognition==='ai-confirmed'?' · AI估算已确认':''}</span><div class="row wrap spaced">${m.photo?`<button type="button" class="textbtn" data-action="meal-photo-reanalyze" data-id="${esc(m.id)}">${m.kcal==null?'识别并补充':'重新识别'}</button>`:''}<button type="button" class="textbtn" data-action="edit-meal" data-id="${esc(m.id)}">编辑</button><button type="button" class="textbtn" data-action="deleteMeal" data-id="${esc(m.id)}">删除</button></div></div></article>`).join(''):`<div class="meal-slot-empty"><span>${slot==='零食'?'水果、饮品也可以记录':'拍下这一餐，留一份饮食记录'}</span><button type="button" class="textbtn" data-action="meal-slot" data-meal="${slot}">记录${slot}</button></div>`}</section>`}).join('')}</div><details class="spaced"><summary>查看其他日期的记录</summary><div class="meal-history">${st.meals.slice().reverse().map(m=>`<p>${esc(m.date)} · ${esc(m.meal)} · ${esc(m.food)} <button class="textbtn" data-action="edit-meal" data-id="${esc(m.id)}">编辑</button></p>`).join('')||'<p class="muted">还没有饮食记录</p>'}</div></details></section>`;
}
function mealPhotoPage(){
 const d=mealCapture,busy=d.status==='recognizing',enabled=foodAIEnabled();
 const native=window.FitMobile?.native&&window.FitMobile?.aiSupported;
 const aiConfig=native?'<button type="button" class="textbtn" data-fit-ai="settings">配置AI</button>':'<button type="button" class="textbtn" data-tab="ai">配置AI</button>';
 return `<div class="pagebar meal-page-heading"><div><h1>饮食打卡</h1><p class="lead">拍下这一餐，确认后记下来。</p></div><label class="field">查看日期<input id="nutritionDate" aria-label="查看饮食日期" type="date" value="${nutritionDate}"></label></div>${mealPhotoSummary()}<div class="meal-photo-layout"><div><section class="card meal-capture" aria-label="拍照记录餐食"><div class="meal-capture-heading"><h2>${d.recordId?'补充这条饮食记录':'记录一餐'}</h2><label class="row small"><span>AI识别</span><input id="foodAIToggle" aria-label="开启餐食AI识别" class="switch" type="checkbox" ${enabled?'checked':''}></label></div><div class="meal-slots" role="group" aria-label="选择餐次">${['早餐','午餐','晚餐','零食'].map(slot=>`<button type="button" class="${d.meal===slot?'selected':''}" aria-pressed="${d.meal===slot}" data-action="meal-slot" data-meal="${slot}">${slot}</button>`).join('')}</div><div class="meal-photo-stage ${d.photo?'has-photo':''}">${d.photo?`<img src="${esc(d.photo)}" alt="待确认餐食照片"><button type="button" class="meal-remove" data-action="meal-photo-remove" aria-label="移除当前照片">×</button>`:`<div class="meal-photo-empty">${mealCameraIcon}<strong>拍下你吃的食物</strong><span>照片选好后，由你决定是否识别</span></div>`}</div><input class="meal-hidden-input" id="mealCameraInput" type="file" accept="image/*" capture="environment" aria-label="拍摄餐食照片"><input class="meal-hidden-input" id="mealAlbumInput" type="file" accept="image/*" aria-label="从相册选取餐食照片"><div class="meal-camera-actions"><button type="button" class="btn primary" data-action="meal-photo-camera">${d.photo?'重新拍照':'拍照打卡'}</button><button type="button" class="btn" data-action="meal-photo-album">从相册选择</button></div><div class="meal-capture-meta"><label class="field">记录日期<input id="mealPhotoDate" type="date" value="${esc(d.date)}" required></label><label class="field">补充说明（选填）<input id="mealPhotoNote" value="${esc(d.note)}" maxlength="500" placeholder="例如：少油、米饭吃了一半"></label></div>${d.message?`<p class="meal-photo-message ${d.status==='error'?'warning':'note'}" role="status">${esc(d.message)}</p>`:''}${d.photo?`<div class="meal-recognition-actions"><button class="btn mint block" type="button" data-action="${busy?'meal-photo-stop':'meal-photo-recognize'}" ${d.loading?'disabled':''}>${d.loading?'正在准备照片…':busy?'停止识别':enabled?'识别这一餐':'开启AI并识别'}</button><button class="textbtn" type="button" data-action="meal-photo-save" ${busy||d.loading?'disabled':''}>${d.recordId?'保留照片，更新打卡说明':'暂不识别，仅保存照片打卡'}</button></div>`:''}<p class="small muted meal-photo-help">拍照与照片打卡免费。AI识别可能消耗免费额度或产生费用，发送前会再次确认。${aiConfig}</p></section>${d.pending?`<section class="card spaced meal-pending"><h2>识别结果待确认</h2><p>当前照片与填写内容已保留。</p><p>${esc(d.pending.item.name)} · 约 ${d.pending.grams}g</p><button class="btn" data-action="meal-photo-apply">使用这份结果</button></section>`:''}${mealPhotoReview()}<details class="meal-manual spaced"><summary>识别不准？手动补录</summary><p class="muted small">可搜索食物、查询条码或自行填写份量，不需要开启AI。</p><button class="btn" type="button" data-action="nutrition-mode" data-mode="free">打开手动补录</button></details></div>${mealPhotoJournal()}</div>`;
}
nutritionPage=function(){return nutritionMode==='photo'?mealPhotoPage():'<div class="meal-back"><button class="textbtn" data-action="meal-photo-home">‹ 返回拍照打卡</button></div>'+originalNutritionPage();};
function normalizeMealPhotoResult(result){
 if(!result||typeof result.name!=='string'||!result.name.trim())throw Error('没有识别出可确认的食物，请重新拍摄或手动补充。');
 for(const [key,max] of [['grams',5000],['kcal',15000],['protein',1000],['carbs',5000],['fat',1000],['low',15000],['high',15000]])if(typeof result[key]!=='number'||!Number.isFinite(result[key])||result[key]<0||result[key]>max)throw Error('识别结果缺少有效营养数据，请手动补充。');
 if(result.grams<1||result.low>result.kcal||result.high<result.kcal)throw Error('识别结果的份量或范围不正确，请核对后手动记录。');
 const factor=100/result.grams;
 return {item:{id:'ai-photo-draft',name:result.name.slice(0,160),kcal:result.kcal*factor,protein:result.protein*factor,carbs:result.carbs*factor,fat:result.fat*factor,basis:'100g',source:'通义千问餐食照片估算',range:{low:result.low*factor,high:result.high*factor}},grams:result.grams,note:[String(result.note||'请确认食物、份量和用油，营养均为估算。'),Array.isArray(result.ingredients)&&result.ingredients.length?'配料：'+result.ingredients.filter(x=>typeof x==='string').slice(0,20).join('、'):'',typeof result.cooking==='string'?'做法：'+result.cooking:''].filter(Boolean).join('；').slice(0,500)};
}
function applyMealPhotoResult(result){
 rememberNutritionForm();nutritionSelected=structuredClone(result.item);nutritionSource='qwen';
 Object.assign(nutritionDraft,{date:mealCapture.date,meal:mealCapture.meal,foodName:result.item.name,grams:String(result.grams),manualKcal:'',manualProtein:'',manualCarbs:'',manualFat:'',note:[mealCapture.note?'补充说明：'+mealCapture.note:'',result.note].filter(Boolean).join('；').slice(0,500)});
 nutritionDraftRevision++;mealCapture.result=result;mealCapture.pending=null;mealCapture.status='review';mealCapture.message='识别结果待确认。核对名称、份量后，点击“确认并打卡”。';
}
async function recognizeMealPhoto(){
 const d=mealCapture;if(!d.image||d.loading||d.status==='recognizing')return;
 rememberNutritionForm();const id=d.id,state=st,revision=d.revision,formRevision=nutritionDraftRevision;
 d.status='recognizing';d.message='正在准备识别，请确认本次发送…';mealPhotoRender();
 if(!foodAIEnabled()){
   await setFoodAI(true);if(mealCapture!==d||d.id!==id||st!==state)return;
   if(!foodAIEnabled()){d.status='error';d.message=nutritionMessage||'无法开启AI，请先配置密钥；照片仍可打卡。';mealPhotoRender();return;}
 }
 if(!(window.FitMobile?.native&&window.FitMobile?.aiSupported)&&!confirm('将向通义千问发送这张餐食图及说明，可能消耗免费额度或产生API费用。继续？')){d.status=d.result?'review':'ready';d.message='已取消识别，照片保留。';mealPhotoRender();return;}
 const token=nutritionConsent,abort=new AbortController();d.abort=abort;nutritionAbort=abort;d.status='recognizing';d.message='等待费用确认或识别结果…';mealPhotoRender();
 try{
  const response=await fetch('/api/food-photo',{method:'POST',signal:abort.signal,headers:{'Content-Type':'application/json','X-Fit-Food-Consent':token},body:JSON.stringify({image:d.image,context:d.note,paidConsent:true})});
  const raw=await response.json();if(mealCapture!==d||d.id!==id||st!==state||!foodAIEnabled()||nutritionConsent!==token)return;
  if(!response.ok)throw Error(raw.error||'识别暂时失败');
  const result=normalizeMealPhotoResult(raw);rememberNutritionForm();
  if(d.revision!==revision||nutritionDraftRevision!==formRevision||tab!=='food'||nutritionMode!=='photo'||el('mealEdit')?.elements){d.pending=result;d.message='识别已完成，当前填写内容保留。请点击“使用这份结果”后确认。';d.status='ready';}
  else applyMealPhotoResult(result);
 }catch(error){if(mealCapture===d&&d.id===id){d.status=d.result?'review':'error';d.message=error.name==='AbortError'?'识别已停止，照片保留，尚未保存记录。':'暂未完成识别：'+error.message+' 可以重试、手动补录，或只保存照片打卡。';}}
 finally{if(mealCapture===d&&d.id===id){if(d.status==='recognizing'){d.status=d.result?'review':'ready';d.message='AI已关闭，未接收识别结果。照片保留。';}d.abort=null;if(nutritionAbort===abort)nutritionAbort=null;mealPhotoRender();}}
}
function validateMealCaptureMeta(d){if(!validMealDay(d.date)||!['早餐','午餐','晚餐','零食'].includes(d.meal))throw Error('请确认有效日期和餐次。');}
function saveMealPhotoOnly(){
 const d=mealCapture;if(!d.photo||d.loading||d.status==='recognizing')return;validateMealCaptureMeta(d);
 if(typeof d.photo!=='string'||d.photo.length>300000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d.photo))throw Error('餐食照片格式无效或过大。');
 const existing=d.recordId?st.meals.find(m=>m.id===d.recordId):null;if(d.recordId&&!existing)throw Error('原记录已删除，请重新记录。');
 const row=existing?{...existing,date:d.date,meal:d.meal,note:d.note}:{id:uid(),date:d.date,meal:d.meal,food:d.meal+'照片打卡',photo:d.photo,recognition:'photo-only',source:'photo-checkin',estimated:true,unit:'g',grams:0,kcal:null,protein:null,carbs:null,fat:null,note:d.note};
 if(existing)st.meals[st.meals.indexOf(existing)]=row;else st.meals.push(row);
 save();nutritionDate=d.date;resetMealCapture();render();toast('照片已打卡。尚未确认的热量与营养保持待补充。');return row;
}
function saveRecognizedMealPhoto(form){
 const d=mealCapture;if(!d.photo||!d.result||d.status==='recognizing')return;validateMealCaptureMeta(d);
 const result=saveNutritionMeal(form,{photo:d.photo,replaceId:d.recordId});if(!result)return;
 resetMealCapture();render();toast('餐食照片与确认后的营养已打卡。');return result;
}
nutritionMealEditHTML=function(meal){
 if(meal.recognition!=='photo-only')return originalNutritionMealEditHTML(meal);
 return `<h2>编辑照片打卡</h2><form id="mealEdit" data-id="${esc(meal.id)}"><div class="formgrid">${field('日期','date','date',meal.date,'required')}<div class="field"><label>餐次<select name="meal">${['早餐','午餐','晚餐','零食'].map(slot=>`<option ${slot===meal.meal?'selected':''}>${slot}</option>`).join('')}</select></label></div>${field('说明','food','text',meal.food,'required maxlength="160"')}</div>${field('备注','note','text',meal.note||'','maxlength="500"')}<label class="nutrition-edit-override spaced"><input type="checkbox" name="manualTotals"> 补全这份餐食的营养</label><div class="formgrid spaced">${field('份量（克）','grams','number','150','min="1" max="5000" disabled')}${[['热量 kcal','kcal',15000],['蛋白质 g','protein',1000],['碳水 g','carbs',5000],['脂肪 g','fat',1000]].map(([label,key,max])=>field(label,key,'number','',`min="0" max="${max}" step="0.1" disabled`)).join('')}</div><p class="small muted">不勾选补全营养时，只修改日期、餐次和说明，营养继续标为待补充。</p><button class="btn primary spaced">确认修改并保存</button></form>`;
};
updateNutritionMealEditor=function(form,key=''){
 const meal=nutritionEditMeal(form.dataset.id);if(meal.recognition!=='photo-only')return originalUpdateNutritionMealEditor(form,key);
 nutritionDraftRevision++;for(const name of ['grams','kcal','protein','carbs','fat'])form.elements[name].disabled=!form.elements.manualTotals?.checked;
};
saveEditedNutritionMeal=function(form){
 const meal=nutritionEditMeal(form.dataset.id),f=new FormData(form);
 if(meal.recognition!=='photo-only'||f.get('manualTotals'))return originalSaveEditedNutritionMeal(form);
 const day=String(f.get('date')||''),slot=String(f.get('meal')||''),name=String(f.get('food')||'').trim();
 if(!validMealDay(day)||!['早餐','午餐','晚餐','零食'].includes(slot)||!name||name.length>160)throw Error('请核对日期、餐次和说明。');
 st.meals[st.meals.indexOf(meal)]={...meal,date:day,meal:slot,food:name,note:String(f.get('note')||'').slice(0,500)};
 save();render();toast('照片打卡已更新，营养保持待补充。');
};
restorePreparedState=function(...args){const result=originalRestoreMealState(...args);if(result){resetMealCapture();render();}return result;};
document.addEventListener('change',event=>{
 const t=event.target;
 if(t.id==='mealCameraInput'||t.id==='mealAlbumInput'){const file=t.files?.[0];if(file)selectMealPhoto(file);t.value='';}
 if(t.id==='mealPhotoDate'){rememberNutritionForm();mealCapture.date=t.value;mealCapture.revision++;mealPhotoRender();}
});
document.addEventListener('input',event=>{if(event.target.id==='mealPhotoNote'){mealCapture.note=event.target.value;mealCapture.revision++;}});
document.addEventListener('submit',event=>{
 if(event.target.id!=='foodForm'||!(nutritionMode==='photo'||nutritionMode==='free'&&mealCapture.photo))return;event.preventDefault();event.stopImmediatePropagation();
 try{if(nutritionMode==='photo')saveRecognizedMealPhoto(event.target);else {const d=mealCapture;if(d.loading||d.status==='recognizing')throw Error('请先等待照片准备完成或停止识别。');const result=saveNutritionMeal(event.target,{photo:d.photo,replaceId:d.recordId});if(result){resetMealCapture();nutritionMode='photo';render();toast('照片与手动确认的饮食已打卡。');}}}catch(error){toast(error.message);}
},true);
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
 try{
 if(action==='meal-photo-home'){nutritionMode='photo';render();}
 if(action==='nutrition-mode'&&button.dataset.mode==='free'&&mealCapture.photo){Object.assign(nutritionDraft,{date:mealCapture.date,meal:mealCapture.meal,note:mealCapture.note});render();}
 if(action==='meal-slot'){rememberNutritionForm();mealCapture.meal=button.dataset.meal;mealCapture.revision++;if(nutritionMode!=='photo')nutritionMode='photo';render();}
 if(action==='meal-photo-camera'){rememberMealCameraMeta();el('mealCameraInput')?.click();}
 if(action==='meal-photo-album'){rememberMealCameraMeta();el('mealAlbumInput')?.click();}
 if(action==='meal-photo-remove'){resetMealCapture();render();}
 if(action==='meal-photo-stop'){cancelMealRecognition();render();}
 if(action==='meal-photo-recognize')recognizeMealPhoto();
 if(action==='meal-photo-apply'&&mealCapture.pending){applyMealPhotoResult(mealCapture.pending);render();}
 if(action==='meal-photo-save')saveMealPhotoOnly();
 if(action==='meal-photo-reanalyze'){
   const meal=nutritionEditMeal(button.dataset.id);if(!meal.photo)return;
   if(mealCapture.photo&&!confirm('用这条记录的照片替换当前未保存的餐食草稿？'))return;
   resetMealCapture();nutritionMode='photo';selectMealPhoto(meal.photo,false,meal);render();window.scrollTo(0,0);
 }
 if(action==='meal-photo-view'){
   const meal=nutritionEditMeal(button.dataset.id);if(!meal.photo)return;
   const box=document.createElement('div');box.className='modal fit-image-dialog';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','餐食照片');
   const image=document.createElement('img');image.src=meal.photo;image.alt=meal.food;const close=document.createElement('button');close.className='btn';close.textContent='关闭照片';close.onclick=()=>box.remove();box.append(image,close);document.body.append(box);close.focus();
 }
 }catch(error){toast(error.message);}
});
window.addEventListener('fit-native-camera-recovered',async event=>{if(await selectMealPhoto(event.detail?.dataUrl,true)){try{const meta=JSON.parse(localStorage.getItem('qinglian_meal_photo_meta')||'null');if(meta&&validMealDay(meta.date)&&['早餐','午餐','晚餐','零食'].includes(meta.meal))Object.assign(mealCapture,{date:meta.date,meal:meta.meal,note:String(meta.note||'').slice(0,500)})}catch(_){}nutritionMode='photo';tab='food';render();if(event.detail?.recoveryId)window.QinglianAndroid?.acknowledgeMealPhoto?.(event.detail.recoveryId);}});
window.addEventListener('fit-records-cleared',()=>{resetMealCapture();render();});
window.addEventListener('fit-native-ai-settings',()=>{cancelMealRecognition('AI设置已更新，请重新开启后识别。');mealPhotoRender();});
nutritionMode='photo';render();
