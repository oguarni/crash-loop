// Verification harness for the L01 + L02 simulation math and topology rules.
import { simulate } from '../src/sim/engine';
import { NODE_SPECS } from '../src/sim/nodes';
import { L01 } from '../src/levels/L01';
import { L02 } from '../src/levels/L02';
import { L03 } from '../src/levels/L03';
import { L04 } from '../src/levels/L04';
import { L05 } from '../src/levels/L05';
import { Game } from '../src/game';
import { mergeRecord } from '../src/progress';
import type { Edge, GameNode } from '../src/types';

let failures = 0;
function check(name: string, cond: boolean, detail: string): void {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`[${tag}] ${name} — ${detail}`);
}

const ingress: GameNode = { id: 'ingress', kind: 'ingress', x: 0, y: 0 };
const svc = (id: string): GameNode => ({ id, kind: 'service', x: 0, y: 0 });
const lb: GameNode = { id: 'lb', kind: 'load-balancer', x: 0, y: 0 };
const gate = (id: string): GameNode => ({ id, kind: 'gate', x: 0, y: 0 });
const cache = (id: string): GameNode => ({ id, kind: 'cache', x: 0, y: 0 });
const edge = (from: string, to: string): Edge => ({ id: `${from}->${to}`, from, to });

// 1) ingress -> single service: 30 in, 10 served, 20 dropped/tick.
{
  const nodes = [ingress, svc('s1')];
  const edges = [edge('ingress', 's1')];
  const r = simulate(nodes, edges, L01.traffic);
  check('single service drops 20/tick', r.totalDropped === 20 * 30, `dropped=${r.totalDropped} served=${r.totalServed}`);
  check('single service fails error budget', r.totalDropped > L01.errorBudget, `dropped=${r.totalDropped} budget=${L01.errorBudget}`);
}

// 2) ingress -> lb -> 3 services: 0 dropped, the intended gold solution.
{
  const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3')];
  const r = simulate(nodes, edges, L01.traffic);
  check('lb + 3 services drops nothing', r.totalDropped === 0, `dropped=${r.totalDropped}`);
  check('lb + 3 services serves everything', r.totalServed === r.totalArrived, `served=${r.totalServed} arrived=${r.totalArrived}`);
  check('lb + 3 services within error budget', r.totalDropped <= L01.errorBudget, `dropped=${r.totalDropped}`);
}

// 3) ingress -> lb -> 2 services: 30 split 15/15, each drops 5 -> 10/tick.
{
  const nodes = [ingress, lb, svc('s1'), svc('s2')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2')];
  const r = simulate(nodes, edges, L01.traffic);
  check('lb + 2 services drops 10/tick', r.totalDropped === 10 * 30, `dropped=${r.totalDropped}`);
  check('lb + 2 services fails error budget', r.totalDropped > L01.errorBudget, `dropped=${r.totalDropped}`);
}

// 4) conservation: served + dropped === arrived, for an arbitrary topology.
{
  const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3')];
  const r = simulate(nodes, edges, L01.traffic);
  check('conservation holds', r.totalServed + r.totalDropped === r.totalArrived, `${r.totalServed}+${r.totalDropped}==${r.totalArrived}`);
}

// 5) cycle rejection.
{
  const a = svc('a');
  const b = svc('b');
  const nodes = [ingress, a, b];
  const edges = [edge('ingress', 'a'), edge('a', 'b'), edge('b', 'a')];
  const r = simulate(nodes, edges, L01.traffic);
  check('cycle is rejected', r.ok === false, `ok=${r.ok} error=${r.error ?? ''}`);
}

// --- L02 "first deploy": the deploy-gate rule + the gate-capacity bottleneck ---
const gateRule = { requireBeforeSinks: L02.requireBeforeSinks };

// 6) ungated services are rejected — traffic must clear a gate first.
{
  const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3'), svc('s4')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3'), edge('lb', 's4')];
  const r = simulate(nodes, edges, L02.traffic, gateRule);
  check('L02 rejects ungated services', r.ok === false, `ok=${r.ok} error=${r.error ?? ''}`);
}

