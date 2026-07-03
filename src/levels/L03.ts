import type { LevelSpec } from '../types';

const RUN_TICKS = 30;
const ARRIVAL_RATE = 40;

// L03 "flapping cart" — svc-cart is flapping under a storm of repeated reads.
// Brute force (fan out to more replicas) is priced out; the lesson is that a
// cache absorbing the repeated reads is what keeps the service under capacity.
//
//   solution:  ingress -> cache -> 2x service
//   flow:      cache takes 40, serves 20 hits locally, forwards 20 misses,
//              split 10/10 into two services (cap 10 each) -> 0 drops
//   cost:      $1.00 (cache) + 2 x $1.00 (svc) = $3.00  (== parCost, gold)
//
// The $4.50 budget rules out the cacheless build (lb + 4 services = $5.50), so
// the player must reach for the cache. A chained cache -> cache -> 1 service is
// an equally-cheap alternative that teaches caching compounds.
export const L03: LevelSpec = {
  id: 'L03',
  name: 'flapping cart',
  brief:
    'svc-cart is flapping under a flood of repeated reads. Adding replicas is priced out — absorb the reads before they hit the service.',
  objective: 'Serve the load within the error budget by caching the repeated reads, inside the resource budget.',
  traffic: Array.from({ length: RUN_TICKS }, () => ARRIVAL_RATE),
  errorBudget: 40,
  budgets: { cpu: 6, mem: 6, cost: 4.5 },
  parCost: 3.0,
  palette: ['load-balancer', 'cache', 'service'],
  initialNodes: [{ id: 'ingress', kind: 'ingress', x: 300, y: 250 }],
  hint: 'A cache serves ~half the reads and forwards the rest. Route ingress -> cache -> two services.',
};