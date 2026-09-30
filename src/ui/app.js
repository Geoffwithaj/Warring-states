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
  officerList, log, SAVE_VERSION,
} from '../engine/state.js';
import { newGameStart, step, playerCommand, governorTakesTurn, concludeBattle } from '../engine/turn.js';
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
    const saved = raw ? JSON.parse(raw) : null;
    // Saves made under older rules are set aside rather than migrated.
    return saved && saved.state?.version === SAVE_VERSION ? saved : null;
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
  run();
}

function resume(saved) {
  state = saved;
  buildShell();
  run();
}

// ---- Main screen --------------------------------------------------------------
//
// As in RTK II, the map fills the screen while the other lords take their
// turns, and each of your provinces gets a full orders screen when its turn
// comes. On wide screens both are shown side by side.

const WIDE = window.matchMedia('(min-width: 1100px)');
const SPEEDS = {
  normal: { label: 'Normal', war: 1500, gov: 800, month: 900 },
  fast: { label: 'Fast', war: 600, gov: 300, month: 350 },
  instant: { label: 'Instant', war: 0, gov: 0, month: 0 },
};

let view = 'map'; // 'map' | 'orders' (narrow screens only)
let running = false;
let skipping = false;
let pick = null; // { ids, prompt, onPick }
let card = null; // province shown in the map's info card
let speed = 'normal';
try { speed = localStorage.getItem('warring-states-speed') || 'normal'; } catch { /* storage blocked */ }
if (!SPEEDS[speed]) speed = 'normal';

function buildShell() {
  const app = clear(document.getElementById('app'));
  els = {
    topbar: h('div', { id: 'topbar' }),
    mapWrap: h('div', { id: 'map-wrap' }),
    side: h('aside', { id: 'side' }),
    log: h('div', { id: 'log' }),
    banner: h('div', { class: 'map-banner', hidden: true }),
    ticker: h('div', { class: 'ticker', hidden: true }),
    card: h('div', { class: 'prov-card', hidden: true }),
    mapTools: h('div', { class: 'map-tools' }),
  };
  app.append(els.topbar, h('div', { id: 'main' }, els.mapWrap, els.side), els.log);
  map = createMapView(els.mapWrap, {
    onSelect: onMapTap,
    onHover: (pid, e) => (WIDE.matches ? showTip(pid ? provinceTooltip(state, pid) : null, e) : null),
  });
  els.mapWrap.append(els.banner, els.ticker, els.card, els.mapTools);
  els.mapWrap.addEventListener('click', (e) => { if (running && e.target.closest('svg.strategic')) skipping = true; }, true);
  WIDE.onchange = () => render();
  // Phones start zoomed in on the player's capital so names are legible.
  const home = viewer || Object.values(state.forces).find((f) => f.human && f.alive)?.id;
  if (!WIDE.matches && home) setTimeout(() => map.focus(capitalOf(state, home), 2), 0);
}

function setView(v) {
  view = v;
  document.body.dataset.view = v;
  if (v === 'orders') card = null;
}

function onMapTap(pid) {
  if (running) return;
  if (pick) {
    if (pick.ids.includes(pid)) {
      const cb = pick.onPick;
      endPick();
      cb(pid);
    } else {
      toast(pick.prompt);
    }
    return;
  }
  if (WIDE.matches) {
    selected = pid;
    render();
    return;
  }
  card = card === pid ? null : pid;
  render();
}

// Ask the player to tap one of `ids` on the map.
function pickProvince(ids, prompt, onPick) {
  pick = { ids, prompt, onPick };
  card = null;
  setView('map');
  if (map.isZoomed() && state.awaiting) map.focus(state.awaiting);
  render();
}

function endPick() {
  pick = null;
  setView(state?.awaiting ? 'orders' : 'map');
  render();
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
  const t = h('div', { class: 'toast' }, msg);
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
    pickProvince,
    issue,
    openCommand: (type) => {
      if (type === 'rest') return issue('rest', {});
      openCommandDialog(ctxFor(pid), type);
    },
    governorDecides: () => {
      const name = state.provinces[pid].name;
      const res = governorTakesTurn(state);
      if (res) toast(res.msgs.length ? `The governor of ${name} gave ${res.msgs.length} order${res.msgs.length > 1 ? 's' : ''} (see the chronicle).` : res.msg);
      for (const m of res?.msgs ?? []) log(state, `[${name}] ${m}`, 'delegate', [viewer]);
      run();
    },
    showMap: () => { setView('map'); render(); },
    backToOrders: () => { selected = state.awaiting; setView('orders'); render(); },
    showOfficer: (id) => openModal({ title: state.officers[id].name, body: officerDetail(state, id) }),
  };
}

