# Plan B — Secondary track (Hector) · Presentation Layer & Content

> **How to use this file:** in `G:\Workspace\oguarni\crash-loop`, open a fresh AI‑agent
> session and send: **"Read and execute `docs/plans/PLAN-B-secondary-hector.md`."**
> **Wait until Gabriel says `main` is green (Plan A · Phase 0) before you branch.**

---

## 0. Required context (read every session, before touching code)

1. **Read `G:\Workspace\oguarni\Project Guidelines.md` first and treat it as binding.**
   It lives *outside* this repo (parent workspace folder). Highest priorities:
   **STABILITY → SECURITY → everything else.** And: **English only** in all code,
   comments, identifiers, logs, and commit messages.
2. Skim `README.md` (design pillars + controls) and `Activity-1.md` (course brief, Team
   *Three‑Way Merge*: Gabriel · Hector · Marcos).
3. **TypeScript + Vite 5** canvas game. Node 24 / npm 11 installed.
   `npm install` then `npm run dev` opens the playable build.

### Verified baseline (already checked — don't re‑discover)

| Fact | State |
|------|-------|
| Branch to start from | **`main`, only after Gabriel confirms it is green.** If `npm run build` fails, stop and ping him — do not branch off a broken build. |
| Content | Levels **L01–L06** shipped; all node kinds live; boots with **zero console errors** |
| Level flow today | `main.ts` starts at `levelIndex = 0`; you can only reach later levels by clearing the current one and pressing **Next**. There is **no level‑select** — this is the #1 demo problem to solve. |
| Multi‑axis scoring | The **data is already there**: `game.result` carries `cost`, `cycles`, `coverage`, `gold`, `passed`; `progress.ts` stores `bestCost`/`bestCycles`/`bestCoverage` and a `newBest` flag. The gap is that `render.ts` likely shows only **cost** — you surface the other two. Don't touch the scoring math. |
| Aesthetic | Monospace/terminal, CRT‑tinted palette (`palette.ts`), audio + SFX + stingers (`audio.ts`), title screen with a cleared‑region count |
| Font risk | `index.html` pulls **IBM Plex Mono from Google Fonts over the network** — a live‑demo hazard if venue wifi is flaky. Self‑hosting it is one of your tasks. |

### Your ownership boundary (to run conflict‑free next to Gabriel)

**You own:** `src/render.ts` (the 853‑line canvas renderer), `src/main.ts` (input, title,
playback loop), `src/audio.ts`, `src/palette.ts`, `src/images.ts`, `index.html`,
`public/**`, and any new `src/levels/L0x.ts` (+ the one‑line register in `src/levels/index.ts`).

**Gabriel owns (do NOT edit):** `src/types.ts`, `src/sim/**`, `src/game.ts`, `src/progress.ts`,
`scripts/**`, test files, `package.json`, `tsconfig.json`, `.github/**`.

**Shared contract:** read from the `game.result` / `savedRecord` shape (`cost`, `cycles`,
`coverage`, `gold`, `passed`, `newBest`) — it's already populated. **Consume it read‑only;**
never rename or remove fields. Need a new one? Ask Gabriel to add it on his side.

Branch: `git switch -c feat/presentation-ux` (from green `main`).

---

## Phase 1 — Title‑screen level select (HIGHEST demo value — do this first)

A presenter must be able to jump straight to any mechanic (e.g. L06 queues) without
solving L01–L05 live.

- [ ] In `render.ts`, add a level grid/list to the title screen: one entry per `LEVELS[i]`
      showing its id + name, the saved best tier (via `progress.recordFor`), and a subtle
      lock/clear state. Return hit‑regions the way the existing rail/buttons do.
- [ ] In `main.ts`, on click/number‑key of an entry, set `levelIndex` and start that level
      (reuse `makeGame(i)`). Add a way back to the menu (e.g. an `Esc`/"Menu" affordance).
- [ ] Keep it **fully keyboard‑reachable** (number keys 1–6) so the demo never fumbles a click.

