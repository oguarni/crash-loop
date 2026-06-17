// Verification harness for the L01 + L02 simulation math and topology rules.
import { simulate } from '../src/sim/engine';
import { NODE_SPECS } from '../src/sim/nodes';
import { L01 } from '../src/levels/L01';
import { L02 } from '../src/levels/L02';
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

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
if (failures > 0) process.exit(1);
