(async()=>{
  const results=[],assert=(condition,label)=>{if(!condition)throw Error(label);results.push(label)};
  const originalConfirm=window.confirm;
  try {
    st=defaultState();st.plans[0].days[3].exercises.pop();st.progress.starter.index=3;
    st.progress.starter.session.exerciseChecks={0:true,2:true};
    st.progress.starter.session.inputs={0:[{kg:'25',reps:'10'}]};
    const old=structuredClone(st),oldProgress=JSON.stringify(old.progress);
    restorePreparedState(old);tab='workout';render();
    const cards=[...document.querySelectorAll('.exercise-card')];
    assert(cards.length===4,'four abs action cards after legacy restore');
    assert(cards.map(x=>x.dataset.exerciseName).join('|')==='悬垂屈膝举腿|反向山羊挺身卷腹|平板支撑|跪姿绳索卷腹','old order preserved, cable crunch appended');
    assert(JSON.stringify(st.progress)===oldProgress,'old checks, weights and pending day preserved');
    const cable=cards[3];
    assert(cable.innerText.includes('4组 × 8–12次'),'cable target is four sets of 8-12');
    assert(cable.querySelector('button').getAttribute('aria-pressed')==='false','new exercise begins unchecked');
    const images=[...document.querySelectorAll('[data-exercise-image]')];
    await Promise.all(images.map(img=>{img.loading='eager';return img.decode()}));
    assert(images.every(img=>img.complete&&img.naturalWidth>0),'all abs images load and decode');
    const cableImages=[...cable.querySelectorAll('img')];
    assert(cableImages.length===2&&cableImages[0].getAttribute('src')==='assets/exercises/Cable_Crunch/0.jpg'&&cableImages[1].getAttribute('src')==='assets/exercises/Cable_Crunch/1.jpg','verified starting and ending images map to cable crunch');
    assert(cards[1].querySelector('img').getAttribute('src')==='roman-chair-reference.jpg','original reverse Roman chair reference retained');
    assert(!document.querySelector('[data-record],[data-action="timer"],[data-secs]'),'no per-set inputs or rest timers');
    assert(document.querySelector('.training-cardio').innerText.includes('40')&&document.querySelector('[data-action="cardio-start"]'),'40 minute stair task and timer retained');
    cable.querySelector('button').click();
    assert(progress().index===3&&!progress().choice&&st.history.length===0,'checking cable crunch does not check in or advance');
    document.querySelector('[data-action="exercise-check"][data-ex="1"]').click();
    window.confirm=()=>false;document.querySelector('[data-action="finish"]').click();
    assert(st.history.length===0&&!progress().choice,'cancelled final check-in preserves pending abs day');
    window.confirm=()=>true;document.querySelector('[data-action="finish"]').click();
    assert(progress().choice&&st.history.length===1&&st.history[0].done===4&&st.history[0].total===4,'confirmed four-action completion saves and awaits cycle choice');
    assert(document.querySelector('[data-action="cycle-rest"]')&&document.querySelector('[data-action="cycle-continue"]'),'rest and next round choices retained');
    document.querySelector('[data-action="cycle-continue"]').click();
    assert(progress().index===0&&!progress().choice,'next round begins on day one only after user choice');
    st=defaultState();st.progress.starter.index=3;save();tab='workout';render();
    const newCard=document.querySelector('[data-exercise-name="跪姿绳索卷腹"]');newCard.scrollIntoView({block:'start'});
    return {passed:results.length,results};
  } finally {window.confirm=originalConfirm}
})()