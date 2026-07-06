# Plan A — Primary track (Gabriel) · Foundation, Correctness & Shipping

> **How to use this file:** open a fresh Claude Code session in `G:\Workspace\oguarni\crash-loop`
> and send: **"Read and execute `docs/plans/PLAN-A-primary-gabriel.md`."**
> Work top‑to‑bottom. Phase 0 is a hard blocker for the whole team — land it first.

---

## 0. Required context (read every session, before touching code)

1. **Read `G:\Workspace\oguarni\Project Guidelines.md` first and treat it as binding.**
   It lives *outside* this repo (parent workspace folder) and is not committed here.
   Highest priorities, in order: **STABILITY → SECURITY → everything else**. Also
   non‑negotiable for this course repo: **English only** in all code, comments,
   identifiers, logs, and commit messages.
2. Skim `README.md` (game design + architecture) and `Activity-1.md` (the course brief,
   Team *Three‑Way Merge*: Gabriel · Hector · Marcos).
3. This is a **TypeScript + Vite 5** canvas game. Node 24 / npm 11 are installed.

### Verified baseline (already checked — don't re‑discover, just confirm still true)

| Fact | State |
|------|-------|
| Remote / branch | `github.com/oguarni/crash-loop`, on `main` |
| **Committed `main` build** | **BROKEN** — `tsc` fails: `ChaosSpec` is referenced by `src/sim/engine.ts` + `src/types.ts` but was never committed |
| Uncommitted working‑tree fix | `src/types.ts` — adds the missing `ChaosSpec` interface, adds `totalLatency` + `coverage` to `SimResult`, and **deletes a duplicate `SimResult` line carrying a Portuguese comment** (`// em SimResult:`) that violates the English‑only rule |
| With that fix | `npm run typecheck` ✅ · `npm run build` ✅ (~37 KB bundle) · `npm run test:sim` ✅ **38/38** · boots in browser with **zero console errors** |
| Content | Levels **L01–L06** all shipped; every node kind live (ingress, load‑balancer, service, ci‑gate, cache, queue) |
| Multi‑axis scoring | **Already wired through the data layer** — `progress.ts` (v2) stores `bestCost`/`bestCycles`/`bestCoverage`; `main.ts` already submits `cycles`+`coverage`. The gap is **display**, which belongs to Hector's track. Do not rebuild the scoring model. |
| Tests | Only a bespoke `scripts/sim-check.ts` harness (esbuild+node, 38 assertions). No test framework, no coverage reporting — a gap vs. the Guidelines. |
| Deploy | `vite base:'./'` is already deploy‑ready; `dist/` is git‑ignored; **no `.github/` workflows exist yet** |

### Your ownership boundary (to run conflict‑free next to Hector)

**You own:** `src/types.ts`, `src/sim/**`, `src/game.ts`, `src/progress.ts`, `scripts/**`,
all test files (`**/*.test.ts`, `vitest.config.ts`), `package.json`, `tsconfig.json`,
`.github/**`, and the *Run/Deploy* sections of `README.md`.

**Hector owns (do NOT edit):** `src/render.ts`, `src/main.ts`, `src/audio.ts`,
`src/palette.ts`, `src/images.ts`, `index.html`, `public/**`, and new `src/levels/L0x.ts`.

**Shared contract:** the `SimResult` / `RunResult` field shape (`cost`, `cycles`,
`coverage`, `gold`, `passed`, `totalServed`, `totalDropped`). You may *add* fields;
never rename or remove one Hector reads. If you must change the shape, say so in the PR
description so Hector can rebase.

---

## Phase 0 — Green baseline (BLOCKER · land on `main` before anyone builds a feature)

This is the "common ancestor" the whole three‑way merge depends on. Keep it tiny.

- [ ] `git switch -c chore/green-baseline`
- [ ] Confirm the only working‑tree change is the `src/types.ts` fix: `git status` → `M src/types.ts`.
- [ ] Re‑verify the fix is complete and correct: `npm run typecheck && npm run test:sim && npm run build` all green.
- [ ] Commit **only** `src/types.ts`:
  ```
  fix: restore ChaosSpec + multi-axis SimResult fields so the build type-checks

  main did not compile: engine.ts and types.ts referenced ChaosSpec, which was
  never committed, and a duplicate SimResult declaration carried a non-English
  comment. Define ChaosSpec, add totalLatency/coverage to the canonical
  SimResult, and drop the duplicate. Restores tsc --noEmit and vite build.
  ```
- [ ] Merge to `main` immediately (fast‑forward) and push: this unblocks Hector.
  ```
  git switch main && git merge --ff-only chore/green-baseline && git push origin main
  ```
