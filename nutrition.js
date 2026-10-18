'use strict';

let nutritionDate = datekey(), nutritionMode = 'free', nutritionQuery = '';
let nutritionSelected = FOOD_DATABASE[0], nutritionSource = 'database', nutritionMessage = '';
let nutritionLocalResult = null, nutritionBusy = false, nutritionConsent = null, nutritionAbort = null;
let nutritionAIEpoch = 0;
let nutritionDraftRevision = 0, nutritionPendingAI = null;
let nutritionDraft = {date:nutritionDate, meal:'午餐', grams:'150', foodName:'', note:'', manualKcal:'', manualProtein:'', manualCarbs:'', manualFat:''};

function nutrientNumber(value) {return value === null || value === '' || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);}
function nutritionFoods() {return [...FOOD_DATABASE, ...(st.customFoods || [])];}
function searchNutritionFoods(query) {
  const q = String(query || '').trim().toLowerCase();
  return nutritionFoods().filter(x => !q || [x.name, ...(x.aliases || []), x.barcode || ''].join(' ').toLowerCase().includes(q)).slice(0,30);
}
function nutritionTotals(item, grams) {
  const result = {};
  for (const key of ['kcal','protein','carbs','fat']) {
    const value = nutrientNumber(item?.[key]); result[key] = value === null ? null : rnd(value * grams / 100);
  }
  return result;
}
function confirmedReference(name) {
  const item = nutritionSelected;
  if (String(name).trim() === item?.name || item?.aliases?.includes(String(name).trim())) return item;
  // A new display name is not evidence that the old nutrition still applies.
  // Keep independently confirmed package identity/unit, require fresh totals.
  const reference={...item,id:item?.barcode?item.id:'manual-food',name:String(name).trim(),kcal:null,protein:null,carbs:null,fat:null,
    basis:item?.basis==='100ml'?'100ml':'100g',source:'用户手动填写',manualNutrition:true};
  delete reference.range;
  return reference;
}
function estimateDailyEnergy(day = datekey()) {
  const profile = st.settings.profile;
  const bodyWeight = st.weights.filter(x => x.date <= day).slice().sort((a,b) => a.date.localeCompare(b.date)).at(-1)?.kg || profile?.weight;
  const bmr = profile ? Math.max(0,10 * bodyWeight + 6.25 * profile.height - 5 * profile.age + (profile.sex === 'male' ? 5 : -161)) : null;
  const baseline = bmr === null ? n(st.settings.dailyBase) : bmr * profile.activity;
  const exercise = st.history.filter(h => h.date === day && h.type === 'done').reduce((sum,h) => {
    const ratio = h.total > 0 ? Math.min(1,Math.max(0,h.done/h.total)) : 1;
    return sum + n(st.settings.strengthPerSession) * ratio + n(h.cardio) * n(st.settings.cardioPerMin);
  },0);
  return {bmr, dailyActivity:bmr === null ? null : baseline-bmr, baseline, exercise, total:Math.max(0,baseline+exercise)};
}
function nutritionDayStats(day) {
  const meals = st.meals.filter(m => m.date === day), result = {meals,kcal:0,protein:0,carbs:0,fat:0,missing:[]};
  for (const key of ['kcal','protein','carbs','fat']) {
    for (const row of meals) {const value = nutrientNumber(row[key]); if (value === null) {if (!result.missing.includes(key)) result.missing.push(key);} else result[key] += value;}
    result[key] = rnd(result[key]);
  }
  return result;
}
function rememberNutritionForm() {
  const form = el('foodForm'); if (!form?.elements) return;
  const before=JSON.stringify(nutritionDraft);
  for (const key of ['date','meal','grams','foodName','note','manualKcal','manualProtein','manualCarbs','manualFat']) if (form.elements[key]) nutritionDraft[key] = form.elements[key].value;
  if(before!==JSON.stringify(nutritionDraft))nutritionDraftRevision++;
}
function chooseNutritionFood(item, source = 'database') {
  rememberNutritionForm(); nutritionSelected = item; nutritionSource = source;
  nutritionDraftRevision++;
  nutritionDraft.foodName = item.name; nutritionDraft.manualKcal = ''; nutritionDraft.manualProtein = ''; nutritionDraft.manualCarbs = ''; nutritionDraft.manualFat = '';
  if (item.basis === '100ml') nutritionMessage = '该产品按100毫升标示，请按毫升填写份量，不能直接把毫升当克。';
  render();
}
function nutritionSearchResults() {
  return searchNutritionFoods(nutritionQuery).map(item => `<button type="button" class="nutrition-result ${item.id === nutritionSelected?.id ? 'selected' : ''}" data-action="food-pick" data-food-id="${esc(item.id)}"><strong>${esc(item.name)}</strong><span>${item.kcal == null ? '热量待填写' : item.kcal+' kcal / '+(item.basis === '100ml' ? '100ml' : '100g')}</span></button>`).join('') || '<p class="muted">没有匹配项，可在下方手动填写食物和营养标签。</p>';
}
function nutritionEntryForm() {
  const selected = nutritionSelected, dbIndex = FOOD_DATABASE.findIndex(x => x.id === selected?.id);
  const unitPicker = selected?.barcode ? `<div class="field"><label>核对包装营养标示单位<select name="portionBasis" id="foodPortionBasis" required><option value="" ${selected.requiresUnitConfirmation?'selected':''}>请选择：每100克或每100毫升</option><option value="100g" ${!selected.requiresUnitConfirmation&&selected.basis==='100g'?'selected':''}>每100克（按克记录）</option><option value="100ml" ${!selected.requiresUnitConfirmation&&selected.basis==='100ml'?'selected':''}>每100毫升（按毫升记录）</option></select></label><p class="muted small">按包装核对单位；毫升与克不直接换算。</p></div>` : '';
  return `<div class="card"><h2>确认食物与份量</h2><p class="muted small">先确认种类、可食重量及做法，再保存。所有热量与营养为估算。</p><form id="foodForm"><input name="food" id="foodSelect" type="hidden" value="${Math.max(0,dbIndex)}"><div class="formgrid">${field('记录日期','date','date',nutritionDraft.date || nutritionDate,'required')}${field('食物名称','foodName','text',nutritionDraft.foodName || selected?.name || '','required maxlength="160"')}<div class="field"><label>餐次<select name="meal">${['早餐','午餐','晚餐','零食'].map(m=>`<option ${nutritionDraft.meal===m || nutritionDraft.meal==='加餐'&&m==='零食'?'selected':''}>${m}</option>`).join('')}</select></label></div>${field(selected?.basis==='100ml'?'份量（毫升）':'可食份量（克）','grams','number',nutritionDraft.grams,'min="1" max="5000" step="1" required')}</div>${unitPicker}<div class="row wrap spaced">${[50,100,150,200,300].map(g=>`<button type="button" class="btn sm" data-action="food-weight" data-grams="${g}">${g}${selected?.basis==='100ml'?'ml':'g'}</button>`).join('')}<button type="button" class="btn sm" data-action="food-weight" data-grams="${selected?.servingGrams || 100}">参考一份 ${selected?.servingGrams || 100}${selected?.basis==='100ml'?'ml':'g'}</button></div><div class="nutrition-calculation spaced" id="nutritionCalculation"></div><details class="spaced"><summary>手动填写本份营养（缺失项必须补全）</summary><div class="formgrid spaced">${field('本份热量 kcal','manualKcal','number',nutritionDraft.manualKcal,'min="0" max="15000" step="0.1"')}${field('本份蛋白质 g','manualProtein','number',nutritionDraft.manualProtein,'min="0" max="1000" step="0.1"')}${field('本份碳水 g','manualCarbs','number',nutritionDraft.manualCarbs,'min="0" max="5000" step="0.1"')}${field('本份脂肪 g','manualFat','number',nutritionDraft.manualFat,'min="0" max="1000" step="0.1"')}</div><p class="muted small">输入本次吃下的总量；不是每100克数值。热量栏留空时按所选参考食物计算。</p></details>${field('备注（做法、油量、酱料等）','note','text',nutritionDraft.note,'maxlength="500"')}<button class="btn primary spaced" type="submit">确认食物及份量并保存</button></form><p class="muted small spaced">数据来源：${esc(selected?.source || '用户填写')}。${nutritionSource==='qwen'?'AI仅提供估算，不会自动保存。':''}</p></div>`;
}
function updateNutritionCalculation() {
  const form = el('foodForm'), output = el('nutritionCalculation'); if (!form?.elements || !output) return;
  const totals = nutritionTotals(confirmedReference(form.elements.foodName.value),n(form.elements.grams.value));
  for (const [key,input] of [['kcal','manualKcal'],['protein','manualProtein'],['carbs','manualCarbs'],['fat','manualFat']]) {
    if (form.elements[input].value !== '') totals[key] = nutrientNumber(form.elements[input].value);
  }
  output.innerHTML = `<strong>本份估算：${totals.kcal === null ? '待填写' : totals.kcal+' kcal'}</strong><p>蛋白质 ${totals.protein ?? '待填写'}g · 碳水 ${totals.carbs ?? '待填写'}g · 脂肪 ${totals.fat ?? '待填写'}g</p>`;
}
function freeNutritionTools() {
  const candidates = nutritionLocalResult?.candidates || [];
  return `<div class="card"><h2>免费食物搜索</h2><div class="field"><label>搜索常见中餐、食材或已保存条码<input id="foodSearch" placeholder="例如：米饭、宫保鸡丁、番茄炒蛋" value="${esc(nutritionQuery)}"></label></div><div id="nutritionResults" class="nutrition-results spaced">${nutritionSearchResults()}</div><p class="small muted">本地${FOOD_DATABASE.length}条参考估算，菜肴油量与配方会影响热量。没有匹配时可手动填写。</p></div><div class="nutrition-tools"><div class="card"><h2>免费条码查询</h2><form id="barcodeForm"><div class="field"><label>商品条码<input name="barcode" inputmode="numeric" pattern="[0-9]{8,14}" placeholder="8/12/13/14位条码" required></label></div><button class="btn spaced" ${nutritionBusy?'disabled':''}>查询条码</button></form><p class="small muted">先查本机已保存产品，再查询免费的 Open Food Facts；仅发送条码，不发送照片。未收录时按包装营养标签手动填写。</p></div><div class="card"><h2>本地图片候选（实验）</h2><form id="localFoodForm"><div class="field"><label>选择餐食图片<input type="file" name="image" accept="image/*" required></label></div><button class="btn spaced" ${nutritionBusy?'disabled':''}>${nutritionBusy?'处理中…':'本机识别，不上传云端'}</button></form><p class="small muted">114类中餐分类模型，照片仅发至本机服务。不估测重量，不保证识别正确；混合餐或低置信度时请手选。</p>${nutritionLocalResult?`<div id="localFoodResult"><div class="note spaced">${esc(nutritionLocalResult.message)}</div><div class="nutrition-results spaced">${candidates.map((c,i)=>`<button class="nutrition-result" data-action="food-candidate" data-index="${i}"><strong>${esc(c.name)}</strong><span>模型分数 ${Math.round(c.score*100)}% · 选择并核对</span></button>`).join('')}</div></div>`:''}</div></div>`;
}
function foodAIEnabled() {return Boolean(nutritionConsent && st.settings.ai);}
function nutritionDraftSignature() {return JSON.stringify({draft:nutritionDraft,item:nutritionSelected,source:nutritionSource});}
function pendingNutritionAIHTML() {
  const result=nutritionPendingAI;if(!result)return '';
  return `<section class="card nutrition-pending-ai spaced" role="status"><h2>AI分析结果待应用</h2><strong>${esc(result.item.name)} · ${result.grams}g</strong><p class="muted small">估算${result.low}–${result.high} kcal。当前填写内容已保留；使用结果会替换当前食物与份量，仍需确认保存。</p><div class="row wrap"><button type="button" class="btn primary" data-action="nutrition-apply-ai">使用此结果</button><button type="button" class="btn" data-action="nutrition-discard-ai">忽略结果</button></div></section>`;
}
function applyNutritionAIResult(result) {
  rememberNutritionForm();nutritionSelected=structuredClone(result.item);nutritionSource='qwen';nutritionDraftRevision++;
  Object.assign(nutritionDraft,{foodName:result.item.name,grams:String(result.grams),note:result.note,manualKcal:'',manualProtein:'',manualCarbs:'',manualFat:''});
  nutritionPendingAI=null;nutritionMessage=`AI待确认：整份约${result.low}–${result.high} kcal。请确认配料、做法、油量和份量后保存。`;render();
}
function enhancedNutritionTools() {
  const enabled = foodAIEnabled();
  return `<div class="card"><div class="row between wrap"><div><h2>通义千问 AI 增强</h2><p class="small muted">复杂食物、配料、做法与营养范围</p></div><label class="row"><input type="checkbox" id="foodAIToggle" ${enabled?'checked':''}>主动开启</label></div><p class="warning">此模式可能产生 API 费用。每次请求前会再次确认；受每日调用次数上限限制，次数限制不等于金额预算。不开启也能使用全部免费记录功能。</p><form id="enhancedFoodForm"><div class="field"><label>选择餐食图片<input type="file" name="image" accept="image/*" required ${!enabled?'disabled':''}></label></div>${field('补充份量、配料或用油情况','context','text','','maxlength="1200"')}<button class="btn primary spaced" ${!enabled||nutritionBusy?'disabled':''}>${nutritionBusy?'分析中…':'确认费用后分析餐食'}</button></form><p class="small muted">只发送本次选择的餐食图和补充说明。结果填入下方待确认区，点击保存前不会写入饮食记录。首次使用需本机配置可用API Key。</p></div>`;
}
function nutritionPage() {
  const stats=nutritionDayStats(nutritionDate), energy=estimateDailyEnergy(nutritionDate), balance=stats.kcal-energy.total, incomplete=stats.missing.includes('kcal');
  return `<div class="pagebar"><div><h1>饮食与热量</h1><p class="lead">免费模式先记录，AI增强按需开启。</p></div><label class="field">查看日期<input id="nutritionDate" type="date" value="${nutritionDate}"></label></div><div class="nutrition-stats"><div class="card"><span class="muted small">已记录摄入 · 估算</span><div class="stat">${Math.round(stats.kcal)} <small>kcal</small></div><p class="small muted">蛋白质 ${stats.protein}g</p></div><div class="card"><span class="muted small">全天消耗 · 估算</span><div class="stat">${Math.round(energy.total)} <small>kcal</small></div><p class="small muted">${energy.bmr===null?'未填个人参数，使用设置中的日常消耗基准':'基础代谢 + 日常活动 + 已打卡训练'}</p></div><div class="card"><span class="muted small">摄入－消耗 · 估算</span><div class="stat">${incomplete?'待补充':(balance>0?'+':'')+Math.round(balance)} <small>kcal</small></div><p class="small muted">餐次未记全时不能判断真实热量缺口</p></div></div><details class="spaced"><summary>查看估算构成与已知三大营养素</summary><p class="small muted">基础代谢 ${energy.bmr===null?'未计算':Math.round(energy.bmr)+' kcal'}；不含专项训练的日常基准 ${Math.round(energy.baseline)} kcal；已打卡训练 ${Math.round(energy.exercise)} kcal。避免把包含健身的活动系数再次叠加训练。</p><p>已记录：蛋白质 ${stats.protein}g · 碳水 ${stats.carbs}g · 脂肪 ${stats.fat}g${stats.missing.length?'（部分历史营养字段未记录，已知量不代表全天总量）':''}</p></details><div class="nutrition-modes spaced" role="group" aria-label="饮食识别模式"><button class="${nutritionMode==='free'?'active':''}" data-action="nutrition-mode" data-mode="free">免费模式</button><button class="${nutritionMode==='ai'?'active':''}" data-action="nutrition-mode" data-mode="ai">AI增强 · 默认关闭</button></div>${nutritionMessage?`<p class="note spaced" id="nutritionStatus" role="status">${esc(nutritionMessage)}</p>`:''}${pendingNutritionAIHTML()}<div class="nutrition-layout spaced"><div class="nutrition-tools-column">${nutritionMode==='free'?freeNutritionTools():enhancedNutritionTools()}</div><div>${nutritionEntryForm()}</div></div><div class="card spaced"><h2>${esc(nutritionDate)} · 饮食记录</h2>${['早餐','午餐','晚餐','零食'].map(meal=>`<h3 class="spaced">${meal}</h3>${stats.meals.filter(m=>(m.meal==='加餐'?'零食':m.meal)===meal).map(m=>`<div class="daymini"><div style="flex:1"><strong>${esc(m.food)}</strong><p class="small muted">${m.grams>0?m.grams+(m.unit==='ml'?'ml':'g'):'份量待确认'} · ${m.kcal==null?'热量待补充':'估算'+m.kcal+' kcal'} · 蛋白质${m.protein ?? '未记录'}g</p></div><button class="textbtn" data-action="edit-meal" data-id="${esc(m.id)}">编辑</button><button class="textbtn" data-action="deleteMeal" data-id="${esc(m.id)}">删除</button></div>`).join('')||'<p class="small muted">未记录</p>'}`).join('')}<details class="spaced"><summary>全部饮食历史</summary>${st.meals.slice().reverse().map(m=>`<p>${esc(m.date)} · ${esc(m.meal)} · ${esc(m.food)} · ${m.kcal==null?'热量待补充':'估算'+m.kcal+'kcal'} <button class="textbtn" data-action="edit-meal" data-id="${esc(m.id)}">编辑</button> <button class="textbtn" data-action="deleteMeal" data-id="${esc(m.id)}">删除</button></p>`).join('')}</details></div>`;
}

