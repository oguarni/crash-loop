import type { LevelSpec } from '../types';

const RUN_TICKS = 30;
const ARRIVAL_RATE = 40;

// L02 "first deploy" — a new svc-cart release cuts over to production, but every
// request has to clear a canary deploy gate first (requireBeforeSinks: ['gate']).
// A gate forwards only 20 req/tick, so a single gate throttles the 40 req/tick of
// production traffic; the player runs two gates in parallel behind the
// load-balancer and balances the services evenly beneath them.
//
//   solution:  ingress -> load-balancer ─┬─> ci-gate ─┬─> service
//                                         │            └─> service
//                                         └─> ci-gate ─┬─> service
//                                                      └─> service
//   throughput: lb 40 -> 20/20 to gates -> 10/10 to services (cap 10) = 0 drops
//   cost:       $1.50 (lb) + 2 x $1.00 (gate) + 4 x $1.00 (svc) = $7.50 (== parCost)
//
// Three lessons, staged by the failures the player hits on the way:
//   1. ungated services are rejected   ("untested traffic reached production")
//   2. one gate (cap 20) can't carry 40 — the gate itself is the bottleneck
//   3. two balanced gates clear the cutover with zero drops, at minimum cost
//
// The $8.00 budget admits exactly the 7-node build (a third gate or fifth service
// would cost $8.50), so the gold topology is the unique dominant strategy.
export const L02: LevelSpec = {
  id: 'L02',
  name: 'first deploy',
  brief:
    'A new svc-cart release is cutting over to production. Every request must clear the canary deploy gate before it reaches a replica.',
  objective:
    'Route all traffic through a deploy gate into enough capacity to serve it, inside the error and resource budgets.',
  traffic: Array.from({ length: RUN_TICKS }, () => ARRIVAL_RATE),
  errorBudget: 40,
  budgets: { cpu: 8, mem: 8, cost: 8.0 },
  parCost: 7.5,
  palette: ['load-balancer', 'gate', 'service'],
  requireBeforeSinks: ['gate'],
  initialNodes: [{ id: 'ingress', kind: 'ingress', x: 280, y: 268 }],
  hint: 'Every service must sit behind a ci-gate, but a gate forwards only 20 req/tick. Fan the load-balancer out to two gates, two services each.',
};
