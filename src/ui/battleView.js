// Tactical battle screen.

import { h, s, fmt } from './dom.js';
import { openModal } from './modal.js';
import {
  BATTLE_W, BATTLE_H, TERRAIN, UNIT_TYPES, WIND_NAMES, idx, reachable, meleeTargets, shootTargets,
  fireTargets, activeUnits, unitAt, doMove, doAttack, doShoot, doFire, doDuel, doWait, doRetreat,
  aiStep, endPhase, phaseDone, previewMelee, previewShoot, fireChance, duelAcceptChance, canRetreat,
  terrainAt, chargeTargets, chargeLanding, previewCharge, doCharge, canAssault, doAssault, previewAssault,
  isBreached, breachLevel, isCastle, castleOccupant, duelTargets, duelWinChance, answerPendingDuel,
  unitHasOptions, garrisonVolley, GARRISON_RANGE, hexDist, siteAt, canRaze, doRaze, RAZE_YIELD,
  canDeployAt, deployUnit, finishDeployment, autoDeploy,
} from '../engine/battle.js';
import { forceName } from '../engine/state.js';

const R = 30;
const SQ3 = Math.sqrt(3);
const PAD = 6;
const TERRAIN_COLOR = {
  plains: '#b9c77e', forest: '#5f8a45', hills: '#b3a066', mountain: '#877764', marsh: '#7c9f94',
  river: '#4a7fc0', ford: '#86b3dd', castle: '#a39079',
};
const TERRAIN_GLYPH = { forest: '♣', hills: '⌒', mountain: '▲', marsh: '≈', castle: '♜', ford: '≈' };
const UNIT_GLYPH = { inf: '⚔', cav: '♞', arc: '➶' };
const SITE_STYLE = {
  farm: { fill: '#d6c35a', glyph: '⁂', label: 'Farmland' },
  market: { fill: '#c9a27a', glyph: '⌂', label: 'Market' },
  razed: { fill: '#6e5a3e', glyph: '✕', label: 'Razed' },
};
const AI_DELAY = 220;

const center = (c, r) => [R * SQ3 * (c + 0.5 * (r & 1)) + (R * SQ3) / 2 + PAD, R * 1.5 * r + R + PAD];
const pct = (p) => `${Math.round(p * 100)}%`;
const mult = (m) => `×${m.toFixed(2).replace(/0$/, '')}`;

