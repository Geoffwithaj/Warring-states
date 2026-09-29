// Static map topology: province regions and land adjacency.

import { PROVINCES, OUTLINE } from '../data/provinces.js';
import { voronoiCells, cellAdjacency } from './geometry.js';

// Borders the Voronoi geometry produces that make no geographic sense
// (across the Ordos desert, the Taihang range, the Tibetan plateau, ...).
const CUT = [
  ['dai', 'wuwei'], ['nanpi', 'dai'], ['nanpi', 'jinyang'], ['xiliang', 'chengdu'],
  ['hongnong', 'xiangyang'], ['lujiang', 'kuaiji'],
];

export const PROVINCE_INDEX = Object.fromEntries(PROVINCES.map((p, i) => [p.id, i]));
export const PROVINCE_BY_ID = Object.fromEntries(PROVINCES.map((p) => [p.id, p]));

export const CELLS = voronoiCells(PROVINCES.map((p) => [p.x, p.y]), OUTLINE);

export const ADJACENT = (() => {
  const adj = Object.fromEntries(PROVINCES.map((p) => [p.id, []]));
  const cut = new Set(CUT.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  for (const [i, j] of cellAdjacency(CELLS, 6)) {
    const a = PROVINCES[i].id;
    const b = PROVINCES[j].id;
    if (cut.has(`${a}|${b}`)) continue;
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
})();

export const isAdjacent = (a, b) => ADJACENT[a].includes(b);

// Hop distance from every province to the nearest province in `targets`.
export function distanceMap(targets) {
  const dist = {};
  const queue = [...targets];
  for (const t of targets) dist[t] = 0;
  while (queue.length) {
    const cur = queue.shift();
    for (const n of ADJACENT[cur]) {
      if (dist[n] === undefined) {
        dist[n] = dist[cur] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}
