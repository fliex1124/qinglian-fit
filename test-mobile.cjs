'use strict';
// Independent Node VM contract tests. All storage, timers and Android methods
// are in-memory stubs; the original asset fetch is also a stub, never a network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'mobile-bootstrap.js'),'utf8');
const KEY='qinglian_fit_v01';
const state=()=>({plans:[{id:'starter',days:[{name:'训练',exercises:[['动作',4,'8–12']]}]}],
  selected:'starter',progress:{starter:{index:0,choice:false,restDate:null,session:{checks:{},inputs:{},cardio:''}}},
  settings:{ai:false},history:[],meals:[],weights:[],photos:[],chat:[]});
function environment(options={}){
  const origin=options.origin||'https://appassets.androidplatform.net',url=new URL(origin+'/index.html');
  const values=new Map(options.initial||[]),writes=[],events=[],classes=[],assetCalls=[],bridgeCalls=[],timers=new Map();
  let timerId=0;
  const originalFetch=async function(input,fetchOptions){assetCalls.push({input,options:fetchOptions});return new Response('fixture asset',{status:200});};
  const bridge={
    readState(){bridgeCalls.push({method:'readState'});return options.recoveryRaw??'';},
    storageInfo(){bridgeCalls.push({method:'storageInfo'});return options.storageInfo??JSON.stringify({savedAt:'2026-10-18T00:00:00Z',bytes:123,hasPrevious:false});},
    writeState(raw){bridgeCalls.push({method:'writeState',raw});if(options.writeError)throw Error(options.writeError);return options.writeResult??JSON.stringify({ok:true,savedAt:'2026-10-18T01:00:00Z'});},
    startBarcodeLookup(id,code){bridgeCalls.push({method:'startBarcodeLookup',id,code});if(options.barcodeError)throw Error(options.barcodeError);},
  };
  const ctx={console,URL,Response,Request,DOMException,Date,JSON,Map,Promise,Error,
    location:{protocol:url.protocol,hostname:url.hostname,origin:url.origin,href:url.href},
    fetch:originalFetch,QinglianAndroid:options.bridge===false?undefined:bridge,
    document:{documentElement:{classList:{add(value){classes.push(value);}}}},
    localStorage:{getItem(key){return values.has(key)?values.get(key):null;},setItem(key,value){values.set(key,String(value));writes.push({key,value:String(value)});}},
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
    CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
    dispatchEvent(event){events.push(event);return true;},
  };
  ctx.window=ctx;
  if(options.packetState)ctx.createBackupPacket=()=>({app:'qinglian-fit',state:options.packetState});
  vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'mobile-bootstrap.js'});
  return {ctx,values,writes,events,classes,assetCalls,bridgeCalls,timers,originalFetch,bridge};
}
const count=(e,method)=>e.bridgeCalls.filter(call=>call.method===method).length;
const calls=(e,method)=>e.bridgeCalls.filter(call=>call.method===method);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let passed=0,failed=0;
async function test(name,body){try{await body();passed++;console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,'\n ',error.stack||error);}}
function barcodeRequest(e,code='3017620422003',extra={}){
  const promise=e.ctx.fetch('/api/barcode',{method:'POST',body:JSON.stringify({barcode:code}),...extra});
  return {promise,call:calls(e,'startBarcodeLookup').at(-1)};
}

