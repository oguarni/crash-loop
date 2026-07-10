// Geometry constants and helpers shared by the renderer and the input layer.
// The canvas draws at a fixed logical resolution; CSS scales it to fit.

export const VIEW_W = 960;
export const VIEW_H = 600;
export const RAIL_W = 200;
export const HUD_H = 64;

export const WORK_LEFT = RAIL_W;
export const WORK_RIGHT = VIEW_W;
export const WORK_TOP = 0;
export const WORK_BOTTOM = VIEW_H - HUD_H; // 536

export const NODE_W = 122;
export const NODE_H = 46;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export function nodeRect(n: Point): Rect {
  return { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2, w: NODE_W, h: NODE_H };
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function pointInNode(px: number, py: number, n: Point): boolean {
  return pointInRect(px, py, nodeRect(n));
}

/** The range a node centre may occupy with its whole box inside the work area. */
export function workBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: WORK_LEFT + NODE_W / 2 + 10,
    maxX: WORK_RIGHT - NODE_W / 2 - 10,
    minY: WORK_TOP + NODE_H / 2 + 10,
    maxY: WORK_BOTTOM - NODE_H / 2 - 10,
  };
}

/** Clamp a node centre so its whole box stays inside the work area. */
export function clampToWork(x: number, y: number): Point {
  const { minX, maxX, minY, maxY } = workBounds();
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/** Shortest distance from a point to a line segment — used for edge hit-testing. */
export function distToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
