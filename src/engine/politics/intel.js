// Espionage, starting with intelligence gathering: an officer travels to a
// lord's court and brings back a few true things about it. Cleverer agents
// learn more and speak more plainly.

import { chance, clamp, shuffle } from '../rng.js';
import { officersOf, provincesOf, capitalOf, forceName, monthIndex, areAllied, troopsIn, dateLabel } from '../state.js';
import { distanceMap } from '../map.js';
import { traitOf } from './traits.js';
import { opinionOf, remember, makeContact } from './opinion.js';
import { lostHomeland } from './homeland.js';
import { covetedProvince } from './strategy.js';

export const SPY_COST = 50;
const JOURNAL_MAX = 80;

// Chance the agent learns anything: their Intelligence against the sharpest
// mind at the target's court, and the distance travelled.
export function spyChance(state, agent, target) {
  const best = Math.max(0, ...officersOf(state, target).map((o) => o.int));
  const capital = capitalOf(state, target);
  const dist = capital ? distanceMap([agent.province])[capital] ?? 6 : 6;
  return clamp(0.45 + (agent.int - best) / 80 - Math.max(0, dist - 2) * 0.04, 0.1, 0.9);
}

// How many things a successful agent brings back, and how plainly.
export const factsFor = (agent) => 2 + (agent.int >= 75 ? 1 : 0) + (agent.int >= 90 ? 1 : 0);
export const plainChance = (agent) => clamp((agent.int - 40) / 35, 0.1, 1);

export function gatherIntelligence(state, agent, target) {
  const viewer = agent.force;
  if (!chance(state, spyChance(state, agent, target))) {
    const caught = chance(state, 0.35);
    if (caught) remember(state, target, viewer, 'spyCaught');
    return { ok: false, caught };
  }
  makeContact(state, viewer, target);
  const known = new Set((state.intel?.[viewer] || []).filter((e) => e.about === target && monthIndex(state) - e.at < 12).map((e) => e.key));
  const facts = gatherFacts(state, target, viewer);
  const fresh = facts.filter((f) => !known.has(f.key));
  const pool = [...shuffle(state, fresh.filter((f) => f.weight > 1)), ...shuffle(state, fresh.filter((f) => f.weight <= 1))];
  // One fact per category first, so a report covers different ground.
  const picked = [];
  const cats = new Set();
  for (const f of pool) if (picked.length < factsFor(agent) && !cats.has(f.cat)) { picked.push(f); cats.add(f.cat); }
  for (const f of pool) if (picked.length < factsFor(agent) && !picked.includes(f)) picked.push(f);
  const entries = picked.map((f) => ({
    at: monthIndex(state), date: dateLabel(state), about: target, key: f.key,
    text: chance(state, plainChance(agent)) ? f.plain : f.vague, by: agent.name,
  }));
  state.intel ||= {};
  const journal = (state.intel[viewer] ||= []);
  journal.push(...entries);
  if (journal.length > JOURNAL_MAX) journal.splice(0, journal.length - JOURNAL_MAX);
  return { ok: true, entries };
}

// ---- Facts -------------------------------------------------------------------

const TRAIT_PHRASES = {
  ambition: {
    5: (n) => `${n}'s ambition knows no bounds; nothing short of all under heaven will do.`,
    4: (n) => `${n} is ambitious and hungry for land.`,
    2: (n) => `${n} has little appetite for conquest.`,
    1: (n) => `${n} wants only to keep what is already held.`,
    high: (n) => `${n} seems ambitious.`,
    low: (n) => `${n} seems content with what is held.`,
  },
  honour: {
    5: (n) => `${n} keeps faith; a treaty with ${n} will hold.`,
    4: (n) => `${n} is known to honour agreements.`,
    2: (n) => `${n}'s promises are worth little when there is advantage to be had.`,
    1: (n) => `${n} would betray an ally without a second thought.`,
    high: (n) => `${n} is thought to be trustworthy.`,
    low: (n) => `Some say ${n} is not to be trusted.`,
  },
  boldness: {
    5: (n) => `${n} is reckless in war and will march against the odds.`,
    4: (n) => `${n} is bold and quick to march.`,
    2: (n) => `${n} is cautious and slow to commit troops.`,
    1: (n) => `${n} will not fight without overwhelming strength.`,
    high: (n) => `${n} seems a bold commander.`,
    low: (n) => `${n} seems cautious in war.`,
  },
  vengeance: {
    5: (n) => `${n} never forgets a wrong.`,
    4: (n) => `${n} bears grudges long.`,
    2: (n) => `${n} is quick to forgive.`,
    1: (n) => `${n} holds no grudges.`,
    high: (n) => `${n} is said to hold grudges.`,
    low: (n) => `${n} is said to be forgiving.`,
  },
  guile: {
    5: (n) => `${n} is a master of stratagem; expect raids and deceit.`,
    4: (n) => `${n} favours cunning over open battle.`,
    2: (n) => `${n} prefers to fight in the open.`,
    1: (n) => `${n} scorns tricks and plots.`,
    high: (n) => `${n} is said to be cunning.`,
    low: (n) => `${n} is said to be straightforward.`,
  },
};

