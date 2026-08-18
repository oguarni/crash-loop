import { Game, type Mode } from './game';
import type { ButtonId } from './render';
import {
  draw,
  drawHelpOverlay,
  drawMenu,
  drawTitle,
  drawTutorial,
  isNodeKind,
  layoutButtons,
  layoutFooterRows,
  layoutHelpButton,
  layoutLevelSelect,
  layoutMenuButton,
  layoutMenuFullscreenButton,
  layoutRail,
  layoutTutorialButton,
} from './render';
import { images } from './images';
import * as audio from './audio';
import * as progress from './progress';
import { LEVELS } from './levels';
import {
  RAIL_W,
  VIEW_H,
  VIEW_W,
  WORK_BOTTOM,
  clampToWork,
  inflate,
  pointInRect,
  type Point,
  type Rect,
} from './layout';
import { installBoardGestureGuards, installRotateNudge } from './mobile';
import { exitFullscreen, fullscreenSupported, isFullscreen, toggleFullscreen } from './fullscreen';

const canvas = document.getElementById('screen') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas #screen not found');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d context unavailable');

// The canvas always draws in a fixed VIEW_W×VIEW_H logical space, but the CSS
// scales its on-screen size to fit the viewport (any resolution / aspect ratio).
// fitCanvas() sizes the backing store to that on-screen size × the device-pixel
// ratio — so text stays crisp at any scale — and sets the transform that maps the
// logical space onto it. The renderer and the input layer (toLogical) both keep
// working in logical units, unaware of the real pixel size.
function fitCanvas(): void {
  const rect = canvas!.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Cap the backing store so the per-frame CRT bloom blur stays cheap on very
  // large / hi-dpi displays; past ~3× the logical width it adds no visible detail.
  const scale = Math.min(dpr, (VIEW_W * 3) / cssW);
  canvas!.width = Math.round(cssW * scale);
  canvas!.height = Math.round(cssH * scale);
  // Resizing the canvas above resets the 2D context, so (re)apply the logical→
  // device transform every time. Non-uniform sx/sy absorbs any rounding so the
  // 960×600 space maps exactly onto the backing store with no drift.
  ctx!.setTransform(canvas!.width / VIEW_W, 0, 0, canvas!.height / VIEW_H, 0, 0);
}

// Refit whenever the canvas box changes — viewport resize, orientation flip, or
// dragging the window to a monitor with a different dpr. A dirty flag coalesces
// bursts to a single refit at the top of the next frame, and seeds the first
// sizing before the first draw. Observing the canvas (not window) also catches
// layout-only changes; the resize listener is a belt-and-braces fallback.
let needsFit = true;
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => {
    needsFit = true;
  }).observe(canvas);
}
window.addEventListener('resize', () => {
  needsFit = true;
});

let levelIndex = 0;
const levelIds = LEVELS.map((l) => l.id);
const makeGame = (i: number): Game => {
  const g = new Game(LEVELS[i], LEVELS[i + 1] ?? null);
  g.savedRecord = progress.recordFor(LEVELS[i].id); // load this level's saved best
  return g;
};
let game = makeGame(levelIndex);
const mouse: Point = { x: 0, y: 0 };

// Screen flow: the boot/title intro plays first, then a level-select menu the
// presenter can jump from into any level, then the level itself. Esc / the rail
// "menu" affordance returns to the menu. Cosmetic state only — never the sim.
type Screen = 'boot' | 'menu' | 'play';
let screen: Screen = 'boot';

// In-game help/legend overlay (the ? / H toggle). Cosmetic: it reads game state
// but never mutates it, and the input layer swallows clicks while it's open.
let helpOpen = false;

// Tutorial overlay (the T key). Auto-shown once before the first game (first-run
// state tracked in localStorage) and reopenable at any time. Cosmetic: it reads
// nothing from the sim, and the input layer swallows other input while it's open.
const TUT_KEY = 'crash-loop.tut.v1';
let tutorialOpen = false;
function tutorialSeen(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(TUT_KEY) === '1';
  } catch {
    return false;
  }
}
function closeTutorial(): void {
  tutorialOpen = false;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TUT_KEY, '1');
  } catch {
    /* quota / denied — best effort */
  }
}

// Per-level saved bests + cleared count, sampled fresh each time the menu opens
// so a level cleared this session shows its new tier on return.
let menuRecords: (progress.LevelRecord | null)[] = LEVELS.map((l) => progress.recordFor(l.id));
let menuCleared = progress.clearedCount(levelIds);

/** Refresh the menu's saved-best readout and show the level select. */
function openMenu(): void {
  menuRecords = LEVELS.map((l) => progress.recordFor(l.id));
  menuCleared = progress.clearedCount(levelIds);
  screen = 'menu';
}