function saveNutritionMeal(form, photoOptions={}) {
  const f=new FormData(form), grams=Number(f.get('grams')), item=confirmedReference(f.get('foodName')||nutritionSelected?.name||'');
  if (!Number.isFinite(grams)||grams<1||grams>5000) return toast('请确认有效份量（1–5000）。');
  const name=String(f.get('foodName')||item?.name||'').trim(); if (!name||name.length>160) return toast('请确认有效食物名称（最多160字）。');
  if(item?.barcode && item.requiresUnitConfirmation)return toast('请先按包装确认营养单位：每100克或每100毫升。');
  const totals=nutritionTotals(item,grams);
  for (const [key,input,max] of [['kcal','manualKcal',15000],['protein','manualProtein',1000],['carbs','manualCarbs',5000],['fat','manualFat',1000]]) {
    if (f.get(input)!=='' && f.get(input)!==null) totals[key]=nutrientNumber(f.get(input));
    if (totals[key]===null||totals[key]<0||totals[key]>max) return toast('营养信息缺失或无效，请手动补全本份热量和三大营养素。');
  }
  const day=String(f.get('date')||nutritionDate),category=String(f.get('meal')||'午餐');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||datekey(new Date(day+'T12:00:00'))!==day||!['早餐','午餐','晚餐','零食'].includes(category))return toast('请核对记录日期和餐次。');
  const existing=photoOptions.replaceId?st.meals.find(m=>m.id===photoOptions.replaceId):null;
  if(photoOptions.replaceId&&!existing)throw Error('原饮食记录已删除，请重新拍照记录。');
  const meal={...(existing||{}),id:existing?.id||uid(),date:day,meal:category,food:name,grams,...totals,unit:item?.basis==='100ml'?'ml':'g',note:String(f.get('note')||'').slice(0,500),estimated:true,source:item.id==='manual-food'||item.manualNutrition?'manual':nutritionSource,foodSnapshot:structuredClone(item)};
  if(photoOptions.photo){if(typeof photoOptions.photo!=='string'||photoOptions.photo.length>300000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photoOptions.photo))throw Error('餐食照片格式无效或过大。');meal.photo=photoOptions.photo;meal.recognition=nutritionSource==='qwen'?'ai-confirmed':'manual-confirmed';} 
  if (item?.range && !String(f.get('manualKcal') || '').trim()) meal.range={low:rnd(item.range.low*grams/100),high:rnd(item.range.high*grams/100)};
  else {delete meal.range;delete meal.foodSnapshot.range;}
  if(existing)st.meals[st.meals.indexOf(existing)]=meal;else st.meals.push(meal);
  if (item?.barcode) {
    st.customFoods??=[];const saved={...item,name,kcal:rnd(totals.kcal*100/grams),protein:rnd(totals.protein*100/grams),carbs:rnd(totals.carbs*100/grams),fat:rnd(totals.fat*100/grams)};
    saved.missing=[];st.customFoods=st.customFoods.filter(x=>x.barcode!==item.barcode);st.customFoods.push(saved);
  }
  save();nutritionDraftRevision++;nutritionDate=meal.date;nutritionDraft.note='';nutritionMessage='饮食已保存（估算）。';render();return meal;
}

