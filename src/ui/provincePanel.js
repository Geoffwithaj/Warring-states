// Side panel: province details, officers, management and commands.

import { h, fmt, bar, select } from './dom.js';
import {
  officersIn, idleOfficersIn, usedThisMonth, captivesIn, freeOfficersIn, forceName, governorOf, troopsIn, capitalOf, age, areAllied,
} from '../engine/state.js';
import { TAX, TASKS, FUNDED_TASKS, TILE_VALUE, fieldMax, tilesOf, tileCapacity, BUDGET_LEVELS, taskBudgetShare, monthlyGold, harvestFood, foodUpkeep, HARVEST_MONTH, popCap } from '../engine/economy.js';
import { DIRECTIVES } from '../engine/ai.js';
import { UNIT_TYPES } from '../engine/battle.js';
import { setTax, setRemit, setTask, setDelegate, setGovernor, setTaskBudget } from '../engine/commands.js';
import { PROVINCE_BY_ID } from '../engine/map.js';

const stat = (label, value, extra) => h('div', { class: 'stat' }, h('span', {}, label), h('span', {}, value, extra || ''));

export function renderProvincePanel(el, ctx) {
  const { state, pid } = ctx;
  el.replaceChildren();
  if (!pid) {
    el.append(h('p', { class: 'muted' }, 'Select a province on the map.'));
    return;
  }
  const p = state.provinces[pid];
  const meta = PROVINCE_BY_ID[pid];
  const mine = !!p.owner && p.owner === ctx.viewer;
  const awaiting = state.awaiting === pid && mine;
  const gov = p.owner ? governorOf(state, pid) : null;
  const ownerColor = p.owner ? state.forces[p.owner].color : '#d9ceaa';

  // Phone navigation between the orders screen and the map.
  el.append(h('div', { class: 'panel-nav narrow-only' },
    h('button', { class: 'small', onclick: ctx.showMap }, '🗺 Map'),
    state.awaiting && state.awaiting !== pid
      ? h('button', { class: 'small primary', onclick: ctx.backToOrders }, `◀ Orders for ${state.provinces[state.awaiting].name}`) : null));

  el.append(h('div', { class: 'panel-head' },
    h('h2', {}, p.name),
    h('span', {}, h('span', { class: 'swatch', style: { background: ownerColor } }), ' ', p.owner ? forceName(state, p.owner) : 'Unclaimed'),
    p.owner && capitalOf(state, p.owner) === pid ? h('span', { class: 'tag gold' }, 'Capital') : null,
    p.delegate ? h('span', { class: 'tag' }, 'Delegated') : null,
  ));
  el.append(h('div', { class: 'hint' },
    `${meta.terrain[0].toUpperCase() + meta.terrain.slice(1)} terrain`,
    meta.river ? ' · river (flood risk)' : '', meta.horses ? ' · horse country' : '',
    gov ? ` · Governor ${gov.name}` : '',
    p.owner && !mine && areAllied(state, p.owner, ctx.viewer) ? ' · Allied' : ''));

  if (awaiting) {
    const all = officersIn(state, pid);
    const free = idleOfficersIn(state, pid);
    el.append(h('div', { class: 'awaiting-banner' },
      h('b', {}, `Orders for ${p.name}`),
      h('div', { style: { color: '#e8dcb8' } }, `${free.length} of ${all.length} officers still free this month.`),
      h('div', { class: 'hint', style: { color: '#e8dcb8' } },
        'Give as many orders as you like — each officer can take one job a month. Officers on standing assignments are busy; set their assignment to — to use them this turn. War ends the province\u2019s turn.')));
    const cmd = (label, type, title) => h('button', { onclick: () => ctx.openCommand(type), title }, label);
    el.append(h('div', { class: 'commands' },
      cmd('Develop', 'develop', 'Invest gold in farmland, commerce, dikes or walls; give relief'),
      cmd('Military', 'military', 'Draft, train, organise troops'),
      cmd('Personnel', 'personnel', 'Search for talent, recruit, reward, captives'),
      cmd('Move', 'move', 'Move officers, troops and supplies'),
      cmd('War', 'war', 'Attack an adjacent province (ends the turn)'),
      cmd('Trade', 'trade', 'Buy or sell food'),
      cmd('Diplomacy', 'diplomacy', 'Gifts and alliances'),
      h('button', { onclick: ctx.governorDecides, title: 'Let the governor give orders to the free officers and end the turn' }, 'Governor finishes'),
      h('button', { class: 'primary', onclick: () => ctx.issue('rest', {}) }, 'End turn ▶'),
    ));
  }

  // Economy.
  const upkeep = p.owner ? foodUpkeep(state, pid) : 0;
  const harvestIn = (HARVEST_MONTH - state.month + 12) % 12 || 12;
  el.append(h('div', { class: 'section' }, h('h3', {}, 'Province'),
    h('div', { class: 'stats' },
      stat('Gold', fmt(p.gold)),
      stat('Food', fmt(p.food)),
      stat('People', fmt(p.pop)),
      tileBar('Farmland', p, 'farm', '#9cc46a'),
      tileBar('Commerce', p, 'commerce', '#d9b25f'),
      statBar('Order', p.order, 100, p.order < 35 ? '#e0705f' : '#8fb4e8'),
      statBar('Flood ctl', p.flood, 100, '#5b8fc9'),
      statBar('Walls', p.walls, 100, '#a89a80'),
      stat('Troops', fmt(troopsIn(state, pid))),
    ),
    p.owner ? h('div', { class: 'hint', style: { marginTop: '6px' } },
      `Income ~${fmt(monthlyGold(p))} gold/month · harvest ~${fmt(harvestFood(p))} food in ${harvestIn} month${harvestIn > 1 ? 's' : ''} · army eats ${fmt(upkeep)} food/month · pop cap ${fmt(popCap(p))}`) : null,
  ));

  if (mine) el.append(managementSection(ctx, p));

  // Officers.
  const officers = officersIn(state, pid);
  el.append(h('div', { class: 'section' }, h('h3', {}, `Officers (${officers.length})`),
    officers.length ? officerTable(ctx, officers, mine) : h('p', { class: 'muted' }, 'No officers are stationed here.')));

  const caps = captivesIn(state, pid);
  if (caps.length && (mine || !p.owner)) {
    el.append(h('div', { class: 'section' }, h('h3', {}, 'Captives'),
      h('div', {}, caps.map((o) => h('div', {}, `${o.name} `, h('span', { class: 'muted' }, `INT ${o.int} WAR ${o.war} CHA ${o.cha}`))))));
  }
  const known = freeOfficersIn(state, pid).filter((o) => o.known.includes(ctx.viewer));
  if (known.length && mine) {
    el.append(h('div', { class: 'section' }, h('h3', {}, 'Known free officers'),
      known.map((o) => h('div', {}, `${o.name} `, h('span', { class: 'muted' }, `INT ${o.int} WAR ${o.war} CHA ${o.cha}`)))));
  }
}

