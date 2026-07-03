import type { Budgets, Edge, GameNode, LevelSpec, NodeKind, SimResult } from './types';
import type { LevelRecord } from './progress';
import { NODE_SPECS } from './sim/nodes';
import { simulate } from './sim/engine';
import { NODE_H, NODE_W, clampToWork, distToSegment, pointInNode } from './layout';

export type Tool = 'move' | 'wire' | 'delete' | NodeKind;
export type Mode = 'edit' | 'running' | 'result';

export interface ResultSummary {
  passed: boolean;
  gold: boolean;
  totalServed: number;
  totalDropped: number;
  errorBudget: number;
  cost: number;
  parCost: number;
  message: string;
}

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/** Wall-clock ms for cosmetic animations only — never feeds the simulation. */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

const EPS = 1e-9;

/**
 * Holds all mutable board state and the rules for editing and running it.
 * Framework-agnostic: the renderer reads it, the input layer drives it.
 */
export class Game {
  readonly level: LevelSpec;
  readonly nextLevel: LevelSpec | null;
  nodes: GameNode[] = [];
  edges: Edge[] = [];
  tool: Tool = 'move';
  mode: Mode = 'edit';

  // transient interaction state
  selectedNodeId: string | null = null;
  wireFromId: string | null = null;
  draggingId: string | null = null;
  dragOffX = 0;
  dragOffY = 0;
  hoverNodeId: string | null = null;
  flash: string | null = null; // transient one-line message (e.g. a rejected edge)

  // simulation playback
  sim: SimResult | null = null;
  playhead = 0; // number of ticks elapsed during running mode
  paused = false; // freezes playback (and the flow visuals) without leaving running mode
  result: ResultSummary | null = null;
  resultAt = 0; // cosmetic: wall-clock ms the result appeared, drives the banner fade-in

  // persistent scoring — set by the host from progress storage, read by the
  // renderer. Pure data: the simulation never consults either field.
  savedRecord: LevelRecord | null = null;
  newBest = false; // last result beat the saved record — drives the banner flourish

  constructor(level: LevelSpec, nextLevel: LevelSpec | null = null) {
    this.level = level;
    this.nextLevel = nextLevel;
    this.reset();
  }

  reset(): void {
    this.nodes = this.level.initialNodes.map((n) => ({ ...n }));
    this.edges = [];
    this.tool = 'move';
    this.mode = 'edit';
    this.selectedNodeId = null;
    this.wireFromId = null;
    this.draggingId = null;
    this.hoverNodeId = null;
    this.flash = null;
    this.sim = null;
    this.playhead = 0;
    this.paused = false;
    this.result = null;
    this.newBest = false;
  }

  /** Return to editing after a run, keeping the topology intact. */
  backToEdit(): void {
    this.mode = 'edit';
    this.sim = null;
    this.result = null;
    this.playhead = 0;
    this.paused = false;
    this.newBest = false;
    this.wireFromId = null;
  }

  // --- resource accounting ---

  usage(): Budgets {
    return this.nodes.reduce<Budgets>(
      (acc, n) => {
        const spec = NODE_SPECS[n.kind];
        acc.cpu += spec.cpu;
        acc.mem += spec.mem;
        acc.cost += spec.cost;
        return acc;
      },
      { cpu: 0, mem: 0, cost: 0 },
    );
  }

  overBudget(): boolean {
    const u = this.usage();
    const b = this.level.budgets;
    return u.cpu > b.cpu + EPS || u.mem > b.mem + EPS || u.cost > b.cost + EPS;
  }

  // --- editing ---

  setTool(tool: Tool): void {
    this.tool = tool;
    this.wireFromId = null;
    this.flash = null;
  }

  placeNode(kind: NodeKind, x: number, y: number): GameNode | null {
    if (this.mode !== 'edit') return null;
    if (!NODE_SPECS[kind].placeable) return null;
    if (this.wouldOverlap(x, y)) {
      this.flash = "No room here — nodes can't overlap.";
      return null;
    }
    const node: GameNode = { id: uid(kind), kind, x, y, bornAt: nowMs() };
    this.nodes.push(node);
    return node;
  }

  /** AABB collision: would a node box centred at (x, y) touch an existing one? */
  wouldOverlap(x: number, y: number, ignoreId?: string): boolean {
    const gutter = 8; // keep a small visible gap so boxes never kiss
    return this.nodes.some(
      (n) => n.id !== ignoreId && Math.abs(n.x - x) < NODE_W + gutter && Math.abs(n.y - y) < NODE_H + gutter,
    );
  }

