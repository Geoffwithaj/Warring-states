// Application shell: title screen, main game screen and turn flow.

import { h, fmt, clear } from './dom.js';
import { openModal, confirmModal } from './modal.js';
import { createMapView, provinceTooltip } from './mapView.js';
import { renderProvincePanel, officerDetail } from './provincePanel.js';
import { openCommandDialog } from './commandDialogs.js';
import { openBattleView } from './battleView.js';
import { SCENARIOS } from '../data/scenarios.js';
import { officerId } from '../data/officers.js';
import {
  createGame, dateLabel, SEASONS, forceName, provincesOf, officersOf, capitalOf, areAllied, monthIndex,
  officerList,
} from '../engine/state.js';
import { newGameStart, advance, playerCommand, governorTakesTurn, concludeBattle } from '../engine/turn.js';
import { recruitChance, recruitCaptive, releaseCaptive, executeCaptive } from '../engine/war.js';
import { TASKS } from '../engine/economy.js';
import { UNIT_TYPES } from '../engine/battle.js';

const SAVE_PREFIX = 'warring-states-save-';
const AUTOSAVE = `${SAVE_PREFIX}auto`;

let state = null;
let selected = null;
let viewer = null;
let highlight = null;
let map = null;
let els = {};
let lastViewer = null;

// ---- Persistence -----------------------------------------------------------

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function saveTo(key) {
  const st = storage();
  if (!st || !state || state.battle) return false;
  try {
    const meta = { date: dateLabel(state), lord: viewer ? forceName(state, viewer) : '', savedAt: new Date().toLocaleString() };
    st.setItem(key, JSON.stringify({ meta, state }));
    return true;
  } catch {
    return false;
  }
}

function loadFrom(key) {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---- Title screen ------------------------------------------------------------

export function showTitle() {
  state = null;
  const app = clear(document.getElementById('app'));
  const sc = SCENARIOS[0];
  const chosen = new Set();
  const grid = h('div', { class: 'ruler-grid' });
  const begin = h('button', { class: 'primary', disabled: true, onclick: () => startGame([...chosen]) }, 'Begin');
  const renderGrid = () => {
    grid.replaceChildren(...sc.forces.map((f) => {
      const id = officerId(f.ruler);
      const provs = Object.keys(f.provinces).length;
      const officers = Object.values(f.provinces).flat().length;
      return h('div', {
        class: 'ruler-card' + (chosen.has(id) ? ' on' : ''),
        onclick: () => { chosen.has(id) ? chosen.delete(id) : chosen.add(id); renderGrid(); },
      }, h('div', { class: 'nm' }, h('span', { class: 'swatch', style: { background: f.color } }), ' ', f.ruler),
      h('div', { class: 'sm' }, `${provs} province${provs > 1 ? 's' : ''} · ${officers} officers`));
    }));
    begin.disabled = !chosen.size;
    begin.textContent = chosen.size > 1 ? `Begin (${chosen.size} players, hot-seat)` : 'Begin';
  };
  renderGrid();
  const saves = ['auto', 1, 2, 3].map((k) => [k, loadFrom(`${SAVE_PREFIX}${k}`)]).filter(([, v]) => v);
  app.append(h('div', { class: 'title-screen' },
    h('h1', {}, 'WARRING STATES'),
    h('div', { class: 'sub' }, 'An homage to Romance of the Three Kingdoms II'),
    saves.length ? h('div', { class: 'title-card' }, h('h2', {}, 'Continue'),
      h('div', { class: 'row', style: { marginTop: '8px' } }, saves.map(([k, v]) =>
        h('button', { onclick: () => resume(v.state) }, `${k === 'auto' ? 'Autosave' : `Slot ${k}`}: ${v.meta.lord} — ${v.meta.date}`)))) : null,
    h('div', { class: 'title-card' },
      h('h2', {}, `${sc.year} AD — ${sc.name}`),
      h('p', { class: 'muted' }, sc.blurb),
      h('p', {}, 'Choose the lord you will serve as. Pick several for a hot-seat game.'),
      grid,
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('div', { class: 'spacer' }), h('button', { onclick: () => showHelp() }, 'How to play'), begin)),
  ));
}

