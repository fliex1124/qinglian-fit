"use strict";
// All Android methods and fetch are synthetic. No Key is stored and no network is used.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const boot=fs.readFileSync(path.join(__dirname,'mobile-bootstrap.js'),'utf8');
function environment({desktop=false}={}){
 const calls=[],timers=new Map();let next=0;
 const status={enabled:false,keyConfigured:true,model:'qwen-plus',visionModel:'qwen3-vl-plus',dailyLimit:10,callsUsedToday:0,callsRemainingToday:10};
 const bridge={readState:()=>'',storageInfo:()=>'{"ok":true}',getAIStatus:()=>JSON.stringify(status),
  foodAIControl(enabled){calls.push({kind:'control',enabled});status.enabled=enabled;return JSON.stringify({enabled,token:enabled?'synthetic-token':null});},
  startAIRequest(id,pathname,raw,token){calls.push({id,path:pathname,raw,token,kind:'start'});},cancelAIRequest(id){calls.push({id,kind:'cancel'});}};
 const url=new URL(desktop?'http://127.0.0.1:8788/index.html':'https://appassets.androidplatform.net/index.html');
 const originalFetch=async()=>{throw Error('Unexpected real fetch')};
 const ctx=vm.createContext({URL,Response,Headers,DOMException,AbortController,Date,JSON,Map,Promise,Error,console,
  location:{protocol:url.protocol,hostname:url.hostname,origin:url.origin,href:url.href},QinglianAndroid:bridge,fetch:originalFetch,
  document:{documentElement:{classList:{add(){}}}},localStorage:{getItem:()=>null,setItem(){throw Error('No storage fixture should write')}},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},dispatchEvent(){},
  setTimeout(fn,ms){timers.set(++next,{fn,ms});return next},clearTimeout(id){timers.delete(id)}});
 ctx.window=ctx;vm.runInContext(boot,ctx);return {ctx,calls,timers,status,bridge,originalFetch};
}
let passed=0;async function test(name,fn){await fn();console.log('PASS',name);passed++;}
function request(e,path='/api/chat',options={}){const promise=e.ctx.fetch(path,{method:'POST',body:JSON.stringify({question:'test'}),...options});return {promise,call:e.calls.filter(x=>x.kind==='start').at(-1)};}
function answer(e,call,body={answer:'mock answer'},status=200){e.ctx.fitNativeAIResult(call.id,status,JSON.stringify(body));}
const fixture=fs.readFileSync(path.join(__dirname,'verify.cjs'),'utf8');
const create=new Function('require','__dirname',fixture.slice(0,fixture.indexOf('let checks=0'))+';return {ctx,run,plain,listeners,nodes};');
function frontend(){
 const e=create(require,__dirname),events={},status={enabled:false,keyConfigured:true,model:'qwen-plus',visionModel:'qwen3-vl-plus',dailyLimit:10,callsUsedToday:0,callsRemainingToday:10},calls=[];
 e.ctx.AbortController=AbortController;e.ctx.window.addEventListener=(name,fn)=>(events[name]??=[]).push(fn);
 e.ctx.window.FitMobile={native:true,aiSupported:true,readAIStatus:()=>({...status})};
 e.ctx.window.QinglianAndroid={setAIEnabled(value){calls.push(value);status.enabled=value;return JSON.stringify(status)},showAISettings(){calls.push('settings')}};
 e.ctx.document.getElementById('app').insertAdjacentHTML=function(_position,html){this.innerHTML+=html};
 e.ctx.fetch=async()=>{throw Error('Unexpected network')};
 e.run('st.settings.ai=true');e.run(fs.readFileSync(path.join(__dirname,'mobile-ai.js'),'utf8'));
 return {...e,events,status,calls,toggle(value){e.listeners.change.at(-1)({target:{id:'aiToggle',checked:value},stopImmediatePropagation(){}})}};
}
(async()=>{
 await test('desktop leaves fetch and Android methods untouched',()=>{const e=environment({desktop:true});assert.equal(e.ctx.fetch,e.originalFetch);assert.equal(e.calls.length,0)});
 await test('status reads native off state without dispatch or timers',async()=>{const e=environment(),s=await(await e.ctx.fetch('/api/status')).json();assert.equal(s.enabled,false);assert.equal(s.callsRemainingToday,10);assert.equal(e.calls.length,0);assert.equal(e.timers.size,0)});
 await test('chat uses only explicit asynchronous bridge and cleans callback timer',async()=>{const e=environment(),r=request(e);assert.equal(r.call.path,'/api/chat');assert.equal(JSON.parse(r.call.raw).question,'test');answer(e,r.call);assert.equal((await(await r.promise).json()).answer,'mock answer');assert.equal(e.timers.size,0)});
 await test('photo carries native-issued consent header and only selected payload',async()=>{const e=environment();const c=await(await e.ctx.fetch('/api/food-ai-control',{body:'{"enabled":true}'})).json();const r=request(e,'/api/food-photo',{headers:{'X-Fit-Food-Consent':c.token},body:'{"image":"synthetic","context":"fixture","paidConsent":true}'});assert.equal(r.call.token,'synthetic-token');assert.equal(JSON.parse(r.call.raw).paidConsent,true);answer(e,r.call,{name:'mock food'});assert.equal((await(await r.promise).json()).name,'mock food')});
 await test('invalid switch types cannot enable native AI',async()=>{const e=environment();const r=await e.ctx.fetch('/api/food-ai-control',{body:'{"enabled":"true"}'});assert.equal(r.status,400);assert.equal(e.calls.length,0)});
 await test('native API errors remain failures with no automatic retry',async()=>{const e=environment(),r=request(e);answer(e,r.call,{error:'quota reached'},400);assert.equal((await r.promise).ok,false);assert.equal(e.calls.filter(x=>x.kind==='start').length,1)});
 await test('malformed and unknown callbacks never report successful recognition',async()=>{const e=environment(),r=request(e);e.ctx.fitNativeAIResult('unknown',200,'{}');assert.equal(e.timers.size,1);e.ctx.fitNativeAIResult(r.call.id,503,'not json');assert.ok((await(await r.promise).json()).error);assert.equal(e.timers.size,0)});
 await test('bodyless or invalid callback status becomes a clean failure',async()=>{for(const status of [204,205,304,0,999]){const e=environment(),r=request(e);e.ctx.fitNativeAIResult(r.call.id,status,'{}');assert.equal((await r.promise).status,503);assert.equal(e.timers.size,0)}});
 await test('already-aborted work does not reach Android',async()=>{const e=environment(),abort=new AbortController();abort.abort();await assert.rejects(e.ctx.fetch('/api/chat',{signal:abort.signal}),{name:'AbortError'});assert.equal(e.calls.length,0)});
 await test('abort rejects immediately and cancels native request, late callback ignored',async()=>{const e=environment(),abort=new AbortController(),r=request(e,'/api/chat',{signal:abort.signal});abort.abort();await assert.rejects(r.promise,{name:'AbortError'});assert.equal(e.calls.at(-1).kind,'cancel');answer(e,r.call);assert.equal(e.timers.size,0)});
 await test('confirmation timeout cancels native request without retry',async()=>{const e=environment(),r=request(e);[...e.timers.values()][0].fn();await assert.rejects(r.promise,/超时/);assert.equal(e.calls.at(-1).kind,'cancel');answer(e,r.call);assert.equal(e.timers.size,0)});
 await test('connection test shares explicit bridge path',async()=>{const e=environment(),r=request(e,'/api/ai-test',{body:'{}'});assert.equal(r.call.path,'/api/ai-test');answer(e,r.call);await r.promise});
 await test('legacy imported AI=true cannot enable native on startup or render',()=>{const e=frontend();assert.equal(e.run('st.settings.ai'),false);e.run('st.settings.ai=true;render()');assert.equal(e.run('st.settings.ai'),false);assert.equal(e.calls.length,0)});
 await test('native chat UI has config, quota and clear cost text',()=>{const e=frontend();e.run("tab='ai';render()");const html=e.nodes.get('app').innerHTML;assert.ok(html.includes('配置密钥与接口'));assert.ok(html.includes('测试连接（占用1次）'));assert.ok(!html.includes('电脑测试版'));assert.ok(!html.includes('免费 · 本地模式'));assert.ok(html.indexOf('配置密钥与接口')<html.indexOf('chatForm'));assert.ok(!html.includes('API Key（留空'))});
 await test('off chat never requests network or changes history',async()=>{const e=frontend();await e.run("callAI('fixture')");assert.equal(e.run('st.chat.length'),0)});
 await test('explicit toggle enables native and synchronizes record setting',()=>{const e=frontend();e.toggle(true);assert.equal(e.status.enabled,true);assert.equal(e.run('st.settings.ai'),true);e.toggle(false);assert.equal(e.run('st.settings.ai'),false)});
 await test('successful native chat saves response only while enabled',async()=>{const e=frontend();e.toggle(true);e.ctx.fetch=async()=>({ok:true,json:async()=>({answer:'synthetic answer'})});await e.run("callAI('fixture')");assert.equal(e.run('st.chat.at(-1).text'),'synthetic answer')});
 await test('closing AI discards late answer even if transport ignores abort',async()=>{const e=frontend();e.toggle(true);let complete;e.ctx.fetch=()=>new Promise(resolve=>{complete=resolve});const p=e.run("callAI('fixture')");e.toggle(false);complete({ok:true,json:async()=>({answer:'must not save'})});await p;assert.equal(e.run('st.chat.some(x=>x.text===\'must not save\')'),false);assert.equal(e.run('aiBusy'),false)});
 await test('changing native configuration clears consent and discards late answer',async()=>{const e=frontend();e.toggle(true);let complete;e.ctx.fetch=()=>new Promise(resolve=>{complete=resolve});const p=e.run("callAI('fixture')");e.status.enabled=false;e.events['fit-native-ai-settings'][0]();complete({ok:true,json:async()=>({answer:'must not save'})});await p;assert.equal(e.run('st.chat.length'),1);assert.equal(e.run('nutritionConsent'),null)});
 console.log(`${passed} personal mobile AI groups passed; real network calls: 0`);
})().catch(error=>{console.error(error);process.exitCode=1});
