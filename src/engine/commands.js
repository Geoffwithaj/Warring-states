// Province commands. As in the classic game, a province may issue any number
// of commands in its turn, but each officer takes one job a month; "free" actions such as tax policy, standing assignments and
// delegation can be changed at any time.

import { chance, clamp, randInt } from './rng.js';
import {
  officersIn, freeOfficersIn, log, forceName, rulerOf, enlist, troopCap, monthIndex, isIdle,
  provincesOf, capitalOf,
} from './state.js';
import { isAdjacent, PROVINCE_BY_ID } from './map.js';
import {
  DEV_FIELDS, TAX, TASKS, fieldMax, devGain, reliefGain, trainGain, draftCost, maxDraft, skill,
} from './economy.js';
import { declareWar, validateWar, recruitChance, recruitCaptive, imprison } from './war.js';
import {
  opinionOf, trustOf, traitOf, remember, makeContact, gatherIntelligence, SPY_COST,
} from './politics/index.js';

const ok = (msg, extra = {}) => ({ ok: true, msg, ...extra });
const fail = (msg) => ({ ok: false, msg });

function here(state, pid, oid) {
  const o = state.officers[oid];
  return o && o.status === 'serving' && o.province === pid ? o : null;
}

// As in RTK II, charm matters most when looking for talent.
export function searchChance(o) {
  return clamp(0.15 + o.cha / 180 + o.int / 800, 0.05, 0.9);
}

export function freeRecruitChance(state, recruiter, target) {
  const lord = rulerOf(state, recruiter.force);
  return clamp(0.35 + (recruiter.cha - 50) / 120 + (lord.cha - 50) / 200 - (target.int + target.war - 120) / 400, 0.05, 0.95);
}

export function captiveRecruitChance(state, recruiter, target) {
  const base = recruitChance(state, recruiter.force, target);
  return base === 0 ? 0 : clamp(base + (recruiter.cha - 60) / 200, 0.02, 0.92);
}

