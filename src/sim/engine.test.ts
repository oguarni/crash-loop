import { describe, it, expect } from 'vitest';
import type { Edge, GameNode, NodeKind } from '../types';
import { simulate } from './engine';
import { NODE_SPECS } from './nodes';
import { L01 } from '../levels/L01';
import { L02 } from '../levels/L02';
import { L03 } from '../levels/L03';
import { L04 } from '../levels/L04';
import { L05 } from '../levels/L05';
import { L06 } from '../levels/L06';

// Board fixtures shared across the suites. Coordinates are irrelevant to the
// simulation (it reads the graph, not geometry), so every node sits at (0, 0).
const ingress: GameNode = { id: 'ingress', kind: 'ingress', x: 0, y: 0 };
const lb: GameNode = { id: 'lb', kind: 'load-balancer', x: 0, y: 0 };
const node = (kind: NodeKind) => (id: string): GameNode => ({ id, kind, x: 0, y: 0 });
const svc = node('service');
const gate = node('gate');
const cache = node('cache');
const queue = node('queue');
const edge = (from: string, to: string): Edge => ({ id: `${from}->${to}`, from, to });

// A short flat traffic profile for structural tests that don't need a level.
const flat = (rate: number, ticks: number) => Array.from({ length: ticks }, () => rate);

describe('L01 boot — fan-out through a load-balancer', () => {
  it('a single service drops the overflow and blows the error budget', () => {
    const r = simulate([ingress, svc('s1')], [edge('ingress', 's1')], L01.traffic);
    expect(r.ok).toBe(true);
    expect(r.totalDropped).toBe(20 * 30); // 30 in, 10 served, 20 dropped per tick
    expect(r.totalDropped).toBeGreaterThan(L01.errorBudget);
  });

  it('lb + 3 services serves everything with zero drops (the gold build)', () => {
    const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3')];
    const r = simulate(nodes, edges, L01.traffic);
    expect(r.totalDropped).toBe(0);
    expect(r.totalServed).toBe(r.totalArrived);
    expect(r.totalDropped).toBeLessThanOrEqual(L01.errorBudget);
  });

  it('lb + 2 services under-provisions and drops 10/tick', () => {
    const nodes = [ingress, lb, svc('s1'), svc('s2')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2')];
    const r = simulate(nodes, edges, L01.traffic);
    expect(r.totalDropped).toBe(10 * 30);
    expect(r.totalDropped).toBeGreaterThan(L01.errorBudget);
  });

  it('conserves flow: served + dropped === arrived', () => {
    const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3')];
    const r = simulate(nodes, edges, L01.traffic);
    expect(r.totalServed + r.totalDropped).toBe(r.totalArrived);
  });

  it('splits an indivisible load as evenly as possible', () => {
    // 40 across 3 services -> 14 / 13 / 13.
    const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3')];
    const r = simulate(nodes, edges, flat(40, 1));
    const first = r.ticks[0];
    expect(first.edgeLoad['lb->s1']).toBe(14);
    expect(first.edgeLoad['lb->s2']).toBe(13);
    expect(first.edgeLoad['lb->s3']).toBe(13);
  });
});

describe('topology validation', () => {
  it('rejects a cycle (the graph must be a DAG)', () => {
    const nodes = [ingress, svc('a'), svc('b')];
    const edges = [edge('ingress', 'a'), edge('a', 'b'), edge('b', 'a')];
    const r = simulate(nodes, edges, L01.traffic);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/acyclic|DAG/i);
  });

  it('rejects a topology with no ingress', () => {
    const r = simulate([svc('s1')], [], L01.traffic);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ingress/i);
  });

  it('ignores edges that reference a missing node', () => {
    // The dangling edge to 'ghost' must be dropped, leaving a valid lb -> svc run.
    const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3')];
    const edges = [
      edge('ingress', 'lb'),
      edge('lb', 's1'),
      edge('lb', 's2'),
      edge('lb', 's3'),
      edge('lb', 'ghost'),
    ];
    const r = simulate(nodes, edges, L01.traffic);
    expect(r.ok).toBe(true);
    expect(r.totalDropped).toBe(0);
  });

  it('drops routed traffic when a fan-out node has no downstream consumer', () => {
    // lb receives 30 but has nowhere to route it -> all 30/tick dropped.
    const r = simulate([ingress, lb], [edge('ingress', 'lb')], L01.traffic);
    expect(r.totalDropped).toBe(30 * 30);
    expect(r.totalServed).toBe(0);
  });
});