/** Enter a level from the menu (reuses the same level-load path as Next). */
function startLevel(i: number): void {
  if (i < 0 || i >= LEVELS.length) return;
  levelIndex = i;
  game = makeGame(levelIndex);
  screen = 'play';
  audio.sfx.tool();
}

canvas.style.cursor = 'pointer';
installBoardGestureGuards(canvas);
installRotateNudge();

function toLogical(e: PointerEvent): Point {
  const rect = canvas!.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (VIEW_W / rect.width),
    y: (e.clientY - rect.top) * (VIEW_H / rect.height),
  };
}

// --- pointer gesture state -----------------------------------------------------

// One gesture at a time: the board follows a single pointer id, so a stray second
// finger can never fight the first over the node in hand.
let activePointerId: number | null = null;
let pressOrigin: Point | null = null;
let pressTravelled = false; // did the active press move past DRAG_SLOP while held?
let coarse = false; // the last pointer was a finger / pen — pad the small hit-boxes

// How far a press may wander and still count as a click rather than a drag. Six
// logical px is ~2 device px on a phone-sized board: tight enough that a tap
// stays a tap, loose enough to absorb the wobble of a fingertip.
const DRAG_SLOP = 6;

// Touch slack for hit-testing only, in logical px. The board is a fixed 960×600
// surface scaled to fit, so the small chrome shrinks to a couple of millimetres
// on a phone. Every pad stays under half the gap to that widget's nearest
// neighbour on that axis, so an inflated box can never swallow the row next to
// it — render.smoke.test.ts proves it for the tightest level.
const TOUCH_SLACK = {
  rail: { x: 3, y: 3 }, // rail rows sit 6px apart
  header: { x: 3, y: 9 }, // menu | help share one row 8px apart, but stand alone vertically
  footer: { x: 3, y: 4 }, // sound | full sit 8px apart; 8px under the last rail row, 10px over the HUD
  button: { x: 5, y: 5 }, // HUD buttons sit 10px apart; menu cards 16px and 24px
} as const;
const EDGE_SLACK = 7; // extra tolerance when tapping a wire (a radius, not a rect)

const NO_SLACK = { x: 0, y: 0 } as const;
function hit(p: Point, r: Rect, kind: keyof typeof TOUCH_SLACK): boolean {
  const s = coarse ? TOUCH_SLACK[kind] : NO_SLACK;
  return pointInRect(p.x, p.y, inflate(r, s.x, s.y));
}

// Fullscreen has to be requested from an event carrying transient user
// activation, and the two pointer types disagree on which event that is: HTML
// activates a mouse on pointerdown but a finger only on pointerup, and the
// preventDefault() on our pointerdown suppresses the compatibility click that
// would otherwise carry it. So a press on the toggle acts immediately for a
// mouse and parks the intent for a finger, which onUp then spends.
let fullscreenPending = false;

function pressFullscreenToggle(): void {
  if (coarse) fullscreenPending = true;
  else void toggleFullscreen();
}

function handleButton(id: ButtonId): void {
  if (id === 'run') game.run();
  else if (id === 'clear') game.reset();
  else if (id === 'back') game.backToEdit();
  else if (id === 'skip') game.skipToEnd();
  else if (id === 'pause') audio.sfx[game.togglePause() ? 'pause' : 'resume']();
  else if (id === 'next' && levelIndex < LEVELS.length - 1) {
    levelIndex += 1;
    game = makeGame(levelIndex);
  }
}

