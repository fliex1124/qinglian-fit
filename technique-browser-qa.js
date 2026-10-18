(async()=>{
  const results=[],assert=(condition,label)=>{if(!condition)throw Error(label);results.push(label)};
  const frame=()=>new Promise(requestAnimationFrame);
  const originalFetch=window.fetch;let paidCalls=0;
  window.fetch=function(input,...args){if(/\/api\/(chat|food-photo)(?:$|\?)/.test(String(input)))paidCalls++;return originalFetch.call(this,input,...args)};
  try {
    st=defaultState();save();expandedTechniques.clear();
    const initialRaw=localStorage.getItem(KEY);
    for(let day=0;day<4;day++){
      progress().index=day;tab='workout';render();
      const cards=[...document.querySelectorAll('.exercise-card')];
      assert(cards.length===[6,6,4,4][day],'day '+(day+1)+' retains all planned exercises');
      for(const card of cards){
        const name=card.dataset.exerciseName,details=card.querySelector('details[data-exercise-technique]');
        assert(details&&!details.open,name+': details start collapsed');
        const before=JSON.stringify(st.progress),summary=details.querySelector('summary');
        summary.click();await frame();
        assert(details.open,name+': summary opens details');
        const titles=[...details.querySelectorAll('dt')].map(x=>x.textContent);
        assert(titles.join('|')==='起始姿势|角度与活动范围|发力与动作过程|呼吸与节奏|常见错误',name+': five complete sections');
        assert(details.querySelectorAll('.technique-section li').length===10&&details.querySelector('.technique-target').innerText.length>12,name+': ten tips and muscle focus');
        assert(details.querySelectorAll('.technique-sources a').length>=1,name+': source references available');
        assert(JSON.stringify(st.progress)===before&&localStorage.getItem(KEY)===initialRaw,name+': opening does not write or check in');
        summary.click();await frame();assert(!details.open,name+': summary closes details');
      }
    }
    assert(paidCalls===0,'viewing every instruction never calls paid AI');
    const roman=document.querySelector('[data-exercise-name="反向山羊挺身卷腹"]');
    assert(roman.querySelector('img').getAttribute('src')==='roman-chair-reference.jpg'&&roman.querySelector('.technique-note').textContent.includes('参考图')&&roman.querySelector('.technique-body').textContent.includes('不能从二维图片确定度数'),'Roman-chair reference and angle uncertainty remain explicit');
    const cable=document.querySelector('[data-exercise-name="跪姿绳索卷腹"]');
    cable.querySelector('summary').click();await frame();
    cable.querySelector('[data-action="exercise-check"]').click();await frame();
    assert(document.querySelector('[data-exercise-name="跪姿绳索卷腹"] details').open,'reading position survives exercise completion rerender');
    assert(progress().session.exerciseChecks[3]===true&&progress().index===3&&!progress().choice&&st.history.length===0,'action check remains separate from final training check-in');
    const next=document.querySelector('[data-exercise-name="跪姿绳索卷腹"] details');next.querySelector('summary').click();await frame();
    tab='food';render();tab='workout';render();
    assert(!document.querySelector('[data-exercise-name="跪姿绳索卷腹"] details').open,'collapsed state survives page navigation');
    assert(exerciseTechnique('未核验自定义动作','unknown').includes('待补充'),'unknown custom exercise gets explicit pending guidance');
    assert(!document.querySelector('[data-record],[data-action="timer"],[data-secs]')&&document.querySelector('[data-action="cardio-start"]'),'no per-set or rest timer returns, cardio timer retained');
    const custom=structuredClone(seedPlan);custom.id='technique-custom';custom.name='自定义目标';custom.system=false;
    custom.days=[{name:'自定义',exercises:[['平板支撑',2,'20秒',''],['站姿哑铃交替弯举',3,'15/侧','']]}];
    st.plans.push(custom);st.progress[custom.id]={index:0,choice:false,restDate:null,session:resetSession()};st.selected=custom.id;save();tab='workout';render();
    const plank=document.querySelector('[data-exercise-name="平板支撑"]');
    const curl=document.querySelector('[data-exercise-name="站姿哑铃交替弯举"]');
    assert(plank.querySelector('.exercise-target').textContent==='2组 × 20秒'&&!plank.querySelector('.technique-body').textContent.includes('4组 × 30–60秒'),'plank instructions respect custom set and time targets');
    assert(curl.querySelector('.exercise-target').textContent==='3组 × 15次/侧'&&!curl.querySelector('.technique-body').textContent.includes('每侧8–12次'),'alternating curl instructions respect custom per-side targets');
    st=defaultState();st.progress.starter.index=3;save();tab='workout';render();
    const finalDetails=document.querySelector('[data-exercise-name="跪姿绳索卷腹"] details');
    finalDetails.querySelector('summary').focus({preventScroll:true});finalDetails.scrollIntoView({block:'start'});
    return {passed:results.length,results,keyboardReady:document.activeElement===finalDetails.querySelector('summary')};
  } finally {window.fetch=originalFetch}
})()