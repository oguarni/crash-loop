import type { ChaosSpec, Edge, GameNode, NodeKind, SimResult, SimTick } from '../types';
import { NODE_SPECS } from './nodes';
import { makeRng, randInt } from './rng';

// The simulation is fully deterministic: same topology + same traffic profile
// (and, for chaos levels, the same seed) always yields the same result. No live
// randomness, no wall-clock — a design pillar. Each tick, the level's arrival
// rate is pushed from ingress and flows through the graph in topological order.
//
// Node behaviour is data-driven:
//   - fan-out nodes (ingress, load-balancer, gate) route up to capacity and
//     split throughput evenly across their outgoing edges;
//   - a cache serves a fixed fraction locally (hits) and forwards the misses,
//     but only if it can serve at all — see `cachesWithoutHits`;
//   - a queue buffers traffic ACROSS ticks (the one stateful node): it drains up
//     to `capacity` per tick and sheds the overflow when its buffer is full
//     (back-pressure);
//   - a service is a sink: it handles up to capacity and drops the overflow.
//
// On chaos levels, a seeded schedule knocks out individual service nodes for a
// window of ticks (capacity -> 0), simulating a mid-run incident.

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
  return { ok: false, error, ticks: [], totalArrived: 0, totalServed: 0, totalDropped: 0, totalLatency: 0, coverage: 0 };
}

/**
 * Caches that cannot serve anything locally, so their hit rate is 0 and they can
 * only forward (or, with no downstream, drop). Two cases, one idea — a cache hit
 * needs both an origin to populate from and a request that no cache has already
 * seen:
 *
 *   1. no outgoing edge — nothing behind it to populate the cache, so every
 *      request is a miss with nowhere to go (matching every other fan-out node,
 *      which likewise drops its throughput when it has no downstream consumer);
 *   2. downstream of another cache — it only ever receives the upstream cache's
 *      misses, which in this model *are* the requests that are not repeated
 *      reads, so a second tier has nothing left to serve.
 *
 * Case 2 is what stops hit rates compounding along a chain (0.5, 0.75, 0.875 …).
 * Without it a ladder of caches serves almost all traffic for $1.00 a rung, and
 * a level like L07 can be cleared under par with no service behind the gate at
 * all. It is deliberately checked over *all* paths, not just adjacency, so
 * `cache -> gate -> cache` is caught too.
 *
 * Conservative on a diamond: a cache fed by both a cache and a fresh path is
 * treated as inert, because some of its inflow is already-missed traffic.
 *
 * Pure function of the topology, and cycle-safe (the visited guard) so the
 * editor can call it on a half-built board.
 */
function cachesWithoutHits(graph: Graph): Set<string> {
  const behindCache = new Set<string>();
  const stack: string[] = [];
  for (const [id, n] of graph.nodes) {
    if (n.kind === 'cache') for (const e of graph.outgoing.get(id)!) stack.push(e.to);
  }
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (behindCache.has(id)) continue;
    behindCache.add(id);
    for (const e of graph.outgoing.get(id)!) stack.push(e.to);
  }

  const inert = new Set<string>();
  for (const [id, n] of graph.nodes) {
    if (n.kind !== 'cache') continue;
    if (behindCache.has(id) || graph.outgoing.get(id)!.length === 0) inert.add(id);
  }
  return inert;
}

/** `cachesWithoutHits` for callers holding a raw board (the editor / renderer). */
export function inertCacheIds(nodes: GameNode[], edges: Edge[]): Set<string> {
  return cachesWithoutHits(buildGraph(nodes, edges));
}

/**
 * BFS from ingress that refuses to traverse `blockKind` nodes. If it can still
 * reach a sink (a non-fan-out node, e.g. a service), some traffic reaches that
 * sink without passing a required intermediary — an invalid topology.
 *
 * NOTE: cache and queue are fanOut:true, so they are not treated as sinks here
 * even though a cache serves some traffic locally. A cache in front of a gate is
 * a legitimate edge cache (the L07 gold build opens with one), and a cache that
 * *would* terminate traffic early is already neutered by `cachesWithoutHits` —
 * with no downstream it serves nothing — so nothing slips past this rule.
 */
function sinkReachableWithout(graph: Graph, ingressId: string, blockKind: NodeKind): boolean {
  const visited = new Set<string>();
  const queue: string[] = [ingressId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!NODE_SPECS[graph.nodes.get(id)!.kind].fanOut) return true;
    for (const e of graph.outgoing.get(id)!) {
      const next = graph.nodes.get(e.to);
      if (next && next.kind !== blockKind && !visited.has(e.to)) queue.push(e.to);
    }
  }
  return false;
}

/** Why a given required intermediary matters, in the level's own language. */
const REQUIRED_KIND_ERROR: Partial<Record<NodeKind, string>> = {
  gate: 'Untested traffic reached production — every service must sit behind a deploy gate.',
  queue: 'Unbuffered traffic reached production — the burst must pass through a queue.',
};

/**
 * Build the incident schedule from the seed. Each window is a [minStart,maxStart]
 * tick range for one incident; within it the seeded RNG fixes the exact start
 * tick, and a deterministic shuffle assigns each incident a distinct victim
 * service (knocked out for `duration` ticks). Pure function of the seed and the
 * service set. Returns a tick -> Set(downed service ids) map.
 */
