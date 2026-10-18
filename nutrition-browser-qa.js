(async()=>{
 const results=[];const assert=(condition,label)=>{if(!condition)throw Error(label);results.push(label)};
 const fetchOriginal=window.fetch, confirmOriginal=window.confirm;
 const go=()=>{tab='food';render()};
 const click=selector=>{const node=document.querySelector(selector);if(!node)throw Error('Missing '+selector);node.click()};
 const until=async predicate=>{for(let i=0;i<500&&!predicate();i++)await new Promise(r=>setTimeout(r,20));if(!predicate())throw Error('Timed out')};
 const fileInto=form=>{const transfer=new DataTransfer();transfer.items.add(new File([fixture],'qa.jpg',{type:'image/jpeg'}));form.elements.image.files=transfer.files;};
 const fixture=await fetchOriginal('/roman-chair-reference.jpg').then(r=>r.blob());
 let paid=0,offlineCalls=0,localFail=false;
 try {
 st=defaultState();save();nutritionSelected=FOOD_DATABASE[0];nutritionSource='database';nutritionMode='free';nutritionConsent=null;nutritionQuery='';nutritionDate=datekey();nutritionDraft={date:nutritionDate,meal:'午餐',grams:'150',foodName:'米饭',note:'',manualKcal:'',manualProtein:'',manualCarbs:'',manualFat:''};go();
 window.fetch=async()=>{offlineCalls++;throw Error('Offline test')};
 assert(!foodAIEnabled(),'Food AI starts off');
 assert(['早餐','午餐','晚餐','零食'].every(x=>document.body.innerText.includes(x)),'All four meal categories remain available');
 const search=document.getElementById('foodSearch');search.value='宫保鸡丁';search.dispatchEvent(new Event('input',{bubbles:true}));
 assert(document.getElementById('nutritionResults').innerText.includes('宫保鸡丁'),'Chinese food search runs offline');
 click('[data-action="food-pick"]');
 assert(st.meals.length===0,'Selecting reference food never saves meal');
 nutritionQuery='米饭';go();click('[data-action="food-pick"][data-food-id="food-000"]');click('[data-action="food-weight"][data-grams="200"]');
 assert(document.getElementById('nutritionCalculation').innerText.includes('232 kcal'),'Weight updates estimated calories locally');
 document.getElementById('foodForm').requestSubmit();
 assert(st.meals.length===1&&st.meals[0].kcal===232&&st.meals[0].protein===5.2,'Explicit save persists calculated calories and protein');
 assert(offlineCalls===0,'Free search and save require no network calls');
 const form=document.getElementById('foodForm');form.elements.foodName.value='未收录测试食物';form.requestSubmit();
 assert(st.meals.length===1,'Unknown renamed food cannot inherit rice nutrition');
 for(const [key,value] of Object.entries({manualKcal:'500',manualProtein:'25',manualCarbs:'60',manualFat:'18',meal:'零食'}))form.elements[key].value=value;
 form.requestSubmit();
 assert(st.meals.at(-1).source==='manual'&&st.meals.at(-1).meal==='零食','Manual unknown food and snacks can be confirmed offline');
 st.customFoods=[{id:'barcode-3017620422003',barcode:'3017620422003',name:'测试包装食品',kcal:500,protein:10,carbs:50,fat:20,basis:'100g',requiresUnitConfirmation:true,source:'测试缓存'}];save();go();
 const barcode=document.getElementById('barcodeForm');barcode.elements.barcode.value='3017620422003';barcode.requestSubmit();await until(()=>!nutritionBusy);
 assert(nutritionSelected.name==='测试包装食品'&&offlineCalls===0,'Saved barcode product works fully offline');
 assert(st.meals.length===2,'Barcode lookup does not save a meal');
 assert(!document.getElementById('foodForm').checkValidity(),'Barcode packaging unit must be confirmed before saving');
 const basis=document.getElementById('foodPortionBasis');basis.value='100ml';basis.dispatchEvent(new Event('change',{bubbles:true}));
 assert(nutritionSelected.basis==='100ml'&&!nutritionSelected.requiresUnitConfirmation&&document.getElementById('foodForm').innerText.includes('份量（毫升）'),'Liquid label uses millilitres without guessing density');
 window.fetch=async(url,options)=>{
  if(String(url)==='/api/food-photo'){
   paid++;const body=JSON.parse(options.body);assert(Object.keys(body).sort().join(',')==='context,image,paidConsent','Cloud request excludes private training and meal history');
   return new Response(JSON.stringify({name:'测试盖饭',grams:300,kcal:500,protein:30,carbs:60,fat:15,low:400,high:650,note:'需确认油量',ingredients:['米饭','鸡肉'],cooking:'炒制'}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(String(url)==='/api/local-food'){
   if(localFail)throw Error('本地服务测试故障');
   return new Response(JSON.stringify({recognized:false,candidates:[],localOnly:true,message:'无法可靠识别，请手动选择食物。'}),{status:200});
  }
  return fetchOriginal(url,options);
 };
 go();const local=document.getElementById('localFoodForm');fileInto(local);local.requestSubmit();await until(()=>!nutritionBusy);
 assert(document.body.innerText.includes('无法可靠识别')&&st.meals.length===2,'Unknown local image clearly falls back and never saves');
 nutritionLocalResult={message:'上一张图片的候选',candidates:[{name:'宫保鸡丁',score:.9}]};go();localFail=true;
 const failedLocal=document.getElementById('localFoodForm');fileInto(failedLocal);failedLocal.requestSubmit();await until(()=>!nutritionBusy);
 assert(nutritionLocalResult===null&&!document.body.innerText.includes('上一张图片的候选'),'Failed new image clears previous photo candidates');
 click('[data-action="nutrition-mode"][data-mode="ai"]');
 assert(!document.getElementById('foodAIToggle').checked&&document.querySelector('#enhancedFoodForm button').disabled,'Opening AI tab does not enable paid requests');
 const aiClosed=document.getElementById('enhancedFoodForm');fileInto(aiClosed);aiClosed.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await until(()=>!nutritionBusy);
 assert(paid===0,'AI off refuses a programmatically submitted paid form');
 await setFoodAI(true);assert(foodAIEnabled(),'Food AI requires explicit enable');
 window.confirm=()=>false;let aiForm=document.getElementById('enhancedFoodForm');fileInto(aiForm);aiForm.requestSubmit();await until(()=>!nutritionBusy);
 assert(paid===0,'Declining cost confirmation prevents paid request');
 window.confirm=()=>true;aiForm=document.getElementById('enhancedFoodForm');fileInto(aiForm);aiForm.elements.context.value='测试份量';aiForm.requestSubmit();await until(()=>!nutritionBusy);
 assert(paid===1&&st.meals.length===2,'AI result is only a draft until confirmed');
 assert(document.getElementById('foodForm').elements.grams.value==='300','AI estimated portion fills confirmation form');
 assert(document.getElementById('foodForm').elements.note.value.includes('鸡肉'),'Ingredients and cooking remain visible for review');
 const draftForm=document.getElementById('foodForm');draftForm.elements.grams.value='150';draftForm.elements.date.value='2026-10-01';draftForm.elements.grams.dispatchEvent(new Event('input',{bubbles:true}));
 await setFoodAI(false);
 assert(document.getElementById('foodForm').elements.grams.value==='150'&&document.getElementById('foodForm').elements.date.value==='2026-10-01','Disabling AI preserves corrected portion and record date');
 click('[data-action="nutrition-mode"][data-mode="free"]');
 click('[data-action="food-weight"][data-grams="200"]');
 assert(document.getElementById('foodForm').elements.date.value==='2026-10-01','Selecting portion and switching modes preserves custom record date');
 const saveForm=document.getElementById('foodForm');saveForm.elements.grams.value='300';saveForm.elements.date.value=datekey();saveForm.elements.grams.dispatchEvent(new Event('input',{bubbles:true}));
 click('[data-action="nutrition-mode"][data-mode="ai"]');
 document.getElementById('foodForm').requestSubmit();
 assert(st.meals.length===3&&st.meals.at(-1).source==='qwen'&&st.meals.at(-1).carbs===60,'AI draft saves all macros only after explicit confirmation');
 await setFoodAI(false);assert(!foodAIEnabled(),'Disabling food AI clears consent immediately');
 const closedAgain=document.getElementById('enhancedFoodForm');closedAgain.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await until(()=>!nutritionBusy);
 assert(paid===1,'No further paid requests after disable');
 assert(nutritionDayStats(datekey()).kcal===1232,'Daily calories include manual and confirmed AI records');
 st=defaultState();save();nutritionMode='free';nutritionSelected=FOOD_DATABASE[0];nutritionSource='database';nutritionLocalResult=null;nutritionMessage='';nutritionQuery='';nutritionDraft={date:nutritionDate,meal:'午餐',grams:'150',foodName:'米饭',note:'',manualKcal:'',manualProtein:'',manualCarbs:'',manualFat:''};go();
 return {passed:results.length,results};
 } finally {window.fetch=fetchOriginal;window.confirm=confirmOriginal;await setFoodAI(false);}
})()
