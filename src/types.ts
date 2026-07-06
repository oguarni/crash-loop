// Shared domain types for the crash-loop simulation and editor.

export type NodeKind = 'ingress' | 'load-balancer' | 'service' | 'gate' | 'cache' | 'queue';

/** Static, per-kind definition: cost, capacity, and editor metadata. */
export interface NodeSpec {
  kind: NodeKind;
  label: string;
  glyph: string;
  cpu: number;
  mem: number;
  cost: number; // dollars
  capacity: number; // requests routed/handled per tick (Infinity for ingress)
  // Fraction of throughput served locally (cache hits); the rest is forwarded
  // downstream as misses. Only defined for cache-kind nodes. Deterministic.
  hitRate?: number;
  buffer?: number;
  placeable: boolean; // can the player place this from the component rail?
  fanOut: boolean; // does it split throughput across outgoing edges?
  description: string;
}

/** A node instance placed on the board. */
export interface GameNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  bornAt?: number; // cosmetic: wall-clock ms when placed, drives the pop-in animation
}

/** A directed connection carrying request flow from one node to another. */
export interface Edge {
  id: string;
  from: string;
  to: string;
}

export interface Budgets {
  cpu: number;
  mem: number;
  cost: number;
}

/**
 * Seeded incident schedule for a chaos level (L05). Purely a function of `seed`:
 * for each window `[minStart, maxStart]` the RNG fixes one incident's start tick,
 * and a victim service is knocked out (capacity -> 0) for `duration` ticks. No
 * wall-clock, no live randomness — same seed always yields the same schedule.
 */
export interface ChaosSpec {
  seed: number;
  duration: number; // how many ticks each incident lasts
  windows: [number, number][]; // per-incident [minStart, maxStart] tick ranges
}

/** A complete, self-contained level definition. */
export interface LevelSpec {
  id: string;
  name: string;
  brief: string;
  objective: string;
  traffic: number[]; // per-tick arrival rate (length = run duration in ticks)
  errorBudget: number; // max total dropped requests allowed to still pass
  budgets: Budgets; // resource caps the topology must fit inside
  parCost: number; // cost target for the gold tier
  palette: NodeKind[]; // components the player may place
  initialNodes: GameNode[]; // pre-placed, fixed nodes (e.g. ingress)
  hint: string;
  // Node kinds that every path from ingress to a sink (service) must traverse.
  // e.g. ['gate'] forces all traffic through a deploy gate before production.
  requireBeforeSinks?: NodeKind[];
  chaos?: ChaosSpec;
  parCycles?: number;   // target for the latency axis (lower is better)
  parCoverage?: number; // target for the coverage axis (higher is better)
}

/** One simulated tick of traffic flowing through the topology. */
export interface SimTick {
  t: number;
  arrived: number;
  served: number;
  dropped: number;
  edgeLoad: Record<string, number>; // edge id -> requests carried this tick
  nodeInflow: Record<string, number>; // node id -> requests received this tick
  nodeOverload: Record<string, boolean>; // node id -> dropped traffic this tick
  downed?: string[];
  buffered?: Record<string, number>;
}

export interface SimResult {
  ok: boolean; // false if the topology is invalid (e.g. a cycle)
  error?: string;
  ticks: SimTick[];
  totalArrived: number;
  totalServed: number;
  totalDropped: number;
  totalLatency: number; // sum of request-ticks spent buffered in queues (cycles axis)
  coverage: number; // fraction of services sitting behind a CI gate (0..1)
}
