// Writes docs/officers.csv: every officer with stats, lifespan, where they
// start in the 190 scenario, and family / heir links.
// Usage: node scripts/export-officers.mjs
import { writeFileSync } from 'node:fs';
import { OFFICERS, FAMILIES, officerId } from '../src/data/officers.js';
import { SCENARIOS, RTK2_AUTO_JOIN, resolveAlias } from '../src/data/scenarios.js';
import { createGame } from '../src/engine/state.js';

const sc = SCENARIOS[0];
const state = createGame({ seed: 1 });
const rulerName = (fid) => state.officers[fid]?.name ?? '';
const familyOf = {};
FAMILIES.forEach((names) => names.forEach((n) => (familyOf[officerId(n)] = names[0])));
const heirOf = {};
for (const [rel, heirs] of Object.entries(RTK2_AUTO_JOIN)) for (const hname of heirs) heirOf[officerId(resolveAlias(hname))] = rel;
for (const [rel, heir] of sc.extraHeirs || []) heirOf[officerId(heir)] = rel;

const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const rows = [['id', 'name', 'int', 'war', 'cha', 'born', 'died', 'start_190', 'lord_190', 'province_190', 'debut_year', 'joins_relative', 'family_group']];
for (const o of OFFICERS) {
  const s = state.officers[o.id];
  const start = s.status === 'serving' ? 'serving' : s.status === 'free' ? 'free (searchable)' : s.debut ? 'appears later' : 'not placed';
  rows.push([
    o.id, o.name, o.int, o.war, o.cha, o.born, o.died, start,
    s.status === 'serving' ? rulerName(s.force) : '',
    s.province ? state.provinces[s.province].name : '',
    s.debut ?? '', heirOf[o.id] ?? '', familyOf[o.id] ?? '',
  ]);
}
writeFileSync(new URL('../docs/officers.csv', import.meta.url), rows.map((r) => r.map(esc).join(',')).join('\n') + '\n');
console.log(`Wrote ${rows.length - 1} officers to docs/officers.csv`);