function issue(type, args) {
  const res = playerCommand(state, type, args);
  if (!res.ok) {
    toast(res.msg);
    return false;
  }
  if (type !== 'rest' && (type !== 'war' || res.war.kind === 'captured')) toast(res.msg);
  run();
  return undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

function humanIds() {
  return new Set(Object.values(state.forces).filter((f) => f.human).map((f) => f.id));
}

// Shows one computer-run action on the map, if it is worth showing.
async function playAction(r) {
  const sp = SPEEDS[skipping ? 'instant' : speed];
  const humans = humanIds();
  let ms = 0;
  let msg = null;
  if (r.war) {
    const { from, to, attacker, defender, winner } = r.war;
    const target = state.provinces[to].name;
    const who = forceName(state, attacker);
    if (!defender) msg = `${who} occupies ${target}.`;
    else msg = winner === 'att'
      ? `${who} attacks ${target} from ${state.provinces[from].name} — and takes it!`
      : `${who} attacks ${target} from ${state.provinces[from].name} — ${forceName(state, defender)} holds.`;
    ms = defender ? sp.war : sp.gov;
    if (ms) map.showArrow(from, to, winner === 'att' ? '#ffe08a' : '#ff8a7a');
  } else if (humans.has(r.owner) && r.msgs.length) {
    // A delegated province may give several orders; show them together.
    const shown = r.msgs.slice(0, 3).join(' ');
    const more = r.msgs.length > 3 ? ` (+${r.msgs.length - 3} more in the chronicle)` : '';
    msg = `${state.provinces[r.pid].name}: ${shown}${more}`;
    ms = sp.gov;
    if (ms) map.pulse(r.pid);
  }
  if (!ms) return;
  setView('map');
  card = null;
  showTicker(msg);
  render();
  if (map.isZoomed()) map.focus(r.war ? r.war.to : r.pid);
  await sleep(ms);
  map.clearFx();
}

async function playMonth() {
  const sp = SPEEDS[skipping ? 'instant' : speed];
  if (!sp.month) return;
  setView('map');
  els.banner.hidden = false;
  els.banner.replaceChildren(h('div', { class: 'month-title' }, `${dateLabel(state)}`), h('div', { class: 'muted' }, SEASONS[state.month - 1]));
  render();
  await sleep(sp.month);
  els.banner.hidden = true;
}

function showTicker(msg) {
  els.ticker.hidden = !msg;
  if (msg) els.ticker.textContent = msg;
}

// The turn loop: step through provinces, showing what happens, until the
// game needs the player.
async function run() {
  if (running) return;
  running = true;
  skipping = false;
  let steps = 0;
  try {
    for (;;) {
      const r = step(state);
      if (r.type === 'skip') continue;
      if (r.type === 'acted') {
        await playAction(r);
        if (++steps % 25 === 0) await frame();
        continue;
      }
      if (r.type === 'month') {
        saveTo(AUTOSAVE);
        await playMonth();
        if (r.idle) {
          running = false;
          stopAt(r);
          return;
        }
        continue;
      }
      running = false;
      stopAt(r);
      return;
    }
  } catch (err) {
    running = false;
    console.error(err);
    toast(`Something went wrong: ${err.message}`);
  }
}

function stopAt(r) {
  skipping = false;
  showTicker(null);
  map.clearFx();
  if (r.type !== 'battle') saveTo(AUTOSAVE);
  const awaitingOwner = state.awaiting ? state.provinces[state.awaiting].owner : null;
  if (awaitingOwner) viewer = awaitingOwner;
  else if (!viewer || !state.forces[viewer]?.alive) viewer = Object.values(state.forces).find((f) => f.human && f.alive)?.id ?? null;
  if (r.type === 'await') {
    selected = r.pid;
    // Playback may have panned elsewhere; bring the camera back home.
    if (map.isZoomed()) map.focus(r.pid);
    setView('orders');
    if (lastViewer && lastViewer !== viewer) toast(`${forceName(state, viewer)}'s turn`);
    lastViewer = viewer;
  } else {
    setView('map');
  }
  render();
  if (r.type === 'battle') {
    openBattleView(state, { onFinish: () => { concludeBattle(state); run(); } });
  } else if (r.type === 'captives') {
    openCaptives();
  } else if (r.type === 'gameover') {
    showGameOver();
  }
}

function render() {
  if (!state) return;
  document.body.dataset.view = WIDE.matches ? 'split' : view;
  renderTopbar();
  map.update(state, { selected, awaiting: state.awaiting, pickable: pick?.ids ?? highlight, humanForce: viewer });
  renderProvincePanel(els.side, ctxFor(selected));
  renderMapOverlays();
  renderLog();
}

function renderMapOverlays() {
  // Target picking.
  if (pick) {
    els.banner.hidden = false;
    els.banner.replaceChildren(h('div', {}, pick.prompt), h('button', { class: 'small', onclick: () => endPick() }, 'Cancel'));
  } else if (!running) {
    els.banner.hidden = true;
  }
  // Province card (phones).
  if (card && !pick && !running) {
    const p = state.provinces[card];
    els.card.hidden = false;
    els.card.replaceChildren(
      h('div', { class: 'row' }, h('b', { style: { fontSize: '17px' } }, p.name), h('span', { class: 'spacer' }),
        h('button', { class: 'small', onclick: () => { card = null; render(); } }, '✕')),
      h('div', { class: 'card-body' }),
      h('div', { class: 'row', style: { marginTop: '6px' } },
        h('button', { class: 'small primary', onclick: () => { selected = card; setView('orders'); render(); } }, 'Details')));
    els.card.querySelector('.card-body').innerHTML = provinceTooltip(state, card);
  } else {
    els.card.hidden = true;
  }
  // Floating controls.
  const tools = [
    h('button', { class: 'small', onclick: () => map.zoomIn(), title: 'Zoom in' }, '+'),
    h('button', { class: 'small', onclick: () => map.zoomOut(), title: 'Zoom out' }, '−'),
    h('button', { class: 'small', onclick: () => map.resetZoom(), title: 'Whole map' }, '⤢'),
  ];
  if (running) {
    tools.push(h('button', { class: 'small', onclick: cycleSpeed, title: 'Playback speed' }, `Speed: ${SPEEDS[speed].label}`));
    tools.push(h('button', { class: 'small', onclick: () => (skipping = true) }, 'Skip ▶▶'));
  } else if (state.awaiting && !pick && !WIDE.matches) {
    tools.push(h('button', { class: 'small primary', onclick: () => { selected = state.awaiting; setView('orders'); render(); } }, `Orders: ${state.provinces[state.awaiting].name} ▶`));
  } else if (!state.awaiting && !state.battle && !state.gameOver && !pick) {
    tools.push(h('button', { class: 'small primary', onclick: run }, 'Next month ▶'));
  }
  els.mapTools.replaceChildren(...tools);
}

function cycleSpeed() {
  const keys = Object.keys(SPEEDS);
  speed = keys[(keys.indexOf(speed) + 1) % keys.length];
  try { localStorage.setItem('warring-states-speed', speed); } catch { /* storage blocked */ }
  renderMapOverlays();
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
    f ? h('span', { class: 'lord' }, h('span', { class: 'swatch', style: { background: f.color } }), ` ${forceName(state, viewer)}`) : null,
    h('span', { class: 'spacer' }),
    h('button', { class: 'small menu-btn', onclick: showMenu }, '☰ Menu'),
    h('span', { class: 'res' },
      h('span', {}, 'Prov ', h('b', {}, provs.length)),
      h('span', {}, 'Officers ', h('b', {}, officers.length)),
      h('span', {}, 'Troops ', h('b', {}, fmt(troops))),
      h('span', {}, 'Gold ', h('b', {}, fmt(gold))),
      h('span', {}, 'Food ', h('b', {}, fmt(food)))),
    h('span', { class: 'wide-only row' },
      h('button', { class: 'small', onclick: showRealm }, 'Realm'),
      h('button', { class: 'small', onclick: showOfficers }, 'Officers'),
      h('button', { class: 'small', onclick: showSaveLoad }, 'Save / Load'),
      h('button', { class: 'small', onclick: () => showHelp() }, 'Help'),
      h('button', { class: 'small', onclick: quit }, 'Quit')),
  ].filter(Boolean));
}

