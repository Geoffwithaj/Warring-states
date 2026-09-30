// Tactical hex battles. A battle lasts up to 30 days; each day the attacker's
// units act, then the defender's. Every unit may move and then take one action.
//
// Principles (in the spirit of the Art of War): terrain decides what each arm
// can do. Cavalry is decisive only when it can charge across open ground;
// forest and hills give cover; marsh exposes and bogs down; walls make the
// castle a fighting position in its own right.

import { rand, chance, randInt, clamp, pick } from './rng.js';
import { PROVINCE_BY_ID } from './map.js';

export const BATTLE_W = 15;
export const BATTLE_H = 11;
export const MAX_DAYS = 30;

// def: how well a unit standing here resists melee.
// cover: how much of an arrow volley against a unit here still lands.
// footing: how well a unit standing here can fight (marsh and fords are bad footing).
export const TERRAIN = {
  plains: { label: 'Plains', cost: { inf: 1, cav: 1, arc: 1 }, def: 1.0, cover: 1.0, footing: 1.0, flammable: 0.2 },
  forest: { label: 'Forest', cost: { inf: 2, cav: 3, arc: 2 }, def: 1.2, cover: 0.55, footing: 0.95, flammable: 0.4 },
  hills: { label: 'Hills', cost: { inf: 2, cav: 2, arc: 2 }, def: 1.15, cover: 0.85, footing: 1.0, flammable: 0.12 },
  mountain: { label: 'Mountain', cost: { inf: 3, cav: 5, arc: 3 }, def: 1.3, cover: 0.7, footing: 0.95, flammable: 0.05 },
  marsh: { label: 'Marsh', cost: { inf: 3, cav: 4, arc: 3 }, def: 0.85, cover: 1.25, footing: 0.8, flammable: 0 },
  river: { label: 'River', cost: null, def: 1, cover: 1, footing: 1, flammable: 0 },
  ford: { label: 'Ford', cost: { inf: 2, cav: 2, arc: 2 }, def: 0.8, cover: 1.2, footing: 0.8, flammable: 0 },
  castle: { label: 'Castle', cost: { inf: 1, cav: 1, arc: 1 }, def: 1.3, cover: 1.0, footing: 1.0, flammable: 0.1 },
};

const HIGH_GROUND = new Set(['hills', 'mountain', 'castle']);

export const UNIT_TYPES = {
  inf: { label: 'Infantry', short: 'Inf', mp: 4 },
  cav: { label: 'Cavalry', short: 'Cav', mp: 6 },
  arc: { label: 'Archers', short: 'Arc', mp: 4 },
};

// Melee multipliers [attacker][defender]: cavalry rides down archers,
// spear infantry holds against cavalry, archers are poor in close combat.
const TYPE_MOD = {
  inf: { inf: 1.0, cav: 1.2, arc: 1.1 },
  cav: { inf: 0.95, cav: 1.0, arc: 1.35 },
  arc: { inf: 0.7, cav: 0.7, arc: 0.8 },
};

// How well each arm fights INTO a hex of this terrain (ordinary attacks).
const ATTACK_INTO = {
  inf: { plains: 1.0, hills: 0.95, forest: 1.0, mountain: 0.9, marsh: 1.0, ford: 1.05, castle: 0.9 },
  cav: { plains: 1.0, hills: 0.85, forest: 0.65, mountain: 0.5, marsh: 0.55, ford: 0.8, castle: 0.4 },
  arc: { plains: 1.0, hills: 1.0, forest: 1.0, mountain: 1.0, marsh: 1.0, ford: 1.0, castle: 1.0 },
};

// A charge is only as good as the worst ground it crosses.
const CHARGE_THROUGH = { plains: 1.6, hills: 1.05, ford: 0.8, forest: 0.6, marsh: 0.5 };

const PROFILES = {
  plains: { forest: 0.08, hills: 0.06, mountain: 0.02, marsh: 0.02 },
  hills: { forest: 0.12, hills: 0.25, mountain: 0.07 },
  mountains: { forest: 0.15, hills: 0.25, mountain: 0.2 },
  forest: { forest: 0.35, hills: 0.1, mountain: 0.04, marsh: 0.04 },
  marsh: { marsh: 0.22, forest: 0.1, hills: 0.03 },
};

// ---- Hex geometry (odd-r offset) -------------------------------------------

const DIRS_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const DIRS_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
export const WIND_NAMES = ['east', 'north-east', 'north-west', 'west', 'south-west', 'south-east'];

export const idx = (c, r) => r * BATTLE_W + c;
export const inBounds = (c, r) => c >= 0 && r >= 0 && c < BATTLE_W && r < BATTLE_H;

export function neighbors(c, r) {
  const dirs = r & 1 ? DIRS_ODD : DIRS_EVEN;
  const out = [];
  dirs.forEach(([dc, dr], d) => {
    const nc = c + dc;
    const nr = r + dr;
    if (inBounds(nc, nr)) out.push({ c: nc, r: nr, d });
  });
  return out;
}

// The hex one step from (c, r) in direction d (may be off the map).
function stepDir(c, r, d) {
  const [dc, dr] = (r & 1 ? DIRS_ODD : DIRS_EVEN)[d];
  return { c: c + dc, r: r + dr };
}

function toCube(c, r) {
  const x = c - (r - (r & 1)) / 2;
  return [x, -x - r, r];
}

export function hexDist(a, b) {
  const [ax, ay, az] = toCube(a.c, a.r);
  const [bx, by, bz] = toCube(b.c, b.r);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

// ---- Province battlefields ---------------------------------------------------
// Every province has its own fixed battlefield, generated from its name.

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h | 0;
}

