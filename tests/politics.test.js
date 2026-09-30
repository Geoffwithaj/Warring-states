import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, officersIn, provincesOf, monthIndex, capitalOf } from '../src/engine/state.js';
import { newGameStart, advance, playerCommand } from '../src/engine/turn.js';
import { declareWar } from '../src/engine/war.js';
import { handleRulerLoss } from '../src/engine/succession.js';
import { ADJACENT } from '../src/engine/map.js';
import {
  opinionOf, remember, trustOf, canSeeStanding, neighboursOf, onAttack, isHomeland, politicsMonthly, grievance,
  gatherIntelligence, inTruce,
} from '../src/engine/politics/index.js';
import { gatherFacts } from '../src/engine/politics/intel.js';

const later = (state, months) => {
  const m = monthIndex(state) + months;
  state.year = Math.floor(m / 12);
  state.month = (m % 12) + 1;
};

test('every house has a temperament, and an heir carries it on', () => {
  const state = createGame({ seed: 5 });
  for (const f of Object.values(state.forces)) {
    for (const t of ['ambition', 'honour', 'boldness', 'vengeance', 'guile']) assert.ok(f.traits[t] >= 1 && f.traits[t] <= 5, `${f.id} ${t}`);
  }
  const before = { ...state.forces['cao-cao'].traits };
  state.officers['cao-cao'].status = 'dead';
  handleRulerLoss(state, 'cao-cao');
  assert.notEqual(state.forces['cao-cao'].ruler, 'cao-cao');
  assert.deepEqual(state.forces['cao-cao'].traits, before);
});

test('the coalition begins united against Dong Zhuo', () => {
  const state = createGame({ seed: 5 });
  assert.ok(opinionOf(state, 'cao-cao', 'sun-jian') > 55);
  assert.ok(opinionOf(state, 'cao-cao', 'dong-zhuo') < 40);
  assert.ok(opinionOf(state, 'yuan-shao', 'yuan-shu') < opinionOf(state, 'yuan-shao', 'cao-cao'), 'the Yuan brothers are rivals');
});

test('remembered wrongs fade, and linger longer with the vengeful', () => {
  const state = createGame({ seed: 5 });
  const base = (a, b) => opinionOf(state, a, b);
  // Gongsun Zan is vengeful, Liu Yu forgiving; both wronged by Cao Cao.
  const zan0 = base('gongsun-zan', 'cao-cao');
  const yu0 = base('liu-yu', 'cao-cao');
  remember(state, 'gongsun-zan', 'cao-cao', 'attacked');
  remember(state, 'liu-yu', 'cao-cao', 'attacked');
  assert.equal(base('gongsun-zan', 'cao-cao'), zan0 - 25);
  later(state, 36);
  const zanLeft = zan0 - base('gongsun-zan', 'cao-cao');
  const yuLeft = yu0 - base('liu-yu', 'cao-cao');
  assert.ok(zanLeft > yuLeft, `vengeful ${zanLeft} vs forgiving ${yuLeft}`);
  later(state, 400);
  politicsMonthly(state);
  assert.equal(state.forces['liu-yu'].memory['cao-cao'], undefined, 'faded deeds are forgotten');
});

test('attacking an ally breaks the alliance, costs trust with everyone and angers the victim\'s friends', () => {
  const state = createGame({ seed: 5 });
  const until = monthIndex(state) + 36;
  state.forces['cao-cao'].alliances['yuan-shao'] = until;
  state.forces['yuan-shao'].alliances['cao-cao'] = until;
  // Han Fu admires Yuan Shao.
  remember(state, 'han-fu', 'yuan-shao', 'gift', 30);
  const trust = trustOf(state, 'cao-cao');
  const shao = opinionOf(state, 'yuan-shao', 'cao-cao');
  const fu = opinionOf(state, 'han-fu', 'cao-cao');
  onAttack(state, 'cao-cao', 'yuan-shao');
  assert.equal(state.forces['cao-cao'].alliances['yuan-shao'], undefined);
  assert.equal(trustOf(state, 'cao-cao'), trust - 30);
  assert.ok(opinionOf(state, 'yuan-shao', 'cao-cao') <= shao - 60);
  assert.ok(opinionOf(state, 'han-fu', 'cao-cao') < fu - 5);
});

test('a lapsed alliance leaves a truce; breaking it costs trust', () => {
  const state = createGame({ seed: 5 });
  state.forces['cao-cao'].alliances['liu-dai'] = monthIndex(state) + 1;
  state.forces['liu-dai'].alliances['cao-cao'] = monthIndex(state) + 1;
  politicsMonthly(state);
  assert.ok(inTruce(state, 'cao-cao', 'liu-dai'));
  const trust = trustOf(state, 'cao-cao');
  onAttack(state, 'cao-cao', 'liu-dai');
  assert.equal(trustOf(state, 'cao-cao'), trust - 15);
  assert.ok(!inTruce(state, 'cao-cao', 'liu-dai'));
});

