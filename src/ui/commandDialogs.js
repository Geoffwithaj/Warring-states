// Dialogs for the province commands.

import { h, fmt, select, slider } from './dom.js';
import { openModal } from './modal.js';
import {
  officersIn, idleOfficersIn, freeOfficersIn, captivesIn, forceName, troopsIn, strengthOf, provinceStrength, areAllied,
  troopCap,
} from '../engine/state.js';
import { ADJACENT } from '../engine/map.js';
import { DEV_FIELDS, TILE_VALUE, fieldMax, devGain, reliefGain, trainGain, maxDraft, draftCost, drillCapacity, drillEffect } from '../engine/economy.js';
import { UNIT_TYPES } from '../engine/battle.js';
import {
  searchChance, freeRecruitChance, captiveRecruitChance, allianceChance, transferTroops,
  changeUnitType, unitChangeCost,
} from '../engine/commands.js';
import { foodNeeded, MAX_ARMY, releaseCaptive, executeCaptive } from '../engine/war.js';
import { spyChance, factsFor, SPY_COST, inTruce, canSeeStanding } from '../engine/politics/index.js';
import { standingBlock, reputationText } from './politicsView.js';

const pct = (p) => `${Math.round(p * 100)}%`;
const officerOpts = (list, stat) => list.map((o) => [o.id, `${o.name}${stat ? ` (${stat.toUpperCase()} ${o[stat]})` : ''}`]);
const bestBy = (list, f) => (list.length ? list.reduce((a, b) => (f(b) > f(a) ? b : a)) : null);
const NO_ONE = 'Every officer here already has orders this month.';

function tabbed(tabs, initial) {
  const bar = h('div', { class: 'tabs' });
  const pane = h('div');
  let current = initial || tabs[0].key;
  const show = () => {
    bar.replaceChildren(...tabs.map((t) => h('button', { class: t.key === current ? 'on' : '', onclick: () => { current = t.key; show(); } }, t.label)));
    const tab = tabs.find((t) => t.key === current);
    pane.replaceChildren(tab.render());
    tab.onShow?.();
  };
  return { el: h('div', {}, bar, pane), show, get current() { return current; } };
}

// ---- Develop ---------------------------------------------------------------

export function openDevelop(ctx) {
  const { state, pid } = ctx;
  const p = state.provinces[pid];
  const officers = idleOfficersIn(state, pid);
  if (!officers.length) return ctx.toast(NO_ONE);
  const form = { field: 'farm', officer: bestBy(officers, (o) => o.int).id, gold: Math.min(100, p.gold), food: Math.min(500, p.food) };
  const body = h('div');
  const render = () => {
    const isRelief = form.field === 'relief';
    const stat = isRelief ? 'cha' : DEV_FIELDS[form.field].stat;
    body.replaceChildren(h('div', { class: 'form' },
      h('span', {}, 'Project'),
      h('div', { class: 'row' }, [...Object.entries(DEV_FIELDS).map(([k, f]) => [k, `${f.label} (${p[k]})`]), ['relief', `Relief (order ${p.order})`]]
        .map(([k, label]) => h('button', { class: form.field === k ? 'primary small' : 'small', onclick: () => { form.field = k; render(); } }, label))),
      h('span', {}, 'Overseer'),
      select(officerOpts([...officers].sort((a, b) => b[stat] - a[stat]), stat), form.officer, (v) => { form.officer = v; updatePreview(); }),
      h('span', {}, isRelief ? 'Food to give' : 'Gold to invest'),
      isRelief
        ? slider(form.food, { min: 0, max: p.food, step: 50, onInput: (v) => { form.food = v; updatePreview(); } })
        : slider(form.gold, { min: 0, max: p.gold, step: 10, onInput: (v) => { form.gold = v; updatePreview(); } }),
      h('div', { class: 'full preview', id: 'dev-preview' }),
      h('div', { class: 'full hint' }, isRelief
        ? 'Relief uses the overseer\u2019s charisma.'
        : `Uses the overseer\u2019s ${stat === 'int' ? 'intelligence' : 'war'} rating. Returns diminish as the value approaches its limit.`),
    ));
    updatePreview();
  };
  const updatePreview = () => {
    const box = body.querySelector('#dev-preview');
    const o = state.officers[form.officer];
    if (form.field === 'relief') {
      const g = reliefGain(p, o, form.food);
      box.textContent = `Public order ${p.order} → ${Math.min(100, p.order + g)} (+${g}), and the grateful people multiply.`;
    } else {
      const g = devGain(p, form.field, o, form.gold);
      const f = DEV_FIELDS[form.field];
      const max = fieldMax(p, form.field);
      const after = Math.min(max, p[form.field] + g);
      const tiles = TILE_VALUE[form.field]
        ? ` — ${Math.floor(p[form.field] / TILE_VALUE[form.field])} → ${Math.floor(after / TILE_VALUE[form.field])} of ${Math.floor(max / TILE_VALUE[form.field])} ${form.field === 'farm' ? 'fields' : 'markets'}`
        : '';
      box.textContent = `${f.label} ${p[form.field]} → ${after} (+${g})${tiles}`;
    }
  };
  render();
  return openModal({
    title: `Develop ${p.name}`, body,
    actions: [{ label: 'Cancel' }, {
      label: 'Issue order', primary: true,
      onClick: () => form.field === 'relief'
        ? ctx.issue('relief', { officer: form.officer, food: form.food })
        : ctx.issue('develop', { field: form.field, officer: form.officer, gold: form.gold }),
    }],
  });
}