export const COMMANDS = {
  develop(state, pid, { field, officer, gold }) {
    const p = state.provinces[pid];
    const o = here(state, pid, officer);
    if (!DEV_FIELDS[field] || !o) return fail('Invalid development order.');
    gold = Math.floor(gold);
    if (gold <= 0 || gold > p.gold) return fail('Not enough gold.');
    const gain = devGain(p, field, o, gold);
    p.gold -= gold;
    p[field] = clamp(p[field] + gain, 0, fieldMax(p, field));
    return ok(`${o.name} invests ${gold} gold in ${DEV_FIELDS[field].label.toLowerCase()}: +${gain}.`);
  },

  relief(state, pid, { officer, food }) {
    const p = state.provinces[pid];
    const o = here(state, pid, officer);
    food = Math.floor(food);
    if (!o || food <= 0 || food > p.food) return fail('Not enough food.');
    const gain = reliefGain(p, o, food);
    p.food -= food;
    p.order = clamp(p.order + gain, 0, 100);
    p.pop += Math.round(food * 2);
    return ok(`${o.name} distributes ${food} food to the people. Public order +${gain}.`);
  },

  draft(state, pid, { officer, troops }) {
    const p = state.provinces[pid];
    const o = here(state, pid, officer);
    troops = Math.floor(troops / 100) * 100;
    if (!o || troops <= 0) return fail('Invalid draft.');
    if (troops > maxDraft(state, pid, o)) return fail('Cannot draft that many.');
    const cost = draftCost(troops);
    p.gold -= cost;
    p.pop -= troops;
    p.order = clamp(p.order - Math.ceil(troops / 1000) * 2, 0, 100);
    o.training = Math.round((o.troops * o.training + troops * 20) / (o.troops + troops));
    o.troops += troops;
    return ok(`${troops} men are drafted into ${o.name}'s unit for ${cost} gold.`);
  },

  train(state, pid, { officer }) {
    const master = here(state, pid, officer);
    if (!master) return fail('Invalid officer.');
    const units = officersIn(state, pid).filter((o) => o.troops > 0);
    if (!units.length) return fail('There are no troops to train.');
    const total = units.reduce((sum, o) => sum + o.troops, 0);
    for (const o of units) o.training = clamp(o.training + trainGain(o, master, total), 0, 100);
    return ok(`${master.name} drills the garrison of ${state.provinces[pid].name}.`);
  },

  trade(state, pid, { mode, amount }) {
    const p = state.provinces[pid];
    amount = Math.floor(amount / 100) * 100;
    if (amount <= 0) return fail('Invalid amount.');
    const price = state.foodPrice;
    if (mode === 'buy') {
      const cost = Math.ceil((amount / 100) * price);
      if (cost > p.gold) return fail('Not enough gold.');
      p.gold -= cost;
      p.food += amount;
      return ok(`Bought ${amount} food for ${cost} gold.`);
    }
    if (amount > p.food) return fail('Not enough food.');
    const gain = Math.floor((amount / 100) * price * 0.85);
    p.food -= amount;
    p.gold += gain;
    return ok(`Sold ${amount} food for ${gain} gold.`);
  },

  search(state, pid, { officer }) {
    const o = here(state, pid, officer);
    const p = state.provinces[pid];
    if (!o) return fail('Invalid officer.');
    const hidden = freeOfficersIn(state, pid).filter((f) => !f.known.includes(o.force));
    const found = hidden.find(() => chance(state, searchChance(o)));
    if (found) {
      if (chance(state, freeRecruitChance(state, o, found))) {
        enlist(state, found, o.force, pid);
        found.loyalty = randInt(state, 60, 85);
        found.troops = 0;
        found.training = 30;
        log(state, `${o.name} finds ${found.name} in ${p.name}, who agrees to serve!`, 'good', [o.force]);
        return ok(`${o.name} found ${found.name}, who joins your cause!`);
      }
      found.known.push(o.force);
      return ok(`${o.name} found ${found.name}, but ${found.name} declined to serve. You may try to recruit again.`);
    }
    if (chance(state, 0.3)) {
      const g = randInt(state, 20, 90);
      p.gold += g;
      return ok(`${o.name} found no one of talent, but uncovered ${g} gold in hidden stores.`);
    }
    return ok(`${o.name} searched ${p.name} but found no one of note.`);
  },

  recruit(state, pid, { officer, target }) {
    const o = here(state, pid, officer);
    const t = state.officers[target];
    if (!o || !t || t.province !== pid) return fail('Invalid recruitment.');
    if (t.status === 'captive' && t.force === o.force) {
      const p = captiveRecruitChance(state, o, t);
      if (p > 0 && chance(state, p)) {
        recruitCaptive(state, t.id);
        return ok(`${t.name} is persuaded by ${o.name} and joins you.`);
      }
      return ok(`${t.name} refuses ${o.name}'s offer.`);
    }
    if (t.status !== 'free' || !t.known.includes(o.force)) return fail('That officer cannot be recruited.');
    if (chance(state, freeRecruitChance(state, o, t) + 0.05)) {
      enlist(state, t, o.force, pid);
      t.loyalty = randInt(state, 60, 85);
      t.troops = 0;
      t.training = 30;
      log(state, `${t.name} joins ${forceName(state, o.force)}.`, 'good', [o.force]);
      return ok(`${t.name} accepts ${o.name}'s invitation!`);
    }
    return ok(`${t.name} politely declines.`);
  },

  reward(state, pid, { target, gold }) {
    const p = state.provinces[pid];
    const t = here(state, pid, target);
    gold = Math.floor(gold);
    if (!t || gold <= 0 || gold > p.gold) return fail('Invalid reward.');
    const before = t.loyalty;
    t.loyalty = clamp(Math.round(t.loyalty + (gold / 8) * (1 - t.loyalty / 110)), 0, 100);
    p.gold -= gold;
    return ok(`${t.name} gratefully accepts ${gold} gold. Loyalty ${before} → ${t.loyalty}.`);
  },

  move(state, pid, { to, officers, gold = 0, food = 0 }) {
    const src = state.provinces[pid];
    const dst = state.provinces[to];
    if (!isAdjacent(pid, to)) return fail('Not adjacent.');
    if (dst.owner !== src.owner) return fail('You can only move into your own provinces. Use War to take others.');
    gold = Math.floor(gold);
    food = Math.floor(food);
    if (gold > src.gold || food > src.food || gold < 0 || food < 0) return fail('Not enough supplies.');
    const movers = officers.map((id) => here(state, pid, id));
    if (movers.some((o) => !o)) return fail('Invalid officers.');
    if (!movers.length && !gold && !food) return fail('Nothing to move.');
    const ruler = state.forces[src.owner].ruler;
    for (const o of movers) {
      o.province = to;
      o.task = null;
    }
    src.gold -= gold;
    src.food -= food;
    dst.gold += gold;
    dst.food += food;
    if (movers.some((o) => o.id === ruler)) dst.governor = ruler;
    const who = movers.length ? `${movers.map((o) => o.name).join(', ')} move` : 'Supplies are sent';
    return ok(`${who} to ${dst.name}.`);
  },

  war(state, pid, { to, officers, commander, food, intent }, opts = {}) {
    const err = validateWar(state, { from: pid, to, officerIds: officers, food });
    if (err) return fail(err);
    const result = declareWar(state, { from: pid, to, officerIds: officers, commanderId: commander, food, intent }, opts);
    return ok(result.kind === 'captured' ? `${state.provinces[to].name} is taken!` : 'Battle is joined!', { war: result });
  },

  gift(state, pid, { officer, target, gold }) {
    const p = state.provinces[pid];
    const o = here(state, pid, officer);
    const f = state.forces[target];
    gold = Math.floor(gold);
    if (!o || !f?.alive || gold <= 0 || gold > p.gold) return fail('Invalid gift.');
    p.gold -= gold;
    // Each further gift buys a little less goodwill.
    const before = opinionOf(state, target, o.force);
    const gain = (gold / 12) * skill(o, 'int') * clamp((90 - before) / 40, 0.1, 1);
    remember(state, target, o.force, 'gift', gain);
    makeContact(state, o.force, target);
    return ok(`${o.name} delivers ${gold} gold to ${forceName(state, target)}, who receives it warmly.`);
  },

  alliance(state, pid, { officer, target }) {
    const o = here(state, pid, officer);
    const f = state.forces[target];
    if (!o || !f?.alive) return fail('Invalid envoy.');
    const p = allianceChance(state, o, target);
    makeContact(state, o.force, target);
    if (chance(state, p)) {
      const until = monthIndex(state) + 36;
      f.alliances[o.force] = until;
      state.forces[o.force].alliances[target] = until;
      delete f.truces[o.force];
      delete state.forces[o.force].truces[target];
      remember(state, target, o.force, 'alliance');
      remember(state, o.force, target, 'alliance');
      log(state, `${forceName(state, o.force)} and ${forceName(state, target)} swear an alliance for three years.`, 'good', [o.force, target]);
      return ok(`${forceName(state, target)} agrees to an alliance!`);
    }
    remember(state, target, o.force, 'rebuffed');
    return ok(`${forceName(state, target)} rebuffs ${o.name}.`);
  },

  // Send an officer to learn what they can of a lord's court.
  spy(state, pid, { officer, target }) {
    const p = state.provinces[pid];
    const o = here(state, pid, officer);
    const f = state.forces[target];
    if (!o || !f?.alive || target === o.force) return fail('Invalid mission.');
    if (p.gold < SPY_COST) return fail(`The mission needs ${SPY_COST} gold.`);
    p.gold -= SPY_COST;
    const r = gatherIntelligence(state, o, target);
    const lord = forceName(state, target);
    if (r.ok) return ok(`${o.name} returns from ${lord}'s court with news.`, { intel: r.entries });
    if (r.caught) {
      imprison(state, target, capitalOf(state, target), [o]);
      log(state, `${o.name} is caught spying on ${lord} and thrown in prison.`, 'warn', [p.owner, target]);
      return ok(`${o.name} was caught at ${lord}'s court and taken prisoner!`, { intel: [] });
    }
    return ok(`${o.name} returns from ${lord}'s court having learned nothing of use.`, { intel: [] });
  },

  rest() {
    return ok('Orders for the month are complete.');
  },
};