export function provinceField(pid) {
  const meta = PROVINCE_BY_ID[pid] || { terrain: 'plains', river: false };
  const rng = { seed: hashString(`field:${pid}`) };
  const t = new Array(BATTLE_W * BATTLE_H).fill('plains');
  const profile = PROFILES[meta.terrain] || PROFILES.plains;
  for (const [type, density] of Object.entries(profile)) {
    const blobs = Math.round((BATTLE_W * BATTLE_H * density) / 5);
    for (let i = 0; i < blobs; i++) {
      const c0 = randInt(rng, 0, BATTLE_W - 1);
      const r0 = randInt(rng, 0, BATTLE_H - 1);
      const rad = randInt(rng, 0, 2);
      for (let r = 0; r < BATTLE_H; r++) {
        for (let c = 0; c < BATTLE_W; c++) {
          const d = hexDist({ c, r }, { c: c0, r: r0 });
          if (d <= rad && (d === 0 || chance(rng, 0.65))) t[idx(c, r)] = type;
        }
      }
    }
  }
  if (meta.river) {
    let c = randInt(rng, 4, 10);
    const fords = new Set([randInt(rng, 0, 3), randInt(rng, 4, 6), randInt(rng, 7, BATTLE_H - 1)]);
    for (let r = 0; r < BATTLE_H; r++) {
      t[idx(c, r)] = fords.has(r) ? 'ford' : 'river';
      const drift = rand(rng);
      if (drift < 0.25 && c > 3) c -= 1;
      else if (drift > 0.75 && c < 11) c += 1;
    }
  }
  // The castle sits near the middle of the field so it can be approached from
  // any side; it and its immediate surroundings are always passable.
  const castle = { c: randInt(rng, 6, 8), r: randInt(rng, 3, 7) };
  t[idx(castle.c, castle.r)] = 'castle';
  for (const n of neighbors(castle.c, castle.r)) {
    const ter = t[idx(n.c, n.r)];
    if (ter === 'river' || ter === 'mountain') t[idx(n.c, n.r)] = ter === 'river' ? 'ford' : 'hills';
  }
  return { terrain: t, castle };
}

// Which edge of the field an army marching from `from` into `to` arrives on.
// The field is wide rather than deep, so armies arrive from the west or east:
// whichever side their home province lies on.
export function approachEdge(from, to) {
  const a = PROVINCE_BY_ID[from];
  const b = PROVINCE_BY_ID[to];
  if (!a || !b) return 'west';
  return a.x <= b.x ? 'west' : 'east';
}

function edgeDistance(edge, c, r) {
  return { west: c, east: BATTLE_W - 1 - c, north: r, south: BATTLE_H - 1 - r }[edge];
}

function edgeAnchor(edge) {
  return {
    west: { c: 0, r: Math.floor(BATTLE_H / 2) },
    east: { c: BATTLE_W - 1, r: Math.floor(BATTLE_H / 2) },
    north: { c: Math.floor(BATTLE_W / 2), r: 0 },
    south: { c: Math.floor(BATTLE_W / 2), r: BATTLE_H - 1 },
  }[edge];
}

function freeHexNear(b, c0, r0, allow = () => true) {
  let best = null;
  let bestD = Infinity;
  for (let r = 0; r < BATTLE_H; r++) {
    for (let c = 0; c < BATTLE_W; c++) {
      if (unitAt(b, c, r) || !allow(c, r)) continue;
      const ter = b.terrain[idx(c, r)];
      if (ter === 'river' || ter === 'castle') continue;
      const d = hexDist({ c, r }, { c: c0, r: r0 });
      if (d < bestD) {
        bestD = d;
        best = { c, r };
      }
    }
  }
  return best;
}

// sides: { att: {force, officers:[{officer, troops, training, unit}], commander, food},
//          def: {force|null, officers:[...], commander, food} }
export function createBattle(state, { pid, from, walls, att, def, humanSides }) {
  const field = provinceField(pid);
  const edge = approachEdge(from, pid);
  const b = {
    pid,
    from,
    edge,
    walls,
    wallsMax: walls,
    day: 1,
    maxDays: MAX_DAYS,
    terrain: field.terrain,
    fire: new Array(BATTLE_W * BATTLE_H).fill(0),
    castle: field.castle,
    weather: 'clear',
    wind: randInt(state, 0, 5),
    side: 'att',
    forces: { att: att.force, def: def.force },
    attFood: att.food,
    defFood: def.food,
    units: [],
    result: null,
    log: [],
    duels: {},
    pendingDuel: null,
    humanSides: humanSides || { att: false, def: false },
  };

  let uid = 0;
  const anchor = edgeAnchor(edge);
  const attOrder = [...att.officers].sort((x, y) => (y.officer === att.commander) - (x.officer === att.commander));
  for (const o of attOrder) {
    const spot = freeHexNear(b, anchor.c, anchor.r, (c, r) => edgeDistance(edge, c, r) <= 1)
      || freeHexNear(b, anchor.c, anchor.r, (c, r) => edgeDistance(edge, c, r) <= 3);
    b.units.push(makeUnit(uid++, 'att', o, spot, o.officer === att.commander));
  }
  const defOrder = [...def.officers].sort((x, y) => (y.officer === def.commander) - (x.officer === def.commander));
  for (const o of defOrder) {
    const isCmd = o.officer === def.commander;
    const spot = isCmd ? { ...b.castle } : freeHexNear(b, b.castle.c, b.castle.r, (c, r) => edgeDistance(edge, c, r) > 3);
    b.units.push(makeUnit(uid++, 'def', o, spot, isCmd));
  }
  addLog(b, `Day 1. The attackers arrive from the ${edge}. The wind blows from the ${WIND_NAMES[b.wind]}.`);
  return b;
}

function makeUnit(id, side, o, spot, commander) {
  return {
    id,
    side,
    officer: o.officer,
    troops: o.troops,
    startTroops: o.troops,
    training: o.training,
    type: o.unit,
    morale: clamp(55 + Math.round(o.training / 3), 0, 100),
    c: spot.c,
    r: spot.r,
    moved: false,
    done: false,
    status: 'active',
    commander,
    refusals: 0,
    shakenDay: 0,
  };
}

// ---- Queries ---------------------------------------------------------------

export const activeUnits = (b, side) => b.units.filter((u) => u.status === 'active' && (!side || u.side === side));
export const unitAt = (b, c, r) => b.units.find((u) => u.status === 'active' && u.c === c && u.r === r) || null;
export const enemyOf = (side) => (side === 'att' ? 'def' : 'att');
export const terrainAt = (b, c, r) => b.terrain[idx(c, r)];
export const isCastle = (b, c, r) => c === b.castle.c && r === b.castle.r;
export const castleOccupant = (b) => unitAt(b, b.castle.c, b.castle.r);

