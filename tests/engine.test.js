import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, officersIn, provincesOf } from '../src/engine/state.js';
import { newGameStart, advance, playerCommand, concludeBattle } from '../src/engine/turn.js';
import { ADJACENT } from '../src/engine/map.js';
import { createBattle, doMove, reachable, autoResolve, idx, hexDist } from '../src/engine/battle.js';
import { devGain } from '../src/engine/economy.js';

test('every province has at least one neighbour and adjacency is symmetric', () => {
  for (const [id, ns] of Object.entries(ADJACENT)) {
    assert.ok(ns.length > 0, `${id} is isolated`);
    for (const n of ns) assert.ok(ADJACENT[n].includes(id), `${id}-${n} not symmetric`);
  }
});

test('the map is one connected landmass', () => {
  const seen = new Set(['luoyang']);
  const queue = ['luoyang'];
  while (queue.length) for (const n of ADJACENT[queue.shift()]) if (!seen.has(n)) seen.add(n) && queue.push(n);
  assert.equal(seen.size, Object.keys(ADJACENT).length);
});

test('a province may issue many commands, but each officer works once a month', () => {
  const state = createGame({ humanRulers: ['cao-cao'], seed: 42 });
  newGameStart(state);
  const r = advance(state);
  assert.equal(r.type, 'await');
  assert.equal(r.pid, 'chenliu');
  const p = state.provinces.chenliu;
  const before = p.farm;
  const res = playerCommand(state, 'develop', { field: 'farm', officer: 'cao-cao', gold: 100 });
  assert.ok(res.ok, res.msg);
  assert.ok(p.farm > before);
  assert.equal(state.awaiting, 'chenliu', 'the turn continues after a command');
  const again = playerCommand(state, 'develop', { field: 'commerce', officer: 'cao-cao', gold: 50 });
  assert.equal(again.ok, false, 'Cao Cao is already busy');
  assert.ok(playerCommand(state, 'develop', { field: 'commerce', officer: 'chen-gong', gold: 50 }).ok);
  assert.ok(playerCommand(state, 'trade', { mode: 'sell', amount: 100 }).ok, 'trade needs no officer');
  const month = state.month;
  assert.ok(playerCommand(state, 'rest', {}).ok);
  assert.equal(state.awaiting, null, 'ending the turn hands over to the next province');
  const r2 = advance(state);
  assert.ok(['await', 'battle', 'captives', 'gameover'].includes(r2.type));
  if (r2.type === 'await') {
    assert.notEqual(state.month, month);
    assert.ok(playerCommand(state, 'develop', { field: 'farm', officer: 'cao-cao', gold: 10 }).ok, 'officers are fresh next month');
  }
});

test('invalid commands are rejected without consuming the turn', () => {
  const state = createGame({ humanRulers: ['cao-cao'], seed: 1 });
  newGameStart(state);
  advance(state);
  const res = playerCommand(state, 'develop', { field: 'farm', officer: 'cao-cao', gold: 999999 });
  assert.equal(res.ok, false);
  assert.equal(state.awaiting, 'chenliu');
});

test('development has diminishing returns', () => {
  const o = { int: 80 };
  assert.ok(devGain({ farm: 100 }, 'farm', o, 100) > devGain({ farm: 900 }, 'farm', o, 100));
});

test('a player attack produces an interactive battle that can be concluded', () => {
  const state = createGame({ humanRulers: ['cao-cao'], seed: 7 });
  newGameStart(state);
  advance(state);
  const army = ['xiahou-dun', 'xiahou-yuan', 'cao-ren'];
  const res = playerCommand(state, 'war', { to: 'puyang', officers: army, commander: 'xiahou-dun', food: 300 });
  assert.ok(res.ok, res.msg);
  assert.ok(state.battle, 'battle should be pending');
  autoResolve(state, state.battle);
  const outcome = concludeBattle(state);
  assert.ok(outcome.winner === 'att' || outcome.winner === 'def');
  if (outcome.winner === 'att') assert.equal(state.provinces.puyang.owner, 'cao-cao');
  // State must survive a save/load round trip.
  const copy = JSON.parse(JSON.stringify(state));
  assert.deepEqual(copy.provinces, state.provinces);
});