describe('L02 first deploy — the deploy-gate rule', () => {
  const gateRule = { requireBeforeSinks: L02.requireBeforeSinks };

  it('rejects ungated services (untested traffic reaching production)', () => {
    const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3'), svc('s4')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3'), edge('lb', 's4')];
    const r = simulate(nodes, edges, L02.traffic, gateRule);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/gate/i);
  });

  it('accepts a single gate but bottlenecks at its 20/tick cap', () => {
    const nodes = [ingress, lb, gate('g1'), svc('s1'), svc('s2'), svc('s3'), svc('s4')];
    const edges = [
      edge('ingress', 'lb'), edge('lb', 'g1'),
      edge('g1', 's1'), edge('g1', 's2'), edge('g1', 's3'), edge('g1', 's4'),
    ];
    const r = simulate(nodes, edges, L02.traffic, gateRule);
    expect(r.ok).toBe(true);
    expect(r.totalDropped).toBe(20 * 30);
    expect(r.totalDropped).toBeGreaterThan(L02.errorBudget);
  });

  it('clears the cutover with two balanced gates and forwards exactly the cap', () => {
    const nodes = [ingress, lb, gate('g1'), gate('g2'), svc('s1'), svc('s2'), svc('s3'), svc('s4')];
    const edges = [
      edge('ingress', 'lb'),
      edge('lb', 'g1'), edge('lb', 'g2'),
      edge('g1', 's1'), edge('g1', 's2'),
      edge('g2', 's3'), edge('g2', 's4'),
    ];
    const r = simulate(nodes, edges, L02.traffic, gateRule);
    expect(r.totalDropped).toBe(0);
    expect(r.totalServed).toBe(r.totalArrived);
    expect(r.ticks[0].edgeLoad['lb->g1']).toBe(20);
    expect(r.ticks[0].edgeLoad['g1->s1']).toBe(10);
  });

  it("par cost matches the gold build (guards against spec drift)", () => {
    const cost = NODE_SPECS['load-balancer'].cost + 2 * NODE_SPECS.gate.cost + 4 * NODE_SPECS.service.cost;
    expect(cost).toBeCloseTo(L02.parCost, 9);
  });
});

