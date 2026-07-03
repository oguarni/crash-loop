import type { LevelSpec } from '../types';

const RUN_TICKS = 30;
const ARRIVAL_RATE = 20;

// L05 "chaos friday" — the campaign boss. Traffic is a steady 20 req/tick, but a
// seeded schedule crashes service replicas mid-run (two incidents, five ticks
// each, one replica knocked out at a time). The lesson is resilience: provision
// enough redundancy that losing a replica still fits inside the error budget.
//
//   gold:      ingress -> load-balancer -> 4x service   ($5.50)
//   why 4:     the lb splits 20 evenly, so each replica carries 5 req/tick. When
//              one crashes, only its 5/tick are shed; across 2 x 5-tick incidents
//              that is 50 dropped, inside the 55 error budget.
//   3 svc:     shares ~7/tick — a crash sheds ~7/tick -> 70 dropped -> FAIL
//   2 svc:     shares 10/tick -> a crash sheds 10/tick -> 100 dropped -> FAIL
//   5 svc:     safer (40 dropped) but $6.50 — a valid PASS, not gold
//
// Because the gold build is symmetric, *which* replica the seed picks never
// changes the outcome (every replica carries the same 5/tick), so the result is
// robustly deterministic: same topology + same seed = same run, every time.
//
// The incident schedule lives entirely in the seed; the player cannot see the
// exact timing and must build for the failure rather than around it.
export const L05: LevelSpec = {
  id: 'L05',
  name: 'chaos friday',
  brief:
    "It's Friday and chaos is loose: replicas will crash without warning mid-run. Build so that losing one doesn't take down the service.",
  objective: 'Survive the seeded incidents — keep total dropped requests within the error budget despite replicas crashing.',
  traffic: Array.from({ length: RUN_TICKS }, () => ARRIVAL_RATE),
  errorBudget: 55,
  budgets: { cpu: 8, mem: 8, cost: 7.0 },
  parCost: 5.5,
  palette: ['load-balancer', 'service'],
  initialNodes: [{ id: 'ingress', kind: 'ingress', x: 300, y: 250 }],
  chaos: { seed: 0x5eed, duration: 5, windows: [[4, 9], [17, 22]] },
  hint: 'A replica will crash mid-run and drop its whole share until it recovers. Spread the 20 req/tick across enough replicas (four) that losing one stays within the error budget.',
};