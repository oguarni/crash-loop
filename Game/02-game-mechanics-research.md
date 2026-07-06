# Activity 2 — Game Mechanics Research

**Course:** Software Engineering for Games — 2026/1
**Submission date:** 2026-05-05

## 1. Team

**Three-Way Merge** — named for the version-control operation that reconciles three commit graphs into one, mirroring the three contributors below.

| Member | Focus |
|---|---|
| Gabriel Felipe Guarnieri | Systems design / mechanics |
| Hector Guarçoni Machado | Programming / tooling |
| Marcos Winícios Silva Martins | Visual identity / interface |

## 2. Game Mechanics

### 2.1 Defining the term

The literature does not converge on a single definition of *game mechanic*. The three most widely cited frame the rest of this catalogue:

- **Sicart (2008)** — "Methods invoked by agents, designed for interaction with the game state." Mechanics are the verbs the player can use; rules are the constraints around those verbs.
- **Schell (2019)** — Mechanics are one of the four elements of a game (alongside story, aesthetics, technology) and decompose into six families: *space*, *objects/attributes/states*, *actions*, *rules*, *skill*, and *chance*.
- **Hunicke, LeBlanc & Zubek (2004)** — In the MDA framework, mechanics are the rule-level building blocks that, when played, generate dynamics and ultimately aesthetic experiences.

This catalogue follows Sicart's lens: every entry below is something the player *does*, expressed concretely enough that designers can compare implementations across titles.

### 2.2 Catalogue of commonly used mechanics

#### Movement / Locomotion
**Definition.** The player's primary verb for translating the avatar through game space — usually the first mechanic taught, and the spine on which other mechanics hang (Adams, 2014).
**Example.** *Super Mario Bros.* (Nintendo, 1985) — horizontal traversal with tuned momentum, jump arcs, and edge friction defines the entire 2D platformer genre.

#### Resource Management
**Definition.** The collection, allocation, and expenditure of finite quantities — energy, currency, ammunition, time — to achieve goals that exceed naïve consumption (Schell, 2019, ch. 13).
**Example.** *StarCraft II: Wings of Liberty* (Blizzard Entertainment, 2010) — minerals and vespene gas force the player to balance economy, military, and tech tiers under real-time pressure.

#### Combat / Conflict Resolution
**Definition.** A mechanic that resolves contested outcomes between agents, typically by reducing a hit-point pool through skilled action or stochastic rolls (Adams, 2014).
**Example.** *Dark Souls* (FromSoftware, 2011) — stamina-bound melee, invincibility-frame dodges, and posture management turn each encounter into a deliberate exchange.

#### Progression / Levelling
**Definition.** Persistent player power growth tied to time investment — XP curves, gear tiers, ability unlocks — that re-paces difficulty as competence grows (Salen & Zimmerman, 2003).
**Example.** *Diablo II* (Blizzard Entertainment, 2000) — kill-driven XP feeds a finite skill-point budget that the player commits to a build.

#### Exploration
**Definition.** Goal-directed traversal of an unmapped or partially mapped space, where discovery itself is the reward (Schell, 2019, "Lens of the World").
**Example.** *The Legend of Zelda: Breath of the Wild* (Nintendo, 2017) — nested points of interest visible from any high vantage create chains of curiosity-driven travel.

#### Puzzle Solving
**Definition.** A challenge with a dominant correct strategy that the player must discover through reasoning rather than execution; once solved, it loses its challenge (Schell, 2019).
**Example.** *Portal* (Valve Corporation, 2007) — spatial reasoning over a single tool (the portal gun) yields chambers each with a distinct aha-moment.

#### Crafting / Composition
**Definition.** Combining input items into outputs by recipe, typically constrained by inventory and station availability (Adams, 2014).
**Example.** *Minecraft* (Mojang, 2011) — a 3×3 recipe grid turns gathered raw blocks into tools, weapons, and rails.

#### Stealth / Detection
**Definition.** Avoidance of hostile attention through visibility, sound, and positioning — modelled as detection cones, alert states, and timed memory of last-known position (Adams, 2014).
**Example.** *Metal Gear Solid V: The Phantom Pain* (Konami, 2015) — line-of-sight cones, sound radii, and reflex-mode mark the genre's most legible detection model.

#### Building / Construction
**Definition.** Persistent placement of structures into the game world that change subsequent play — defensible terrain, production output, or aesthetic expression (Adams, 2014).
**Example.** *Cities: Skylines* (Colossal Order, 2015) — zoning, road meshes, and utility networks translate into a simulated city economy.

#### Pattern Matching
**Definition.** Recognising and acting on visual or symbolic configurations — colour groups, shape alignments, sequences — under spatial or temporal constraints (Adams, 2014).
**Example.** *Tetris* (Pajitnov, 1984) — falling tetrominoes must be rotated and seated to clear horizontal lines before the stack reaches the ceiling.

#### Branching Narrative
**Definition.** Plot graphs whose edges are selected by player choice, producing distinct downstream states and (usually) different endings (Schell, 2019, ch. 17).
**Example.** *Disco Elysium* (ZA/UM, 2019) — skill-checked dialogue choices route the player through a hand-authored graph with persistent thought-cabinet effects.

#### Risk / Chance
**Definition.** Outcomes drawn from a probability distribution rather than determined directly by player input — dice, random encounters, hit chance, loot tables (Schell, 2019, ch. 12).
**Example.** *XCOM 2* (Firaxis Games, 2016) — every shot is a published hit-percentage roll, and permadeath compounds each unlucky miss.