// 7) a single gate (cap 20) cannot carry 40 req/tick — it drops 20/tick.
{
  const nodes = [ingress, lb, gate('g1'), svc('s1'), svc('s2'), svc('s3'), svc('s4')];
  const edges = [edge('ingress', 'lb'), edge('lb', 'g1'), edge('g1', 's1'), edge('g1', 's2'), edge('g1', 's3'), edge('g1', 's4')];
  const r = simulate(nodes, edges, L02.traffic, gateRule);
  check('L02 single gate accepted but bottlenecks', r.ok === true && r.totalDropped === 20 * 30, `ok=${r.ok} dropped=${r.totalDropped}`);
  check('L02 single gate fails error budget', r.totalDropped > L02.errorBudget, `dropped=${r.totalDropped} budget=${L02.errorBudget}`);
}

// 8) the intended solution: lb -> 2 gates -> 2 services each. zero drops, gold.
{
  const nodes = [ingress, lb, gate('g1'), gate('g2'), svc('s1'), svc('s2'), svc('s3'), svc('s4')];
  const edges = [
    edge('ingress', 'lb'),
    edge('lb', 'g1'), edge('lb', 'g2'),
    edge('g1', 's1'), edge('g1', 's2'),
    edge('g2', 's3'), edge('g2', 's4'),
  ];
  const r = simulate(nodes, edges, L02.traffic, gateRule);
  check('L02 two gates drop nothing', r.totalDropped === 0, `dropped=${r.totalDropped}`);
  check('L02 two gates serve everything', r.totalServed === r.totalArrived, `served=${r.totalServed} arrived=${r.totalArrived}`);
  check(
    'L02 gate forwards exactly its cap',
    r.ticks[0].edgeLoad['lb->g1'] === 20 && r.ticks[0].edgeLoad['g1->s1'] === 10,
    `lb->g1=${r.ticks[0].edgeLoad['lb->g1']} g1->s1=${r.ticks[0].edgeLoad['g1->s1']}`,
  );
}

// 9) the gold topology's resource cost matches parCost (guards against spec drift).
{
  const cost = NODE_SPECS['load-balancer'].cost + 2 * NODE_SPECS.gate.cost + 4 * NODE_SPECS.service.cost;
  check('L02 par cost matches the gold build', Math.abs(cost - L02.parCost) < 1e-9, `cost=${cost} par=${L02.parCost}`);
}

// --- scoring: the record-merge rule (pure, persistence-free) -------------------

// 10) a first clear records the tier and cost and counts as an improvement.
{
  const a = mergeRecord(null, { tier: 'pass', cost: 5, served: 900, dropped: 0 });
  check('first pass records a best', a.record.tier === 'pass' && a.record.bestCost === 5 && a.improved, `tier=${a.record.tier} cost=${a.record.bestCost} improved=${a.improved}`);

  // 11) reaching gold upgrades both the tier and the cost record.
  const b = mergeRecord(a.record, { tier: 'gold', cost: 4.5, served: 900, dropped: 0 });
  check('gold upgrades tier and cost', b.record.tier === 'gold' && b.record.bestCost === 4.5 && b.improved, `tier=${b.record.tier} cost=${b.record.bestCost}`);

  // 12) a worse, more expensive run never regresses the saved record.
  const c = mergeRecord(b.record, { tier: 'pass', cost: 6, served: 900, dropped: 0 });
  check('a worse run never regresses', c.record.tier === 'gold' && c.record.bestCost === 4.5 && !c.improved, `tier=${c.record.tier} cost=${c.record.bestCost} improved=${c.improved}`);

  // 13) a failed run leaves the level unsolved with no cost.
  const d = mergeRecord(null, { tier: 'none', cost: 0, served: 0, dropped: 600 });
  check('a failed run stays unsolved', d.record.tier === 'none' && d.record.bestCost === null && !d.improved, `tier=${d.record.tier} cost=${d.record.bestCost}`);
}

// --- collision: node placement / overlap rules ---------------------------------

// 14) placing a node onto an existing one is blocked; open space succeeds.
{
  const g = new Game(L01);
  const ing = g.nodes[0];
  check('placing onto ingress is blocked', g.placeNode('service', ing.x, ing.y) === null, `nodes=${g.nodes.length}`);
  const placed = g.placeNode('service', ing.x + 200, ing.y + 120);
  check('placing in open space succeeds', placed !== null && g.nodes.length === 2, `placed=${placed?.id ?? 'null'} nodes=${g.nodes.length}`);
  check('overlap is detected at an occupied slot', g.wouldOverlap(ing.x + 200, ing.y + 120) === true, 'expected overlap at the just-placed slot');
  check('a distant slot reads as free', g.wouldOverlap(ing.x + 200, ing.y + 120 - 80) === false, 'expected free slot one node-height away');
}

