// How each lord regards every other: a base temperament affinity, plus
// remembered deeds that fade with time, plus grievances over lost homelands.
// Trust is separate: a lord's reputation for keeping faith, seen by all.

import { clamp } from '../rng.js';
import { ADJACENT } from '../map.js';
import { monthIndex, areAllied, forceName, log } from '../state.js';
import { traitOf, traitScale } from './traits.js';
import { grievance } from './homeland.js';

// Remembered deeds. `amount` is the default weight; `half` the half-life in
// months (vengeful lords remember wrongs longer).
export const DEEDS = {
  gift: { label: 'Sent gifts', half: 12 },
  alliance: { label: 'Swore an alliance with us', amount: 10, half: 36 },
  rebuffed: { label: 'Pressed an unwanted alliance', amount: -5, half: 6 },
  attacked: { label: 'Attacked us', amount: -25, half: 36 },
  raided: { label: 'Raided our lands', amount: -15, half: 24 },
  conquered: { label: 'Took a province from us', amount: -20, half: 60 },
  attackedFriend: { label: 'Attacked our friend', half: 24 },
  sharedEnemy: { label: 'Fights our enemy', amount: 6, half: 24 },
  released: { label: 'Released our officer', amount: 8, half: 24 },
  executed: { label: 'Executed our officer', amount: -30, half: 60 },
  betrayed: { label: 'Betrayed us', amount: -50, half: 120 },
  spyCaught: { label: 'Sent spies against us', amount: -15, half: 24 },
  coalition: { label: 'Fellow member of the coalition', amount: 15, half: 36 },
  usurper: { label: 'Usurper of the Han court', amount: -25, half: 60 },
  rebel: { label: 'Raised the coalition against us', amount: -20, half: 60 },
  rivalry: { label: 'Old family rivalry', amount: -15, half: 240 },
};

export const TRUCE_MONTHS = 12;

// ---- Setup -------------------------------------------------------------------

export function initOpinion(state, bonds = {}) {
  const id = (name) => Object.keys(state.forces).find((f) => state.officers[state.forces[f].ruler]?.name === name);
  for (const f of Object.values(state.forces)) {
    f.memory = {};
    f.contacts = {};
    f.truces = {};
    f.trust = trustBaseline(state, f.id);
  }
  const coalition = (bonds.coalition || []).map(id).filter(Boolean);
  for (const a of coalition) {
    for (const b of coalition) if (a !== b) remember(state, a, b, 'coalition');
    const foe = bonds.against && id(bonds.against);
    if (foe) {
      remember(state, a, foe, 'usurper');
      remember(state, foe, a, 'rebel');
    }
  }
  for (const [x, y] of bonds.rivalries || []) {
    const a = id(x);
    const b = id(y);
    if (a && b) {
      remember(state, a, b, 'rivalry');
      remember(state, b, a, 'rivalry');
    }
  }
}

export const trustBaseline = (state, fid) => 50 + (traitOf(state, fid, 'honour') - 3) * 10;

// ---- Memory ------------------------------------------------------------------

// `holder` remembers something `about` did.
export function remember(state, holder, about, kind, amount = DEEDS[kind].amount) {
  const f = state.forces[holder];
  if (!f || !about || holder === about || !amount) return;
  const list = (f.memory[about] ||= []);
  list.push({ kind, amount: Math.round(amount), at: monthIndex(state) });
  if (list.length > 24) list.splice(0, list.length - 24);
}

function halfLife(state, holder, deed, amount) {
  return DEEDS[deed].half * (amount < 0 ? traitScale(state, holder, 'vengeance', 0.3) : 1);
}

function current(state, holder, m) {
  const age = monthIndex(state) - m.at;
  return m.amount * Math.pow(0.5, age / halfLife(state, holder, m.kind, m.amount));
}

// Remembered deeds of `about`, summed by kind: [{kind, label, value}].
export function deedsOf(state, holder, about) {
  const by = {};
  for (const m of state.forces[holder]?.memory?.[about] || []) by[m.kind] = (by[m.kind] || 0) + current(state, holder, m);
  return Object.entries(by)
    .filter(([, v]) => Math.abs(v) >= 1)
    .map(([kind, value]) => ({ kind, label: DEEDS[kind].label, value }));
}

// ---- Opinion -----------------------------------------------------------------

// How lord `a` regards lord `b`, 0 (implacable) to 100 (devoted).
export function opinionOf(state, a, b) {
  if (!a || !b || a === b) return 50;
  const parts = opinionParts(state, a, b);
  return clamp(Math.round(50 + parts.reduce((s, p) => s + p.value, 0)), 0, 100);
}

// Everything behind an opinion. `known` marks what the other lord can see:
// their own deeds and their hold on the first lord's homeland are public; the
// temperament beneath is not.
export function opinionParts(state, a, b) {
  const parts = deedsOf(state, a, b).map((d) => ({ ...d, known: true }));
  const g = grievance(state, a, b);
  if (g) parts.push({ kind: 'homeland', label: `Holds ${g} of our homeland province${g > 1 ? 's' : ''}`, value: -Math.min(36, g * 12), known: true });
  if (areAllied(state, a, b)) parts.push({ kind: 'allied', label: 'Allies', value: 10, known: true });
  // Like favours like: the honourable find the faithless distasteful.
  const honour = traitOf(state, a, 'honour');
  const affinity = -2 * Math.abs(honour - traitOf(state, b, 'honour'))
    + (state.forces[b].trust - 50) * 0.15 * (honour / 3);
  if (Math.abs(affinity) >= 1) parts.push({ kind: 'temperament', label: 'Temperament and reputation', value: affinity, known: false });
  return parts;
}

