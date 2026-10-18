(async()=>{
 const result=[],check=(value,label)=>{if(!value)throw Error(label);result.push(label)};
 const delay=()=>new Promise(resolve=>setTimeout(resolve,0));
 const settle=async pred=>{for(let i=0;i<100;i++){if(pred())return;await delay()}throw Error('UI did not settle')};
 const native={enabled:false,keyConfigured:true,model:'qwen-plus',visionModel:'qwen3-vl-plus',dailyLimit:10,callsUsedToday:0,callsRemainingToday:10};
 const calls={settings:0,requests:[]},originalFetch=window.fetch.bind(window),originalConfirm=window.confirm;
 window.confirm=()=>true;st=defaultState();save();
 window.FitMobile={native:true,aiSupported:true,storage:{ok:true},readAIStatus:()=>({...native}),queuePersist:()=>({ok:true})};
 window.QinglianAndroid={showAISettings(){calls.settings++},setAIEnabled(value){native.enabled=value;return JSON.stringify(native)},exportBackup(){},readPreviousState:()=>''};
 let pending=null,hold=false;
 window.fetch=async(url,options={})=>{
  if(url==='/api/food-ai-control'){const enabled=JSON.parse(options.body).enabled;native.enabled=enabled;return new Response(JSON.stringify({enabled,token:enabled?'browser-fixture-token':null}))}
  if(['/api/chat','/api/food-photo','/api/ai-test'].includes(url)){
   if(!native.enabled)return new Response('{"error":"AI off"}',{status:403});
   calls.requests.push({url,body:JSON.parse(options.body||'{}')});native.callsUsedToday++;native.callsRemainingToday--;
   if(hold)return new Promise(resolve=>{pending=resolve});
   return new Response(JSON.stringify(url==='/api/food-photo'?{name:'测试鸡肉饭',grams:300,kcal:500,protein:30,carbs:60,fat:15,low:400,high:650,note:'估算待确认',ingredients:['米饭','鸡肉'],cooking:'炒制'}:{answer:'模拟千问回复'}));
  }
  return originalFetch(url,options);
 };
 (0,eval)(await originalFetch('/mobile-app.js').then(r=>r.text()));
 (0,eval)(await originalFetch('/mobile-ai.js').then(r=>r.text()));
 const go=name=>{tab=name;render()},click=selector=>{const node=document.querySelector(selector);if(!node)throw Error('Missing '+selector);node.click()};
 try{
  go('ai');check(!st.settings.ai&&!document.getElementById('aiToggle').checked&&calls.requests.length===0,'Mobile AI starts off without a request');
  check(document.body.innerText.includes('配置密钥与接口')&&!document.body.innerText.includes('电脑测试版'),'Mobile AI exposes native settings without desktop commands');
  click('[data-fit-ai="settings"]');check(calls.settings===1,'Configure button opens the native settings bridge');
  click('#aiToggle');check(st.settings.ai&&native.enabled,'User enable synchronizes native and app state');
  click('[data-fit-ai="test"]');await settle(()=>!document.querySelector('[data-fit-ai="test"]').disabled);
  check(calls.requests.length===1&&calls.requests[0].url==='/api/ai-test','Explicit connection test uses one shared call');
  document.getElementById('chatInput').value='测试问题';document.getElementById('chatForm').requestSubmit();await settle(()=>!aiBusy);
  check(st.chat.at(-1).text==='模拟千问回复','Chat shows a response after explicit submit');
  check(calls.requests[1].body.question==='测试问题'&&!JSON.stringify(calls.requests[1]).includes('meals'),'Chat sends only the question, not all saved records');
  hold=true;document.getElementById('chatInput').value='稍后回复';document.getElementById('chatForm').requestSubmit();await settle(()=>!!pending);click('#aiToggle');
  pending(new Response('{"answer":"迟到结果不可保存"}'));await delay();await delay();hold=false;
  check(!st.chat.some(x=>x.text==='迟到结果不可保存')&&!st.settings.ai,'Switching off discards a late response');
  const packet=createBackupPacket();packet.state.settings.ai=true;restoreBackupPacket(packet,{confirm:false});check(!st.settings.ai&&!native.enabled,'Restoring an AI-enabled record backup cannot enable native AI');
  go('food');nutritionMode='free';render();document.querySelector('[data-action="food-weight"][data-grams="200"]').click();document.getElementById('foodForm').requestSubmit();
  check(st.meals.length===1&&st.meals[0].kcal===232,'Free meal recording works while AI is off');
  nutritionMode='ai';render();check(!!document.getElementById('enhancedFoodForm'),'Food enhancement form is available in the new mobile version');
  click('#foodAIToggle');await settle(()=>foodAIEnabled());
  check(native.enabled&&!!nutritionConsent,'Explicit food enhancement issues a session consent token');
  const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;canvas.getContext('2d').fillRect(0,0,20,20);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg')),file=new File([blob],'fixture.jpg',{type:'image/jpeg'}),data=new DataTransfer();data.items.add(file);
  document.querySelector('#enhancedFoodForm input[type=file]').files=data.files;document.getElementById('enhancedFoodForm').requestSubmit();await settle(()=>!nutritionBusy);
  check(calls.requests.at(-1).url==='/api/food-photo'&&calls.requests.at(-1).body.paidConsent===true,'Food analysis sends only an explicitly selected image and consent');
  check(st.meals.length===1&&nutritionSelected.name==='测试鸡肉饭','AI analysis fills a draft and does not save a meal');
  document.getElementById('foodForm').requestSubmit();check(st.meals.length===2&&st.meals.at(-1).food==='测试鸡肉饭','Meal saves only after user submits the confirmation form');
  check(!JSON.stringify(createBackupPacket()).includes('sealedKey'),'Training backup has no native encrypted key field');
  go('workout');click('[data-action="exercise-check"]');check(progress().index===0&&st.history.length===0,'Action check still cannot advance the training day');
  check(document.querySelectorAll('.exercise-card').length===6||document.body.innerText.includes('杠铃平板卧推'),'Default training and reviewed exercises remain available');
  go('ai');window.scrollTo(0,0);
  check(document.documentElement.scrollWidth<=innerWidth,'AI UI fits the phone viewport without horizontal overflow');
  return {passed:result.length,results:result,realAIRequests:0,method:'Browser with a simulated native bridge; not a real Android device'};
 }finally{window.confirm=originalConfirm}
})()