// The walls are breached once they fall to half their starting strength.
export const breachLevel = (b) => Math.floor((b.wallsMax ?? b.walls) * 0.5);
export const isBreached = (b) => b.walls <= breachLevel(b);

function addLog(b, msg) {
  b.log.push(msg);
  if (b.log.length > 200) b.log.shift();
}

function officer(state, u) {
  return state.officers[u.officer];
}

function enemyAdjacent(b, c, r, side) {
  return neighbors(c, r).some((n) => {
    const e = unitAt(b, n.c, n.r);
    return e && e.side !== side;
  });
}

function moveCost(b, u, c, r) {
  const ter = terrainAt(b, c, r);
  const cost = TERRAIN[ter].cost;
  if (!cost) return Infinity;
  if (b.fire[idx(c, r)] > 0) return Infinity;
  if (unitAt(b, c, r)) return Infinity;
  // Attackers can only enter the castle once its walls are breached.
  if (ter === 'castle' && u.side === 'att' && !isBreached(b)) return Infinity;
  return cost[u.type];
}

// Hexes the unit can reach this phase: Map(index -> {c, r, cost}).
export function reachable(b, u) {
  const out = new Map();
  if (u.moved || u.done) return out;
  const mp = UNIT_TYPES[u.type].mp;
  const start = { c: u.c, r: u.r, cost: 0 };
  out.set(idx(u.c, u.r), start);
  const frontier = [start];
  while (frontier.length) {
    frontier.sort((a, z) => a.cost - z.cost);
    const cur = frontier.shift();
    // Zone of control: a unit that steps next to an enemy must stop.
    if (cur.cost > 0 && enemyAdjacent(b, cur.c, cur.r, u.side)) continue;
    // Nobody marches through the castle.
    if (cur.cost > 0 && isCastle(b, cur.c, cur.r)) continue;
    for (const n of neighbors(cur.c, cur.r)) {
      const cost = cur.cost + moveCost(b, u, n.c, n.r);
      if (cost > mp) continue;
      const k = idx(n.c, n.r);
      const prev = out.get(k);
      if (prev && prev.cost <= cost) continue;
      const node = { c: n.c, r: n.r, cost };
      out.set(k, node);
      frontier.push(node);
    }
  }
  return out;
}

export function shootRange(b, u) {
  return HIGH_GROUND.has(terrainAt(b, u.c, u.r)) ? 3 : 2;
}

const isShaken = (b, u) => u.shakenDay === b.day;

export function meleeTargets(b, u) {
  if (isShaken(b, u)) return [];
  return neighbors(u.c, u.r).map((n) => unitAt(b, n.c, n.r)).filter((e) => e && e.side !== u.side);
}

export function shootTargets(b, u) {
  if (u.type !== 'arc' || isShaken(b, u)) return [];
  const range = shootRange(b, u);
  return activeUnits(b, enemyOf(u.side)).filter((e) => hexDist(u, e) <= range);
}

// Where a charge at `t` would carry the cavalry: straight through and out the
// far side. Returns null if the charge is impossible.
export function chargeLanding(b, u, t) {
  if (u.type !== 'cav' || u.moved || u.done || isShaken(b, u)) return null;
  if (hexDist(u, t) !== 1 || t.side === u.side) return null;
  if (isCastle(b, t.c, t.r)) return null;
  const d = neighbors(u.c, u.r).find((n) => n.c === t.c && n.r === t.r).d;
  const land = stepDir(t.c, t.r, d);
  if (!inBounds(land.c, land.r)) return null;
  const ter = terrainAt(b, land.c, land.r);
  if (!(ter in CHARGE_THROUGH) || !(terrainAt(b, t.c, t.r) in CHARGE_THROUGH)) return null;
  if (unitAt(b, land.c, land.r) || b.fire[idx(land.c, land.r)] > 0) return null;
  return land;
}

export function chargeTargets(b, u) {
  return meleeTargets(b, u).filter((t) => chargeLanding(b, u, t));
}

export function fireTargets(b, u) {
  if (b.weather === 'rain' || isShaken(b, u)) return [];
  return neighbors(u.c, u.r).filter((n) => {
    const ter = terrainAt(b, n.c, n.r);
    const occupant = unitAt(b, n.c, n.r);
    return TERRAIN[ter].flammable > 0 && b.fire[idx(n.c, n.r)] === 0 && (!occupant || occupant.side !== u.side);
  });
}

// Infantry and archers next to unbreached walls can assault them; cavalry cannot.
export function canAssault(b, u) {
  if (u.side !== 'att' || u.type === 'cav' || isShaken(b, u) || b.walls <= 0) return false;
  return hexDist(u, b.castle) === 1;
}

export function canRetreat(b, u, state, retreatOptions) {
  if (u.side === 'att') return true;
  return retreatOptions?.def ?? false;
}

// Does this unit still have anything it could do this phase?
export function unitHasOptions(b, u) {
  if (u.done || u.status !== 'active') return false;
  if (!u.moved) return true;
  return meleeTargets(b, u).length > 0 || shootTargets(b, u).length > 0
    || fireTargets(b, u).length > 0 || canAssault(b, u);
}

// ---- Combat math -----------------------------------------------------------

function effective(state, u, mode) {
  const o = officer(state, u);
  const base = mode === 'shoot' ? o.war * 0.5 + o.int * 0.5 : o.war * 0.8 + o.int * 0.2;
  return Math.max(5, base) * (0.6 + u.training / 250) * (0.5 + u.morale / 200);
}

const ratio = (a, d) => clamp(Math.pow(a / d, 0.8), 0.35, 2.8);

// Melee defence of a unit where it stands; the castle's depends on its walls.
function meleeDefence(b, u) {
  const ter = terrainAt(b, u.c, u.r);
  if (ter === 'castle') return TERRAIN.castle.def + b.walls / 100;
  return TERRAIN[ter].def;
}

function arrowCover(b, u) {
  const ter = terrainAt(b, u.c, u.r);
  if (ter === 'castle') return clamp(1 - b.walls / 70, 0.15, 1);
  return TERRAIN[ter].cover;
}

