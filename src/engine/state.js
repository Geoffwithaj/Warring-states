// Game state creation and shared queries.

import { PROVINCES } from '../data/provinces.js';
import { OFFICERS, FAMILIES, officerId } from '../data/officers.js';
import { SCENARIOS, FREE_SCHEDULES, parseSchedule, RTK2_AUTO_JOIN, resolveAlias } from '../data/scenarios.js';
import { clamp, randInt, rand } from './rng.js';

export const MONTH_NAMES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
export const SEASONS = ['Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter', 'Winter'];

const FAMILY_OF = {};
FAMILIES.forEach((names, i) => names.forEach((n) => (FAMILY_OF[officerId(n)] = i)));

const CAVALRY = new Set(['lu-bu', 'ma-chao', 'ma-teng', 'gongsun-zan', 'zhang-liao', 'pang-de', 'zhao-yun', 'ma-dai', 'xiahou-yuan', 'wen-chou', 'yan-liang', 'sun-ce', 'cao-chun']);
const ARCHERS = new Set(['huang-zhong', 'taishi-ci', 'huang-gai', 'xiahou-yuan-x', 'gan-ning', 'yan-yan', 'zhang-ren', 'huang-zu']);

export function unitTypeFor(officer, province) {
  if (CAVALRY.has(officer.id)) return 'cav';
  if (ARCHERS.has(officer.id)) return 'arc';
  if (province?.horses && officer.war >= 72) return 'cav';
  if (officer.war < 65 && officer.int >= 60) return 'arc';
  return 'inf';
}

export const troopCap = (o) => 3000 + o.war * 120;

// Saves from an older version of the rules are not loaded.
export const SAVE_VERSION = 2;

// Starting development as a share of a province's potential (25 Farmland per
// fertile tile, 60 Commerce per market site).
const startFarm = (state, p, lo, hi) => Math.round(p.fertile * 25 * (lo + (hi - lo) * rand(state)));
const startCommerce = (state, p, lo, hi) => Math.round(p.markets * 60 * (lo + (hi - lo) * rand(state)));

export function createGame({ scenarioId = SCENARIOS[0].id, humanRulers = [], seed = Date.now() % 2147483647 } = {}) {
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  const state = {
    version: SAVE_VERSION,
    scenario: sc.id,
    year: sc.year,
    month: sc.month,
    seed,
    foodPrice: 12, // gold per 100 food
    provinces: {},
    forces: {},
    officers: {},
    queue: [],
    queueIndex: 0,
    awaiting: null,
    battle: null,
    pendingCaptives: [],
    log: [],
    gameOver: null,
  };

  for (const o of OFFICERS) {
    state.officers[o.id] = {
      ...o,
      family: FAMILY_OF[o.id] ?? null,
      status: 'unborn', // unborn | free | serving | captive | dead
      force: null,
      province: null,
      loyalty: 0,
      troops: 0,
      training: 0,
      unit: 'inf',
      task: null,
      known: [],
      debut: null,
    };
  }

  for (const p of PROVINCES) {
    state.provinces[p.id] = {
      id: p.id,
      name: p.name,
      owner: null,
      governor: null,
      gold: 80 + randInt(state, 0, 80),
      food: 800 + randInt(state, 0, 800),
      pop: p.pop,
      farm: startFarm(state, p, 0.2, 0.4),
      commerce: startCommerce(state, p, 0.15, 0.35),
      flood: randInt(state, 25, 55),
      walls: randInt(state, 20, 50),
      order: randInt(state, 45, 65),
      tax: 'normal',
      remit: 0,
      taskBudget: 0.5,
      delegate: null,
    };
  }

  for (const f of sc.forces) {
    const fid = officerId(f.ruler);
    state.forces[fid] = {
      id: fid,
      ruler: fid,
      color: f.color,
      human: humanRulers.includes(fid),
      alive: true,
      relations: {},
      alliances: {},
    };
    for (const [pid, names] of Object.entries(f.provinces)) {
      const prov = state.provinces[pid];
      prov.owner = fid;
      prov.governor = officerId(names[0]);
      const isCapital = names.includes(f.ruler);
      prov.gold = (isCapital ? 700 : 400) + randInt(state, 0, 300);
      prov.food = (isCapital ? 7000 : 4000) + randInt(state, 0, 3000);
      prov.walls = clamp(prov.walls + (isCapital ? 25 : 10), 0, 100);
      const meta = PROVINCES.find((q) => q.id === pid);
      prov.farm = startFarm(state, meta, isCapital ? 0.45 : 0.35, isCapital ? 0.65 : 0.55);
      prov.commerce = startCommerce(state, meta, isCapital ? 0.4 : 0.3, isCapital ? 0.6 : 0.5);
      for (const name of names) {
        const o = state.officers[officerId(name)];
        if (!o) throw new Error(`Unknown officer ${name}`);
        enlist(state, o, fid, pid);
        const base = o.war >= 60 ? 1500 + o.war * 40 : 600 + o.war * 10;
        o.troops = Math.min(troopCap(o), Math.round((base + randInt(state, 0, 1000)) / 100) * 100);
        o.training = randInt(state, 40, 70);
        o.unit = unitTypeFor(o, prov);
        o.loyalty = o.id === fid || o.family === state.officers[fid].family && o.family !== null ? 100 : randInt(state, 65, 95);
      }
    }
  }
  // Free officers and heirs: RTK II's schedule, then this scenario's extras.
  const heirOf = {};
  for (const [relative, heirs] of Object.entries(RTK2_AUTO_JOIN)) {
    for (const h of heirs) heirOf[officerId(resolveAlias(h))] = officerId(relative);
  }
  for (const [relative, heir] of sc.extraHeirs || []) heirOf[officerId(heir)] = officerId(relative);
  const schedule = [
    ...(sc.freeSchedule ? parseSchedule(FREE_SCHEDULES[sc.freeSchedule]) : []),
    ...(sc.extraFree || []).map(([name, province, year]) => ({ name, province, year })),
  ];
  for (const { name, province, year } of schedule) {
    const o = state.officers[officerId(name)];
    if (o.status === 'serving' || o.debut) continue; // already placed by the scenario
    o.province = province;
    o.debut = year;
    o.heirOf = heirOf[o.id] ?? null;
  }
  for (const a of Object.keys(state.forces)) {
    for (const b of Object.keys(state.forces)) if (a !== b) state.forces[a].relations[b] = 50;
  }
  applyDebuts(state);
  return state;
}

