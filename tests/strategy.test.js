import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, officersIn, provincesOf, monthIndex, provinceStrength } from '../src/engine/state.js';
import { ADJACENT } from '../src/engine/map.js';
import { planProvinceTurn } from '../src/engine/ai.js';
import { createBattle, autoResolve } from '../src/engine/battle.js';
import { chooseGoal, onGoalBattle, realmDistance, politicsMonthly } from '../src/engine/politics/index.js';

test('computer lords choose a neighbouring war goal and a staging province beside it', () => {
  const state = createGame({ seed: 5 });
  const goals = Object.values(state.forces).filter((f) => f.goal);
  assert.ok(goals.length >= 3, 'several lords start with designs');
  for (const f of goals) {
    const { target, staging } = f.goal;
    assert.notEqual(state.provinces[target].owner, f.id);
    assert.equal(state.provinces[staging].owner, f.id);
    assert.ok(ADJACENT[staging].includes(target));
  }
});

test('a lost homeland becomes the goal, even for a content lord', () => {
  const state = createGame({ seed: 5 });
  // Liu Biao (ambition 1) loses a province to a neighbour.
  const lost = provincesOf(state, 'liu-biao').find((p) => ADJACENT[p.id].some((n) => {
    const o = state.provinces[n].owner;
    return o && o !== 'liu-biao';
  }));
  const taker = ADJACENT[lost.id].map((n) => state.provinces[n].owner).find((o) => o && o !== 'liu-biao');
  const refuge = provincesOf(state, 'liu-biao').find((p) => p !== lost);
  for (const o of officersIn(state, lost.id)) o.province = refuge.id;
  lost.owner = taker;
  // Make the rest of the realm strong enough to try.
  for (const o of Object.values(state.officers)) if (o.force === 'liu-biao' && o.status === 'serving') o.troops = 20000;
  const g = chooseGoal(state, 'liu-biao');
  assert.equal(g?.target, lost.id);
});

function setupGoal(state, fid) {
  const f = state.forces[fid];
  const provs = provincesOf(state, fid);
  for (const p of provs) {
    for (const t of ADJACENT[p.id]) {
      const q = state.provinces[t];
      if (!q.owner || q.owner === fid) continue;
      const dist = realmDistance(state, fid, p.id);
      const rear = provs.find((r) => dist[r.id] >= 1);
      if (rear) {
        f.goal = { target: t, staging: p.id, since: monthIndex(state), fails: 0 };
        return { target: t, staging: p.id, rear: rear.id, dist };
      }
    }
  }
  return null;
}

test('the realm sends spare officers toward the staging province', () => {
  const state = createGame({ seed: 5 });
  const s = setupGoal(state, 'liu-yan');
  assert.ok(s, 'Liu Yan has a staging province and a rear');
  // Leave the rear province safe and its officers strong.
  for (const n of ADJACENT[s.rear]) {
    const q = state.provinces[n];
    if (q.owner && q.owner !== 'liu-yan') for (const o of officersIn(state, n)) o.troops = 0;
  }
  for (const o of officersIn(state, s.rear)) o.troops = 5000;
  const action = planProvinceTurn(state, s.rear, 'balanced', { isAI: true, skip: new Set(['trade', 'relief', 'war']) });
  assert.equal(action.type, 'move');
  assert.equal(s.dist[action.args.to], s.dist[s.rear] - 1);
  assert.ok(action.args.officers.length > 0);
});

test('the staging province strikes only when the gathered army is strong enough', () => {
  const state = createGame({ seed: 5 });
  const s = setupGoal(state, 'liu-yan');
  const here = officersIn(state, s.staging);
  for (const o of here) { o.troops = 800; o.training = 30; }
  const weak = planProvinceTurn(state, s.staging, 'balanced', { isAI: true, skip: new Set(['trade', 'relief']) });
  assert.ok(!(weak.type === 'war' && weak.args.to === s.target), 'too weak to strike');
  for (const o of here) { o.troops = 20000; o.training = 90; }
  state.provinces[s.staging].food = 100000;
  for (const o of officersIn(state, s.target)) o.troops = Math.min(o.troops, 500);
  const strong = planProvinceTurn(state, s.staging, 'balanced', { isAI: true, skip: new Set(['trade', 'relief']) });
  assert.equal(strong.type, 'war');
  assert.equal(strong.args.to, s.target);
});

test('a goal is given up after two failed attempts and not retried for a while', () => {
  const state = createGame({ seed: 5 });
  const s = setupGoal(state, 'liu-yan');
  onGoalBattle(state, 'liu-yan', s.target, false);
  assert.ok(state.forces['liu-yan'].goal);
  onGoalBattle(state, 'liu-yan', s.target, false);
  assert.equal(state.forces['liu-yan'].goal, null);
  assert.ok(state.forces['liu-yan'].goalBans[s.target] > monthIndex(state));
});

test('a human lord is warned when an army masses across the border', () => {
  const state = createGame({ humanRulers: ['cao-cao'], seed: 5 });
  const chenliu = 'chenliu';
  const fid = ADJACENT[chenliu].map((n) => state.provinces[n].owner).find((o) => o && o !== 'cao-cao');
  const staging = ADJACENT[chenliu].find((n) => state.provinces[n].owner === fid);
  state.forces[fid].goal = { target: chenliu, staging, since: monthIndex(state), fails: 0 };
  for (const o of officersIn(state, staging)) o.troops = 100000;
  const before = state.log.length;
  politicsMonthly(state);
  assert.ok(provinceStrength(state, staging) > 0);
  assert.ok(state.log.slice(before).some((l) => /Scouts report/.test(l.msg) && l.forces.includes('cao-cao')));
});

test('a commander with no infantry left leads the army home rather than waiting out the month', () => {
  const state = createGame({ seed: 7 });
  const b = createBattle(state, {
    pid: 'xuchang', from: 'chenliu', walls: 80,
    att: { force: 'cao-cao', officers: [{ officer: 'xiahou-yuan', troops: 3000, training: 60, unit: 'arc' }], commander: 'xiahou-yuan', food: 500 },
    def: { force: 'yuan-shu', officers: [{ officer: 'ji-ling', troops: 3000, training: 50, unit: 'inf' }], commander: 'ji-ling', food: 500 },
  });
  autoResolve(state, b);
  assert.equal(b.result.winner, 'def');
  assert.match(b.result.reason, /withdraws in good order/);
  assert.ok(b.day < 30);
});