function quit() {
  confirmModal('Quit', 'Return to the title screen? Your progress is autosaved.', () => showTitle(), 'Quit');
}

function showMenu() {
  const item = (label, fn) => h('button', { class: 'menu-item', onclick: () => { m.close(); fn(); } }, label);
  const m = openModal({
    title: 'Menu',
    body: h('div', { class: 'menu-list' },
      item('Realm overview', showRealm),
      item('Your officers', showOfficers),
      item('Chronicle (message log)', showChronicle),
      item(`Playback speed: ${SPEEDS[speed].label}`, () => { cycleSpeed(); showMenu(); }),
      item('Save / Load', showSaveLoad),
      item('How to play', () => showHelp()),
      item('Quit to title', quit)),
  });
}

function logEntries() {
  const humans = humanIds();
  return state.log.filter((l) => !l.forces || l.kind === 'major' || l.kind === 'war' || l.forces.some((f) => humans.has(f)));
}

function logRows(entries) {
  return entries.map((l) => h('div', { class: `entry ${l.kind}` }, h('span', { class: 'date' }, l.date), l.msg));
}

function showChronicle() {
  const body = h('div', { class: 'chronicle' }, logRows(logEntries().slice(-200).reverse()));
  openModal({ title: 'Chronicle', body, wide: true });
}

