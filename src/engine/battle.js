// Tactical hex battles. A battle lasts up to 30 days; each day the attacker's
// units act, then the defender's. Every unit may move and then take one action.

import { rand, chance, randInt, clamp, pick } from './rng.js';

export const BATTLE_W = 15;
export const BATTLE_H = 11;
export const MAX_DAYS = 30;

export const TERRAIN = {
  plains: { label: 'Plains', cost: { inf: 1, cav: 1, arc: 1 }, def: 1.0, flammable: 0.2 },
  forest: { label: 'Forest', cost: { inf: 2, cav: 3, arc: 2 }, def: 1.15, flammable: 0.4 },
  hills: { label: 'Hills', cost: { inf: 2, cav: 2, arc: 2 }, def: 1.15, flammable: 0.12 },
  mountain: { label: 'Mountain', cost: { inf: 3, cav: 5, arc: 3 }, def: 1.3, flammable: 0.05 },
  marsh: { label: 'Marsh', cost: { inf: 3, cav: 4, arc: 3 }, def: 0.9, flammable: 0 },
  river: { label: 'River', cost: null, def: 1, flammable: 0 },
  ford: { label: 'Ford', cost: { inf: 2, cav: 2, arc: 2 }, def: 0.8, flammable: 0 },
  castle: { label: 'Castle', cost: { inf: 1, cav: 1, arc: 1 }, def: 1.4, flammable: 0.1 },
};

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

function toCube(c, r) {
  const x = c - (r - (r & 1)) / 2;
  return [x, -x - r, r];
}

