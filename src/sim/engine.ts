import type { ChaosSpec, Edge, GameNode, NodeKind, SimResult, SimTick } from '../types';
import { NODE_SPECS } from './nodes';
import { makeRng, randInt } from './rng';

// The simulation is fully deterministic: same topology + same traffic profile
// (and, for chaos levels, the same seed) always yields the same result. No live
// randomness, no wall-clock — a design pillar. Each tick, the level's arrival
// rate is pushed from ingress and flows through the graph in topological order.
// Fan-out nodes (ingress, load-balancer, gate) split throughput evenly across
// their outgoing edges; cache nodes serve a fixed fraction locally and forward
// the misses; service nodes are sinks that handle up to their capacity and drop
// the overflow. On chaos levels, a seeded schedule knocks out individual service
// nodes for a window of ticks (capacity -> 0), simulating a mid-run incident.

interface Graph {
  nodes: Map<string, GameNode>;
  outgoing: Map<string, Edge[]>;
  incoming: Map<string, Edge[]>;
}

function buildGraph(nodes: GameNode[], edges: Edge[]): Graph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n] as const));
  const outgoing = new Map<string, Edge[]>();
  const incoming = new Map<string, Edge[]>();
  for (const n of nodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }
  for (const e of edges) {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) continue;
    outgoing.get(e.from)!.push(e);
    incoming.get(e.to)!.push(e);
  }
  return { nodes: nodeMap, outgoing, incoming };
}

/** Kahn's algorithm. Returns a topological order, or null if a cycle exists. */
function topoOrder(graph: Graph): string[] | null {
  const indeg = new Map<string, number>();
  for (const id of graph.nodes.keys()) {
    indeg.set(id, graph.incoming.get(id)!.length);
  }
  const queue: string[] = [];
  for (const [id, deg] of indeg) {
    if (deg === 0) queue.push(id);
  }
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of graph.outgoing.get(id)!) {
      const next = indeg.get(e.to)! - 1;
      indeg.set(e.to, next);
      if (next === 0) queue.push(e.to);
    }
  }
  return order.length === graph.nodes.size ? order : null;
}

/** Split `total` integer requests as evenly as possible across `n` edges. */
function splitEven(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const shares: number[] = [];
  for (let i = 0; i < n; i++) {
    shares.push(base + (i < remainder ? 1 : 0));
  }
  return shares;
}

function fail(error: string): SimResult {
  return { ok: false, error, ticks: [], totalArrived: 0, totalServed: 0, totalDropped: 0 };
}

/**
 * BFS from ingress that refuses to traverse `blockKinds` nodes. If it can still
 * reach a sink (a non-fan-out node, e.g. a service), some traffic reaches that
 * sink without passing a required intermediary — an invalid topology.
 *
 * NOTE: a cache is fanOut:true, so it is not treated as a sink here even though
 * it serves some traffic locally. That is fine for the current levels; if a
 * future level ever combines requireBeforeSinks with a cache, revisit this so
 * cache hits before the required gate are not silently allowed.
 */
function sinkReachableWithout(graph: Graph, ingressId: string, blockKinds: Set<NodeKind>): boolean {
  const visited = new Set<string>();
  const queue: string[] = [ingressId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!NODE_SPECS[graph.nodes.get(id)!.kind].fanOut) return true;
    for (const e of graph.outgoing.get(id)!) {
      const next = graph.nodes.get(e.to);
      if (next && !blockKinds.has(next.kind) && !visited.has(e.to)) queue.push(e.to);
    }
  }
  return false;
}

/**
 * Build the incident schedule from the seed. Each window is a [minStart,maxStart]
 * tick range for one incident; within it the seeded RNG fixes the exact start
 * tick and the victim service, which is knocked out for `duration` ticks. The
 * RNG is consumed in a fixed order (start, then victim, per incident), so the
 * schedule is a pure function of the seed and the service set. Returns a
 * tick -> Set(downed service ids) map.
 */
function buildIncidentSchedule(order: string[], graph: Graph, traffic: number[], chaos: ChaosSpec): Map<number, Set<string>> {
  const downAt = new Map<number, Set<string>>();
  const sinks = order.filter((id) => {
    const spec = NODE_SPECS[graph.nodes.get(id)!.kind];
    return !spec.fanOut && spec.hitRate == null; // true sinks: service nodes
  });
  if (sinks.length === 0) return downAt;

  const rng = makeRng(chaos.seed);
  // Deterministic Fisher-Yates shuffle of the victims, so successive incidents
  // hit *distinct* replicas instead of each re-rolling independently (which can
  // cluster on one node and read as non-random). Incident k takes the k-th
  // shuffled replica, cycling if there are more incidents than replicas.
  const victims = [...sinks];
  for (let i = victims.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [victims[i], victims[j]] = [victims[j], victims[i]];
  }
  chaos.windows.forEach((window, k) => {
    const start = randInt(rng, window[0], window[1]);
    const victim = victims[k % victims.length];
    for (let t = start; t < Math.min(start + chaos.duration, traffic.length); t++) {
      if (!downAt.has(t)) downAt.set(t, new Set());
      downAt.get(t)!.add(victim);
    }
  });
  return downAt;
}

