// What a house wants, and how it means to get it. A computer lord picks a war
// goal — one province to take — and holds to it for months: officers and
// troops gather at a staging province on the border, raiders soften the
// target, and the blow falls once the army is strong enough.

import { ADJACENT } from '../map.js';
import { provinceStrength, strengthOf, officersOf, officersIn, monthIndex, forceName, log, areAllied } from '../state.js';
import { traitOf, traitScale } from './traits.js';
import { opinionOf, inTruce } from './opinion.js';
import { lostHomeland, isHomeland } from './homeland.js';

export const GOAL_PATIENCE = 30; // months before a stalled goal is given up
const GOAL_BAN = 24; // months before a failed target is tried again
const RETHINK = 3; // months between looks for a new goal

// Would this lord make war on that one? Allies and lords under truce are
// safe unless the lord is faithless and has come to hate them.
export function wouldAttack(state, fid, other) {
  if (!other || other === fid) return false;
  if (areAllied(state, fid, other)) return traitOf(state, fid, 'honour') <= 1 && opinionOf(state, fid, other) < 30;
  if (inTruce(state, fid, other)) return traitOf(state, fid, 'honour') <= 2 && opinionOf(state, fid, other) < 40;
  return true;
}

// A province the lord has recently failed to take, or given up on.
export const isOffLimits = (state, fid, pid) => (state.forces[fid]?.goalBans?.[pid] ?? -1) > monthIndex(state);

// How many times the defence a lord wants before striking at its goal.
export function strikeRatio(state, fid, target) {
  return 1.3 * traitScale(state, fid, 'boldness', -0.06) * (isHomeland(state, target, fid) ? 0.75 : 1);
}

// Strength an army can bring against a province: cavalry can neither breach
// walls nor storm a castle.
export function usableStrength(state, officers, target) {
  const walled = state.provinces[target].walls > 30;
  return officers.reduce((s, o) => s + strengthOf(o) * (walled && o.unit === 'cav' ? 0.5 : 1), 0);
}

const prize = (state, pid) => {
  const q = state.provinces[pid];
  return q.pop / 1000 + q.farm + q.commerce;
};