export function hexDist(a, b) {
  const [ax, ay, az] = toCube(a.c, a.r);
  const [bx, by, bz] = toCube(b.c, b.r);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

// ---- Setup -----------------------------------------------------------------

function generateTerrain(state, provTerrain, river) {
  const t = new Array(BATTLE_W * BATTLE_H).fill('plains');
  const profile = PROFILES[provTerrain] || PROFILES.plains;
  for (const [type, density] of Object.entries(profile)) {
    const blobs = Math.round((BATTLE_W * BATTLE_H * density) / 5);
    for (let i = 0; i < blobs; i++) {
      const c0 = randInt(state, 0, BATTLE_W - 1);
      const r0 = randInt(state, 0, BATTLE_H - 1);
      const rad = randInt(state, 0, 2);
      for (let r = 0; r < BATTLE_H; r++) {
        for (let c = 0; c < BATTLE_W; c++) {
          const d = hexDist({ c, r }, { c: c0, r: r0 });
          if (d <= rad && (d === 0 || chance(state, 0.65))) t[idx(c, r)] = type;
        }
      }
    }
  }
  if (river) {
    let c = randInt(state, 5, 8);
    const fords = new Set([randInt(state, 0, 3), randInt(state, 4, 6), randInt(state, 7, BATTLE_H - 1)]);
    for (let r = 0; r < BATTLE_H; r++) {
      t[idx(c, r)] = fords.has(r) ? 'ford' : 'river';
      const drift = rand(state);
      if (drift < 0.25 && c > 4) c -= 1;
      else if (drift > 0.75 && c < 9) c += 1;
    }
  }
  return t;
}

function freeHexNear(b, c0, r0, avoid = () => false) {
  let best = null;
  let bestD = Infinity;
  for (let r = 0; r < BATTLE_H; r++) {
    for (let c = 0; c < BATTLE_W; c++) {
      if (unitAt(b, c, r) || avoid(c, r)) continue;
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
//          def: {force|null, officers:[...], commander} }
export function createBattle(state, { pid, from, provTerrain, river, walls, att, def, humanSides }) {
  const b = {
    pid,
    from,
    walls,
    day: 1,
    maxDays: MAX_DAYS,
    terrain: generateTerrain(state, provTerrain, river),
    fire: new Array(BATTLE_W * BATTLE_H).fill(0),
    castle: { c: BATTLE_W - 3, r: Math.floor(BATTLE_H / 2) },
    weather: 'clear',
    wind: randInt(state, 0, 5),
    side: 'att',
    forces: { att: att.force, def: def.force },
    attFood: att.food,
    defFood: def.food,
    units: [],
    result: null,
    log: [],
    humanSides: humanSides || { att: false, def: false },
  };
  // The castle and its approaches are always passable.
  const { c: cc, r: cr } = b.castle;
  b.terrain[idx(cc, cr)] = 'castle';
  for (const n of neighbors(cc, cr)) if (b.terrain[idx(n.c, n.r)] !== 'ford') b.terrain[idx(n.c, n.r)] = 'plains';
  for (let r = 0; r < BATTLE_H; r++) for (let c = 0; c < 2; c++) if (b.terrain[idx(c, r)] === 'river') b.terrain[idx(c, r)] = 'plains';

  let uid = 0;
  const mid = Math.floor(BATTLE_H / 2);
  const attOrder = [...att.officers].sort((x, y) => (y.officer === att.commander) - (x.officer === att.commander));
  attOrder.forEach((o, i) => {
    const r0 = clamp(mid + (i % 2 ? 1 : -1) * Math.ceil(i / 2), 0, BATTLE_H - 1);
    const spot = freeHexNear(b, i >= BATTLE_H ? 1 : 0, r0, (c) => c > 2);
    b.units.push(makeUnit(uid++, 'att', o, spot, o.officer === att.commander));
  });
  const defOrder = [...def.officers].sort((x, y) => (y.officer === def.commander) - (x.officer === def.commander));
  defOrder.forEach((o, i) => {
    const isCmd = o.officer === def.commander;
    const spot = isCmd ? { ...b.castle } : freeHexNear(b, cc - 2, cr + (i % 2 ? 1 : -1) * Math.ceil(i / 2), (c) => c < BATTLE_W - 7);
    b.units.push(makeUnit(uid++, 'def', o, spot, isCmd));
  });
  addLog(b, `Day 1. Battle for the province begins. The wind blows from the ${WIND_NAMES[b.wind]}.`);
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
  };
}

// ---- Queries ---------------------------------------------------------------

export const activeUnits = (b, side) => b.units.filter((u) => u.status === 'active' && (!side || u.side === side));
export const unitAt = (b, c, r) => b.units.find((u) => u.status === 'active' && u.c === c && u.r === r) || null;
export const enemyOf = (side) => (side === 'att' ? 'def' : 'att');
export const terrainAt = (b, c, r) => b.terrain[idx(c, r)];

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
  const ter = terrainAt(b, u.c, u.r);
  return ter === 'hills' || ter === 'mountain' || ter === 'castle' ? 3 : 2;
}

export function meleeTargets(b, u) {
  return neighbors(u.c, u.r).map((n) => unitAt(b, n.c, n.r)).filter((e) => e && e.side !== u.side);
}

export function shootTargets(b, u) {
  if (u.type !== 'arc') return [];
  const range = shootRange(b, u);
  return activeUnits(b, enemyOf(u.side)).filter((e) => hexDist(u, e) <= range);
}

export function fireTargets(b, u) {
  if (b.weather === 'rain') return [];
  return neighbors(u.c, u.r).filter((n) => {
    const ter = terrainAt(b, n.c, n.r);
    const occupant = unitAt(b, n.c, n.r);
    return TERRAIN[ter].flammable > 0 && b.fire[idx(n.c, n.r)] === 0 && (!occupant || occupant.side !== u.side);
  });
}

export function canRetreat(b, u, state, retreatOptions) {
  if (u.side === 'att') return true;
  return retreatOptions?.def ?? false;
}

// ---- Combat math -----------------------------------------------------------

function effective(state, u, mode) {
  const o = officer(state, u);
  const base = mode === 'shoot' ? o.war * 0.5 + o.int * 0.5 : o.war * 0.8 + o.int * 0.2;
  return Math.max(5, base) * (0.6 + u.training / 250) * (0.5 + u.morale / 200);
}

function terrainDef(b, u) {
  const ter = terrainAt(b, u.c, u.r);
  if (ter === 'castle') return u.side === 'def' ? 1.4 + b.walls / 100 : 1.2;
  return TERRAIN[ter].def;
}

function cavalryTerrain(b, u) {
  if (u.type !== 'cav') return 1;
  const ter = terrainAt(b, u.c, u.r);
  if (ter === 'plains') return 1.2;
  if (ter === 'forest' || ter === 'mountain' || ter === 'marsh') return 0.75;
  return 1;
}

const ratio = (a, d) => clamp(Math.pow(a / d, 0.8), 0.35, 2.8);

export function previewMelee(state, b, a, d) {
  const r = ratio(effective(state, a, 'melee'), effective(state, d, 'melee'));
  const dmg = a.troops * 0.07 * r * TYPE_MOD[a.type][d.type] * cavalryTerrain(b, a) / terrainDef(b, d);
  const counterMod = d.type === 'arc' ? 0.5 : 1;
  const counter = d.troops * 0.035 * (1 / r) * TYPE_MOD[d.type][a.type] * counterMod * cavalryTerrain(b, d) / terrainDef(b, a);
  return { dmg: Math.min(d.troops, Math.round(dmg)), counter: Math.min(a.troops, Math.round(counter)) };
}

export function previewShoot(state, b, a, d) {
  const r = ratio(effective(state, a, 'shoot'), effective(state, d, 'melee'));
  let dmg = a.troops * 0.05 * r / terrainDef(b, d);
  if (terrainAt(b, d.c, d.r) === 'forest') dmg *= 0.8;
  if (b.weather === 'rain') dmg *= 0.5;
  if (hexDist(a, d) === 1) dmg *= 0.8;
  return { dmg: Math.min(d.troops, Math.round(dmg)), counter: 0 };
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
  if (u.side === 'att' && c === b.castle.c && r === b.castle.r) {
    addLog(b, `${officer(state, u).name} storms into the castle!`);
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

export function doShoot(state, b, u, t) {
  if (!shootTargets(b, u).includes(t)) return false;
  const { dmg } = previewShoot(state, b, u, t);
  u.done = true;
  exchange(state, b, u, t, dmg, 0, 'looses arrows at');
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
  const loss = Math.round(t.troops * (0.1 + rand(state) * 0.1));
  t.morale = clamp(t.morale - 12, 0, 100);
  addLog(b, `Flames engulf ${officer(state, t).name}'s unit: ${loss} casualties.`);
  applyLoss(state, b, t, loss);
}

export function duelAcceptChance(state, challenger, target) {
  const a = state.officers[challenger.officer];
  const d = state.officers[target.officer];
  return d.war >= a.war - 8 ? 0.85 : d.war >= a.war - 20 ? 0.35 : 0.12;
}

// Returns true if the duel happened.
export function doDuel(state, b, u, t, forceAccept = null) {
  if (!meleeTargets(b, u).includes(t)) return false;
  u.done = true;
  const a = officer(state, u);
  const d = officer(state, t);
  const accepted = forceAccept ?? chance(state, duelAcceptChance(state, u, t));
  if (!accepted) {
    addLog(b, `${a.name} challenges ${d.name} to single combat — ${d.name} refuses! Their troops waver.`);
    t.morale = clamp(t.morale - 12, 0, 100);
    u.morale = clamp(u.morale + 5, 0, 100);
    return false;
  }
  addLog(b, `${a.name} and ${d.name} ride out to duel!`);
  let hpA = 100;
  let hpD = 100;
  for (let round = 1; round <= 30 && hpA > 0 && hpD > 0; round++) {
    const pA = Math.pow(a.war, 3) / (Math.pow(a.war, 3) + Math.pow(d.war, 3));
    const blow = randInt(state, 8, 22);
    if (rand(state) < pA) hpD -= blow;
    else hpA -= blow;
  }
  if (hpA > 0 && hpD > 0) {
    addLog(b, 'After many bouts neither can best the other. They withdraw.');
    return true;
  }
  const [winner, loser, wu, lu] = hpA > 0 ? [a, d, u, t] : [d, a, t, u];
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
  return true;
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

export function phaseDone(b) {
  return activeUnits(b, b.side).every((u) => u.done);
}

export function endPhase(state, b) {
  if (b.result) return;
  if (b.side === 'att') {
    startPhase(b, 'def');
    return;
  }
  endDay(state, b);
  if (!b.result) startPhase(b, 'att');
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
    else if (u.side === 'def' && terrainAt(b, u.c, u.r) === 'castle') u.morale = clamp(u.morale + 3, 0, 100);
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
  for (const t of shootTargets(b, u)) {
    const { dmg } = previewShoot(state, b, u, t);
    const s = scoreTarget(state, b, u, t, dmg) * 1.2;
    if (!best || s > best.s) best = { kind: 'shoot', t, s };
  }
  for (const t of meleeTargets(b, u)) {
    const { dmg, counter } = previewMelee(state, b, u, t);
    const s = scoreTarget(state, b, u, t, dmg) - counter * 0.8;
    if (!best || s > best.s) best = { kind: 'melee', t, s };
  }
  return best;
}

function tryDuel(state, b, u) {
  const me = officer(state, u);
  for (const t of meleeTargets(b, u)) {
    const them = officer(state, t);
    if (me.war - them.war >= 12 && chance(state, t.commander ? 0.5 : 0.3)) {
      const forced = b.humanSides[t.side] ? me.war - them.war <= 8 || chance(state, 0.2) : null;
      doDuel(state, b, u, t, forced);
      return true;
    }
  }
  return false;
}

function goalFor(state, b, u) {
  const enemies = activeUnits(b, enemyOf(u.side));
  if (u.side === 'att') {
    if (!unitAt(b, b.castle.c, b.castle.r)) return b.castle;
    // Go for the defending commander, otherwise the nearest foe.
    const cmd = enemies.find((e) => e.commander);
    if (cmd && hexDist(u, cmd) <= 6) return cmd;
    return enemies.reduce((a, e) => (!a || hexDist(u, e) < hexDist(u, a) ? e : a), null) || b.castle;
  }
  if (u.commander) return b.castle;
  const threats = enemies.filter((e) => hexDist(e, b.castle) <= 6);
  const pool = threats.length ? threats : enemies;
  return pool.reduce((a, e) => (!a || hexDist(u, e) < hexDist(u, a) ? e : a), null) || b.castle;
}

// One AI unit acts. Returns false if no unit was left to act.
export function aiStep(state, b) {
  if (b.result) return false;
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
  let atk = bestAttack(state, b, u);
  if (atk && (atk.kind === 'shoot' || atk.s > 0 || u.commander)) {
    if (atk.kind === 'shoot') doShoot(state, b, u, atk.t);
    else doAttack(state, b, u, atk.t);
    return true;
  }

  // Move: toward the goal, preferring hexes from which we can strike.
  const goal = goalFor(state, b, u);
  const holdCastle = u.side === 'def' && u.commander;
  if (!holdCastle && !u.moved) {
    const reach = reachable(b, u);
    let best = null;
    for (const node of reach.values()) {
      if (node.c === b.castle.c && node.r === b.castle.r && u.side === 'att') {
        best = { node, s: -1e9 };
        break;
      }
      let s = hexDist(node, goal) * 10 + node.cost;
      if (u.type === 'arc') {
        const d = activeUnits(b, enemyOf(u.side)).reduce((m, e) => Math.min(m, hexDist(node, e)), 99);
        if (d === 1) s += 12;
        else if (d <= 2) s -= 15;
      }
      s -= (TERRAIN[terrainAt(b, node.c, node.r)].def - 1) * 20;
      if (u.side === 'def' && hexDist(node, b.castle) > 5) s += 30;
      if (!best || s < best.s) best = { node, s };
    }
    if (best && (best.node.c !== u.c || best.node.r !== u.r)) {
      doMove(state, b, u, best.node.c, best.node.r);
      if (b.result) return true;
      atk = bestAttack(state, b, u);
      if (atk && (atk.kind === 'shoot' || atk.s > 0)) {
        if (atk.kind === 'shoot') doShoot(state, b, u, atk.t);
        else doAttack(state, b, u, atk.t);
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
    endPhase(state, b);
  }
  if (!b.result) endBattle(b, 'def', 'The attackers withdraw.');
  return b.result;
}