function nutritionEditMeal(id) {
  const meal=st.meals.find(row=>row.id===id);if(!meal)throw Error('饮食记录不存在或已被删除。');return meal;
}
function nutritionEditNameMatches(meal,name) {
  return [meal.food,meal.foodSnapshot?.name,...(meal.foodSnapshot?.aliases||[])].includes(String(name).trim());
}
function nutritionMealEditTotals(meal,grams) {
  if(!Number.isFinite(Number(meal.grams))||Number(meal.grams)<=0)throw Error('原份量无效，请选择手动填写本份营养。');
  const totals={};for(const key of ['kcal','protein','carbs','fat']){
    const value=nutrientNumber(meal[key]);totals[key]=value===null?null:rnd(value*grams/Number(meal.grams));
  }return totals;
}
function nutritionMealEditHTML(meal) {
  const unit=meal.unit==='ml'?'毫升':'克', category=meal.meal==='加餐'?'零食':meal.meal;
  const mealOptions=['早餐','午餐','晚餐','零食'];
  return `<h2>编辑饮食</h2><form id="mealEdit" data-id="${esc(meal.id)}"><div class="formgrid">${field('日期','date','date',meal.date,'required')}<div class="field"><label>餐次<select name="meal" required>${mealOptions.includes(category)?'':'<option value="">请选择餐次</option>'}${mealOptions.map(value=>`<option ${category===value?'selected':''}>${value}</option>`).join('')}</select></label></div>${field('食物名称','food','text',meal.food,'required maxlength="160"')}${field(`份量（${unit}）`,'grams','number',meal.grams,'min="1" max="5000" step="0.1" required')}</div><p class="muted small">保留原记录的${unit}单位，毫升与克不直接换算。默认按原记录的营养随份量同比例计算，未记录的历史营养仍为未知。</p><label class="nutrition-edit-override spaced"><input type="checkbox" name="manualTotals"> 手动填写本份总营养，覆盖自动计算</label><p class="note small" id="mealEditHelp">修改份量会同步更新下方营养；手动总量模式需要自行核对。</p><div class="formgrid">${[['热量 kcal','kcal',15000],['蛋白质 g','protein',1000],['碳水 g','carbs',5000],['脂肪 g','fat',1000]].map(([label,key,max])=>field(`本份${label}`,key,'number',meal[key]??'',`min="0" max="${max}" step="0.1" readonly`)).join('')}</div>${field('备注','note','text',meal.note||'','maxlength="500"')}<button type="submit" class="btn primary spaced">确认修改并保存</button></form>`;
}
function openNutritionMealEditor(id) {
  const meal=nutritionEditMeal(id);rememberNutritionForm();nutritionDraftRevision++;el('nutritionMealEditor')?.remove();
  const container=document.createElement('div');container.id='nutritionMealEditor';container.className='card spaced nutrition-meal-editor';
  container.innerHTML=nutritionMealEditHTML(meal);el('app').append(container);container.scrollIntoView({block:'start',behavior:'smooth'});
}
function updateNutritionMealEditor(form,changedField='') {
  if(changedField)nutritionDraftRevision++;
  const meal=nutritionEditMeal(form.dataset.id),manual=Boolean(form.elements.manualTotals?.checked);
  const renamed=!nutritionEditNameMatches(meal,form.elements.food.value);
  const totals=manual?null:nutritionMealEditTotals(meal,n(form.elements.grams.value));
  for(const key of ['kcal','protein','carbs','fat']){
    const input=form.elements[key];input.readOnly=!manual;
    if(!manual)input.value=renamed?'':totals[key]??'';
    else if(renamed&&changedField==='food')input.value='';
  }
  const help=form.querySelector?.('#mealEditHelp');if(help)help.textContent=renamed?'食物名称已改变，请开启手动总量并重新填写营养；不会套用旧食物数据。':manual?'手动总量已开启：份量变化不会自动改变营养，请核对本次实际吃下的总量。':'按原记录随份量同比例计算，未知营养保持未记录。';
}
function saveEditedNutritionMeal(form) {
  const f=new FormData(form),meal=nutritionEditMeal(form.dataset.id),grams=Number(f.get('grams'));
  const name=String(f.get('food')||'').trim(),day=String(f.get('date')||''),category=f.get('meal')==='加餐'?'零食':f.get('meal');
  const manual=Boolean(f.get('manualTotals')),renamed=!nutritionEditNameMatches(meal,name);
  if(!Number.isFinite(grams)||grams<1||grams>5000)throw Error('份量需为1–5000之间的有效数值。');
  if(!name||name.length>160||!/^\d{4}-\d{2}-\d{2}$/.test(day)||datekey(new Date(day+'T12:00:00'))!==day||!['早餐','午餐','晚餐','零食'].includes(category))throw Error('请核对日期、餐次和食物名称。');
  if(renamed&&!manual)throw Error('食物名称已改变，请开启手动总量并重新核对营养，不会套用旧食物数据。');
  const totals=manual?Object.fromEntries(['kcal','protein','carbs','fat'].map(key=>[key,nutrientNumber(f.get(key))])):nutritionMealEditTotals(meal,grams);
  for(const [key,max] of [['kcal',15000],['protein',1000],['carbs',5000],['fat',1000]]){
    if(totals[key]===null){if(key==='kcal'||renamed||nutrientNumber(meal[key])!==null)throw Error('请填写有效的本份热量与已知营养，未知食物需补全三大营养素。');}
    else if(totals[key]<0||totals[key]>max)throw Error('本份营养数值超出有效范围。');
  }
  const previousGrams=Number(meal.grams),next={...meal,date:day,meal:category,food:name,grams,...totals,unit:meal.unit==='ml'?'ml':'g',note:String(f.get('note')||'').slice(0,500),estimated:true,nutritionMode:manual?'manual-total':'portion-scaled'};
  if(manual){
    delete next.range;next.foodSnapshot={...(meal.foodSnapshot||{}),name,basis:next.unit==='ml'?'100ml':'100g',source:'用户确认的本份营养'};
    for(const key of ['kcal','protein','carbs','fat'])next.foodSnapshot[key]=totals[key]===null?null:rnd(totals[key]*100/grams);
    delete next.foodSnapshot.range;
  }else if(meal.range)next.range={low:rnd(meal.range.low*grams/previousGrams),high:rnd(meal.range.high*grams/previousGrams)};
  if(meal.photo&&manual)next.recognition='manual-confirmed';
  st.meals[st.meals.indexOf(meal)]=next;
  if(manual&&next.foodSnapshot?.barcode){
    st.customFoods??=[];const cached={...next.foodSnapshot,id:next.foodSnapshot.id||'barcode-'+next.foodSnapshot.barcode,requiresUnitConfirmation:false};
    cached.missing=['kcal','protein','carbs','fat'].filter(key=>cached[key]===null);
    st.customFoods=st.customFoods.filter(row=>row.barcode!==cached.barcode);st.customFoods.push(cached);
  }
  save();nutritionDraftRevision++;render();toast('饮食修改已保存，热量与营养均为估算。');
}