function renderLog() {
  if (!WIDE.matches) return;
  els.log.replaceChildren(...logRows(logEntries().slice(-120)));
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
        run();
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
      h('p', {}, 'Each month, every province of every lord takes one turn in a random order. When one of your provinces comes up, its orders screen appears. Give as many orders as you like — Develop, Military, Personnel, Move, War, Trade, Diplomacy — but each officer can take only one job a month. War ends the province\u2019s turn; otherwise press End turn when you are done, or let the governor finish the turn.'),
      h('h3', {}, 'Economy'),
      h('p', {}, 'Gold arrives every month from commerce and population; food is harvested once a year in the 7th month. Your armies eat food every month. Public order multiplies all income: tax heavily and it falls. Floods strike river provinces in summer unless dikes (flood control) are maintained. Farmland raises the harvest and the population the land can support.'),
      h('h3', {}, 'Delegation & assignments'),
      h('p', {}, 'Any province can be delegated to its governor with a directive — Balanced, Develop economy, Build military, Hold the line, or Expand. Delegated provinces act on their own and report in the log. Officers can also be given standing assignments (tend farmland, oversee markets, maintain dikes, repair walls, keep order, drill troops) as their job each month. Drilling and patrols are free; building work draws on the province\u2019s assignment budget (a share of its monthly income), converting gold into progress as efficiently as Develop. An officer on assignment is busy; clear it to use them for orders that turn. Outlying provinces can remit part of their income to your capital.'),
      h('h3', {}, 'War'),
      h('p', {}, 'Attack an adjacent province with up to ten officers and their troops. Each province has its own battlefield. Terrain matters: forest and hills give cover, marsh and fords leave troops exposed. Cavalry is decisive only when it can Charge — a fresh unit riding through its target across open ground; through forest or marsh a charge fizzles. Infantry holds against cavalry and is the arm for sieges; archers shoot from range and trade volleys with other archers. A unit attacked from several sides suffers more.'),
      h('p', {}, 'The castle fights too: each defender turn its walls shoot at every attacker beside them, and strong walls shelter the garrison. Assault the walls with infantry until they are breached (half strength); only then can an empty castle be entered, and an occupied castle holds until its defender falls. Wall damage lasts, so rebuild after a siege. Refusing a duel shames the whole army. Win by taking the castle, routing the enemy commander, or destroying their army within 30 days.'),
      h('h3', {}, 'Officers'),
      h('p', {}, 'Intelligence drives development, fire and archery; War drives combat and duels; Charisma drives recruiting, relief and order. Search provinces for talented free officers; young heroes come of age over the years. Keep loyalty up with rewards, or officers may desert.')),
  });
}