export function allianceChance(state, envoy, target) {
  const rel = opinionOf(state, target, envoy.force);
  // Lords share nothing with those much larger than themselves, and the
  // honourable care more whether the other side keeps its word.
  const mine = provincesOf(state, envoy.force).length;
  const theirs = provincesOf(state, target).length;
  const wariness = mine > theirs * 2 ? 0.15 : 0;
  const faith = ((trustOf(state, envoy.force) - 50) / 200) * (traitOf(state, target, 'honour') / 3);
  return clamp(((rel - 45) / 45) * skill(envoy, 'cha') * 0.7 + faith - wariness, 0, 0.9);
}

// The officers a command puts to work. As in RTK II, a province may issue any
// number of commands in its turn, but each officer takes one job per month.
const PERFORMERS = {
  develop: (a) => [a.officer], relief: (a) => [a.officer], draft: (a) => [a.officer],
  train: (a) => [a.officer], search: (a) => [a.officer], recruit: (a) => [a.officer],
  gift: (a) => [a.officer], alliance: (a) => [a.officer], spy: (a) => [a.officer], move: (a) => a.officers, war: (a) => a.officers,
};

export const performersOf = (type, args) => (PERFORMERS[type]?.(args) ?? []).filter(Boolean);

export function executeCommand(state, pid, type, args, opts) {
  const cmd = COMMANDS[type];
  if (!cmd) return fail(`Unknown command ${type}`);
  const workers = performersOf(type, args).map((id) => state.officers[id]).filter(Boolean);
  const busy = workers.find((o) => !isIdle(state, o));
  if (busy?.task) return fail(`${busy.name} is on standing orders (${TASKS[busy.task]}). Clear the assignment to give other orders this month.`);
  if (busy) return fail(`${busy.name} has already been given orders this month.`);
  const res = cmd(state, pid, args, opts);
  if (res.ok) {
    for (const o of workers) o.usedMonth = monthIndex(state);
    const owner = state.provinces[pid].owner;
    if (type !== 'war' && type !== 'rest' && state.forces[owner]?.human) log(state, res.msg, 'cmd', [owner]);
  }
  return res;
}