async function setFoodAI(enabled) {
  rememberNutritionForm();
  const epoch = ++nutritionAIEpoch;
  if (!enabled) {nutritionConsent=null;nutritionAbort?.abort();nutritionMessage='AI增强已关闭，不再发起付费识别请求。';render();}
  try {
    const response=await fetch('/api/food-ai-control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})});
    const data=await response.json();if (!response.ok) throw Error(data.error||'本机服务不可用');
    if (epoch !== nutritionAIEpoch) return;
    if (enabled) {nutritionConsent=data.token;st.settings.ai=true;save();nutritionMessage='AI增强已开启。每次分析前仍会确认费用。';render();}
  } catch (error) {if(epoch!==nutritionAIEpoch)return;nutritionConsent=null;if(enabled){nutritionMessage='无法开启AI增强：'+error.message;render();}}
}

document.addEventListener('input',event=>{
  const t=event.target;
  const editor=t.closest?.('#mealEdit');if(editor)updateNutritionMealEditor(editor,t.name);
  if(t.id==='foodSearch'){nutritionQuery=t.value;el('nutritionResults').innerHTML=nutritionSearchResults();}
  if(t.closest?.('#foodForm')){rememberNutritionForm();updateNutritionCalculation();}
});
document.addEventListener('change',event=>{
  const t=event.target;
  const editor=t.closest?.('#mealEdit');if(editor)updateNutritionMealEditor(editor,t.name);
  if(t.closest?.('#foodForm'))rememberNutritionForm();
  if(t.id==='foodPortionBasis'){nutritionSelected={...nutritionSelected,basis:t.value||'100g',requiresUnitConfirmation:!t.value};nutritionDraftRevision++;render();}
  if(t.id==='nutritionDate'){rememberNutritionForm();nutritionDate=t.value;nutritionDraft.date=t.value;nutritionDraftRevision++;render();}
  if(t.closest?.('#localFoodForm')&&t.name==='image'){nutritionLocalResult=null;nutritionMessage='';el('localFoodResult')?.remove();el('nutritionStatus')?.remove();}
  if(t.id==='foodAIToggle')setFoodAI(t.checked);
  if(t.id==='aiToggle'&&!t.checked)setFoodAI(false);
});
document.addEventListener('click',event=>{
  const b=event.target.closest('[data-action]');if(!b)return;
  const a=b.dataset.action;
  if(a==='nutrition-mode'){rememberNutritionForm();if(nutritionMode!==b.dataset.mode)nutritionDraftRevision++;nutritionMode=b.dataset.mode;render();}
  if(a==='nutrition-apply-ai'&&nutritionPendingAI)applyNutritionAIResult(nutritionPendingAI);
  if(a==='nutrition-discard-ai'){nutritionPendingAI=null;nutritionMessage='已忽略AI结果，当前填写内容已保留。';render();}
  if(a==='food-pick'){const item=nutritionFoods().find(x=>x.id===b.dataset.foodId);if(item)chooseNutritionFood(item,item.barcode?'barcode':'database');}
  if(a==='food-weight'){const form=el('foodForm');form.elements.grams.value=b.dataset.grams;rememberNutritionForm();updateNutritionCalculation();}
  if(a==='food-candidate'){
    const candidate=nutritionLocalResult?.candidates[Number(b.dataset.index)];if(!candidate)return;
    const match=nutritionFoods().find(x=>x.name===candidate.name);
    chooseNutritionFood(match||{id:'manual-candidate',name:candidate.name,kcal:null,protein:null,carbs:null,fat:null,basis:'100g',source:'本地模型待确认候选（未配置营养参考）'},'local-model');
  }
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!['barcodeForm','localFoodForm','enhancedFoodForm'].includes(form.id))return;
  event.preventDefault();if(nutritionBusy)return;const data=new FormData(form);rememberNutritionForm();nutritionBusy=true;
  try{
    if(form.id==='barcodeForm'){
      const code=String(data.get('barcode')||'').trim();const existing=(st.customFoods||[]).find(x=>x.barcode===code);
      if(existing){nutritionMessage='已从本机保存的条码找到产品。';chooseNutritionFood(existing,'barcode');}
      else {const response=await fetch('/api/barcode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({barcode:code})});const result=await response.json();if(!response.ok)throw Error(result.error||'查询失败');nutritionMessage=result.found?(result.product.missing?.length?'查到产品，但部分营养信息缺失，请核对包装后补全。':'查到产品，请核对种类、份量和包装营养标签。'):(result.message||'未收录，请手动填写。');if(result.found)chooseNutritionFood(result.product,'barcode');else chooseNutritionFood({id:'barcode-'+code,barcode:code,name:'未收录产品',kcal:null,protein:null,carbs:null,fat:null,basis:'100g',source:'用户核对包装填写'},'barcode');}
    } else if(form.id==='localFoodForm'){
      nutritionLocalResult=null;nutritionMessage='';
      const image=await imageData(data.get('image'));render();
      const response=await fetch('/api/local-food',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});const result=await response.json();if(!response.ok)throw Error(result.error||'本地识别不可用');nutritionLocalResult=result;nutritionMessage=result.message;
    } else {
      if(!foodAIEnabled())throw Error('AI增强未开启，不会调用付费模型。');
      if(!(window.FitMobile?.native&&window.FitMobile?.aiSupported)&&!confirm('通义千问视觉识别可能产生API费用，并占用每日调用额度。仅发送本次餐食图和补充说明，继续？'))return;
      const requestRevision=nutritionDraftRevision,requestSignature=nutritionDraftSignature();
      const token=nutritionConsent,image=await imageData(data.get('image'));if(!foodAIEnabled()||token!==nutritionConsent)return;
      nutritionAbort=new AbortController();render();
      const response=await fetch('/api/food-photo',{method:'POST',signal:nutritionAbort.signal,headers:{'Content-Type':'application/json','X-Fit-Food-Consent':token},body:JSON.stringify({image,context:String(data.get('context')||''),paidConsent:true})});const result=await response.json();if(!response.ok)throw Error(result.error||'AI增强失败');if(!foodAIEnabled()||token!==nutritionConsent)return;
      const factor=100/result.grams;
      const item={id:'ai-draft',name:result.name,kcal:result.kcal*factor,protein:result.protein*factor,carbs:result.carbs*factor,fat:result.fat*factor,basis:'100g',source:'通义千问视觉估算，待用户确认',range:{low:result.low*factor,high:result.high*factor}};
      const candidate={item,grams:result.grams,low:result.low,high:result.high,note:[result.note,`配料：${(result.ingredients||[]).join('、')}`,`做法：${result.cooking||'未知'}`].join('；')};
      rememberNutritionForm();
      if(requestRevision===nutritionDraftRevision&&requestSignature===nutritionDraftSignature()&&tab==='food'&&nutritionMode==='ai')applyNutritionAIResult(candidate);
      else {nutritionPendingAI=candidate;nutritionMessage='AI分析已完成。当前填写内容已保留，结果需点击“使用此结果”后才会填入。';}
    }
  }catch(error){nutritionMessage=error.name==='AbortError'?'AI请求已停止接收，未保存记录。':error.message+'；可继续使用免费手动录入。';}
  finally{
    nutritionBusy=false;nutritionAbort=null;
    // A response must not destroy an already-open editor with unsaved input.
    const editor=el('mealEdit');
    if(editor?.elements){
      const status=el('nutritionStatus');if(status)status.textContent=nutritionMessage;
      for(const id of ['barcodeForm','localFoodForm','enhancedFoodForm']){
        const button=el(id)?.querySelector?.('button');if(button)button.disabled=id==='enhancedFoodForm'&&!foodAIEnabled();
      }
    }else render();
  }
});
