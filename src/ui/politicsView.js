// What the player can see of the political world: lords' standing toward
// them, reputations, and the intelligence journal.

import { h } from './dom.js';
import { openModal } from './modal.js';
import { forceName, areAllied, monthIndex } from '../engine/state.js';
import {
  opinionOf, opinionParts, standingWord, canSeeStanding, trustOf, trustWord, inTruce,
} from '../engine/politics/index.js';

const signs = (v) => (v >= 12 ? '++' : v > 0 ? '+' : v <= -12 ? '−−' : '−');

// A lord's standing toward the viewer: a word, or "Unknown" for remote lords
// the viewer has had no dealings with lately.
export function standingText(state, viewer, fid) {
  if (!viewer || viewer === fid) return '—';
  return canSeeStanding(state, viewer, fid) ? standingWord(opinionOf(state, fid, viewer)) : 'Unknown';
}

export function standingBlock(state, viewer, fid) {
  const allied = areAllied(state, viewer, fid);
  const truce = inTruce(state, viewer, fid);
  const tags = [
    allied ? h('span', { class: 'tag gold' }, `Allied ${state.forces[viewer].alliances[fid] - monthIndex(state)} mo`) : null,
    truce ? h('span', { class: 'tag' }, 'Truce') : null,
  ];
  if (!canSeeStanding(state, viewer, fid)) {
    return h('div', {}, h('b', {}, 'Unknown'), ...tags,
      h('div', { class: 'hint' }, 'A distant lord. Send an envoy or an agent to learn how they regard you.'));
  }
  const reasons = opinionParts(state, fid, viewer).filter((p) => p.known && Math.abs(p.value) >= 1)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return h('div', {}, h('b', {}, standingWord(opinionOf(state, fid, viewer))), ...tags,
    reasons.length
      ? h('ul', { class: 'reasons' }, reasons.map((r) => h('li', { class: r.value > 0 ? 'good' : 'bad' }, `${signs(r.value)} ${r.label}`)))
      : h('div', { class: 'hint' }, 'No dealings of note.'),
    h('div', { class: 'hint' }, 'Their temperament may colour this in ways you cannot see.'));
}

export const reputationText = (state, fid) => trustWord(trustOf(state, fid));

export function showIntelReport(state, msg, entries) {
  openModal({
    title: 'Intelligence report',
    body: h('div', {}, h('p', {}, msg),
      entries.length ? h('ul', { class: 'intel' }, entries.map((e) => h('li', {}, e.text))) : null,
      entries.length ? h('p', { class: 'hint' }, 'Recorded in your intelligence journal (Menu → Intelligence).') : null),
  });
}

export function showIntelJournal(state, viewer) {
  const journal = [...(state.intel?.[viewer] || [])].reverse();
  const lords = [...new Set(journal.map((e) => e.about))];
  const now = monthIndex(state);
  const age = (e) => (now - e.at < 1 ? 'this month' : now - e.at < 12 ? `${now - e.at} mo ago` : `${Math.floor((now - e.at) / 12)} yr ago`);
  openModal({
    title: 'Intelligence', wide: true,
    body: journal.length
      ? h('div', { class: 'intel-journal' }, lords.map((fid) => h('div', { class: 'section' },
        h('h3', {}, forceName(state, fid), state.forces[fid].alive ? null : h('span', { class: 'tag' }, 'Fallen')),
        h('ul', { class: 'intel' }, journal.filter((e) => e.about === fid).map((e) => h('li', {}, e.text,
          h('span', { class: 'muted' }, ` — ${e.by}, ${age(e)}`)))))))
      : h('p', {}, 'No reports yet. Use Plots → Gather intelligence to send an agent to a lord’s court.'),
  });
}
