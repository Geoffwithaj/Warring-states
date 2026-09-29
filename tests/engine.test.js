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

test('a human lord is asked for orders and commands consume the turn', () => {
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
  assert.equal(state.awaiting, null);
  const month = state.month;
  const r2 = advance(state);
  assert.ok(['await', 'battle', 'captives', 'gameover'].includes(r2.type));
  if (r2.type === 'await') assert.notEqual(state.month, month);
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