// Multipliers for `a` striking `d` in melee, with reasons for the info panel.
// `counter` marks the defender's return blow, which uses the defender's own
// position; a garrison that sallies out has left the shelter of its walls.
function meleeFactors(b, a, d, charge, counter = false) {
  const f = [];
  const aTer = terrainAt(b, a.c, a.r);
  const dTer = terrainAt(b, d.c, d.r);
  const push = (mult, why) => { if (Math.abs(mult - 1) > 0.001) f.push({ mult, why }); };
  push(TYPE_MOD[a.type][d.type], `${UNIT_TYPES[a.type].label} vs ${UNIT_TYPES[d.type].label.toLowerCase()}`);
  if (charge) {
    const landTer = terrainAt(b, charge.c, charge.r);
    const worst = Math.min(CHARGE_THROUGH[dTer], CHARGE_THROUGH[landTer]);
    push(worst, worst > 1 ? 'charge across open ground' : `charge through ${TERRAIN[CHARGE_THROUGH[dTer] <= CHARGE_THROUGH[landTer] ? dTer : landTer].label.toLowerCase()}`);
  } else {
    push(ATTACK_INTO[a.type][dTer] ?? 1, `attacking into ${TERRAIN[dTer].label.toLowerCase()}`);
    if (a.type === 'cav') push(0.85, 'no room to charge');
  }
  push(TERRAIN[aTer].footing, `poor footing in ${TERRAIN[aTer].label.toLowerCase()}`);
  if ((dTer === 'hills' || dTer === 'mountain') && !HIGH_GROUND.has(aTer)) push(0.9, 'attacking uphill');
  const sallied = counter && dTer === 'castle';
  if (!sallied) push(1 / meleeDefence(b, d), dTer === 'castle' ? `castle walls (${Math.round(b.walls)})` : `${TERRAIN[dTer].label.toLowerCase()} defence`);
  // Flanking: every other enemy of the target standing beside it adds to the blow.
  if (!counter && dTer !== 'castle') {
    const flankers = neighbors(d.c, d.r).map((n) => unitAt(b, n.c, n.r)).filter((x) => x && x !== a && x.side === a.side).length;
    if (flankers) push(1 + 0.15 * Math.min(3, flankers), `flanked by ${flankers} more unit${flankers > 1 ? 's' : ''}`);
  }
  return f;
}

const product = (factors) => factors.reduce((m, x) => m * x.mult, 1);

export function previewMelee(state, b, a, d, charge = null) {
  const r = ratio(effective(state, a, 'melee'), effective(state, d, 'melee'));
  const factors = meleeFactors(b, a, d, charge);
  const dmg = a.troops * 0.07 * r * product(factors);
  // The defender strikes back; a charge that rides through is hard to punish.
  const counterMod = (d.type === 'arc' ? 0.5 : 1) * (charge ? (d.type === 'inf' ? 0.8 : 0.5) : 1);
  const back = meleeFactors(b, d, a, null, true).filter((x) => !/attacking uphill|no room to charge/.test(x.why));
  const counter = d.troops * 0.035 * (1 / r) * product(back) * counterMod;
  return { dmg: Math.min(d.troops, Math.round(dmg)), counter: Math.min(a.troops, Math.round(counter)), factors };
}

export function previewCharge(state, b, a, d) {
  const land = chargeLanding(b, a, d);
  return land ? { ...previewMelee(state, b, a, d, land), land } : null;
}

export function previewShoot(state, b, a, d) {
  const r = ratio(effective(state, a, 'shoot'), effective(state, d, 'melee'));
  const f = [];
  const push = (mult, why) => { if (Math.abs(mult - 1) > 0.001) f.push({ mult, why }); };
  const dTer = terrainAt(b, d.c, d.r);
  push(arrowCover(b, d), dTer === 'castle' ? `behind the walls (${Math.round(b.walls)})` : `target in ${TERRAIN[dTer].label.toLowerCase()}`);
  if (HIGH_GROUND.has(terrainAt(b, a.c, a.r))) push(1.2, 'shooting from high ground');
  if (b.weather === 'rain') push(0.5, 'rain');
  if (hexDist(a, d) === 1) push(0.8, 'point-blank');
  const dmg = a.troops * 0.035 * r * product(f);
  // Archers under fire from archers in range answer with a volley of their own.
  let counter = 0;
  if (d.type === 'arc' && hexDist(a, d) <= shootRange(b, d) && !isShaken(b, d)) {
    const back = ratio(effective(state, d, 'shoot'), effective(state, a, 'melee'));
    const hi = HIGH_GROUND.has(terrainAt(b, d.c, d.r)) ? 1.2 : 1;
    counter = d.troops * 0.035 * 0.5 * back * arrowCover(b, a) * hi * (b.weather === 'rain' ? 0.5 : 1);
  }
  return { dmg: Math.min(d.troops, Math.round(dmg)), counter: Math.min(a.troops, Math.round(counter)), factors: f };
}

export function previewAssault(state, b, u) {
  const o = officer(state, u);
  const strength = (u.troops / 1000) * (u.type === 'inf' ? 1.8 : 0.4) * (0.6 + o.war / 150) * (0.5 + u.morale / 200);
  const loss = Math.round(u.troops * 0.02 * (0.3 + b.walls / 100));
  return { walls: Math.min(b.walls, Math.max(1, Math.round(strength))), loss };
}

function applyLoss(state, b, u, loss) {
  if (loss <= 0) return;
  const frac = loss / Math.max(1, u.troops);
  u.troops = Math.max(0, u.troops - loss);
  u.morale = clamp(Math.round(u.morale - frac * 60), 0, 100);
  if (u.troops <= 0) defeatUnit(state, b, u, 'destroyed');
  else if (u.morale <= 0) defeatUnit(state, b, u, 'routed');
}

function defeatUnit(state, b, u, how) {
  const o = officer(state, u);
  u.status = 'defeated';
  u.done = true;
  // Survivors of a routed unit scatter; a fraction return with the officer.
  u.troops = how === 'routed' ? Math.round(u.troops * 0.4) : 0;
  const pCapture = clamp(0.45 - o.war / 400, 0.15, 0.45);
  u.captured = chance(state, pCapture);
  addLog(b, `${o.name}'s unit is ${how}!${u.captured ? ` ${o.name} is taken prisoner.` : ` ${o.name} escapes the field.`}`);
  checkVictory(state, b);
}

