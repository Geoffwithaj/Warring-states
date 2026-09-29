// Province regions are Voronoi cells of the province seats, clipped to the map
// outline. Each polygon edge remembers which neighbouring seat produced it, so
// land adjacency falls out of the geometry for free.

const BORDER = -1;

// Sutherland–Hodgman clip of a tagged polygon against the half-plane n·p <= c.
// poly: [{p:[x,y], t}] where t tags the edge from this vertex to the next.
function clipHalfPlane(poly, n, c, tag) {
  const out = [];
  const inside = (p) => n[0] * p[0] + n[1] * p[1] <= c + 1e-9;
  const intersect = (a, b) => {
    const da = n[0] * a[0] + n[1] * a[1] - c;
    const db = n[0] * b[0] + n[1] * b[1] - c;
    const t = da / (da - db);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % poly.length];
    const ci = inside(cur.p);
    const ni = inside(nxt.p);
    if (ci && ni) out.push({ p: cur.p, t: cur.t });
    else if (ci && !ni) {
      out.push({ p: cur.p, t: cur.t });
      out.push({ p: intersect(cur.p, nxt.p), t: tag });
    } else if (!ci && ni) out.push({ p: intersect(cur.p, nxt.p), t: cur.t });
  }
  return out;
}

export function voronoiCells(sites, outline) {
  const base = outline.map((p) => ({ p, t: BORDER }));
  return sites.map((s, i) => {
    let poly = base;
    for (let j = 0; j < sites.length; j++) {
      if (j === i || poly.length === 0) continue;
      const o = sites[j];
      // Points closer to s than o: (o - s)·p <= (|o|² - |s|²) / 2
      const n = [o[0] - s[0], o[1] - s[1]];
      const c = (o[0] * o[0] + o[1] * o[1] - s[0] * s[0] - s[1] * s[1]) / 2;
      poly = clipHalfPlane(poly, n, c, j);
    }
    return poly;
  });
}

// Returns adjacency as a list of index pairs whose shared border is at least
// minLength long.
export function cellAdjacency(cells, minLength = 6) {
  const shared = new Map();
  cells.forEach((poly, i) => {
    for (let k = 0; k < poly.length; k++) {
      const { p, t } = poly[k];
      if (t === BORDER) continue;
      const q = poly[(k + 1) % poly.length].p;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const key = i < t ? `${i},${t}` : `${t},${i}`;
      shared.set(key, (shared.get(key) || 0) + len);
    }
  });
  const pairs = [];
  for (const [key, len] of shared) {
    // Each shared edge is counted once from either side.
    if (len / 2 >= minLength) pairs.push(key.split(',').map(Number));
  }
  return pairs;
}

export function polygonPath(poly) {
  return poly.map(({ p }, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + 'Z';
}