function startGame(humanRulers) {
  state = createGame({ humanRulers });
  newGameStart(state);
  buildShell();
  proceed();
}

function resume(saved) {
  state = saved;
  buildShell();
  proceed();
}

// ---- Main screen --------------------------------------------------------------

function buildShell() {
  const app = clear(document.getElementById('app'));
  els = {
    topbar: h('div', { id: 'topbar' }),
    mapWrap: h('div', { id: 'map-wrap' }),
    side: h('aside', { id: 'side' }),
    log: h('div', { id: 'log' }),
  };
  app.append(els.topbar, h('div', { id: 'main' }, els.mapWrap, els.side), els.log);
  map = createMapView(els.mapWrap, {
    onSelect: (pid) => { selected = pid; render(); },
    onHover: (pid, e) => showTip(pid ? provinceTooltip(state, pid) : null, e),
  });
}

function showTip(html, e) {
  const el = document.getElementById('tooltip');
  if (!html) {
    el.hidden = true;
    return;
  }
  el.innerHTML = html;
  el.hidden = false;
  el.style.left = `${Math.min(window.innerWidth - 270, e.clientX + 14)}px`;
  el.style.top = `${e.clientY + 14}px`;
}

function toast(msg) {
  const t = h('div', {
    style: {
      position: 'fixed', left: '50%', top: '56px', transform: 'translateX(-50%)', background: '#0d1122f0',
      border: '1px solid var(--gold)', borderRadius: '8px', padding: '8px 16px', zIndex: 60, maxWidth: '80vw',
    },
  }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

function ctxFor(pid) {
  return {
    state,
    pid,
    viewer,
    refresh: render,
    toast,
    highlight: (ids) => { highlight = ids; render(); },
    issue,
    openCommand: (type) => {
      if (type === 'rest') return issue('rest', {});
      openCommandDialog(ctxFor(pid), type);
    },
    governorDecides: () => {
      const res = governorTakesTurn(state);
      if (res) toast(res.msg);
      proceed();
    },
    showOfficer: (id) => openModal({ title: state.officers[id].name, body: officerDetail(state, id) }),
  };
}

function issue(type, args) {
  const res = playerCommand(state, type, args);
  if (!res.ok) {
    toast(res.msg);
    return false;
  }
  if (type === 'war') {
    if (res.war.kind === 'captured') toast(res.msg);
  } else {
    toast(res.msg);
  }
  proceed();
  return undefined;
}

function proceed() {
  const r = advance(state);
  if (r.type !== 'battle') saveTo(AUTOSAVE);
  const awaitingOwner = state.awaiting ? state.provinces[state.awaiting].owner : null;
  if (awaitingOwner) viewer = awaitingOwner;
  else if (!viewer || !state.forces[viewer]?.alive) viewer = Object.values(state.forces).find((f) => f.human && f.alive)?.id ?? null;
  if (r.type === 'await') {
    selected = r.pid;
    if (lastViewer && lastViewer !== viewer) toast(`${forceName(state, viewer)}'s turn`);
    lastViewer = viewer;
  }
  render();
  if (r.type === 'battle') {
    openBattleView(state, { onFinish: () => { concludeBattle(state); proceed(); } });
  } else if (r.type === 'captives') {
    openCaptives();
  } else if (r.type === 'gameover') {
    showGameOver();
  }
}

function render() {
  if (!state) return;
  renderTopbar();
  map.update(state, { selected, awaiting: state.awaiting, pickable: highlight, humanForce: viewer });
  renderProvincePanel(els.side, ctxFor(selected));
  renderLog();
}

function renderTopbar() {
  const provs = viewer ? provincesOf(state, viewer) : [];
  const officers = viewer ? officersOf(state, viewer) : [];
  const gold = provs.reduce((s, p) => s + p.gold, 0);
  const food = provs.reduce((s, p) => s + p.food, 0);
  const troops = officers.reduce((s, o) => s + o.troops, 0);
  const f = viewer && state.forces[viewer];
  els.topbar.replaceChildren(...[
    h('span', { class: 'title' }, 'WARRING STATES'),
    h('span', { class: 'date' }, `${dateLabel(state)} · ${SEASONS[state.month - 1]}`),
    f ? h('span', {}, h('span', { class: 'swatch', style: { background: f.color } }), ` ${forceName(state, viewer)}`) : null,
    h('span', { class: 'res' },
      h('span', {}, 'Provinces ', h('b', {}, provs.length)),
      h('span', {}, 'Officers ', h('b', {}, officers.length)),
      h('span', {}, 'Troops ', h('b', {}, fmt(troops))),
      h('span', {}, 'Gold ', h('b', {}, fmt(gold))),
      h('span', {}, 'Food ', h('b', {}, fmt(food)))),
    h('span', { class: 'spacer' }),
    state.awaiting && selected !== state.awaiting
      ? h('button', { class: 'small', onclick: () => { selected = state.awaiting; render(); } }, `▶ ${state.provinces[state.awaiting].name}`) : null,
    !state.awaiting && !state.battle && !state.gameOver
      ? h('button', { class: 'small primary', onclick: proceed, title: 'All your provinces are delegated' }, 'Next month ▶') : null,
    h('button', { class: 'small', onclick: showRealm }, 'Realm'),
    h('button', { class: 'small', onclick: showOfficers }, 'Officers'),
    h('button', { class: 'small', onclick: showSaveLoad }, 'Save / Load'),
    h('button', { class: 'small', onclick: () => showHelp() }, 'Help'),
    h('button', { class: 'small', onclick: () => confirmModal('Quit', 'Return to the title screen? Your progress is autosaved.', () => showTitle(), 'Quit') }, 'Quit'),
  ].filter(Boolean));
}

function renderLog() {
  const humans = new Set(Object.values(state.forces).filter((f) => f.human).map((f) => f.id));
  const entries = state.log.filter((l) => !l.forces || l.kind === 'major' || l.kind === 'war' || l.forces.some((f) => humans.has(f)));
  els.log.replaceChildren(...entries.slice(-120).map((l) => h('div', { class: `entry ${l.kind}` }, h('span', { class: 'date' }, l.date), l.msg)));
  els.log.scrollTop = els.log.scrollHeight;
}

// ---- Dialogs -------------------------------------------------------------------

function openCaptives() {
  const body = h('div');
  const render2 = () => {
    const ids = state.pendingCaptives.filter((id) => state.officers[id].status === 'captive');
    if (!ids.length) {
      body.replaceChildren(h('p', {}, 'All prisoners have been dealt with.'));
      return;
    }
    body.replaceChildren(
      h('p', { class: 'muted' }, 'Prisoners taken in battle. Those you neither recruit, release nor execute stay imprisoned; you can deal with them later through Personnel.'),
      ...ids.map((id) => {
        const o = state.officers[id];
        const p = recruitChance(state, o.force, o);
        return h('div', { class: 'row', style: { borderBottom: '1px solid #ffffff14', padding: '6px 0' } },
          h('div', { style: { minWidth: '200px' } }, h('b', {}, o.name), h('div', { class: 'muted' }, `INT ${o.int} WAR ${o.war} CHA ${o.cha} · formerly ${o.formerLord ? `served ${o.formerLord}` : 'unaffiliated'}`)),
          h('div', { class: 'spacer' }),
          h('button', { class: 'small', disabled: p === 0 || o.triedRecruit, onclick: () => { o.triedRecruit = true; recruitCaptive(state, id); render2(); render(); } },
            p === 0 ? 'Will not serve' : `Recruit (${Math.round(p * 100)}%)`),
          h('button', { class: 'small', onclick: () => { releaseCaptive(state, id); render2(); render(); } }, 'Release'),
          h('button', { class: 'small danger', onclick: () => { executeCaptive(state, id); render2(); render(); } }, 'Execute'));
      }));
  };
  render2();
  openModal({
    title: 'Prisoners of war', body, wide: true, dismissable: false,
    actions: [{
      label: 'Done', primary: true,
      onClick: () => {
        for (const id of state.pendingCaptives) delete state.officers[id].triedRecruit;
        state.pendingCaptives = [];
        proceed();
      },
    }],
  });
}

function showGameOver() {
  const g = state.gameOver;
  const title = g.kind === 'victory' ? 'The realm is unified!' : g.kind === 'defeat' ? 'Your house has fallen' : 'Another has unified the realm';
  const msg = g.kind === 'victory'
    ? `${forceName(state, g.force)} has brought all under heaven to heel in ${state.year} AD.`
    : g.kind === 'defeat' ? 'Your lineage is ended. The chroniclers will remember your name for a little while.'
      : `${forceName(state, g.force)} rules all under heaven.`;
  openModal({ title, body: h('p', {}, msg), dismissable: false, actions: [{ label: 'Return to title', primary: true, onClick: () => showTitle() }] });
}

function showRealm() {
  const rows = Object.values(state.forces).filter((f) => f.alive).map((f) => {
    const provs = provincesOf(state, f.id);
    const offs = officersOf(state, f.id);
    const troops = offs.reduce((s, o) => s + o.troops, 0);
    const rel = viewer && f.id !== viewer ? Math.round(f.relations[viewer] ?? 50) : '—';
    const allied = viewer && areAllied(state, viewer, f.id);
    const until = allied ? state.forces[viewer].alliances[f.id] - monthIndex(state) : 0;
    return { f, provs, offs, troops, rel, allied, until };
  }).sort((a, b) => b.provs.length - a.provs.length);
  openModal({
    title: 'The Realm', wide: true,
    body: h('table', { class: 'officers' },
      h('thead', {}, h('tr', {}, ['Lord', 'Capital', 'Provinces', 'Officers', 'Troops', 'Gold', 'Attitude to you'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((r) => h('tr', { class: 'clickable', onclick: () => { selected = capitalOf(state, r.f.id); render(); } },
        h('td', {}, h('span', { class: 'swatch', style: { background: r.f.color } }), ' ', forceName(state, r.f.id), r.f.human ? h('span', { class: 'tag gold' }, 'Player') : null),
        h('td', {}, state.provinces[capitalOf(state, r.f.id)]?.name ?? '—'),
        h('td', { class: 'n' }, r.provs.length), h('td', { class: 'n' }, r.offs.length), h('td', { class: 'n' }, fmt(r.troops)),
        h('td', { class: 'n' }, fmt(r.provs.reduce((s, p) => s + p.gold, 0))),
        h('td', {}, r.rel, r.allied ? h('span', { class: 'tag gold' }, `Allied ${r.until} mo`) : null))))),
  });
}

function showOfficers() {
  if (!viewer) return;
  const list = officersOf(state, viewer).sort((a, b) => a.province.localeCompare(b.province) || b.war + b.int - a.war - a.int);
  const free = officerList(state).filter((o) => o.status === 'free' && o.known.includes(viewer));
  const modal = openModal({
    title: `Officers of ${forceName(state, viewer)} (${list.length})`, wide: true,
    body: h('div', {},
      h('table', { class: 'officers' },
        h('thead', {}, h('tr', {}, ['Name', 'Province', 'Int', 'War', 'Cha', 'Troops', 'Unit', 'Loy', 'Age', 'Assignment'].map((t) => h('th', {}, t)))),
        h('tbody', {}, list.map((o) => h('tr', { class: 'clickable', onclick: () => { selected = o.province; modal.close(); render(); } },
          h('td', {}, o.name), h('td', {}, state.provinces[o.province].name),
          h('td', { class: 'n' }, o.int), h('td', { class: 'n' }, o.war), h('td', { class: 'n' }, o.cha),
          h('td', { class: 'n' }, fmt(o.troops)), h('td', {}, UNIT_TYPES[o.unit].short),
          h('td', { class: 'n' + (o.loyalty < 50 ? ' bad' : '') }, o.loyalty), h('td', { class: 'n' }, state.year - o.born),
          h('td', { class: 'muted' }, o.task ? TASKS[o.task] : '—'))))),
      free.length ? h('p', { class: 'hint' }, `Known free officers: ${free.map((o) => `${o.name} (${state.provinces[o.province].name})`).join(', ')}`) : null),
  });
}

function showSaveLoad() {
  const body = h('div');
  const render2 = () => {
    body.replaceChildren(...[1, 2, 3].map((k) => {
      const v = loadFrom(`${SAVE_PREFIX}${k}`);
      return h('div', { class: 'row', style: { padding: '6px 0', borderBottom: '1px solid #ffffff14' } },
        h('span', { style: { minWidth: '60px' } }, `Slot ${k}`),
        h('span', { class: 'muted' }, v ? `${v.meta.lord} — ${v.meta.date} (${v.meta.savedAt})` : 'Empty'),
        h('div', { class: 'spacer' }),
        h('button', { class: 'small', disabled: !!state.battle, onclick: () => { toast(saveTo(`${SAVE_PREFIX}${k}`) ? 'Game saved.' : 'Could not save.'); render2(); } }, 'Save'),
        h('button', { class: 'small', disabled: !v, onclick: () => { modal.close(); resume(v.state); } }, 'Load'));
    }), h('p', { class: 'hint' }, 'The game also autosaves every time it waits for your orders. Saves live in this browser only.'));
  };
  const modal = openModal({ title: 'Save / Load', body });
  render2();
}

export function showHelp() {
  openModal({
    title: 'How to play', wide: true,
    body: h('div', {},
      h('p', {}, 'Each month, every province of every lord takes one turn in a random order. When one of your provinces comes up, it pulses gold on the map and its orders appear in the side panel. Choose one command: Develop, Military, Personnel, Move, War, Trade, Diplomacy or Rest.'),
      h('h3', {}, 'Economy'),
      h('p', {}, 'Gold arrives every month from commerce and population; food is harvested once a year in the 7th month. Your armies eat food every month. Public order multiplies all income: tax heavily and it falls. Floods strike river provinces in summer unless dikes (flood control) are maintained. Farmland raises the harvest and the population the land can support.'),
      h('h3', {}, 'Delegation & assignments'),
      h('p', {}, 'Any province can be delegated to its governor with a directive — Balanced, Develop economy, Build military, Hold the line, or Expand. Delegated provinces act on their own and report in the log. Officers can also be given standing assignments (tend farmland, oversee markets, maintain dikes, repair walls, keep order, drill troops) which run every month for a small stipend, on top of the province’s command. Outlying provinces can remit part of their income to your capital.'),
      h('h3', {}, 'War'),
      h('p', {}, 'Attack an adjacent province with up to ten officers and their troops. Battles are fought on a hex field for up to 30 days. Take the castle, rout the enemy commander, or destroy their army to win. Infantry is steady and strong against cavalry; cavalry is fast and deadly on open ground and against archers; archers strike from range without reprisal. Clever officers can set fires that spread with the wind; mighty warriors can challenge enemy officers to duels. Walls strengthen defenders in the castle.'),
      h('h3', {}, 'Officers'),
      h('p', {}, 'Intelligence drives development, fire and archery; War drives combat and duels; Charisma drives recruiting, relief and order. Search provinces for talented free officers; young heroes come of age over the years. Keep loyalty up with rewards, or officers may desert.')),
  });
}
