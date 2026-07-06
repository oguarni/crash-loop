import type { GameNode, LevelSpec, NodeKind, SimTick } from './types';
import type { Game, Tool } from './game';
import type { LevelRecord } from './progress';
import { NODE_SPECS } from './sim/nodes';
import { palette, tint } from './palette';
import { type GameImages, ready } from './images';
import { isMuted } from './audio';
import {
  HUD_H,
  NODE_H,
  NODE_W,
  RAIL_W,
  VIEW_H,
  VIEW_W,
  WORK_BOTTOM,
  WORK_LEFT,
  WORK_TOP,
  pointInRect,
  type Point,
  type Rect,
} from './layout';

const MONO = "'IBM Plex Mono', ui-monospace, 'Courier New', monospace";
// CRT phosphor glow (bloom): a blurred copy of the scene added back on top, so
// bright green/amber elements bleed light. Set BLOOM_ALPHA to 0 to disable.
const BLOOM_ALPHA = 0.35; // glow strength
const BLOOM_BLUR = 5; // glow spread, in logical px
const BLOOM_THRESHOLD = 3;    // >1 esmaga fundo/grade até o preto; só o brilhante sobra

// Wall-clock ms when the boot screen first drew, used for its one-time intro.
let titleT0 = 0;

function font(size: number, weight = 500): string {
  return `${weight} ${size}px ${MONO}`;
}

export function isNodeKind(t: Tool): t is NodeKind {
  return t === 'ingress' || t === 'load-balancer' || t === 'service' || t === 'gate' || t === 'cache' || t === 'queue';
}

// --- hit-region layouts (shared by draw + input) -------------------------------

export interface RailItem {
  tool: Tool;
  label: string;
  glyph: string;
  cost?: number;
  rect: Rect;
}

export function layoutRail(game: Game): RailItem[] {
  const items: RailItem[] = [];
  const pad = 12;
  const rowW = RAIL_W - pad * 2;
  let y = 112; // leaves room for the header + best readout + the "menu" affordance

  for (const kind of game.level.palette) {
    const spec = NODE_SPECS[kind];
    items.push({ tool: kind, label: spec.label, glyph: spec.glyph, cost: spec.cost, rect: { x: pad, y, w: rowW, h: 48 } });
    y += 56;
  }

  y += 36; // leave room for the TOOLS header
  const tools: Array<{ tool: Tool; label: string; glyph: string }> = [
    { tool: 'move', label: 'move', glyph: '::' },
    { tool: 'wire', label: 'wire', glyph: '->' },
    { tool: 'delete', label: 'delete', glyph: 'x' },
  ];
  for (const t of tools) {
    items.push({ tool: t.tool, label: t.label, glyph: t.glyph, rect: { x: pad, y, w: rowW, h: 38 } });
    y += 44;
  }
  return items;
}

export type ButtonId = 'clear' | 'run' | 'back' | 'skip' | 'next' | 'pause';

export interface Button {
  id: ButtonId;
  label: string;
  rect: Rect;
  enabled: boolean;
  primary: boolean;
}

export function layoutButtons(game: Game): Button[] {
  const h = 34;
  const w = 98;
  const gap = 10;
  const pad = 16;
  const y = WORK_BOTTOM + (HUD_H - h) / 2;

  const defs: Array<Omit<Button, 'rect'>> = [];
  if (game.mode === 'edit') {
    const dirty = game.nodes.length > game.level.initialNodes.length || game.edges.length > 0;
    defs.push({ id: 'clear', label: 'Clear', enabled: dirty, primary: false });
    defs.push({ id: 'run', label: 'Run >', enabled: !game.overBudget(), primary: true });
  } else if (game.mode === 'running') {
    defs.push({ id: 'pause', label: game.paused ? 'Resume' : 'Pause', enabled: true, primary: false });
    defs.push({ id: 'skip', label: 'Skip >>', enabled: true, primary: true });
  } else {
    defs.push({ id: 'clear', label: 'Clear', enabled: true, primary: false });
    const advance = game.result?.passed === true && game.nextLevel !== null;
    defs.push({ id: 'back', label: 'Edit', enabled: true, primary: !advance });
    if (advance) defs.push({ id: 'next', label: 'Next >', enabled: true, primary: true });
  }

  const totalW = defs.length * w + (defs.length - 1) * gap;
  let x = VIEW_W - pad - totalW;
  return defs.map((d) => {
    const button: Button = { ...d, rect: { x, y, w, h } };
    x += w + gap;
    return button;
  });
}

/** Sound on/off toggle, in the rail's free space above the HUD (also the M key). */
export function layoutMuteButton(): Rect {
  return { x: 12, y: WORK_BOTTOM - 30, w: RAIL_W - 24, h: 20 };
}

/** "Back to menu" affordance, tucked under the rail header (also the Esc key). */
export function layoutMenuButton(): Rect {
  return { x: 12, y: 74, w: RAIL_W - 24, h: 20 };
}

// --- small canvas helpers ------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

