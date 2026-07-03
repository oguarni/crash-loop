import type { LevelSpec } from '../types';

const RUN_TICKS = 30;
const BASE_RATE = 10;
const PEAK_RATE = 40;

// L06 "back-pressure" — the queue node. This is the counterpoint to L04: instead
// of dropping a spike, you *buffer* it and drain it over the calmer ticks, so a
// small downstream serves everything without provisioning for the peak. Traffic
// sits at a steady 10 req/tick, spikes to 40 for five ticks (t=10..14), then
// settles back to 10 — leaving room for the queue to drain.
//
//   gold:      ingress -> queue -> 2x service   ($4.00)
//   why:       the queue drains 20 req/tick. During the spike it releases 20 and
//              buffers the surplus (peaking at 100, exactly its depth); over the
//              calm tail it drains that buffer back to zero. Two services (cap 20)
//              match the drain rate, so nothing is dropped.
//   cost:      $2.00 (queue) + 2 x $1.00 (svc) = $4.00  (== parCost, gold)
//
// The $5.00 budget rules out provisioning for the peak (lb + 4 services = $5.50),
// and an error budget of 20 means a partial build won't do — you must buffer the
// spike, not shed it. A queue with only one downstream service can't keep up with
// its own 20/tick drain and fails.
//
// The queue is the only stateful node: its buffer carries across ticks. Requests
// still buffered when the run ends count as dropped, so you must drain in time.
export const L06: LevelSpec = {
  id: 'L06',
  name: 'back-pressure',
  brief:
    'A burst is coming and provisioning for the peak is priced out. Put a queue in front to soak up the spike and drain it once the storm passes.',
  objective: 'Buffer the spike and serve it within the error budget, using a queue instead of peak capacity.',
  traffic: Array.from({ length: RUN_TICKS }, (_, t) => (t >= 10 && t <= 14 ? PEAK_RATE : BASE_RATE)),
  errorBudget: 20,
  budgets: { cpu: 6, mem: 6, cost: 5.0 },
  parCost: 4.0,
  palette: ['load-balancer', 'queue', 'service'],
  initialNodes: [{ id: 'ingress', kind: 'ingress', x: 300, y: 250 }],
  hint: 'A queue drains 20 req/tick and holds the rest. Route ingress -> queue -> two services: the queue soaks the 40-req spike and drains it over the quiet ticks.',
};