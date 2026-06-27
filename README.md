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

## Architecture

```
src/
  types.ts          shared domain types
  palette.ts        canonical Three-Way Merge palette
  layout.ts         geometry constants + hit-testing helpers
  sim/
    nodes.ts        per-kind specs (cost, capacity, fan-out behaviour)
    engine.ts       deterministic per-tick topological flow simulation
  levels/
    L01.ts          the "boot" level spec
    L02.ts          the "first deploy" level spec
    index.ts        level register (played in order)
  game.ts           board state, editing rules, run/playback (framework-agnostic)
  progress.ts       persistent per-level scoring (localStorage, sim-independent)
  render.ts         all canvas drawing + shared hit-region layouts
  main.ts           DOM wiring, input, the playback loop
```

**Design notes**

- The simulation is **fully deterministic** — the same topology and traffic
  profile always produce the same result (a design pillar; randomness, when it
  arrives, will be a seeded incident injection, not wall-clock noise).
- Traffic flows through the graph in **topological order** each tick; a cycle is
  rejected as an invalid topology (a real DAG constraint).
- `game.ts` holds no rendering or DOM code, so the rules are unit-testable and
  the renderer is replaceable.

## Roadmap

The level register is built to grow. Shipped: **L01 — boot**, **L02 — first
deploy**. Planned scenarios, mirroring the level-select key art:

- **L03 — flapping cart**: a `cache` node to absorb repeated reads.
- **L04 — error budget**: a tighter budget and a traffic spike.
- **L05 — chaos friday**: seeded incident injection (Risk/Chance) mid-run.
```