// ---- Military ---------------------------------------------------------------

export function openMilitary(ctx, initial) {
  const { state, pid } = ctx;
  const p = state.provinces[pid];
  const officers = () => idleOfficersIn(state, pid);
  const draft = { officer: bestBy(officers(), (o) => (troopCap(o) - o.troops) * o.war)?.id, troops: 0 };
  const train = { officer: bestBy(officers(), (o) => o.war)?.id };
  const none = () => h('p', { class: 'muted' }, `${NO_ONE} Organizing troops is still possible.`);
  if (!officers().length) initial = 'organize';
  let modal;
  const tabs = tabbed([
    {
      key: 'draft', label: 'Draft',
      render: () => {
        if (!officers().length) return none();
        const o = state.officers[draft.officer];
        const max = maxDraft(state, pid, o);
        draft.troops = Math.min(draft.troops || Math.min(max, 1000), max);
        const preview = h('div', { class: 'full preview' });
        const upd = () => {
          preview.textContent = `${fmt(draft.troops)} recruits for ${draftCost(draft.troops)} gold. ${o.name}: ${fmt(o.troops)} → ${fmt(o.troops + draft.troops)} (max ${fmt(troopCap(o))}). Order −${Math.ceil(draft.troops / 1000) * 2}. New recruits lower training.`;
        };
        upd();
        return h('div', { class: 'form' },
          h('span', {}, 'Commander'),
          select(officers().map((x) => [x.id, `${x.name} (${fmt(x.troops)}/${fmt(troopCap(x))})`]), draft.officer, (v) => { draft.officer = v; draft.troops = 0; tabs.show(); }),
          h('span', {}, 'Recruits'),
          slider(draft.troops, { min: 0, max, step: 100, onInput: (v) => { draft.troops = v; upd(); } }),
          preview,
          h('div', { class: 'full hint' }, `Draft costs 1 gold per 10 men and draws from the population (${fmt(p.pop)}).`));
      },
      onShow: () => modal?.setActions([{ label: 'Cancel' }, { label: 'Draft', primary: true, disabled: !officers().length, onClick: () => ctx.issue('draft', { officer: draft.officer, troops: draft.troops }) }]),
    },
    {
      key: 'train', label: 'Train',
      render: () => {
        if (!officers().length) return none();
        const master = state.officers[train.officer];
        const units = officersIn(state, pid).filter((o) => o.troops > 0);
        const total = units.reduce((sum, o) => sum + o.troops, 0);
        const effect = drillEffect(master, total);
        return h('div', {},
          h('div', { class: 'form' }, h('span', {}, 'Drill master'),
            select(officerOpts([...officers()].sort((a, b) => b.war - a.war), 'war'), train.officer, (v) => { train.officer = v; tabs.show(); })),
          units.length ? h('p', { class: 'hint' },
            `${master.name} drills the whole garrison of ${fmt(total)} men and can give full attention to about ${fmt(drillCapacity(master))}. `,
            h('span', { class: effect < 1 ? 'warn' : 'good' }, `Effectiveness ${Math.round(effect * 100)}%.`)) : null,
          h('div', { class: 'preview', style: { marginTop: '8px' } },
            units.length ? units.map((o) => h('div', {}, `${o.name}: training ${o.training} → ${Math.min(100, o.training + trainGain(o, master, total))}`))
              : 'No troops to train.'));
      },
      onShow: () => modal?.setActions([{ label: 'Cancel' }, { label: 'Train', primary: true, disabled: !officers().length, onClick: () => ctx.issue('train', { officer: train.officer }) }]),
    },
    {
      key: 'organize', label: 'Organize (free)',
      render: () => organizePane(ctx, () => tabs.show()),
      onShow: () => modal?.setActions([{ label: 'Done' }]),
    },
  ], initial);
  modal = openModal({ title: `Military — ${p.name}`, body: tabs.el, wide: true });
  tabs.show();
  return modal;
}

