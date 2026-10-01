import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, officersIn, provincesOf } from '../src/engine/state.js';
import { newGameStart, advance, playerCommand, concludeBattle } from '../src/engine/turn.js';
import { ADJACENT } from '../src/engine/map.js';
import {
  createBattle, doMove, reachable, autoResolve, idx, hexDist, neighbors, isBreached, canAssault, doAssault,
  provinceField, approachEdge, siteAt, canRaze, doRaze, canDeployAt, deployUnit, canRetreat, doRetreat,
  inArrivalStrip, BATTLE_W, BATTLE_H, RAZE_YIELD,
} from '../src/engine/battle.js';
import { finishBattle } from '../src/engine/war.js';
import { checkVictory as checkVictoryFor } from '../src/engine/battle.js';
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
  assert.ok(devGain({ id: 'chenliu', farm: 100 }, 'farm', o, 100) > devGain({ id: 'chenliu', farm: 900 }, 'farm', o, 100));
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

function siege(state, { walls = 60, attUnit = 'inf', defUnit = 'inf', attTroops = 5000, defTroops = 3000 } = {}) {
  return createBattle(state, {
    pid: 'xuchang', from: 'chenliu', walls,
    att: { force: 'cao-cao', officers: [{ officer: 'xiahou-yuan', troops: attTroops, training: 80, unit: attUnit }], commander: 'xiahou-yuan', food: 500 },
    def: { force: 'yuan-shu', officers: [{ officer: 'ji-ling', troops: defTroops, training: 50, unit: defUnit }], commander: 'ji-ling', food: 500 },
  });
}

function besideCastle(b, u) {
  const n = neighbors(b.castle.c, b.castle.r).find((x) => !['river'].includes(b.terrain[idx(x.c, x.r)]));
  u.c = n.c;
  u.r = n.r;
}

test('an empty castle can only be entered once its walls are breached', () => {
  const state = createGame({ seed: 3 });
  const b = siege(state, { walls: 60 });
  const att = b.units.find((u) => u.side === 'att');
  const def = b.units.find((u) => u.side === 'def');
  def.c = 0; def.r = 0; // empty the castle
  besideCastle(b, att);
  assert.equal(reachable(b, att).has(idx(b.castle.c, b.castle.r)), false, 'unbreached walls keep attackers out');
  b.walls = 30; // half of 60
  assert.ok(isBreached(b));
  assert.ok(reachable(b, att).has(idx(b.castle.c, b.castle.r)));
  doMove(state, b, att, b.castle.c, b.castle.r);
  assert.equal(b.result?.winner, 'att');
});

test('an occupied castle holds even with its walls in ruins', () => {
  const state = createGame({ seed: 3 });
  const b = siege(state, { walls: 0 });
  const att = b.units.find((u) => u.side === 'att');
  besideCastle(b, att);
  assert.equal(reachable(b, att).has(idx(b.castle.c, b.castle.r)), false);
});

test('infantry can assault the walls; cavalry cannot', () => {
  const state = createGame({ seed: 3 });
  const b = siege(state, { walls: 80 });
  const att = b.units.find((u) => u.side === 'att');
  besideCastle(b, att);
  assert.ok(canAssault(b, att));
  assert.ok(doAssault(state, b, att));
  assert.ok(b.walls < 80);
  const b2 = siege(state, { walls: 80, attUnit: 'cav' });
  const cav = b2.units.find((u) => u.side === 'att');
  besideCastle(b2, cav);
  assert.equal(canAssault(b2, cav), false);
});