describe('L03 flapping cart — the cache node', () => {
  it('cache + 2 services serves everything and forwards only its misses', () => {
    const nodes = [ingress, cache('c'), svc('s1'), svc('s2')];
    const edges = [edge('ingress', 'c'), edge('c', 's1'), edge('c', 's2')];
    const r = simulate(nodes, edges, L03.traffic);
    expect(r.totalDropped).toBe(0);
    expect(r.totalServed).toBe(r.totalArrived);
    expect(r.ticks[0].edgeLoad['c->s1']).toBe(10);
    expect(r.ticks[0].edgeLoad['c->s2']).toBe(10);
  });

  it('cache + 1 service overloads the single replica with the misses', () => {
    const r = simulate([ingress, cache('c'), svc('s1')], [edge('ingress', 'c'), edge('c', 's1')], L03.traffic);
    expect(r.totalDropped).toBe(10 * 30);
    expect(r.totalDropped).toBeGreaterThan(L03.errorBudget);
  });

  it('chained caches compound and drop nothing', () => {
    const nodes = [ingress, cache('c1'), cache('c2'), svc('s1')];
    const edges = [edge('ingress', 'c1'), edge('c1', 'c2'), edge('c2', 's1')];
    const r = simulate(nodes, edges, L03.traffic);
    expect(r.totalDropped).toBe(0);
  });

  it('drops the misses when a cache is itself a sink (no downstream)', () => {
    // cache alone: serves 50% locally, but its misses have nowhere to go.
    const r = simulate([ingress, cache('c')], [edge('ingress', 'c')], flat(40, 1));
    expect(r.totalServed).toBe(20); // 40 * 0.5 hit rate
    expect(r.totalDropped).toBe(20); // the 20 misses are shed
  });

  it('drops the overflow beyond a cache capacity', () => {
    // 150 into a cache (cap 100): 50 shed at the door before the hit/miss split.
    const r = simulate([ingress, cache('c'), svc('s1')], [edge('ingress', 'c'), edge('c', 's1')], flat(150, 1));
    expect(r.ticks[0].nodeOverload['c']).toBe(true);
    expect(r.totalServed + r.totalDropped).toBe(r.totalArrived);
  });

  it('prices out the cacheless brute-force build', () => {
    const brute = NODE_SPECS['load-balancer'].cost + 4 * NODE_SPECS.service.cost;
    expect(brute).toBeGreaterThan(L03.budgets.cost);
    const gold = NODE_SPECS.cache.cost + 2 * NODE_SPECS.service.cost;
    expect(gold).toBeCloseTo(L03.parCost, 9);
  });
});

describe('L04 error budget — spend the budget instead of over-provisioning', () => {
  it('has a 700-request profile with a 5-tick spike', () => {
    const total = L04.traffic.reduce((a, b) => a + b, 0);
    const spikeTicks = L04.traffic.filter((x) => x === 40).length;
    expect(total).toBe(700);
    expect(spikeTicks).toBe(5);
  });

  it('lb + 2 services sheds exactly the spike (100) inside the budget', () => {
    const nodes = [ingress, lb, svc('s1'), svc('s2')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2')];
    const r = simulate(nodes, edges, L04.traffic);
    expect(r.totalDropped).toBe(100);
    expect(r.totalDropped).toBeLessThanOrEqual(L04.errorBudget);
    expect(r.totalServed).toBe(r.totalArrived - 100);
  });

  it('a safer lb + 3 services passes with fewer drops', () => {
    const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3')];
    const r = simulate(nodes, edges, L04.traffic);
    expect(r.totalDropped).toBe(50);
    expect(r.totalDropped).toBeLessThanOrEqual(L04.errorBudget);
  });

  it('under-provisioning (1 service) blows the error budget', () => {
    const r = simulate([ingress, lb, svc('s1')], [edge('ingress', 'lb'), edge('lb', 's1')], L04.traffic);
    expect(r.totalDropped).toBeGreaterThan(L04.errorBudget);
  });

  it('prices out the zero-drop build; par matches the gold build', () => {
    const zeroDrop = NODE_SPECS['load-balancer'].cost + 4 * NODE_SPECS.service.cost;
    expect(zeroDrop).toBeGreaterThan(L04.budgets.cost);
    const gold = NODE_SPECS['load-balancer'].cost + 2 * NODE_SPECS.service.cost;
    expect(gold).toBeCloseTo(L04.parCost, 9);
  });
});

describe('L05 chaos friday — seeded incident injection', () => {
  const chaosOpts = { chaos: L05.chaos };

  it('lb + 4 services survives two incidents inside the error budget', () => {
    const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3'), svc('s4')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3'), edge('lb', 's4')];
    const r = simulate(nodes, edges, L05.traffic, chaosOpts);
    expect(r.totalDropped).toBe(50);
    expect(r.totalDropped).toBeLessThanOrEqual(L05.errorBudget);
    expect(r.ticks.some((t) => (t.downed?.length ?? 0) > 0)).toBe(true);
  });

  it('under-provisioned builds cannot absorb a lost replica', () => {
    const three = simulate(
      [ingress, lb, svc('s1'), svc('s2'), svc('s3')],
      [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3')],
      L05.traffic, chaosOpts,
    );
    expect(three.totalDropped).toBeGreaterThan(L05.errorBudget);
    const two = simulate(
      [ingress, lb, svc('s1'), svc('s2')],
      [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2')],
      L05.traffic, chaosOpts,
    );
    expect(two.totalDropped).toBeGreaterThan(L05.errorBudget);
  });

  it('is deterministic: identical runs produce identical drops', () => {
    const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3'), svc('s4')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3'), edge('lb', 's4')];
    const a = simulate(nodes, edges, L05.traffic, chaosOpts).totalDropped;
    const b = simulate(nodes, edges, L05.traffic, chaosOpts).totalDropped;
    expect(a).toBe(b);
  });

  it('is robust to the seed: the symmetric gold build always drops 50', () => {
    const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3'), svc('s4')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3'), edge('lb', 's4')];
    for (const seed of [1, 42, 0x5eed, 0xc0ffee, 123456]) {
      const r = simulate(nodes, edges, L05.traffic, { chaos: { ...L05.chaos!, seed } });
      expect(r.totalDropped).toBe(50);
    }
  });

  it('with no chaos the same build drops nothing (isolates the incident effect)', () => {
    const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3'), svc('s4')];
    const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3'), edge('lb', 's4')];
    const r = simulate(nodes, edges, L05.traffic);
    expect(r.totalDropped).toBe(0);
    expect(r.ticks.every((t) => t.downed === undefined)).toBe(true);
  });

  it('schedules no incidents when there are no service sinks to victimise', () => {
    // A gate-only path has no true sink, so the seeded schedule is empty.
    const r = simulate([ingress, gate('g')], [edge('ingress', 'g')], L05.traffic, chaosOpts);
    expect(r.ticks.every((t) => t.downed === undefined)).toBe(true);
  });

  it('par cost matches the gold build', () => {
    const cost = NODE_SPECS['load-balancer'].cost + 4 * NODE_SPECS.service.cost;
    expect(cost).toBeCloseTo(L05.parCost, 9);
  });
});