test('homelands: lost ones are resented and defended hard; long-held land becomes homeland', () => {
  const state = createGame({ seed: 5 });
  const pid = provincesOf(state, 'liu-dai')[0].id;
  assert.ok(isHomeland(state, pid, 'liu-dai'));
  // Cao Cao takes it by force.
  const from = ADJACENT[pid].find((n) => state.provinces[n].owner === 'cao-cao');
  for (const o of officersIn(state, pid)) o.troops = 0;
  const before = opinionOf(state, 'liu-dai', 'cao-cao');
  declareWar(state, { from, to: pid, officerIds: [officersIn(state, from)[0].id], food: 0 });
  assert.equal(state.provinces[pid].owner, 'cao-cao');
  if (state.forces['liu-dai'].alive) {
    assert.equal(grievance(state, 'liu-dai', 'cao-cao'), 1);
    assert.ok(opinionOf(state, 'liu-dai', 'cao-cao') < before - 30);
  }
  assert.ok(!isHomeland(state, pid, 'cao-cao'));
  state.provinces[pid].order = 70;
  later(state, 121);
  politicsMonthly(state);
  assert.ok(isHomeland(state, pid, 'cao-cao'));
});

test('neighbours\' attitudes are visible; distant lords need an envoy', () => {
  const state = createGame({ humanRulers: ['cao-cao'], seed: 42 });
  const near = [...neighboursOf(state, 'cao-cao')][0];
  assert.ok(canSeeStanding(state, 'cao-cao', near));
  const far = 'meng-huo';
  assert.ok(!neighboursOf(state, 'cao-cao').has(far));
  assert.ok(!canSeeStanding(state, 'cao-cao', far));
  newGameStart(state);
  advance(state);
  const envoy = officersIn(state, 'chenliu').find((o) => o.id !== 'cao-cao');
  const res = playerCommand(state, 'gift', { officer: envoy.id, target: far, gold: 50 });
  assert.ok(res.ok, res.msg);
  assert.ok(canSeeStanding(state, 'cao-cao', far));
  later(state, 13);
  assert.ok(!canSeeStanding(state, 'cao-cao', far));
});

test('gifts win goodwill, each a little less than the last', () => {
  const state = createGame({ humanRulers: ['cao-cao'], seed: 42 });
  newGameStart(state);
  advance(state);
  const envoys = officersIn(state, 'chenliu');
  const o0 = opinionOf(state, 'liu-dai', 'cao-cao');
  playerCommand(state, 'gift', { officer: envoys[0].id, target: 'liu-dai', gold: 200 });
  const o1 = opinionOf(state, 'liu-dai', 'cao-cao');
  playerCommand(state, 'gift', { officer: envoys[1].id, target: 'liu-dai', gold: 200 });
  const o2 = opinionOf(state, 'liu-dai', 'cao-cao');
  assert.ok(o1 > o0 && o2 > o1);
  assert.ok(o2 - o1 < o1 - o0);
});

test('intelligence reports only true things, in stock phrases', () => {
  const state = createGame({ seed: 5 });
  const facts = gatherFacts(state, 'cao-cao', 'liu-bei');
  const text = facts.map((f) => f.plain).join(' ');
  assert.match(text, /Cao Cao's ambition knows no bounds/);
  assert.match(text, /Cao Cao is a master of stratagem/);
  assert.doesNotMatch(text, /Cao Cao keeps faith/, 'honour 3 is unremarkable');
  assert.ok(facts.some((f) => f.cat === 'desire'));
  for (const f of facts) assert.ok(f.plain && f.vague && f.key);
});

test('an agent brings back a report, costs gold and uses the officer\'s month; a failed one may be caught', () => {
  const state = createGame({ humanRulers: ['cao-cao'], seed: 42 });
  newGameStart(state);
  advance(state);
  const p = state.provinces.chenliu;
  assert.equal(playerCommand(state, 'spy', { officer: 'cao-cao', target: 'dong-zhuo' }).ok, false, 'the lord does not spy in person');
  const agent = officersIn(state, 'chenliu').filter((o) => o.id !== 'cao-cao').sort((a, b) => b.int - a.int)[0];
  agent.int = 100;
  const gold = p.gold;
  let res;
  for (let i = 0; i < 10; i++) {
    res = playerCommand(state, 'spy', { officer: agent.id, target: 'dong-zhuo' });
    if (res.ok) break;
  }
  assert.ok(res.ok, res.msg);
  assert.equal(p.gold, gold - 50);
  assert.ok(Array.isArray(res.intel));
  const again = playerCommand(state, 'spy', { officer: agent.id, target: 'dong-zhuo' });
  assert.equal(again.ok, false, 'one job a month');

  // A hopeless agent sent many times is caught sooner or later.
  const dunce = { ...agent, id: 'x', int: 1, force: 'cao-cao', province: 'chenliu' };
  let caught = false;
  for (let i = 0; i < 60 && !caught; i++) caught = gatherIntelligence(state, dunce, 'dong-zhuo').caught;
  assert.ok(caught);
  assert.ok(opinionOf(state, 'dong-zhuo', 'cao-cao') < 40);
  if (res.intel.length) assert.ok(state.intel['cao-cao'].length >= res.intel.length);
  assert.ok(capitalOf(state, 'dong-zhuo'));
});
