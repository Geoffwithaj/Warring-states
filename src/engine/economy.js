// Province economy: income, harvest, development, and the month-end tick.

import { clamp, chance, randInt, rand, pick } from './rng.js';
import { ADJACENT } from './map.js';
import {
  officersIn, provincesOf, capitalOf, log, age, officerList, forceName, isFamily, governorOf,
  troopCap, monthIndex, applyDebuts, enlist,
} from './state.js';
import { handleRulerLoss } from './succession.js';

export const TAX = {
  light: { mult: 0.75, order: 1.2, label: 'Light' },
  normal: { mult: 1.0, order: 0, label: 'Normal' },
  heavy: { mult: 1.3, order: -2, label: 'Heavy' },
};

export const HARVEST_MONTH = 7;
export const DEV_FIELDS = {
  farm: { label: 'Farmland', stat: 'int', max: 999, rate: 0.2 },
  commerce: { label: 'Commerce', stat: 'int', max: 999, rate: 0.2 },
  flood: { label: 'Flood control', stat: 'int', max: 100, rate: 0.1 },
  walls: { label: 'Walls', stat: 'war', max: 100, rate: 0.07 },
};

export const TASKS = {
  farm: 'Tend farmland',
  commerce: 'Oversee markets',
  flood: 'Maintain dikes',
  walls: 'Repair walls',
  order: 'Patrol & keep order',
  train: 'Drill troops',
};
export const TASK_COST = 8; // gold per officer per month

const orderMult = (p) => 0.5 + p.order / 200;

export function monthlyGold(p) {
  return Math.floor((p.commerce * 0.12 + p.pop / 12000) * TAX[p.tax].mult * orderMult(p));
}

export function harvestFood(p) {
  return Math.floor((p.farm * 5 + p.pop / 400) * TAX[p.tax].mult * orderMult(p));
}

export const foodUpkeep = (state, pid) =>
  Math.ceil(officersIn(state, pid).reduce((s, o) => s + o.troops, 0) / 100);

export const popCap = (p) => 150000 + p.farm * 1000;

// Skill multiplier for an officer on a stat: 0.5 (stat 0) .. 1.5 (stat 100).
export const skill = (o, stat) => 0.5 + o[stat] / 100;

export function devGain(p, field, o, gold) {
  const f = DEV_FIELDS[field];
  const diminish = 1 - p[field] / (f.max * 1.1);
  return Math.max(0, Math.round(gold * f.rate * skill(o, f.stat) * diminish));
}

export function reliefGain(p, o, food) {
  return Math.max(0, Math.round((food / 60) * skill(o, 'cha') * (1 - p.order / 110)));
}

// A drill master trains every unit in the province, but can only give full
// attention to so many men; beyond that the drilling thins out.
export const drillCapacity = (master) => 8000 + master.war * 120;

export function drillEffect(master, totalTroops) {
  if (totalTroops <= 0) return 1;
  return clamp(Math.sqrt(drillCapacity(master) / totalTroops), 0.3, 1);
}

export function trainGain(o, master, totalTroops = o.troops) {
  return Math.max(0, Math.round((4 + master.war / 8) * (1 - o.training / 105) * drillEffect(master, totalTroops)));
}

export const draftCost = (troops) => Math.ceil(troops / 10);

export function maxDraft(state, pid, o) {
  const p = state.provinces[pid];
  const byCap = troopCap(o) - o.troops;
  const byGold = p.gold * 10;
  const byPop = Math.max(0, p.pop - 30000) / 4;
  return Math.max(0, Math.floor(Math.min(byCap, byGold, byPop) / 100) * 100);
}

