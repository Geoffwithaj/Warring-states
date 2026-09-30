// Homelands: the provinces a house regards as its own. A house fights harder
// for them and never forgets their loss. Land held long and well becomes
// homeland in time.

import { monthIndex, forceName, log } from '../state.js';

export const HOMELAND_MONTHS = 120; // ten years of settled rule

export function initHomelands(state) {
  const now = monthIndex(state);
  for (const p of Object.values(state.provinces)) {
    p.homeland = p.owner ?? null;
    p.heldSince = now;
  }
}

export const isHomeland = (state, pid, fid) => !!fid && state.provinces[pid].homeland === fid;

// Homeland provinces of `a` in the hands of `b`.
export const grievance = (state, a, b) =>
  Object.values(state.provinces).filter((p) => p.homeland === a && p.owner === b).length;

export const lostHomeland = (state, fid) =>
  Object.values(state.provinces).filter((p) => p.homeland === fid && p.owner !== fid);

export function onConquest(state, pid, fid) {
  const p = state.provinces[pid];
  p.heldSince = monthIndex(state);
  if (p.homeland === fid) log(state, `${forceName(state, fid)} recovers its homeland of ${p.name}!`, 'major', [fid]);
}

export function onFall(state, fid) {
  for (const p of Object.values(state.provinces)) if (p.homeland === fid) p.homeland = null;
}

export function homelandMonthly(state) {
  const now = monthIndex(state);
  for (const p of Object.values(state.provinces)) {
    if (!p.owner || p.homeland === p.owner) continue;
    if (now - p.heldSince >= HOMELAND_MONTHS && p.order >= 50) {
      const old = p.homeland;
      p.homeland = p.owner;
      log(state, old
        ? `After long years, ${forceName(state, p.owner)} counts ${p.name} as homeland; ${forceName(state, old)}'s claim fades.`
        : `${forceName(state, p.owner)} now counts ${p.name} among its homeland.`, 'info', [p.owner, old].filter(Boolean));
    }
  }
}