describe('L06 back-pressure — the stateful queue node', () => {
  it('queue + 2 services buffers the spike (peak 100) and drains to zero', () => {
    const nodes = [ingress, queue('q'), svc('s1'), svc('s2')];
    const edges = [edge('ingress', 'q'), edge('q', 's1'), edge('q', 's2')];
    const r = simulate(nodes, edges, L06.traffic);
    expect(r.totalDropped).toBe(0);
    expect(r.totalServed).toBe(r.totalArrived);
    const peak = Math.max(...r.ticks.map((t) => t.buffered?.['q'] ?? 0));
    const end = r.ticks[r.ticks.length - 1].buffered?.['q'] ?? 0;
    expect(peak).toBe(100);
    expect(end).toBe(0);
    expect(r.totalLatency).toBeGreaterThan(0); // buffered request-ticks feed the cycles axis
  });

  it('queue + 1 service cannot keep up; leftover buffer counts as dropped', () => {
    const r = simulate([ingress, queue('q'), svc('s1')], [edge('ingress', 'q'), edge('q', 's1')], L06.traffic);
    expect(r.totalDropped).toBeGreaterThan(L06.errorBudget);
    expect(r.totalServed + r.totalDropped).toBe(r.totalArrived);
    const perTick = r.ticks.reduce((a, t) => a + t.dropped, 0);
    expect(perTick).toBe(r.totalDropped); // leftover is attributed to the final tick
  });

  it('sheds overflow when the buffer is full (back-pressure)', () => {
    // A sustained 200/tick swamps a drain of 20 and a depth of 100 -> overflow.
    const r = simulate([ingress, queue('q'), svc('s1'), svc('s2')], [edge('ingress', 'q'), edge('q', 's1'), edge('q', 's2')], flat(200, 10));
    expect(r.ticks.some((t) => t.nodeOverload['q'])).toBe(true);
    expect(r.totalServed + r.totalDropped).toBe(r.totalArrived);
  });

  it('drops the released traffic when a queue is a sink (no downstream)', () => {
    // A lone queue drains 20/tick but has nowhere to release it.
    const r = simulate([ingress, queue('q')], [edge('ingress', 'q')], flat(20, 5));
    expect(r.totalServed).toBe(0);
    expect(r.totalDropped).toBe(r.totalArrived);
  });

  it('prices out peak provisioning; par matches the gold build', () => {
    const peak = NODE_SPECS['load-balancer'].cost + 4 * NODE_SPECS.service.cost;
    expect(peak).toBeGreaterThan(L06.budgets.cost);
    const gold = NODE_SPECS.queue.cost + 2 * NODE_SPECS.service.cost;
    expect(gold).toBeCloseTo(L06.parCost, 9);
  });
});

