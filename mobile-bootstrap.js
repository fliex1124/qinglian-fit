'use strict';

// Runs before the existing app. The desktop browser follows its original path.
(function () {
  const bridge = window.QinglianAndroid;
  const native = !!bridge && location.protocol === 'https:' && location.hostname === 'appassets.androidplatform.net';
  const KEY = 'qinglian_fit_v01';
  const mobile = window.FitMobile = {native, version:'0.7.0', storage:{ok:true}};
  if (!native) return;
  document.documentElement.classList.add('fit-native');
  function parse(raw, fallback) {try {return JSON.parse(raw);} catch (_) {return fallback;}}
  function objectResult(raw,fallback) {const value=parse(raw,null);return value&&typeof value==='object'&&!Array.isArray(value)?value:fallback;}
  function basicState(value) {
    return value && Array.isArray(value.plans) && value.plans.length && value.progress && value.settings &&
      ['history','meals','weights','photos','chat'].every(key => Array.isArray(value[key]));
  }
  try {
    // Existing WebView storage remains authoritative. The private mirror is a recovery copy.
    if (localStorage.getItem(KEY) === null) {
      const raw = bridge.readState();
      if (raw) {
        if (!basicState(parse(raw,null))) throw Error('本机安全副本格式异常，请在设置中恢复备份。');
        localStorage.setItem(KEY,raw);
        mobile.recovered = true;
      }
    }
    mobile.storage = {ok:true,...objectResult(bridge.storageInfo(),{ok:false,error:'无法读取手机安全副本状态'})};
  } catch (error) {mobile.storage={ok:false,error:error.message};}

  mobile.queuePersist = function (state) {
    try {
      // A disaster-recovery mirror is paused, so restoring it cannot count an absent interval.
      const snapshot = typeof createBackupPacket === 'function' ? createBackupPacket().state : state;
      mobile.storage=objectResult(bridge.writeState(JSON.stringify(snapshot)),{ok:false,error:'手机安全副本未写入'});
      if(typeof mobile.storage.ok!=='boolean')mobile.storage={ok:false,error:'手机安全副本状态异常，请导出备份。'};
    } catch (error) {mobile.storage={ok:false,error:error.message};}
    window.dispatchEvent(new CustomEvent('fit-native-storage',{detail:mobile.storage}));
    return mobile.storage;
  };

  mobile.aiSupported=typeof bridge.getAIStatus==='function' && typeof bridge.startAIRequest==='function';
  mobile.readAIStatus=function(){
    return mobile.aiSupported?objectResult(bridge.getAIStatus(),{enabled:false,keyConfigured:false,error:'无法读取AI状态'}):{enabled:false,keyConfigured:false};
  };
  const aiPending=new Map();let nextAI=0;
  mobile.requestAI=function(path,body={},options={}){
    if(!mobile.aiSupported)return json(503,{error:'请安装支持个人AI的新版本。'});
    if(options.signal?.aborted)return Promise.reject(new DOMException('请求已取消','AbortError'));
    return new Promise((resolve,reject)=>{
      const id='ai-'+Date.now()+'-'+(++nextAI);
      const finish=(value,error)=>{
        const item=aiPending.get(id);if(!item)return;
        aiPending.delete(id);clearTimeout(item.timer);options.signal?.removeEventListener('abort',abort);
        if(error)reject(error);else resolve(value);
      };
      const abort=()=>{finish(null,new DOMException('请求已取消','AbortError'));try{bridge.cancelAIRequest(id);}catch(_){}};
      const timer=setTimeout(()=>{finish(null,Error('AI确认或请求超时，已停止接收结果；已发出的请求可能计费。'));try{bridge.cancelAIRequest(id);}catch(_){}},180000);
      aiPending.set(id,{timer,finish});options.signal?.addEventListener('abort',abort,{once:true});
      try{bridge.startAIRequest(id,path,typeof body==='string'?body:JSON.stringify(body),options.token||'');}
      catch(error){finish(null,error);}
    });
  };
  window.fitNativeAIResult=function(id,status,raw){
    const item=aiPending.get(id);if(!item)return;
    const body=objectResult(raw,{error:'AI结果格式不正确，请继续手动记录。'});
    const code=[200,400,403,429,499,502,503,504].includes(status)?status:503;
    item.finish(new Response(JSON.stringify(body),{status:code,headers:{'Content-Type':'application/json'}}));
  };
  window.fitNativeAISettingsResult=function(raw){window.dispatchEvent(new CustomEvent('fit-native-ai-settings',{detail:objectResult(raw,{enabled:false,keyConfigured:false})}));};

  const originalFetch = window.fetch.bind(window), pending = new Map();
  let nextRequest = 0;
  window.fitNativeBarcodeResult = function (requestId,raw) {
    const request=pending.get(requestId);if(!request)return;
    clearTimeout(request.timer);pending.delete(requestId);
    const result=objectResult(raw,{error:'条码结果格式不正确，请按包装手填。'});
    request.resolve(new Response(JSON.stringify(result),{status:result.error?503:200,headers:{'Content-Type':'application/json'}}));
  };
  function json(status,data) {return Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));}
  window.fetch = function (input,options={}) {
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin!==location.origin || !url.pathname.startsWith('/api/'))return originalFetch(input,options);
    if(url.pathname==='/api/status'&&mobile.aiSupported)return json(200,mobile.readAIStatus());
    if(url.pathname==='/api/status')return json(200,{keyConfigured:false,mobile:true,callsRemainingToday:0,budgetNote:'安卓首版未接入付费AI，免费记录可独立使用。'});
    if(url.pathname==='/api/local-food/status')return json(200,{ready:false,localOnly:true,message:'此安装版尚未内置图片模型，请手动搜索食物。'});
    if(url.pathname==='/api/barcode') {
      const body=parse(options.body,{}),id='barcode-'+Date.now()+'-'+(++nextRequest);
      if(options.signal?.aborted)return Promise.reject(new DOMException('请求已取消','AbortError'));
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);reject(Error('免费条码查询超时，请手动填写或稍后重试。'));},18000);
        pending.set(id,{resolve,reject,timer});
        try {bridge.startBarcodeLookup(id,String(body.barcode||''));}
        catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
      });
    }
    if(mobile.aiSupported && ['/api/chat','/api/food-photo','/api/ai-test'].includes(url.pathname)) {
      const headers=new Headers(options.headers||{});
      return mobile.requestAI(url.pathname,options.body||'{}',{signal:options.signal,token:headers.get('X-Fit-Food-Consent')||''});
    }
    if(url.pathname==='/api/food-ai-control'&&mobile.aiSupported){
      const body=parse(options.body,{});
      if(typeof body.enabled!=='boolean')return json(400,{error:'AI开关格式不正确'});
      try {const result=objectResult(bridge.foodAIControl(body.enabled),{error:'无法修改AI增强开关'});return json(result.error?403:200,result);}
      catch(_){return json(503,{error:'无法修改AI增强开关'});}
    }
    if(url.pathname==='/api/food-ai-control') {
      const body=parse(options.body,{});
      return body.enabled?json(503,{error:'安卓首版尚未接入付费AI，未调用模型。请使用免费记录。'}):json(200,{enabled:false,token:null});
    }
    if(url.pathname==='/api/local-food')return json(503,{error:'此安装版尚未内置图片模型，请使用免费食物搜索；没有上传照片或调用付费模型。'});
    return json(503,{error:'安卓首版尚未接入此AI功能，未调用付费模型。训练和饮食记录仍可独立使用。'});
  };
})();