function onDown(p: Point): void {
  if (screen === 'boot') {
    audio.unlock();
    audio.sfx.boot();
    openMenu();
    if (!tutorialSeen()) tutorialOpen = true; // first run: greet with the tutorial
    return;
  }
  // a click anywhere dismisses the tutorial (drawn over the menu or a level)
  if (tutorialOpen) {
    closeTutorial();
    return;
  }
  if (screen === 'menu') {
    if (fullscreenSupported() && hit(p, layoutMenuFullscreenButton(), 'button')) {
      pressFullscreenToggle();
      return;
    }
    const card = layoutLevelSelect(LEVELS.length).find((c) => hit(p, c.rect, 'button'));
    if (card) startLevel(card.index);
    return;
  }
  // The help overlay swallows the click: only its own "how to play" affordance
  // acts, everything else just closes it without touching the board.
  if (helpOpen) {
    helpOpen = false;
    if (hit(p, layoutTutorialButton(), 'button')) tutorialOpen = true;
    return;
  }
  game.flash = null;

  const inWork = p.x > RAIL_W && p.y < WORK_BOTTOM;
  // A press on the chrome abandons a half-finished move: a node can only be put
  // down on the board, so reaching for the rail means "never mind", not "drop it
  // in the rail". The node springs back to where it was picked up.
  if (!inWork) game.cancelCarry();

  // component / tool rail
  if (p.x <= RAIL_W) {
    if (hit(p, layoutMenuButton(), 'header')) {
      openMenu();
      return;
    }
    if (hit(p, layoutHelpButton(), 'header')) {
      helpOpen = true;
      audio.sfx.tool();
      return;
    }
    const footer = layoutFooterRows(fullscreenSupported());
    if (hit(p, footer.mute, 'footer')) {
      audio.toggleMuted();
      return;
    }
    if (footer.fullscreen && hit(p, footer.fullscreen, 'footer')) {
      pressFullscreenToggle();
      return;
    }
    const item = layoutRail(game).find((i) => hit(p, i.rect, 'rail'));
    if (item) {
      const changed = game.tool !== item.tool;
      game.setTool(item.tool);
      if (changed) audio.sfx.tool();
    }
    return;
  }

  // hud buttons
  if (p.y >= WORK_BOTTOM) {
    const btn = layoutButtons(game).find((b) => hit(p, b.rect, 'button'));
    if (btn && btn.enabled) handleButton(btn.id);
    return;
  }

  // work area — editing only
  if (game.mode !== 'edit') return;
  const node = game.nodeAt(p.x, p.y);

  if (isNodeKind(game.tool)) {
    if (!node) {
      const pos = clampToWork(p.x, p.y);
      if (game.placeNode(game.tool, pos.x, pos.y)) audio.sfx.place();
    }
    return;
  }

  if (game.tool === 'move') {
    // Step two of the move: a node already in hand is put down right here. This
    // is the whole gesture on a touch screen — tap the node, tap the destination
    // — and it doubles as click-to-place for a mouse.
    if (game.carryId) {
      game.moveCarried(p.x, p.y);
      game.dropCarried();
      audio.sfx.place();
      return;
    }
    // Step one: pick the node up. Whether this ends as a drag (the press travels)
    // or as the first click of a two-click move (the press stays put) is decided
    // on release, in onUp.
    if (node) {
      game.beginCarry(node.id, p.x, p.y);
      audio.sfx.pick();
    } else {
      game.selectedNodeId = null;
    }
    return;
  }

  if (game.tool === 'wire') {
    if (node) {
      if (!game.wireFromId) {
        game.wireFromId = node.id;
        audio.sfx.pick();
      } else {
        const ok = game.connect(game.wireFromId, node.id);
        game.wireFromId = null;
        if (ok) audio.sfx.wire();
        else audio.sfx.reject();
      }
    } else {
      game.wireFromId = null;
    }
    return;
  }

  if (game.tool === 'delete') {
    if (node) {
      const before = game.nodes.length;
      game.deleteNode(node.id);
      if (game.nodes.length < before) audio.sfx.remove();
    } else {
      const edge = game.edgeAt(p.x, p.y, coarse ? 7 + EDGE_SLACK : 7);
      if (edge) {
        game.deleteEdge(edge.id);
        audio.sfx.remove();
      }
    }
  }
}

function onMove(p: Point): void {
  mouse.x = p.x;
  mouse.y = p.y;
  if (screen !== 'play') {
    canvas!.style.cursor = 'pointer';
    return;
  }

  if (pressOrigin && !pressTravelled && Math.hypot(p.x - pressOrigin.x, p.y - pressOrigin.y) > DRAG_SLOP) {
    pressTravelled = true;
  }
  // A carried node tracks the pointer, so a mouse drag and the follow-the-cursor
  // half of a two-click move are the same code — and it is a no-op when nothing is
  // in hand. Touch reports no movement between taps, which is exactly why the node
  // stays put until the second one.
  game.moveCarried(p.x, p.y);

  const inWork = p.x > RAIL_W && p.y < WORK_BOTTOM;
  game.hoverNodeId = inWork ? (game.nodeAt(p.x, p.y)?.id ?? null) : null;
  updateCursor(p);
}

function onUp(e: PointerEvent): void {
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  activePointerId = null;
  // A press that travelled is a drag: releasing puts the node down. A press that
  // stayed put is the first click of the two-step move, so the node stays in hand
  // until the next click — the only form the gesture can take on a touch screen.
  if (pressTravelled && game.carryId) {
    game.dropCarried();
    audio.sfx.place();
  }
  // A finger leaves no cursor behind, so its hover highlight would stick forever.
  if (coarse) game.hoverNodeId = null;
  // The tap that landed on the fullscreen toggle is only now carrying the user
  // activation the request needs (see pressFullscreenToggle).
  if (fullscreenPending) {
    fullscreenPending = false;
    void toggleFullscreen();
  }
  pressTravelled = false;
  pressOrigin = null;
}