test('province battlefields are fixed and attackers arrive from their direction', () => {
  const a = provinceField('hanzhong');
  const b = provinceField('hanzhong');
  assert.deepEqual(a, b);
  assert.notDeepEqual(provinceField('hanzhong').terrain, provinceField('chenliu').terrain);
  assert.equal(approachEdge('changan', 'luoyang'), 'west');
  assert.equal(approachEdge('luoyang', 'changan'), 'east');
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

test('building assignments share the assignment budget; drilling is free', async () => {
  const { setTask, setTaskBudget } = await import('../src/engine/commands.js');
  const { endOfMonth, monthlyGold } = await import('../src/engine/economy.js');
  const run = (budget) => {
    const state = createGame({ humanRulers: ['cao-cao'], seed: 12 });
    newGameStart(state);
    for (const o of officersIn(state, 'chenliu')) o.task = null;
    setTask(state, 'cao-cao', 'farm');
    setTask(state, 'chen-gong', 'farm');
    setTask(state, 'xiahou-dun', 'train');
    setTaskBudget(state, 'chenliu', budget);
    const p = state.provinces.chenliu;
    const income = monthlyGold(p);
    const [farm, gold] = [p.farm, p.gold];
    endOfMonth(state);
    return { gained: p.farm - farm, spent: gold + income - p.gold, income };
  };
  const none = run(0);
  const full = run(1);
  assert.ok(none.gained >= 2, 'officers still add a little labour with no budget');
  assert.equal(none.spent, 0, 'labour-only work costs nothing');
  assert.ok(full.gained > none.gained, 'funding speeds up building work');
  assert.ok(full.spent <= full.income, 'the budget never exceeds the month’s income');
});

function openField(state, attUnit, defUnit, ter = 'plains') {
  const b = createBattle(state, {
    pid: 'xuchang', from: 'chenliu', walls: 50,
    att: { force: 'cao-cao', officers: [{ officer: 'xiahou-yuan', troops: 5000, training: 70, unit: attUnit }], commander: 'xiahou-yuan', food: 500 },
    def: { force: 'yuan-shu', officers: [{ officer: 'ji-ling', troops: 5000, training: 70, unit: defUnit }], commander: 'ji-ling', food: 500 },
  });
  b.terrain.fill(ter);
  b.terrain[idx(b.castle.c, b.castle.r)] = 'castle';
  const [a, d] = b.units;
  a.c = 2; a.r = 2; d.c = 3; d.r = 2;
  return { b, a, d };
}

test('cavalry charges through the target, only when fresh and with clear ground beyond', async () => {
  const { previewCharge, doCharge, previewMelee, chargeLanding } = await import('../src/engine/battle.js');
  const state = createGame({ seed: 21 });
  const { b, a, d } = openField(state, 'cav', 'inf');
  const charge = previewCharge(state, b, a, d);
  assert.ok(charge, 'charge possible on open ground');
  assert.ok(charge.dmg > previewMelee(state, b, a, d).dmg * 1.4, 'charging on plains hits much harder than an ordinary attack');
  const marsh = openField(state, 'cav', 'inf', 'marsh');
  assert.ok(previewCharge(state, marsh.b, marsh.a, marsh.d).dmg < charge.dmg * 0.5, 'a charge into marsh fizzles');
  a.moved = true;
  assert.equal(chargeLanding(b, a, d), null, 'a unit that has moved cannot charge');
  a.moved = false;
  assert.ok(doCharge(state, b, a, d));
  assert.equal(a.c, 4, 'the cavalry ends up beyond the target');
});

test('refusing a duel costs morale across the army; a second refusal breaks the unit for the day', async () => {
  const { doDuel, answerPendingDuel } = await import('../src/engine/battle.js');
  const state = createGame({ seed: 22 });
  const { b, a, d } = openField(state, 'inf', 'inf');
  b.humanSides = { att: false, def: true };
  const before = d.morale;
  doDuel(state, b, a, d);
  assert.ok(b.pendingDuel, 'the player is asked');
  answerPendingDuel(state, b, false);
  assert.equal(d.morale, before - 15);
  b.day += 3;
  a.done = false;
  doDuel(state, b, a, d);
  answerPendingDuel(state, b, false);
  assert.ok(d.shakenDay >= b.day, 'twice refused, the unit loses heart');
});

function raid(state, { farmTiles = 6, marketTiles = 3, raiders = 2, humanSides } = {}) {
  const att = ['xiahou-yuan', 'xiahou-dun', 'cao-ren'].slice(0, raiders).map((officer) => ({ officer, troops: 3000, training: 70, unit: 'cav' }));
  return createBattle(state, {
    pid: 'xuchang', from: 'chenliu', walls: 50, farmTiles, marketTiles, intent: 'raid', humanSides,
    att: { force: 'cao-cao', officers: att, commander: 'xiahou-yuan', food: 500 },
    def: { force: 'yuan-shu', officers: [{ officer: 'ji-ling', troops: 3000, training: 50, unit: 'inf' }, { officer: 'yuan-yin', troops: 2000, training: 50, unit: 'arc' }], commander: 'ji-ling', food: 500 },
  });
}

// A site with no unit on it and no defender beside it.
const quietSite = (b, kind) => sitesOf(b, kind).find((h) => !b.units.some((x) => x.status === 'active'
  && (hexDist(x, h) === 0 || (x.side === 'def' && hexDist(x, h) === 1))));

const sitesOf = (b, kind) => {
  const out = [];
  for (let r = 0; r < BATTLE_H; r++) for (let c = 0; c < BATTLE_W; c++) if (siteAt(b, c, r)?.kind === kind) out.push({ c, r });
  return out;
};

test('the battlefield shows exactly as many fields and markets as the province has developed', () => {
  const state = createGame({ seed: 7 });
  const b = raid(state, { farmTiles: 7, marketTiles: 4 });
  assert.equal(sitesOf(b, 'farm').length, 7);
  assert.equal(sitesOf(b, 'market').length, 4);
  // The first markets ring the castle.
  for (const m of sitesOf(b, 'market')) assert.ok(hexDist(m, b.castle) <= 2);
});

test('only a unit that started its turn on a developed tile can raze it, and razing yields plunder', () => {
  const state = createGame({ seed: 7 });
  const b = raid(state);
  const u = b.units.find((x) => x.side === 'att');
  const farm = quietSite(b, 'farm');
  Object.assign(u, { c: farm.c, r: farm.r, moved: true, done: false });
  assert.equal(canRaze(b, u), false, 'moved this turn');
  u.moved = false;
  assert.equal(canRaze(b, u), true);
  const food = b.attFood;
  assert.ok(doRaze(state, b, u));
  assert.equal(b.attFood, food + RAZE_YIELD.farm.food);
  assert.equal(b.razed.farm, 1);
  assert.equal(canRaze(b, { ...u, done: false }), false, 'already razed');

  const v = b.units.filter((x) => x.side === 'att')[1];
  // Markets ring the castle; clear the defenders away so the raider is free.
  for (const x of b.units) if (x.side === 'def') x.c = 100;
  const market = quietSite(b, 'market');
  Object.assign(v, { c: market.c, r: market.r, moved: false, done: false });
  assert.ok(doRaze(state, b, v));
  assert.equal(v.loot, RAZE_YIELD.market.gold);
});

test('razed tiles cost the province a tile of development each', () => {
  const state = createGame({ seed: 7 });
  const dst = state.provinces.xuchang;
  const before = { farm: dst.farm, commerce: dst.commerce };
  const b = raid(state);
  b.razed = { farm: 2, market: 1 };
  b.result = { winner: 'def', reason: 'test' };
  finishBattle(state, b);
  assert.equal(dst.farm, Math.max(0, before.farm - 50));
  assert.equal(dst.commerce, Math.max(0, before.commerce - 60));
});

test('defenders deploy anywhere but the attackers\' approach; the commander holds the castle', () => {
  const state = createGame({ seed: 7 });
  const b = raid(state, { humanSides: { def: true } });
  assert.ok(b.deploying);
  const cmd = b.units.find((u) => u.side === 'def' && u.commander);
  assert.deepEqual({ c: cmd.c, r: cmd.r }, { c: b.castle.c, r: b.castle.r });
  assert.equal(canDeployAt(b, cmd, 7, 2), false);
  const u = b.units.find((x) => x.side === 'def' && !x.commander);
  const near = b.edge === 'west' ? [0, 1, 2] : [BATTLE_W - 1, BATTLE_W - 2, BATTLE_W - 3];
  for (const c of near) assert.equal(canDeployAt(b, u, c, 5), false, `column ${c}`);
  // Auto-deployment only uses legal hexes.
  assert.ok(canDeployAt(b, u, u.c, u.r));
  const far = b.edge === 'west' ? BATTLE_W - 1 : 0;
  const r = [...Array(BATTLE_H).keys()].find((y) => canDeployAt(b, u, far, y));
  assert.ok(deployUnit(b, u, far, r));
  assert.equal(u.c, far);
});

test('attackers withdraw freely from their own edge; a routed commander scatters the rest', () => {
  const state = createGame({ seed: 7 });
  let b = raid(state);
  let [cmd, other] = b.units.filter((u) => u.side === 'att');
  const edgeCol = b.edge === 'west' ? 0 : BATTLE_W - 1;
  const inner = b.edge === 'west' ? 5 : BATTLE_W - 6;
  Object.assign(cmd, { c: inner, r: 5 });
  assert.equal(canRetreat(b, cmd, state, b.retreatOptions), false);
  Object.assign(cmd, { c: edgeCol, r: 5 });
  assert.ok(inArrivalStrip(cmd.c));
  other.loot = 40;
  other.troops = 3000;
  assert.ok(doRetreat(state, b, cmd));
  assert.equal(b.result.winner, 'def');
  assert.equal(cmd.troops, 3000, 'orderly withdrawal costs nothing');
  assert.equal(other.troops, 2700);
  assert.equal(other.loot, 40);

  b = raid(state);
  [cmd, other] = b.units.filter((u) => u.side === 'att');
  other.loot = 40;
  cmd.status = 'routed';
  checkVictoryFor(state, b);
  assert.equal(other.troops, 1800);
  assert.equal(other.loot, 0);
});

test('an army of one still storms the castle rather than waiting out the month', () => {
  const state = createGame({ seed: 7 });
  const b = siege(state, { walls: 40, attTroops: 9000, defTroops: 200 });
  autoResolve(state, b);
  assert.equal(b.result.winner, 'att', b.result.reason);
  assert.ok(b.day < 30);
});

test('an officer given orders cannot also work a standing assignment that month', async () => {
  const { setTask } = await import('../src/engine/commands.js');
  const state = createGame({ humanRulers: ['cao-cao'], seed: 42 });
  newGameStart(state);
  advance(state);
  const p = state.provinces.chenliu;
  for (const x of officersIn(state, 'chenliu')) setTask(state, x.id, null);
  const o = officersIn(state, 'chenliu').find((x) => x.id !== 'cao-cao');
  assert.ok(playerCommand(state, 'develop', { field: 'farm', officer: o.id, gold: 100 }).ok);
  const afterOrder = p.farm;
  setTask(state, o.id, 'farm');
  playerCommand(state, 'rest', {});
  const month = state.month;
  while (state.month === month) {
    const r = advance(state);
    if (r.type === 'await') playerCommand(state, 'rest', {});
    else if (r.type !== 'month') break;
  }
  assert.notEqual(state.month, month, 'the month ended');
  assert.equal(p.farm, afterOrder, 'the assignment waits for next month');
  assert.equal(o.task, 'farm', 'and stays in place for next month');
});

test('a unit holding the castle may ignore challenges, and shame alone never routs a unit', async () => {
  const { doDuel, answerPendingDuel } = await import('../src/engine/battle.js');
  const state = createGame({ seed: 22 });
  const { b, a, d } = openField(state, 'inf', 'inf');
  b.humanSides = { att: false, def: true };
  // In the castle: no shame.
  d.c = b.castle.c; d.r = b.castle.r;
  a.c = neighbors(d.c, d.r)[0].c; a.r = neighbors(d.c, d.r)[0].r;
  const before = d.morale;
  doDuel(state, b, a, d);
  answerPendingDuel(state, b, false);
  assert.equal(d.morale, before);
  assert.equal(d.refusals, 0);
  // In the open, morale falls but stops at 20.
  const open = openField(state, 'inf', 'inf');
  open.b.humanSides = { att: false, def: true };
  for (let i = 0; i < 8; i++) {
    open.b.day += 3;
    open.a.done = false;
    doDuel(state, open.b, open.a, open.d);
    answerPendingDuel(state, open.b, false);
  }
  assert.equal(open.d.morale, 20);
  assert.equal(open.d.status, 'active');
});

test('War decides duels steeply: a wide gap rarely loses', async () => {
  const { duelWinChance } = await import('../src/engine/battle.js');
  const state = createGame({ seed: 22 });
  const { a, d } = openField(state, 'inf', 'inf');
  state.officers[a.officer] = { ...state.officers[a.officer], war: 90 };
  state.officers[d.officer] = { ...state.officers[d.officer], war: 70 };
  assert.ok(duelWinChance(state, a, d) > 0.95);
  state.officers[d.officer] = { ...state.officers[d.officer], war: 85 };
  const close = duelWinChance(state, a, d);
  assert.ok(close > 0.55 && close < 0.85, `close match stays risky (${close})`);
});

test('a unit engaged by an enemy cannot raze the tile it stands on', () => {
  const state = createGame({ seed: 7 });
  const b = raid(state);
  const u = b.units.find((x) => x.side === 'att');
  const farm = quietSite(b, 'farm');
  Object.assign(u, { c: farm.c, r: farm.r, moved: false, done: false });
  assert.ok(canRaze(b, u));
  const d = b.units.find((x) => x.side === 'def' && !x.commander);
  const next = neighbors(farm.c, farm.r).find((n) => !b.units.some((x) => x.c === n.c && x.r === n.r) && b.terrain[idx(n.c, n.r)] !== 'river');
  Object.assign(d, { c: next.c, r: next.r });
  assert.equal(canRaze(b, u), false);
});
