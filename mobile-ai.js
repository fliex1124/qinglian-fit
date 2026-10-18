"use strict";

// Personal Android AI: only non-secret status and business results cross the bridge.
(function(){
  const mobile=window.FitMobile,bridge=window.QinglianAndroid;
  if(!mobile?.native||!mobile.aiSupported)return;
  let chatEpoch=0,chatAbort=null,testBusy=false;
  const originalRender=render;
  function stopChat(){chatEpoch++;chatAbort?.abort();chatAbort=null;aiBusy=false;}
  function sync(){
    const info=mobile.readAIStatus();st.settings.ai=!!info.enabled;
    if(!info.enabled){nutritionConsent=null;nutritionAbort?.abort();}
    return info;
  }
  function controlCard(info){
    return `<section class="card spaced"><h2>手机 AI 设置</h2><p class="${info.keyConfigured?'note':'warning'}">${info.keyConfigured?'本机已保存加密密钥':'尚未配置密钥'} · ${info.enabled?'AI已开启':'AI已关闭'}</p><p class="muted small">聊天模型：${esc(info.model||'qwen-plus')}<br>图片模型：${esc(info.visionModel||'qwen3-vl-plus')}<br>今日已用 ${n(info.callsUsedToday)} / ${n(info.dailyLimit)} 次，剩余 ${n(info.callsRemainingToday)} 次。</p><div class="row wrap spaced"><button class="btn" data-fit-ai="settings">配置密钥与接口</button><button class="btn" data-fit-ai="test" ${!info.enabled||testBusy?'disabled':''}>${testBusy?'测试中…':'测试连接（占用1次）'}</button></div><p class="small muted spaced">仅你主动确认后发送本次问题或餐食图。失败请求也计次；本机限额不是账户金额上限。密钥不随训练JSON备份导出。关闭后停止后续调用，已发出的请求可能产生费用。</p></section>`;
  }
  ai=function(){const info=mobile.readAIStatus();return pageHead('AI ASSISTANT','健身 AI 问答','手机直接连接通义千问，AI不会自动修改记录。').replace('免费 · 本地模式',info.enabled?'AI增强 · 可能收费':'AI默认关闭')+controlCard(info)+`<div class="card"><div class="row between wrap"><h2>通义千问 AI</h2><label class="row"><span>${info.enabled?'已开启':'已关闭'}</span><input aria-label="开启AI" class="switch" type="checkbox" id="aiToggle" ${info.enabled?'checked':''}></label></div><p class="muted small spaced">默认关闭。先配置你自己的API Key，再开启AI。每次发送前都会确认可能产生的费用。</p><div class="chat spaced" id="chatBox">${st.chat.length?st.chat.map(x=>`<div class="bubble ${x.role==='user'?'me':'ai'}">${esc(x.text)}</div>`).join(''):'<div class="bubble ai">配置并开启后，可以咨询训练和饮食建议。此处不会把你的全部历史记录自动上传。</div>'}</div><form id="chatForm" class="row spaced"><input id="chatInput" maxlength="1200" style="flex:1;min-width:0;background:#0e1d2c;border:1px solid #456077;padding:12px;border-radius:11px;color:white" placeholder="输入健身或饮食问题" ${!info.enabled||aiBusy?'disabled':''} required><button class="btn primary" ${!info.enabled||aiBusy?'disabled':''}>${aiBusy?'等待确认或回复…':'发送'}</button></form></div>`;};
  render=function(){const info=sync();originalRender();if(tab==='settings'||(tab==='food'&&nutritionMode==='ai'))el('app').insertAdjacentHTML('beforeend',controlCard(info));};
  callAI=async function(question){
    if(!sync().enabled)return toast('请先配置并开启AI');
    if(!question.trim()||question.length>1200)return toast('问题请输入1至1200字');
    const epoch=++chatEpoch;chatAbort=new AbortController();aiBusy=true;
    st.chat.push({role:'user',text:question});save();render();
    try{
      const response=await fetch('/api/chat',{method:'POST',signal:chatAbort.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});
      const result=await response.json();if(epoch!==chatEpoch||!mobile.readAIStatus().enabled)return;
      if(!response.ok)throw Error(result.error||'连接失败');
      if(typeof result.answer!=='string'||!result.answer.trim())throw Error('模型未返回有效回答');
      st.chat.push({role:'assistant',text:result.answer});save();
    }catch(error){if(epoch===chatEpoch&&error.name!=='AbortError'){st.chat.push({role:'assistant',text:'未完成AI请求：'+error.message});save();}}
    finally{if(epoch===chatEpoch){aiBusy=false;chatAbort=null;render();}}
  };
  document.addEventListener('change',event=>{
    if(event.target.id!=='aiToggle')return;
    event.stopImmediatePropagation();
    try{
      const result=JSON.parse(bridge.setAIEnabled(event.target.checked));
      if(!result.enabled){stopChat();nutritionAIEpoch++;nutritionConsent=null;nutritionAbort?.abort();}
      st.settings.ai=!!result.enabled;save();render();toast(result.error||(result.enabled?'AI已开启，每次发送仍需确认费用':'AI已关闭'));
    }catch(_){stopChat();st.settings.ai=false;save();render();toast('无法修改AI开关，请重试');}
  },true);
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-fit-ai]');if(!button)return;
    if(button.dataset.fitAi==='settings')return bridge.showAISettings();
    if(button.dataset.fitAi!=='test'||testBusy)return;
    if(!sync().enabled)return toast('请先在AI助手中开启AI');
    testBusy=true;render();
    try{const response=await fetch('/api/ai-test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const result=await response.json();if(!response.ok)throw Error(result.error||'连接失败');toast('连接成功：'+String(result.answer||'千问已响应').slice(0,100));}
    catch(error){toast(error.message);}finally{testBusy=false;render();}
  });
  window.addEventListener('fit-native-ai-settings',()=>{stopChat();nutritionAIEpoch++;nutritionConsent=null;nutritionAbort?.abort();sync();save();render();});
  window.addEventListener('pagehide',()=>{stopChat();bridge.setAIEnabled(false);});
  st.settings.ai=false;nutritionConsent=null;save();render();
})();
