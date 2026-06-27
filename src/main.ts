import { Game, type Mode } from './game';
import type { ButtonId } from './render';
import { draw, drawTitle, isNodeKind, layoutButtons, layoutMuteButton, layoutRail } from './render';
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
  pointInRect,
  type Point,
} from './layout';

const canvas = document.getElementById('screen') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas #screen not found');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d context unavailable');

// Render at device-pixel resolution for crisp text; CSS keeps the on-screen size.
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = VIEW_W * dpr;
canvas.height = VIEW_H * dpr;
ctx.scale(dpr, dpr);

let levelIndex = 0;
const levelIds = LEVELS.map((l) => l.id);
const makeGame = (i: number): Game => {
  const g = new Game(LEVELS[i], LEVELS[i + 1] ?? null);
  g.savedRecord = progress.recordFor(LEVELS[i].id); // load this level's saved best
  return g;
};
let game = makeGame(levelIndex);
// Cleared-level count for the title screen, sampled at load (the title only
// shows before any play, so it never needs to update mid-session).
const titleCleared = progress.clearedCount(levelIds);
const mouse: Point = { x: 0, y: 0 };

// The game opens on the boot/title screen; the first click or Enter starts L01.
let booted = false;
canvas.style.cursor = 'pointer';

function toLogical(e: MouseEvent): Point {
  const rect = canvas!.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (VIEW_W / rect.width),
    y: (e.clientY - rect.top) * (VIEW_H / rect.height),
  };
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
  if (!booted) {
    booted = true;
    audio.unlock();
    audio.sfx.boot();
    return;
  }
  game.flash = null;

  // component / tool rail
  if (p.x <= RAIL_W) {
    if (pointInRect(p.x, p.y, layoutMuteButton())) {
      audio.toggleMuted();
      return;
    }
    const item = layoutRail(game).find((i) => pointInRect(p.x, p.y, i.rect));
    if (item) {
      const changed = game.tool !== item.tool;
      game.setTool(item.tool);
      if (changed) audio.sfx.tool();
    }
    return;
  }

  // hud buttons
  if (p.y >= WORK_BOTTOM) {
    const btn = layoutButtons(game).find((b) => pointInRect(p.x, p.y, b.rect));
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
    if (node) {
      game.draggingId = node.id;
      game.dragOffX = p.x - node.x;
      game.dragOffY = p.y - node.y;
      game.selectedNodeId = node.id;
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
      const edge = game.edgeAt(p.x, p.y);
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
  if (!booted) {
    canvas!.style.cursor = 'pointer';
    return;
  }

  if (game.draggingId && game.mode === 'edit') {
    const n = game.nodes.find((node) => node.id === game.draggingId);
    if (n) {
      const pos = clampToWork(p.x - game.dragOffX, p.y - game.dragOffY);
      n.x = pos.x;
      n.y = pos.y;
    }
  }

  const inWork = p.x > RAIL_W && p.y < WORK_BOTTOM;
  game.hoverNodeId = inWork ? (game.nodeAt(p.x, p.y)?.id ?? null) : null;
  updateCursor(p);
}

function onUp(): void {
  // a node dropped on top of another is nudged to the nearest free slot
  if (game.draggingId) game.resolveOverlap(game.draggingId);
  game.draggingId = null;
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
    cursor = game.draggingId ? 'grabbing' : game.nodeAt(p.x, p.y) ? 'grab' : 'default';
  }
  canvas!.style.cursor = cursor;
}

canvas.addEventListener('mousedown', (e) => onDown(toLogical(e)));
canvas.addEventListener('mousemove', (e) => onMove(toLogical(e)));
window.addEventListener('mouseup', onUp);
window.addEventListener('keydown', (e) => {
  if (!booted) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      booted = true;
      audio.unlock();
      audio.sfx.boot();
    }
    return;
  }
  if (e.key === 'm' || e.key === 'M') {
    audio.toggleMuted();
  } else if (e.key === 'Escape') {
    game.wireFromId = null;
    game.selectedNodeId = null;
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
  if (!booted) {
    drawTitle(ctx!, images, ts, titleCleared, levelIds.length);
    last = ts; // keep the first gameplay frame's dt sane
    requestAnimationFrame(frame);
    return;
  }

  const dt = last ? (ts - last) / 1000 : 0;
  last = ts;

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
        served: r.totalServed,
        dropped: r.totalDropped,
      });
      game.savedRecord = record;
      game.newBest = improved && tier !== 'none';
    }
    prevMode = game.mode;
  }

  draw(ctx!, game, mouse, ts, images, flowTime);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