// ===== L03 "flapping cart": the cache node =====

// cache + 2 services: cache serves half locally, forwards the misses. Zero drops.
{
  const nodes = [ingress, cache('c'), svc('s1'), svc('s2')];
  const edges = [edge('ingress', 'c'), edge('c', 's1'), edge('c', 's2')];
  const r = simulate(nodes, edges, L03.traffic);
  check('L03 cache + 2 services drops nothing', r.totalDropped === 0, `dropped=${r.totalDropped}`);
  check('L03 cache + 2 services serves everything', r.totalServed === r.totalArrived, `served=${r.totalServed} arrived=${r.totalArrived}`);
  check('L03 cache forwards only its misses', r.ticks[0].edgeLoad['c->s1'] === 10 && r.ticks[0].edgeLoad['c->s2'] === 10,
    `c->s1=${r.ticks[0].edgeLoad['c->s1']} c->s2=${r.ticks[0].edgeLoad['c->s2']}`);
}

// cache + 1 service: 20 misses hit one service (cap 10) -> drops 10/tick, blows budget.
{
  const nodes = [ingress, cache('c'), svc('s1')];
  const edges = [edge('ingress', 'c'), edge('c', 's1')];
  const r = simulate(nodes, edges, L03.traffic);
  check('L03 cache + 1 service drops 10/tick', r.totalDropped === 10 * 30, `dropped=${r.totalDropped}`);
  check('L03 cache + 1 service fails error budget', r.totalDropped > L03.errorBudget, `dropped=${r.totalDropped} budget=${L03.errorBudget}`);
}

// chained caches compound: ingress -> cache -> cache -> 1 service, zero drops.
{
  const nodes = [ingress, cache('c1'), cache('c2'), svc('s1')];
  const edges = [edge('ingress', 'c1'), edge('c1', 'c2'), edge('c2', 's1')];
  const r = simulate(nodes, edges, L03.traffic);
  check('L03 chained caches drop nothing', r.totalDropped === 0, `dropped=${r.totalDropped}`);
}

// conservation with a cache in the path.
{
  const nodes = [ingress, cache('c'), svc('s1'), svc('s2')];
  const edges = [edge('ingress', 'c'), edge('c', 's1'), edge('c', 's2')];
  const r = simulate(nodes, edges, L03.traffic);
  check('L03 conservation holds', r.totalServed + r.totalDropped === r.totalArrived, `${r.totalServed}+${r.totalDropped}==${r.totalArrived}`);
}

// gold cost matches the intended build (guards against spec drift).
{
  const cost = NODE_SPECS.cache.cost + 2 * NODE_SPECS.service.cost;
  check('L03 par cost matches the gold build', Math.abs(cost - L03.parCost) < 1e-9, `cost=${cost} par=${L03.parCost}`);
  const brute = NODE_SPECS['load-balancer'].cost + 4 * NODE_SPECS.service.cost;
  check('L03 cacheless brute force is priced out', brute > L03.budgets.cost, `brute=${brute} budget=${L03.budgets.cost}`);
}

// ===== L04 "error budget": spike + tight budget =====

// the traffic profile: 700 total arrived, with a 5-tick spike.
{
  const total = L04.traffic.reduce((a, b) => a + b, 0);
  const spikeTicks = L04.traffic.filter((x) => x === 40).length;
  check('L04 traffic sums to 700 with a 5-tick spike', total === 700 && spikeTicks === 5, `total=${total} spike=${spikeTicks}`);
}

