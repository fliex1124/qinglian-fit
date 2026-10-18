'use strict';

let cardioTicker = null;

function cardioElapsedMs(session, now = Date.now()) {
  const clock = session.cardioClock;
  if (!clock) return 0;
  const stored = Math.max(0, n(clock.elapsedMs));
  const live = clock.runningSince == null ? 0 : Math.max(0, now - n(clock.runningSince, now));
  return Math.min(600 * 60000, stored + live);
}

// A backup or undo snapshot never continues a live clock on another day/device.
// Without a trustworthy capture time, retain only the already accumulated duration.
function pauseCardioClockSnapshot(session, capturedAt = null) {
  if (!session?.cardioClock) return;
  session.cardioClock.elapsedMs = capturedAt == null
    ? Math.min(600 * 60000, Math.max(0, n(session.cardioClock.elapsedMs)))
    : cardioElapsedMs(session, capturedAt);
  session.cardioClock.runningSince = null;
}

function cardioClockText(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  return `${String(mins).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function cardioMinutesForCompletion(session) {
  const clock = session.cardioClock;
  return clock && !clock.recorded
    ? Math.round(cardioElapsedMs(session) / 6000) / 10
    : n(session.cardio);
}

function cardioTimerMarkup(session) {
  const running = session.cardioClock?.runningSince != null;
  const elapsed = cardioElapsedMs(session);
  return `<div class="cardio-clock"><p class="small muted">有氧累计用时</p><output id="cardioClockText" aria-label="有氧累计用时">${cardioClockText(elapsed)}</output><div class="row wrap"><button class="btn sm" data-action="${running ? 'cardio-pause' : 'cardio-start'}">${running ? '暂停计时' : elapsed ? '继续计时' : '开始有氧计时'}</button><button class="btn sm ghost" data-action="cardio-record">结束并记录</button></div><p class="small muted" id="cardioClockState">${running ? '计时中，可切换页面后继续。' : elapsed ? '计时已暂停。' : '按需计时，也可直接填写实际时长。'}</p></div>`;
}

function refreshCardioClock() {
  const output = el('cardioClockText');
  if (output) output.textContent = cardioClockText(cardioElapsedMs(progress().session));
}

function ensureCardioTicker() {
  if (cardioTicker === null) cardioTicker = setInterval(refreshCardioClock, 1000);
}

function changeCardioClock(action) {
  const p = progress(), d = curday();
  if (!d || p.choice) return;
  const s = p.session;
  if (action !== 'cardio-start' && !s.cardioClock) return;
  const clock = s.cardioClock ||= {elapsedMs: 0, runningSince: null, recorded: false};
  if (action === 'cardio-start') {
    if (clock.runningSince != null) return;
    clock.runningSince = Date.now();
    clock.recorded = false;
    ensureCardioTicker();
  } else {
    clock.elapsedMs = cardioElapsedMs(s);
    clock.runningSince = null;
    if (action === 'cardio-record') {
      s.cardio = Math.round(clock.elapsedMs / 6000) / 10;
      clock.recorded = true;
    }
  }
  s.started = true;
  s.id ??= uid();
  save();
  render();
  if (action === 'cardio-record') toast(`有氧已记录 ${s.cardio} 分钟，训练尚未打卡。`);
}

function exerciseIsDone(session, exercise, index) {
  if (typeof session.exerciseChecks?.[index] === 'boolean') return session.exerciseChecks[index];
  // A partially completed legacy draft remains partial. Never rewrite its sets or weights.
  const checks = session.checks?.[index] || [];
  return Array.from({length: exercise[1]}, (_, i) => checks[i] === true).every(Boolean);
}

function exerciseSummary(day, session) {
  const flags = day.exercises.map((a, i) => exerciseIsDone(session, a, i));
  return {flags, done: flags.filter(Boolean).length, total: flags.length};
}

function exerciseTarget(exercise) {
  const raw = String(exercise[2]).replace(/\s+/g, '');
  const perSide = /\/侧$/.test(raw), target = raw.replace(/\/侧$/, '');
  return `${exercise[1]}组 × ${target}${/秒|分钟|次/.test(target) ? '' : '次'}${perSide ? '/侧' : ''}`;
}

function exerciseIllustration(name) {
  const guide = EXERCISE_GUIDES[name];
  if (!guide || guide.status !== 'verified' || !guide.frames?.length) {
    return `<div class="exercise-media-pending" role="status"><span aria-hidden="true">▧</span><strong>示范图片待补充</strong><p>${esc(name)}的图片尚未核验</p></div>`;
  }
  return `<div class="exercise-media ${guide.reference ? 'exercise-media-reference' : guide.frames.length === 1 ? 'exercise-media-single' : ''}">${guide.frames.map(frame => `<figure><a href="${esc(frame.path)}" target="_blank" rel="noopener" aria-label="放大查看${esc(name)}${esc(frame.label)}"><img src="${esc(frame.path)}" alt="${esc(name)} · ${esc(frame.label)}" loading="lazy" decoding="async" data-exercise-image></a><figcaption>${esc(frame.label)}</figcaption></figure>`).join('')}</div>`;
}

function trainingDetail() {
  const p = progress(), d = curday();
  const head = `<div class="training-heading"><p class="muted">${esc(plan().name)}</p><h1>今日训练</h1><p class="lead">跟着示范完成动作，再勾选记录。</p></div>`;
  if (p.restDate === datekey()) return head + `<div class="card"><h2>今天休息一天</h2><p class="muted">待练内容已保留，明天继续。休息不算漏练。</p><button class="btn" data-tab="home">返回首页</button></div>`;
  if (p.choice) return head + `<div class="card training-cycle-choice"><h2>本轮训练已完成</h2><p class="muted">下一步由你选择。未选择时，进度会停在这里。</p><div class="row wrap"><button class="btn primary" data-action="cycle-rest">休息一天</button><button class="btn" data-action="cycle-continue">继续下一轮</button></div></div>`;

  const s = p.session, summary = exerciseSummary(d, s), ac = aerobic(d);
  if (s.cardioClock?.runningSince != null) ensureCardioTicker();
  const pct = Math.round(summary.done / summary.total * 100);
  return head + `<section class="training-overview"><div><span class="training-day">第 ${p.index + 1} / ${plan().days.length} 天</span><h2>${esc(d.name)}</h2><p class="muted">${summary.total}个动作 · ${esc(ac.name)}目标${ac.target}分钟</p></div><div class="training-progress" aria-label="${summary.done}个动作已完成"><strong>${summary.done}<span> / ${summary.total}</span></strong><span>动作已完成</span></div><div class="miniProgress"><span style="width:${pct}%"></span></div></section><div class="training-toolbar"><button class="btn sm" data-action="begin">${s.started ? (s.paused ? '继续训练' : '暂停训练') : '开始训练'}</button><button class="textbtn" data-action="rest-today">安排休息</button><span class="muted small">${s.started ? (s.paused ? '已暂停，进度保留' : '进度已保存') : '勾选动作也可开始'}</span></div><div class="training-layout"><div class="exercise-cards">${d.exercises.map((a, i) => {
    const done = summary.flags[i], guide = EXERCISE_GUIDES[a[0]], cues = guide?.cues || [a[3] || '保持动作控制，按自身能力完成。'];
    const legacyPartial = !done && (s.checks?.[i] || []).some(Boolean);
    return `<article class="exercise-card ${done ? 'is-complete' : ''}" data-exercise-name="${esc(a[0])}"><header class="exercise-card-heading"><span class="exercise-order">${String(i + 1).padStart(2, '0')}</span><h2>${esc(a[0])}</h2><span class="exercise-state ${done ? 'is-complete' : ''}">${done ? '已完成' : '待完成'}</span></header>${exerciseIllustration(a[0])}<div class="exercise-card-body"><div class="exercise-target">${esc(exerciseTarget(a))}</div><ul class="exercise-cues">${cues.map(cue => `<li>${esc(cue)}</li>`).join('')}</ul>${legacyPartial ? '<p class="legacy-draft-note">旧版逐组草稿已保留</p>' : ''}<button class="exercise-complete-button ${done ? 'is-complete' : ''}" data-action="exercise-check" data-ex="${i}" aria-pressed="${done}" aria-label="${done ? '取消完成' : '完成动作'}：${esc(a[0])}"><span aria-hidden="true">${done ? '✓' : '○'}</span>${done ? '已完成 · 点击取消' : '勾选动作完成'}</button></div></article>`;
  }).join('')}</div><aside class="training-side"><section class="card training-cardio"><h2>${esc(ac.name)}</h2><p class="cardio-target"><strong>${ac.target}</strong> 分钟目标</p><div class="field"><label>实际时长（分钟，可选）<input id="cardioMin" type="number" min="0" max="600" placeholder="尚未记录" value="${esc(s.cardio)}"></label></div>${cardioTimerMarkup(s)}<p class="small muted">按实际完成记录，未填不会算作完成目标。</p></section><p class="training-supplement">晚饭后肌酸3克。饮食蛋白质不足时可按需补充蛋白粉；20克粉约含16克蛋白质。</p><div class="training-submit"><span>${summary.done}/${summary.total} 个动作已完成</span><button class="btn mint block" data-action="finish">完成今日训练</button><p>确认打卡后，才进入下一个训练日。</p></div></aside></div>`;
}

function toggleExercise(index) {
  const p = progress(), d = curday();
  if (!d || p.choice || !Number.isInteger(index) || !d.exercises[index]) return;
  const s = p.session;
  s.exerciseChecks ??= {};
  s.exerciseChecks[index] = !exerciseIsDone(s, d.exercises[index], index);
  s.started = true;
  s.paused = false;
  s.id ??= uid();
  save();
  const scroll = typeof window.scrollY === 'number' ? window.scrollY : 0;
  render();
  if (typeof window.scrollTo === 'function') window.scrollTo(0, scroll);
}

function finishTrainingDetail() {
  const p = progress(), d = curday();
  if (!d || p.choice) return;
  const summary = exerciseSummary(d, p.session);
  if (!summary.done) return toast('请先勾选已完成的动作；今天不训练可安排休息。');
  const message = summary.done === summary.total
    ? `已勾选全部${summary.total}个动作。确认完成今日训练并进入下一训练日？`
    : `已勾选${summary.done}/${summary.total}个动作。按部分完成保存并进入下一训练日？`;
  if (!confirm(message)) return;
  const before = structuredClone(p);
  pauseCardioClockSnapshot(before.session, Date.now());
  st.history.push({
    id: p.session.id || uid(), date: datekey(), at: new Date().toISOString(), type: 'done',
    planId: plan().id, planName: plan().name, name: d.name, dayIndex: p.index,
    completionMode: 'exercise', exerciseChecks: summary.flags,
    // Legacy data stays exact. Checking an exercise never fabricates completed sets.
    checks: structuredClone(p.session.checks), inputs: structuredClone(p.session.inputs),
    cardio: cardioMinutesForCompletion(p.session), cardioName: aerobic(d).name, cardioTarget: aerobic(d).target,
    done: summary.done, total: summary.total, snapshot: structuredClone(d), before
  });
  p.session = resetSession();
  if (p.index === plan().days.length - 1) p.choice = true;
  else p.index++;
  save();
  tab = p.choice ? 'workout' : 'records';
  render();
  if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
  toast(p.choice ? '本轮完成，请选择休息一天或继续下一轮。' : '今日训练已打卡，下一训练日已更新。');
}

function legacySetDetails(history, exercise, index) {
  return Array.from({length: exercise[1]}, (_, j) => {
    const x = history.inputs?.[index]?.[j] || {};
    return `第${j + 1}组 ${history.checks?.[index]?.[j] ? '✓' : '未完成'}：${esc(x.kg || '—')}kg / ${esc(x.reps || '—')}${/秒/.test(exercise[2]) ? '秒' : '次'}${x.right ? '，右' + esc(x.right) + '次' : ''}`;
  }).join('；');
}

function trainingRecords() {
  const rows = st.history.filter(h => !recordDate || h.date === recordDate).slice().reverse();
  const completed = st.history.filter(h => h.type === 'done'), dates = new Set(completed.map(h => h.date));
  return pageHead('HISTORY', '训练记录与进步', '历史重量与次数保留。新的打卡按动作记录完成状态。') + `<div class="card"><div class="row wrap"><span class="pill">累计 ${completed.length} 次</span><span class="pill">训练 ${dates.size} 天</span><label>筛选日期 <input id="historyDate" type="date" value="${recordDate}"></label><button class="textbtn" data-action="all-history">全部日期</button></div></div><div class="list spaced">${rows.map(h => `<div class="card"><h2>${esc(h.date)} · ${esc(h.name)}</h2><p class="muted">${esc(h.planName || st.plans.find(p => p.id === h.planId)?.name || '原计划')} · ${h.type === 'done' ? `${h.done}/${h.total}${h.completionMode === 'exercise' ? '个动作' : '组'}，${esc(h.cardioName || '有氧')}实际${h.cardio}分钟` : '主动休息'}</p>${h.snapshot ? `<details><summary>当时的动作与训练记录</summary>${h.snapshot.exercises.map((a, i) => `<p><strong>${esc(a[0])}</strong> · ${esc(exerciseTarget(a))}</p>${h.completionMode === 'exercise' ? `<p class="small muted">${h.exerciseChecks?.[i] ? '✓ 动作已完成' : '未勾选完成'} · 未新增逐组重量和次数</p>${h.inputs?.[i]?.some(x => x && Object.values(x).some(v => v !== '')) ? `<details><summary>保留的旧版逐组草稿</summary><p class="small muted">${legacySetDetails(h, a, i)}</p></details>` : ''}` : `<p class="small muted">${legacySetDetails(h, a, i)}</p>`}`).join('')}</details>` : h.type === 'done' ? '<p class="small muted">旧版记录未保存动作快照，保留已有训练数据。</p>' : ''}${h.before ? `<button class="btn danger sm spaced" data-action="undo" data-id="${esc(h.id)}">撤销这次记录</button>` : ''}</div>`).join('') || '<div class="empty">暂无记录</div>'}</div><div class="card spaced"><h2>历史动作进步</h2>${legacyMovementStats(completed)}</div>`;
}

function legacyMovementStats(logs) {
  const map = new Map();
  for (const h of logs) {
    if (h.completionMode === 'exercise') continue;
    h.snapshot?.exercises.forEach((a, i) => {
      const sets = (h.inputs?.[i] || []).filter((x, j) => x && h.checks?.[i]?.[j]);
      if (!sets.length) return;
      const kg = Math.max(...sets.map(x => n(x.kg))), reps = sets.reduce((v, x) => v + n(x.reps) + n(x.right), 0);
      const rows = map.get(a[0]) || [];
      rows.push({date: h.date, kg, reps});
      map.set(a[0], rows);
    });
  }
  return [...map].map(([name, rows]) => `<p><strong>${esc(name)}</strong>：${rows[0].date} ${rows[0].kg}kg/${rows[0].reps} → ${rows.at(-1).date} ${rows.at(-1).kg}kg/${rows.at(-1).reps}（总次数/秒）</p>`).join('') || '<p class="muted">历史重量和次数如有记录，会继续保留在这里。</p>';
}

document.addEventListener('click', e => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'exercise-check') toggleExercise(Number(button.dataset.ex));
  if (['cardio-start', 'cardio-pause', 'cardio-record'].includes(button.dataset.action)) {
    changeCardioClock(button.dataset.action);
  }
});

document.addEventListener('change', e => {
  if (e.target.id !== 'cardioMin') return;
  // A manually entered duration takes precedence; preserve the accumulated clock separately.
  const session = progress().session;
  if (session.cardioClock) {
    session.cardioClock.elapsedMs = cardioElapsedMs(session);
    session.cardioClock.runningSince = null;
    session.cardioClock.recorded = true;
    save();
    render();
  }
});

// Fail closed for missing/broken assets: show an explicit pending state, no substitute picture.
document.addEventListener('error', e => {
  const img = e.target;
  if (!img.matches?.('[data-exercise-image]')) return;
  const panel = img.closest('.exercise-media');
  if (panel) panel.outerHTML = '<div class="exercise-media-pending" role="status"><strong>示范图片待补充</strong><p>图片暂时无法读取，请刷新后重试。</p></div>';
}, true);
