// Tactical battle screen.

import { h, s, fmt } from './dom.js';
import {
  BATTLE_W, BATTLE_H, TERRAIN, UNIT_TYPES, WIND_NAMES, idx, reachable, meleeTargets, shootTargets,
  fireTargets, activeUnits, unitAt, doMove, doAttack, doShoot, doFire, doDuel, doWait, doRetreat,
  aiStep, endPhase, phaseDone, previewMelee, previewShoot, fireChance, duelAcceptChance, canRetreat,
  terrainAt,
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
const AI_DELAY = 220;

const center = (c, r) => [R * SQ3 * (c + 0.5 * (r & 1)) + (R * SQ3) / 2 + PAD, R * 1.5 * r + R + PAD];

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
  const root = document.getElementById('battle-root');
  root.hidden = false;
  const W = R * SQ3 * (BATTLE_W + 0.5) + PAD * 2;
  const H = R * 1.5 * (BATTLE_H - 1) + R * 2 + PAD * 2;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  const mapBox = h('div', { class: 'battle-map' }, svg);
  const top = h('div', { class: 'top' });
  const mid = h('div', { class: 'mid' });
  const logBox = h('div', { class: 'blog' });
  const side = h('div', { class: 'battle-side' }, top, mid, logBox);
  const resultBox = h('div');
  root.replaceChildren(mapBox, side, resultBox);
  mapBox.style.position = 'relative';

  const ui = { sel: null, mode: null, busy: false, closed: false };
  const color = (u) => state.forces[b.forces[u.side]]?.color || '#999';
  const oName = (u) => state.officers[u.officer].name;
  const isHumanTurn = () => !b.result && b.humanSides[b.side];

  function select(u) {
    ui.sel = u && u.side === b.side && isHumanTurn() && !u.done ? u.id : null;
    ui.mode = null;
    render();
  }

  function selected() {
    const u = b.units.find((x) => x.id === ui.sel);
    return u && u.status === 'active' && !u.done ? u : null;
  }

  function afterAction() {
    const u = selected();
    if (u && u.done) ui.sel = null;
    ui.mode = null;
    if (b.result) return render();
    if (phaseDone(b)) {
      endPhase(state, b);
      ui.sel = null;
    }
    render();
    scheduleAI();
  }

  function onHexClick(c, r) {
    if (!isHumanTurn() || ui.busy) return;
    const u = selected();
    const target = unitAt(b, c, r);
    if (!u) {
      if (target) select(target);
      return;
    }
    if (ui.mode === 'fire') {
      if (doFire(state, b, u, c, r)) afterAction();
      return;
    }
    if (ui.mode === 'duel') {
      if (target && meleeTargets(b, u).includes(target)) {
        doDuel(state, b, u, target);
        afterAction();
      }
      return;
    }
    if (target && target.side !== u.side) {
      if (u.type === 'arc' && shootTargets(b, u).includes(target)) doShoot(state, b, u, target);
      else if (meleeTargets(b, u).includes(target)) doAttack(state, b, u, target);
      else return;
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

  function scheduleAI() {
    if (ui.closed || b.result || isHumanTurn() || ui.busy) return;
    ui.busy = true;
    const tick = () => {
      if (ui.closed) return;
      if (b.result) {
        ui.busy = false;
        return render();
      }
      if (isHumanTurn()) {
        ui.busy = false;
        return render();
      }
      const acted = aiStep(state, b);
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

  // ---- Rendering ----------------------------------------------------------

  function render() {
    const u = selected();
    const reach = u && !ui.mode ? reachable(b, u) : new Map();
    const targets = new Set(u && !ui.mode ? [...meleeTargets(b, u), ...shootTargets(b, u)].map((t) => t.id) : []);
    const duelT = new Set(u && ui.mode === 'duel' ? meleeTargets(b, u).map((t) => t.id) : []);
    const fireT = new Set(u && ui.mode === 'fire' ? fireTargets(b, u).map((n) => idx(n.c, n.r)) : []);

    svg.replaceChildren();
    for (let r = 0; r < BATTLE_H; r++) {
      for (let c = 0; c < BATTLE_W; c++) {
        const ter = terrainAt(b, c, r);
        const k = idx(c, r);
        const poly = s('polygon', {
          class: 'hex' + (reach.has(k) && !(c === u?.c && r === u?.r) ? ' reach' : '') + (fireT.has(k) ? ' firetarget' : ''),
          points: hexPoints(c, r), fill: TERRAIN_COLOR[ter],
        });
        if (ter === 'castle') {
          poly.setAttribute('stroke', '#3b2f22');
          poly.setAttribute('stroke-width', '5');
        }
        poly.addEventListener('click', () => onHexClick(c, r));
        poly.addEventListener('mousemove', (e) => tip(e, `${TERRAIN[ter].label}${ter === 'castle' ? ` (walls ${b.walls})` : ` · defence ×${TERRAIN[ter].def}`}`));
        poly.addEventListener('mouseleave', () => tip(null));
        svg.append(poly);
        if (reach.has(k) && !(c === u?.c && r === u?.r)) svg.append(s('polygon', { class: 'hex reach-fill', points: hexPoints(c, r, 0.9) }));
        if (TERRAIN_GLYPH[ter]) {
          const [x, y] = center(c, r);
          svg.append(s('text', { x, y: y + 6, 'text-anchor': 'middle', 'font-size': ter === 'castle' ? 22 : 14, fill: '#0005', 'pointer-events': 'none' }, TERRAIN_GLYPH[ter]));
        }
        if (b.fire[k] > 0) svg.append(s('polygon', { class: 'fire', points: hexPoints(c, r, 0.85) }));
      }
    }
    for (const unit of b.units.filter((x) => x.status === 'active')) {
      const [x, y] = center(unit.c, unit.r);
      const g = s('g', { class: 'unit' + (unit.id === ui.sel ? ' sel' : '') + (unit.done && unit.side === b.side ? ' done' : ''), transform: `translate(${x},${y})`, style: 'cursor:pointer' });
      g.append(s('circle', { class: 'body', r: R * 0.62, fill: color(unit) }));
      if (targets.has(unit.id)) g.append(s('circle', { r: R * 0.8, fill: 'none', stroke: '#ff5a4a', 'stroke-width': 3 }));
      if (duelT.has(unit.id)) g.append(s('circle', { r: R * 0.8, fill: 'none', stroke: '#ffd24a', 'stroke-width': 3, 'stroke-dasharray': '4 3' }));
      g.append(s('text', { class: 'glyph', y: 4 }, UNIT_GLYPH[unit.type]));
      g.append(s('text', { class: 'uname', y: R * 0.62 + 9 }, oName(unit)));
      const frac = Math.min(1, unit.troops / Math.max(unit.startTroops, 1));
      g.append(s('rect', { x: -16, y: -R * 0.62 - 7, width: 32, height: 4, fill: '#000a' }));
      g.append(s('rect', { x: -16, y: -R * 0.62 - 7, width: 32 * frac, height: 4, fill: frac > 0.5 ? '#7cc47a' : frac > 0.25 ? '#e0c05f' : '#e0705f' }));
      if (unit.commander) g.append(s('text', { x: 15, y: -8, 'font-size': 12, fill: '#ffe08a', stroke: '#000', 'stroke-width': 0.8 }, '★'));
      g.addEventListener('click', () => onHexClick(unit.c, unit.r));
      g.addEventListener('mousemove', (e) => tip(e, unitTip(unit)));
      g.addEventListener('mouseleave', () => tip(null));
      svg.append(g);
    }
    renderSide(u);
    if (b.result) renderResult();
  }

  function unitTip(u) {
    const o = state.officers[u.officer];
    const sel = selected();
    let extra = '';
    if (sel && sel.side !== u.side) {
      if (sel.type === 'arc' && shootTargets(b, sel).includes(u)) extra = `<br><span style="color:#ffb080">Volley: ~${fmt(previewShoot(state, b, sel, u).dmg)} casualties</span>`;
      else if (meleeTargets(b, sel).includes(u)) {
        const p = previewMelee(state, b, sel, u);
        extra = `<br><span style="color:#ffb080">Attack: ~${fmt(p.dmg)} dealt / ~${fmt(p.counter)} taken</span>`;
        if (ui.mode === 'duel') extra += `<br>Duel accepted: ~${Math.round(duelAcceptChance(state, sel, u) * 100)}%`;
      }
    }
    return `<b>${o.name}</b>${u.commander ? ' ★' : ''}<br>${UNIT_TYPES[u.type].label} · ${fmt(u.troops)} troops<br>INT ${o.int} WAR ${o.war} · Trn ${u.training} · Morale ${u.morale}${extra}`;
  }

  function renderSide(u) {
    const attName = forceName(state, b.forces.att);
    const defName = forceName(state, b.forces.def);
    const turnName = b.side === 'att' ? attName : defName;
    top.replaceChildren(
      h('h2', { style: { fontSize: '19px' } }, `Battle of ${state.provinces[b.pid].name}`),
      h('div', {}, `Day ${Math.min(b.day, b.maxDays)} / ${b.maxDays} · ${b.weather[0].toUpperCase() + b.weather.slice(1)} · wind from the ${WIND_NAMES[b.wind]}`),
      h('div', { class: 'hint' }, `Attacker ${attName}: food ${fmt(b.attFood)} · Defender ${defName}: food ${fmt(b.defFood)}`),
      h('div', { style: { marginTop: '4px' } }, h('span', { class: 'swatch', style: { background: state.forces[b.forces[b.side]].color } }), ` ${turnName}'s turn`,
        isHumanTurn() ? '' : h('span', { class: 'muted' }, ' (thinking…)')),
    );
    const content = [];
    if (u) {
      const o = state.officers[u.officer];
      content.push(h('div', {}, h('b', {}, o.name), u.commander ? ' ★ commander' : '', h('div', { class: 'muted' },
        `${UNIT_TYPES[u.type].label} · ${fmt(u.troops)} troops · morale ${u.morale} · training ${u.training}`)));
      const canFire = fireTargets(b, u).length > 0;
      const canDuel = meleeTargets(b, u).length > 0;
      const retreatOk = canRetreat(b, u, state, b.retreatOptions);
      content.push(h('div', { class: 'row', style: { marginTop: '6px' } },
        h('button', { class: 'small' + (ui.mode === 'fire' ? ' primary' : ''), disabled: !canFire, title: `Success ~${Math.round(fireChance(state, b, u) * 100)}%`, onclick: () => { ui.mode = ui.mode === 'fire' ? null : 'fire'; render(); } }, `Fire (${Math.round(fireChance(state, b, u) * 100)}%)`),
        h('button', { class: 'small' + (ui.mode === 'duel' ? ' primary' : ''), disabled: !canDuel, onclick: () => { ui.mode = ui.mode === 'duel' ? null : 'duel'; render(); } }, 'Duel'),
        h('button', { class: 'small', onclick: () => { doWait(b, u); afterAction(); } }, 'Wait'),
        h('button', { class: 'small danger', disabled: !retreatOk, onclick: () => { doRetreat(state, b, u); afterAction(); } }, 'Withdraw')));
      content.push(h('p', { class: 'hint' }, ui.mode === 'fire' ? 'Click a highlighted hex to set it ablaze. Fire spreads with the wind.'
        : ui.mode === 'duel' ? 'Click an adjacent enemy officer to challenge them.'
          : u.type === 'arc' ? 'Move (blue hexes), then click an enemy in range to loose arrows.' : 'Move (blue hexes), then click an adjacent enemy to attack.'));
    } else if (isHumanTurn()) {
      content.push(h('p', { class: 'hint' }, 'Select one of your units. Each unit may move and then act once per day.'));
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
      h('span', { class: 'muted' }, x.status === 'active' ? `${fmt(x.troops)} · m${x.morale}${x.done && x.side === b.side ? ' ✓' : ''}` : x.status)))));
    mid.replaceChildren(...content, controls, ...lists);
    logBox.replaceChildren(...b.log.slice(-60).reverse().map((l) => h('div', {}, l)));
  }

  function renderResult() {
    const humanWon = b.humanSides.att !== undefined && state.forces[b.forces[b.result.winner]]?.human;
    resultBox.replaceChildren(h('div', { class: 'battle-result' },
      h('h2', {}, humanWon ? 'Victory!' : state.forces[b.forces[b.result.winner === 'att' ? 'def' : 'att']]?.human ? 'Defeat' : 'Battle over'),
      h('p', {}, `${forceName(state, b.forces[b.result.winner])} wins. ${b.result.reason}`),
      h('button', { class: 'primary', onclick: close }, 'Continue')));
  }

  function close() {
    ui.closed = true;
    tip(null);
    root.hidden = true;
    root.replaceChildren();
    onFinish();
  }

  render();
  scheduleAI();
}

function tip(e, html) {
  const el = document.getElementById('tooltip');
  if (!e) {
    el.hidden = true;
    return;
  }
  el.innerHTML = html;
  el.hidden = false;
  el.style.left = `${Math.min(window.innerWidth - 270, e.clientX + 14)}px`;
  el.style.top = `${e.clientY + 14}px`;
}