function exchange(state, b, a, d, dmg, counter, verb) {
  const ao = officer(state, a);
  const dO = officer(state, d);
  const jitter = () => 0.85 + rand(state) * 0.3;
  const dealt = Math.min(d.troops, Math.round(dmg * jitter()));
  const taken = Math.min(a.troops, Math.round(counter * jitter()));
  addLog(b, `${ao.name} ${verb} ${dO.name}: ${dealt} enemy casualties${taken ? `, ${taken} lost` : ''}.`);
  if (dealt > taken) a.morale = clamp(a.morale + 3, 0, 100);
  applyLoss(state, b, d, dealt);
  if (a.status === 'active') applyLoss(state, b, a, taken);
}

// ---- Actions ---------------------------------------------------------------

export function doMove(state, b, u, c, r) {
  const reach = reachable(b, u);
  if (!reach.has(idx(c, r))) return false;
  u.c = c;
  u.r = r;
  u.moved = true;
  if (u.side === 'att' && isCastle(b, c, r)) {
    addLog(b, `${officer(state, u).name} storms through the breach into the castle!`);
    endBattle(b, 'att', 'The castle has fallen.');
  }
  return true;
}

export function doAttack(state, b, u, t) {
  if (!meleeTargets(b, u).includes(t)) return false;
  const { dmg, counter } = previewMelee(state, b, u, t);
  u.done = true;
  exchange(state, b, u, t, dmg, counter, 'attacks');
  return true;
}

// Cavalry charges through the target and out the other side.
export function doCharge(state, b, u, t) {
  const p = previewCharge(state, b, u, t);
  if (!p) return false;
  u.done = true;
  u.moved = true;
  t.morale = clamp(t.morale - (p.factors.some((x) => x.why === 'charge across open ground') ? 10 : 3), 0, 100);
  exchange(state, b, u, t, p.dmg, p.counter, 'charges into');
  if (u.status === 'active') {
    u.c = p.land.c;
    u.r = p.land.r;
  }
  return true;
}

export function doShoot(state, b, u, t) {
  if (!shootTargets(b, u).includes(t)) return false;
  const { dmg, counter } = previewShoot(state, b, u, t);
  u.done = true;
  exchange(state, b, u, t, dmg, counter, 'looses arrows at');
  return true;
}

export function doAssault(state, b, u) {
  if (!canAssault(b, u)) return false;
  const { walls, loss } = previewAssault(state, b, u);
  u.done = true;
  const wasBreached = isBreached(b);
  b.walls = Math.max(0, b.walls - walls);
  addLog(b, `${officer(state, u).name} assaults the walls: walls ${Math.round(b.walls + walls)} → ${Math.round(b.walls)}, ${loss} lost.`);
  if (!wasBreached && isBreached(b)) addLog(b, 'The walls are breached!');
  applyLoss(state, b, u, loss);
  return true;
}

export function fireChance(state, b, u) {
  const o = officer(state, u);
  return clamp(0.2 + o.int / 140 - (b.weather === 'cloudy' ? 0.1 : 0), 0.05, 0.95);
}

export function doFire(state, b, u, c, r) {
  if (!fireTargets(b, u).some((n) => n.c === c && n.r === r)) return false;
  u.done = true;
  const o = officer(state, u);
  if (!chance(state, fireChance(state, b, u))) {
    addLog(b, `${o.name}'s fire attack sputters out.`);
    return true;
  }
  b.fire[idx(c, r)] = randInt(state, 2, 3);
  addLog(b, `${o.name} sets the ${TERRAIN[terrainAt(b, c, r)].label.toLowerCase()} ablaze!`);
  burnUnitAt(state, b, c, r);
  return true;
}

function burnUnitAt(state, b, c, r) {
  const t = unitAt(b, c, r);
  if (!t) return;
  const forest = terrainAt(b, c, r) === 'forest' ? 1.5 : 1;
  const loss = Math.round(t.troops * (0.1 + rand(state) * 0.1) * forest);
  t.morale = clamp(t.morale - 12, 0, 100);
  addLog(b, `Flames engulf ${officer(state, t).name}'s unit: ${loss} casualties.`);
  applyLoss(state, b, t, loss);
}

// ---- Duels -------------------------------------------------------------------

const DUEL_COOLDOWN = 3;
const duelKey = (a, d) => `${Math.min(a.id, d.id)}-${Math.max(a.id, d.id)}`;

export function duelTargets(b, u) {
  return meleeTargets(b, u).filter((t) => (b.duels[duelKey(u, t)] ?? -99) + DUEL_COOLDOWN <= b.day);
}

export function duelAcceptChance(state, challenger, target) {
  const a = state.officers[challenger.officer];
  const d = state.officers[target.officer];
  return d.war >= a.war - 8 ? 0.85 : d.war >= a.war - 20 ? 0.35 : 0.12;
}

// Chance the challenger wins, by simulating the bout many times.
export function duelWinChance(state, challenger, target) {
  const a = state.officers[challenger.officer].war;
  const d = state.officers[target.officer].war;
  const rng = { seed: hashString(`duel:${a}:${d}`) };
  let wins = 0;
  let decided = 0;
  for (let i = 0; i < 400; i++) {
    const r = fightDuel(rng, a, d);
    if (r !== 0) decided++;
    if (r > 0) wins++;
  }
  return decided ? wins / 400 : 0.5;
}

// +1 challenger wins, -1 loses, 0 draw.
function fightDuel(rng, warA, warD) {
  let hpA = 100;
  let hpD = 100;
  const pA = Math.pow(warA, 3) / (Math.pow(warA, 3) + Math.pow(warD, 3));
  for (let round = 1; round <= 30 && hpA > 0 && hpD > 0; round++) {
    const blow = randInt(rng, 8, 22);
    if (rand(rng) < pA) hpD -= blow;
    else hpA -= blow;
  }
  return hpA > 0 && hpD > 0 ? 0 : hpA > 0 ? 1 : -1;
}

// Issue a challenge. If the target is controlled by a player, the challenge
// waits in b.pendingDuel for them to answer; otherwise it is resolved now.
export function doDuel(state, b, u, t) {
  if (!duelTargets(b, u).includes(t)) return false;
  u.done = true;
  b.duels[duelKey(u, t)] = b.day;
  addLog(b, `${officer(state, u).name} challenges ${officer(state, t).name} to single combat!`);
  if (b.humanSides[t.side]) {
    b.pendingDuel = { challenger: u.id, target: t.id };
    return true;
  }
  answerDuel(state, b, u, t, chance(state, duelAcceptChance(state, u, t)));
  return true;
}

