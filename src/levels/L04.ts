import type { LevelSpec } from '../types';

const RUN_TICKS = 30;
const BASE_RATE = 20;
const PEAK_RATE = 40;

// L04 "error budget" — the level that flips the lesson. Until now the goal was
// zero drops; here the goal is to stay *within* the error budget, because
// serving the peak is deliberately unaffordable. Traffic sits at a steady 20
// req/tick, spikes to 40 for five ticks (t=12..16), then settles back to 20.
//
//   gold:      ingress -> load-balancer -> 2x service   ($3.50)
//   steady:    2 services (cap 20) serve the 20 req/tick base with zero drops
//   spike:     during the 40-req ticks the two services shed 20/tick -> 100
//              dropped total, which sits inside the 120 error budget
//   cost:      $1.50 (lb) + 2 x $1.00 (svc) = $3.50  (== parCost, gold)
//
// The $5.00 budget makes the zero-drop build impossible (lb + 4 services = $5.50),
// so the player cannot buy their way out of the spike — they must trust the error
// budget and let the overflow drop. A safer lb + 3 services ($4.50) passes with
// only 50 drops but misses gold, giving a clear cost/reliability gradient.
//
// Cache is intentionally left out of the palette: cache + 2 services would kill
// the spike at $3.00 with zero drops and dissolve the whole lesson.
export const L04: LevelSpec = {
  id: 'L04',
  name: 'error budget',
  brief:
    'A traffic spike is inbound and the budget is tight. You cannot afford to serve every request — spend the error budget instead of overspending on capacity.',
  objective: 'Keep total dropped requests within the error budget through the spike, inside a tighter resource budget.',
  traffic: Array.from({ length: RUN_TICKS }, (_, t) => (t >= 12 && t <= 16 ? PEAK_RATE : BASE_RATE)),
  errorBudget: 120,
  budgets: { cpu: 6, mem: 6, cost: 5.0 },
  parCost: 3.5,
  palette: ['load-balancer', 'service'],
  initialNodes: [{ id: 'ingress', kind: 'ingress', x: 300, y: 250 }],
  hint: 'Steady load is 20 req/tick; the spike hits 40. Provision for the steady rate (lb + two services) and let the error budget absorb the spike — serving the peak is priced out.',
};