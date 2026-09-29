// Seeded RNG (mulberry32). The seed lives in the game state so a saved game
// resumes with the same random stream.

export function rand(state) {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const chance = (state, p) => rand(state) < p;
export const randInt = (state, lo, hi) => lo + Math.floor(rand(state) * (hi - lo + 1));
export const randRange = (state, lo, hi) => lo + rand(state) * (hi - lo);
export const pick = (state, arr) => arr[Math.floor(rand(state) * arr.length)];

export function shuffle(state, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