export function answerPendingDuel(state, b, accept) {
  const p = b.pendingDuel;
  if (!p) return;
  b.pendingDuel = null;
  const u = b.units.find((x) => x.id === p.challenger);
  const t = b.units.find((x) => x.id === p.target);
  answerDuel(state, b, u, t, accept);
}

function answerDuel(state, b, u, t, accepted) {
  const a = officer(state, u);
  const d = officer(state, t);
  if (!accepted) {
    // Refusing shames the whole army; a second refusal breaks the unit's nerve.
    t.refusals += 1;
    t.morale = clamp(t.morale - 15, 0, 100);
    for (const ally of activeUnits(b, t.side)) if (ally !== t) ally.morale = clamp(ally.morale - 5, 0, 100);
    u.morale = clamp(u.morale + 10, 0, 100);
    let msg = `${d.name} refuses the challenge! The whole army is shamed.`;
    if (t.refusals >= 2) {
      t.shakenDay = b.day + (b.side === t.side ? 0 : 1);
      msg += ` ${d.name}'s troops lose heart and will not fight ${b.side === t.side ? 'today' : 'tomorrow'}.`;
    }
    addLog(b, msg);
    if (t.morale <= 0) defeatUnit(state, b, t, 'routed');
    return;
  }
  addLog(b, `${a.name} and ${d.name} ride out to duel!`);
  const res = fightDuel(state, a.war, d.war);
  if (res === 0) {
    addLog(b, 'After many bouts neither can best the other. They withdraw.');
    return;
  }
  const [winner, loser, wu, lu] = res > 0 ? [a, d, u, t] : [d, a, t, u];
  addLog(b, `${winner.name} defeats ${loser.name} in single combat!`);
  wu.morale = clamp(wu.morale + 20, 0, 100);
  lu.status = 'defeated';
  lu.done = true;
  lu.troops = Math.round(lu.troops * 0.5);
  const roll = rand(state);
  if (roll < 0.15) {
    lu.slain = true;
    addLog(b, `${loser.name} is slain!`);
  } else if (roll < 0.6) {
    lu.captured = true;
    addLog(b, `${loser.name} is captured.`);
  } else {
    addLog(b, `${loser.name} barely escapes alive.`);
  }
  checkVictory(state, b);
}

export function doWait(b, u) {
  u.done = true;
}

export function doRetreat(state, b, u) {
  u.status = 'retreated';
  u.done = true;
  u.troops = Math.round(u.troops * 0.85);
  addLog(b, `${officer(state, u).name} withdraws from the field.`);
  checkVictory(state, b);
}

// ---- Flow ------------------------------------------------------------------

function endBattle(b, winner, reason) {
  if (b.result) return;
  b.result = { winner, reason };
  addLog(b, reason);
}

export function checkVictory(state, b) {
  if (b.result) return;
  for (const side of ['att', 'def']) {
    const cmd = b.units.find((u) => u.side === side && u.commander);
    const alive = activeUnits(b, side);
    const who = side === 'att' ? 'attacking' : 'defending';
    if (!alive.length) return endBattle(b, enemyOf(side), `The ${who} army has been wiped out.`);
    if (cmd && cmd.status !== 'active') {
      return endBattle(b, enemyOf(side), `The ${who} commander ${officer(state, cmd).name} has left the field — the army collapses.`);
    }
  }
}

function startPhase(b, side) {
  b.side = side;
  for (const u of activeUnits(b, side)) {
    u.moved = false;
    u.done = false;
  }
}

// The phase is over once no unit of the side to move has anything left to do.
export function phaseDone(b) {
  return !b.pendingDuel && activeUnits(b, b.side).every((u) => !unitHasOptions(b, u));
}

export function endPhase(state, b) {
  if (b.result) return;
  if (b.side === 'att') {
    startPhase(b, 'def');
    wallGarrison(state, b);
    return;
  }
  endDay(state, b);
  if (!b.result) startPhase(b, 'att');
}

// The walls fight as a unit of their own: at the start of the defenders' turn
// their garrison looses a free volley at every attacker right beside the
// castle, on top of whatever the unit inside does.
export const GARRISON_RANGE = 1;

export function garrisonVolley(b, u) {
  if (b.walls <= 0) return 0;
  return Math.min(u.troops, Math.round(b.walls * 4 * arrowCover(b, u) * (b.weather === 'rain' ? 0.5 : 1)));
}
function wallGarrison(state, b) {
  if (b.walls <= 0) return;
  const hit = activeUnits(b, 'att').filter((u) => hexDist(u, b.castle) <= GARRISON_RANGE);
  if (!hit.length) return;
  const losses = [];
  for (const u of hit) {
    u.morale = clamp(u.morale - Math.round(b.walls / 40), 0, 100);
    losses.push([u, garrisonVolley(b, u)]);
  }
  addLog(b, `Archers on the walls rain arrows on the besiegers: ${losses.map(([u, l]) => `${officer(state, u).name} −${l}`).join(', ')}.`);
  for (const [u, loss] of losses) if (u.status === 'active') applyLoss(state, b, u, loss);
}

