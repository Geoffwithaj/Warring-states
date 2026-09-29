// What happens when a ruler dies, is executed, or a force loses its last province.

import { officersOf, provincesOf, forceName, log, isFamily, officerList } from './state.js';

export function handleRulerLoss(state, fid) {
  const f = state.forces[fid];
  if (!f || !f.alive) return;
  const old = state.officers[f.ruler];
  const heirs = officersOf(state, fid).filter((o) => o.id !== old.id);
  if (!heirs.length || !provincesOf(state, fid).length) {
    eliminateForce(state, fid);
    return;
  }
  const score = (o) => o.cha + (o.int + o.war) / 4 + (isFamily(o, old) ? 80 : 0) + o.loyalty / 5;
  const heir = heirs.reduce((a, b) => (score(a) >= score(b) ? a : b));
  const oldName = old.name;
  f.ruler = heir.id;
  heir.loyalty = 100;
  // A change of lord shakes the loyalty of those who served the old one.
  for (const o of heirs) {
    if (o.id !== heir.id && !isFamily(o, heir)) o.loyalty = Math.max(0, o.loyalty - 10);
  }
  log(state, `${heir.name} succeeds ${oldName} as lord.`, 'major', [fid]);
}

export function eliminateForce(state, fid) {
  const f = state.forces[fid];
  if (!f.alive) return;
  f.alive = false;
  for (const p of provincesOf(state, fid)) {
    p.owner = null;
    p.governor = null;
    p.delegate = null;
  }
  for (const o of officerList(state)) {
    if (o.status === 'serving' && o.force === fid) {
      o.status = 'free';
      o.force = null;
      o.troops = 0;
      o.task = null;
      o.wander = true;
    }
    if (o.prevForce === fid) o.prevForce = null;
  }
  for (const other of Object.values(state.forces)) {
    delete other.alliances[fid];
  }
  log(state, `The house of ${forceName(state, fid)} has fallen.`, 'major');
}
