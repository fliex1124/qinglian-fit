(async()=>{
 const results=[];const assert=(ok,label)=>{if(!ok)throw Error(label);results.push(label)};
 const originalConfirm=window.confirm;window.confirm=()=>true;
 const click=selector=>{const e=document.querySelector(selector);if(!e)throw Error('Missing '+selector);e.click()};
 const go=name=>{tab=name;render()};
 try{
 st=defaultState();save();go('workout');
 assert(!document.body.innerText.includes('组间休息')&&!document.querySelector('[data-action="timer"],[data-secs],#timerText'),'DOM: group rest controls removed');
 assert(document.querySelector('.training-cardio').innerText.includes('40'),'DOM: forty-minute cardio task stays');
 click('[data-action="cardio-start"]');
 assert(progress().session.cardioClock.runningSince!==null&&progress().index===0,'DOM: cardio starts without advancing training');
 progress().session.cardioClock.runningSince=Date.now()-90000;save();
 click('[data-action="cardio-pause"]');
 assert(document.getElementById('cardioClockText').textContent==='01:30'&&progress().session.cardioClock.runningSince===null,'DOM: cardio pauses at actual elapsed duration');
 go('home');go('workout');
 assert(document.getElementById('cardioClockText').textContent==='01:30','DOM: cardio time survives navigation');
 click('[data-action="cardio-start"]');progress().session.cardioClock.runningSince=Date.now()-30000;save();
 click('[data-action="cardio-record"]');
 assert(progress().session.cardio===2&&document.getElementById('cardioMin').value==='2','DOM: ending cardio records two actual minutes');
 assert(progress().index===0&&st.history.length===0,'DOM: ending cardio never checks in training');
 click('[data-action="cardio-start"]');const cardioInput=document.getElementById('cardioMin');cardioInput.value='5';cardioInput.dispatchEvent(new Event('change',{bubbles:true}));
 assert(progress().session.cardio===5&&progress().session.cardioClock.runningSince===null,'DOM: manual duration pauses clock and takes precedence');
 st=defaultState();save();go('workout');
 assert(document.querySelectorAll('[data-record]').length===0,'DOM: no weight or reps inputs');
 // Seed an existing old draft as data, not as a new UI input.
 progress().session.inputs={0:[{kg:'22.5',reps:'10'}]};progress().session.checks={0:[true,false]};save();render();
 click('[data-action="exercise-check"]');click('[data-action="finish"]');
 assert(st.history.length===1&&progress().index===1,'DOM: partial action check-in advances once');
 assert(st.history[0].completionMode==='exercise'&&st.history[0].done===1,'DOM: action completion has separate history mode');
 assert(st.history[0].inputs[0][0].kg==='22.5'&&st.history[0].checks[0].length===2&&st.history[0].cardio===0,'DOM: old draft preserved, no fabricated set or cardio data');
 click('[data-action="undo"]');assert(st.history.length===0&&progress().index===0,'DOM: undo restores original draft');
 go('plans');click('[data-action="copy-template"]');const copied=st.selected;
 assert(plan().system===false&&plan().days.length===4,'DOM: template copy keeps four days');
 const form=document.getElementById('planForm');form.elements.title.value='浏览器测试计划';form.elements.days.value='1';form.elements.lines.value='## 平板测试\n平板支撑 | 4 | 30–60秒\n@有氧 | 快走 | 20';form.requestSubmit();
 go('workout');assert(document.body.innerText.includes('4组 × 30–60秒')&&!document.querySelector('[data-record]'),'DOM: plank target uses seconds without inputs');
 assert(document.querySelector('.training-cardio').innerText.includes('快走')&&aerobic(curday()).target===20,'DOM: per-day cardio shown');
 go('plans');click('[data-action="switchPlan"][data-id="starter"]');assert(progress().index===0,'DOM: switch retains original progress');
 go('body');let formW=document.getElementById('weightForm');formW.elements.kg.value='75.1';formW.elements.date.value='2026-10-16';formW.elements.waist.value='81';formW.requestSubmit();assert(st.weights.length===1&&st.weights[0].waist==='81','DOM: weight date and waist');
 const src=await fetch('/roman-chair-reference.jpg').then(r=>r.blob());
 const photoForm=document.getElementById('photoForm');const dt=new DataTransfer();dt.items.add(new File([src],'qa-reference.jpg',{type:'image/jpeg'}));photoForm.elements.photo.files=dt.files;photoForm.requestSubmit();
 for(let i=0;i<120&&st.photos.length===0;i++)await new Promise(requestAnimationFrame);
 assert(st.photos.length===1&&st.photos[0].src.startsWith('data:image/jpeg'),'DOM: photo saved locally');
 const saved=JSON.stringify({app:'qinglian-fit',version:1,state:st});
 go('settings');click('[data-action="export"]');
 const upload=document.getElementById('importFile');const importData=new DataTransfer();importData.items.add(new File([saved],'qa-backup.json',{type:'application/json'}));upload.files=importData.files;
 st.weights=[];save();click('[data-action="import"]');
 for(let i=0;i<30&&st.weights.length===0;i++)await new Promise(requestAnimationFrame);
 assert(st.weights.length===1&&st.photos.length===1&&st.plans.some(p=>p.id===copied),'DOM: backup restores weight photo and plans');
 go('food');const f=document.getElementById('foodForm');f.elements.foodName.value='测试鸡肉饭';f.elements.grams.value='300';f.elements.manualKcal.value='600';f.elements.manualProtein.value='30';f.elements.manualCarbs.value='70';f.elements.manualFat.value='20';f.requestSubmit();assert(st.meals.at(-1).kcal===600,'DOM: manual meal saved');
 click('[data-action="edit-meal"]');const ef=document.getElementById('mealEdit');ef.elements.manualTotals.checked=true;ef.elements.manualTotals.dispatchEvent(new Event('change',{bubbles:true}));ef.elements.kcal.value='550';ef.requestSubmit();assert(st.meals.at(-1).kcal===550,'DOM: meal edited');
 go('ai');assert(document.getElementById('chatInput').disabled,'DOM: AI disabled by default');
 for(let day=0;day<4;day++){
  st.selected='starter';progress().index=day;progress().choice=false;progress().restDate=null;go('workout');
  assert(document.querySelectorAll('.exercise-card').length===[6,6,4,4][day],'DOM: day '+(day+1)+' exercise count');
  assert(!document.querySelector('[data-record]'),'DOM: day '+(day+1)+' no set inputs');
  const images=[...document.querySelectorAll('[data-exercise-image]')];
  await Promise.all(images.map(img=>{img.loading='eager';return img.decode().catch(e=>{throw Error('Image failed: '+img.getAttribute('src')+' '+e.message)})}));
  assert(images.length>0&&images.every(img=>img.complete&&img.naturalWidth>0),'DOM: day '+(day+1)+' all exercise images load');
 }
 st=defaultState();save();go('workout');
 for(let day=0;day<4;day++){click('[data-action="exercise-check"]');click('[data-action="finish"]');if(day<3)go('workout')}
 assert(progress().choice&&document.body.innerText.includes('休息一天')&&document.body.innerText.includes('继续下一轮'),'DOM: fourth day shows explicit cycle choice');
 click('[data-action="cycle-continue"]');assert(progress().index===0&&!progress().choice,'DOM: continue begins day one');

 assert(!document.querySelector('script[src^="http"]'),'No external scripts');
 st=defaultState();save();go('home');localStorage.removeItem(KEY+'_before_restore');
 return {passed:results.length,results};
 }finally{window.confirm=originalConfirm}
})()