// Farmland and Commerce shown as developed tiles out of the province's potential.
function tileBar(label, p, field, color) {
  const tiles = tilesOf(p, field);
  const cap = tileCapacity(p, field);
  const part = Math.round(((p[field] % TILE_VALUE[field]) / TILE_VALUE[field]) * 100);
  const unit = field === 'farm' ? 'fields' : 'markets';
  return h('div', { title: `${fmt(p[field])} of ${fmt(fieldMax(p, field))} · ${tiles < cap ? `${part}% toward the next` : 'fully developed'}` },
    stat(label, `${tiles}/${cap}`, h('span', { class: 'muted', style: { fontSize: '11px' } }, ` ${unit}`)),
    bar(p[field], fieldMax(p, field), color));
}

function statBar(label, v, max, color) {
  return h('div', {}, stat(label, fmt(v)), bar(v, max, color));
}

function managementSection(ctx, p) {
  const { state, pid } = ctx;
  const officers = officersIn(state, pid);
  const gov = governorOf(state, pid);
  const isCapital = capitalOf(state, p.owner) === pid;
  const refresh = (fn) => (v) => { fn(v); ctx.refresh(); };
  const directiveOpts = [['', 'Rule directly'], ...Object.entries(DIRECTIVES).map(([k, d]) => [k, `Delegate: ${d.label}`])];
  const income = Math.floor(monthlyGold(p) * (1 - (isCapital ? 0 : p.remit)));
  const funded = officers.filter((o) => FUNDED_TASKS.has(o.task)).length;
  return h('div', { class: 'section' }, h('h3', {}, 'Management'),
    h('div', { class: 'mgmt' },
      h('span', {}, 'Tax rate'),
      select(Object.entries(TAX).map(([k, t]) => [k, `${t.label} (×${t.mult} income, ${t.order >= 0 ? '+' : ''}${t.order} order/mo)`]), p.tax,
        refresh((v) => setTax(state, pid, v))),
      h('span', {}, 'Governor'),
      officers.length
        ? select(officers.map((o) => [o.id, `${o.name} (CHA ${o.cha})`]), gov?.id, refresh((v) => setGovernor(state, pid, v)))
        : h('span', { class: 'muted' }, '—'),
      h('span', {}, 'Remit to capital'),
      isCapital ? h('span', { class: 'muted' }, 'This is the capital')
        : select([[0, 'None'], [0.25, '25% of income'], [0.5, '50% of income'], [0.75, '75% of income']], p.remit,
          refresh((v) => setRemit(state, pid, Number(v)))),
      h('span', {}, 'Assignment budget'),
      p.delegate ? h('span', { class: 'muted' }, `${Math.round(taskBudgetShare(p) * 100)}% of income (set by the governor)`)
        : select(BUDGET_LEVELS.map((b) => [b, b ? `${b * 100}% of income (~${Math.floor(income * b)} gold/mo)` : 'None — labour only']), taskBudgetShare(p),
          refresh((v) => setTaskBudget(state, pid, v))),
      h('span', {}, 'Control'),
      select(directiveOpts, p.delegate?.directive || '', refresh((v) => setDelegate(state, pid, v || null))),
    ),
    p.delegate ? h('p', { class: 'hint' }, `${DIRECTIVES[p.delegate.directive].desc} The governor also sets officer assignments and their budget each month.`) : null,
    h('p', { class: 'hint' },
      `A standing assignment is that officer\u2019s job every month, done at month end and skipped in any month they are given other orders. `,
      `Drilling and patrols cost nothing. Building work ($) shares the assignment budget${funded ? ` — ${funded} officer${funded > 1 ? 's' : ''} now, ~${Math.floor(income * taskBudgetShare(p) / funded)} gold each` : ''} and turns gold into progress as efficiently as Develop.`),
  );
}

