// The strategic map: province regions coloured by owner.

import { s, fmt } from './dom.js';
import { PROVINCES, OUTLINE, RIVERS, MAP_WIDTH, MAP_HEIGHT } from '../data/provinces.js';
import { CELLS } from '../engine/map.js';
import { polygonPath } from '../engine/geometry.js';
import { troopsIn, forceName, capitalOf, officersIn } from '../engine/state.js';

const UNCLAIMED = '#d9ceaa';

function mix(hex, amount) {
  // Blend a colour toward parchment so labels stay legible.
  const c = parseInt(hex.slice(1), 16);
  const p = [0xe8, 0xdc, 0xb8];
  const rgb = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v, i) => Math.round(v * amount + p[i] * (1 - amount)));
  return `rgb(${rgb.join(',')})`;
}

export function createMapView(container, { onSelect, onHover }) {
  const svg = s('svg', { viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`, preserveAspectRatio: 'xMidYMid meet' });
  const defs = s('defs', {},
    s('pattern', { id: 'waves', width: 24, height: 12, patternUnits: 'userSpaceOnUse' },
      s('path', { d: 'M0 6 Q6 2 12 6 T24 6', fill: 'none', stroke: '#2b4a70', 'stroke-width': 1 })));
  svg.append(defs);
  svg.append(s('rect', { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT, fill: 'url(#waves)' }));
  const land = s('g');
  const overlay = s('g');
  svg.append(land, s('path', { class: 'coast', d: 'M' + OUTLINE.map((p) => p.join(',')).join('L') + 'Z' }));
  for (const pts of Object.values(RIVERS)) {
    svg.append(s('polyline', { class: 'river', points: pts.map((p) => p.join(',')).join(' ') }));
  }
  svg.append(overlay);

  const paths = {};
  const labels = {};
  PROVINCES.forEach((p, i) => {
    const path = s('path', { class: 'prov', d: polygonPath(CELLS[i]), 'data-id': p.id });
    path.addEventListener('click', () => onSelect(p.id));
    path.addEventListener('mousemove', (e) => onHover?.(p.id, e));
    path.addEventListener('mouseleave', () => onHover?.(null));
    land.append(path);
    paths[p.id] = path;
    const seat = s('circle', { class: 'seat', cx: p.x, cy: p.y, r: 4 });
    const star = s('path', { class: 'capital-star', d: starPath(p.x, p.y - 1, 8, 3.5), visibility: 'hidden' });
    const name = s('text', { class: 'plabel', x: p.x, y: p.y - 9 }, p.name);
    const troops = s('text', { class: 'ptroops', x: p.x, y: p.y + 15 }, '');
    overlay.append(seat, star, name, troops);
    labels[p.id] = { seat, star, troops };
  });
  container.append(svg);

  function update(state, { selected, awaiting, pickable, humanForce } = {}) {
    const capitals = new Set(Object.values(state.forces).filter((f) => f.alive).map((f) => capitalOf(state, f.id)));
    for (const p of PROVINCES) {
      const prov = state.provinces[p.id];
      const color = prov.owner ? state.forces[prov.owner].color : null;
      const path = paths[p.id];
      path.setAttribute('fill', color ? mix(color, 0.62) : UNCLAIMED);
      path.classList.toggle('selected', p.id === selected);
      path.classList.toggle('awaiting', p.id === awaiting);
      path.classList.toggle('pickable', !!pickable && pickable.includes(p.id));
      path.classList.toggle('dim', !!pickable && !pickable.includes(p.id) && p.id !== selected);
      const l = labels[p.id];
      l.seat.setAttribute('fill', color || '#8a7d5a');
      l.star.setAttribute('visibility', capitals.has(p.id) ? 'visible' : 'hidden');
      const t = troopsIn(state, p.id);
      const officers = officersIn(state, p.id).length;
      const k = t >= 10000 ? Math.round(t / 1000) : (t / 1000).toFixed(1);
      l.troops.textContent = prov.owner ? `${k}k${officers ? '' : ' ∅'}` : '';
      l.troops.setAttribute('font-weight', prov.owner === humanForce ? 'bold' : 'normal');
    }
  }

  return { update, svg };
}

function starPath(cx, cy, R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad).toFixed(1)}`;
  }
  return d + 'Z';
}

export function provinceTooltip(state, pid) {
  const p = state.provinces[pid];
  const lines = [`<b>${p.name}</b>`, p.owner ? `${forceName(state, p.owner)}` : '<i>Unclaimed</i>'];
  if (p.owner) lines.push(`Troops ${fmt(troopsIn(state, pid))} · Officers ${officersIn(state, pid).length}`);
  lines.push(`Pop ${fmt(p.pop)} · Walls ${p.walls}`);
  return lines.join('<br>');
}