// Officers whose year has come appear in January. An heir whose relative is
// serving a lord joins that lord at once; everyone else becomes a free officer
// waiting to be found by a search in their province.
export function applyDebuts(state) {
  for (const o of Object.values(state.officers)) {
    if (o.status !== 'unborn' || !o.debut || o.debut > state.year) continue;
    const kin = o.heirOf ? state.officers[o.heirOf] : null;
    if (kin?.status === 'serving' && state.forces[kin.force]?.alive) {
      enlist(state, o, kin.force, kin.province);
      o.loyalty = 100;
      o.troops = 0;
      o.training = 30;
      log(state, `${o.name} comes of age and joins ${kin.name} in the service of ${forceName(state, kin.force)} at ${state.provinces[kin.province].name}.`, 'info', [kin.force]);
    } else {
      o.status = 'free';
    }
  }
}

export function enlist(state, o, fid, pid) {
  o.status = 'serving';
  o.force = fid;
  o.province = pid;
  o.task = null;
  o.known = [];
  o.wander = false;
  if (!o.unit) o.unit = 'inf';
}

// ---- Queries ---------------------------------------------------------------

export const officerList = (state) => Object.values(state.officers);

export const officersIn = (state, pid) =>
  officerList(state).filter((o) => o.status === 'serving' && o.province === pid);

// Each officer can carry out one job per month: either an order given in the
// province's turn, or their standing assignment (which runs at month end, so
// clearing it frees the officer for orders the same turn).
export const usedThisMonth = (state, o) => o.usedMonth === state.year * 12 + state.month - 1;
export const isIdle = (state, o) => !o.task && !usedThisMonth(state, o);
export const idleOfficersIn = (state, pid) => officersIn(state, pid).filter((o) => isIdle(state, o));

export const captivesIn = (state, pid) =>
  officerList(state).filter((o) => o.status === 'captive' && o.province === pid);

export const freeOfficersIn = (state, pid) =>
  officerList(state).filter((o) => o.status === 'free' && o.province === pid);

export const officersOf = (state, fid) =>
  officerList(state).filter((o) => o.status === 'serving' && o.force === fid);

export const provincesOf = (state, fid) =>
  Object.values(state.provinces).filter((p) => p.owner === fid);

export const troopsIn = (state, pid) => officersIn(state, pid).reduce((s, o) => s + o.troops, 0);

export const forceName = (state, fid) => (fid ? state.officers[state.forces[fid].ruler].name : 'Unclaimed');

export const rulerOf = (state, fid) => state.officers[state.forces[fid].ruler];

export const capitalOf = (state, fid) => {
  const r = rulerOf(state, fid);
  return r && r.status === 'serving' ? r.province : provincesOf(state, fid)[0]?.id ?? null;
};

export const age = (state, o) => state.year - o.born;

export const isFamily = (a, b) => a.family !== null && a.family === b.family;

export function governorOf(state, pid) {
  const prov = state.provinces[pid];
  const here = officersIn(state, pid);
  if (!here.length) return null;
  const ruler = prov.owner && state.forces[prov.owner].ruler;
  const rulerHere = here.find((o) => o.id === ruler);
  if (rulerHere) return rulerHere;
  const g = here.find((o) => o.id === prov.governor);
  if (g) return g;
  const best = here.reduce((a, b) => (a.cha + a.int + a.war >= b.cha + b.int + b.war ? a : b));
  prov.governor = best.id;
  return best;
}

// Military strength estimate used by AI and advisers.
export function strengthOf(o) {
  return o.troops * (0.5 + o.war / 150 + o.int / 600) * (0.6 + o.training / 250);
}

export const provinceStrength = (state, pid) =>
  officersIn(state, pid).reduce((s, o) => s + strengthOf(o), 0) * (1 + state.provinces[pid].walls / 70);

export const areAllied = (state, a, b) =>
  !!a && !!b && (state.forces[a]?.alliances[b] ?? 0) > monthIndex(state);

export const monthIndex = (state) => state.year * 12 + state.month - 1;

export const dateLabel = (state) => `${state.year} AD, ${MONTH_NAMES[state.month - 1]} month`;

export function log(state, msg, kind = 'info', forces = null) {
  state.log.push({ date: `${state.year}.${state.month}`, msg, kind, forces });
  if (state.log.length > 1500) state.log.splice(0, state.log.length - 1500);
}

export const humanForces = (state) => Object.values(state.forces).filter((f) => f.alive && f.human);

export const isHumanControlled = (state, pid) => {
  const owner = state.provinces[pid].owner;
  return !!owner && state.forces[owner].human && !state.provinces[pid].delegate;
};

export { rand };
