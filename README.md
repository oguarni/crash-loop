# crash-loop

A 2D infrastructure & automation puzzle. You are a Site Reliability Engineer at
a fictional cloud provider: each level hands you a failing distributed system,
and you compose a topology of nodes — load balancers, services, caches, queues —
that survives simulated traffic inside an **error budget** and a **resource
budget**. No physics, no twitch, no 3D. Backend over bullets.

Built by **Team Three-Way Merge** (Gabriel Felipe Guarnieri · Hector Guarçoni
Machado · Marcos Winícios Silva Martins) for *Software Engineering for Games —
2026/1*.

## Run it

```bash
npm install
npm run dev      # vite dev server, opens the playable build
```

Other scripts:

```bash
npm run build      # type-check (tsc --noEmit) + production bundle into dist/
npm run preview    # serve the production build locally
npm run typecheck  # type-check only
npm run test:sim   # headless deterministic sim-check harness (L01–L06)
```

## L01 — "boot" (the first playable level)

`svc-cart` takes public traffic on a single replica and folds under load.
Incoming traffic is **30 req/tick**; one service handles **10**.

- `ingress` is a single public entry point — it can only feed **one** downstream
  node, so you must route it through a **load-balancer** to fan traffic out.
- The load-balancer splits its inflow evenly across every downstream service.
- Budget caps you at **$5.00 / 8 CPU / 8 MEM**, and dropped requests must stay
  within the **error budget** (20).

The dominant correct topology:

```
ingress ──> load-balancer ──┬──> service
                            ├──> service
                            └──> service
```

3 services × 10 = 30 req/tick (zero drops), at **$4.50** — which also clears the
gold tier (`parCost`).

### Controls

| Action  | How |
|---------|-----|
| Place   | Click a component in the left rail, then click an empty spot in the work area |
| Wire    | Select **wire**, click the source node, then the target node |
| Move    | Select **move**, drag a node — a node dropped on another is nudged to the nearest free slot |
| Delete  | Select **delete**, click a node or an edge |
| Run     | **Run >** (or `Enter`) — simulate the traffic profile and score it |
| Pause   | **Pause** (or `Space` / `P`) freezes a running sim; **Resume** continues |
| Cancel  | `Esc` cancels an in-progress wire |

Clear a level and a **Next >** button appears on the result banner to advance.

## Scoring & progress

Each run is graded into a tier — **FAIL**, **PASS** (error budget held), or **GOLD**
(also at or under `parCost`). The best tier and the lowest passing cost are kept
per level in `localStorage`, so a cleared scenario shows its saved best on the
result banner and in the rail, and a run that beats the record flags a **NEW
BEST**. The title screen reports how many regions you've stabilised. Scoring is
meta state only — it never feeds the deterministic simulation.

## L02 — "first deploy"

A new `svc-cart` release cuts over to production, but every request must clear a
**canary deploy gate** first. Traffic rises to **40 req/tick**.