**Acceptance:** from the title screen you can open any of L01–L06 directly; saved bests show per entry.

---

## Phase 2 — Surface the multi‑axis score (data already exists; just render it)

- [ ] On the **result banner**, next to cost, show **cycles** (⟳, request‑ticks buffered)
      and **coverage** (% of services behind a CI gate) from `game.result`, each with its
      saved best from `game.savedRecord` and the **NEW BEST** flag when `game.newBest`.
- [ ] Mirror the same per‑axis bests in the left rail's saved‑best readout.
- [ ] Gracefully render `0` / `—` where an axis doesn't apply to a level (no `NaN`, no blanks).

**Acceptance:** clearing a level shows cost + cycles + coverage with correct bests; a record run flags NEW BEST.

---

## Phase 3 — In‑game help / legend overlay (so the audience follows along)

- [ ] Add a toggle (`?` or `H`) that draws a translucent overlay: the control list (place /
      wire / move / delete / Run / Pause / mute) and a one‑line description of each node kind
      present in the current level. Toggle again or `Esc` to dismiss.
- [ ] Overlay is cosmetic only — it must **not** affect the deterministic sim or input while a run plays.

**Acceptance:** `?` opens/closes a readable legend over any level; no console errors; sim unaffected.

---

## Phase 4 — Terminal polish (CRT mood)

- [ ] `render.ts`: a light scanline/vignette/glow post‑pass over the canvas — tasteful, not a
      readability tax. Gate it behind a constant so it's easy to dial down for a projector.
- [ ] `palette.ts`: tighten contrast; sanity‑check the palette is colorblind‑distinguishable
      (don't rely on red/green alone for pass/fail — pair with shape/label).
- [ ] `audio.ts`: add a low ambient loop and balance SFX; it must respect the existing mute
      (`M`) and the `audio.unlock()` gesture. Keep audio strictly cosmetic (never feeds the sim).

**Acceptance:** the CRT layer reads well on a projector and can be toned down via one constant; mute still silences everything.

---

## Phase 5 — Offline‑proof the font (remove the live‑demo network dependency)

- [ ] Download the IBM Plex Mono weights the game uses into `public/fonts/`, add an
      `@font-face` (inlined in `index.html`'s `<style>` or a local css), and **remove the
      Google Fonts `<link>`**. Keep `ui-monospace, "Courier New", monospace` as the fallback.
- [ ] Rebuild and confirm the page renders the right font with **networking disabled**.

**Acceptance:** `npm run build && npm run preview` shows IBM Plex Mono with no external network request.

---

## Phase 6 — (Stretch, only if the above is solid) L07 finale level

- [ ] Add `src/levels/L07.ts` combining mechanics (e.g. cache + queue under chaos) as a demo
      finale, and append one line to `src/levels/index.ts` to register it (this is your file).
- [ ] **Coordinate with Gabriel**: he adds the matching engine assertion/gold‑cost check on his
      test side so the new level is verified. Give him the intended gold topology + par cost.

**Acceptance:** L07 appears in the level select, is solvable at its stated gold cost, and Gabriel's tests cover it.

---

## Working agreement

- Small, focused commits; imperative English subject lines; reference the phase.
- **Never edit a file in Gabriel's ownership list.** The `SimResult`/`RunResult` shape is a
  read‑only contract — if you need a new field, ask him to add it.
- Rebase onto `main` before opening your PR so Gabriel's CI/tests run against your changes.
- Rely on the formatter's defaults; don't bikeshed style.
- End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Verify in the real browser** (Playwright or `npm run preview`) after each phase — every task
  here is visual, so a green typecheck is not proof it looks right. Check the deployed Pages URL too.

## Priority if time is short (keep the demo safe)
**Must‑have:** Phase 1 (level select) + Phase 5 (offline font). **Should‑have:** Phase 2 (multi‑axis display) + Phase 3 (help overlay). **Nice‑to‑have:** Phase 4 polish, Phase 6 L07.
