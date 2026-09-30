// Declaring war on a province, and applying the outcome of a battle.

import { chance, clamp, rand } from './rng.js';
import {
  officersIn, provincesOf, forceName, log, rulerOf, isFamily, capitalOf, enlist,
  strengthOf, monthIndex, areAllied, governorOf,
} from './state.js';
import { ADJACENT, isAdjacent } from './map.js';
import { createBattle, autoResolve } from './battle.js';
import { tilesOf, TILE_VALUE } from './economy.js';
import { handleRulerLoss, eliminateForce } from './succession.js';
import { onAttack, onConquest, remember, isHomeland, traitOf, onGoalBattle } from './politics/index.js';

export const MAX_ARMY = 10;

export function foodNeeded(troops) {
  return Math.ceil(troops / 3000) * 30 + 20;
}

function sideEntry(o, moraleBonus = 0) {
  return { officer: o.id, troops: o.troops, training: o.training, unit: o.unit, moraleBonus };
}

// Men fight harder on their own soil.
export const HOMELAND_MORALE = 8;

function friendlyRefuge(state, fid, exclude) {
  const options = ADJACENT[exclude].filter((pid) => state.provinces[pid].owner === fid);
  if (!options.length) return null;
  return options.reduce((a, b) => (officersIn(state, a).length >= officersIn(state, b).length ? a : b));
}

export function validateWar(state, { from, to, officerIds, food }) {
  const src = state.provinces[from];
  const dst = state.provinces[to];
  if (!isAdjacent(from, to)) return 'That province is not adjacent.';
  if (dst.owner === src.owner) return 'You already hold that province.';
  if (!officerIds.length) return 'Choose at least one officer.';
  if (officerIds.length > MAX_ARMY) return `At most ${MAX_ARMY} officers may march.`;
  const here = new Set(officersIn(state, from).map((o) => o.id));
  if (!officerIds.every((id) => here.has(id))) return 'An officer is not in this province.';
  if (food > src.food) return 'Not enough food in the granary.';
  if (officerIds.every((id) => state.officers[id].troops <= 0) && officersIn(state, to).some((o) => o.troops > 0)) {
    return 'Your officers have no troops to fight with.';
  }
  return null;
}

// Starts a war. Returns { kind: 'captured' } when the province falls without a
// fight, or { kind: 'battle', battle } for a battle that still has to be fought.
export function declareWar(state, { from, to, officerIds, commanderId, food, intent = 'conquer' }, { interactiveAttacker = false } = {}) {
  const src = state.provinces[from];
  const dst = state.provinces[to];
  const fa = src.owner;
  const fd = dst.owner;
  src.food -= food;
  const attackers = officerIds.map((id) => state.officers[id]);
  if (fd) onAttack(state, fa, fd, { raid: intent === 'raid' });
  const defenders = officersIn(state, to)
    .filter((o) => o.troops > 0)
    .sort((a, b) => strengthOf(b) - strengthOf(a))
    .slice(0, MAX_ARMY);

  if (!fd || !defenders.length) {
    const who = forceName(state, fa);
    if (!fd) log(state, `${who}'s forces occupy the unclaimed province of ${dst.name}.`, 'info', [fa]);
    else log(state, `${dst.name} falls to ${who} without a fight!`, 'major', [fa, fd]);
    const outcome = conquer(state, { fa, fd, to, movers: attackers, food, captives: [] });
    return { kind: 'captured', outcome };
  }

  const ruler = rulerOf(state, fd);
  const gov = governorOf(state, to);
  const defCmd = defenders.find((o) => o.id === ruler.id) || defenders.find((o) => o.id === gov?.id) || defenders[0];
  const humanDef = state.forces[fd].human && !dst.delegate;
  const battle = createBattle(state, {
    pid: to,
    from,
    walls: dst.walls,
    att: { force: fa, officers: attackers.map((o) => sideEntry(o)), commander: commanderId || attackers[0].id, food },
    def: { force: fd, officers: defenders.map((o) => sideEntry(o, isHomeland(state, to, fd) ? HOMELAND_MORALE : 0)), commander: defCmd.id, food: dst.food },
    humanSides: { att: interactiveAttacker, def: humanDef },
    intent,
    farmTiles: tilesOf(dst, 'farm'),
    marketTiles: tilesOf(dst, 'commerce'),
  });
  battle.retreatOptions = { def: !!friendlyRefuge(state, fd, to) };
  if (intent === 'raid') dst.raidedAt = monthIndex(state);
  log(state, intent === 'raid'
    ? `${forceName(state, fa)} sends raiders into ${dst.name} (${forceName(state, fd)})!`
    : `${forceName(state, fa)} attacks ${dst.name} (${forceName(state, fd)})!`, 'war', [fa, fd]);
  return { kind: 'battle', battle };
}

