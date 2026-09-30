// Hidden temperaments of each house. Traits belong to the faction, so an heir
// carries on the house's strategy. Each runs from 1 to 5.

import { clamp } from '../rng.js';

export const TRAITS = {
  ambition: { label: 'Ambition', high: 'expands and picks fights', low: 'content to hold what it has' },
  honour: { label: 'Honour', high: 'keeps its word and its treaties', low: 'breaks faith when it pays' },
  boldness: { label: 'Boldness', high: 'attacks at poor odds', low: 'waits for overwhelming strength' },
  vengeance: { label: 'Vengefulness', high: 'nurses grudges and seeks revenge', low: 'forgives and forgets' },
  guile: { label: 'Guile', high: 'prefers raids, plots and deceit', low: 'makes open war' },
};

// ambition, honour, boldness, vengeance, guile — after the novel.
const T = (ambition, honour, boldness, vengeance, guile) => ({ ambition, honour, boldness, vengeance, guile });
export const FACTION_TRAITS = {
  'dong-zhuo': T(5, 1, 4, 4, 3),
  'yuan-shao': T(4, 3, 2, 3, 2),
  'han-fu': T(1, 3, 1, 2, 1),
  'cao-cao': T(5, 3, 4, 3, 5),
  'liu-bei': T(3, 5, 2, 2, 1),
  'sun-jian': T(4, 4, 5, 4, 2),
  'yuan-shu': T(5, 1, 2, 4, 3),
  'liu-biao': T(1, 3, 1, 2, 2),
  'liu-yan': T(2, 2, 1, 2, 3),
  'zhang-lu': T(1, 4, 1, 1, 2),
  'ma-teng': T(3, 4, 3, 3, 1),
  'han-sui': T(3, 1, 3, 3, 4),
  'gongsun-zan': T(4, 2, 5, 5, 1),
  'liu-yu': T(1, 5, 1, 1, 1),
  'gongsun-du': T(3, 2, 3, 3, 3),
  'kong-rong': T(1, 4, 1, 2, 1),
  'tao-qian': T(2, 3, 2, 2, 2),
  'liu-dai': T(2, 3, 2, 3, 2),
  'liu-yao': T(2, 3, 2, 2, 2),
  'yan-baihu': T(2, 2, 3, 3, 2),
  'wang-lang': T(1, 4, 1, 2, 1),
  'shi-xie': T(1, 4, 1, 1, 3),
  'zhang-yan': T(3, 2, 3, 3, 4),
  'meng-huo': T(3, 3, 5, 4, 1),
};

// A house without a written temperament takes one from its founder's stats.
export function traitsFromOfficer(o) {
  const s = (v) => clamp(Math.round(v), 1, 5);
  return T(s(1 + (o.war + o.cha) / 50), s(1 + o.cha / 30), s(1 + o.war / 30), s(3), s(1 + o.int / 30));
}

export function initTraits(state) {
  for (const f of Object.values(state.forces)) {
    f.traits = { ...(FACTION_TRAITS[f.id] || traitsFromOfficer(state.officers[f.ruler])) };
  }
}

export const traitOf = (state, fid, t) => state.forces[fid]?.traits?.[t] ?? 3;

// A trait as a multiplier around 1: level 3 gives 1, each step moves by `step`.
export const traitScale = (state, fid, t, step) => 1 + (traitOf(state, fid, t) - 3) * step;
