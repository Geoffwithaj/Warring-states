// Province planner shared by computer lords and by governors running a
// province delegated to them by the player. The directive shapes priorities.

import { chance, pick } from './rng.js';
import {
  officersIn, freeOfficersIn, captivesIn, provinceStrength, strengthOf, governorOf, areAllied,
  capitalOf, rulerOf, troopCap,
} from './state.js';
import { ADJACENT, distanceMap, PROVINCE_BY_ID } from './map.js';
import { DEV_FIELDS, foodUpkeep, harvestFood, maxDraft, monthlyGold, TASKS, TASK_COST } from './economy.js';
import { foodNeeded, MAX_ARMY } from './war.js';
import { captiveRecruitChance, allianceChance } from './commands.js';

export const DIRECTIVES = {
  balanced: { label: 'Balanced', desc: 'Develop steadily, keep a sound garrison, take only easy prey.', attackRatio: 1.5, claim: true },
  develop: { label: 'Develop economy', desc: 'Pour gold into farms, markets and dikes. Never attack.', attackRatio: null, claim: false },
  military: { label: 'Build military', desc: 'Draft and drill troops, strengthen walls. Never attack.', attackRatio: null, claim: false },
  defend: { label: 'Hold the line', desc: 'Walls, garrison and training first. Never attack.', attackRatio: null, claim: false },
  expand: { label: 'Expand', desc: 'Build up and attack weaker neighbours when the odds are good.', attackRatio: 1.1, claim: true },
};

function hostileNeighbors(state, pid, fid) {
  return ADJACENT[pid].filter((n) => {
    const owner = state.provinces[n].owner;
    return owner && owner !== fid && !areAllied(state, fid, owner);
  });
}

function bestBy(list, score) {
  return list.reduce((a, b) => (a === null || score(b) > score(a) ? b : a), null);
}

function chooseArmy(state, pid, fid, keepGarrison) {
  const gov = governorOf(state, pid);
  const ruler = state.forces[fid].ruler;
  const pool = officersIn(state, pid)
    .filter((o) => o.troops >= 500)
    .sort((a, b) => strengthOf(b) - strengthOf(a));
  const army = [];
  const total = pool.reduce((s, o) => s + strengthOf(o), 0);
  let left = total;
  for (const o of pool) {
    if (army.length >= MAX_ARMY) break;
    // The governor stays home to keep order unless the lord leads in person.
    if (keepGarrison && o.id === gov?.id && o.id !== ruler) continue;
    if (keepGarrison && left - strengthOf(o) < total * 0.3 && army.length) break;
    army.push(o);
    left -= strengthOf(o);
  }
  return army;
}

function planAttack(state, pid, fid, directive) {
  const d = DIRECTIVES[directive];
  const p = state.provinces[pid];
  const here = officersIn(state, pid);
  const hostile = hostileNeighbors(state, pid, fid);

  // Claim empty, unclaimed land with a spare officer.
  if (d.claim && here.length >= 2) {
    const empty = ADJACENT[pid].filter((n) => !state.provinces[n].owner);
    if (empty.length && chance(state, 0.6)) {
      const target = bestBy(empty, (n) => state.provinces[n].pop);
      const gov = governorOf(state, pid);
      const envoy = bestBy(here.filter((o) => o.id !== gov.id && o.id !== state.forces[fid].ruler), (o) => o.troops + o.cha);
      if (envoy) {
        const food = Math.min(p.food, foodNeeded(envoy.troops));
        return { type: 'war', args: { to: target, officers: [envoy.id], commander: envoy.id, food } };
      }
    }
  }
  if (!d.attackRatio || !hostile.length) return null;

  const army = chooseArmy(state, pid, fid, true);
  if (!army.length) return null;
  const armyStr = army.reduce((s, o) => s + strengthOf(o), 0);
  const troops = army.reduce((s, o) => s + o.troops, 0);
  const food = foodNeeded(troops);
  if (p.food < food + foodUpkeep(state, pid) * 2) return null;

  let best = null;
  for (const t of hostile) {
    const defStr = provinceStrength(state, t);
    if (armyStr < defStr * d.attackRatio) continue;
    const prov = state.provinces[t];
    const value = (prov.pop / 1000 + prov.farm + prov.commerce) / (defStr / 1000 + 5);
    if (!best || value > best.value) best = { t, value };
  }
  if (!best) return null;
  const commander = bestBy(army, (o) => o.war + o.cha / 2 + (o.id === state.forces[fid].ruler ? 50 : 0));
  return { type: 'war', args: { to: best.t, officers: army.map((o) => o.id), commander: commander.id, food } };
}