describe('zero-flow robustness — dead-end nodes that receive no traffic', () => {
  it('processes disconnected sinks without inventing drops, and attributes leftover correctly', () => {
    // A live queue that overflows (leftover buffer at run end) sits alongside
    // dead-end nodes with no inbound edges: a cache, a queue, a load-balancer,
    // and a service, all receiving zero. None of them may drop phantom traffic,
    // and the empty dead queue must not be flagged when the live queue's
    // leftover is attributed.
    const nodes = [
      ingress, queue('qLive'), svc('sLive'),
      cache('cDead'), queue('qDead'), node('load-balancer')('lbDead'), svc('sDead'),
    ];
    const edges = [edge('ingress', 'qLive'), edge('qLive', 'sLive')];
    const r = simulate(nodes, edges, flat(30, 30)); // 30/tick overwhelms a 20 drain + 10 sink
    expect(r.ok).toBe(true);
    expect(r.totalServed + r.totalDropped).toBe(r.totalArrived); // conservation holds
    expect(r.totalDropped).toBeGreaterThan(0); // the live queue left a leftover buffer
    const last = r.ticks[r.ticks.length - 1];
    expect(last.nodeOverload['qLive']).toBe(true);
    expect(last.nodeOverload['qDead']).toBeUndefined(); // the empty dead queue is untouched
  });
});

describe('coverage axis — services behind a CI gate', () => {
  it('handles a diamond where a service is reachable by two paths', () => {
    // lb -> C directly and lb -> A -> C: the short path visits C first, so the
    // A -> C edge finds it already seen (the BFS revisit guard).
    const nodes = [ingress, lb, node('load-balancer')('A'), svc('C')];
    const edges = [edge('ingress', 'lb'), edge('lb', 'C'), edge('lb', 'A'), edge('A', 'C')];
    const r = simulate(nodes, edges, flat(10, 1));
    expect(r.ok).toBe(true);
    expect(r.coverage).toBe(0); // C is reachable without crossing a gate
  });

  it('is 1 when every service sits behind a gate', () => {
    const nodes = [ingress, gate('g'), svc('s1'), svc('s2')];
    const edges = [edge('ingress', 'g'), edge('g', 's1'), edge('g', 's2')];
    const r = simulate(nodes, edges, flat(10, 1));
    expect(r.coverage).toBe(1);
  });

  it('is 0 when a service is reachable without crossing a gate', () => {
    const r = simulate([ingress, svc('s1')], [edge('ingress', 's1')], flat(10, 1));
    expect(r.coverage).toBe(0);
  });

  it('is a fraction when only some services are gated', () => {
    // s1 is gated, s2 is exposed directly off the load-balancer -> 1 of 2 = 0.5.
    const nodes = [ingress, lb, gate('g'), svc('s1'), svc('s2')];
    const edges = [edge('ingress', 'lb'), edge('lb', 'g'), edge('g', 's1'), edge('lb', 's2')];
    const r = simulate(nodes, edges, flat(10, 1));
    expect(r.coverage).toBeCloseTo(0.5, 9);
  });

  it('is 0 when the topology has no service sinks at all', () => {
    const r = simulate([ingress, gate('g')], [edge('ingress', 'g')], flat(10, 1));
    expect(r.coverage).toBe(0);
  });
});