// Own provinces reachable from `from` without leaving the realm, by distance.
export function realmDistance(state, fid, from) {
  const dist = { [from]: 0 };
  const queue = [from];
  while (queue.length) {
    const p = queue.shift();
    for (const n of ADJACENT[p]) {
      if (dist[n] === undefined && state.provinces[n].owner === fid) {
        dist[n] = dist[p] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

// The province `fid` most desires: a lost homeland first, else the richest
// prize beside its borders for the strength defending it.
export function covetedProvince(state, fid) {
  const g = state.forces[fid]?.goal;
  if (g) return { pid: g.target, homeland: isHomeland(state, g.target, fid) };
  const lost = lostHomeland(state, fid);
  if (lost.length) return { pid: lost.reduce((a, b) => (a.pop >= b.pop ? a : b)).id, homeland: true };
  let best = null;
  for (const p of Object.values(state.provinces)) {
    if (p.owner !== fid) continue;
    for (const n of ADJACENT[p.id]) {
      if (state.provinces[n].owner === fid) continue;
      const value = prize(state, n) / (provinceStrength(state, n) / 1000 + 5);
      if (!best || value > best.value) best = { pid: n, value, homeland: false };
    }
  }
  return best;
}

// Choose a war goal: a neighbouring province worth the cost that the realm
// could muster enough to take. Lost homeland and hated owners weigh heavily.
export function chooseGoal(state, fid) {
  const f = state.forces[fid];
  const ambition = traitOf(state, fid, 'ambition');
  const lost = new Set(lostHomeland(state, fid).map((p) => p.id));
  const now = monthIndex(state);
  const officers = officersOf(state, fid);
  // Most of the realm's strength can be brought to one border in time.
  const potential = officers.reduce((s, o) => s + strengthOf(o), 0) * 0.65;
  let best = null;
  for (const p of Object.values(state.provinces)) {
    if (p.owner !== fid) continue;
    for (const t of ADJACENT[p.id]) {
      const q = state.provinces[t];
      if (!q.owner || !wouldAttack(state, fid, q.owner)) continue;
      if ((f.goalBans?.[t] ?? -1) > now) continue;
      const home = lost.has(t);
      // The content fight only for their own soil.
      if (!home && ambition <= 1) continue;
      const def = provinceStrength(state, t);
      if (potential < def * strikeRatio(state, fid, t)) continue;
      const hatred = 1 + (50 - opinionOf(state, fid, q.owner)) / 100;
      const score = (prize(state, t) / (def / 1000 + 5)) * hatred * (home ? 3 : 1);
      if (!best || score > best.score) best = { target: t, score };
    }
  }
  if (!best) return null;
  return { target: best.target, staging: pickStaging(state, fid, best.target), since: now, fails: 0 };
}

// The border province to gather in: the strongest of ours beside the target.
export function pickStaging(state, fid, target) {
  const options = ADJACENT[target].filter((n) => state.provinces[n].owner === fid);
  if (!options.length) return null;
  return options.reduce((a, b) => (provinceStrength(state, a) >= provinceStrength(state, b) ? a : b));
}

function dropGoal(state, fid, ban) {
  const f = state.forces[fid];
  if (ban && f.goal) (f.goalBans ||= {})[f.goal.target] = monthIndex(state) + GOAL_BAN;
  f.goal = null;
  f.goalCheck = monthIndex(state);
}

// Once a month: keep each computer lord's goal valid, drop stalled ones, and
// look for a new one now and then. Ambitious lords look more often.
export function updateGoals(state) {
  const now = monthIndex(state);
  for (const f of Object.values(state.forces)) {
    if (!f.alive || f.human) continue;
    const g = f.goal;
    if (g) {
      const t = state.provinces[g.target];
      if (t.owner === f.id || !t.owner || !wouldAttack(state, f.id, t.owner)) dropGoal(state, f.id, false);
      else if (now - g.since > GOAL_PATIENCE) dropGoal(state, f.id, true);
      else if (state.provinces[g.staging]?.owner !== f.id) {
        g.staging = pickStaging(state, f.id, g.target);
        if (!g.staging) dropGoal(state, f.id, false);
      }
    }
    if (!f.goal && now - (f.goalCheck ?? -99) >= RETHINK) {
      f.goalCheck = now;
      if (traitOf(state, f.id, 'ambition') >= 2 || lostHomeland(state, f.id).length) f.goal = chooseGoal(state, f.id);
    }
    if (f.goal) warnTarget(state, f.id);
  }
}

// A human lord whose province is the target notices the army gathering once
// it grows threatening.
function warnTarget(state, fid) {
  const g = state.forces[fid].goal;
  const owner = state.provinces[g.target].owner;
  if (g.warned || !state.forces[owner]?.human) return;
  if (provinceStrength(state, g.staging) < provinceStrength(state, g.target) * 1.2) return;
  g.warned = true;
  log(state, `Scouts report that ${forceName(state, fid)} is massing troops at ${state.provinces[g.staging].name}, across the border from ${state.provinces[g.target].name}.`, 'warn', [owner]);
}

// After a battle for the goal: taking it ends the goal; failing twice gives
// it up for a while. Any other failed attack puts the lord off that province
// for half a year.
export const RETRY_AFTER = 6;
export function onGoalBattle(state, fid, pid, won) {
  const f = state.forces[fid];
  const g = f?.goal;
  if (!won && f && g?.target !== pid) (f.goalBans ||= {})[pid] = Math.max(f.goalBans[pid] ?? 0, monthIndex(state) + RETRY_AFTER);
  if (!g || g.target !== pid) return;
  if (won) return dropGoal(state, fid, false);
  g.fails += 1;
  if (g.fails >= 2) dropGoal(state, fid, true);
}

// Is a province just won worth holding? Its lord's war goal or lost homeland
// always is; otherwise only if the victors could stand against the strongest
// hostile neighbour.
export function wantsToHold(state, fid, pid, armyStrength) {
  if (state.forces[fid]?.goal?.target === pid || isHomeland(state, pid, fid)) return true;
  const threat = Math.max(0, ...ADJACENT[pid].map((n) => {
    const owner = state.provinces[n].owner;
    if (!owner || owner === fid || areAllied(state, fid, owner)) return 0;
    return officersIn(state, n).reduce((s, o) => s + strengthOf(o), 0);
  }));
  return armyStrength >= threat * 1.2;
}

// Where a house's lord keeps court. It is the starting capital until that is
// lost; then wherever the lord happens to be.
export function seatOf(state, fid) {
  const f = state.forces[fid];
  const ruler = state.officers[f.ruler];
  if (!f.seat || state.provinces[f.seat]?.owner !== fid) f.seat = ruler?.status === 'serving' ? ruler.province : null;
  return f.seat;
}