// Everything true and worth reporting about `fid`, as seen by `viewer`.
// Each fact: { key, cat, plain, vague, weight }.
export function gatherFacts(state, fid, viewer) {
  const n = forceName(state, fid);
  const who = (x) => (x === viewer ? 'you' : forceName(state, x));
  const facts = [];
  for (const [t, ph] of Object.entries(TRAIT_PHRASES)) {
    const v = traitOf(state, fid, t);
    if (v === 3) continue;
    facts.push({ key: `trait:${t}`, cat: 'trait', plain: ph[v](n), vague: ph[v > 3 ? 'high' : 'low'](n), weight: Math.abs(v - 3) });
  }
  const others = Object.values(state.forces).filter((f) => f.alive && f.id !== fid);
  const views = others.map((f) => ({ id: f.id, op: opinionOf(state, fid, f.id) }))
    .sort((a, b) => Math.abs(b.op - 50) - Math.abs(a.op - 50));
  for (const { id, op } of views.slice(0, 4)) {
    const y = who(id);
    if (areAllied(state, fid, id) && op < 45) {
      facts.push({ key: `op:${id}`, cat: 'opinion', plain: `${n} distrusts ${y}, though they are allies.`, vague: `All is not well between ${n} and ${y}.`, weight: 2 });
    } else if (op >= 70) {
      facts.push({ key: `op:${id}`, cat: 'opinion', plain: `${n} holds ${y} in high regard.`, vague: `${n} speaks well of ${y}.`, weight: 1.5 });
    } else if (op <= 30) {
      facts.push({ key: `op:${id}`, cat: 'opinion', plain: `${n} despises ${y}.`, vague: `${n} and ${y} are not on good terms.`, weight: 1.5 });
    }
  }
  const want = covetedProvince(state, fid);
  if (want) {
    const p = state.provinces[want.pid].name;
    facts.push({ key: 'covet', cat: 'desire', plain: `${n} desires ${p} above all else.`, vague: `${n}'s eyes turn toward ${p}.`, weight: 2 });
  }
  for (const p of lostHomeland(state, fid).slice(0, 2)) {
    const holder = p.owner ? who(p.owner) : null;
    facts.push({
      key: `lost:${p.id}`, cat: 'grievance',
      plain: holder ? `${n} has never forgiven ${holder} for taking ${p.name}.` : `${n} longs to recover ${p.name}.`,
      vague: `${n} still speaks bitterly of ${p.name}.`, weight: 1.5,
    });
  }
  const officers = officersOf(state, fid).filter((o) => o.id !== state.forces[fid].ruler);
  const wavering = officers.filter((o) => o.loyalty < 60).sort((a, b) => a.loyalty - b.loyalty)[0];
  if (wavering) {
    facts.push({ key: `loyal:${wavering.id}`, cat: 'court', plain: `${wavering.name}'s loyalty to ${n} wavers.`, vague: `Not all of ${n}'s officers are content.`, weight: 1 });
  }
  const provs = provincesOf(state, fid);
  if (provs.length > 1) {
    const main = provs.reduce((a, b) => (troopsIn(state, a.id) >= troopsIn(state, b.id) ? a : b));
    const t = Math.round(troopsIn(state, main.id) / 1000) * 1000;
    facts.push({ key: `army:${main.id}`, cat: 'army', plain: `${n}'s main strength lies at ${main.name}: some ${t.toLocaleString('en-US')} troops.`, vague: `${n} keeps most troops around ${main.name}.`, weight: 0.8 });
  }
  return facts;
}
