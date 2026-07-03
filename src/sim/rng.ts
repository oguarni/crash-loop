// Tiny deterministic PRNG (mulberry32). The whole point is reproducibility:
// the same seed produces the same sequence in the browser, in Node, and in the
// sim-check harness — so a seeded incident schedule is identical everywhere and
// the "same topology + same seed = same result" pillar holds. No Math.random,
// no wall-clock: chaos is scheduled, not rolled live.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [minInclusive, maxInclusive], drawn from `rng`. */
export function randInt(rng: () => number, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}