/** The OS stole the gesture (call, notification shade, scroll takeover). */
function onCancel(e: PointerEvent): void {
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  activePointerId = null;
  // Only an in-flight drag is rolled back; a node parked in hand by a tap stays
  // there, because its second tap is still to come.
  if (pressTravelled) game.cancelCarry();
  fullscreenPending = false; // the gesture that asked for it never completed
  pressTravelled = false;
  pressOrigin = null;
}

function updateCursor(p: Point): void {
  let cursor = 'default';
  const inWork = p.x > RAIL_W && p.y < WORK_BOTTOM;
  if (p.x <= RAIL_W || p.y >= WORK_BOTTOM) {
    cursor = 'pointer';
  } else if (game.mode !== 'edit') {
    cursor = 'default';
  } else if (isNodeKind(game.tool)) {
    cursor = inWork && !game.nodeAt(p.x, p.y) ? 'copy' : 'not-allowed';
  } else if (game.tool === 'wire') {
    cursor = 'crosshair';
  } else if (game.tool === 'delete') {
    cursor = game.nodeAt(p.x, p.y) || game.edgeAt(p.x, p.y) ? 'pointer' : 'default';
  } else if (game.tool === 'move') {
    cursor = game.carryId ? 'grabbing' : game.nodeAt(p.x, p.y) ? 'grab' : 'default';
  }
  canvas!.style.cursor = cursor;
}

// Pointer events, not mouse events: they are the only input model a finger and a
// mouse share. Touch never produces a mousemove while pressed — the browser
// synthesises the whole mouse sequence *after* the finger lifts, at one point —
// so a mousedown/mousemove/mouseup board is unusable on a phone.
canvas.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary) return; // a second finger never starts a second gesture
  if (e.pointerType === 'mouse' && e.button !== 0) return; // left button only
  e.preventDefault(); // no text selection, no synthetic mouse events, no scroll
  // Re-arm audio from every press, not only the boot one: browsers differ on
  // which event counts as the user gesture that lifts their autoplay block, and
  // unlock() is idempotent (the ambient pad starts at most once).
  audio.unlock();
  coarse = e.pointerType !== 'mouse';
  activePointerId = e.pointerId;
  pressOrigin = toLogical(e);
  pressTravelled = false;
  fullscreenPending = false;
  // Capture keeps a drag alive when the pointer leaves the canvas, so a node
  // dragged toward the edge does not freeze halfway.
  try {
    canvas!.setPointerCapture(e.pointerId);
  } catch {
    /* unsupported — the window-level up/cancel listeners still end the gesture */
  }
  onDown(pressOrigin);
});
canvas.addEventListener('pointermove', (e) => {
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  coarse = e.pointerType !== 'mouse';
  onMove(toLogical(e));
});
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onCancel);
window.addEventListener('keydown', (e) => {
  // F works before the game does: the hint line under the board advertises it
  // from the boot screen on, and filling the screen is never a gameplay action.
  if (e.key === 'f' || e.key === 'F') {
    void toggleFullscreen();
    return;
  }
  if (screen === 'boot') {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 't' || e.key === 'T') {
      e.preventDefault();
      audio.unlock();
      audio.sfx.boot();
      openMenu();
      if (e.key === 't' || e.key === 'T' || !tutorialSeen()) tutorialOpen = true;
    }
    return;
  }
  // the tutorial swallows every key but its own close keys (Esc / T / Enter / Space)
  if (tutorialOpen) {
    if (e.key === 'Escape' || e.key === 't' || e.key === 'T' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      closeTutorial();
    }
    return;
  }
  if (screen === 'menu') {
    // number keys jump straight to a level — keyboard-reachable so a live demo
    // never has to fumble a click.
    if (e.key >= '1' && e.key <= '9') startLevel(Number(e.key) - 1);
    else if (e.key === 't' || e.key === 'T') tutorialOpen = true;
    return;
  }
  // while help is open it swallows every gameplay key, so a run can't be paused,
  // skipped, or edited from behind the overlay — only its own close keys act.
  if (helpOpen) {
    if (e.key === '?' || e.key === 'h' || e.key === 'H' || e.key === 'Escape') helpOpen = false;
    return;
  }
  if (e.key === '?' || e.key === 'h' || e.key === 'H') {
    helpOpen = true;
  } else if (e.key === 't' || e.key === 'T') {
    tutorialOpen = true;
  } else if (e.key === 'm' || e.key === 'M') {
    audio.toggleMuted();
  } else if (e.key === 'Escape') {
    // Unwind one layer at a time: a node in hand goes back where it came from,
    // then a pending wire/selection clears, then fullscreen, and only a "clean"
    // Esc leaves the level. Fullscreen belongs in that order because Esc is also
    // the browser's own exit key: without this layer, one press would drop the
    // window *and* throw away the topology being built, since re-entering a
    // level starts it fresh.
    if (game.cancelCarry()) {
      /* the carried node sprang back — that was this Esc's job */
    } else if (game.wireFromId || game.selectedNodeId) {
      game.wireFromId = null;
      game.selectedNodeId = null;
    } else if (isFullscreen()) {
      void exitFullscreen();
    } else {
      openMenu();
    }
  } else if ((e.key === 'p' || e.key === 'P' || e.key === ' ') && game.mode === 'running') {
    e.preventDefault();
    audio.sfx[game.togglePause() ? 'pause' : 'resume']();
  } else if (e.key === 'Enter' && game.mode === 'edit' && !game.overBudget()) {
    game.run();
  }
});

