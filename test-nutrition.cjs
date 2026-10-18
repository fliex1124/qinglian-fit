'use strict';
// Synthetic, in-memory regression coverage. No browser storage or network use.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'verify.cjs'),'utf8');
const marker='let checks=0';assert.ok(source.includes(marker));
const create=new Function('require','__dirname',source.slice(0,source.indexOf(marker))+';return {ctx,run,plain,listeners,nodes};');
let passed=0;
function sandbox(){
  const state=create(require,__dirname);state.ctx.AbortController=AbortController;
  state.ctx.FormData=class{constructor(form){this.data=form.formValues||form}get(key){return this.data[key]??''}*[Symbol.iterator](){yield*Object.entries(this.data)}};
  state.ctx.fetch=async()=>{throw Error('Unexpected network request in nutrition regression')};
  const get=state.ctx.document.getElementById;
  state.ctx.document.getElementById=id=>id==='foodForm'&&state.run('tab')!=='food'?null:get(id);
  return state;
}
function fixtureMeal(state,overrides={}){
  const meal={id:'meal-fixture',date:'2026-10-18',meal:'午餐',food:'米饭',grams:200,kcal:232,
    protein:5.2,carbs:51.8,fat:0.6,unit:'g',note:'原备注',source:'database',
    foodSnapshot:{id:'food-000',name:'米饭',kcal:116,protein:2.6,carbs:25.9,fat:0.3,basis:'100g'},...overrides};
  state.ctx.fixture=meal;state.run('st=defaultState();st.meals=[structuredClone(fixture)];save()');return meal;
}
function edit(state,values={}){
  const original=state.plain('st.meals[0]');
  state.ctx.form={id:'mealEdit',dataset:{id:original.id},formValues:{date:original.date,meal:original.meal,
    food:original.food,grams:String(original.grams),kcal:String(original.kcal),protein:String(original.protein),
    carbs:original.carbs==null?'':String(original.carbs),fat:original.fat==null?'':String(original.fat),note:original.note,...values}};
  state.run('saveEditedNutritionMeal(form)');return state.plain('st.meals[0]');
}
async function test(name,body){await body();passed++;console.log('PASS',name)}
const reply={name:'模型盖饭',grams:300,kcal:500,protein:30,carbs:60,fat:15,low:400,high:650,
  note:'需核对用油',ingredients:['米饭','鸡肉'],cooking:'炒制'};
async function pendingAI(state){
  const values={date:'2026-10-18',meal:'午餐',grams:'150',foodName:'米饭',note:'',manualKcal:'',manualProtein:'',manualCarbs:'',manualFat:''};
  const elements=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{name:key,value}]));
  state.nodes.set('foodForm',{elements});
  state.run("st=defaultState();st.settings.ai=true;nutritionConsent='test-consent';tab='food';nutritionMode='ai';imageData=async()=> 'data:image/jpeg;base64,/9j/'");
  let complete;
  state.ctx.fetch=async url=>{assert.equal(url,'/api/food-photo');return new Promise(resolve=>{complete=resolve})};
  const handler=state.listeners.submit.find(fn=>fn.toString().includes("'enhancedFoodForm'"));
  const pending=handler({target:{id:'enhancedFoodForm',formValues:{image:'synthetic',context:''}},preventDefault(){}});
  for(let i=0;i<100&&!complete;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(complete,'Mock AI request did not start');
  return {pending,elements,finish:()=>complete({ok:true,json:async()=>structuredClone(reply)})};
}