  /**
   * After a drag, if the node landed on top of another, push it to the nearest
   * free, in-bounds slot (a short outward spiral search). Returns true if moved.
   */
  resolveOverlap(id: string): boolean {
    const node = this.nodes.find((n) => n.id === id);
    if (!node || !this.wouldOverlap(node.x, node.y, id)) return false;
    const step = 14;
    for (let ring = 1; ring <= 28; ring++) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const p = clampToWork(node.x + Math.cos(ang) * ring * step, node.y + Math.sin(ang) * ring * step);
        if (!this.wouldOverlap(p.x, p.y, id)) {
          node.x = p.x;
          node.y = p.y;
          return true;
        }
      }
    }
    return false;
  }

  deleteNode(id: string): void {
    if (this.mode !== 'edit') return;
    const node = this.nodes.find((n) => n.id === id);
    if (!node || node.kind === 'ingress') return; // ingress is fixed
    this.nodes = this.nodes.filter((n) => n.id !== id);
    this.edges = this.edges.filter((e) => e.from !== id && e.to !== id);
    if (this.selectedNodeId === id) this.selectedNodeId = null;
  }

  deleteEdge(id: string): void {
    if (this.mode !== 'edit') return;
    this.edges = this.edges.filter((e) => e.id !== id);
  }

  connect(fromId: string, toId: string): boolean {
    if (this.mode !== 'edit') return false;
    if (fromId === toId) {
      this.flash = 'A node cannot connect to itself.';
      return false;
    }
    const from = this.nodes.find((n) => n.id === fromId);
    const to = this.nodes.find((n) => n.id === toId);
    if (!from || !to) return false;
    if (to.kind === 'ingress') {
      this.flash = 'Nothing routes into ingress.';
      return false;
    }
    if (this.edges.some((e) => e.from === fromId && e.to === toId)) {
      this.flash = 'That edge already exists.';
      return false;
    }
    if (from.kind === 'ingress' && this.edges.some((e) => e.from === fromId)) {
      this.flash = 'ingress is a single entry point — route it through a load-balancer to fan out.';
      return false;
    }
    this.edges.push({ id: uid('e'), from: fromId, to: toId });
    this.flash = null;
    return true;
  }

  // --- hit-testing ---

  nodeAt(x: number, y: number): GameNode | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      if (pointInNode(x, y, this.nodes[i])) return this.nodes[i];
    }
    return null;
  }

  edgeAt(x: number, y: number, threshold = 7): Edge | null {
    let best: Edge | null = null;
    let bestDist = threshold;
    for (const e of this.edges) {
      const a = this.nodes.find((n) => n.id === e.from);
      const b = this.nodes.find((n) => n.id === e.to);
      if (!a || !b) continue;
      const d = distToSegment(x, y, a, b);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  // --- run / playback ---

  run(): void {
    if (this.mode !== 'edit') return;
    const res = simulate(this.nodes, this.edges, this.level.traffic, {
      requireBeforeSinks: this.level.requireBeforeSinks,
      chaos: this.level.chaos,
    });
    this.sim = res;
    if (!res.ok) {
      this.result = {
        passed: false,
        gold: false,
        totalServed: 0,
        totalDropped: 0,
        errorBudget: this.level.errorBudget,
        cost: this.usage().cost,
        parCost: this.level.parCost,
        message: res.error ?? 'Simulation failed.',
      };
      this.resultAt = nowMs();
      this.mode = 'result';
      return;
    }
    this.mode = 'running';
    this.playhead = 0;
    this.paused = false;
    this.newBest = false;
    this.wireFromId = null;
  }

  /** Freeze or resume playback during a run. No-op outside running mode. */
  togglePause(): boolean {
    if (this.mode !== 'running') return false;
    this.paused = !this.paused;
    return this.paused;
  }

  advancePlayback(stepTicks: number): void {
    if (this.mode !== 'running' || !this.sim) return;
    this.playhead = Math.min(this.playhead + stepTicks, this.sim.ticks.length);
    if (this.playhead >= this.sim.ticks.length) this.finish();
  }

  skipToEnd(): void {
    if (this.mode !== 'running' || !this.sim) return;
    this.paused = false;
    this.playhead = this.sim.ticks.length;
    this.finish();
  }

  private finish(): void {
    if (!this.sim) return;
    const within = this.sim.totalDropped <= this.level.errorBudget;
    const over = this.overBudget();
    const cost = this.usage().cost;
    const passed = within && !over;
    const gold = passed && cost <= this.level.parCost + EPS;

    let message: string;
    if (over) {
      message = 'Over resource budget — trim CPU / MEM / $ and re-run.';
    } else if (!within) {
      message = `Error budget exhausted: dropped ${this.sim.totalDropped} > ${this.level.errorBudget} allowed.`;
    } else if (gold) {
      message = `GOLD — served ${this.sim.totalServed}, dropped ${this.sim.totalDropped}, at minimum cost $${cost.toFixed(2)}.`;
    } else {
      message = `PASS — served ${this.sim.totalServed}, dropped ${this.sim.totalDropped}. Hit $${this.level.parCost.toFixed(2)} for gold.`;
    }

    this.result = {
      passed,
      gold,
      totalServed: this.sim.totalServed,
      totalDropped: this.sim.totalDropped,
      errorBudget: this.level.errorBudget,
      cost,
      parCost: this.level.parCost,
      message,
    };
    this.resultAt = nowMs();
    this.mode = 'result';
  }

  /** The tick currently being shown during playback. */
  currentTick() {
    if (!this.sim || this.mode !== 'running') return null;
    const idx = Math.min(this.playhead, this.sim.ticks.length - 1);
    return this.sim.ticks[idx];
  }

  /** Requests dropped from the start of the run up to the playhead. */
  droppedSoFar(): number {
    if (!this.sim) return 0;
    let dropped = 0;
    const upto = Math.min(this.playhead, this.sim.ticks.length);
    for (let i = 0; i < upto; i++) dropped += this.sim.ticks[i].dropped;
    return dropped;
  }
}