function rrect(ctx: Ctx, r: Rect, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

function label(ctx: Ctx, s: string, x: number, y: number, color: string, size = 13, weight = 500, align: CanvasTextAlign = 'left'): void {
  ctx.fillStyle = color;
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

/** Like `label`, but wraps `text` to `maxWidth`, drawing top-anchored lines.
 *  Returns the y of the last line drawn. */
function labelWrapped(
  ctx: Ctx, text: string, x: number, y: number, maxWidth: number,
  color: string, size = 13, weight = 500, lineHeight = 15,
): number {
  ctx.fillStyle = color;
  ctx.font = font(size, weight);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}

function center(target: Point): Point {
  return { x: target.x, y: target.y };
}

/** Point on a node's box boundary, in the direction of `towards`. */
function boxEdge(target: Point, towards: Point): Point {
  const dx = towards.x - target.x;
  const dy = towards.y - target.y;
  if (dx === 0 && dy === 0) return center(target);
  const hw = NODE_W / 2;
  const hh = NODE_H / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: target.x + dx * scale, y: target.y + dy * scale };
}

/** The tick whose state should be visualised (running -> playhead, result -> last). */
function displayTick(game: Game): SimTick | null {
  if (!game.sim || !game.sim.ok || game.sim.ticks.length === 0) return null;
  if (game.mode === 'running') return game.sim.ticks[Math.min(game.playhead, game.sim.ticks.length - 1)];
  if (game.mode === 'result') return game.sim.ticks[game.sim.ticks.length - 1];
  return null;
}

let bloomCanvas: HTMLCanvasElement | null = null;

/**
 * CRT glow post-pass: blur a copy of the finished frame and add it back with an
 * additive blend, so bright pixels bloom while the dark navy stays dark. Runs in
 * raw device pixels (it temporarily resets the dpr transform) and touches no
 * other drawing code — call it last, after the whole scene is composed.
 */
function applyBloom(ctx: Ctx): void {
  if (BLOOM_ALPHA <= 0) return;
  const src = ctx.canvas;
  if (src.width === 0 || src.height === 0) return;
  if (!bloomCanvas || bloomCanvas.width !== src.width || bloomCanvas.height !== src.height) {
    bloomCanvas = document.createElement('canvas');
    bloomCanvas.width = src.width;
    bloomCanvas.height = src.height;
  }
  const bctx = bloomCanvas.getContext('2d');
  if (!bctx) return;
  const scale = src.width / VIEW_W; // recover the device-pixel ratio in use
  bctx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
    bctx.filter = `contrast(${BLOOM_THRESHOLD}) blur(${BLOOM_BLUR * scale}px)`;
  bctx.drawImage(src, 0, 0);
  bctx.filter = 'none';

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // composite in raw device pixels
  ctx.globalCompositeOperation = 'lighter'; // additive: bright areas glow
  ctx.globalAlpha = BLOOM_ALPHA;
  ctx.drawImage(bloomCanvas, 0, 0);
  ctx.restore(); // restores the dpr transform for the next frame
}

// --- animation helpers ---------------------------------------------------------

/** Overshooting ease, for the node placement pop. */
function easeOutBack(p: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

/** Stable 0..1 hash of a node id, so each node's sparks animate out of phase. */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 997) / 997;
}