#### Time Manipulation
**Definition.** Player-controlled rewind, slow-motion, or branching of the game clock, used as both navigation and puzzle space (Schreiber & Romero, 2021).
**Example.** *Braid* (Number None, 2008) — unlimited rewind across every world, with world-specific time rules layered on top, recasts the platformer as a puzzle.

#### Skill Trees / Customization
**Definition.** A persistent selection mechanism — usually graph-shaped — through which players spend earned points to specialise the avatar's ability set (Adams, 2014).
**Example.** *Path of Exile* (Grinding Gear Games, 2013) — a passive tree of more than a thousand nodes makes character build itself the dominant strategic axis.

#### Procedural Generation
**Definition.** Algorithmic synthesis of game content — levels, items, narratives — at run time, parameterised so each play yields distinct artefacts (Hendrikx et al., 2013).
**Example.** *Spelunky* (Mossmouth, 2012) — every level is composed from a 4×4 room template grid using a constrained random walk that guarantees a solvable path.

#### Economy / Trading
**Definition.** Player- or system-driven exchange of goods at variable prices, often modelling supply, demand, and arbitrage (Schell, 2019, ch. 13).
**Example.** *EVE Online* (CCP Games, 2003) — a single-shard player-driven market sets prices for every item, inviting day-trader gameplay alongside combat.

#### Programming / Logic Puzzles
**Definition.** Puzzles solved by composing instructions that the game then executes, exposing the player to formal-language constraints — order of operations, scope, side-effects (Sicart, 2008).
**Example.** *TIS-100* (Zachtronics, 2015) — assembly-style microprocessors constrained by node count, cycles, and register count force optimisation across multiple axes simultaneously.

#### Automation / Logistics
**Definition.** Designing systems that, once placed, perform repetitive actions without further input — production chains, conveyors, autonomous units — turning the player from operator into architect (Adams, 2014).
**Example.** *Factorio* (Wube Software, 2020) — belts, inserters, and assemblers chain into self-sustaining factories whose throughput becomes the score.

### 2.3 Mechanics that ground *Three-Way Merge*'s game

Our 2D Infrastructure & Automation Puzzle places the player in the role of a Site Reliability Engineer at a fictional cloud provider. The catalogue above maps onto our design as follows:

- **Programming / Logic Puzzles** and **Automation / Logistics** anchor the core loop — the player composes IaC templates, CI/CD gates, and routing rules, then runs them against an SLO target.
- **Resource Management** appears as *error budget*, *cache capacity*, and *queue depth* — finite quantities that force trade-offs between feature velocity and reliability.
- **Risk / Chance** surfaces as injected incidents (a region failure, a noisy neighbour) drawn from a deterministic seed so puzzles remain replayable and gradeable.
- **Pattern Matching** drives the diagnostic verbs — reading log lines, dashboards, and trace waterfalls to localise faults.
- **Progression / Skill Trees** is reframed as the *runbook library*: completed scenarios unlock advanced infrastructure primitives (read replicas, blue-green, canary, multi-region).

Movement, combat, exploration, stealth, and branching narrative are explicitly *out of scope* — they would dilute the educational pivot the team committed to in Activity 1.

## 3. References

### 3.1 Game references

1. Blizzard Entertainment. (2000). *Diablo II*.
2. Blizzard Entertainment. (2010). *StarCraft II: Wings of Liberty*.
3. CCP Games. (2003). *EVE Online*.
4. Colossal Order. (2015). *Cities: Skylines*.
5. Firaxis Games. (2016). *XCOM 2*.
6. FromSoftware. (2011). *Dark Souls*.
7. Grinding Gear Games. (2013). *Path of Exile*.
8. Konami. (2015). *Metal Gear Solid V: The Phantom Pain*.
9. Mojang. (2011). *Minecraft*.
10. Mossmouth. (2012). *Spelunky*.
11. Nintendo. (1985). *Super Mario Bros.*
12. Nintendo. (2017). *The Legend of Zelda: Breath of the Wild*.
13. Number None. (2008). *Braid*.
14. Pajitnov, A. (1984). *Tetris*.
15. Valve Corporation. (2007). *Portal*.
16. Wube Software. (2020). *Factorio*.
17. ZA/UM. (2019). *Disco Elysium*.
18. Zachtronics. (2015). *TIS-100*.

### 3.2 Academic / industry references

1. Adams, E. (2014). *Fundamentals of Game Design* (3rd ed.). New Riders.
2. Hendrikx, M., Meijer, S., Van Der Velden, J., & Iosup, A. (2013). Procedural Content Generation for Games: A Survey. *ACM Transactions on Multimedia Computing, Communications, and Applications*, 9(1), 1–22.
3. Hunicke, R., LeBlanc, M., & Zubek, R. (2004). MDA: A Formal Approach to Game Design and Game Research. *Proceedings of the AAAI Workshop on Challenges in Game AI*.
4. Järvinen, A. (2008). *Games Without Frontiers: Theories and Methods for Game Studies and Design* [PhD dissertation, University of Tampere].
5. Salen, K., & Zimmerman, E. (2003). *Rules of Play: Game Design Fundamentals*. MIT Press.
6. Schell, J. (2019). *The Art of Game Design: A Book of Lenses* (3rd ed.). CRC Press.
7. Schreiber, I., & Romero, B. (2021). *Game Balance*. CRC Press.
8. Sicart, M. (2008). Defining Game Mechanics. *Game Studies*, 8(2).

*Submitted by Team Three-Way Merge — Gabriel Felipe Guarnieri, Hector Guarçoni Machado, Marcos Winícios Silva Martins.*