function endDay(state, b) {
  // Fire burns units inside it, then spreads with the wind.
  const burning = [];
  for (let r = 0; r < BATTLE_H; r++) for (let c = 0; c < BATTLE_W; c++) if (b.fire[idx(c, r)] > 0) burning.push({ c, r });
  for (const { c, r } of burning) {
    burnUnitAt(state, b, c, r);
    for (const n of neighbors(c, r)) {
      const k = idx(n.c, n.r);
      const fl = TERRAIN[terrainAt(b, n.c, n.r)].flammable;
      if (b.fire[k] > 0 || !fl) continue;
      // The wind "from" direction d blows fire toward the opposite side.
      const downwind = n.d === (b.wind + 3) % 6;
      const upwind = n.d === b.wind;
      const p = fl * (downwind ? 2.2 : upwind ? 0.2 : 0.8);
      if (chance(state, p)) b.fire[k] = -randInt(state, 2, 3); // ignites next day
    }
  }
  for (let k = 0; k < b.fire.length; k++) {
    if (b.fire[k] > 0) b.fire[k] -= 1;
    else if (b.fire[k] < 0) b.fire[k] = -b.fire[k];
  }
  // Supplies.
  const attTroops = activeUnits(b, 'att').reduce((s, u) => s + u.troops, 0);
  const defTroops = activeUnits(b, 'def').reduce((s, u) => s + u.troops, 0);
  b.attFood -= Math.ceil(attTroops / 3000);
  b.defFood -= Math.ceil(defTroops / 3000);
  if (b.attFood <= 0) {
    b.attFood = 0;
    for (const u of activeUnits(b, 'att')) u.morale = clamp(u.morale - 12, 0, 100);
    addLog(b, 'The attackers have run out of food! Morale plummets.');
  }
  if (b.defFood <= 0) {
    b.defFood = 0;
    for (const u of activeUnits(b, 'def')) u.morale = clamp(u.morale - 8, 0, 100);
    addLog(b, 'The defenders’ granaries are empty.');
  }
  for (const u of activeUnits(b)) {
    if (u.morale <= 0) defeatUnit(state, b, u, 'routed');
    else if (u.side === 'def' && isCastle(b, u.c, u.r)) u.morale = clamp(u.morale + 3, 0, 100);
  }
  if (b.result) return;
  b.day += 1;
  if (b.day > b.maxDays) {
    endBattle(b, 'def', 'Thirty days have passed. The attackers withdraw.');
    return;
  }
  // Weather.
  const w = rand(state);
  b.weather = w < 0.68 ? 'clear' : w < 0.88 ? 'cloudy' : 'rain';
  if (b.weather === 'rain') {
    for (let k = 0; k < b.fire.length; k++) b.fire[k] = 0;
  }
  if (chance(state, 0.2)) b.wind = randInt(state, 0, 5);
  addLog(b, `Day ${b.day}. ${b.weather === 'rain' ? 'Rain falls.' : b.weather === 'cloudy' ? 'Clouds gather.' : 'Clear skies.'}`);
}

// ---- AI --------------------------------------------------------------------

function scoreTarget(state, b, u, t, dmg) {
  let s = dmg;
  if (t.commander) s *= 1.6;
  if (dmg >= t.troops) s *= 2;
  return s;
}

function bestAttack(state, b, u) {
  let best = null;
  // While the walls stand, besiegers next to them work on the walls rather than
  // throwing themselves at the garrison behind them.
  const skip = (t) => u.side === 'att' && isCastle(b, t.c, t.r) && !isBreached(b) && canAssault(b, u) && t.troops > 1500;
  for (const t of shootTargets(b, u).filter((x) => !skip(x))) {
    const { dmg } = previewShoot(state, b, u, t);
    const s = scoreTarget(state, b, u, t, dmg) * 1.2;
    if (!best || s > best.s) best = { kind: 'shoot', t, s };
  }
  for (const t of chargeTargets(b, u)) {
    const p = previewCharge(state, b, u, t);
    const s = scoreTarget(state, b, u, t, p.dmg) - p.counter * 0.8;
    if (!best || s > best.s) best = { kind: 'charge', t, s };
  }
  for (const t of meleeTargets(b, u).filter((x) => !skip(x))) {
    const { dmg, counter } = previewMelee(state, b, u, t);
    // Once the walls are breached, storming the garrison is worth real losses.
    // The commander storms only if there is no other foot soldier to do it.
    const footSoldiers = activeUnits(b, 'att').filter((x) => x !== u && x.type !== 'cav');
    const storming = u.side === 'att' && isCastle(b, t.c, t.r) && isBreached(b) && (!u.commander || !footSoldiers.length);
    const s = storming ? (dmg >= counter * 0.5 ? dmg : -1) : scoreTarget(state, b, u, t, dmg) - counter * tradeWeight(b, u);
    if (!best || s > best.s) best = { kind: 'melee', t, s };
  }
  return best;
}

// How much a unit minds its own losses when trading blows. Time is on the
// defender's side, so attackers grow bolder as the campaign wears on.
function tradeWeight(b, u) {
  if (u.side !== 'att') return 0.8;
  const urgency = b.day / b.maxDays;
  return u.commander ? 0.8 : clamp(0.7 - urgency * 0.5, 0.25, 0.7);
}

function perform(state, b, u, atk) {
  if (atk.kind === 'shoot') doShoot(state, b, u, atk.t);
  else if (atk.kind === 'charge') doCharge(state, b, u, atk.t);
  else doAttack(state, b, u, atk.t);
}

function tryDuel(state, b, u) {
  const me = officer(state, u);
  for (const t of duelTargets(b, u)) {
    const them = officer(state, t);
    if (me.war - them.war >= 12 && chance(state, t.commander ? 0.5 : 0.3)) {
      doDuel(state, b, u, t);
      return true;
    }
  }
  return false;
}

function goalFor(state, b, u) {
  const enemies = activeUnits(b, enemyOf(u.side));
  const nearest = (list) => list.reduce((a, e) => (!a || hexDist(u, e) < hexDist(u, a) ? e : a), null);
  if (u.side === 'att') {
    const occupant = castleOccupant(b);
    if (isBreached(b) && !occupant) return b.castle;
    if (u.commander) {
      const field = enemies.filter((e) => !isCastle(b, e.c, e.r));
      return nearest(field) || b.castle;
    }
    // Foot soldiers go to work on the walls; cavalry hunts in the open.
    if (!isBreached(b) && u.type !== 'cav') return b.castle;
    const cmd = enemies.find((e) => e.commander);
    if (cmd && hexDist(u, cmd) <= 6 && !isCastle(b, cmd.c, cmd.r)) return cmd;
    const field = enemies.filter((e) => !isCastle(b, e.c, e.r));
    return nearest(field.length ? field : enemies) || b.castle;
  }
  if (u.commander) return b.castle;
  const threats = enemies.filter((e) => hexDist(e, b.castle) <= 5);
  return nearest(threats.length ? threats : enemies) || b.castle;
}

