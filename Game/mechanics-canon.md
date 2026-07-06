# Mechanics canon — Three-Way Merge

Internal reference. Used to keep mechanic vocabulary consistent across activities, GDD sections, and level specs. Pulled from the Activity 2 catalogue so the same definitions and citations propagate into future deliverables without drift.

## 1. Canonical 18 mechanics

| # | Mechanic | One-line definition | Primary source |
|---|---|---|---|
| 1 | Movement / Locomotion | Translate the avatar through space — the spine on which other mechanics hang. | Adams (2014) |
| 2 | Resource Management | Allocate finite quantities (energy, currency, time) under trade-offs. | Schell (2019), ch. 13 |
| 3 | Combat / Conflict Resolution | Reduce a contested HP pool through skill or stochastic rolls. | Adams (2014) |
| 4 | Progression / Levelling | Persistent power growth tied to time investment. | Salen & Zimmerman (2003) |
| 5 | Exploration | Goal-directed traversal of partially mapped space, where discovery itself rewards. | Schell (2019) |
| 6 | Puzzle Solving | Challenge with a dominant correct strategy, found by reasoning. | Schell (2019) |
| 7 | Crafting / Composition | Combine inputs into outputs by recipe, constrained by inventory and station. | Adams (2014) |
| 8 | Stealth / Detection | Avoid hostile attention via visibility, sound, and positioning. | Adams (2014) |
| 9 | Building / Construction | Place persistent structures that change subsequent play. | Adams (2014) |
| 10 | Pattern Matching | Recognise and act on visual or symbolic configurations under constraint. | Adams (2014) |
| 11 | Branching Narrative | Plot graph whose edges are selected by player choice. | Schell (2019), ch. 17 |
| 12 | Risk / Chance | Outcomes drawn from a probability distribution. | Schell (2019), ch. 12 |
| 13 | Time Manipulation | Player-controlled rewind, slow-motion, or branching of the game clock. | Schreiber & Romero (2021) |
| 14 | Skill Trees / Customization | Earned-point spend on a graph of avatar specialisations. | Adams (2014) |
| 15 | Procedural Generation | Algorithmic synthesis of game content at run time. | Hendrikx et al. (2013) |
| 16 | Economy / Trading | Player- or system-driven exchange at variable prices. | Schell (2019), ch. 13 |
| 17 | Programming / Logic Puzzles | Puzzles solved by composing instructions the game then executes. | Sicart (2008) |
| 18 | Automation / Logistics | Place self-running systems whose throughput becomes the score. | Adams (2014) |

## 2. Mapping to *Three-Way Merge*'s game

### In scope (drives the core loop)
- **Programming / Logic Puzzles** — IaC templates, CI/CD gates, routing rules.
- **Automation / Logistics** — pipelines that, once correct, run unattended.
- **Resource Management** — error budget · cache capacity · queue depth · region quota.
- **Risk / Chance** — incident injection on a deterministic seed.
- **Pattern Matching** — log lines, dashboards, trace waterfalls.
- **Progression / Skill Trees** — runbook library; advanced primitives (replicas, blue-green, canary, multi-region) unlock through scenarios.
- **Puzzle Solving** — every scenario has a dominant correct topology, learnable by reasoning.

### Out of scope (would break the design pillar)
Movement / Locomotion · Combat · Exploration · Stealth · Building (in the spatial/world-builder sense) · Branching Narrative · Procedural Generation (the player's content is hand-authored; only incidents are seeded) · Time Manipulation (no rewind verb).

### Borderline / future expansions
- **Crafting / Composition** — could surface as authoring custom Helm-style templates from primitives. Consider for v1.5.
- **Economy / Trading** — could surface as inter-team SRE marketplace (selling spare capacity). Consider for v2 multiplayer experiment, never v1.

## 3. Rules of use

- When designing a new scenario or level, start from the **In scope** list. If a proposal needs a mechanic from **Out of scope**, justify the design pillar concession explicitly or cut the proposal.
- When adding a mechanic to a deliverable, reuse the one-line definition above verbatim — drift across documents costs cohesion points.
- New mechanics added to this canon must come with a real academic source. No inventions.