// Standing assignments: officers work on a province every month for a small
// stipend, independent of the orders given in the province's turn.
function applyTasks(state, p) {
  for (const o of officersIn(state, p.id)) {
    if (!o.task) continue;
    if (p.gold < TASK_COST) continue;
    p.gold -= TASK_COST;
    switch (o.task) {
      case 'farm':
      case 'commerce':
      case 'flood':
      case 'walls': {
        const f = DEV_FIELDS[o.task];
        const g = (o.task === 'farm' || o.task === 'commerce' ? 5 : 1.2) * skill(o, f.stat) * (1 - p[o.task] / (f.max * 1.1));
        p[o.task] = clamp(p[o.task] + Math.max(1, Math.round(g)), 0, f.max);
        break;
      }
      case 'order':
        p.order = clamp(p.order + Math.round(2 * skill(o, 'cha')), 0, 100);
        break;
      case 'train': {
        // Drilling duty covers the whole garrison, at half the rate of a full Train order.
        const units = officersIn(state, p.id).filter((u) => u.troops > 0);
        const total = units.reduce((sum, u) => sum + u.troops, 0);
        for (const u of units) u.training = clamp(u.training + Math.round(trainGain(u, o, total) / 2), 0, 100);
        break;
      }
    }
  }
}

function disasters(state, p) {
  const name = p.name;
  const owner = p.owner;
  // Summer floods along the great rivers.
  if (p.river && state.month >= 5 && state.month <= 8 && chance(state, 0.05 * (1 - p.flood / 100))) {
    const loss = 0.15 + rand(state) * 0.2;
    p.farm = Math.round(p.farm * (1 - loss));
    p.pop = Math.round(p.pop * (1 - loss / 3));
    p.order = clamp(p.order - 10, 0, 100);
    log(state, `The river floods ${name}! Farmland and homes are swept away.`, 'disaster', owner && [owner]);
  }
  if (state.month >= 5 && state.month <= 7 && chance(state, 0.012)) {
    p.food = Math.round(p.food * 0.6);
    p.farm = Math.round(p.farm * 0.9);
    log(state, `Locusts descend on ${name}, devouring the crops.`, 'disaster', owner && [owner]);
  }
  if (chance(state, 0.006)) {
    p.pop = Math.round(p.pop * 0.85);
    for (const o of officersIn(state, p.id)) o.troops = Math.round(o.troops * 0.9 / 100) * 100;
    log(state, `Plague breaks out in ${name}.`, 'disaster', owner && [owner]);
  }
  if (p.order < 25 && chance(state, 0.15)) {
    p.gold = Math.round(p.gold * 0.8);
    p.commerce = Math.round(p.commerce * 0.93);
    p.order = clamp(p.order - 3, 0, 100);
    log(state, `Bandits and rioters plague ${name}. Public order is collapsing.`, 'disaster', owner && [owner]);
  }
}

function aging(state) {
  for (const o of officerList(state)) {
    if (o.status === 'dead' || o.status === 'unborn') continue;
    const a = age(state, o);
    const overdue = state.year - o.died;
    let p = 0;
    if (overdue >= 0) p = 0.3 + overdue * 0.1;
    else if (a > 60) p = 0.01 * (a - 60);
    if (!chance(state, p)) continue;
    const wasRuler = o.status === 'serving' && state.forces[o.force]?.ruler === o.id;
    const fid = o.force;
    const status = o.status;
    o.status = 'dead';
    o.troops = 0;
    if (status === 'serving' || status === 'captive') {
      log(state, `${o.name} has died of illness at the age of ${a}.`, wasRuler ? 'major' : 'info', fid ? [fid] : null);
    }
    if (wasRuler) handleRulerLoss(state, fid);
  }
}

// Released and deserting officers drift between provinces; officers who
// debuted naturally stay put until someone finds them.
function wander(state) {
  for (const o of officerList(state)) {
    if (o.status !== 'free' || !o.wander || !chance(state, 0.2)) continue;
    o.province = pick(state, ADJACENT[o.province]);
    o.known = [];
  }
}

function loyaltyDrift(state) {
  for (const o of officerList(state)) {
    if (o.status !== 'serving') continue;
    const f = state.forces[o.force];
    const ruler = state.officers[f.ruler];
    if (o.id === ruler.id || isFamily(o, ruler)) {
      o.loyalty = 100;
      continue;
    }
    // Charismatic lords slowly win hearts; poor ones lose them.
    if (chance(state, 0.25)) o.loyalty = clamp(o.loyalty + Math.sign(ruler.cha - 60), 0, 100);
    if (o.loyalty < 35 && chance(state, (35 - o.loyalty) / 250)) {
      const pid = o.province;
      o.status = 'free';
      o.force = null;
      o.troops = 0;
      o.task = null;
      o.wander = true;
      log(state, `${o.name}, disillusioned, abandons ${forceName(state, f.id)} and leaves ${state.provinces[pid].name}.`, 'warn', [f.id]);
    }
  }
}