function hexPoints(c, r, scale = 1) {
  const [x, y] = center(c, r);
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(x + R * scale * Math.cos(a)).toFixed(1)},${(y + R * scale * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function openBattleView(state, { onFinish }) {
  const b = state.battle;
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const root = document.getElementById('battle-root');
  root.hidden = false;
  const W = R * SQ3 * (BATTLE_W + 0.5) + PAD * 2;
  const H = R * 1.5 * (BATTLE_H - 1) + R * 2 + PAD * 2;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  const mapBox = h('div', { class: 'battle-map' }, svg);
  const top = h('div', { class: 'top' });
  const mid = h('div', { class: 'mid' });
  const logBox = h('div', { class: 'blog' });
  // Unit and terrain details live in their own frame so nothing covers the board.
  const info = h('div', { class: 'battle-info' });
  const side = h('div', { class: 'battle-side' }, top, info, mid, logBox);
  const resultBox = h('div');
  root.replaceChildren(mapBox, side, resultBox);
  mapBox.style.position = 'relative';

  const ui = { sel: null, mode: null, busy: false, closed: false, focus: null, armed: null, prompting: false };
  // Without hover, a first tap on an enemy previews the attack and a second confirms it.
  const TOUCH = window.matchMedia('(hover: none)').matches;
  const color = (u) => state.forces[b.forces[u.side]]?.color || '#999';
  const oName = (u) => state.officers[u.officer].name;
  const isHumanTurn = () => !b.result && !b.pendingDuel && !b.deploying && b.humanSides[b.side];

  function razedText() {
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    return [b.razed.farm ? n(b.razed.farm, 'field', 'fields') : null, b.razed.market ? n(b.razed.market, 'market', 'markets') : null].filter(Boolean).join(', ');
  }

  function select(u) {
    ui.sel = u && u.side === b.side && isHumanTurn() && !u.done ? u.id : null;
    ui.mode = null;
    ui.armed = null;
    ui.focus = u ? { unit: u.id } : null;
    render();
  }

  // On touch screens, returns true if this tap only armed the target.
  function needsConfirm(key) {
    if (!TOUCH || ui.armed === key) return false;
    ui.armed = key;
    render();
    return true;
  }

  function selected() {
    const u = b.units.find((x) => x.id === ui.sel);
    return u && u.status === 'active' && !u.done ? u : null;
  }

  function afterAction() {
    ui.armed = null;
    const u = selected();
    if (u && !unitHasOptions(b, u)) ui.sel = null;
    ui.mode = null;
    if (b.result) return render();
    if (b.pendingDuel) return promptDuel();
    if (phaseDone(b)) {
      endPhase(state, b);
      ui.sel = null;
    }
    render();
    scheduleAI();
  }

  // Before day 1 a defending player places their units.
  function onDeployClick(c, r) {
    const target = unitAt(b, c, r);
    const u = b.units.find((x) => x.id === ui.sel);
    if (target && target.side === 'def') {
      ui.sel = target.commander ? null : target.id;
      ui.focus = { unit: target.id };
      render();
      return;
    }
    if (u && deployUnit(b, u, c, r)) render();
  }

  function onHexClick(c, r) {
    if (b.deploying && b.humanSides.def) return onDeployClick(c, r);
    if (!isHumanTurn() || ui.busy) return;
    const u = selected();
    const target = unitAt(b, c, r);
    if (!u) {
      if (target) select(target);
      else {
        ui.focus = { c, r };
        renderInfo();
      }
      return;
    }
    if (ui.mode === 'fire') {
      if (fireTargets(b, u).some((n) => n.c === c && n.r === r)) {
        if (needsConfirm(`fire:${c},${r}`)) return;
        doFire(state, b, u, c, r);
        afterAction();
      }
      return;
    }
    if (ui.mode === 'duel') {
      if (target && duelTargets(b, u).includes(target)) {
        ui.focus = { unit: target.id };
        if (needsConfirm(target.id)) return;
        doDuel(state, b, u, target);
        afterAction();
      }
      return;
    }
    if (ui.mode === 'charge') {
      if (target && chargeTargets(b, u).includes(target)) {
        ui.focus = { unit: target.id };
        if (needsConfirm(target.id)) return;
        doCharge(state, b, u, target);
        afterAction();
      }
      return;
    }
    if (ui.mode === 'assault') {
      if (isCastle(b, c, r) && canAssault(b, u)) {
        if (needsConfirm('assault')) return;
        doAssault(state, b, u);
        afterAction();
      }
      return;
    }
    if (target && target.side !== u.side) {
      const inReach = (u.type === 'arc' && shootTargets(b, u).includes(target)) || meleeTargets(b, u).includes(target);
      ui.focus = { unit: target.id };
      if (!inReach) {
        renderInfo();
        return;
      }
      if (needsConfirm(target.id)) return;
      if (u.type === 'arc' && shootTargets(b, u).includes(target)) doShoot(state, b, u, target);
      else doAttack(state, b, u, target);
      afterAction();
      return;
    }
    if (target && target.side === u.side) {
      select(target);
      return;
    }
    if (reachable(b, u).has(idx(c, r)) && (c !== u.c || r !== u.r)) {
      doMove(state, b, u, c, r);
      afterAction();
    }
  }

  // The computer has challenged one of your officers: accept or refuse.
  function promptDuel() {
    if (ui.prompting || !b.pendingDuel) return;
    ui.prompting = true;
    const challenger = b.units.find((x) => x.id === b.pendingDuel.challenger);
    const target = b.units.find((x) => x.id === b.pendingDuel.target);
    const a = state.officers[challenger.officer];
    const d = state.officers[target.officer];
    const win = 1 - duelWinChance(state, challenger, target);
    render();
    const answer = (accept) => {
      ui.prompting = false;
      answerPendingDuel(state, b, accept);
      afterAction();
    };
    openModal({
      title: 'A challenge!',
      dismissable: false,
      body: h('div', {},
        h('p', {}, `${a.name} (WAR ${a.war}) rides forward and challenges ${d.name} (WAR ${d.war}) to single combat.`),
        h('div', { class: 'preview' }, `${d.name} wins about ${pct(win)} of such duels. The loser's unit is broken, and they may be captured or slain.`),
        h('p', { class: 'hint' }, isCastle(b, target.c, target.r)
          ? `${d.name} holds the castle and may ignore the challenge without shame.`
          : `Refusing costs ${d.name}'s unit 15 morale and every other unit 5 (never below 20), and heartens the challenger. Refuse twice and the unit loses heart for a day.`)),
      actions: [
        { label: 'Refuse', onClick: () => answer(false) },
        { label: `Accept (${pct(win)})`, primary: true, onClick: () => answer(true) },
      ],
    });
  }

  function scheduleAI() {
    if (ui.closed || b.result || isHumanTurn() || ui.busy || b.pendingDuel) return;
    ui.busy = true;
    const tick = () => {
      if (ui.closed) return;
      if (b.result || isHumanTurn()) {
        ui.busy = false;
        return render();
      }
      if (b.pendingDuel) {
        ui.busy = false;
        return promptDuel();
      }
      const acted = aiStep(state, b);
      if (b.pendingDuel) {
        ui.busy = false;
        render();
        return promptDuel();
      }
      if (!acted || phaseDone(b)) endPhase(state, b);
      render();
      setTimeout(tick, acted ? AI_DELAY : AI_DELAY / 2);
    };
    setTimeout(tick, AI_DELAY);
  }

  function endTurn() {
    for (const u of activeUnits(b, b.side)) if (!u.done) doWait(b, u);
    ui.sel = null;
    afterAction();
  }

  function autoBattle() {
    b.humanSides = { att: false, def: false };
    ui.sel = null;
    render();
    scheduleAI();
  }

  function setMode(mode) {
    ui.mode = ui.mode === mode ? null : mode;
    ui.armed = null;
    render();
  }

  // ---- Rendering ----------------------------------------------------------

  function render() {
    const deploySel = b.deploying ? b.units.find((x) => x.id === ui.sel) : null;
    const u = b.deploying ? null : selected();
    const reach = u && !ui.mode ? reachable(b, u) : new Map();
    if (deploySel) {
      for (let r = 0; r < BATTLE_H; r++) for (let c = 0; c < BATTLE_W; c++) if (canDeployAt(b, deploySel, c, r) && !unitAt(b, c, r)) reach.set(idx(c, r), { c, r });
    }
    const targets = new Set(u && !ui.mode ? [...meleeTargets(b, u), ...shootTargets(b, u)].map((t) => t.id) : []);
    const modeT = new Set(u && ui.mode === 'duel' ? duelTargets(b, u).map((t) => t.id)
      : u && ui.mode === 'charge' ? chargeTargets(b, u).map((t) => t.id) : []);
    const fireT = new Set(u && ui.mode === 'fire' ? fireTargets(b, u).map((n) => idx(n.c, n.r)) : []);
    const armedUnit = typeof ui.armed === 'number' ? b.units.find((x) => x.id === ui.armed) : null;
    const landing = u && ui.mode === 'charge' && armedUnit ? chargeLanding(b, u, armedUnit) : null;

    svg.replaceChildren();
    for (let r = 0; r < BATTLE_H; r++) {
      for (let c = 0; c < BATTLE_W; c++) {
        const ter = terrainAt(b, c, r);
        const k = idx(c, r);
        const site = siteAt(b, c, r);
        const siteStyle = site ? SITE_STYLE[site.razed ? 'razed' : site.kind] : null;
        const poly = s('polygon', {
          class: 'hex' + (reach.has(k) && !(c === u?.c && r === u?.r) ? ' reach' : '') + (fireT.has(k) ? ' firetarget' : ''),
          points: hexPoints(c, r), fill: siteStyle && ter !== 'castle' ? siteStyle.fill : TERRAIN_COLOR[ter],
        });
        if (ter === 'castle') {
          poly.setAttribute('stroke', isBreached(b) ? '#8a2a1a' : '#3b2f22');
          poly.setAttribute('stroke-width', '5');
          if (ui.mode === 'assault') poly.setAttribute('stroke', '#ff5a4a');
        }
        poly.addEventListener('click', () => onHexClick(c, r));
        if (!TOUCH) poly.addEventListener('mouseenter', () => { ui.focus = { c, r }; renderInfo(); });
        svg.append(poly);
        if (reach.has(k) && !(c === u?.c && r === u?.r)) svg.append(s('polygon', { class: 'hex reach-fill', points: hexPoints(c, r, 0.9) }));
        if (siteStyle) {
          const [x, y] = center(c, r);
          svg.append(s('text', { x, y: y + 6, 'text-anchor': 'middle', 'font-size': 16, fill: '#0006', 'pointer-events': 'none' }, siteStyle.glyph));
        } else if (TERRAIN_GLYPH[ter]) {
          const [x, y] = center(c, r);
          svg.append(s('text', { x, y: y + 6, 'text-anchor': 'middle', 'font-size': ter === 'castle' ? 22 : 14, fill: '#0005', 'pointer-events': 'none' }, TERRAIN_GLYPH[ter]));
        }
        if (b.fire[k] > 0) svg.append(s('polygon', { class: 'fire', points: hexPoints(c, r, 0.85) }));
        if (landing && landing.c === c && landing.r === r) svg.append(s('polygon', { class: 'hex target', fill: 'none', points: hexPoints(c, r, 0.8) }));
      }
    }
    // The attackers' arrival edge, where they can withdraw in good order.
    {
      const x0 = b.edge === 'west' ? 0 : W - 6;
      svg.append(s('rect', { x: x0, y: 0, width: 6, height: H, fill: state.forces[b.forces.att]?.color || '#999', opacity: 0.5, 'pointer-events': 'none' }));
    }
    // The castle's walls, drawn as a bar under the castle hex.
    {
      const [x, y] = center(b.castle.c, b.castle.r);
      const frac = b.wallsMax ? b.walls / b.wallsMax : 0;
      svg.append(s('rect', { x: x - 20, y: y + R * 0.72, width: 40, height: 5, fill: '#000b', 'pointer-events': 'none' }));
      svg.append(s('rect', { x: x - 20, y: y + R * 0.72, width: 40 * frac, height: 5, fill: isBreached(b) ? '#e0705f' : '#d9d0bc', 'pointer-events': 'none' }));
    }
    for (const unit of b.units.filter((x) => x.status === 'active')) {
      const [x, y] = center(unit.c, unit.r);
      const finished = unit.side === b.side && !unitHasOptions(b, unit);
      const g = s('g', { class: 'unit' + (unit.id === ui.sel || unit.id === deploySel?.id ? ' sel' : '') + (finished ? ' done' : ''), transform: `translate(${x},${y})`, style: 'cursor:pointer' });
      g.append(s('circle', { class: 'body', r: R * 0.62, fill: color(unit) }));
      if (targets.has(unit.id)) g.append(s('circle', { r: R * 0.8, fill: 'none', stroke: '#ff5a4a', 'stroke-width': 3 }));
      if (modeT.has(unit.id)) g.append(s('circle', { r: R * 0.8, fill: 'none', stroke: ui.mode === 'charge' ? '#ffa030' : '#ffd24a', 'stroke-width': 3, 'stroke-dasharray': '4 3' }));
      g.append(s('text', { class: 'glyph', y: 4 }, UNIT_GLYPH[unit.type]));
      g.append(s('text', { class: 'uname', y: R * 0.62 + 9 }, oName(unit)));
      const frac = Math.min(1, unit.troops / Math.max(unit.startTroops, 1));
      g.append(s('rect', { x: -16, y: -R * 0.62 - 7, width: 32, height: 4, fill: '#000a' }));
      g.append(s('rect', { x: -16, y: -R * 0.62 - 7, width: 32 * frac, height: 4, fill: frac > 0.5 ? '#7cc47a' : frac > 0.25 ? '#e0c05f' : '#e0705f' }));
      if (unit.commander) g.append(s('text', { x: 15, y: -8, 'font-size': 12, fill: '#ffe08a', stroke: '#000', 'stroke-width': 0.8 }, '★'));
      g.addEventListener('click', () => onHexClick(unit.c, unit.r));
      if (!TOUCH) g.addEventListener('mouseenter', () => { ui.focus = { unit: unit.id }; renderInfo(); });
      if (unit.id === ui.armed) g.append(s('circle', { r: R * 0.95, fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-dasharray': '3 3' }));
      svg.append(g);
    }
    renderSide(u);
    renderInfo();
    if (b.result) renderResult();
  }

  function castleLine() {
    const occ = castleOccupant(b);
    return `Castle · walls ${Math.round(b.walls)}/${b.wallsMax}`
      + (isBreached(b) ? ' · BREACHED' : ` · breached at ${breachLevel(b)}`)
      + (occ ? ` · held by ${oName(occ)}` : ' · empty');
  }

  function terrainLine(c, r) {
    const ter = terrainAt(b, c, r);
    if (ter === 'castle') return castleLine();
    const site = siteAt(b, c, r);
    if (site) {
      const what = site.razed ? `Razed ${site.kind === 'farm' ? 'fields' : 'market'}`
        : site.kind === 'farm' ? `Farmland (razing yields ${RAZE_YIELD.farm.food} grain)` : `Market (razing yields ${RAZE_YIELD.market.gold} gold)`;
      return `${what} on ${TERRAIN[ter].label.toLowerCase()} · melee defence ×${TERRAIN[ter].def} · arrows land ×${TERRAIN[ter].cover}`;
    }
    const burning = b.fire[idx(c, r)] > 0 ? ' · on fire!' : '';
    const t = TERRAIN[ter];
    return `${t.label} · melee defence ×${t.def} · arrows land ×${t.cover}${burning}`;
  }

  const factorList = (factors) => (factors.length
    ? h('div', { class: 'factors' }, factors.map((f) => h('span', { class: f.mult >= 1 ? 'up' : 'down' }, `${f.why} ${mult(f.mult)}`)))
    : null);

  function renderInfo() {
    const sel = selected();
    const focusUnit = ui.focus?.unit !== undefined ? b.units.find((x) => x.id === ui.focus.unit && x.status === 'active') : null;
    const u = focusUnit || sel;
    const rows = [];
    if (ui.mode === 'assault' && sel) {
      const p = previewAssault(state, b, sel);
      rows.push(h('div', {}, castleLine()));
      rows.push(h('div', { class: 'preview-line' }, `Assault: walls −${p.walls}, about ${fmt(p.loss)} of ${oName(sel)}'s men lost on the ladders.`));
      if (ui.armed === 'assault') rows.push(h('div', { class: 'warn' }, 'Tap the castle again to confirm.'));
    } else if (u) {
      const o = state.officers[u.officer];
      rows.push(h('div', { class: 'row' },
        h('span', { class: 'swatch', style: { background: color(u) } }),
        h('b', {}, o.name), u.commander ? ' ★' : '', h('span', { class: 'muted' }, u.side === b.side && !unitHasOptions(b, u) ? '(done)' : '')));
      rows.push(h('div', {}, `${UNIT_TYPES[u.type].label} · ${fmt(u.troops)} troops · morale ${u.morale} · training ${u.training}${u.loot ? ` · carrying ${u.loot} gold` : ''}`));
      rows.push(h('div', { class: 'muted' }, `INT ${o.int} · WAR ${o.war} · ${terrainLine(u.c, u.r)}`));
      if (u.side === 'att' && b.walls > 0 && hexDist(u, b.castle) <= GARRISON_RANGE) {
        rows.push(h('div', { class: 'warn' }, `Under the walls: the garrison will loose ~${fmt(garrisonVolley(b, u))} arrows' worth of casualties at it each defender turn.`));
      }
      if (sel && u.side !== sel.side) {
        if (ui.mode === 'duel' && duelTargets(b, sel).includes(u)) {
          rows.push(h('div', { class: 'preview-line' }, `Duel: ${oName(sel)} wins ~${pct(duelWinChance(state, sel, u))}; ${o.name} accepts ~${pct(duelAcceptChance(state, b, sel, u))} of the time.`));
        } else if (ui.mode === 'charge' && chargeTargets(b, sel).includes(u)) {
          const p = previewCharge(state, b, sel, u);
          rows.push(h('div', { class: 'preview-line' }, `Charge: ~${fmt(p.dmg)} dealt, ~${fmt(p.counter)} taken; rides through to the far side.`));
          rows.push(factorList(p.factors));
        } else if (sel.type === 'arc' && shootTargets(b, sel).includes(u)) {
          const p = previewShoot(state, b, sel, u);
          rows.push(h('div', { class: 'preview-line' }, `Volley: ~${fmt(p.dmg)} casualties${p.counter ? `, ~${fmt(p.counter)} lost to return fire` : ''}`));
          rows.push(factorList(p.factors));
        } else if (meleeTargets(b, sel).includes(u)) {
          const p = previewMelee(state, b, sel, u);
          rows.push(h('div', { class: 'preview-line' }, `Attack: ~${fmt(p.dmg)} dealt, ~${fmt(p.counter)} taken`));
          rows.push(factorList(p.factors));
        } else {
          rows.push(h('div', { class: 'muted' }, 'Out of reach.'));
        }
        if (ui.armed === u.id) rows.push(h('div', { class: 'warn' }, 'Tap again to confirm.'));
      }
    } else if (ui.focus && ui.focus.c !== undefined) {
      rows.push(h('div', {}, terrainLine(ui.focus.c, ui.focus.r)));
      if (typeof ui.armed === 'string' && ui.armed.startsWith('fire:')) rows.push(h('div', { class: 'warn' }, 'Tap again to set the fire.'));
    } else {
      rows.push(h('div', { class: 'muted' }, TOUCH ? 'Tap a unit or hex for details.' : 'Point at a unit or hex for details.'));
    }
    info.replaceChildren(...rows.filter(Boolean));
  }

  function renderDeploy() {
    const defName = forceName(state, b.forces.def);
    top.replaceChildren(
      h('h2', { style: { fontSize: '19px' } }, `Battle of ${state.provinces[b.pid].name}`),
      h('div', {}, `${forceName(state, b.forces.att)} approaches from the ${b.edge}.`),
      h('div', { class: 'hint' }, castleLine()));
    mid.replaceChildren(
      h('p', {}, h('b', {}, `Deploy the army of ${defName}.`)),
      h('p', { class: 'hint' }, 'Select a unit, then a highlighted hex. Units can start anywhere except next to the enemy\u2019s arrival edge; the commander holds the castle. Standing on your fields and markets protects them from being razed; spreading out covers more land but risks being beaten piecemeal.'),
      h('div', { class: 'row' },
        h('button', { onclick: () => { autoDeploy(state, b); ui.sel = null; render(); } }, 'Auto-deploy'),
        h('button', { class: 'primary', onclick: () => { finishDeployment(b); ui.sel = null; render(); scheduleAI(); } }, 'Begin battle')),
      ...['att', 'def'].map((sd) => h('div', { class: 'ulist', style: { marginTop: '8px' } },
        h('div', { class: 'muted' }, sd === 'att' ? 'Attackers' : 'Defenders'),
        b.units.filter((x) => x.side === sd).map((x) => h('div', { class: 'u', onclick: () => sd === 'def' && !x.commander && ((ui.sel = x.id), render()) },
          h('span', { class: 'swatch', style: { background: color(x) } }), `${oName(x)}${x.commander ? ' ★' : ''}`, h('span', { class: 'spacer' }),
          h('span', { class: 'muted' }, `${UNIT_TYPES[x.type].short} · ${fmt(x.troops)}`))))));
    logBox.replaceChildren();
  }

  function renderSide(u) {
    if (b.deploying && b.humanSides.def) return renderDeploy();
    const attName = forceName(state, b.forces.att);
    const defName = forceName(state, b.forces.def);
    const turnName = b.side === 'att' ? attName : defName;
    const pending = activeUnits(b, b.side).filter((x) => unitHasOptions(b, x)).length;
    top.replaceChildren(
      h('h2', { style: { fontSize: '19px' } }, `Battle of ${state.provinces[b.pid].name}`),
      h('div', {}, `Day ${Math.min(b.day, b.maxDays)} / ${b.maxDays} · ${b.weather[0].toUpperCase() + b.weather.slice(1)} · wind from the ${WIND_NAMES[b.wind]}`),
      h('div', { class: 'hint' }, `Attacker ${attName}: food ${fmt(b.attFood)} · Defender ${defName}: food ${fmt(b.defFood)}`),
      h('div', { class: 'hint' }, castleLine(), b.razed.farm + b.razed.market ? ` · razed: ${razedText()}` : ''),
      h('div', { style: { marginTop: '4px' } }, h('span', { class: 'swatch', style: { background: state.forces[b.forces[b.side]].color } }), ` ${turnName}'s turn`,
        isHumanTurn() ? h('span', { class: 'muted' }, ` · ${pending} unit${pending === 1 ? '' : 's'} can still act`) : h('span', { class: 'muted' }, ' (thinking…)')),
    );
    const content = [];
    if (u) {
      const canFire = fireTargets(b, u).length > 0;
      const canDuel = duelTargets(b, u).length > 0;
      const canCharge = chargeTargets(b, u).length > 0;
      const assault = canAssault(b, u);
      const retreatOk = canRetreat(b, u, state, b.retreatOptions);
      const btn = (label, mode, enabled, title) => h('button', {
        class: 'small' + (ui.mode === mode ? ' primary' : ''), disabled: !enabled, title, onclick: () => setMode(mode),
      }, label);
      const razeOk = canRaze(b, u);
      content.push(h('div', { class: 'row', style: { marginTop: '6px' } },
        u.side === 'att' ? h('button', {
          class: 'small', disabled: !razeOk,
          title: 'Destroy the field or market this unit started its turn on, and seize its yield',
          onclick: () => { doRaze(state, b, u); afterAction(); },
        }, 'Raze') : null,
        u.type === 'cav' ? btn('Charge', 'charge', canCharge, 'Only a fresh unit can charge, and it must have clear ground on the far side of the target') : null,
        u.side === 'att' && u.type !== 'cav' ? btn('Assault walls', 'assault', assault, 'Batter the castle walls from an adjacent hex') : null,
        btn(`Fire (${pct(fireChance(state, b, u))})`, 'fire', canFire, 'Set an adjacent hex ablaze'),
        btn('Duel', 'duel', canDuel, 'Challenge an adjacent officer to single combat'),
        h('button', { class: 'small', onclick: () => { doWait(b, u); afterAction(); } }, 'Wait'),
        h('button', {
          class: 'small danger', disabled: !retreatOk,
          title: u.side === 'att' ? 'Leave the field in good order from your own edge, keeping troops and plunder' : 'Leave by a map edge toward a friendly province',
          onclick: () => { doRetreat(state, b, u); afterAction(); },
        }, 'Withdraw')));
      const tap = TOUCH ? 'tap' : 'click';
      content.push(h('p', { class: 'hint' }, {
        fire: `${tap[0].toUpperCase() + tap.slice(1)} a highlighted hex to set it ablaze. Fire spreads with the wind and burns hardest in forest.`,
        duel: `${tap[0].toUpperCase() + tap.slice(1)} an adjacent enemy officer to challenge them.`,
        charge: `${tap[0].toUpperCase() + tap.slice(1)} an enemy to charge through it. The charge is only as good as the worst ground it crosses.`,
        assault: `${tap[0].toUpperCase() + tap.slice(1)} the castle to assault its walls. They are breached at half strength; only then can an empty castle be entered.`,
      }[ui.mode] || (razeOk
        ? `Standing on developed land: Raze it to seize its yield, or move on.${u.loot ? ` Carrying ${u.loot} gold.` : ''}`
        : u.moved
        ? 'This unit has moved; it can still attack, shoot, set a fire or assault the walls, or Wait.'
        : u.type === 'arc' ? `Move (blue hexes), then ${tap} an enemy in range to loose arrows.`
          : u.type === 'cav' ? `Charge from where you stand, or move and make an ordinary attack.${TOUCH ? ' Tap once to preview, again to strike.' : ''}`
            : `Move (blue hexes), then ${tap} an adjacent enemy to attack.${TOUCH ? ' Tap once to preview, again to strike.' : ''}`)));
    } else if (isHumanTurn()) {
      content.push(h('p', { class: 'hint' }, 'Select one of your units. Each unit may move and then act once per day. Your turn ends by itself when no unit has anything left to do.'));
    }
    const controls = h('div', { class: 'row', style: { marginTop: '6px' } },
      h('button', { class: 'primary', disabled: !isHumanTurn(), onclick: endTurn }, 'End turn'),
      h('button', { disabled: b.result || (!b.humanSides.att && !b.humanSides.def), onclick: autoBattle, title: 'Let your officers fight the rest of the battle' }, 'Auto-battle'));
    const lists = ['att', 'def'].map((sd) => h('div', { class: 'ulist', style: { marginTop: '8px' } },
      h('div', { class: 'muted' }, sd === 'att' ? `Attackers — ${attName}` : `Defenders — ${defName}`),
      b.units.filter((x) => x.side === sd).map((x) => h('div', {
        class: 'u' + (x.status !== 'active' ? ' gone' : ''),
        onclick: () => x.status === 'active' && select(x),
      }, h('span', { class: 'swatch', style: { background: color(x) } }), `${oName(x)}${x.commander ? ' ★' : ''}`, h('span', { class: 'spacer' }),
      h('span', { class: 'muted' }, x.status === 'active' ? `${fmt(x.troops)} · m${x.morale}${x.side === b.side && !unitHasOptions(b, x) ? ' ✓' : ''}` : x.status)))));
    mid.replaceChildren(...content.filter(Boolean), controls, ...lists);
    logBox.replaceChildren(...b.log.slice(-60).reverse().map((l) => h('div', {}, l)));
  }

  function renderResult() {
    const humanWon = state.forces[b.forces[b.result.winner]]?.human;
    resultBox.replaceChildren(h('div', { class: 'battle-result' },
      h('h2', {}, humanWon ? 'Victory!' : state.forces[b.forces[b.result.winner === 'att' ? 'def' : 'att']]?.human ? 'Defeat' : 'Battle over'),
      h('p', {}, `${forceName(state, b.forces[b.result.winner])} wins. ${b.result.reason}`),
      h('p', { class: 'hint' }, `The walls of ${state.provinces[b.pid].name} stand at ${Math.round(b.walls)} of ${b.wallsMax}.`,
        b.razed.farm + b.razed.market ? ` Razed: ${razedText()}.` : ''),
      h('button', { class: 'primary', onclick: close }, 'Continue')));
  }

  function close() {
    ui.closed = true;
    root.hidden = true;
    root.replaceChildren();
    onFinish();
  }

  render();
  if (b.deploying && b.humanSides.def) return;
  if (b.deploying) finishDeployment(b);
  if (b.pendingDuel) promptDuel();
  else scheduleAI();
}
