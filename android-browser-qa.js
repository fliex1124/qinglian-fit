(async()=>{
 const results=[],assert=(value,label)=>{if(!value)throw Error(label);results.push(label)};
 const confirmOriginal=window.confirm;window.confirm=()=>true;
 const calls={mirrors:[],exports:[],raw:[],shares:[],clears:0};
 st=defaultState();save();
 nutritionSelected=FOOD_DATABASE[0];nutritionSource='database';nutritionQuery='';nutritionMode='free';nutritionConsent=null;
 nutritionDraft={date:datekey(),meal:'午餐',grams:'150',foodName:'米饭',note:'',manualKcal:'',manualProtein:'',manualCarbs:'',manualFat:''};
 window.FitMobile={native:true,storage:{ok:true},queuePersist(state){calls.mirrors.push(structuredClone(state));return {ok:true}}};
 window.QinglianAndroid={
  exportBackup(raw,name){calls.exports.push({raw,name})},exportRawStorage(raw,name){calls.raw.push({raw,name})},
  shareBackup(raw,name){calls.shares.push({raw,name})},clearState(){calls.clears++;return '{"ok":true}'},
  readPreviousState(){return JSON.stringify(window.__previousState)}
 };
 const source=await fetch('/mobile-app.js').then(r=>r.text());(0,eval)(source);
 const go=name=>{tab=name;render()},click=selector=>{const node=document.querySelector(selector);if(!node)throw Error('Missing '+selector);node.click()};
 try {
  go('food');
  assert(!document.getElementById('localFoodForm')&&document.body.innerText.includes('尚未内置食物图片模型'),'Native image model availability is explicit, without a misleading upload form');
  click('[data-action="food-weight"][data-grams="200"]');document.getElementById('foodForm').requestSubmit();
  assert(st.meals.length===1&&st.meals[0].kcal===232&&calls.mirrors.length>0,'Free mobile meal save uses the native mirror hook');
  click('[data-action="edit-meal"]');const editor=document.getElementById('mealEdit');editor.elements.grams.value='100';editor.elements.grams.dispatchEvent(new Event('input',{bubbles:true}));editor.requestSubmit();
  assert(st.meals[0].grams===100&&st.meals[0].kcal===116,'Mobile portion edit recomputes saved nutrition');
  go('workout');click('[data-action="exercise-check"]');
  assert(progress().index===0&&st.history.length===0,'Checking a mobile action never advances training without check-in');
  const link=document.querySelector('.exercise-media a');link.click();
  assert(!!document.querySelector('.fit-image-dialog'),'Native action picture opens inside the app');
  assert(window.fitAndroidBack()===true&&!document.querySelector('.fit-image-dialog'),'Android back closes the action picture before leaving training');
  assert(window.fitAndroidBack()===true&&tab==='home'&&progress().session.exerciseChecks[0]===true,'Android back keeps pending workout and returns home');
  assert(window.fitAndroidBack()===false,'Home delegates final exit to the native activity');
  go('ai');assert(document.getElementById('aiToggle').disabled&&document.getElementById('chatInput').disabled,'Native AI remains clearly unavailable and cannot send paid requests');
  assert(!document.body.innerText.includes('运行本项目的本地服务'),'Native AI page does not direct the phone to run a desktop Python service');
  go('food');nutritionMode='ai';render();assert(!document.getElementById('enhancedFoodForm')&&document.body.innerText.includes('安卓首版尚未接入付费AI'),'Native enhanced mode keeps its entry and explains the free fallback');
  go('settings');click('[data-action="export"]');
  assert(calls.exports.length===1&&JSON.parse(calls.exports[0].raw).app==='qinglian-fit','Existing export action creates a real packet for the system file dialog');
  click('[data-fit-mobile="share"]');assert(calls.shares.length===1&&calls.shares[0].name.endsWith('.json'),'Native share action sends the complete backup to the system sheet');
  const previous=structuredClone(st);previous.weights=[{id:'qa-weight',date:datekey(),kg:75}];window.__previousState=previous;
  click('[data-fit-mobile="previous"]');assert(st.weights.length===1&&st.weights[0].kg===75,'Previous private snapshot restores through the same validated atomic import');
  storageBroken=true;go('settings');click('[data-action="raw-export"]');
  assert(calls.raw.length===1&&calls.raw[0].raw===localStorage.getItem(KEY),'Corrupt-state rescue uses the dedicated raw export bridge');
  const restoreOriginal=restoreBackupPacket;restoreBackupPacket=()=>{throw Error('模拟浏览器写入失败')};
  click('[data-action="clear"]');assert(calls.clears===0&&st.weights.length===1,'Failed browser replacement never deletes the recoverable native copy');restoreBackupPacket=restoreOriginal;
  click('[data-action="clear"]');assert(calls.clears===1&&st.meals.length===0&&st.weights.length===0&&!storageBroken,'Confirmed native clear also works when the original browser state was marked corrupt');
  assert(!document.querySelector('script[src^="http"]'),'Native UI uses only packaged source files');
  nutritionMode='free';nutritionMessage='';nutritionDraft.foodName='米饭';go('workout');window.scrollTo(0,0);
  return {passed:results.length,results,method:'Browser with an explicit simulated native bridge; not a physical Android device'};
 }finally{window.confirm=confirmOriginal}
})()