function officerTable(ctx, officers, mine) {
  const { state } = ctx;
  const f = state.provinces[ctx.pid].owner && state.forces[state.provinces[ctx.pid].owner];
  const rows = officers
    .sort((a, b) => (b.id === f?.ruler) - (a.id === f?.ruler) || b.troops - a.troops)
    .map((o) => {
      const taskCell = mine && !state.provinces[ctx.pid].delegate
        ? select([['', '—'], ...Object.entries(TASKS).map(([k, label]) => [k, FUNDED_TASKS.has(k) ? `${label} ($)` : label])], o.task || '', (v) => { setTask(state, o.id, v || null); ctx.refresh(); })
        : h('span', { class: 'muted' }, o.task ? TASKS[o.task] : '—');
      return h('tr', { class: 'clickable', onclick: (e) => { if (e.target.tagName !== 'SELECT') ctx.showOfficer(o.id); } },
        h('td', {}, o.name, o.id === f?.ruler ? h('span', { class: 'tag gold' }, 'Lord') : null,
          mine && usedThisMonth(state, o) ? h('span', { class: 'tag', title: 'Already has orders this month' }, 'Busy') : null),
        h('td', { class: 'n' }, o.int), h('td', { class: 'n' }, o.war), h('td', { class: 'n' }, o.cha),
        h('td', { class: 'n' }, fmt(o.troops)),
        h('td', { class: 'n' }, o.training),
        h('td', {}, UNIT_TYPES[o.unit].short),
        h('td', { class: 'n' + (o.loyalty < 50 ? ' bad' : '') }, o.loyalty),
        h('td', {}, taskCell));
    });
  return h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'officers' },
    h('thead', {}, h('tr', {}, ['Name', 'Int', 'War', 'Cha', 'Troops', 'Trn', 'Unit', 'Loy', 'Assignment'].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows)));
}

export function officerDetail(state, id) {
  const o = state.officers[id];
  return h('div', {},
    h('div', { class: 'stats' },
      stat('Intelligence', o.int), stat('War', o.war), stat('Charisma', o.cha),
      stat('Age', age(state, o)), stat('Loyalty', o.loyalty), stat('Troops', fmt(o.troops)),
      stat('Training', o.training), stat('Unit', UNIT_TYPES[o.unit].label),
      stat('Serves', o.force ? forceName(state, o.force) : '—'),
    ),
    h('p', { class: 'hint' }, `Born ${o.born} AD. ${o.task ? `Assigned: ${TASKS[o.task]}.` : ''}`));
}
