// Seeded random numbers (mulberry32) plus the value-noise field the terrain is
// built from. Same seed, same islands, same course — every screenshot and every
// playthrough starts from the same Aurelia.
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(min, max) {
      return min + (max - min) * next();
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
  };
}

function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in [0, 1]. */
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const u = smooth(fx);
  const v = smooth(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise: 4 octaves of value noise, still in [0, 1]. */
export function fbmNoise(x, z, seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += amp * valueNoise(x * freq, z * freq, seed + octave * 101);
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum;
}