// ---- Free actions ---------------------------------------------------------

export function setTax(state, pid, tax) {
  if (TAX[tax]) state.provinces[pid].tax = tax;
}

export function setRemit(state, pid, remit) {
  state.provinces[pid].remit = clamp(remit, 0, 0.75);
}

export function setTaskBudget(state, pid, share) {
  state.provinces[pid].taskBudget = clamp(Number(share) || 0, 0, 1);
}

export function setTask(state, oid, task) {
  const o = state.officers[oid];
  if (task === null || TASKS[task]) o.task = task;
}

export function setDelegate(state, pid, directive) {
  state.provinces[pid].delegate = directive ? { directive } : null;
}

export function setGovernor(state, pid, oid) {
  const o = state.officers[oid];
  if (o.province === pid && o.status === 'serving') state.provinces[pid].governor = oid;
}

export function transferTroops(state, pid, fromId, toId, amount) {
  const a = here(state, pid, fromId);
  const b = here(state, pid, toId);
  amount = Math.floor(amount / 100) * 100;
  if (!a || !b || amount <= 0 || amount > a.troops) return fail('Invalid transfer.');
  const room = troopCap(b) - b.troops;
  amount = Math.min(amount, room);
  if (amount <= 0) return fail(`${b.name} cannot command more troops.`);
  b.training = Math.round((b.troops * b.training + amount * a.training) / (b.troops + amount));
  a.troops -= amount;
  b.troops += amount;
  return ok(`${amount} troops transferred from ${a.name} to ${b.name}.`);
}

export function unitChangeCost(state, pid, o, type) {
  if (type === o.unit || type === 'inf') return 0;
  const horses = PROVINCE_BY_ID[pid].horses;
  if (type === 'cav') return Math.ceil(o.troops / (horses ? 25 : 10));
  return Math.ceil(o.troops / 40);
}

export function changeUnitType(state, pid, oid, type) {
  const o = here(state, pid, oid);
  if (!o || !['inf', 'cav', 'arc'].includes(type)) return fail('Invalid.');
  const cost = unitChangeCost(state, pid, o, type);
  const p = state.provinces[pid];
  if (cost > p.gold) return fail('Not enough gold.');
  p.gold -= cost;
  if (type !== o.unit) o.training = Math.max(0, o.training - 10);
  o.unit = type;
  return ok(`${o.name}'s unit re-equipped${cost ? ` for ${cost} gold` : ''}.`);
}