function planDraft(state, pid, fid, directive, frontier) {
  const p = state.provinces[pid];
  const here = officersIn(state, pid).filter((o) => o.war >= 45 || officersIn(state, pid).length <= 2);
  if (!here.length || p.gold < 120) return null;
  const mine = provinceStrength(state, pid);
  const threat = Math.max(0, ...hostileNeighbors(state, pid, fid).map((n) => provinceStrength(state, n)));
  const troops = officersIn(state, pid).reduce((s, o) => s + o.troops, 0);
  const want = directive === 'military' || directive === 'defend' || directive === 'expand';
  const need = frontier ? mine < threat * (want ? 1.5 : 1.1) || troops < 6000 : troops < 3000;
  if (!need && !(want && chance(state, 0.5))) return null;
  if (p.order < 30) return null;
  const o = bestBy(here, (x) => (troopCap(x) - x.troops) * (x.war / 100));
  const reserve = frontier ? 60 : 100;
  // Never raise more men than the province can feed through the year.
  const sustainable = ((harvestFood(p) + p.food * 0.5) / 12) * 100 - troops;
  const max = Math.min(maxDraft(state, pid, o), (p.gold - reserve) * 10, 5000, sustainable);
  if (max < 500) return null;
  return { type: 'draft', args: { officer: o.id, troops: Math.floor(max / 100) * 100 } };
}

function planTrain(state, pid, directive, frontier) {
  const units = officersIn(state, pid).filter((o) => o.troops > 0);
  if (!units.length) return null;
  const troops = units.reduce((s, o) => s + o.troops, 0);
  const avg = units.reduce((s, o) => s + o.training * o.troops, 0) / troops;
  const target = directive === 'military' || directive === 'defend' ? 85 : frontier ? 75 : 55;
  if (avg >= target) return null;
  const master = bestBy(officersIn(state, pid), (o) => o.war);
  return { type: 'train', args: { officer: master.id } };
}

function planDevelop(state, pid, directive, frontier) {
  const p = state.provinces[pid];
  const reserve = frontier ? 200 : 80;
  const budget = Math.min(p.gold - reserve, 300);
  if (budget < 40) return null;
  const here = officersIn(state, pid);
  let field;
  if ((directive === 'defend' || directive === 'military' || frontier) && p.walls < 70 && chance(state, 0.5)) field = 'walls';
  else if (p.flood < 50 && isRiver(pid) && chance(state, 0.5)) field = 'flood';
  else if (harvestFood(p) < foodUpkeep(state, pid) * 14 || p.farm / DEV_FIELDS.farm.max < p.commerce / DEV_FIELDS.commerce.max) field = 'farm';
  else field = 'commerce';
  if (p[field] >= DEV_FIELDS[field].max) field = field === 'farm' ? 'commerce' : 'farm';
  if (p[field] >= DEV_FIELDS[field].max) return null;
  const stat = DEV_FIELDS[field].stat;
  const o = bestBy(here, (x) => x[stat]);
  return { type: 'develop', args: { field, officer: o.id, gold: Math.floor(budget) } };
}

const isRiver = (pid) => PROVINCE_BY_ID[pid].river;

function planPersonnel(state, pid, fid) {
  const here = officersIn(state, pid);
  const charmer = bestBy(here, (o) => o.cha);
  const known = freeOfficersIn(state, pid).filter((o) => o.known.includes(fid));
  if (known.length) return { type: 'recruit', args: { officer: charmer.id, target: known[0].id } };
  const caps = captivesIn(state, pid).filter((o) => o.force === fid && captiveRecruitChance(state, charmer, o) > 0.1);
  if (caps.length && chance(state, 0.5)) return { type: 'recruit', args: { officer: charmer.id, target: caps[0].id } };
  // Like RTK II's computer lords, they are quick to find talent that turns up.
  const hidden = freeOfficersIn(state, pid).some((o) => !o.known.includes(fid));
  if (chance(state, hidden ? 0.5 : 0.04)) {
    const seeker = bestBy(here, (o) => o.cha * 2 + o.int);
    return { type: 'search', args: { officer: seeker.id } };
  }
  return null;
}

// Rear provinces feed officers, troops and gold toward the front.
function planReinforce(state, pid, fid) {
  const p = state.provinces[pid];
  const enemyProvinces = Object.values(state.provinces)
    .filter((q) => q.owner !== fid && (!q.owner || !areAllied(state, fid, q.owner)))
    .map((q) => q.id);
  const dist = distanceMap(enemyProvinces);
  const next = ADJACENT[pid].filter((n) => state.provinces[n].owner === fid && dist[n] < dist[pid]);
  if (!next.length || dist[pid] < 2) return null;
  const to = pick(state, next);
  const gov = governorOf(state, pid);
  const ruler = state.forces[fid].ruler;
  const movers = officersIn(state, pid)
    .filter((o) => o.id !== gov?.id && o.id !== ruler && o.troops >= 1000)
    .slice(0, 4)
    .map((o) => o.id);
  const gold = Math.max(0, p.gold - 400);
  const food = Math.max(0, p.food - foodUpkeep(state, pid) * 12 - 1500);
  if (!movers.length && gold < 200) return null;
  return { type: 'move', args: { to, officers: movers, gold, food } };
}

