'use strict';

(function () {
  const mobile=window.FitMobile || {native:false},native=mobile.native,bridge=window.QinglianAndroid;
  let imageDialog=null;
  function mobileNotice() {
    if(!native)return '';
    const info=mobile.storage||{},stamp=info.savedAt?new Date(info.savedAt).toLocaleString('zh-CN'):'';
    return `<section class="card spaced fit-mobile-storage"><h2>手机与备份</h2><p class="muted small">训练、饮食、体重和照片保存在这部手机内。覆盖安装同包名新版可保留记录；卸载或清除应用数据会移除本机记录。</p><p id="fitNativeStorageStatus" class="${info.ok===false?'warning':'note'}">${info.ok===false?esc('安全副本未更新：'+(info.error||'请导出备份')):stamp?'本机安全副本：'+esc(stamp):'首次保存记录后会建立本机安全副本。'}</p><div class="row wrap spaced"><button class="btn" data-fit-mobile="export">保存完整备份到文件</button><button class="btn" data-fit-mobile="share">分享备份文件</button><button class="btn" data-fit-mobile="previous">恢复上一份本机副本</button></div><p class="small muted spaced">换手机：在旧设备导出完整JSON，再用本页“从备份恢复”选择文件。副本与APP同在一部手机，仍需定期导出到你选择的位置。</p></section>`;
  }
  const originalRender=render;
  render=function () {
    originalRender();
    if(tab==='settings')el('app').insertAdjacentHTML('beforeend',mobileNotice());
    if(native) {
      const localForm=el('localFoodForm');
      if(localForm) {
        const card=localForm.closest('.card');
        card.innerHTML='<h2>图片识别</h2><p class="muted">安卓首版尚未内置食物图片模型。</p><p class="small muted">先在上方搜索并确认食物与份量；找不到时手动填写本份营养。不会上传图片，也不会假装识别成功。</p>';
      }
      if(!mobile.aiSupported&&tab==='food'&&nutritionMode==='ai') {
        const form=el('enhancedFoodForm');
        if(form)form.closest('.card').innerHTML='<h2>AI增强</h2><p class="note">安卓首版尚未接入付费AI，保持关闭。</p><p class="muted">免费食物搜索、条码查询、份量计算与确认保存均可使用。电脑浏览器版保留原有AI配置入口。</p><button class="btn spaced" data-action="nutrition-mode" data-mode="free">返回免费模式</button>';
      }
      if(!mobile.aiSupported&&tab==='ai') {
        const toggle=el('aiToggle');if(toggle){toggle.checked=false;toggle.disabled=true;}
        const chat=el('chatForm');if(chat)chat.querySelectorAll('input,button').forEach(node=>node.disabled=true);
        const notice=document.createElement('p');notice.className='note';notice.textContent='安卓首版尚未接入付费AI。已有聊天记录保留，免费训练和饮食可以独立使用。';
        el('app').prepend(notice);
        const guide=el('app').querySelector('.cols2 > .card:last-child');
        if(guide)guide.innerHTML='<h2>免费功能照常使用</h2><p class="muted">查看动作图片、完成训练打卡、按食物和份量计算饮食，均无需AI。</p><button class="btn" data-tab="food">记录饮食</button>';
      }
      const footer=el('app').querySelector('.foot');if(footer)footer.innerHTML=footer.innerHTML.replace('电脑 / 手机浏览器测试版','安卓安装版 · 本机保存');
    }
    const bar=document.getElementById('fitAppBar');
    if(bar){bar.querySelector('[data-fit-app-title]').textContent=tab==='settings'?'设置与备份':'轻练 FIT';bar.querySelector('[data-fit-mobile="back"]').hidden=tab==='home';}
  };
  function goHome(){rememberNutritionForm();tab='home';render();window.scrollTo(0,0);}
  window.fitAndroidBack=function () {
    if(imageDialog){imageDialog.remove();imageDialog=null;return true;}
    const modal=document.querySelector('.modal');if(modal){modal.remove();return true;}
    if(tab!=='home'){goHome();return true;}return false;
  };
  function exportNative(share=false,raw=false) {
    try {
      const content=raw?(localStorage.getItem(KEY)||''):JSON.stringify(createBackupPacket(),null,2);
      const filename=`轻练FIT_${raw?'原始存储':'完整备份'}_${datekey()}.json`;
      if(raw)bridge.exportRawStorage(content,filename);else if(share)bridge.shareBackup(content,filename);else bridge.exportBackup(content,filename);
    }catch(error){toast(error.message||'无法创建备份，请重试。');}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-fit-mobile]');
    if(button) {
      const action=button.dataset.fitMobile;
      if(action==='back'){event.preventDefault();window.fitAndroidBack();}
      if(native&&action==='export')exportNative();
      if(native&&action==='share')exportNative(true);
      if(native&&action==='previous') {
        try {
          const raw=bridge.readPreviousState();if(!raw)return toast('还没有上一份本机副本，请选择你导出的完整备份。');
          const state=JSON.parse(raw);
          if(restoreBackupPacket({app:'qinglian-fit',version:1,state}))toast('已恢复上一份副本，计时器保持暂停。');
        }catch(error){toast('副本恢复失败：'+error.message);}
      }
    }
    if(!native)return;
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='export'||action==='raw-export') {event.preventDefault();event.stopImmediatePropagation();exportNative(false,action==='raw-export');}
    if(action==='clear') {
      event.preventDefault();event.stopImmediatePropagation();
      if(confirm('清空这部手机内的全部记录、照片、计划和安全副本？已导出的文件不受影响。')&&confirm('最后确认：此操作无法撤销。')) {
        try {
          // Validate and atomically replace WebView storage first. If it cannot be
          // written, do not delete the only recoverable private copy.
          restoreBackupPacket({app:'qinglian-fit',version:1,state:defaultState()},{confirm:false});
        }catch(error){return toast('未清空，原记录与安全副本保留：'+error.message);}
        try {
          const result=JSON.parse(bridge.clearState());if(!result?.ok)throw Error(result?.error||'请重试');
          nutritionSelected=FOOD_DATABASE[0];nutritionSource='database';nutritionQuery='';nutritionLocalResult=null;
          nutritionDraft={date:datekey(),meal:'午餐',grams:'150',foodName:'米饭',note:'',manualKcal:'',manualProtein:'',manualCarbs:'',manualFat:''};
          mobile.queuePersist(st);render();toast('本机记录已清空。');
        }catch(error){mobile.storage={ok:false,error:'当前记录已清空，但手机旧副本清理未完成，请重试清空。'};render();toast(mobile.storage.error);}
      }
    }
    const link=event.target.closest('.exercise-media a');
    if(link) {
      event.preventDefault();event.stopImmediatePropagation();
      imageDialog=document.createElement('div');imageDialog.className='fit-image-dialog';imageDialog.setAttribute('role','dialog');imageDialog.setAttribute('aria-modal','true');imageDialog.setAttribute('aria-label','动作图片');
      const picture=document.createElement('img');picture.src=link.href;picture.alt=link.getAttribute('aria-label')||'动作图片';
      const close=document.createElement('button');close.className='btn';close.textContent='关闭图片';close.onclick=()=>{imageDialog.remove();imageDialog=null;};
      imageDialog.append(picture,close);document.body.append(imageDialog);close.focus();
    }
  },true);
  window.addEventListener('fit-native-export',event=>{
    if(event.detail?.cancelled)return;
    if(event.detail?.ok)toast('备份已保存。');else toast('备份未完成：'+(event.detail?.error||'请重试。'));
  });
  window.addEventListener('fit-native-share',event=>{
    if(event.detail?.cancelled)return;
    if(event.detail?.ok)toast('已打开系统分享面板，请选择保存或发送位置。');else toast('无法打开分享面板：'+(event.detail?.error||'请重试。'));
  });
  window.addEventListener('fit-native-storage',event=>{
    const info=event.detail,output=el('fitNativeStorageStatus');
    if(output){output.className=info.ok===false?'warning':'note';output.textContent=info.ok===false?'安全副本未更新，请先导出完整备份。':'本机安全副本已更新。';}
  });
  window.addEventListener('pagehide',()=>{if(native&&!storageBroken)mobile.queuePersist(st);});
  render();
})();