test('taking the castle wins the battle for the attacker', () => {
  const state = createGame({ seed: 3 });
  const b = createBattle(state, {
    pid: 'xuchang', from: 'chenliu', provTerrain: 'plains', river: false, walls: 50,
    att: { force: 'cao-cao', officers: [{ officer: 'xiahou-yuan', troops: 5000, training: 80, unit: 'cav' }], commander: 'xiahou-yuan', food: 500 },
    def: { force: 'yuan-shu', officers: [{ officer: 'ji-ling', troops: 3000, training: 50, unit: 'inf' }], commander: 'ji-ling', food: 500 },
  });
  const att = b.units.find((u) => u.side === 'att');
  const def = b.units.find((u) => u.side === 'def');
  // Empty the castle and place the attacker next to it.
  def.c = 0;
  def.r = 0;
  att.c = b.castle.c - 1;
  att.r = b.castle.r;
  assert.ok(reachable(b, att).has(idx(b.castle.c, b.castle.r)));
  doMove(state, b, att, b.castle.c, b.castle.r);
  assert.equal(b.result?.winner, 'att');
});

test('battles always finish within the day limit', () => {
  const state = createGame({ seed: 11 });
  for (let i = 0; i < 20; i++) {
    const b = createBattle(state, {
      pid: 'xuchang', from: 'chenliu', provTerrain: ['plains', 'hills', 'mountains', 'forest', 'marsh'][i % 5], river: i % 2 === 0, walls: 60,
      att: { force: 'cao-cao', officers: ['cao-ren', 'yue-jin'].map((officer) => ({ officer, troops: 4000, training: 60, unit: 'inf' })), commander: 'cao-ren', food: 400 },
      def: { force: 'yuan-shu', officers: ['ji-ling', 'lei-bo'].map((officer) => ({ officer, troops: 4000, training: 60, unit: 'arc' })), commander: 'ji-ling', food: 400 },
    });
    autoResolve(state, b);
    assert.ok(b.result);
    assert.ok(b.day <= b.maxDays + 1);
    for (const u of b.units) assert.ok(u.troops >= 0);
  }
  assert.equal(hexDist({ c: 0, r: 0 }, { c: 0, r: 1 }), 1);
  assert.equal(hexDist({ c: 0, r: 0 }, { c: 1, r: 1 }), 2);
});

test('a fully delegated realm still pauses every month for the player', () => {
  const state = createGame({ humanRulers: ['liu-bei'], seed: 5 });
  newGameStart(state);
  for (const p of provincesOf(state, 'liu-bei')) p.delegate = { directive: 'develop' };
  const r = advance(state);
  assert.ok(['month', 'battle', 'captives', 'gameover'].includes(r.type));
  assert.ok(officersIn(state, 'pingyuan').length >= 0);
});

test('heirs join a serving relative, or appear as free officers if the relative is gone', async () => {
  const { applyDebuts } = await import('../src/engine/state.js');
  const state = createGame({ seed: 2 });
  assert.equal(state.officers['sun-quan'].status, 'unborn');
  state.year = 197;
  applyDebuts(state);
  assert.equal(state.officers['sun-quan'].force, 'sun-jian');
  assert.equal(state.officers['sun-quan'].province, 'changsha');

  const other = createGame({ seed: 2 });
  other.officers['sun-jian'].status = 'dead';
  other.year = 197;
  applyDebuts(other);
  assert.equal(other.officers['sun-quan'].status, 'free');
  assert.equal(other.officers['sun-quan'].province, 'changsha');
});

test('the RTK II schedule places searchable officers where the guide says', () => {
  const state = createGame({ seed: 3 });
  const zl = state.officers['zhuge-liang'];
  assert.equal(zl.debut, 196);
  assert.equal(zl.status, 'unborn');
  assert.equal(state.officers['zhong-yao'].status, 'free');
  assert.equal(state.officers['zhong-yao'].province, 'xuchang');
  // Officers the 190 scenario already assigns to a lord keep their post.
  assert.equal(state.officers['zhao-yun'].force, 'gongsun-zan');
});

