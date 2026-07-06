import type { LevelSpec } from '../types';

// L07 "black friday" — the finale. It stacks every mechanic the campaign taught
// into one topology, so all three scoring axes (cost / cycles / coverage) are
// live at once:
//
//   - CACHE  halves a heavy read load, so you provision for the misses, not the
//            full arrival rate (without it the downstream is unaffordable);
//   - QUEUE  soaks an 8-tick burst that would otherwise blow past the gate, then
//            bleeds the backlog off across the quiet ticks (this is the cycles
//            axis — request-ticks spent waiting);
//   - GATE   every replica must sit behind the canary gate (requireBeforeSinks),
//            which drives coverage to 100%;
//   - CHAOS  two seeded incidents knock a replica out mid-run, so — as in L05 —
//            you spread the load across enough replicas that losing one stays
//            inside the error budget.
//
//   gold:      ingress -> cache -> queue -> ci-gate -> 4x service   ($8.00)
//   flow:      arrival 32/56 -> cache serves ~half -> queue drains <=20/tick ->
//              gate forwards <=20 -> 4 replicas carry ~4-5 req/tick each. Losing
//              one to an incident sheds only its small share.
//   why each:  drop the cache and the queue backs up forever; drop the queue and
//              a single gate can't hold the burst; run 3 replicas and a crash
//              sheds too big a share to stay in budget.
//
// Measured against this exact seed (headless sim run, Phase 6 verification):
//   4 svc -> 45 dropped, $8.00, 768 cycles, 100% coverage -> GOLD
//   3 svc -> 60 dropped -> FAIL   |   2 svc -> 94 dropped -> FAIL
//   5 svc -> 37 dropped, $9.00 -> PASS (over par). errorBudget 52 sits cleanly
//   between the 4-replica (45) and 3-replica (60) builds.
//
// COORDINATION (Gabriel): please add an engine assertion covering this level —
// the 4-replica gold build must PASS at total cost $8.00 with the seed below,
// and the 3-replica build must FAIL. Numbers above are from a headless run of
// src/sim/engine against this spec.
const traffic = [
  ...Array<number>(12).fill(32), // steady read load
  ...Array<number>(8).fill(56), // the Black Friday burst
  ...Array<number>(20).fill(32), // recovery — the queue drains its backlog here
];

export const L07: LevelSpec = {
  id: 'L07',
  name: 'black friday',
  brief:
    'Peak sale traffic, a mid-event replica crash, and a burst on top. Cache the reads, buffer the spike, gate every replica, and survive the incident.',
  objective:
    'Serve the peak inside the error budget: cache the load, queue the burst, keep every replica behind the gate, and provision enough redundancy for the crash.',
  traffic,
  errorBudget: 52,
  budgets: { cpu: 10, mem: 12, cost: 9.0 },
  parCost: 8.0,
  parCycles: 768,
  parCoverage: 1,
  palette: ['cache', 'queue', 'gate', 'service'],
  requireBeforeSinks: ['gate'],
  initialNodes: [{ id: 'ingress', kind: 'ingress', x: 280, y: 270 }],
  chaos: { seed: 0x60de, duration: 5, windows: [[6, 11], [22, 27]] },
  hint: 'Chain ingress -> cache -> queue -> ci-gate -> four services. The cache halves the reads, the queue absorbs the burst, and four replicas keep a crash inside the error budget.',
};