export const STANDING_WORDS = [
  [80, 'Devoted'], [65, 'Friendly'], [55, 'Cordial'], [45, 'Indifferent'], [35, 'Wary'], [20, 'Hostile'], [-1, 'Implacable'],
];
export const standingWord = (op) => STANDING_WORDS.find(([min]) => op >= min)[1];

// ---- Trust -------------------------------------------------------------------

export const trustOf = (state, fid) => state.forces[fid]?.trust ?? 50;

export function loseTrust(state, fid, amount) {
  const f = state.forces[fid];
  f.trust = clamp(f.trust - amount, 0, 100);
}

export const TRUST_WORDS = [[70, 'Renowned for keeping faith'], [58, 'Trusted'], [45, 'Of fair repute'], [35, 'Doubted'], [20, 'Distrusted'], [-1, 'Faithless']];
export const trustWord = (t) => TRUST_WORDS.find(([min]) => t >= min)[1];

// ---- What a lord can see -----------------------------------------------------

export function neighboursOf(state, fid) {
  const out = new Set();
  for (const p of Object.values(state.provinces)) {
    if (p.owner !== fid) continue;
    for (const n of ADJACENT[p.id]) {
      const o = state.provinces[n].owner;
      if (o && o !== fid) out.add(o);
    }
  }
  return out;
}

// Neighbours' attitudes are plain to see; farther lords need an envoy or a
// spy within the last year.
export const CONTACT_MONTHS = 12;
export function canSeeStanding(state, viewer, fid) {
  if (!viewer || !fid || viewer === fid) return true;
  if (neighboursOf(state, viewer).has(fid)) return true;
  return monthIndex(state) - (state.forces[viewer].contacts?.[fid] ?? -999) <= CONTACT_MONTHS;
}

export function makeContact(state, viewer, fid) {
  if (state.forces[viewer]) state.forces[viewer].contacts[fid] = monthIndex(state);
}

// ---- Deeds of war ------------------------------------------------------------

export const inTruce = (state, a, b) => (state.forces[a]?.truces?.[b] ?? -1) > monthIndex(state);

// Attacking an ally breaks the alliance; attacking a recent ally breaks the
// truce. Either way everyone hears of it.
export function onAttack(state, fa, fd, { raid = false } = {}) {
  if (!fa || !fd) return;
  if (areAllied(state, fa, fd)) {
    delete state.forces[fa].alliances[fd];
    delete state.forces[fd].alliances[fa];
    remember(state, fd, fa, 'betrayed');
    loseTrust(state, fa, 30);
    log(state, `${forceName(state, fa)} breaks faith with ${forceName(state, fd)} and attacks an ally!`, 'major', [fa, fd]);
  } else if (inTruce(state, fa, fd)) {
    remember(state, fd, fa, 'betrayed', -25);
    loseTrust(state, fa, 15);
    delete state.forces[fa].truces[fd];
    delete state.forces[fd].truces[fa];
    log(state, `${forceName(state, fa)} breaks the truce with ${forceName(state, fd)}.`, 'warn', [fa, fd]);
  }
  remember(state, fd, fa, raid ? 'raided' : 'attacked');
  // Third parties take sides by whom they like.
  for (const c of Object.values(state.forces)) {
    if (!c.alive || c.id === fa || c.id === fd) continue;
    const op = opinionOf(state, c.id, fd);
    if (op >= 65) remember(state, c.id, fa, 'attackedFriend', -(op - 50) / 2 - (areAllied(state, c.id, fd) ? 10 : 0));
    else if (op <= 30) remember(state, c.id, fa, 'sharedEnemy');
  }
}

// ---- Monthly -----------------------------------------------------------------

export function opinionMonthly(state) {
  const now = monthIndex(state);
  for (const f of Object.values(state.forces)) {
    if (!f.alive) continue;
    // Alliances lapse into a year's truce.
    for (const [other, until] of Object.entries(f.alliances)) {
      if (until <= now + 1) {
        delete f.alliances[other];
        f.truces[other] = now + TRUCE_MONTHS;
        if (f.id < other) log(state, `The alliance between ${forceName(state, f.id)} and ${forceName(state, other)} has lapsed; a truce holds for a year.`, 'info', [f.id, other]);
      }
    }
    // A reputation slowly recovers toward what the lord's nature earns.
    const base = trustBaseline(state, f.id);
    f.trust += clamp(base - f.trust, -0.5, 0.5);
    // Forget what has faded away.
    for (const [other, list] of Object.entries(f.memory)) {
      const kept = list.filter((m) => Math.abs(current(state, f.id, m)) >= 0.5);
      if (kept.length) f.memory[other] = kept;
      else delete f.memory[other];
    }
  }
}