export function simulate(
  nodes: GameNode[],
  edges: Edge[],
  traffic: number[],
  opts: { requireBeforeSinks?: NodeKind[]; chaos?: ChaosSpec } = {},
): SimResult {
  const graph = buildGraph(nodes, edges);
  const order = topoOrder(graph);
  if (!order) {
    return fail('Cycle detected — a traffic graph must be acyclic (a DAG).');
  }
  const ingress = nodes.find((n) => n.kind === 'ingress');
  if (!ingress) {
    return fail('No ingress in the topology.');
  }

  const required = opts.requireBeforeSinks;
  if (required && required.length > 0 && sinkReachableWithout(graph, ingress.id, new Set(required))) {
    return fail('Untested traffic reached production — every service must sit behind a deploy gate.');
  }

  // Precompute the seeded incident schedule once, before the tick loop, so it is
  // independent of per-tick processing and fully reproducible.
  const downAt = opts.chaos ? buildIncidentSchedule(order, graph, traffic, opts.chaos) : null;

  const ticks: SimTick[] = [];
  let totalArrived = 0;
  let totalServed = 0;
  let totalDropped = 0;

  for (let t = 0; t < traffic.length; t++) {
    const arrival = traffic[t];
    const down = downAt ? downAt.get(t) : undefined;
    const inflow = new Map<string, number>();
    for (const id of graph.nodes.keys()) inflow.set(id, 0);
    inflow.set(ingress.id, arrival);

    const edgeLoad: Record<string, number> = {};
    const nodeInflow: Record<string, number> = {};
    const nodeOverload: Record<string, boolean> = {};
    let served = 0;
    let dropped = 0;

    for (const id of order) {
      const node = graph.nodes.get(id)!;
      const spec = NODE_SPECS[node.kind];
      const received = inflow.get(id)!;
      const outs = graph.outgoing.get(id)!;
      nodeInflow[id] = received;

      if (spec.hitRate != null) {
        // cache: serve a deterministic fraction of throughput locally (hits),
        // forward the misses downstream. Overflow beyond capacity is dropped.
        const throughput = Math.min(received, spec.capacity);
        const overCapacity = received - throughput;
        if (overCapacity > 0) {
          dropped += overCapacity;
          nodeOverload[id] = true;
        }
        const hits = Math.floor(throughput * spec.hitRate);
        const misses = throughput - hits;
        served += hits;
        if (outs.length === 0) {
          if (misses > 0) {
            dropped += misses;
            nodeOverload[id] = true;
          }
        } else {
          const shares = splitEven(misses, outs.length);
          outs.forEach((e, i) => {
            edgeLoad[e.id] = shares[i];
            inflow.set(e.to, inflow.get(e.to)! + shares[i]);
          });
        }
      } else if (spec.fanOut) {
        // ingress / load-balancer / gate: route up to capacity, then split.
        const throughput = Math.min(received, spec.capacity);
        const overCapacity = received - throughput; // exceeded this node's limit
        if (overCapacity > 0) {
          dropped += overCapacity;
          nodeOverload[id] = true;
        }
        if (outs.length === 0) {
          // No downstream consumer: routed traffic has nowhere to go.
          if (throughput > 0) {
            dropped += throughput;
            nodeOverload[id] = true;
          }
        } else {
          const shares = splitEven(throughput, outs.length);
          outs.forEach((e, i) => {
            edgeLoad[e.id] = shares[i];
            inflow.set(e.to, inflow.get(e.to)! + shares[i]);
          });
        }
      } else {
        // service: a sink. Handle up to capacity, drop the overflow. During a
        // seeded incident the node is down (capacity 0) and sheds everything.
        const capacity = down && down.has(id) ? 0 : spec.capacity;
        const handled = Math.min(received, capacity);
        const overflow = received - handled;
        served += handled;
        if (overflow > 0) {
          dropped += overflow;
          nodeOverload[id] = true;
        }
      }
    }

    totalArrived += arrival;
    totalServed += served;
    totalDropped += dropped;
    ticks.push({
      t,
      arrived: arrival,
      served,
      dropped,
      edgeLoad,
      nodeInflow,
      nodeOverload,
      downed: down ? [...down] : undefined,
    });
  }

  return { ok: true, ticks, totalArrived, totalServed, totalDropped };
}