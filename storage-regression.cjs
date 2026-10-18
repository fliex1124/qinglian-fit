'use strict';
// Regression checks run only against VM memory, never real browser/native storage or a server.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const KEY = 'qinglian_fit_v01';
const SOURCES = ['app.js', 'exercise-guides.js', 'training-details.js', 'food-database.js', 'nutrition.js', 'enhancements.js'];

function harness(initialRaw = null) {
  const values = new Map(initialRaw == null ? [] : [[KEY, initialRaw]]);
  const nodes = new Map(), listeners = {}, writes = [], mirrors = [];
  let now = '2026-10-17T10:00:00+08:00', capacity = Infinity, writeFailure = false, consent = true;
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const node = () => ({ innerHTML: '', textContent: '', scrollHeight: 0, scrollTop: 0, querySelector: () => node(), scrollIntoView() {} });
  const getNode = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  const window = {
    addEventListener() {}, scrollTo() {},
    FitMobile: { queuePersist(state) { mirrors.push(structuredClone(state)); } },
  };
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem(key, value) {
      if (writeFailure) throw Object.assign(new Error('Write failed'), { name: 'QuotaExceededError' });
      let size = value.length;
      for (const [otherKey, oldValue] of values) if (otherKey !== key) size += oldValue.length;
      if (size > capacity) throw Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });
      values.set(key, value); writes.push(key);
    },
    removeItem(key) { values.delete(key); writes.push(key); },
  };
  const context = vm.createContext({
    console, Date: TestDate, structuredClone, localStorage: storage, confirm: () => consent,
    window, document: { getElementById: getNode, addEventListener(event, fn) { (listeners[event] ??= []).push(fn); } },
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, URL, Blob,
    location: { protocol: 'http:', origin: 'http://127.0.0.1:9876' },
    FormData: class {
      constructor(data) { this.data = data; }
      get(key) { return this.data[key] ?? ''; }
      *[Symbol.iterator]() { yield* Object.entries(this.data); }
    },
    fetch() { throw new Error('Network must never be used in storage regression checks'); },
  });
  const run = source => vm.runInContext(source, context, { timeout: 10000 });
  const plain = expression => JSON.parse(run(`JSON.stringify(${expression})`));
  for (const source of SOURCES) vm.runInContext(fs.readFileSync(path.join(__dirname, source), 'utf8'), context, { filename: source, timeout: 10000 });
  return {
    values, writes, mirrors, window, getNode, run, plain,
    packet: () => plain('createBackupPacket()'),
    restore: packet => run(`restoreBackupPacket(${JSON.stringify(packet)},{confirm:false})`),
    time(value) { now = value; }, capacity(value) { capacity = value; },
    failWrites(value) { writeFailure = value; }, consent(value) { consent = value; },
    async importFile(packet) {
      getNode('importFile').files = [{ text: async () => JSON.stringify(packet) }];
      listeners.click[0]({ target: { closest: () => ({ dataset: { action: 'import' } }) } });
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

let passed = 0;
async function test(name, check) { await check(); passed++; console.log('PASS', name); }

(async () => {
  await test('malformed nested backup entries are rejected before main storage changes', () => {
    const h = harness(); h.run('save()');
    const original = h.values.get(KEY), originalMirrors = h.mirrors.length;
    const mutations = [
      state => { state.history = [null]; },
      state => { state.history = [{ type: 'done', date: '2026-10-17', name: '训练', snapshot: { name: '坏快照', exercises: [null] } }]; },
      state => { state.meals = [{ date: '2026-10-17', meal: '午餐', food: '米饭', grams: 100, kcal: 'bad' }]; },
      state => { state.meals = [{ date: '2026-02-30', meal: '午餐', food: '米饭', grams: 100, kcal: 116 }]; },
      state => { state.weights = [null]; },
      state => { state.photos = [{ date: '2026-10-17', angle: '正面', src: 'https://example.invalid/photo.jpg' }]; },
      state => { state.chat = [{ role: 'user', text: null }]; },
      state => { state.customFoods = [null]; },
      state => { state.customFoods = [{ name: '坏别名', aliases: {} }]; },
      state => { state.archivedSessions = [{ progress: null }]; },
      state => { state.progress.starter.session.cardioClock = { elapsedMs: -1 }; },
    ];
    for (const mutate of mutations) {
      const packet = h.packet(); mutate(packet.state);
      assert.throws(() => h.restore(packet));
      assert.equal(h.values.get(KEY), original);
      assert.equal(h.mirrors.length, originalMirrors);
    }
  });

  await test('all views are checked before commit, and a failed candidate leaves memory and storage intact', () => {
    const h = harness(); h.run('save()');
    const original = h.values.get(KEY), originalState = h.plain('st');
    h.run("const originalFoodView=food; food=()=>{if(st.plans[0].name==='bad-render')throw Error('bad-render');return originalFoodView()}");
    const packet = h.packet(); packet.state.plans[0].name = 'bad-render';
    assert.throws(() => h.restore(packet), /bad-render/);
    assert.equal(h.values.get(KEY), original);
    assert.deepEqual(h.plain('st'), originalState);
  });

  await test('post-commit rendering failure rolls both the main key and memory back', () => {
    const h = harness(); h.run("st.weights.push({id:'original',date:'2026-10-17',kg:75});save()");
    const original = h.values.get(KEY), packet = h.packet(); packet.state.weights = [];
    let text = '', throwOnce = true;
    Object.defineProperty(h.getNode('app'), 'innerHTML', {
      get: () => text,
      set(value) {
        if (throwOnce && h.values.get(KEY) !== original) { throwOnce = false; throw new Error('simulated DOM failure'); }
        text = value;
      },
    });
    const mirrorsBefore = h.mirrors.length;
    assert.throws(() => h.restore(packet), /已恢复原来的记录/);
    assert.equal(h.values.get(KEY), original);
    assert.equal(h.run('st.weights[0].kg'), 75);
    assert.equal(h.mirrors.length, mirrorsBefore, 'Failed restore must not replace the native mirror');
  });

  await test('photo-heavy storage restores a small valid backup with exactly one key replacement', () => {
    const h = harness(), smallPacket = h.packet();
    h.run("st.photos=[{id:'photo',date:'2026-10-17',angle:'正面',src:'data:image/jpeg;base64,'+'A'.repeat(2000000)}];save()");
    h.capacity(3000000); h.writes.length = 0;
    assert.equal(h.restore(smallPacket), true);
    assert.deepEqual(h.writes, [KEY]);
    assert.equal(h.values.has(KEY + '_before_restore'), false);
    assert.equal(h.run('st.photos.length'), 0);
  });

  await test('cancelling an explicit restore keeps both browser and native data unchanged', () => {
    const h = harness(); h.run('save()');
    const raw = h.values.get(KEY), packet = h.packet(), mirrors = h.mirrors.length;
    packet.state.weights = [{ id: 'cancelled', date: '2026-10-17', kg: 80 }];
    h.consent(false);
    assert.equal(h.run(`restoreBackupPacket(${JSON.stringify(packet)})`), false);
    assert.equal(h.values.get(KEY), raw);
    assert.equal(h.mirrors.length, mirrors);
  });

  await test('incoming quota failure preserves the current state and reports storage rather than format', async () => {
    const h = harness(); h.run('save()');
    const original = h.values.get(KEY), packet = h.packet();
    packet.state.photos = [{ id: 'large', date: '2026-10-17', angle: '正面', src: 'data:image/jpeg;base64,' + 'A'.repeat(10000) }];
    h.capacity(original.length + 100);
    await h.importFile(packet);
    assert.equal(h.values.get(KEY), original);
    assert.equal(h.run('st.photos.length'), 0);
    assert.match(h.getNode('toastbox').innerHTML, /存储空间不足/);
    assert.doesNotMatch(h.getNode('toastbox').innerHTML, /格式无效/);
  });

  await test('export pauses its own clock snapshot and preserves the active session', () => {
    const h = harness(); h.run("changeCardioClock('cardio-start')");
    h.time('2026-10-17T10:05:00+08:00');
    const packet = h.packet(), clock = packet.state.progress.starter.session.cardioClock;
    assert.equal(clock.elapsedMs, 300000); assert.equal(clock.runningSince, null);
    assert.notEqual(h.run('progress().session.cardioClock.runningSince'), null);
    h.time('2026-10-18T10:05:00+08:00'); h.restore(packet);
    assert.equal(h.run('cardioMinutesForCompletion(progress().session)'), 5);
    assert.equal(h.run('progress().session.cardioClock.runningSince'), null);
    assert.equal(h.run('progress().index'), 0);
  });

  await test('legacy running clocks use export time only, or their finalized duration when no export time exists', () => {
    const h = harness(); h.run("changeCardioClock('cardio-start')");
    const packet = { app: 'qinglian-fit', version: 1, exported: '2026-10-17T10:05:00+08:00', state: h.plain('st') };
    h.time('2026-10-18T10:00:00+08:00'); h.restore(packet);
    assert.equal(h.run('cardioMinutesForCompletion(progress().session)'), 5);
    packet.state.progress.starter.session.cardioClock.elapsedMs = 120000;
    delete packet.exported; h.restore(packet);
    assert.equal(h.run('cardioMinutesForCompletion(progress().session)'), 2);
  });

  await test('backup pauses historical undo and archived draft clocks as well as the active draft', () => {
    const h = harness();
    h.run(`changeCardioClock('cardio-start');
      st.history=[{id:'history',type:'rest',date:'2026-10-17',name:'休息',planId:'starter',before:structuredClone(progress())}];
      st.archivedSessions=[{planId:'starter',progress:structuredClone(progress())}]; save();`);
    h.time('2026-10-17T10:03:00+08:00');
    const packet = h.packet();
    for (const progress of [packet.state.progress.starter, packet.state.history[0].before, packet.state.archivedSessions[0].progress]) {
      assert.equal(progress.session.cardioClock.elapsedMs, 180000);
      assert.equal(progress.session.cardioClock.runningSince, null);
    }
  });

  await test('legacy history, unknown macros and custom plans survive restore without clearing or reinterpreting data', () => {
    const h = harness(), packet = h.packet();
    packet.state.history = [{ id: 'legacy', type: 'done', date: '2026-10-15', planId: 'starter', name: '胸部', done: 1, total: 24,
      snapshot: packet.state.plans[0].days[0], inputs: { 0: [{ kg: '40', reps: '10' }] }, checks: { 0: [true] } }];
    packet.state.meals = [{ id: 'old-meal', date: '2026-10-15', meal: '加餐', food: '米饭', grams: 200, kcal: 232, protein: 5.2 }];
    packet.state.customFoods = [{ id: 'drink', name: '测试饮品', basis: '100ml', kcal: 60, protein: 3, carbs: null, fat: null }];
    const historicalBytes = JSON.stringify(packet.state.history);
    h.restore(packet);
    assert.equal(h.run('JSON.stringify(st.history)'), historicalBytes);
    assert.equal(h.run('st.meals[0].carbs'), undefined);
    assert.equal(h.run('st.customFoods[0].basis'), '100ml');
  });

  await test('successful save and import each notify the native mirror, and bridge failures never roll back data', async () => {
    const h = harness(); h.run('save()'); assert.equal(h.mirrors.length, 1);
    const packet = h.packet(); packet.state.weights = [{ id: 'new', date: '2026-10-17', kg: 76 }];
    h.restore(packet); assert.equal(h.mirrors.length, 2); assert.equal(h.mirrors[1].weights[0].kg, 76);
    h.window.FitMobile.queuePersist = () => { throw new Error('bridge failed'); };
    h.run('st.weights[0].kg=77;save()');
    assert.equal(JSON.parse(h.values.get(KEY)).weights[0].kg, 77);
    h.window.FitMobile.queuePersist = () => Promise.reject(new Error('async mirror failed'));
    h.run('st.weights[0].kg=78;save()');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(JSON.parse(h.values.get(KEY)).weights[0].kg, 78);
    h.failWrites(true); assert.throws(() => h.run('st.weights[0].kg=79;save()'), /保存失败/);
    assert.equal(h.run('st.weights[0].kg'), 78);
  });

  await test('corrupt startup storage is preserved until a valid explicit restore repairs it', () => {
    const raw = '{broken-json', h = harness(raw);
    assert.equal(h.run('storageBroken'), true);
    assert.throws(() => h.run('save()'), /保存失败/);
    assert.equal(h.values.get(KEY), raw);
    h.restore(h.packet());
    assert.equal(h.run('storageBroken'), false);
    assert.doesNotThrow(() => JSON.parse(h.values.get(KEY)));
  });

  await test('stale tabs cannot overwrite a newer saved state and errors identify refresh', () => {
    const h = harness(); h.run('save()');
    const external = h.packet().state; external.weights = [{ id: 'other-tab', date: '2026-10-17', kg: 74 }];
    const raw = JSON.stringify(external); h.values.set(KEY, raw);
    assert.throws(() => h.run('st.weights.push({id:"stale",date:"2026-10-17",kg:75});save()'), /刷新/);
    assert.equal(h.values.get(KEY), raw);
    assert.throws(() => h.restore(h.packet()), /刷新/);
  });

  await test('pretty-printed legacy storage saves normally and AI guidance follows the current origin', () => {
    const source = harness(), state = source.packet().state;
    const h = harness(JSON.stringify(state, null, 2));
    assert.doesNotThrow(() => h.run('save()'));
    assert.match(h.run('ai()'), /http:\/\/127\.0\.0\.1:9876/);
    assert.doesNotMatch(h.run('ai()'), /127\.0\.0\.1:8787/);
  });

  console.log(`${passed} storage regression groups passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
