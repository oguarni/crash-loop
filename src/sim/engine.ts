import type { Edge, GameNode, NodeKind, SimResult, SimTick } from '../types';
import { NODE_SPECS } from './nodes';

// The simulation is fully deterministic: same topology + same traffic profile
// always yields the same result. No randomness, no wall-clock — a design pillar.
// Each tick, the level's arrival rate is pushed from ingress and flows through
// the graph in topological order. Fan-out nodes (ingress, load-balancer) split
// throughput evenly across their outgoing edges; service nodes are sinks that
// handle up to their capacity and drop the overflow.

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

export function simulate(
  nodes: GameNode[],
  edges: Edge[],
  traffic: number[],
  opts: { requireBeforeSinks?: NodeKind[] } = {},
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

  const ticks: SimTick[] = [];
  let totalArrived = 0;
  let totalServed = 0;
  let totalDropped = 0;

  for (let t = 0; t < traffic.length; t++) {
    const arrival = traffic[t];
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

      if (spec.fanOut) {
        // ingress / load-balancer: route up to capacity, then split downstream.
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
        // service: a sink. Handle up to capacity, drop the overflow.
        const handled = Math.min(received, spec.capacity);
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
    ticks.push({ t, arrived: arrival, served, dropped, edgeLoad, nodeInflow, nodeOverload });
  }

  return { ok: true, ticks, totalArrived, totalServed, totalDropped };
}