// Walking cost from every hex to the goal for this kind of unit, going round
// rivers and through fords (units are ignored; they move).
function travelField(b, u, goal) {
  const dist = new Array(BATTLE_W * BATTLE_H).fill(Infinity);
  dist[idx(goal.c, goal.r)] = 0;
  const frontier = [{ c: goal.c, r: goal.r, d: 0 }];
  while (frontier.length) {
    frontier.sort((a, z) => a.d - z.d);
    const cur = frontier.shift();
    if (cur.d > dist[idx(cur.c, cur.r)]) continue;
    // Stepping from a neighbour into `cur` costs cur's terrain.
    const here = TERRAIN[terrainAt(b, cur.c, cur.r)].cost;
    const step = here ? here[u.type] : Infinity;
    for (const n of neighbors(cur.c, cur.r)) {
      const nd = cur.d + (isCastle(b, cur.c, cur.r) && !(cur.c === goal.c && cur.r === goal.r) ? Infinity : step);
      const ter = TERRAIN[terrainAt(b, n.c, n.r)];
      if (!ter.cost || nd >= dist[idx(n.c, n.r)]) continue;
      dist[idx(n.c, n.r)] = nd;
      frontier.push({ c: n.c, r: n.r, d: nd });
    }
  }
  return dist;
}

// How attractive a hex is for this unit to end its move on (lower is better).
function positionScore(state, b, u, node, goal, field) {
  const ter = terrainAt(b, node.c, node.r);
  const walk = field[idx(node.c, node.r)];
  let s = (Number.isFinite(walk) ? walk : hexDist(node, goal) * 3 + 30) * 5 + node.cost;
  const nearestEnemy = activeUnits(b, enemyOf(u.side)).reduce((m, e) => Math.min(m, hexDist(node, e)), 99);
  if (u.type === 'arc') {
    if (nearestEnemy === 1) s += 12;
    else if (nearestEnemy <= 3) s -= 12;
    if (HIGH_GROUND.has(ter)) s -= 10;
  }
  if (u.type === 'cav') {
    // Cavalry wants open ground to charge from, and hates being caught in marsh or forest.
    if (ter === 'marsh' || ter === 'forest') s += 15;
    if (ter === 'plains') s -= 4;
  } else {
    // Defenders value cover; attackers value closing with the enemy more.
    s -= (TERRAIN[ter].def - 1) * (u.side === 'def' ? 20 : 8);
  }
  if (u.side === 'att' && !isBreached(b) && u.type !== 'cav' && hexDist(node, b.castle) === 1) s -= 15;
  if (u.side === 'att' && !isBreached(b) && hexDist(node, b.castle) <= GARRISON_RANGE) s += u.type === 'cav' ? 20 : 0;
  if (u.side === 'def' && hexDist(node, b.castle) > 4) s += 30;
  // The attacking commander stays out of the garrison's reach until the castle is open.
  if (u.side === 'att' && u.commander && !(isBreached(b) && !castleOccupant(b))) {
    const d = hexDist(node, b.castle);
    if (d <= GARRISON_RANGE) s += 60;
  }
  return s;
}

// One AI unit acts. Returns false if no unit was left to act.
export function aiStep(state, b) {
  if (b.result || b.pendingDuel) return false;
  const u = activeUnits(b, b.side).find((x) => !x.done);
  if (!u) return false;
  const o = officer(state, u);

  // Badly mauled units pull back rather than die.
  if (!u.commander && u.troops < u.startTroops * 0.12 && u.troops < 800 && canRetreat(b, u, state, b.retreatOptions)) {
    doRetreat(state, b, u);
    return true;
  }
  if (tryDuel(state, b, u)) return true;
  const fires = fireTargets(b, u).filter((n) => unitAt(b, n.c, n.r));
  if (fires.length && o.int >= 75 && chance(state, 0.4)) {
    const n = pick(state, fires);
    doFire(state, b, u, n.c, n.r);
    return true;
  }
  // Only strike when the exchange favours us; a commander in particular should
  // not bleed his army against a stronger position.
  let atk = bestAttack(state, b, u);
  if (atk && (atk.kind !== 'melee' || atk.s > 0)) {
    perform(state, b, u, atk);
    return true;
  }
  // Otherwise keep battering the walls: every point lost weakens the defence.
  // The commander directs the siege rather than joining the assault.
  if (canAssault(b, u) && (!u.commander || !activeUnits(b, 'att').some((x) => x !== u && x.type !== 'cav'))) {
    doAssault(state, b, u);
    return true;
  }

  // Move: toward the goal, preferring hexes from which we can strike.
  const goal = goalFor(state, b, u);
  const holdCastle = u.side === 'def' && u.commander;
  if (!holdCastle && !u.moved) {
    const reach = reachable(b, u);
    const field = travelField(b, u, goal);
    let best = null;
    for (const node of reach.values()) {
      if (u.side === 'att' && isCastle(b, node.c, node.r)) {
        best = { node, s: -1e9 };
        break;
      }
      const s = positionScore(state, b, u, node, goal, field);
      if (!best || s < best.s) best = { node, s };
    }
    if (best && (best.node.c !== u.c || best.node.r !== u.r)) {
      doMove(state, b, u, best.node.c, best.node.r);
      if (b.result) return true;
      atk = bestAttack(state, b, u);
      if (atk && (atk.kind === 'shoot' || atk.s > 0)) {
        perform(state, b, u, atk);
        return true;
      }
      if (canAssault(b, u) && (!u.commander || !activeUnits(b, 'att').some((x) => x !== u && x.type !== 'cav'))) {
        doAssault(state, b, u);
        return true;
      }
    }
  }
  doWait(b, u);
  return true;
}

export function runAIPhase(state, b) {
  while (!b.result && aiStep(state, b));
}

export function autoResolve(state, b) {
  let guard = 0;
  while (!b.result && guard++ < 200) {
    runAIPhase(state, b);
    // Nobody is there to answer: an unattended challenge is accepted if the odds are fair.
    if (b.pendingDuel) {
      const p = b.pendingDuel;
      const u = b.units.find((x) => x.id === p.challenger);
      const t = b.units.find((x) => x.id === p.target);
      answerPendingDuel(state, b, duelAcceptChance(state, u, t) > 0.5);
      continue;
    }
    endPhase(state, b);
  }
  if (!b.result) endBattle(b, 'def', 'The attackers withdraw.');
  return b.result;
}