(async()=>{
  await test('desktop browser preserves the original fetch and existing data without reading Android recovery',()=>{
    const raw=JSON.stringify(state()),e=environment({origin:'http://127.0.0.1:8788',initial:[[KEY,raw]]});
    assert.equal(e.ctx.FitMobile.native,false);assert.equal(e.ctx.fetch,e.originalFetch);assert.equal(e.values.get(KEY),raw);
    assert.equal(e.writes.length,0);assert.equal(e.bridgeCalls.length,0);assert.equal(e.classes.length,0);
  });
  await test('a browser without the Android bridge is untouched even on the asset hostname',()=>{
    const e=environment({bridge:false});assert.equal(e.ctx.FitMobile.native,false);assert.equal(e.ctx.fetch,e.originalFetch);assert.equal(e.writes.length,0);
  });
  await test('an empty Android WebView restores the private mirror before the app loads',()=>{
    const raw=JSON.stringify(state()),e=environment({recoveryRaw:raw});
    assert.equal(e.ctx.FitMobile.native,true);assert.equal(e.ctx.FitMobile.recovered,true);assert.equal(e.values.get(KEY),raw);
    assert.equal(count(e,'readState'),1);assert.equal(e.writes.length,1);assert.deepEqual(e.classes,['fit-native']);
  });
  await test('existing WebView KEY stays authoritative and is never replaced by a mirror',()=>{
    const original='existing raw content',e=environment({initial:[[KEY,original]],recoveryRaw:JSON.stringify(state())});
    assert.equal(e.values.get(KEY),original);assert.equal(count(e,'readState'),0);assert.equal(e.writes.length,0);assert.equal(e.ctx.FitMobile.recovered,undefined);
  });
  await test('invalid recovery JSON is reported and never written over the empty WebView',()=>{
    for(const raw of ['not json','null','{}',JSON.stringify({...state(),meals:'wrong'})]){
      const e=environment({recoveryRaw:raw});assert.equal(e.values.has(KEY),false);assert.equal(e.ctx.FitMobile.storage.ok,false);assert.ok(e.ctx.FitMobile.storage.error);
    }
  });
  await test('an explicit native storageInfo failure remains visible',()=>{
    const e=environment({storageInfo:JSON.stringify({ok:false,error:'镜像状态不可读取'})});
    assert.equal(e.ctx.FitMobile.storage.ok,false);assert.equal(e.ctx.FitMobile.storage.error,'镜像状态不可读取');
  });
  await test('queuePersist writes the supplied mirror, emits status, and never changes browser KEY',()=>{
    const e=environment(),input=state();input.meals.push({food:'fixture'});const before=JSON.stringify(input);
    const result=e.ctx.FitMobile.queuePersist(input),written=JSON.parse(calls(e,'writeState')[0].raw);
    assert.deepEqual(written,input);assert.equal(result.ok,true);assert.equal(e.values.has(KEY),false);
    assert.equal(e.events.at(-1).type,'fit-native-storage');assert.equal(e.events.at(-1).detail.ok,true);
    assert.equal(JSON.stringify(input),before);
  });
  await test('queuePersist prefers the paused backup snapshot over a running live clock',()=>{
    const live=state();live.progress.starter.session.cardioClock={elapsedMs:1000,runningSince:123};
    const snapshot=structuredClone(live);snapshot.progress.starter.session.cardioClock={elapsedMs:2000,runningSince:null};
    const e=environment({packetState:snapshot});e.ctx.FitMobile.queuePersist(live);
    assert.deepEqual(JSON.parse(calls(e,'writeState')[0].raw),snapshot);
    assert.equal(live.progress.starter.session.cardioClock.runningSince,123);
  });
  await test('native write failures are returned and signalled without touching WebView data',()=>{
    for(const options of [{writeResult:'{"ok":false,"error":"空间不足"}'},{writeError:'native failure'}]){
      const e=environment(options),result=e.ctx.FitMobile.queuePersist(state());
      assert.equal(result.ok,false);assert.ok(result.error);assert.equal(e.events.at(-1).detail.ok,false);assert.equal(e.writes.length,0);
    }
  });
  await test('malformed or non-object writeState results become explicit storage failures',()=>{
    for(const raw of ['not json','null','[]','42']){
      const e=environment({writeResult:raw}),result=e.ctx.FitMobile.queuePersist(state());
      assert.equal(result?.ok,false);assert.ok(result?.error);
    }
  });
  await test('barcode lookup is asynchronous and uses the Java callback contract without original fetch',async()=>{
    const e=environment(),request=barcodeRequest(e);let settled=false;request.promise.then(()=>{settled=true;});
    await tick();assert.equal(settled,false);assert.equal(request.call.code,'3017620422003');assert.ok(request.call.id.startsWith('barcode-'));
    const product={found:true,product:{name:'fixture',basis:'100g',requiresUnitConfirmation:true}};
    e.ctx.fitNativeBarcodeResult(request.call.id,JSON.stringify(product));
    const response=await request.promise;assert.equal(response.status,200);assert.deepEqual(await response.json(),product);
    assert.equal(e.timers.size,0);assert.equal(e.assetCalls.length,0);
  });
  await test('unknown callback IDs cannot consume or resolve the active barcode lookup',async()=>{
    const e=environment(),request=barcodeRequest(e);e.ctx.fitNativeBarcodeResult('unrelated','{"found":false}');assert.equal(e.timers.size,1);
    e.ctx.fitNativeBarcodeResult(request.call.id,'{"found":false,"message":"未收录"}');assert.equal((await request.promise).status,200);
  });
  await test('invalid JSON and null/array/primitive barcode replies resolve a clear 503 instead of hanging',async()=>{
    for(const raw of ['not json','null','[]','42','"text"','true']){
      const e=environment(),request=barcodeRequest(e);let response;
      request.promise.then(value=>{response=value;});
      assert.doesNotThrow(()=>e.ctx.fitNativeBarcodeResult(request.call.id,raw),`Callback threw for ${raw}`);
      await tick();assert.ok(response,`Callback left its promise pending for ${raw}`);assert.equal(response.status,503);
      assert.ok((await response.json()).error);assert.equal(e.assetCalls.length,0);
    }
  });
  await test('native barcode errors and bridge exceptions do not leak pending timers',async()=>{
    const e=environment(),request=barcodeRequest(e);e.ctx.fitNativeBarcodeResult(request.call.id,'{"error":"联网失败"}');
    assert.equal((await request.promise).status,503);assert.equal(e.timers.size,0);
    const broken=environment({barcodeError:'bridge unavailable'});
    await assert.rejects(barcodeRequest(broken).promise,/bridge unavailable/);assert.equal(broken.timers.size,0);
  });
  await test('barcode timeout rejects and an already-aborted request never calls Java',async()=>{
    const e=environment(),request=barcodeRequest(e);const rejection=assert.rejects(request.promise,/超时/);
    const timer=[...e.timers.values()][0];assert.equal(timer.ms,18000);timer.fn();await rejection;
    const aborted=environment(),controller=new AbortController();controller.abort();
    await assert.rejects(barcodeRequest(aborted,'3017620422003',{signal:controller.signal}).promise,error=>error.name==='AbortError');
    assert.equal(count(aborted,'startBarcodeLookup'),0);assert.equal(aborted.assetCalls.length,0);
  });
  await test('chat, photo AI and local food routes always return explicit 503 without network or native lookup',async()=>{
    const e=environment();
    for(const endpoint of ['/api/chat','/api/food-photo','/api/local-food']){
      const response=await e.ctx.fetch(endpoint,{method:'POST',body:'{"image":"synthetic"}'});
      assert.equal(response.status,503);assert.ok((await response.json()).error);
    }
    assert.equal(e.assetCalls.length,0);assert.equal(count(e,'startBarcodeLookup'),0);
  });
  await test('AI control cannot enable paid AI and can explicitly return the off state',async()=>{
    const e=environment();
    const enabled=await e.ctx.fetch('/api/food-ai-control',{method:'POST',body:'{"enabled":true}'});assert.equal(enabled.status,503);
    const disabled=await e.ctx.fetch('/api/food-ai-control',{method:'POST',body:'{"enabled":false}'});assert.equal(disabled.status,200);
    assert.deepEqual(await disabled.json(),{enabled:false,token:null});assert.equal(e.assetCalls.length,0);
    const status=await(await e.ctx.fetch('/api/status')).json();assert.equal(status.keyConfigured,false);assert.equal(status.callsRemainingToday,0);
    const local=await(await e.ctx.fetch('/api/local-food/status')).json();assert.equal(local.ready,false);
  });
  await test('local picture and packaged asset fetch retain their original inputs and options',async()=>{
    const e=environment(),options={cache:'no-cache'},url='/assets/exercises/fixture.jpg';
    const response=await e.ctx.fetch(url,options);assert.equal(await response.text(),'fixture asset');assert.equal(e.assetCalls[0].input,url);assert.equal(e.assetCalls[0].options,options);
    const request=new Request('https://appassets.androidplatform.net/roman-chair-reference.jpg');await e.ctx.fetch(request);
    assert.equal(e.assetCalls[1].input,request);assert.equal(count(e,'startBarcodeLookup'),0);
  });
  console.log(`${passed} mobile bootstrap groups passed; ${failed} failed; real network calls: 0`);
  if(failed)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
