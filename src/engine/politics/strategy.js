// What a house wants. For now: the one province it covets most. (A fuller
// strategic layer — war goals, massing forces — builds on this.)

import { ADJACENT } from '../map.js';
import { provinceStrength } from '../state.js';
import { lostHomeland } from './homeland.js';

// The province `fid` most desires: a lost homeland first, else the richest
// prize beside its borders for the strength defending it.
export function covetedProvince(state, fid) {
  const lost = lostHomeland(state, fid);
  if (lost.length) return { pid: lost.reduce((a, b) => (a.pop >= b.pop ? a : b)).id, homeland: true };
  let best = null;
  for (const p of Object.values(state.provinces)) {
    if (p.owner !== fid) continue;
    for (const n of ADJACENT[p.id]) {
      const q = state.provinces[n];
      if (q.owner === fid) continue;
      const value = (q.pop / 1000 + q.farm + q.commerce) / (provinceStrength(state, n) / 1000 + 5);
      if (!best || value > best.value) best = { pid: n, value, homeland: false };
    }
  }
  return best;
}