function captiveEscapes(state) {
  for (const o of officerList(state)) {
    if (o.status !== 'captive' || !o.prevForce) continue;
    if (!chance(state, 0.04)) continue;
    const home = state.forces[o.prevForce];
    if (home?.alive) {
      const cap = capitalOf(state, home.id);
      if (!cap) continue;
      enlist(state, o, home.id, cap);
      o.troops = 0;
      log(state, `${o.name} escapes captivity and returns to ${forceName(state, home.id)}.`, 'warn');
    }
  }
}

function drift(state) {
  // Food price: cheap after the harvest, dear before it.
  const seasonal = state.month === HARVEST_MONTH + 1 ? -4 : state.month >= 4 && state.month <= 6 ? 1 : 0;
  state.foodPrice = clamp(Math.round(state.foodPrice + seasonal + (rand(state) - 0.5) * 3), 6, 24);
}

export function endOfMonth(state) {
  const reports = {};
  for (const p of Object.values(state.provinces)) {
    const tax = TAX[p.tax];
    if (!p.owner) {
      p.pop = Math.min(popCap(p), Math.round(p.pop * 1.001));
      p.order = clamp(p.order + (p.order < 50 ? 1 : 0), 0, 100);
      continue;
    }
    const gold = monthlyGold(p);
    p.gold += gold;
    let food = 0;
    if (state.month === HARVEST_MONTH) {
      food = harvestFood(p);
      p.food += food;
    }
    // Remit a share of income to the capital.
    const cap = capitalOf(state, p.owner);
    if (p.remit && cap && cap !== p.id) {
      const g = Math.floor(gold * p.remit);
      const f = Math.floor(food * p.remit);
      p.gold -= g;
      p.food -= f;
      state.provinces[cap].gold += g;
      state.provinces[cap].food += f;
    }
    applyTasks(state, p);
    const upkeep = foodUpkeep(state, p.id);
    p.food -= upkeep;
    if (p.food < 0) {
      p.food = 0;
      for (const o of officersIn(state, p.id)) o.troops = Math.floor((o.troops * 0.85) / 100) * 100;
      p.order = clamp(p.order - 5, 0, 100);
      log(state, `Granaries in ${p.name} are empty — hungry soldiers desert!`, 'warn', [p.owner]);
    }
    const gov = governorOf(state, p.id);
    const govPull = gov ? (gov.cha - 55) / 40 : -1;
    const toward = p.tax === 'normal' ? Math.sign(60 - p.order) * 0.5 : 0;
    p.order = clamp(Math.round(p.order + tax.order + govPull + toward), 0, 100);
    const growth = (p.order - 35) / 25000;
    p.pop = Math.max(20000, Math.min(popCap(p), Math.round(p.pop * (1 + growth))));
    disasters(state, p);
    // Bookkeeping for the province panel's income forecast.
    reports[p.id] = { gold, food, upkeep };
  }
  state.lastReports = reports;
  loyaltyDrift(state);
  captiveEscapes(state);
  wander(state);
  drift(state);

  // Alliances expire; relations slowly revert to neutral.
  const now = monthIndex(state);
  for (const f of Object.values(state.forces)) {
    for (const [other, until] of Object.entries(f.alliances)) {
      if (until <= now + 1) {
        delete f.alliances[other];
        if (f.id < other) log(state, `The alliance between ${forceName(state, f.id)} and ${forceName(state, other)} has lapsed.`, 'info', [f.id, other]);
      }
    }
    for (const k of Object.keys(f.relations)) f.relations[k] += Math.sign(50 - f.relations[k]) * 0.5;
  }

  if (state.month === HARVEST_MONTH) log(state, 'The autumn harvest is gathered across the land.', 'info');
  state.month += 1;
  if (state.month > 12) {
    state.month = 1;
    state.year += 1;
    aging(state);
    applyDebuts(state);
    // Officers age: very old officers slowly lose martial prowess.
    for (const o of officerList(state)) if (o.status !== 'dead' && age(state, o) > 58 && o.war > 30) o.war -= 1;
  }
}