export function isInteractive(battle) {
  return battle.humanSides.att || battle.humanSides.def;
}

// Resolve an all-AI battle immediately.
export function resolveAuto(state, battle) {
  autoResolve(state, battle);
  return finishBattle(state, battle);
}

function conquer(state, { fa, fd, to, movers, food, captives }) {
  const dst = state.provinces[to];
  // Remaining defenders flee to a friendly province or are taken.
  for (const o of officersIn(state, to)) {
    if (o.force !== fd || captives.includes(o)) continue;
    const refuge = fd ? friendlyRefuge(state, fd, to) : null;
    if (refuge && !chance(state, 0.2)) {
      o.province = refuge;
      o.task = null;
    } else {
      captives.push(o);
    }
  }
  dst.owner = fa;
  if (fd) remember(state, fd, fa, 'conquered');
  onConquest(state, to, fa);
  dst.delegate = null;
  dst.remit = 0;
  dst.order = clamp(dst.order - 10, 0, 100);
  dst.food += Math.max(0, food);
  dst.actedMonth = monthIndex(state);
  for (const o of movers) {
    o.province = to;
    o.task = null;
  }
  const best = movers.reduce((a, b) => (!a || a.cha + a.int > b.cha + b.int ? a || b : b), null);
  dst.governor = best?.id ?? null;
  const outcome = imprison(state, fa, to, captives);
  if (fd && !provincesOf(state, fd).length) eliminateForce(state, fd);
  return outcome;
}

export function imprison(state, captor, pid, captives) {
  const held = [];
  for (const o of captives) {
    if (o.status === 'dead') continue;
    o.prevForce = o.force;
    o.formerLord = o.force ? forceName(state, o.force) : null;
    o.status = 'captive';
    o.force = captor;
    o.province = pid;
    o.troops = 0;
    o.task = null;
    held.push(o.id);
  }
  if (!held.length) return { captives: [] };
  if (state.forces[captor].human) {
    state.pendingCaptives.push(...held);
  } else {
    for (const id of held) aiDecideCaptive(state, state.officers[id]);
  }
  return { captives: held };
}

// Razed fields and markets cost the province a tile's worth of development
// each, unsettle the people and drive some of them away.
function applyDevastation(state, b, dst) {
  const { farm, market } = b.razed || { farm: 0, market: 0 };
  const total = farm + market;
  if (!total) return;
  dst.farm = Math.max(0, dst.farm - farm * TILE_VALUE.farm);
  dst.commerce = Math.max(0, dst.commerce - market * TILE_VALUE.commerce);
  dst.order = clamp(dst.order - 2 * total, 0, 100);
  dst.pop = Math.round(dst.pop * (1 - 0.005 * total));
  const parts = [farm ? `${farm} field${farm > 1 ? 's' : ''}` : null, market ? `${market} market${market > 1 ? 's' : ''}` : null].filter(Boolean);
  log(state, `${parts.join(' and ')} of ${dst.name} lie in ruins.`, 'disaster', [b.forces.att, b.forces.def].filter(Boolean));
}