function organizePane(ctx, rerender) {
  const { state, pid } = ctx;
  const officers = officersIn(state, pid);
  const t = { from: officers[0].id, to: officers[1]?.id ?? officers[0].id, amount: 1000 };
  const msg = h('div', { class: 'hint' });
  const rows = officers.map((o) => h('tr', {},
    h('td', {}, o.name), h('td', { class: 'n' }, fmt(o.troops)), h('td', { class: 'n' }, fmt(troopCap(o))), h('td', { class: 'n' }, o.training),
    h('td', {}, select(Object.entries(UNIT_TYPES).map(([k, u]) => {
      const cost = unitChangeCost(state, pid, o, k);
      return [k, `${u.label}${cost ? ` (${cost} gold)` : ''}`];
    }), o.unit, (v) => {
      const res = changeUnitType(state, pid, o.id, v);
      ctx.refresh();
      rerender();
      if (!res.ok) ctx.toast(res.msg);
    }))));
  return h('div', {},
    h('table', { class: 'officers' },
      h('thead', {}, h('tr', {}, ['Officer', 'Troops', 'Max', 'Trn', 'Unit type'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows)),
    h('p', { class: 'hint' }, 'Cavalry: fast, strong on open plains, deadly against archers, weak in forest and marsh. Archers: strike from range 2 (3 from high ground) without reprisal, weak in melee. Infantry: steady, strong against cavalry. Re-equipping costs a little training; cavalry is cheaper in horse country.'),
    h('h3', { style: { marginTop: '10px', fontSize: '15px' } }, 'Transfer troops'),
    h('div', { class: 'row' },
      select(officerOpts(officers), t.from, (v) => (t.from = v)), '→',
      select(officerOpts(officers), t.to, (v) => (t.to = v)),
      h('input', { type: 'number', value: t.amount, step: 100, min: 100, style: { width: '90px' }, oninput: (e) => (t.amount = Number(e.target.value)) }),
      h('button', { onclick: () => { const r = transferTroops(state, pid, t.from, t.to, t.amount); ctx.refresh(); rerender(); ctx.toast(r.msg); } }, 'Transfer')),
    msg);
}

// ---- Personnel ------------------------------------------------------------

export function openPersonnel(ctx, initial) {
  const { state, pid } = ctx;
  const p = state.provinces[pid];
  const fid = p.owner;
  const officers = officersIn(state, pid);
  const workers = idleOfficersIn(state, pid);
  const search = { officer: bestBy(workers, (o) => o.int + o.cha)?.id };
  const recruit = { officer: bestBy(workers, (o) => o.cha)?.id, target: null };
  if (!workers.length && !initial) initial = 'reward';
  const reward = { target: officers.reduce((a, b) => (b.loyalty < a.loyalty ? b : a)).id, gold: Math.min(100, p.gold) };
  let modal;
  const targets = () => [
    ...freeOfficersIn(state, pid).filter((o) => o.known.includes(fid)),
    ...captivesIn(state, pid).filter((o) => o.force === fid),
  ];
  const tabs = tabbed([
    {
      key: 'search', label: 'Search',
      render: () => (!workers.length ? h('p', { class: 'muted' }, NO_ONE) : h('div', { class: 'form' },
        h('span', {}, 'Searcher'),
        select(officerOpts([...workers].sort((a, b) => b.int + b.cha - a.int - a.cha)).map(([id]) => {
          const o = state.officers[id];
          return [id, `${o.name} (INT ${o.int} CHA ${o.cha}) — ${pct(searchChance(o))} per talent`];
        }), search.officer, (v) => (search.officer = v)),
        h('div', { class: 'full hint' }, 'Scour the province for officers not yet in anyone’s service. A found officer may join at once, or may decline — you can try again later with Recruit.'))),
      onShow: () => modal?.setActions([{ label: 'Cancel' }, { label: 'Search', primary: true, disabled: !workers.length, onClick: () => ctx.issue('search', { officer: search.officer }) }]),
    },
    {
      key: 'recruit', label: 'Recruit',
      render: () => {
        const list = targets();
        if (!list.length) return h('p', { class: 'muted' }, 'There is no one here to recruit. Search the province, or capture enemy officers in battle.');
        if (!workers.length) return h('p', { class: 'muted' }, NO_ONE);
        if (!recruit.target || !list.find((o) => o.id === recruit.target)) recruit.target = list[0].id;
        const t = state.officers[recruit.target];
        const r = state.officers[recruit.officer];
        const p2 = t.status === 'captive' ? captiveRecruitChance(state, r, t) : Math.min(0.95, freeRecruitChance(state, r, t) + 0.05);
        return h('div', { class: 'form' },
          h('span', {}, 'Target'),
          select(list.map((o) => [o.id, `${o.name}${o.status === 'captive' ? ' (captive)' : ''} — INT ${o.int} WAR ${o.war} CHA ${o.cha}`]), recruit.target, (v) => { recruit.target = v; tabs.show(); }),
          h('span', {}, 'Envoy'),
          select(officerOpts([...workers].sort((a, b) => b.cha - a.cha), 'cha'), recruit.officer, (v) => { recruit.officer = v; tabs.show(); }),
          h('div', { class: 'full preview' }, p2 > 0 ? `Chance of success: ${pct(p2)}` : `${t.name} will never betray their lord.`));
      },
      onShow: () => modal?.setActions([{ label: 'Cancel' }, { label: 'Recruit', primary: true, disabled: !targets().length || !workers.length, onClick: () => ctx.issue('recruit', { officer: recruit.officer, target: recruit.target }) }]),
    },
    {
      key: 'reward', label: 'Reward',
      render: () => {
        const preview = h('div', { class: 'full preview' });
        const upd = () => {
          const t = state.officers[reward.target];
          const after = Math.min(100, Math.round(t.loyalty + (reward.gold / 8) * (1 - t.loyalty / 110)));
          preview.textContent = `${t.name}'s loyalty ${t.loyalty} → ${after}`;
        };
        upd();
        return h('div', { class: 'form' },
          h('span', {}, 'Officer'),
          select([...officers].sort((a, b) => a.loyalty - b.loyalty).map((o) => [o.id, `${o.name} (loyalty ${o.loyalty})`]), reward.target, (v) => { reward.target = v; upd(); }),
          h('span', {}, 'Gold'),
          slider(reward.gold, { min: 0, max: p.gold, step: 10, onInput: (v) => { reward.gold = v; upd(); } }),
          preview,
          h('div', { class: 'full hint' }, 'Disloyal officers may desert, and are easier for enemies to win over when captured.'));
      },
      onShow: () => modal?.setActions([{ label: 'Cancel' }, { label: 'Reward', primary: true, onClick: () => ctx.issue('reward', { target: reward.target, gold: reward.gold }) }]),
    },
    {
      key: 'captives', label: 'Captives (free)',
      render: () => {
        const caps = captivesIn(state, pid).filter((o) => o.force === fid);
        if (!caps.length) return h('p', { class: 'muted' }, 'No captives are held here.');
        return h('div', {}, caps.map((o) => h('div', { class: 'row', style: { marginBottom: '4px' } },
          h('span', { style: { minWidth: '160px' } }, o.name), h('span', { class: 'muted' }, `INT ${o.int} WAR ${o.war} CHA ${o.cha}`),
          h('div', { class: 'spacer' }),
          h('button', { class: 'small', onclick: () => { releaseCaptive(state, o.id); ctx.refresh(); tabs.show(); } }, 'Release'),
          h('button', { class: 'small danger', onclick: () => { executeCaptive(state, o.id); ctx.refresh(); tabs.show(); } }, 'Execute'))),
        h('p', { class: 'hint' }, 'Use Recruit to try to win a captive over (this uses the month’s command).'));
      },
      onShow: () => modal?.setActions([{ label: 'Done' }]),
    },
  ], initial);
  modal = openModal({ title: `Personnel — ${p.name}`, body: tabs.el, wide: true });
  tabs.show();
  return modal;
}

// ---- Move -------------------------------------------------------------------

function officerChecklist(state, officers, chosen, onChange, { max = Infinity } = {}) {
  const list = h('div', { class: 'choice-list' });
  const render = () => list.replaceChildren(...officers.map((o) => {
    const on = chosen.has(o.id);
    return h('div', {
      class: 'choice' + (on ? ' on' : ''),
      onclick: () => {
        if (on) chosen.delete(o.id);
        else if (chosen.size < max) chosen.add(o.id);
        render();
        onChange();
      },
    }, h('input', { type: 'checkbox', checked: on, style: { pointerEvents: 'none' } }),
    h('span', { style: { minWidth: '130px' } }, o.name),
    h('span', { class: 'muted' }, `WAR ${o.war} INT ${o.int} · ${fmt(o.troops)} ${UNIT_TYPES[o.unit].short} · trn ${o.training}`));
  }));
  render();
  return list;
}

export function moveTargets(state, pid) {
  const p = state.provinces[pid];
  return ADJACENT[pid].filter((n) => state.provinces[n].owner === p.owner);
}

export function openMove(ctx, initial) {
  const { state, pid } = ctx;
  const p = state.provinces[pid];
  const dests = moveTargets(state, pid);
  if (!dests.length) return ctx.toast('No adjacent province of yours to move to. Use War to claim or seize neighbouring land.');
  const form = { to: dests.includes(initial) ? initial : dests[0], chosen: new Set(), gold: 0, food: 0 };
  const summary = h('div', { class: 'preview' });
  const upd = () => {
    const troops = [...form.chosen].reduce((s, id) => s + state.officers[id].troops, 0);
    summary.textContent = `${form.chosen.size} officer(s) with ${fmt(troops)} troops, ${fmt(form.gold)} gold and ${fmt(form.food)} food will move to ${state.provinces[form.to].name}.`;
  };
  const body = h('div', { class: 'form' },
    h('span', {}, 'Destination'),
    select(dests.map((d) => [d, `${state.provinces[d].name} (${fmt(troopsIn(state, d))} troops)`]), form.to, (v) => { form.to = v; upd(); ctx.highlight([v]); }),
    h('span', {}, 'Officers'),
    officerChecklist(state, idleOfficersIn(state, pid), form.chosen, upd),
    h('span', {}, 'Gold'), slider(0, { min: 0, max: p.gold, step: 10, onInput: (v) => { form.gold = v; upd(); } }),
    h('span', {}, 'Food'), slider(0, { min: 0, max: p.food, step: 100, onInput: (v) => { form.food = v; upd(); } }),
    h('div', { class: 'full' }, summary));
  upd();
  ctx.highlight([form.to]);
  return openModal({
    title: `Move from ${p.name}`, body, wide: true, onClose: () => ctx.highlight(null),
    actions: [{ label: 'Cancel', onClick: () => ctx.highlight(null) }, {
      label: 'Move', primary: true,
      onClick: () => { ctx.highlight(null); return ctx.issue('move', { to: form.to, officers: [...form.chosen], gold: form.gold, food: form.food }); },
    }],
  });
}

// ---- War --------------------------------------------------------------------

export function warTargets(state, pid) {
  const p = state.provinces[pid];
  return ADJACENT[pid].filter((n) => state.provinces[n].owner !== p.owner);
}

export function openWar(ctx, initial) {
  const { state, pid } = ctx;
  const p = state.provinces[pid];
  const targets = warTargets(state, pid);
  if (!targets.length) return ctx.toast('There is no one to attack from here.');
  const officers = idleOfficersIn(state, pid).sort((a, b) => strengthOf(b) - strengthOf(a));
  if (!officers.length) return ctx.toast(NO_ONE);
  const form = { to: targets.includes(initial) ? initial : targets[0], chosen: new Set(officers.filter((o) => o.troops > 0).slice(0, 3).map((o) => o.id)), commander: null, food: 0 };
  const intel = h('div', { class: 'preview' });
  const cmdHolder = h('div');
  let foodSlider;
  const foodHolder = h('div');
  const upd = (resetFood = true) => {
    const t = state.provinces[form.to];
    const army = [...form.chosen].map((id) => state.officers[id]);
    const troops = army.reduce((s, o) => s + o.troops, 0);
    const mine = army.reduce((s, o) => s + strengthOf(o), 0);
    const theirs = t.owner ? provinceStrength(state, form.to) : 0;
    const defOfficers = officersIn(state, form.to);
    const ratio = theirs ? mine / theirs : Infinity;
    const odds = !t.owner || !defOfficers.some((o) => o.troops > 0) ? 'The province is undefended.'
      : ratio > 1.5 ? 'Your advisers are confident.' : ratio > 1.1 ? 'The odds favour you.' : ratio > 0.85 ? 'A hard-fought battle.' : 'Your advisers urge caution.';
    const faith = t.owner && areAllied(state, p.owner, t.owner)
      ? 'This lord is your ally. Attacking breaks the alliance, and every lord will hear of your betrayal.'
      : t.owner && inTruce(state, p.owner, t.owner) ? 'You are under truce with this lord. Attacking breaks it and costs you trust.' : null;
    intel.replaceChildren(
      faith ? h('div', { class: 'bad' }, faith) : '',
      h('div', {}, h('b', {}, t.name), ` — ${t.owner ? forceName(state, t.owner) : 'Unclaimed'}`),
      h('div', { class: 'muted' }, `Defenders: ${defOfficers.length} officers, ${fmt(troopsIn(state, form.to))} troops, walls ${t.walls}, food ${fmt(t.food)}`),
      h('div', {}, `Your army: ${army.length} officers, ${fmt(troops)} troops. `, h('span', { class: ratio > 1.1 ? 'good' : ratio > 0.85 ? 'warn' : 'bad' }, odds)));
    if (!army.find((o) => o.id === form.commander)) form.commander = army.length ? army.reduce((a, b) => (b.war + b.cha / 2 > a.war + a.cha / 2 ? b : a)).id : null;
    cmdHolder.replaceChildren(army.length ? select(army.map((o) => [o.id, o.name]), form.commander, (v) => (form.commander = v)) : h('span', { class: 'muted' }, 'Choose officers'));
    if (resetFood) {
      form.food = Math.min(p.food, foodNeeded(troops));
      foodSlider = slider(form.food, { min: 0, max: p.food, step: 10, onInput: (v) => (form.food = v) });
      foodHolder.replaceChildren(foodSlider, h('div', { class: 'hint' }, `${fmt(foodNeeded(troops))} food feeds this army for a 30-day campaign. Unused food is kept.`));
    }
  };
  const body = h('div', { class: 'form' },
    h('span', {}, 'Target'),
    select(targets.map((d) => [d, `${state.provinces[d].name} (${state.provinces[d].owner ? forceName(state, state.provinces[d].owner) : 'unclaimed'})`]), form.to, (v) => { form.to = v; upd(false); ctx.highlight([v]); }),
    h('div', { class: 'full' }, intel),
    h('span', {}, `Officers (max ${MAX_ARMY})`),
    officerChecklist(state, officers, form.chosen, () => upd(), { max: MAX_ARMY }),
    h('span', {}, 'Commander'), cmdHolder,
    h('span', {}, 'Food'), foodHolder,
    h('p', { class: 'full hint' }, 'If your commander is defeated or withdraws, the whole army falls back. Take the castle, rout their commander, or destroy their army to win. Officers left behind defend the province.'));
  upd();
  ctx.highlight([form.to]);
  return openModal({
    title: `War — march from ${p.name}`, body, wide: true, onClose: () => ctx.highlight(null),
    actions: [{ label: 'Cancel', onClick: () => ctx.highlight(null) }, {
      label: 'March!', primary: true,
      onClick: () => {
        ctx.highlight(null);
        return ctx.issue('war', { to: form.to, officers: [...form.chosen], commander: form.commander, food: form.food });
      },
    }],
  });
}

// ---- Trade ------------------------------------------------------------------

export function openTrade(ctx) {
  const { state, pid } = ctx;
  const p = state.provinces[pid];
  const form = { mode: 'buy', amount: 0 };
  const price = state.foodPrice;
  const body = h('div');
  const render = () => {
    const max = form.mode === 'buy' ? Math.floor(p.gold / price) * 100 : Math.floor(p.food / 100) * 100;
    form.amount = Math.min(form.amount, max);
    const preview = h('div', { class: 'full preview' });
    const upd = () => {
      preview.textContent = form.mode === 'buy'
        ? `Buy ${fmt(form.amount)} food for ${fmt(Math.ceil((form.amount / 100) * price))} gold.`
        : `Sell ${fmt(form.amount)} food for ${fmt(Math.floor((form.amount / 100) * price * 0.85))} gold.`;
    };
    upd();
    body.replaceChildren(h('div', { class: 'form' },
      h('span', {}, 'Market price'), h('span', {}, `${price} gold per 100 food `, h('span', { class: 'muted' }, '(cheapest just after the harvest)')),
      h('span', {}, 'Transaction'),
      h('div', { class: 'row' },
        h('button', { class: form.mode === 'buy' ? 'primary small' : 'small', onclick: () => { form.mode = 'buy'; render(); } }, 'Buy food'),
        h('button', { class: form.mode === 'sell' ? 'primary small' : 'small', onclick: () => { form.mode = 'sell'; render(); } }, 'Sell food')),
      h('span', {}, 'Amount'), slider(form.amount, { min: 0, max, step: 100, onInput: (v) => { form.amount = v; upd(); } }),
      preview));
  };
  render();
  return openModal({
    title: `Trade — ${p.name}`, body,
    actions: [{ label: 'Cancel' }, { label: 'Trade', primary: true, onClick: () => ctx.issue('trade', { mode: form.mode, amount: form.amount }) }],
  });
}

// ---- Diplomacy ------------------------------------------------------------

export function openDiplomacy(ctx) {
  const { state, pid } = ctx;
  const p = state.provinces[pid];
  const fid = p.owner;
  const others = Object.values(state.forces).filter((f) => f.alive && f.id !== fid);
  const officers = idleOfficersIn(state, pid);
  if (!officers.length) return ctx.toast(NO_ONE);
  const form = { target: others[0].id, envoy: bestBy(officers, (o) => o.cha + o.int).id, mode: 'gift', gold: Math.min(200, p.gold) };
  const body = h('div');
  const render = () => {
    const target = state.forces[form.target];
    const envoy = state.officers[form.envoy];
    const allied = areAllied(state, fid, form.target);
    body.replaceChildren(h('div', { class: 'form' },
      h('span', {}, 'Lord'),
      select(others.map((f) => [f.id, `${forceName(state, f.id)} (${Object.values(state.provinces).filter((q) => q.owner === f.id).length} provinces)`]), form.target, (v) => { form.target = v; render(); }),
      h('span', {}, 'Standing'),
      standingBlock(state, fid, form.target),
      h('span', {}, 'Reputation'),
      h('span', {}, reputationText(state, form.target), h('span', { class: 'muted' }, ` · yours: ${reputationText(state, fid)}`)),
      h('span', {}, 'Envoy'),
      select(officerOpts([...officers].sort((a, b) => b.cha - a.cha), 'cha'), form.envoy, (v) => { form.envoy = v; render(); }),
      h('span', {}, 'Mission'),
      h('div', { class: 'row' },
        h('button', { class: form.mode === 'gift' ? 'primary small' : 'small', onclick: () => { form.mode = 'gift'; render(); } }, 'Send gift'),
        h('button', { class: form.mode === 'alliance' ? 'primary small' : 'small', disabled: allied, onclick: () => { form.mode = 'alliance'; render(); } }, 'Propose alliance')),
      ...(form.mode === 'gift'
        ? [h('span', {}, 'Gold'), slider(form.gold, { min: 0, max: p.gold, step: 10, onInput: (v) => (form.gold = v) }),
          h('div', { class: 'full hint' }, 'Gifts warm relations, each a little less than the last; a clever envoy makes them go further. Any envoy lets you see how the lord regards you for a year.')]
        : [h('div', { class: 'full preview' }, canSeeStanding(state, fid, form.target)
          ? `Chance the alliance is accepted: ${pct(allianceChance(state, envoy, form.target))}. `
          : 'You know too little of this lord to judge whether they would agree. ',
        'An alliance lasts three years, then a truce holds for one. Breaking either costs you trust with every lord.')]),
    ));
  };
  render();
  return openModal({
    title: 'Diplomacy', body, wide: true,
    actions: [{ label: 'Cancel' }, {
      label: 'Send envoy', primary: true,
      onClick: () => form.mode === 'gift'
        ? ctx.issue('gift', { officer: form.envoy, target: form.target, gold: form.gold })
        : ctx.issue('alliance', { officer: form.envoy, target: form.target }),
    }],
  });
}

// ---- Plots ------------------------------------------------------------------

export function openPlots(ctx) {
  const { state, pid } = ctx;
  const p = state.provinces[pid];
  const fid = p.owner;
  const others = Object.values(state.forces).filter((f) => f.alive && f.id !== fid);
  const officers = idleOfficersIn(state, pid).sort((a, b) => b.int - a.int);
  if (!officers.length) return ctx.toast(NO_ONE);
  const form = { target: others[0].id, agent: officers[0].id };
  const body = h('div');
  const render = () => {
    const agent = state.officers[form.agent];
    const n = factsFor(agent);
    body.replaceChildren(h('div', { class: 'form' },
      h('span', {}, 'Mission'), h('span', {}, h('b', {}, 'Gather intelligence')),
      h('span', {}, 'Lord'),
      select(others.map((f) => [f.id, forceName(state, f.id)]), form.target, (v) => { form.target = v; render(); }),
      h('span', {}, 'Agent'),
      select(officerOpts(officers, 'int'), form.agent, (v) => { form.agent = v; render(); }),
      h('div', { class: 'full preview' },
        `Cost ${SPY_COST} gold. Chance of success: ${pct(spyChance(state, agent, form.target))}. `,
        `A successful agent brings back up to ${n} things about the lord's temperament, desires, grudges and court`,
        agent.int >= 75 ? ', plainly told.' : ', some only as rumour.',
        h('div', { class: 'hint' }, 'A failed agent may be caught and imprisoned, and the lord will not forget it. The sharper the minds at their court, the harder the task.')),
      p.gold < SPY_COST ? h('div', { class: 'full bad' }, `Not enough gold (${SPY_COST} needed).`) : ''));
  };
  render();
  return openModal({
    title: 'Plots', body, wide: true,
    actions: [{ label: 'Cancel' }, {
      label: 'Send agent', primary: true,
      onClick: () => ctx.issue('spy', { officer: form.agent, target: form.target }),
    }],
  });
}

export function openCommandDialog(ctx, type) {
  // Like RTK II, choosing where to march or attack happens on the map.
  if (type === 'war' && !idleOfficersIn(ctx.state, ctx.pid).length) return ctx.toast(NO_ONE);
  if (type === 'war' || type === 'move') {
    const ids = type === 'war' ? warTargets(ctx.state, ctx.pid) : moveTargets(ctx.state, ctx.pid);
    if (!ids.length) {
      return ctx.toast(type === 'war' ? 'There is no one to attack from here.' : 'No adjacent province of yours to move to. Use War to claim or seize neighbouring land.');
    }
    const from = ctx.state.provinces[ctx.pid].name;
    const prompt = type === 'war' ? `Tap a province to attack from ${from}` : `Tap a province to move to from ${from}`;
    return ctx.pickProvince(ids, prompt, (to) => (type === 'war' ? openWar(ctx, to) : openMove(ctx, to)));
  }
  const map = {
    develop: openDevelop, military: openMilitary, personnel: openPersonnel, move: openMove,
    war: openWar, trade: openTrade, diplomacy: openDiplomacy, plots: openPlots,
  };
  return map[type](ctx);
}