(async()=>{
  await test('editing only portion recomputes all known nutrition from the actual original meal',()=>{
    const s=sandbox();fixtureMeal(s);const meal=edit(s,{grams:'100'});
    assert.deepEqual([meal.grams,meal.kcal,meal.protein,meal.carbs,meal.fat],[100,116,2.6,25.9,0.3]);
    assert.equal(meal.note,'原备注');assert.equal(meal.unit,'g');
  });
  await test('liquid editor displays millilitres and preserves its unit during scaling',()=>{
    const s=sandbox();fixtureMeal(s,{food:'饮品',grams:250,kcal:150,protein:7.5,carbs:15,fat:5,unit:'ml'});
    const html=s.run('nutritionMealEditHTML(st.meals[0])');assert.ok(html.includes('份量（毫升）'));assert.ok(!html.includes('份量g'));
    const meal=edit(s,{grams:'100'});assert.deepEqual([meal.unit,meal.kcal,meal.protein],['ml',60,3]);
  });
  await test('manual totals require explicit mode and clear stale AI ranges on the record and reference',()=>{
    const s=sandbox();fixtureMeal(s,{range:{low:200,high:260},foodSnapshot:{name:'米饭',range:{low:100,high:130}}});
    const meal=edit(s,{grams:'100',manualTotals:'on',kcal:'900',protein:'20',carbs:'100',fat:'30'});
    assert.equal(meal.kcal,900);assert.equal(meal.range,undefined);assert.equal(meal.foodSnapshot.range,undefined);
    assert.equal(meal.nutritionMode,'manual-total');assert.equal(meal.foodSnapshot.kcal,900);
  });
  await test('automatic portion scaling also scales a still-valid AI calorie range',()=>{
    const s=sandbox();fixtureMeal(s,{grams:300,kcal:500,protein:30,carbs:60,fat:15,range:{low:400,high:650}});
    const meal=edit(s,{grams:'150'});assert.equal(meal.kcal,250);assert.deepEqual(meal.range,{low:200,high:325});
  });
  await test('editing legacy records retains unknown macros rather than manufacturing zeroes',()=>{
    const s=sandbox();fixtureMeal(s,{carbs:null,fat:undefined});const meal=edit(s,{grams:'100'});
    assert.equal(meal.carbs,null);assert.equal(meal.fat,null);assert.equal(meal.protein,2.6);
  });
  await test('renamed edited food cannot silently inherit the original nutrition',()=>{
    const s=sandbox();fixtureMeal(s);const before=s.run('JSON.stringify(st.meals)');
    assert.throws(()=>edit(s,{food:'未收录食物',grams:'100'}),/食物名称已改变/);
    assert.equal(s.run('JSON.stringify(st.meals)'),before);
    const meal=edit(s,{food:'未收录食物',grams:'100',manualTotals:'on',kcal:'200',protein:'10',carbs:'20',fat:'8'});
    assert.equal(meal.food,'未收录食物');assert.equal(meal.kcal,200);
  });
  await test('renamed barcode liquid needs fresh totals but retains confirmed unit and reusable barcode',()=>{
    const s=sandbox();s.run("st=defaultState();nutritionSelected={id:'barcode-fixture',barcode:'12345670',name:'测试饮品',kcal:60,protein:3,carbs:6,fat:2,basis:'100ml',requiresUnitConfirmation:false};nutritionSource='barcode';saveNutritionMeal({foodName:'新展示名称',grams:'250',meal:'早餐'})");
    assert.equal(s.run('st.meals.length'),0);
    s.run("saveNutritionMeal({foodName:'新展示名称',grams:'250',meal:'早餐',manualKcal:'150',manualProtein:'7.5',manualCarbs:'15',manualFat:'5'})");
    const meal=s.plain('st.meals[0]'),cached=s.plain('st.customFoods[0]');
    assert.equal(meal.unit,'ml');assert.equal(meal.foodSnapshot.barcode,'12345670');assert.equal(meal.kcal,150);
    assert.equal(cached.barcode,'12345670');assert.equal(cached.basis,'100ml');assert.equal(cached.kcal,60);
  });
  await test('renaming does not bypass required package unit confirmation',()=>{
    const s=sandbox();s.run("st=defaultState();nutritionSelected={id:'barcode-fixture',barcode:'12345670',name:'产品',basis:'100g',requiresUnitConfirmation:true};saveNutritionMeal({foodName:'新名称',grams:'250',meal:'早餐',manualKcal:'150',manualProtein:'7',manualCarbs:'15',manualFat:'5'})");
    assert.equal(s.run('st.meals.length'),0);
  });
  await test('invalid edits are rejected before changing persisted meals',()=>{
    const s=sandbox();fixtureMeal(s);const before=s.run('JSON.stringify(st.meals)');
    for(const values of [{grams:'0'},{grams:'Infinity'},{date:'2026-02-30'},{meal:'随意餐次'},
      {manualTotals:'on',kcal:'-2'},{manualTotals:'on',kcal:'300',protein:''}])assert.throws(()=>edit(s,values));
    assert.equal(s.run('JSON.stringify(st.meals)'),before);
  });
  await test('editor preview follows portion changes while manual mode clearly retains entered totals',()=>{
    const s=sandbox();fixtureMeal(s);
    const values={food:'米饭',grams:'100',kcal:'232',protein:'5.2',carbs:'51.8',fat:'0.6'};
    const elements=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}]));elements.manualTotals={checked:false};
    const help={textContent:''};s.ctx.editor={dataset:{id:'meal-fixture'},elements,querySelector:()=>help};
    s.run("updateNutritionMealEditor(editor,'grams')");assert.equal(elements.kcal.value,116);assert.equal(elements.kcal.readOnly,true);
    elements.manualTotals.checked=true;elements.kcal.value='450';elements.grams.value='250';
    s.run("updateNutritionMealEditor(editor,'grams')");assert.equal(elements.kcal.value,'450');assert.equal(elements.kcal.readOnly,false);assert.ok(help.textContent.includes('不会自动改变'));
  });
  await test('late AI response preserves subsequent free selection and survives page switching as a pending candidate',async()=>{
    const s=sandbox(),work=await pendingAI(s);
    s.run("nutritionMode='free';chooseNutritionFood(FOOD_DATABASE[0],'database');tab='home';render()");
    work.finish();await work.pending;
    assert.equal(s.run('nutritionDraft.foodName'),'米饭');assert.equal(s.run('nutritionDraft.grams'),'150');
    assert.equal(s.run('nutritionPendingAI.item.name'),'模型盖饭');assert.equal(s.run('st.meals.length'),0);
    assert.equal(s.run('tab'),'home');s.run("tab='food';render()");assert.ok(s.run('pendingNutritionAIHTML()').includes('使用此结果'));
    const button={dataset:{action:'nutrition-apply-ai'}};
    for(const listener of s.listeners.click)listener({target:{closest:()=>button}});
    assert.equal(s.run('nutritionDraft.foodName'),'模型盖饭');
    assert.equal(s.run('nutritionDraft.grams'),'300');assert.equal(s.run('nutritionPendingAI'),null);assert.equal(s.run('st.meals.length'),0);
  });
  await test('an unchanged active AI draft still fills the confirmation form without saving a record',async()=>{
    const s=sandbox(),work=await pendingAI(s);work.finish();await work.pending;
    assert.equal(s.run('nutritionDraft.foodName'),'模型盖饭');assert.equal(s.run('nutritionDraft.grams'),'300');
    assert.equal(s.run('nutritionPendingAI'),null);assert.equal(s.run('st.meals.length'),0);
  });
  await test('typed manual changes while AI waits are retained until explicit result application',async()=>{
    const s=sandbox(),work=await pendingAI(s);work.elements.grams.value='75';
    const target=work.elements.grams;target.closest=selector=>selector==='#foodForm'?s.nodes.get('foodForm'):null;
    for(const listener of s.listeners.input)listener({target});
    work.finish();await work.pending;assert.equal(s.run('nutritionDraft.grams'),'75');assert.equal(s.run('nutritionPendingAI.grams'),300);
  });
  await test('a late AI response does not rebuild and erase an open unsaved meal editor',async()=>{
    const s=sandbox(),work=await pendingAI(s);
    s.run("st.meals=[{id:'editing',food:'米饭',grams:200,kcal:232,protein:5.2,carbs:51.8,fat:.6}]");
    const elements={manualTotals:{checked:false},food:{value:'米饭'},grams:{value:'100'},kcal:{value:'232'},protein:{value:'5.2'},carbs:{value:'51.8'},fat:{value:'.6'}};
    s.ctx.editor={dataset:{id:'editing'},elements,querySelector:()=>null};s.nodes.set('mealEdit',s.ctx.editor);
    s.run("updateNutritionMealEditor(editor,'grams');let nutritionRegressionRenderCount=0;const nutritionRegressionOriginalRender=render;render=()=>{nutritionRegressionRenderCount++;return nutritionRegressionOriginalRender()}");
    work.finish();await work.pending;
    assert.equal(s.run('nutritionRegressionRenderCount'),0);assert.equal(elements.grams.value,'100');
    assert.equal(s.run('nutritionPendingAI.grams'),300);assert.equal(s.run('st.meals[0].grams'),200);
  });
  console.log(`${passed} nutrition regression groups passed; real network calls: 0`);
})().catch(error=>{console.error(error);process.exitCode=1});