export function finishBattle(state, b) {
  const { winner, reason } = b.result;
  const fa = b.forces.att;
  const fd = b.forces.def;
  const src = state.provinces[b.from];
  const dst = state.provinces[b.pid];
  const captives = [];
  for (const u of b.units) {
    const o = state.officers[u.officer];
    o.troops = Math.floor(u.troops / 100) * 100;
    o.training = u.training;
    if (u.slain) {
      o.status = 'dead';
      o.troops = 0;
      if (state.forces[o.force]?.ruler === o.id) {
        log(state, `${o.name} has fallen in battle!`, 'major');
        handleRulerLoss(state, o.force);
      } else {
        log(state, `${o.name} has fallen in battle.`, 'warn');
      }
    } else if (u.captured) {
      captives.push(o);
    }
  }
  // Damage done to the walls stays with the province, whoever holds it now.
  dst.walls = Math.max(0, Math.round(b.walls));
  applyDevastation(state, b, dst);
  // Plunder carried off the field goes home with the raiders; gold taken back
  // from captured raiders returns to the province.
  const loot = b.units.filter((u) => u.side === 'att' && !u.slain && !u.captured).reduce((sum, u) => sum + (u.loot || 0), 0);
  if (loot) {
    const home = winner === 'att' ? dst : src;
    home.gold += loot;
    log(state, `${forceName(state, fa)}'s troops carry ${loot} gold of plunder home from ${dst.name}.`, 'war', [fa, fd]);
  }
  if (b.recovered) dst.gold += b.recovered;
  if (b.intent !== 'raid') onGoalBattle(state, fa, b.pid, winner === 'att');
  const survivors = (side) => b.units.filter((u) => u.side === side && !u.slain && !u.captured).map((u) => state.officers[u.officer]);
  const summary = `${forceName(state, winner === 'att' ? fa : fd)} is victorious at ${dst.name}. ${reason}`;
  log(state, summary, 'war', [fa, fd]);

  if (winner === 'att') {
    const unitOf = (o) => b.units.find((u) => u.officer === o.id);
    const movers = survivors('att').filter((o) => unitOf(o).status !== 'retreated');
    for (const o of survivors('att')) if (!movers.includes(o)) o.province = b.from;
    // Attackers taken on the field are freed when their side takes the castle.
    movers.push(...captives.filter((c) => c.force === fa));
    const outcome = conquer(state, {
      fa, fd, to: b.pid, movers, food: b.attFood, captives: captives.filter((c) => c.force === fd),
    });
    return { winner, ...outcome };
  }

  // Defender holds: attackers go home with what food is left.
  for (const o of survivors('att')) o.province = b.from;
  if (src.owner === fa) src.food += Math.max(0, b.attFood);
  dst.food = Math.max(0, b.defFood);
  for (const u of b.units.filter((x) => x.side === 'def' && x.status === 'retreated')) {
    const refuge = friendlyRefuge(state, fd, b.pid);
    if (refuge) state.officers[u.officer].province = refuge;
  }
  for (const o of captives) o.province = b.pid;
  const outcome = imprison(state, fd, b.pid, captives);
  return { winner, ...outcome };
}

// ---- Captives --------------------------------------------------------------

export function recruitChance(state, captorForce, o) {
  const prev = o.prevForce ? state.forces[o.prevForce] : null;
  if (prev?.alive && (prev.ruler === o.id || isFamily(o, state.officers[prev.ruler]))) return 0;
  const lord = rulerOf(state, captorForce);
  let p = 0.2 + (lord.cha - 50) / 150 + (60 - (o.loyalty || 60)) / 120;
  if (!prev?.alive) p += 0.3;
  return clamp(p, 0.02, 0.9);
}

export function recruitCaptive(state, id) {
  const o = state.officers[id];
  const captor = o.force;
  if (!chance(state, recruitChance(state, captor, o))) {
    log(state, `${o.name} refuses to serve ${forceName(state, captor)}.`, 'info', [captor]);
    return false;
  }
  enlist(state, o, captor, o.province);
  o.loyalty = 55 + Math.round(rand(state) * 20);
  o.prevForce = null;
  log(state, `${o.name} agrees to serve ${forceName(state, captor)}.`, 'good', [captor]);
  return true;
}

export function releaseCaptive(state, id) {
  const o = state.officers[id];
  const captor = o.force;
  const prev = o.prevForce && state.forces[o.prevForce];
  if (prev?.alive && capitalOf(state, prev.id)) {
    enlist(state, o, prev.id, capitalOf(state, prev.id));
    o.troops = 0;
    remember(state, prev.id, captor, 'released');
    log(state, `${forceName(state, captor)} releases ${o.name}, who returns to ${forceName(state, prev.id)}.`, 'info', [captor, prev.id]);
  } else {
    o.status = 'free';
    o.force = null;
    o.wander = true;
    log(state, `${o.name} is released and wanders off.`, 'info', [captor]);
  }
  o.prevForce = null;
}

export function executeCaptive(state, id) {
  const o = state.officers[id];
  const captor = o.force;
  const prev = o.prevForce && state.forces[o.prevForce];
  o.status = 'dead';
  log(state, `${forceName(state, captor)} executes ${o.name}.`, 'warn', [captor]);
  if (prev) {
    remember(state, prev.id, captor, 'executed', prev.ruler === o.id ? -50 : -30);
    if (prev.alive && prev.ruler === o.id) handleRulerLoss(state, prev.id);
  }
  o.prevForce = null;
}

function aiDecideCaptive(state, o) {
  if (recruitChance(state, o.force, o) > 0 && recruitCaptive(state, o.id)) return;
  const prev = o.prevForce && state.forces[o.prevForce];
  const isRuler = prev?.alive && prev.ruler === o.id;
  // The vengeful and the faithless are quicker to the axe.
  const cruel = traitOf(state, o.force, 'vengeance') >= 4 || traitOf(state, o.force, 'honour') <= 1;
  if ((isRuler && chance(state, cruel ? 0.7 : 0.35)) || (!isRuler && cruel && chance(state, 0.25))) executeCaptive(state, o.id);
  else releaseCaptive(state, o.id);
}
