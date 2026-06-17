import type { LevelSpec } from '../types';

const RUN_TICKS = 30;
const ARRIVAL_RATE = 30;

// L01 "boot" — the tutorial. svc-cart is taking public traffic on a single
// replica and folding. Because ingress is a single entry point, the player must
// discover the load-balancer to fan traffic out across three service replicas.
//
//   solution:  ingress -> load-balancer -> 3x service
//   capacity:  3 services x 10 req/tick = 30 req/tick = exactly the arrival rate
//   cost:      $1.50 (lb) + 3 x $1.00 (svc) = $4.50  (== parCost, the gold tier)
//
// The $5.00 budget makes a 4th replica impossible, so LB + 3 services is the
// unique passing topology: a dominant correct strategy (Puzzle Solving).
export const L01: LevelSpec = {
  id: 'L01',
  name: 'boot',
  brief:
    'svc-cart takes public traffic on one replica and is folding under load. Bring capacity online before the error budget burns.',
  objective: 'Serve the incoming load. Keep dropped requests within the error budget and inside the resource budget.',
  traffic: Array.from({ length: RUN_TICKS }, () => ARRIVAL_RATE),
  errorBudget: 20,
  budgets: { cpu: 8, mem: 8, cost: 5.0 },
  parCost: 4.5,
  palette: ['load-balancer', 'service'],
  initialNodes: [{ id: 'ingress', kind: 'ingress', x: 300, y: 250 }],
  hint: 'One service handles 10 req/tick; traffic is 30. Route ingress through a load-balancer into three services.',
};
