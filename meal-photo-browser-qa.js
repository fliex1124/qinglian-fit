(async()=>{
 const checks=[],check=(v,label)=>{if(!v)throw Error(label);checks.push(label)};
 const pause=()=>new Promise(resolve=>setTimeout(resolve,0)),settle=async test=>{for(let i=0;i<150;i++){if(test())return;await pause()}throw Error('UI did not settle')};
 const originalFetch=window.fetch.bind(window),originalConfirm=window.confirm;window.confirm=()=>true;
 const calls=[],reply={name:'模拟鸡肉饭',grams:300,kcal:500,protein:30,carbs:60,fat:15,low:400,high:650,note:'请确认油量'};
 let hold=false,fail=false,complete=null;
 window.fetch=async(url,options={})=>{
  if(url==='/api/food-ai-control'){const enabled=JSON.parse(options.body).enabled;return new Response(JSON.stringify({enabled,token:enabled?'meal-browser-token':null}))}
  if(url==='/api/food-photo'){calls.push(JSON.parse(options.body));if(fail)throw Error('模拟断网');if(hold)return new Promise(resolve=>{complete=resolve});return new Response(JSON.stringify(reply));}
  return originalFetch(url,options);
 };
 st=defaultState();save();resetMealCapture();nutritionMode='photo';tab='food';render();
 const click=selector=>{const node=document.querySelector(selector);if(!node)throw Error('Missing '+selector);node.click()};
 const go=name=>{tab=name;render()};
 const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const ctx=canvas.getContext('2d');ctx.fillStyle='#bed7ca';ctx.fillRect(0,0,1200,800);ctx.fillStyle='#f2eee2';ctx.beginPath();ctx.ellipse(600,400,400,275,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#689278';ctx.fillRect(300,300,230,180);ctx.fillStyle='#c08d62';ctx.fillRect(620,280,280,210);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9)),file=new File([blob],'synthetic-meal.jpg',{type:'image/jpeg'});
 async function choose(id='mealAlbumInput'){const transfer=new DataTransfer();transfer.items.add(file);const input=document.getElementById(id);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await settle(()=>!mealCapture.loading&&!!mealCapture.photo)}
 try{
  check(!!document.getElementById('mealCameraInput')?.hasAttribute('capture'),'Default page has a real capture input and an album alternative');
  check(!document.getElementById('foodSearch')&&!document.getElementById('foodForm'),'Default page avoids the large manual search and nutrition form');
  await choose();check(mealCapture.photo.length<=300000&&mealCapture.image.length<=2000000,'Real browser decodes and compresses the chosen image within storage/API limits');
  check(document.querySelector('.meal-photo-stage img').naturalWidth>0,'Chosen photo is visibly previewed');
  check(calls.length===0&&!st.settings.ai,'Choosing a photo while AI is off does not call AI');
  click('[data-action="meal-photo-save"]');check(st.meals.length===1&&st.meals[0].kcal===null&&st.meals[0].photo.startsWith('data:image/jpeg'),'Photo-only check-in stores its photo with unknown calories');
  check(document.body.innerText.includes('热量待补充')&&!document.body.innerText.includes('null'),'Photo journal labels unknown nutrition clearly');
  go('home');check(document.body.innerText.includes('待补充'),'Home does not present an unrecognized photo as zero calories');
  go('food');click('[data-action="edit-meal"]');const editor=document.getElementById('mealEdit');editor.elements.food.value='照片午餐';editor.elements.note.value='明天再补';editor.requestSubmit();check(st.meals[0].food==='照片午餐'&&st.meals[0].kcal===null,'Photo-only metadata can be edited without entering nutrition');
  await choose();click('[data-action="meal-photo-recognize"]');await settle(()=>mealCapture.status==='review');
  check(calls.length===1&&calls[0].paidConsent===true&&calls[0].image.startsWith('data:image/jpeg'),'Recognition requires explicit action and sends only selected JPEG and context');
  check(st.meals.length===1&&!!document.getElementById('foodForm'),'AI fills a review form without creating a meal');
  document.getElementById('foodForm').elements.grams.value='150';document.getElementById('foodForm').elements.grams.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('foodForm').requestSubmit();
  check(st.meals.length===2&&st.meals[1].kcal===250&&st.meals[1].photo,'Confirm saves scaled nutrition with the photo exactly once');
  check(mealCapture.photo===''&&!document.getElementById('foodForm'),'Successful check-in clears the current photo and review');
  const before=JSON.stringify(st.meals),packet=createBackupPacket();restoreBackupPacket(packet,{confirm:false});check(JSON.stringify(st.meals)===before,'Photo and old-style diet records survive complete backup restore');
  go('food');await choose();fail=true;click('[data-action="meal-photo-recognize"]');await settle(()=>mealCapture.status==='error');check(!!mealCapture.photo&&st.meals.length===2,'Failed recognition retains photo and does not fabricate a record');fail=false;
  click('[data-action="nutrition-mode"][data-mode="free"]');check(!!document.getElementById('foodSearch'),'Manual search remains available as a fallback');
  document.querySelector('[data-action="food-pick"]').click();document.getElementById('foodForm').requestSubmit();check(st.meals.length===3&&st.meals[2].photo&&nutritionMode==='photo','Manual fallback can save the same selected photo with confirmed food');
  await choose();hold=true;click('[data-action="meal-photo-recognize"]');await settle(()=>!!complete);click('[data-action="meal-photo-remove"]');await choose('mealCameraInput');complete(new Response(JSON.stringify({...reply,name:'旧图结果禁止使用'})));await pause();await pause();hold=false;
  check(!mealCapture.result&&!mealCapture.pending&&!!mealCapture.photo,'Changing the image discards the old response even if transport ignores abort');
  check(st.meals.length===3,'Image changes and late responses never silently save meals');
  click('[data-action="meal-photo-view"]');check(!!document.querySelector('.fit-image-dialog img'),'Saved meal photo opens in an accessible full-screen viewer');document.querySelector('.fit-image-dialog button').click();
  check(!document.querySelector('.fit-image-dialog'),'Full-screen meal photo viewer closes without altering records');
  click('[data-action="meal-photo-remove"]');go('workout');click('[data-action="exercise-check"]');check(st.history.length===0&&progress().index===0,'Workout checks still do not advance the rolling training day');
  go('food');check(document.documentElement.scrollWidth<=innerWidth,'Photo capture page fits the mobile width');window.scrollTo(0,0);
  return {passed:checks.length,checks,realAIRequests:0,method:'Real browser image decoding and DOM; model responses simulated, no Android camera device'};
 }finally{window.confirm=originalConfirm}
})()