// gold: lb + 2 services. Base served fully; spike sheds 100, inside the 120 budget.
{
  const nodes = [ingress, lb, svc('s1'), svc('s2')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2')];
  const r = simulate(nodes, edges, L04.traffic);
  check('L04 lb + 2 services drops exactly the spike (100)', r.totalDropped === 100, `dropped=${r.totalDropped}`);
  check('L04 lb + 2 services stays within error budget', r.totalDropped <= L04.errorBudget, `dropped=${r.totalDropped} budget=${L04.errorBudget}`);
  check('L04 lb + 2 services serves the rest', r.totalServed === r.totalArrived - 100, `served=${r.totalServed} arrived=${r.totalArrived}`);
}

// a safer lb + 3 services passes with fewer drops but costs more than par.
{
  const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3')];
  const r = simulate(nodes, edges, L04.traffic);
  check('L04 lb + 3 services passes with 50 drops', r.totalDropped === 50 && r.totalDropped <= L04.errorBudget, `dropped=${r.totalDropped}`);
}

// under-provisioning (1 service) blows the error budget.
{
  const nodes = [ingress, lb, svc('s1')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1')];
  const r = simulate(nodes, edges, L04.traffic);
  check('L04 lb + 1 service fails error budget', r.totalDropped > L04.errorBudget, `dropped=${r.totalDropped} budget=${L04.errorBudget}`);
}

// the zero-drop build is priced out: lb + 4 services costs more than the budget.
{
  const cost = NODE_SPECS['load-balancer'].cost + 4 * NODE_SPECS.service.cost;
  check('L04 zero-drop build exceeds the budget', cost > L04.budgets.cost, `cost=${cost} budget=${L04.budgets.cost}`);
  const gold = NODE_SPECS['load-balancer'].cost + 2 * NODE_SPECS.service.cost;
  check('L04 par cost matches the gold build', Math.abs(gold - L04.parCost) < 1e-9, `cost=${gold} par=${L04.parCost}`);
}

// ===== L05 "chaos friday": seeded incident injection =====
const chaosOpts = { chaos: L05.chaos };
 
// gold: lb + 4 services survives two seeded incidents inside the error budget.
{
  const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3'), svc('s4')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3'), edge('lb', 's4')];
  const r = simulate(nodes, edges, L05.traffic, chaosOpts);
  check('L05 lb + 4 services survives chaos (50 drops)', r.totalDropped === 50, `dropped=${r.totalDropped}`);
  check('L05 lb + 4 services within error budget', r.totalDropped <= L05.errorBudget, `dropped=${r.totalDropped} budget=${L05.errorBudget}`);
}
 
// under-provisioned builds can't absorb a lost replica — error budget blown.
{
  const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3')];
  const r = simulate(nodes, edges, L05.traffic, chaosOpts);
  check('L05 lb + 3 services fails under chaos', r.totalDropped > L05.errorBudget, `dropped=${r.totalDropped} budget=${L05.errorBudget}`);
}
{
  const nodes = [ingress, lb, svc('s1'), svc('s2')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2')];
  const r = simulate(nodes, edges, L05.traffic, chaosOpts);
  check('L05 lb + 2 services fails hard', r.totalDropped > L05.errorBudget, `dropped=${r.totalDropped}`);
}
 
// determinism: two identical runs produce identical drops.
{
  const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3'), svc('s4')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3'), edge('lb', 's4')];
  const a = simulate(nodes, edges, L05.traffic, chaosOpts).totalDropped;
  const b = simulate(nodes, edges, L05.traffic, chaosOpts).totalDropped;
  check('L05 chaos is deterministic across runs', a === b, `runA=${a} runB=${b}`);
}
 
// symmetry: the gold outcome is seed-independent (every replica carries the same share).
{
  const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3'), svc('s4')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3'), edge('lb', 's4')];
  const seeds = [1, 42, 0x5eed, 0xc0ffee, 123456];
  const same = seeds.every((seed) => simulate(nodes, edges, L05.traffic, { chaos: { ...L05.chaos!, seed } }).totalDropped === 50);
  check('L05 gold is robust to the seed (symmetric)', same, `all seeds -> 50 drops: ${same}`);
}
 
// control: with no chaos, the same build drops nothing (isolates the incident effect).
{
  const nodes = [ingress, lb, svc('s1'), svc('s2'), svc('s3'), svc('s4')];
  const edges = [edge('ingress', 'lb'), edge('lb', 's1'), edge('lb', 's2'), edge('lb', 's3'), edge('lb', 's4')];
  const r = simulate(nodes, edges, L05.traffic);
  check('L05 no-chaos control drops nothing', r.totalDropped === 0, `dropped=${r.totalDropped}`);
}
 
// par cost matches the gold build (guards against spec drift).
{
  const cost = NODE_SPECS['load-balancer'].cost + 4 * NODE_SPECS.service.cost;
  check('L05 par cost matches the gold build', Math.abs(cost - L05.parCost) < 1e-9, `cost=${cost} par=${L05.parCost}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
if (failures > 0) process.exit(1);
