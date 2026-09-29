import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, provincesOf, officerList } from '../src/engine/state.js';
import { newGameStart, advance } from '../src/engine/turn.js';

function summary(state) {
  return Object.values(state.forces)
    .filter((f) => f.alive)
    .map((f) => [state.officers[f.ruler].name, provincesOf(state, f.id).length])
    .sort((a, b) => b[1] - a[1]);
}

test('an all-AI game runs for 15 years without errors and stays consistent', () => {
  const state = createGame({ seed: 12345 });
  newGameStart(state);
  for (let m = 0; m < 180 && !state.gameOver; m++) {
    const r = advance(state, { stopAtMonthEnd: true });
    assert.equal(r.type === 'month' || r.type === 'gameover', true, `unexpected stop ${r.type}`);
    for (const p of Object.values(state.provinces)) {
      assert.ok(p.gold >= 0, `${p.id} gold ${p.gold}`);
      assert.ok(p.food >= 0, `${p.id} food ${p.food}`);
      assert.ok(Number.isFinite(p.order));
    }
    for (const o of officerList(state)) {
      if (o.status === 'serving') {
        assert.ok(state.forces[o.force].alive, `${o.name} serves dead force`);
        assert.equal(state.provinces[o.province].owner, o.force, `${o.name} in foreign province ${o.province}`);
        assert.ok(o.troops >= 0);
      }
    }
  }
  console.log(state.year, state.month, JSON.stringify(summary(state)));
  console.log(state.log.filter((l) => l.kind === 'major').slice(-15).map((l) => l.date + ' ' + l.msg).join('\n'));
});
