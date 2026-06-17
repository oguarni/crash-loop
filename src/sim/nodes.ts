import type { NodeKind, NodeSpec } from '../types';

// Per-kind definitions. Capacities and costs are deliberately small, whole
// numbers so the resource puzzle is legible at a glance.
export const NODE_SPECS: Record<NodeKind, NodeSpec> = {
  ingress: {
    kind: 'ingress',
    label: 'ingress',
    glyph: '>>',
    cpu: 0,
    mem: 0,
    cost: 0,
    capacity: Infinity,
    placeable: false,
    fanOut: true, // emits the level's arrival rate down a single edge
    description: 'Public entry point. Emits the level traffic.',
  },
  'load-balancer': {
    kind: 'load-balancer',
    label: 'load-balancer',
    glyph: '<=>',
    cpu: 1,
    mem: 1,
    cost: 1.5,
    capacity: 100,
    placeable: true,
    fanOut: true, // splits incoming requests evenly across every downstream node
    description: 'Splits traffic evenly across downstream nodes.',
  },
  service: {
    kind: 'service',
    label: 'service',
    glyph: '[]',
    cpu: 1,
    mem: 1,
    cost: 1.0,
    capacity: 10,
    placeable: true,
    fanOut: false, // a sink: handles up to capacity, drops the rest
    description: 'Handles up to 10 req/tick. Excess is dropped.',
  },
  gate: {
    kind: 'gate',
    label: 'ci-gate',
    glyph: '=|=',
    cpu: 1,
    mem: 1,
    cost: 1.0,
    capacity: 20,
    placeable: true,
    fanOut: true, // forwards up to capacity downstream — the canary throughput cap
    description: 'Canary deploy gate. Forwards up to 20 req/tick; all traffic must clear it.',
  },
};