/** Dots travelling along an active edge, visualising request flow. */
function drawPackets(ctx: Ctx, p1: Point, p2: Point, load: number, color: string, time: number): void {
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (len < 8) return;
  const count = Math.max(1, Math.min(5, Math.round(load / 8)));
  const spacing = 1 / count;
  const speed = 100; // px/sec
  const head = ((time / 1000) * speed) / len;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const f = (head + i * spacing) % 1;
    ctx.beginPath();
    ctx.arc(p1.x + (p2.x - p1.x) * f, p1.y + (p2.y - p1.y) * f, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Amber flecks falling from an overloaded node — the dropped requests. */
function drawDropSparks(ctx: Ctx, node: GameNode, time: number, color: string = palette.amber): void {
  const seed = hashId(node.id);
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const phase = ((time / 680) + i * 0.34 + seed) % 1;
    const x = node.x + (i - 1) * 13 + Math.sin((seed + i) * 9) * 4;
    const y = node.y + NODE_H / 2 + phase * 22;
    ctx.globalAlpha = (1 - phase) * 0.85;
    ctx.fillRect(x - 1, y, 2, 4);
  }
  ctx.globalAlpha = 1;
}

// --- main draw -----------------------------------------------------------------

// `flowTime` is a clock that only advances while a run is playing and unpaused,
// so request packets and edge dashes literally freeze when the player pauses.
// `time` stays wall-clock for UI motion (pop-ins, fades, the blinking caret).
export function draw(ctx: Ctx, game: Game, mouse: Point, time: number, imgs: GameImages, flowTime: number = time): void {
  ctx.fillStyle = palette.navy;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  drawScanlines(ctx);
  drawWorkArea(ctx, game, mouse, time, flowTime);
  drawRail(ctx, game, imgs);
  drawHud(ctx, game);
  if (game.mode === 'result' && game.result) drawResultBanner(ctx, game, time);

  applyBloom(ctx);
}

function drawScanlines(ctx: Ctx): void {
  ctx.fillStyle = tint.scanline;
  for (let y = 0; y < VIEW_H; y += 4) ctx.fillRect(0, y, VIEW_W, 1);
}

function drawWorkArea(ctx: Ctx, game: Game, mouse: Point, time: number, flowTime: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(WORK_LEFT, WORK_TOP, VIEW_W - WORK_LEFT, WORK_BOTTOM - WORK_TOP);
  ctx.clip();

  // faint grid
  ctx.strokeStyle = tint.grid;
  ctx.lineWidth = 1;
  for (let x = WORK_LEFT + 40; x < VIEW_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, WORK_TOP);
    ctx.lineTo(x, WORK_BOTTOM);
    ctx.stroke();
  }
  for (let y = WORK_TOP + 40; y < WORK_BOTTOM; y += 40) {
    ctx.beginPath();
    ctx.moveTo(WORK_LEFT, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }

  // brief at the top (wrapped so long text never overflows), hint at the bottom
  const briefX = WORK_LEFT + 16;
  const briefMaxW = VIEW_W - briefX - 16;
  labelWrapped(ctx, `${game.level.id} ${game.level.name} — ${game.level.brief}`, briefX, 26, briefMaxW, tint.boneDim, 11, 500, 15);
  label(ctx, `hint: ${game.level.hint}`, WORK_LEFT + 16, WORK_BOTTOM - 14, tint.greenDim, 11, 400);

  const tick = displayTick(game);
  drawEdges(ctx, game, tick, flowTime);
  drawWirePreview(ctx, game, mouse);
  drawNodes(ctx, game, tick, time, flowTime);
  if (game.mode === 'running' && game.paused) drawPausedOverlay(ctx);

  ctx.restore();
}

/** A centred chip that makes a paused run unmistakable. */
function drawPausedOverlay(ctx: Ctx): void {
  const w = 176;
  const h = 30;
  const x = (WORK_LEFT + VIEW_W) / 2 - w / 2;
  const y = WORK_TOP + 42;
  ctx.save();
  ctx.fillStyle = 'rgba(11, 16, 32, 0.85)';
  rrect(ctx, { x, y, w, h }, 8);
  ctx.fill();
  ctx.strokeStyle = palette.amber;
  ctx.lineWidth = 1.3;
  rrect(ctx, { x, y, w, h }, 8);
  ctx.stroke();
  label(ctx, '|| paused', x + 14, y + 20, palette.amber, 13, 700);
  label(ctx, 'Space resumes', x + w - 12, y + 20, tint.boneDim, 10, 500, 'right');
  ctx.restore();
}

function nodeById(game: Game, id: string): GameNode | undefined {
  return game.nodes.find((n) => n.id === id);
}

function drawEdges(ctx: Ctx, game: Game, tick: SimTick | null, flowTime: number): void {
  for (const e of game.edges) {
    const a = nodeById(game, e.from);
    const b = nodeById(game, e.to);
    if (!a || !b) continue;
    const p1 = boxEdge(a, b);
    const p2 = boxEdge(b, a);
    const overloaded = tick?.nodeOverload[e.to] ?? false;
    const load = tick?.edgeLoad[e.id] ?? 0;
    const active = tick != null && load > 0;
    const color = overloaded ? palette.amber : active ? palette.green : tint.greenDim;

    ctx.strokeStyle = color;
    ctx.lineWidth = active ? 2.5 : 1.5;
    if (active) {
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -(flowTime / 24) % 12;
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    drawArrow(ctx, p1, p2, color);

    if (active) {
      drawPackets(ctx, p1, p2, load, color, flowTime);
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      label(ctx, String(load), mx, my - 6, color, 10, 600, 'center');
    }
  }
}

function drawArrow(ctx: Ctx, from: Point, to: Point, color: string): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - 0.4), to.y - size * Math.sin(angle - 0.4));
  ctx.lineTo(to.x - size * Math.cos(angle + 0.4), to.y - size * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawWirePreview(ctx: Ctx, game: Game, mouse: Point): void {
  if (game.tool !== 'wire' || !game.wireFromId) return;
  const a = nodeById(game, game.wireFromId);
  if (!a) return;
  const p1 = boxEdge(a, mouse);
  ctx.strokeStyle = palette.green;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(mouse.x, mouse.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function nodeStat(game: Game, node: GameNode, tick: SimTick | null): string {
  const spec = NODE_SPECS[node.kind];
  const finite = Number.isFinite(spec.capacity);
  // queue: surface how much it's holding (the buffer filling and draining)
  if (node.kind === 'queue') {
    if (tick) {
      const held = tick.buffered?.[node.id] ?? 0;
      return `${held} held · <=${spec.capacity}/t`;
    }
    return `hold ${spec.buffer} · <=${spec.capacity}/t`;
  }
  if (tick) {
    const inflow = tick.nodeInflow[node.id] ?? 0;
    return finite ? `${inflow}/${spec.capacity}` : `${inflow} req`;
  }
  if (node.kind === 'ingress') return `${game.level.traffic[0]} req/tick`;
  return `cap ${spec.capacity}`;
}

function drawNodes(ctx: Ctx, game: Game, tick: SimTick | null, time: number, flowTime: number): void {
  for (const node of game.nodes) {
    const spec = NODE_SPECS[node.kind];
    const r: Rect = { x: node.x - NODE_W / 2, y: node.y - NODE_H / 2, w: NODE_W, h: NODE_H };
    const downed = tick?.downed?.includes(node.id) ?? false;
    const overloaded = tick?.nodeOverload[node.id] ?? false;
    const queuing = node.kind === 'queue' && (tick?.buffered?.[node.id] ?? 0) > 0 && !overloaded;
    const isWireFrom = game.wireFromId === node.id;
    const isHover = game.hoverNodeId === node.id;
    const isSelected = game.selectedNodeId === node.id;

    // a crashed replica (downed) reads as a red alert, above the amber "overloaded".
    let border: string = tint.greenDim;
    if (downed) border = tint.red;
    else if (overloaded) border = palette.amber;
    else if (isWireFrom) border = palette.green;
    else if (isSelected) border = palette.bone;
    else if (isHover) border = palette.green;

    // placement pop-in: scale from 0.6 with a slight overshoot over ~180ms
    const pop = node.bornAt ? Math.min(1, (time - node.bornAt) / 180) : 1;
    ctx.save();
    if (pop < 1) {
      const s = 0.6 + 0.4 * easeOutBack(pop);
      ctx.translate(node.x, node.y);
      ctx.scale(s, s);
      ctx.translate(-node.x, -node.y);
    }

    // urgent red halo while a replica is crashed; amber halo while merely overloaded
    if (downed) {
      const pulse = 0.5 + 0.5 * Math.sin(time / 90);
      ctx.save();
      ctx.globalAlpha = 0.28 + 0.5 * pulse;
      ctx.strokeStyle = tint.red;
      ctx.lineWidth = 2.5 + 3 * pulse;
      rrect(ctx, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, 9);
      ctx.stroke();
      ctx.restore();
    } else if (overloaded) {
      const pulse = 0.5 + 0.5 * Math.sin(time / 110);
      ctx.save();
      ctx.globalAlpha = 0.2 + 0.4 * pulse;
      ctx.strokeStyle = palette.amber;
      ctx.lineWidth = 2 + 2.5 * pulse;
      rrect(ctx, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, 9);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = tint.node;
    rrect(ctx, r, 7);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = isWireFrom || isSelected || overloaded || downed ? 2 : 1.3;
    rrect(ctx, r, 7);
    ctx.stroke();

    const titleColor = downed ? tint.red : overloaded ? palette.amber : palette.bone;
    label(ctx, `${spec.glyph} ${spec.label}`, node.x, node.y - 4, titleColor, 12, 600, 'center');
    if (downed) {
      label(ctx, '! down', node.x, node.y + 13, tint.red, 11, 700, 'center');
    } else {
      label(ctx, nodeStat(game, node, tick), node.x, node.y + 13, overloaded || queuing ? palette.amber : tint.greenDim, 11, 500, 'center');
    }

    ctx.restore();

    if (downed) drawDropSparks(ctx, node, flowTime, tint.red);
    else if (overloaded) drawDropSparks(ctx, node, flowTime);
  }
}

// --- rail ----------------------------------------------------------------------

function drawRail(ctx: Ctx, game: Game, imgs: GameImages): void {
  ctx.fillStyle = tint.panel;
  ctx.fillRect(0, 0, RAIL_W, VIEW_H);
  ctx.strokeStyle = palette.charcoal;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RAIL_W + 0.5, 0);
  ctx.lineTo(RAIL_W + 0.5, VIEW_H);
  ctx.stroke();

  const badge = 26;
  const textX = ready(imgs.icon) ? 14 + badge + 9 : 14;
  if (ready(imgs.icon)) ctx.drawImage(imgs.icon, 14, 13, badge, badge);
  label(ctx, 'crash-loop', textX, 30, palette.green, 17, 700);
  label(ctx, `${game.level.id} · ${game.level.name}`, textX, 48, tint.boneDim, 11, 500);

  // saved best for this level, shown when replaying a cleared scenario — the
  // same multi-axis bests the result banner reports, condensed onto one line.
  const rec = game.savedRecord;
  if (rec && rec.tier !== 'none') {
    const col = rec.tier === 'gold' ? palette.amber : palette.green;
    const ax = levelAxes(game);
    const parts: string[] = [rec.tier];
    if (rec.bestCost != null) parts.push(`$${rec.bestCost.toFixed(2)}`);
    if (ax.cycles && rec.bestCycles != null) parts.push(`⟳${rec.bestCycles}`);
    if (ax.coverage && rec.bestCoverage != null) parts.push(`${Math.round(rec.bestCoverage * 100)}%`);
    label(ctx, '*', 14, 64, col, 11, 700);
    label(ctx, parts.join(' · '), 26, 64, tint.boneDim, 10, 500);
  }

  // back-to-menu affordance (also the Esc key)
  const menuBtn = layoutMenuButton();
  ctx.strokeStyle = tint.charcoalDim;
  ctx.lineWidth = 1;
  rrect(ctx, menuBtn, 5);
  ctx.stroke();
  label(ctx, '<', menuBtn.x + 10, menuBtn.y + 14, palette.green, 11, 700);
  label(ctx, 'menu', menuBtn.x + 26, menuBtn.y + 14, tint.boneDim, 11, 500);
  label(ctx, 'Esc', menuBtn.x + menuBtn.w - 10, menuBtn.y + 14, tint.greenDim, 10, 600, 'right');

  const items = layoutRail(game);
  const firstComp = items.find((i) => isNodeKind(i.tool));
  const firstTool = items.find((i) => i.tool === 'move');
  if (firstComp) label(ctx, 'COMPONENTS', 14, firstComp.rect.y - 12, tint.boneDim, 10, 600);
  if (firstTool) label(ctx, 'TOOLS', 14, firstTool.rect.y - 12, tint.boneDim, 10, 600);

  for (const item of items) {
    const selected = game.tool === item.tool;
    if (selected) {
      ctx.fillStyle = tint.greenDim;
      rrect(ctx, item.rect, 6);
      ctx.fill();
    }
    ctx.strokeStyle = selected ? palette.green : tint.charcoalDim;
    ctx.lineWidth = 1;
    rrect(ctx, item.rect, 6);
    ctx.stroke();

    const cy = item.rect.y + (item.cost !== undefined ? 19 : item.rect.h / 2 + 4);
    label(ctx, item.glyph, item.rect.x + 12, cy, selected ? palette.green : palette.bone, 13, 700);
    label(ctx, item.label, item.rect.x + 40, cy, selected ? palette.bone : tint.boneDim, 12, 500);

    if (item.cost !== undefined) {
      const spec = NODE_SPECS[item.tool as NodeKind];
      label(ctx, `$${item.cost.toFixed(2)}`, item.rect.x + item.rect.w - 10, item.rect.y + 19, palette.amber, 11, 600, 'right');
      label(ctx, `cpu ${spec.cpu} · mem ${spec.mem}`, item.rect.x + 40, item.rect.y + 37, tint.greenDim, 10, 400);
    }
  }

  // sound toggle, pinned to the rail footer
  const mb = layoutMuteButton();
  const on = !isMuted();
  ctx.strokeStyle = tint.charcoalDim;
  ctx.lineWidth = 1;
  rrect(ctx, mb, 5);
  ctx.stroke();
  label(ctx, on ? '[*]' : '[ ]', mb.x + 10, mb.y + 14, on ? palette.green : tint.boneDim, 11, 700);
  label(ctx, on ? 'sound on' : 'sound off', mb.x + 38, mb.y + 14, tint.boneDim, 11, 500);
  label(ctx, 'M', mb.x + mb.w - 10, mb.y + 14, tint.greenDim, 10, 600, 'right');
}

// --- hud -----------------------------------------------------------------------

function drawGauge(ctx: Ctx, x: number, y: number, w: number, name: string, value: string, ratio: number, over: boolean): void {
  const color = over ? tint.red : palette.green;
  label(ctx, name, x, y, tint.boneDim, 10, 600);
  label(ctx, value, x + w, y, color, 11, 600, 'right');
  ctx.fillStyle = tint.charcoalDim;
  ctx.fillRect(x, y + 6, w, 4);
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 6, Math.max(0, Math.min(1, ratio)) * w, 4);
}

function drawHud(ctx: Ctx, game: Game): void {
  ctx.fillStyle = tint.panel;
  ctx.fillRect(0, WORK_BOTTOM, VIEW_W, HUD_H);
  ctx.strokeStyle = palette.charcoal;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, WORK_BOTTOM + 0.5);
  ctx.lineTo(VIEW_W, WORK_BOTTOM + 0.5);
  ctx.stroke();

  const u = game.usage();
  const b = game.level.budgets;
  const gy = WORK_BOTTOM + 22;
  const gw = 96;
  drawGauge(ctx, 16, gy, gw, 'CPU', `${u.cpu}/${b.cpu}`, u.cpu / b.cpu, u.cpu > b.cpu);
  drawGauge(ctx, 128, gy, gw, 'MEM', `${u.mem}/${b.mem}`, u.mem / b.mem, u.mem > b.mem);
  drawGauge(ctx, 240, gy, gw, 'COST', `$${u.cost.toFixed(2)}/${b.cost.toFixed(2)}`, u.cost / b.cost, u.cost > b.cost);

  const dropped = game.mode === 'edit' ? 0 : game.mode === 'running' ? game.droppedSoFar() : (game.sim?.totalDropped ?? 0);
  drawGauge(ctx, 352, gy, gw, 'ERR_BUDGET', `${dropped}/${game.level.errorBudget}`, dropped / game.level.errorBudget, dropped > game.level.errorBudget);

  // center status line (clipped so it never collides with the buttons)
  const buttons = layoutButtons(game);
  const statusX = 464;
  const statusRight = buttons.length ? buttons[0].rect.x - 12 : VIEW_W - 16;
  ctx.save();
  ctx.beginPath();
  ctx.rect(statusX, WORK_BOTTOM, Math.max(0, statusRight - statusX), HUD_H);
  ctx.clip();
  let status = '';
  let statusColor: string = tint.boneDim;
  if (game.flash) {
    status = game.flash;
    statusColor = palette.amber;
  } else if (game.mode === 'edit') {
    status = game.overBudget() ? 'over budget — cannot run' : 'editing';
    statusColor = game.overBudget() ? tint.red : tint.boneDim;
  } else if (game.mode === 'running') {
    const tickN = Math.min(game.playhead, game.level.traffic.length);
    const dt = game.currentTick();
    const down = dt?.downed?.length ?? 0;
    if (down > 0) {
      status = `INCIDENT · ${down} replica${down > 1 ? 's' : ''} down · tick ${tickN}/${game.level.traffic.length}`;
      statusColor = tint.red;
    } else {
      status = `${game.paused ? 'paused' : 'running'} · tick ${tickN}/${game.level.traffic.length}`;
      statusColor = game.paused ? palette.amber : palette.green;
    }
  } else if (game.result) {
    status = game.result.gold ? 'GOLD' : game.result.passed ? 'PASS' : 'FAIL';
    statusColor = game.result.passed ? palette.green : tint.red;
  }
  label(ctx, status, statusX, gy + 6, statusColor, 12, 600);
  ctx.restore();

  drawButtons(ctx, buttons);
}

function drawButtons(ctx: Ctx, buttons: Button[]): void {
  for (const btn of buttons) {
    const base = btn.primary ? palette.green : tint.boneDim;
    const color = btn.enabled ? base : tint.charcoalDim;
    if (btn.primary && btn.enabled) {
      ctx.fillStyle = tint.greenDim;
      rrect(ctx, btn.rect, 6);
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    rrect(ctx, btn.rect, 6);
    ctx.stroke();
    label(ctx, btn.label, btn.rect.x + btn.rect.w / 2, btn.rect.y + btn.rect.h / 2 + 4, btn.enabled ? (btn.primary ? palette.bone : palette.bone) : tint.charcoalDim, 12, 600, 'center');
  }
}

// --- result banner -------------------------------------------------------------

/**
 * Which scoring axes actually apply to a level, so the banner/rail can render a
 * clean "—" instead of a misleading 0 where an axis is meaningless: cycles only
 * matter when a queue can buffer traffic; coverage only when a CI gate exists.
 */
function levelAxes(game: Game): { cycles: boolean; coverage: boolean } {
  const kinds = new Set<NodeKind>([
    ...game.level.palette,
    ...game.level.initialNodes.map((n) => n.kind),
  ]);
  const coverage = kinds.has('gate') || (game.level.requireBeforeSinks?.includes('gate') ?? false);
  return { cycles: kinds.has('queue'), coverage };
}

/** One axis column on the result banner: name, this run's value, saved best. */
function drawAxis(ctx: Ctx, x: number, y: number, name: string, value: string, best: string, hot: boolean): void {
  label(ctx, name, x, y, tint.boneDim, 10, 600);
  label(ctx, value, x, y + 17, hot ? palette.green : palette.bone, 15, 700);
  label(ctx, best, x, y + 33, tint.greenDim, 10, 500);
}

function drawResultBanner(ctx: Ctx, game: Game, time: number): void {
  const res = game.result;
  if (!res) return;
  const w = 560;
  const h = 152;
  const x = WORK_LEFT + (VIEW_W - WORK_LEFT - w) / 2;

  // fade up and slide in over ~220ms
  const t = Math.min(1, game.resultAt ? (time - game.resultAt) / 220 : 1);
  const ease = 1 - Math.pow(1 - t, 3);
  ctx.save();
  ctx.globalAlpha = ease;
  const y = (WORK_BOTTOM - h) / 2 + (1 - ease) * 14;

  ctx.fillStyle = 'rgba(11, 16, 32, 0.92)';
  rrect(ctx, { x, y, w, h }, 10);
  ctx.fill();
  const accent = res.passed ? palette.green : palette.amber;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  rrect(ctx, { x, y, w, h }, 10);
  ctx.stroke();

  const title = res.gold ? 'GOLD — error budget held' : res.passed ? 'PASS — error budget held' : 'FAIL';
  label(ctx, title, x + 24, y + 34, accent, 18, 700);

  // "NEW BEST" chip when this run improved the saved record
  if (game.newBest) {
    ctx.font = font(18, 700);
    const tw = ctx.measureText(title).width;
    const chip: Rect = { x: x + 24 + tw + 14, y: y + 18, w: 92, h: 20 };
    ctx.fillStyle = palette.green;
    rrect(ctx, chip, 6);
    ctx.fill();
    label(ctx, 'NEW BEST', chip.x + chip.w / 2, chip.y + 14, palette.navy, 10, 700, 'center');
  }

  label(ctx, res.message, x + 24, y + 58, palette.bone, 12, 500);

  // three scoring axes (cost / cycles / coverage), each with its saved best.
  // Only passing runs record a best, and the NEW BEST chip flags an improvement;
  // an axis that doesn't apply to this level renders "—" rather than a bare 0.
  const rec = game.savedRecord;
  const ax = levelAxes(game);
  const ay = y + 76;
  const c0 = x + 24;
  const c1 = x + 214;
  const c2 = x + 404;

  drawAxis(ctx, c0, ay, 'COST $', res.cost.toFixed(2),
    rec?.bestCost != null ? `best ${rec.bestCost.toFixed(2)}` : 'best —', game.newBest);

  const cyclesVal = ax.cycles ? String(res.cycles) : '—';
  const cyclesBest = !ax.cycles ? '—' : rec?.bestCycles != null ? `best ${rec.bestCycles}` : 'best —';
  drawAxis(ctx, c1, ay, '⟳ CYCLES', cyclesVal, cyclesBest, game.newBest && ax.cycles);

  const covVal = ax.coverage ? `${Math.round(res.coverage * 100)}%` : '—';
  const covBest = !ax.coverage ? '—' : rec?.bestCoverage != null ? `best ${Math.round(rec.bestCoverage * 100)}%` : 'best —';
  drawAxis(ctx, c2, ay, 'COVERAGE', covVal, covBest, game.newBest && ax.coverage);

  label(ctx, 'Edit to tweak the topology, or Clear to start over.', x + 24, y + 138, tint.greenDim, 11, 400);
  ctx.restore();
}

// --- help / legend overlay ------------------------------------------------------

const HELP_CONTROLS: Array<[string, string]> = [
  ['component', 'pick from the rail, then click the board to place it'],
  ['wire  ->', 'click a source node, then a target, to connect them'],
  ['move  ::', 'drag a node to reposition it'],
  ['delete  x', 'click a node or edge to remove it'],
  ['Run / Enter', 'simulate the traffic run'],
  ['Space / P', 'pause or resume a run'],
  ['Skip >>', 'jump straight to the end of a run'],
  ['M', 'mute / unmute all sound'],
  ['Esc', 'clear a selection, or return to the level menu'],
  ['?  or  H', 'toggle this help'],
];

/**
 * Translucent help/legend over the current level: the control list plus a
 * one-line description of every node kind in play. Purely cosmetic — it reads
 * game state but never mutates it, and the input layer swallows clicks while
 * it's open, so a run keeps playing deterministically underneath.
 */
export function drawHelpOverlay(ctx: Ctx, game: Game): void {
  ctx.save();
  ctx.fillStyle = 'rgba(11, 16, 32, 0.92)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const panel: Rect = { x: 168, y: 44, w: 624, h: 500 };
  ctx.fillStyle = tint.panel;
  rrect(ctx, panel, 12);
  ctx.fill();
  ctx.strokeStyle = palette.green;
  ctx.lineWidth = 1.5;
  rrect(ctx, panel, 12);
  ctx.stroke();

  const px = panel.x + 28;
  label(ctx, 'HELP / LEGEND', px, panel.y + 36, palette.green, 18, 700);
  label(ctx, `${game.level.id} · ${game.level.name}`, panel.x + panel.w - 28, panel.y + 36, tint.boneDim, 12, 500, 'right');

  // controls
  label(ctx, 'CONTROLS', px, panel.y + 68, tint.boneDim, 11, 600);
  let cy = panel.y + 90;
  for (const [key, desc] of HELP_CONTROLS) {
    label(ctx, key, px, cy, palette.bone, 12, 700);
    label(ctx, desc, px + 132, cy, tint.boneDim, 12, 500);
    cy += 20;
  }

  // node legend — only the kinds this level actually uses
  const kinds: NodeKind[] = [];
  for (const k of [...game.level.initialNodes.map((n) => n.kind), ...game.level.palette]) {
    if (!kinds.includes(k)) kinds.push(k);
  }
  cy += 14;
  label(ctx, 'COMPONENTS IN THIS LEVEL', px, cy, tint.boneDim, 11, 600);
  cy += 22;
  for (const kind of kinds) {
    const spec = NODE_SPECS[kind];
    label(ctx, `${spec.glyph} ${spec.label}`, px, cy, palette.green, 12, 700);
    const end = labelWrapped(ctx, spec.description, px + 132, cy, panel.w - 132 - 56, tint.boneDim, 12, 500, 15);
    cy = Math.max(cy + 20, end + 12);
  }

  label(ctx, 'press ? or Esc to close', panel.x + panel.w / 2, panel.y + panel.h - 18, tint.greenDim, 11, 500, 'center');
  ctx.restore();
}

// --- title / boot screen -------------------------------------------------------

/** Draw `img` filling `r` while preserving aspect ratio (CSS object-fit: cover). */
function drawCover(ctx: Ctx, img: HTMLImageElement, r: Rect): void {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const rectRatio = r.w / r.h;
  let dw = r.w;
  let dh = r.h;
  if (imgRatio > rectRatio) dw = r.h * imgRatio;
  else dh = r.w / imgRatio;
  ctx.drawImage(img, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
}

export function drawTitle(ctx: Ctx, imgs: GameImages, time: number, cleared = 0, total = 0): void {
  if (titleT0 === 0) titleT0 = time;
  const elapsed = time - titleT0;

  ctx.fillStyle = palette.navy;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // faint full-board grid, matching the work area's texture
  ctx.strokeStyle = tint.grid;
  ctx.lineWidth = 1;
  for (let x = 40; x < VIEW_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIEW_H);
    ctx.stroke();
  }
  for (let y = 40; y < VIEW_H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
  drawScanlines(ctx);

  const lx = 386;

  // hero (portrait + wordmark) fades and lifts in over the first ~500ms
  const reveal = Math.min(1, elapsed / 500);
  ctx.save();
  ctx.globalAlpha = reveal;
  ctx.translate(0, (1 - reveal) ** 3 * 12);

  // on-call SRE portrait (the player) — framed like a node card
  const card: Rect = { x: 110, y: 152, w: 224, h: 300 };
  ctx.save();
  rrect(ctx, card, 12);
  ctx.fillStyle = tint.node;
  ctx.fill();
  ctx.clip();
  if (ready(imgs.avatar)) drawCover(ctx, imgs.avatar, card);
  ctx.restore();
  ctx.strokeStyle = tint.greenDim;
  ctx.lineWidth = 1.3;
  rrect(ctx, card, 12);
  ctx.stroke();

  // status dot + caption beneath the card
  const cx = card.x + card.w / 2;
  ctx.fillStyle = palette.green;
  ctx.beginPath();
  ctx.arc(cx - 50, card.y + card.h + 18, 3, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, 'on call: you', cx + 4, card.y + card.h + 22, tint.boneDim, 12, 600, 'center');

  // wordmark
  if (ready(imgs.logo)) {
    const lw = 440;
    const lh = (lw * imgs.logo.naturalHeight) / imgs.logo.naturalWidth;
    ctx.drawImage(imgs.logo, lx, 150, lw, lh);
  }
  ctx.restore();

  // faux boot log — lines print one at a time, like a real init sequence
  const bootLines: Array<[string, string]> = [
    ['[ ok ]', 'region us-merge-1 online'],
    ['[ ok ]', 'error budget mounted'],
    ['[ ok ]', 'pager routed — on call: you'],
  ];
  const linesStart = 420;
  const lineGap = 200;
  let ly = 372;
  for (let i = 0; i < bootLines.length; i++) {
    const appear = (elapsed - (linesStart + i * lineGap)) / 180;
    if (appear > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, appear);
      const [tag, rest] = bootLines[i];
      label(ctx, tag, lx, ly, palette.green, 12, 600);
      ctx.font = font(12, 600);
      ctx.textAlign = 'left';
      const tagW = ctx.measureText(tag + '  ').width;
      label(ctx, rest, lx + tagW, ly, tint.boneDim, 12, 500);
      ctx.restore();
    }
    ly += 22;
  }

  // boot prompt with a blinking block caret — only after the log finishes
  if (elapsed > linesStart + bootLines.length * lineGap) {
    const py = 452;
    const prompt = 'press ENTER to boot';
    label(ctx, prompt, lx, py, palette.green, 16, 700);
    ctx.font = font(16, 700);
    ctx.textAlign = 'left';
    const promptW = ctx.measureText(prompt + ' ').width;
    if (Math.floor(time / 500) % 2 === 0) {
      ctx.fillStyle = palette.green;
      ctx.fillRect(lx + promptW, py - 13, 10, 16);
    }
    label(ctx, 'or click anywhere', lx, py + 22, tint.greenDim, 12, 400);
  }

  // saved progress, once the boot log has printed
  if (total > 0 && elapsed > linesStart + bootLines.length * lineGap) {
    label(ctx, `progress · ${cleared}/${total} regions stabilised`, VIEW_W / 2, 556, tint.greenDim, 11, 500, 'center');
  }

  // team credit
  label(
    ctx,
    'Three-Way Merge — Gabriel Felipe Guarnieri · Hector Guarçoni Machado · Marcos Winícios Silva Martins',
    VIEW_W / 2,
    578,
    tint.boneDim,
    11,
    500,
    'center',
  );

  // CRT power-on flash, fading out over the first ~420ms
  if (elapsed < 420) {
    ctx.save();
    ctx.globalAlpha = 0.16 * (1 - elapsed / 420);
    ctx.fillStyle = palette.green;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }
}

// --- level select menu ---------------------------------------------------------

export interface LevelCard {
  index: number;
  rect: Rect;
}

const MENU_COLS = 2;
const MENU_CARD_W = 384;
const MENU_CARD_H = 84;
const MENU_GAP_X = 24;
const MENU_GAP_Y = 18;
const MENU_TOP = 188;

/** Grid of clickable level cards (2 columns). Hit-regions for the input layer,
 *  laid out the same way the rail and HUD buttons expose theirs. */
export function layoutLevelSelect(count: number): LevelCard[] {
  const gridW = MENU_COLS * MENU_CARD_W + (MENU_COLS - 1) * MENU_GAP_X;
  const startX = (VIEW_W - gridW) / 2;
  const cards: LevelCard[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % MENU_COLS;
    const row = Math.floor(i / MENU_COLS);
    cards.push({
      index: i,
      rect: {
        x: startX + col * (MENU_CARD_W + MENU_GAP_X),
        y: MENU_TOP + row * (MENU_CARD_H + MENU_GAP_Y),
        w: MENU_CARD_W,
        h: MENU_CARD_H,
      },
    });
  }
  return cards;
}

/** Truncate `s` with an ellipsis so it fits within `maxW` at the given font. */
function truncate(ctx: Ctx, s: string, maxW: number, size: number, weight = 500): string {
  ctx.font = font(size, weight);
  if (ctx.measureText(s).width <= maxW) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1);
  return out.trimEnd() + '…';
}

/**
 * Title-screen level select. Every level is reachable — the presenter can jump
 * straight to any mechanic without solving the earlier ones live. Cards show the
 * saved tier/cost (from progress), and an uncleared level reads as "locked" but
 * is still openable. Pure draw + `layoutLevelSelect` hit-regions; no game state.
 */
export function drawMenu(
  ctx: Ctx,
  imgs: GameImages,
  levels: LevelSpec[],
  records: (LevelRecord | null)[],
  mouse: Point,
  cleared = 0,
): void {
  ctx.fillStyle = palette.navy;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // same faint grid + scanline texture as the work area / boot screen
  ctx.strokeStyle = tint.grid;
  ctx.lineWidth = 1;
  for (let x = 40; x < VIEW_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIEW_H);
    ctx.stroke();
  }
  for (let y = 40; y < VIEW_H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
  drawScanlines(ctx);

  // header — wordmark if the art has decoded, otherwise the plain title
  if (ready(imgs.logo)) {
    const lw = 300;
    const lh = (lw * imgs.logo.naturalHeight) / imgs.logo.naturalWidth;
    ctx.drawImage(imgs.logo, (VIEW_W - lw) / 2, 60, lw, lh);
  } else {
    label(ctx, 'crash-loop', VIEW_W / 2, 96, palette.green, 30, 700, 'center');
  }
  label(ctx, 'select a region — click a card or press 1–' + levels.length, VIEW_W / 2, 162, tint.boneDim, 13, 500, 'center');

  const cards = layoutLevelSelect(levels.length);
  for (const c of cards) {
    const lvl = levels[c.index];
    const rec = records[c.index] ?? null;
    const isCleared = rec != null && rec.tier !== 'none';
    const gold = rec?.tier === 'gold';
    const hover = pointInRect(mouse.x, mouse.y, c.rect);
    const r = c.rect;

    // accent: gold > cleared > locked; hover brightens the border
    const accent = gold ? palette.amber : isCleared ? palette.green : tint.greenDim;
    ctx.fillStyle = tint.node;
    rrect(ctx, r, 9);
    ctx.fill();
    if (hover) {
      ctx.fillStyle = tint.greenDim;
      rrect(ctx, r, 9);
      ctx.fill();
    }
    ctx.strokeStyle = hover ? palette.bone : accent;
    ctx.lineWidth = hover ? 1.8 : 1.2;
    rrect(ctx, r, 9);
    ctx.stroke();

    // hotkey chip
    const chip: Rect = { x: r.x + 12, y: r.y + 14, w: 30, h: 30 };
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.2;
    rrect(ctx, chip, 6);
    ctx.stroke();
    label(ctx, String(c.index + 1), chip.x + chip.w / 2, chip.y + 21, palette.bone, 15, 700, 'center');

    const tx = r.x + 56;
    const tw = r.w - 56 - 16;
    label(ctx, `${lvl.id} · ${lvl.name}`, tx, r.y + 26, palette.bone, 14, 700);
    label(ctx, truncate(ctx, lvl.brief, tw, 10, 400), tx, r.y + 44, tint.boneDim, 10, 400);

    // status line: saved tier + best cost, or a subtle locked marker
    if (isCleared) {
      const mark = gold ? '[*] GOLD' : '[+] PASS';
      const best = rec?.bestCost != null ? ` · $${rec.bestCost.toFixed(2)}` : '';
      label(ctx, `${mark}${best}`, tx, r.y + 66, accent, 11, 700);
    } else {
      label(ctx, '[ ] not cleared', tx, r.y + 66, tint.boneDim, 11, 500);
    }
  }

  // footer — progress + team credit, matching the boot screen
  if (levels.length > 0) {
    label(ctx, `progress · ${cleared}/${levels.length} regions stabilised`, VIEW_W / 2, 556, tint.greenDim, 11, 500, 'center');
  }
  label(
    ctx,
    'Three-Way Merge — Gabriel Felipe Guarnieri · Hector Guarçoni Machado · Marcos Winícios Silva Martins',
    VIEW_W / 2,
    578,
    tint.boneDim,
    11,
    500,
    'center',
  );

  applyBloom(ctx);
}
