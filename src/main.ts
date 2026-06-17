import { Game } from './game';
import type { ButtonId } from './render';
import { draw, isNodeKind, layoutButtons, layoutRail } from './render';
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
const makeGame = (i: number): Game => new Game(LEVELS[i], LEVELS[i + 1] ?? null);
let game = makeGame(levelIndex);
const mouse: Point = { x: 0, y: 0 };

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
  else if (id === 'next' && levelIndex < LEVELS.length - 1) {
    levelIndex += 1;
    game = makeGame(levelIndex);
  }
}

function onDown(p: Point): void {
  game.flash = null;

  // component / tool rail
  if (p.x <= RAIL_W) {
    const item = layoutRail(game).find((i) => pointInRect(p.x, p.y, i.rect));
    if (item) game.setTool(item.tool);
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
      game.placeNode(game.tool, pos.x, pos.y);
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
      if (!game.wireFromId) game.wireFromId = node.id;
      else {
        game.connect(game.wireFromId, node.id);
        game.wireFromId = null;
      }
    } else {
      game.wireFromId = null;
    }
    return;
  }

  if (game.tool === 'delete') {
    if (node) {
      game.deleteNode(node.id);
    } else {
      const edge = game.edgeAt(p.x, p.y);
      if (edge) game.deleteEdge(edge.id);
    }
  }
}

function onMove(p: Point): void {
  mouse.x = p.x;
  mouse.y = p.y;

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
  if (e.key === 'Escape') {
    game.wireFromId = null;
    game.selectedNodeId = null;
  } else if (e.key === 'Enter' && game.mode === 'edit' && !game.overBudget()) {
    game.run();
  }
});

// playback clock: advance the simulation at a fixed, deterministic tick rate
const TICKS_PER_SEC = 14;
let last = 0;
let accumulator = 0;

function frame(ts: number): void {
  const dt = last ? (ts - last) / 1000 : 0;
  last = ts;

  if (game.mode === 'running') {
    accumulator += dt * TICKS_PER_SEC;
    if (accumulator >= 1) {
      const steps = Math.floor(accumulator);
      accumulator -= steps;
      game.advancePlayback(steps);
    }
  } else {
    accumulator = 0;
  }

  draw(ctx!, game, mouse, ts);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