function buildIncidentSchedule(order: string[], graph: Graph, traffic: number[], chaos: ChaosSpec): Map<number, Set<string>> {
  const downAt = new Map<number, Set<string>>();
  const sinks = order.filter((id) => {
    const spec = NODE_SPECS[graph.nodes.get(id)!.kind];
    return !spec.fanOut && spec.hitRate == null && spec.buffer == null; // true sinks: service nodes
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

/**
 * Structural test coverage: the fraction of service nodes that sit behind a CI
 * gate (every ingress -> service path passes a gate). A service reachable from
 * ingress without crossing a gate is "untested". Pure function of the topology.
 */
function computeCoverage(graph: Graph, ingressId: string): number {
  const services = [...graph.nodes.values()].filter((n) => {
    const spec = NODE_SPECS[n.kind];
    return !spec.fanOut && spec.hitRate == null && spec.buffer == null;
  });
  if (services.length === 0) return 0;
  const visited = new Set<string>();
  const ungated = new Set<string>();
  const queue: string[] = [ingressId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const spec = NODE_SPECS[graph.nodes.get(id)!.kind];
    if (!spec.fanOut && spec.hitRate == null && spec.buffer == null) {
      ungated.add(id); // a service reached without crossing a gate
      continue;
    }
    for (const e of graph.outgoing.get(id)!) {
      if (graph.nodes.get(e.to)!.kind === 'gate') {
        visited.add(e.to); // don't traverse through gates — past them is tested
        continue;
      }
      if (!visited.has(e.to)) queue.push(e.to);
    }
  }
  return (services.length - ungated.size) / services.length;
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
  // The editor enforces this too, but the simulation is the referee: every claim
  // the level design makes about a build being priced out assumes ingress cannot
  // fan out on its own, so a headless run must not be able to solve a level the
  // player could never build.
  if (graph.outgoing.get(ingress.id)!.length > 1) {
    return fail('ingress is a single entry point — route it through a load-balancer to fan out.');
  }

  // Each required kind is checked on its own: blocking them all at once would
  // only assert that every path crosses *one of* them, where the rule is that
  // every path crosses *each of* them.
  for (const kind of opts.requireBeforeSinks ?? []) {
    if (sinkReachableWithout(graph, ingress.id, kind)) {
      return fail(REQUIRED_KIND_ERROR[kind] ?? `Every path to a service must pass through a ${NODE_SPECS[kind].label}.`);
    }
  }

  // Precompute the seeded incident schedule once, before the tick loop.
  const downAt = opts.chaos ? buildIncidentSchedule(order, graph, traffic, opts.chaos) : null;

  // Caches that serve no hits this run: a pure function of the topology, so it
  // is computed once rather than re-derived every tick.
  const noHits = cachesWithoutHits(graph);

  // Queue buffers persist across ticks — the only cross-tick state in the sim.
  const held = new Map<string, number>();

  const ticks: SimTick[] = [];
  let totalArrived = 0;
  let totalServed = 0;
  let totalDropped = 0;
  let totalLatency = 0;

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
        // A cache that cannot serve (no origin, or fed another cache's misses)
        // has an effective hit rate of 0 and forwards everything it takes in.
        const hitRate = noHits.has(id) ? 0 : spec.hitRate;
        const throughput = Math.min(received, spec.capacity);
        const overCapacity = received - throughput;
        if (overCapacity > 0) {
          dropped += overCapacity;
          nodeOverload[id] = true;
        }
        const hits = Math.floor(throughput * hitRate);
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
      } else if (spec.buffer != null) {
        // queue: buffer across ticks. Take what is already held plus this tick's
        // inflow, drain up to `capacity` downstream, keep the rest up to the
        // buffer depth, and shed anything beyond that (back-pressure).
        const available = (held.get(id) ?? 0) + received;
        const release = Math.min(available, spec.capacity);
        const afterRelease = available - release;
        const keep = Math.min(afterRelease, spec.buffer);
        const overflow = afterRelease - keep;
        held.set(id, keep);
        if (overflow > 0) {
          dropped += overflow;
          nodeOverload[id] = true;
        }
        if (outs.length === 0) {
          if (release > 0) {
            dropped += release;
            nodeOverload[id] = true;
          }
        } else {
          const shares = splitEven(release, outs.length);
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

    // snapshot the queue buffers after this tick (for the renderer) and add
    // this tick's total buffered to the latency (cycles) axis: each request held
    // for a tick is one request-tick of waiting.
    const buffered: Record<string, number> = {};
    let tickBuffered = 0;
    for (const [qid, v] of held) { buffered[qid] = v; tickBuffered += v; }
    totalLatency += tickBuffered;

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
      buffered,
    });
  }

  // Requests still buffered when the run ends never got served — count them as
  // dropped so conservation holds (served + dropped === arrived), attributed to
  // the final tick, and flag the still-full queues as overloaded for the UI.
  let leftover = 0;
  for (const v of held.values()) leftover += v;
  if (leftover > 0 && ticks.length > 0) {
    const last = ticks[ticks.length - 1];
    last.dropped += leftover;
    for (const [id, v] of held) if (v > 0) last.nodeOverload[id] = true;
    totalDropped += leftover;
  }

  const coverage = computeCoverage(graph, ingress.id);
  return { ok: true, ticks, totalArrived, totalServed, totalDropped, totalLatency, coverage };
}