// playback clock: advance the simulation at a fixed, deterministic tick rate
const TICKS_PER_SEC = 14;
let last = 0;
let accumulator = 0;
// flow clock: advances only while a run is playing and unpaused, so packets and
// edge dashes freeze on pause. Cosmetic only — never feeds the deterministic sim.
let flowTime = 0;

// audio bookkeeping (cosmetic only — never feeds the deterministic sim)
let prevMode: Mode = game.mode;
let prevPlayhead = 0;
let lastAlarm = 0;

function frame(ts: number): void {
  if (needsFit) {
    fitCanvas();
    needsFit = false;
  }
  if (screen === 'boot') {
    drawTitle(ctx!, images, ts, menuCleared, levelIds.length);
    last = ts; // keep the first gameplay frame's dt sane
    requestAnimationFrame(frame);
    return;
  }
  if (screen === 'menu') {
    drawMenu(ctx!, images, LEVELS, menuRecords, mouse, menuCleared);
    if (tutorialOpen) drawTutorial(ctx!);
    last = ts;
    requestAnimationFrame(frame);
    return;
  }

  const dt = last ? (ts - last) / 1000 : 0;
  last = ts;

  // A run starts from clean cosmetic clocks: packets always set off from ingress,
  // and the heartbeat never fires on tick 0 because the previous run's playhead
  // was left behind. Must happen before the playback and audio blocks below,
  // which both read these on the run's very first frame.
  if (game.mode === 'running' && prevMode !== 'running') {
    flowTime = 0;
    accumulator = 0;
    prevPlayhead = 0;
  }

  if (game.mode === 'running' && !game.paused) {
    accumulator += dt * TICKS_PER_SEC;
    flowTime += dt * 1000;
    if (accumulator >= 1) {
      const steps = Math.floor(accumulator);
      accumulator -= steps;
      game.advancePlayback(steps);
    }
  } else {
    accumulator = 0;
  }

  // running feedback: a faint heartbeat every few ticks + an overload alarm
  if (game.mode === 'running' && !game.paused) {
    if (Math.floor(game.playhead / 5) !== Math.floor(prevPlayhead / 5)) audio.sfx.tick();
    const tk = game.currentTick();
    if (tk && tk.dropped > 0 && ts - lastAlarm > 150) {
      audio.sfx.overload();
      lastAlarm = ts;
    }
  }
  prevPlayhead = game.playhead;

  // stingers on state transitions: run start, and the pass / gold / fail verdict
  if (game.mode !== prevMode) {
    if (game.mode === 'running') audio.sfx.run();
    else if (game.mode === 'result' && game.result) {
      const r = game.result;
      if (r.gold) audio.sfx.gold();
      else if (r.passed) audio.sfx.pass();
      else audio.sfx.fail();

      // fold the verdict into persistent scoring, then surface the new best
      const tier: progress.Tier = r.gold ? 'gold' : r.passed ? 'pass' : 'none';
      const { record, improved } = progress.submit(game.level.id, {
        tier,
        cost: r.cost,
        cycles: r.cycles,
        coverage: r.coverage,
        served: r.totalServed,
        dropped: r.totalDropped,
      });
      game.savedRecord = record;
      game.newBest = improved && tier !== 'none';
    }
    prevMode = game.mode;
  }

  draw(ctx!, game, mouse, ts, images, flowTime);
  if (helpOpen) drawHelpOverlay(ctx!, game);
  if (tutorialOpen) drawTutorial(ctx!);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
