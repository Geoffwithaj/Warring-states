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
  const svg = s('svg', { class: 'strategic', viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`, preserveAspectRatio: 'xMidYMid meet' });
  const defs = s('defs', {},
    s('pattern', { id: 'waves', width: 24, height: 12, patternUnits: 'userSpaceOnUse' },
      s('path', { d: 'M0 6 Q6 2 12 6 T24 6', fill: 'none', stroke: '#2b4a70', 'stroke-width': 1 })),
    s('marker', { id: 'arrowhead', viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' },
      s('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#fff4d0' })));
  svg.append(defs);
  svg.append(s('rect', { x: -2000, y: -2000, width: MAP_WIDTH + 4000, height: MAP_HEIGHT + 4000, fill: 'url(#waves)' }));
  const land = s('g');
  const overlay = s('g');
  svg.append(land, s('path', { class: 'coast', d: 'M' + OUTLINE.map((p) => p.join(',')).join('L') + 'Z' }));
  for (const pts of Object.values(RIVERS)) {
    svg.append(s('polyline', { class: 'river', points: pts.map((p) => p.join(',')).join(' ') }));
  }
  svg.append(overlay);
  const fx = s('g', { class: 'fx' });
  svg.append(fx);

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
  const view = attachZoom(svg);

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

  // Playback effects: an arrow from one province to another, a pulse on one.
  function showArrow(from, to, color = '#fff4d0') {
    clearFx();
    const a = PROVINCES.find((p) => p.id === from);
    const b = PROVINCES.find((p) => p.id === to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const trim = 12;
    fx.append(
      s('circle', { class: 'fx-pulse', cx: b.x, cy: b.y, r: 22, stroke: color }),
      s('line', {
        class: 'fx-arrow', x1: a.x + (dx / len) * trim, y1: a.y + (dy / len) * trim,
        x2: b.x - (dx / len) * trim, y2: b.y - (dy / len) * trim, 'marker-end': 'url(#arrowhead)',
      }));
  }
  function pulse(pid, color = '#fff4d0') {
    clearFx();
    const p = PROVINCES.find((q) => q.id === pid);
    fx.append(s('circle', { class: 'fx-pulse', cx: p.x, cy: p.y, r: 22, stroke: color }));
  }
  function clearFx() {
    fx.replaceChildren();
  }

  return { update, svg, showArrow, pulse, clearFx, ...view };
}

// Pinch/drag/wheel zoom by rewriting the viewBox. A drag never counts as a tap.
function attachZoom(svg) {
  const full = { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT };
  let vb = { ...full };
  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const clampVb = () => {
    vb.w = Math.min(full.w, Math.max(full.w / 6, vb.w));
    vb.h = vb.w * (full.h / full.w);
    vb.x = Math.min(full.w - vb.w * 0.3, Math.max(-vb.w * 0.7, vb.x));
    vb.y = Math.min(full.h - vb.h * 0.3, Math.max(-vb.h * 0.7, vb.y));
    if (vb.w >= full.w) vb = { ...full };
  };
  const unitsPerPx = () => {
    const r = svg.getBoundingClientRect();
    return Math.max(vb.w / r.width, vb.h / r.height);
  };
  const toSvg = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    const k = unitsPerPx();
    const offX = (r.width * k - vb.w) / 2;
    const offY = (r.height * k - vb.h) / 2;
    return [vb.x - offX + (cx - r.left) * k, vb.y - offY + (cy - r.top) * k];
  };
  const zoomAt = (factor, cx, cy) => {
    const [px, py] = toSvg(cx, cy);
    const w = vb.w / factor;
    const nw = Math.min(full.w, Math.max(full.w / 6, w));
    const f = vb.w / nw;
    vb.x = px - (px - vb.x) / f;
    vb.y = py - (py - vb.y) / f;
    vb.w = nw;
    clampVb();
    apply();
  };

  const pts = new Map();
  let dragged = false;
  let pinchDist = 0;
  svg.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pts.size === 1) dragged = false;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) {
      if (!dragged && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8) return;
      if (!dragged) svg.setPointerCapture?.(e.pointerId);
      dragged = true;
      const k = unitsPerPx();
      vb.x -= (e.clientX - p.x) * k;
      vb.y -= (e.clientY - p.y) * k;
      clampVb();
      apply();
    } else if (pts.size === 2) {
      dragged = true;
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) zoomAt(d / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchDist = d;
      return;
    }
    p.x = e.clientX;
    p.y = e.clientY;
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    pinchDist = 0;
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('click', (e) => {
    if (dragged) {
      e.stopPropagation();
      e.preventDefault();
      dragged = false;
    }
  }, true);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY);
  }, { passive: false });

  return {
    zoomIn: () => { const r = svg.getBoundingClientRect(); zoomAt(1.4, r.left + r.width / 2, r.top + r.height / 2); },
    zoomOut: () => { const r = svg.getBoundingClientRect(); zoomAt(1 / 1.4, r.left + r.width / 2, r.top + r.height / 2); },
    resetZoom: () => { vb = { ...full }; apply(); },
    isZoomed: () => vb.w < full.w,
    // Centre on a province, zooming in to at least `zoom` (1 = whole map).
    focus: (pid, zoom = 1) => {
      const p = PROVINCES.find((q) => q.id === pid);
      if (!p) return;
      const w = Math.min(vb.w, full.w / zoom);
      if (w >= full.w && vb.w >= full.w) return;
      vb.w = w;
      vb.h = w * (full.h / full.w);
      vb.x = p.x - vb.w / 2;
      vb.y = p.y - vb.h / 2;
      clampVb();
      apply();
    },
  };
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
