import type { GameNode, NodeKind, SimTick } from './types';
import type { Game, Tool } from './game';
import { NODE_SPECS } from './sim/nodes';
import { palette, tint } from './palette';
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
  type Point,
  type Rect,
} from './layout';

const MONO = "'IBM Plex Mono', ui-monospace, 'Courier New', monospace";

function font(size: number, weight = 500): string {
  return `${weight} ${size}px ${MONO}`;
}

export function isNodeKind(t: Tool): t is NodeKind {
  return t === 'ingress' || t === 'load-balancer' || t === 'service' || t === 'gate';
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
  let y = 100;

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

export type ButtonId = 'clear' | 'run' | 'back' | 'skip' | 'next';

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

// --- main draw -----------------------------------------------------------------

export function draw(ctx: Ctx, game: Game, mouse: Point, time: number): void {
  ctx.fillStyle = palette.navy;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  drawScanlines(ctx);
  drawWorkArea(ctx, game, mouse, time);
  drawRail(ctx, game);
  drawHud(ctx, game);
  if (game.mode === 'result' && game.result) drawResultBanner(ctx, game);
}

function drawScanlines(ctx: Ctx): void {
  ctx.fillStyle = tint.scanline;
  for (let y = 0; y < VIEW_H; y += 4) ctx.fillRect(0, y, VIEW_W, 1);
}

function drawWorkArea(ctx: Ctx, game: Game, mouse: Point, time: number): void {
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

  // brief at the top, hint at the bottom
  label(ctx, `${game.level.id} ${game.level.name} — ${game.level.brief}`, WORK_LEFT + 16, 26, tint.boneDim, 11, 500);
  label(ctx, `hint: ${game.level.hint}`, WORK_LEFT + 16, WORK_BOTTOM - 14, tint.greenDim, 11, 400);

  const tick = displayTick(game);
  drawEdges(ctx, game, tick, time);
  drawWirePreview(ctx, game, mouse);
  drawNodes(ctx, game, tick);

  ctx.restore();
}

function nodeById(game: Game, id: string): GameNode | undefined {
  return game.nodes.find((n) => n.id === id);
}

function drawEdges(ctx: Ctx, game: Game, tick: SimTick | null, time: number): void {
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
      ctx.lineDashOffset = -(time / 24) % 12;
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
  if (tick) {
    const inflow = tick.nodeInflow[node.id] ?? 0;
    return finite ? `${inflow}/${spec.capacity}` : `${inflow} req`;
  }
  if (node.kind === 'ingress') return `${game.level.traffic[0]} req/tick`;
  return `cap ${spec.capacity}`;
}

function drawNodes(ctx: Ctx, game: Game, tick: SimTick | null): void {
  for (const node of game.nodes) {
    const spec = NODE_SPECS[node.kind];
    const r: Rect = { x: node.x - NODE_W / 2, y: node.y - NODE_H / 2, w: NODE_W, h: NODE_H };
    const overloaded = tick?.nodeOverload[node.id] ?? false;
    const isWireFrom = game.wireFromId === node.id;
    const isHover = game.hoverNodeId === node.id;
    const isSelected = game.selectedNodeId === node.id;

    let border: string = tint.greenDim;
    if (overloaded) border = palette.amber;
    else if (isWireFrom) border = palette.green;
    else if (isSelected) border = palette.bone;
    else if (isHover) border = palette.green;

    ctx.fillStyle = tint.node;
    rrect(ctx, r, 7);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = isWireFrom || isSelected || overloaded ? 2 : 1.3;
    rrect(ctx, r, 7);
    ctx.stroke();

    const titleColor = overloaded ? palette.amber : palette.bone;
    label(ctx, `${spec.glyph} ${spec.label}`, node.x, node.y - 4, titleColor, 12, 600, 'center');
    label(ctx, nodeStat(game, node, tick), node.x, node.y + 13, overloaded ? palette.amber : tint.greenDim, 11, 500, 'center');
  }
}

// --- rail ----------------------------------------------------------------------

function drawRail(ctx: Ctx, game: Game): void {
  ctx.fillStyle = tint.panel;
  ctx.fillRect(0, 0, RAIL_W, VIEW_H);
  ctx.strokeStyle = palette.charcoal;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RAIL_W + 0.5, 0);
  ctx.lineTo(RAIL_W + 0.5, VIEW_H);
  ctx.stroke();

  label(ctx, 'crash-loop', 14, 32, palette.green, 18, 700);
  label(ctx, `${game.level.id} · ${game.level.name}`, 14, 52, tint.boneDim, 11, 500);

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
  drawGauge(ctx, 240, gy, gw, 'COST', `$${u.cost.toFixed(2)}/${b.cost.toFixed(0)}`, u.cost / b.cost, u.cost > b.cost);

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
    status = `running · tick ${tickN}/${game.level.traffic.length}`;
    statusColor = palette.green;
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

function drawResultBanner(ctx: Ctx, game: Game): void {
  const res = game.result;
  if (!res) return;
  const w = 560;
  const h = 132;
  const x = WORK_LEFT + (VIEW_W - WORK_LEFT - w) / 2;
  const y = (WORK_BOTTOM - h) / 2;

  ctx.fillStyle = 'rgba(11, 16, 32, 0.92)';
  rrect(ctx, { x, y, w, h }, 10);
  ctx.fill();
  const accent = res.passed ? palette.green : palette.amber;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  rrect(ctx, { x, y, w, h }, 10);
  ctx.stroke();

  const title = res.gold ? 'GOLD — error budget held' : res.passed ? 'PASS — error budget held' : 'FAIL';
  label(ctx, title, x + 24, y + 38, accent, 18, 700);
  label(ctx, res.message, x + 24, y + 68, palette.bone, 12, 500);
  label(ctx, `served ${res.totalServed}   ·   dropped ${res.totalDropped} / ${res.errorBudget}   ·   cost $${res.cost.toFixed(2)} (par $${res.parCost.toFixed(2)})`, x + 24, y + 92, tint.boneDim, 11, 500);
  label(ctx, 'Edit to tweak the topology, or Clear to start over.', x + 24, y + 114, tint.greenDim, 11, 400);
}