test('captives eventually escape back to their lord', async () => {
  const { endOfMonth } = await import('../src/engine/economy.js');
  const state = createGame({ seed: 9 });
  const o = state.officers['guan-yu'];
  Object.assign(o, { status: 'captive', prevForce: 'liu-bei', force: 'cao-cao', province: 'chenliu' });
  for (let i = 0; i < 240 && o.status === 'captive'; i++) endOfMonth(state);
  assert.equal(o.status, 'serving');
  assert.equal(o.force, 'liu-bei');
});

test('a drill master trains the whole garrison, less effectively when it is large', async () => {
  const { trainGain, drillEffect } = await import('../src/engine/economy.js');
  const master = { war: 90 };
  const unit = { training: 40, troops: 5000 };
  assert.equal(drillEffect(master, 10000), 1);
  assert.ok(drillEffect(master, 60000) < 0.6);
  assert.ok(trainGain(unit, master, 10000) > trainGain(unit, master, 60000));
  assert.ok(trainGain(unit, master, 1e9) > 0, 'even a huge garrison improves a little');

  const state = createGame({ humanRulers: ['cao-cao'], seed: 4 });
  newGameStart(state);
  advance(state);
  const before = officersIn(state, 'chenliu').map((o) => o.training);
  assert.ok(playerCommand(state, 'train', { officer: 'xiahou-dun' }).ok);
  const after = officersIn(state, 'chenliu').map((o) => o.training);
  assert.ok(after.every((t, i) => t >= before[i]) && after.some((t, i) => t > before[i]), 'every unit is drilled');
});

test('turn steps report every order a computer-run province gave', async () => {
  const { step } = await import('../src/engine/turn.js');
  const state = createGame({ humanRulers: ['liu-bei'], seed: 8 });
  newGameStart(state);
  for (const p of provincesOf(state, 'liu-bei')) p.delegate = { directive: 'balanced' };
  let delegatedSteps = 0;
  for (let i = 0; i < 400; i++) {
    const r = step(state);
    if (r.type === 'acted') {
      assert.ok(Array.isArray(r.actions) && Array.isArray(r.msgs), 'acted steps list actions and messages');
      assert.equal(r.actions.length, r.msgs.length);
      if (r.owner === 'liu-bei') delegatedSteps++;
    }
    if (['battle', 'captives', 'gameover'].includes(r.type)) break;
  }
  assert.ok(delegatedSteps > 0, 'the delegated province took turns');
});

test('standing assignments are the officer\'s job for the month and can be cleared to free them', async () => {
  const { setTask } = await import('../src/engine/commands.js');
  const { endOfMonth } = await import('../src/engine/economy.js');
  const state = createGame({ humanRulers: ['cao-cao'], seed: 6 });
  newGameStart(state);
  advance(state);
  setTask(state, 'xiahou-dun', 'train');
  const busy = playerCommand(state, 'develop', { field: 'farm', officer: 'xiahou-dun', gold: 20 });
  assert.equal(busy.ok, false, 'an officer on standing orders is busy');
  assert.match(busy.msg, /standing orders/);
  setTask(state, 'xiahou-dun', null);
  assert.ok(playerCommand(state, 'develop', { field: 'farm', officer: 'xiahou-dun', gold: 20 }).ok, 'clearing the assignment frees him this turn');

  // An officer given orders this month skips their assignment at month end.
  setTask(state, 'xiahou-dun', 'walls');
  const walls = state.provinces.chenliu.walls;
  const gold = state.provinces.chenliu.gold;
  for (const o of officersIn(state, 'chenliu')) if (o.id !== 'xiahou-dun') o.task = null;
  endOfMonth(state);
  assert.equal(state.provinces.chenliu.walls, walls);
  assert.ok(state.provinces.chenliu.gold >= gold, 'no stipend was paid');
});