- [ ] **Tell Hector:** "`main` is green — branch your work from it." (He must not branch off the broken commit.)

**Acceptance:** a clean clone of `main` runs `npm ci && npm run build` with exit 0.

---

## Phase 1 — Real test suite (Guidelines: >80% overall, >95% for `sim/` + `game.ts`)

Branch: `git switch -c feat/tests-ci-deploy` (from the updated `main`).

Introduce **Vitest** (native Vite integration) alongside the existing sim‑check harness.

- [ ] Add dev deps: `vitest`, `@vitest/coverage-v8`, `jsdom`. (`npm i -D vitest @vitest/coverage-v8 jsdom`)
- [ ] `vitest.config.ts`: default `environment: 'node'` (the sim/game/progress logic is pure);
      use a per‑file `// @vitest-environment jsdom` only where a DOM/`localStorage` global is needed.
      Enable v8 coverage with thresholds: `lines/functions/branches/statements` ≥ 80 global,
      and ≥ 95 for `src/sim/**` and `src/game.ts`.
- [ ] `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`,
      `"coverage": "vitest run --coverage"`. **Keep `test:sim` as the fast smoke alias.**
- [ ] **Port** `scripts/sim-check.ts` assertions into real specs:
  - `src/sim/engine.test.ts` — per‑level flow (L01–L06): zero‑drop golds, conservation
    (`served + dropped === arrived`), cache miss‑forwarding, queue buffer peak/drain,
    **L05 chaos determinism across seeds**, DAG cycle rejection, budget/error‑budget edges.
  - `src/game.test.ts` — board rules in isolation: place/overlap‑nudge, wire (reject
    cycles + illegal targets), delete node/edge, `resolveOverlap`, `overBudget` guard,
    `requireBeforeSinks` gate rule, run→result tiering.
  - `src/progress.test.ts` — `mergeRecord` per‑axis best logic (lower cost/cycles, higher
    coverage, tier monotonicity, failed runs never set records). Mock `localStorage` with a
    **named fake class** (`class FakeStorage implements Storage {…}`), not an inline stub, per the Guidelines.
- [ ] Meet the coverage thresholds. If a branch is genuinely untestable, justify it in a comment, don't lower the bar silently.

**Acceptance:** `npm run test` green, `npm run coverage` meets thresholds, `npm run test:sim` still 38/38.

---

## Phase 2 — CI + live GitHub Pages URL (the presentation must run from a link, not a laptop)

- [ ] `.github/workflows/ci.yml` — on push + PR: `npm ci` → `npm run typecheck` → `npm run test` → `npm run build`.
- [ ] `.github/workflows/deploy.yml` — on push to `main`: build and publish `dist/` to Pages.
      Use `actions/configure-pages`, `actions/upload-pages-artifact` (path `dist`),
      `actions/deploy-pages`; `permissions: { pages: write, id-token: write, contents: read }`;
      a `concurrency` group so deploys don't overlap.
- [ ] **One‑time manual step (tell the user to do this):** GitHub → repo **Settings → Pages →
      Source: GitHub Actions**. (Or `gh api -X POST repos/oguarni/crash-loop/pages -f build_type=workflow`.)
- [ ] After the first successful deploy, capture the URL (`https://oguarni.github.io/crash-loop/`)
      and add a **"Play it live"** line to `README.md`.

**Acceptance:** green CI badge on a PR; visiting the Pages URL boots the title screen and plays.

---

## Phase 3 — End‑to‑end verification (presentation insurance)

- [ ] Run the `/verify` skill, or drive the built app with the Playwright browser tools:
      `npm run preview` → navigate → boot → on **L01** place the gold topology
      (ingress → load‑balancer → 3 services), wire, **Run**, and assert the **GOLD** banner appears.
- [ ] Smoke that **each** level L01–L06 loads and Runs without a console error.
- [ ] Confirm the deployed Pages URL behaves identically to local preview (this is where you present from).

**Acceptance:** a human can reach GOLD on L01 in the browser; no console errors on any level.

---

## Working agreement

- Small, focused commits; imperative English subject lines; reference the phase.
- Never edit a file in **Hector's** ownership list — if you think you need to, coordinate instead.
- Rely on the formatter's defaults (Prettier/tsc); don't hand‑bikeshed style.
- End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Open a PR into `main` per feature branch; let CI gate the merge.

## Priority if time is short (keep the demo safe)
**Must‑have:** Phase 0 → Phase 2 (green build + live URL). **Should‑have:** Phase 1 (tests/coverage — the biggest SE‑course quality win). **Nice‑to‑have:** Phase 3 polish beyond the L01 GOLD check.