function planDiplomacy(state, pid, fid) {
  if (capitalOf(state, fid) !== pid || !chance(state, 0.05)) return null;
  const p = state.provinces[pid];
  const envoy = bestBy(officersIn(state, pid), (o) => o.cha + o.int);
  const neighbors = new Set();
  for (const q of Object.values(state.provinces)) {
    if (q.owner !== fid) continue;
    for (const n of ADJACENT[q.id]) {
      const o = state.provinces[n].owner;
      if (o && o !== fid && !areAllied(state, fid, o)) neighbors.add(o);
    }
  }
  if (!neighbors.size) return null;
  const target = pick(state, [...neighbors]);
  if (allianceChance(state, envoy, target) > 0.35) return { type: 'alliance', args: { officer: envoy.id, target } };
  if (p.gold > 700) return { type: 'gift', args: { officer: envoy.id, target, gold: 150 } };
  return null;
}

// Computer lords pick a directive per province from their temperament.
export function aiDirective(state, pid, fid) {
  const ruler = rulerOf(state, fid);
  const hostile = hostileNeighbors(state, pid, fid);
  if (!hostile.length) return 'balanced';
  const aggression = (ruler.war + (100 - ruler.int) / 2) / 150;
  const mine = provinceStrength(state, pid);
  const threat = Math.max(...hostile.map((n) => provinceStrength(state, n)));
  if (mine < threat * 0.8) return 'defend';
  return chance(state, 0.35 + aggression * 0.4) ? 'expand' : 'balanced';
}

export function planProvinceTurn(state, pid, directive, { isAI }) {
  const p = state.provinces[pid];
  const fid = p.owner;
  const here = officersIn(state, pid);
  if (!here.length) return { type: 'rest', args: {} };
  const frontier = hostileNeighbors(state, pid, fid).length > 0;

  if (p.food < foodUpkeep(state, pid) * 4 && p.gold > 60) {
    const amount = Math.min(3000, Math.floor(((p.gold - 50) / state.foodPrice) * 100 / 100) * 100);
    if (amount >= 100) return { type: 'trade', args: { mode: 'buy', amount } };
  }
  if (p.order < 35 && p.food > 1500) {
    const o = bestBy(here, (x) => x.cha);
    return { type: 'relief', args: { officer: o.id, food: Math.min(1000, p.food - 1000) } };
  }
  const plans = [
    () => planAttack(state, pid, fid, directive),
    () => planDraft(state, pid, fid, directive, frontier),
    () => (directive === 'develop' ? null : planTrain(state, pid, directive, frontier)),
    () => planPersonnel(state, pid, fid),
    () => (isAI || directive === 'expand' ? planReinforce(state, pid, fid) : null),
    () => (isAI ? planDiplomacy(state, pid, fid) : null),
    () => planDevelop(state, pid, directive, frontier),
  ];
  if (directive === 'develop') plans.unshift(() => (chance(state, 0.8) ? planDevelop(state, pid, directive, frontier) : null));
  for (const plan of plans) {
    const action = plan();
    if (action) return action;
  }
  return { type: 'rest', args: {} };
}

// Standing assignments for officers of a computer-run province.
export function autoAssignTasks(state, pid, directive) {
  const p = state.provinces[pid];
  const here = officersIn(state, pid);
  const budget = Math.max(0, Math.floor(monthlyGold(p) / (TASK_COST * 2)));
  let n = 0;
  const sorted = [...here].sort((a, b) => b.int + b.cha - (a.int + a.cha));
  for (const o of sorted) {
    if (n >= budget) {
      o.task = null;
      continue;
    }
    let task;
    if (o.troops > 0 && o.training < 80 && o.war >= o.int) task = 'train';
    else if (p.order < 55 && o.cha >= 65) task = 'order';
    else if (directive === 'defend' && p.walls < 90 && o.war >= 60) task = 'walls';
    else if (isRiver(pid) && p.flood < 70 && o.int >= 60) task = 'flood';
    else task = p.farm <= p.commerce ? 'farm' : 'commerce';
    o.task = TASKS[task] ? task : null;
    n++;
  }
}