- `requireBeforeSinks: ['gate']` — every path from `ingress` to a service must
  pass through a `ci-gate`, or the run is rejected (*"untested traffic reached
  production"*). It's a topology rule, checked before the traffic ever flows.
- A `ci-gate` forwards only **20 req/tick**, so one gate throttles production —
  you need two, fanned out from the load-balancer.
- Budget caps you at **$8.00 / 8 CPU / 8 MEM**; the error budget is 40.

The dominant correct topology:

```
ingress ──> load-balancer ──┬──> ci-gate ──┬──> service
                            │              └──> service
                            └──> ci-gate ──┬──> service
                                           └──> service
```

`lb` splits 40 → 20/20 to the gates → 10/10 to four services (cap 10): zero
drops, at **$7.50** — which also clears the gold tier. A third gate or fifth
service would breach the $8.00 budget, so this build is the unique solution.

## L03 — "flapping cart"

`svc-cart` is flapping under a flood of **repeated reads**, and adding replicas
is priced out. This level introduces the **cache** node: it serves a fixed
fraction of its inflow locally (a cache *hit*) and forwards only the *misses*
downstream — and, like a load-balancer, it splits those misses evenly.

- A `cache` has `hitRate: 0.5`: of 40 req/tick it serves 20 as hits and forwards
  20 as misses. It's cheap in cost but heavy in **memory** (`mem 2`).
- Budget caps you at **$4.50 / 6 CPU / 6 MEM**; the error budget is 40.

The dominant correct topology:

```
ingress ──> cache ──┬──> service
                    └──> service
```

The cache serves 20 locally and forwards 20 → 10/10 into two services: zero
drops, at **$3.00** (gold). The cacheless brute force (lb + 4 services = $5.50)
is over budget, so you can't out-spend the problem — you have to cache. A chained
`cache → cache → 1 service` also clears gold at $3.00, since caching compounds.

## L04 — "error budget"

This level flips the lesson: until now the goal was zero drops; here **serving
everything is deliberately unaffordable**. Traffic holds at a steady 20 req/tick,
spikes to **40 for five ticks**, then settles back.

- Budget caps you at **$5.00 / 6 CPU / 6 MEM**; the error budget is 120.
- The zero-drop build (lb + 4 services = $5.50) is over budget — you cannot buy
  your way out of the spike.

The dominant correct topology:

```
ingress ──> load-balancer ──┬──> service
                            └──> service
```

Two services (cap 20) serve the steady 20 with zero drops; during the spike they
shed 100 requests total, which sits inside the 120 error budget — at **$3.50**
(gold). A safer lb + 3 services ($4.50) passes with only 50 drops but misses
gold. The lesson: spend the error budget instead of overspending on capacity.

## L05 — "chaos friday"

It's Friday and chaos is loose: replicas **crash mid-run, without warning**. A
seeded schedule knocks out one service at a time (two incidents, five ticks
each), and while a replica is down its capacity is 0 — everything routed to it is
dropped. Traffic is a steady 20 req/tick.

- Budget caps you at **$7.00 / 8 CPU / 8 MEM**; the error budget is 55.
- The incident schedule lives entirely in a per-level **seed** — you can't see
  the exact timing, so you build *for* the failure, not around it.

The dominant correct topology:

```
ingress ──> load-balancer ──┬──> service
                            ├──> service
                            ├──> service
                            └──> service
```

The lesson is **resilience through redundancy**. The load-balancer splits 20
evenly, so with four services each carries only 5 req/tick; when one crashes,
only its 5/tick are shed — across two 5-tick incidents that's 50 dropped, inside
the 55 error budget, at **$5.50** (gold). Two or three services carry a bigger
share (10 or ~7 per replica), so losing one blows the budget. Because the gold
build is symmetric, *which* replica the seed picks never changes the outcome — so
the run stays fully deterministic.

## L06 — "back-pressure"

The counterpoint to L04: instead of dropping a spike, you **buffer** it. This
level introduces the **queue** — the one stateful node, whose buffer carries
across ticks. Traffic sits at a steady 10 req/tick, spikes to **40 for five
ticks**, then settles back, leaving room to drain.

- A `queue` drains up to **20 req/tick** and holds up to **100** across ticks;
  when the buffer is full it sheds the overflow (back-pressure). Like a cache, it
  splits its released traffic evenly across downstream edges.
- Budget caps you at **$5.00 / 6 CPU / 6 MEM**; the error budget is 20.
- Peak provisioning (lb + 4 services = $5.50) is over budget — you must buffer,
  not out-spend, the spike.

The dominant correct topology:

```
ingress ──> queue ──┬──> service
                    └──> service
```

The queue releases 20/tick and buffers the surplus (peaking at exactly 100 during
the spike), then drains it over the calm tail. Two services (cap 20) match the
drain rate, so nothing is dropped, at **$4.00** (gold). A single downstream
service can't keep up with the queue's own drain and fails. Requests still
buffered when the run ends count as dropped — you must drain in time.

## Architecture

```
src/
  types.ts          shared domain types (incl. ChaosSpec)
  palette.ts        canonical Three-Way Merge palette
  layout.ts         geometry constants + hit-testing helpers
  sim/
    nodes.ts        per-kind specs (cost, capacity, fan-out, cache hit-rate, queue buffer)
    rng.ts          deterministic seeded PRNG (mulberry32) for chaos
    engine.ts       deterministic per-tick topological flow simulation
  levels/
    L01.ts          "boot"          — routing / load balancing
    L02.ts          "first deploy"  — deploy gate rule
    L03.ts          "flapping cart" — cache node
    L04.ts          "error budget"  — traffic spike, tight budget
    L05.ts          "chaos friday"  — seeded incident injection
    L06.ts          "back-pressure" — queue node (cross-tick buffering)
    index.ts        level register (played in order)
  game.ts           board state, editing rules, run/playback (framework-agnostic)
  progress.ts       persistent per-level scoring (localStorage, sim-independent)
  render.ts         all canvas drawing + shared hit-region layouts
  main.ts           DOM wiring, input, the playback loop
scripts/
  sim-check.ts      headless deterministic verification harness (npm run test:sim)
```

**Design notes**

- The simulation is **fully deterministic** — the same topology, traffic profile
  and seed always produce the same result (a design pillar). The chaos mechanic
  (L05) is a **seeded incident injection**, not wall-clock noise: the schedule is
  a pure function of the level seed, generated once before the tick loop.
- Traffic flows through the graph in **topological order** each tick; a cycle is
  rejected as an invalid topology (a real DAG constraint).
- Node behaviour is data-driven: `fanOut` nodes split evenly, a `hitRate` node
  (cache) serves a fraction and forwards the rest, a `buffer` node (queue) holds
  traffic across ticks and drains at its capacity, and plain sinks (services)
  handle up to capacity and drop the overflow.
- The **queue is the only stateful node**: its buffer persists between ticks.
  Requests still held when the run ends are counted as dropped, so conservation
  (`served + dropped === arrived`) always holds and a solution must drain in time.
- `game.ts` holds no rendering or DOM code, so the rules are unit-testable and
  the renderer is replaceable.

## Roadmap

**Shipped:** L01 — boot · L02 — first deploy · L03 — flapping cart · L04 — error
budget · L05 — chaos friday · L06 — back-pressure. All six roadmap node kinds are
live: `ingress`, `load-balancer`, `service`, `ci-gate`, `cache`, `queue`.

**Planned:**

- **Multi-axis scoring** — add cycles and test coverage alongside the cost axis.
- **Infrastructure as Code** — declare part of a topology from a script/template.
- **Narrative & NPCs** — diegetic incident briefings and the senior SRE mentor.
- **Thematic campaign** — group levels into worlds (Ingress, Queues, Services,
  CI/CD, Data/Cache, SRE panel) with boss scenarios.
- **Terminal polish** — CRT glow and an ambient soundtrack.