import { describe, it, expect } from 'vitest';
import type { Edge, GameNode, NodeKind } from './types';
import { Game } from './game';
import { L01 } from './levels/L01';
import { L03 } from './levels/L03';
import { L04 } from './levels/L04';

// Build a node/edge topology onto a fresh Game, bypassing the placement UI so a
// scenario can pin exact cost and drops. The ingress from the level is kept as
// node 0; everything else is appended.
const n = (id: string, kind: NodeKind): GameNode => ({ id, kind, x: 0, y: 0 });
const e = (from: string, to: string): Edge => ({ id: `${from}->${to}`, from, to });
function withTopology(game: Game, extra: GameNode[], edges: Edge[]): Game {
  game.nodes = [game.nodes[0], ...extra];
  game.edges = edges;
  return game;
}

describe('resource accounting', () => {
  it('a fresh board (ingress only) costs nothing and is within budget', () => {
    const g = new Game(L01);
    expect(g.usage()).toEqual({ cpu: 0, mem: 0, cost: 0 });
    expect(g.overBudget()).toBe(false);
  });

  it('flags a build that exceeds the resource budget', () => {
    const g = withTopology(new Game(L01), [
      n('lb', 'load-balancer'), n('s1', 'service'), n('s2', 'service'), n('s3', 'service'), n('s4', 'service'),
    ], []);
    // lb + 4 services = $5.50 > the $5.00 L01 budget.
    expect(g.usage().cost).toBeCloseTo(5.5, 9);
    expect(g.overBudget()).toBe(true);
  });
});

describe('placing nodes', () => {
  it('places into open space but refuses to overlap an existing node', () => {
    const g = new Game(L01);
    const ing = g.nodes[0];
    const placed = g.placeNode('service', ing.x + 240, ing.y);
    expect(placed).not.toBeNull();
    expect(g.nodes).toHaveLength(2);

    const blocked = g.placeNode('service', ing.x, ing.y); // onto ingress
    expect(blocked).toBeNull();
    expect(g.flash).toMatch(/overlap/i);
  });

  it('refuses to place a non-placeable kind (ingress)', () => {
    const g = new Game(L01);
    expect(g.placeNode('ingress', 600, 120)).toBeNull();
  });

  it('places nothing outside edit mode', () => {
    const g = new Game(L01);
    g.mode = 'running';
    expect(g.placeNode('service', 600, 120)).toBeNull();
  });

  it('wouldOverlap ignores the node being tested via ignoreId', () => {
    const g = new Game(L01);
    const placed = g.placeNode('service', 600, 120)!;
    expect(g.wouldOverlap(600, 120)).toBe(true);
    expect(g.wouldOverlap(600, 120, placed.id)).toBe(false);
  });
});

describe('resolveOverlap', () => {
  it('nudges an overlapping node to a free slot', () => {
    const g = new Game(L01);
    const a = g.placeNode('service', 500, 250)!;
    const b = g.placeNode('service', 800, 250)!;
    b.x = a.x + 6; // shove b on top of a
    b.y = a.y;
    expect(g.resolveOverlap(b.id)).toBe(true);
    expect(g.wouldOverlap(b.x, b.y, b.id)).toBe(false);
  });

  it('is a no-op for a node that does not overlap', () => {
    const g = new Game(L01);
    const a = g.placeNode('service', 500, 250)!;
    expect(g.resolveOverlap(a.id)).toBe(false);
  });

  it('is a no-op for an unknown id', () => {
    const g = new Game(L01);
    expect(g.resolveOverlap('nope')).toBe(false);
  });
});

describe('wiring nodes', () => {
  it('applies every connection rule', () => {
    const g = new Game(L01);
    const ing = g.nodes[0];
    const lb = g.placeNode('load-balancer', 520, 250)!;
    const s1 = g.placeNode('service', 760, 150)!;

    expect(g.connect(ing.id, lb.id)).toBe(true); // ingress -> lb, first edge
    expect(g.connect(ing.id, s1.id)).toBe(false); // ingress is a single entry point
    expect(g.flash).toMatch(/single entry/i);

    expect(g.connect(lb.id, lb.id)).toBe(false); // self-loop
    expect(g.flash).toMatch(/itself/i);

    expect(g.connect(lb.id, 'ghost')).toBe(false); // missing target
    expect(g.connect(s1.id, ing.id)).toBe(false); // nothing routes into ingress
    expect(g.flash).toMatch(/ingress/i);

    expect(g.connect(lb.id, s1.id)).toBe(true);
    expect(g.connect(lb.id, s1.id)).toBe(false); // duplicate
    expect(g.flash).toMatch(/already exists/i);
  });

  it('refuses to route out of a sink, which the simulation would ignore anyway', () => {
    const g = new Game(L01);
    const lb = g.placeNode('load-balancer', 520, 250)!;
    const s1 = g.placeNode('service', 760, 150)!;
    const s2 = g.placeNode('service', 760, 350)!;
    g.connect(lb.id, s1.id);
    expect(g.connect(s1.id, s2.id)).toBe(false);
    expect(g.flash).toMatch(/nothing routes out of it/i);
    expect(g.edges.some((edge) => edge.from === s1.id)).toBe(false);
  });

  it('allows but flags a cache chained behind another cache', () => {
    const g = new Game(L03);
    const ing = g.nodes[0];
    const c1 = g.placeNode('cache', 460, 250)!;
    const c2 = g.placeNode('cache', 700, 250)!;
    const s1 = g.placeNode('service', 700, 400)!;
    expect(g.connect(ing.id, c1.id)).toBe(true);
    expect(g.flash).toBeNull();
    expect(g.connect(c1.id, c2.id)).toBe(true); // legal, but c2 can never serve
    expect(g.connect(c2.id, s1.id)).toBe(true);
    expect(g.flash).toMatch(/only sees misses/i);
  });

  it('refuses to wire outside edit mode', () => {
    const g = new Game(L01);
    const lb = g.placeNode('load-balancer', 520, 250)!;
    const s1 = g.placeNode('service', 760, 150)!;
    g.mode = 'running';
    expect(g.connect(lb.id, s1.id)).toBe(false);
  });
});

describe('deleting nodes and edges', () => {
  it('deletes a node and its incident edges, clearing the selection', () => {
    const g = new Game(L01);
    const ing = g.nodes[0];
    const lb = g.placeNode('load-balancer', 520, 250)!;
    const s1 = g.placeNode('service', 760, 150)!;
    g.connect(ing.id, lb.id);
    g.connect(lb.id, s1.id);
    g.selectedNodeId = s1.id;

    g.deleteNode(s1.id);
    expect(g.nodes.find((node) => node.id === s1.id)).toBeUndefined();
    expect(g.edges.some((edge) => edge.from === s1.id || edge.to === s1.id)).toBe(false);
    expect(g.selectedNodeId).toBeNull();
  });

  it('never deletes the ingress', () => {
    const g = new Game(L01);
    g.deleteNode(g.nodes[0].id);
    expect(g.nodes.some((node) => node.kind === 'ingress')).toBe(true);
  });

  it('deletes an edge, and both deletes are no-ops outside edit mode', () => {
    const g = new Game(L01);
    const ing = g.nodes[0];
    const lb = g.placeNode('load-balancer', 520, 250)!;
    g.connect(ing.id, lb.id);
    const edgeId = g.edges[0].id;

    g.mode = 'running';
    g.deleteEdge(edgeId);
    g.deleteNode(lb.id);
    expect(g.edges).toHaveLength(1);
    expect(g.nodes.some((node) => node.id === lb.id)).toBe(true);

    g.mode = 'edit';
    g.deleteEdge(edgeId);
    expect(g.edges).toHaveLength(0);
  });
});

describe('hit-testing', () => {
  it('nodeAt returns the topmost node under a point, or null', () => {
    const g = new Game(L01);
    const s1 = g.placeNode('service', 500, 250)!;
    expect(g.nodeAt(s1.x, s1.y)?.id).toBe(s1.id);
    expect(g.nodeAt(50, 50)).toBeNull();
  });

  it('edgeAt returns the nearest edge within threshold, or null', () => {
    const g = new Game(L01);
    const ing = g.nodes[0];
    const lb = g.placeNode('load-balancer', 520, 250)!;
    g.nodes[0].x = 300;
    g.nodes[0].y = 250;
    g.connect(ing.id, lb.id);
    const mid = { x: (300 + 520) / 2, y: 250 };
    expect(g.edgeAt(mid.x, mid.y)?.from).toBe(ing.id);
    expect(g.edgeAt(mid.x, mid.y + 200)).toBeNull();
  });

  it('edgeAt skips edges whose endpoints are missing', () => {
    const g = new Game(L01);
    g.edges = [e('ghostA', 'ghostB')];
    expect(g.edgeAt(400, 300)).toBeNull();
  });
});

describe('setTool', () => {
  it('switches tool and clears transient wiring state', () => {
    const g = new Game(L01);
    g.wireFromId = 'x';
    g.flash = 'stale';
    g.setTool('wire');
    expect(g.tool).toBe('wire');
    expect(g.wireFromId).toBeNull();
    expect(g.flash).toBeNull();
  });
});

describe('running a build', () => {
  it('is a no-op outside edit mode', () => {
    const g = new Game(L01);
    g.mode = 'result';
    g.run();
    expect(g.sim).toBeNull();
  });

  it('reports an invalid topology (a cycle) as a failed result', () => {
    const g = withTopology(new Game(L01), [n('a', 'service'), n('b', 'service')], [
      e('ingress', 'a'), e('a', 'b'), e('b', 'a'),
    ]);
    // The ingress id from L01 is literally 'ingress'.
    g.edges[0] = e(g.nodes[0].id, 'a');
    g.run();
    expect(g.mode).toBe('result');
    expect(g.result?.passed).toBe(false);
    expect(g.result?.message).toMatch(/acyclic|DAG/i);
  });

  it('enters running mode for a valid topology', () => {
    const g = goldL01();
    g.run();
    expect(g.mode).toBe('running');
    expect(g.sim?.ok).toBe(true);
    expect(g.playhead).toBe(0);
  });
});

describe('result tiers', () => {
  it('awards GOLD for the par-cost, zero-drop build', () => {
    const g = goldL01();
    g.run();
    g.skipToEnd();
    expect(g.mode).toBe('result');
    expect(g.result?.passed).toBe(true);
    expect(g.result?.gold).toBe(true);
    expect(g.result?.message).toMatch(/GOLD/);
  });

  it('awards PASS (not gold) for an over-par but passing build', () => {
    // L04: lb + 3 services costs $4.50 (> $3.50 par) but passes within budgets.
    const g = withTopology(new Game(L04), [
      n('lb', 'load-balancer'), n('s1', 'service'), n('s2', 'service'), n('s3', 'service'),
    ], [
      e('ingress', 'lb'), e('lb', 's1'), e('lb', 's2'), e('lb', 's3'),
    ]);
    g.edges[0] = e(g.nodes[0].id, 'lb');
    g.run();
    g.skipToEnd();
    expect(g.result?.passed).toBe(true);
    expect(g.result?.gold).toBe(false);
    expect(g.result?.message).toMatch(/PASS/);
  });

  it('reports an over-budget build', () => {
    // L03 budget is $4.50; lb + 4 services = $5.50.
    const g = withTopology(new Game(L03), [
      n('lb', 'load-balancer'), n('s1', 'service'), n('s2', 'service'), n('s3', 'service'), n('s4', 'service'),
    ], [
      e('ingress', 'lb'), e('lb', 's1'), e('lb', 's2'), e('lb', 's3'), e('lb', 's4'),
    ]);
    g.edges[0] = e(g.nodes[0].id, 'lb');
    g.run();
    g.skipToEnd();
    expect(g.result?.passed).toBe(false);
    expect(g.result?.message).toMatch(/resource budget/i);
  });

  it('reports an exhausted error budget', () => {
    // L01 single service: drops 600, far past the 20 error budget, but cheap.
    const g = withTopology(new Game(L01), [n('s1', 'service')], [e('ingress', 's1')]);
    g.edges[0] = e(g.nodes[0].id, 's1');
    g.run();
    g.skipToEnd();
    expect(g.result?.passed).toBe(false);
    expect(g.result?.message).toMatch(/error budget/i);
  });
});

describe('playback', () => {
  it('advances the playhead and reports the current tick and drops so far', () => {
    const g = goldL01();
    g.run();
    expect(g.currentTick()?.t).toBe(0);
    g.advancePlayback(5);
    expect(g.playhead).toBe(5);
    expect(g.currentTick()?.t).toBe(5);
    expect(g.droppedSoFar()).toBe(0); // the gold build drops nothing
  });

  it('finishes when the playhead runs past the last tick', () => {
    const g = goldL01();
    g.run();
    g.advancePlayback(1000);
    expect(g.mode).toBe('result');
  });

  it('toggles pause only while running', () => {
    const g = goldL01();
    expect(g.togglePause()).toBe(false); // not running yet
    g.run();
    expect(g.togglePause()).toBe(true);
    expect(g.togglePause()).toBe(false);
  });

  it('ignores playback controls outside running mode', () => {
    const g = new Game(L01);
    g.advancePlayback(5);
    g.skipToEnd();
    expect(g.currentTick()).toBeNull();
    expect(g.droppedSoFar()).toBe(0);
    expect(g.mode).toBe('edit');
  });
});

describe('mode transitions', () => {
  it('backToEdit clears the run but keeps the topology', () => {
    const g = goldL01();
    const nodeCount = g.nodes.length;
    g.run();
    g.skipToEnd();
    g.backToEdit();
    expect(g.mode).toBe('edit');
    expect(g.sim).toBeNull();
    expect(g.result).toBeNull();
    expect(g.nodes).toHaveLength(nodeCount);
  });

  it('reset restores the initial board', () => {
    const g = goldL01();
    g.reset();
    expect(g.nodes).toHaveLength(1); // just the ingress
    expect(g.edges).toHaveLength(0);
    expect(g.mode).toBe('edit');
  });
});

// The canonical L01 gold topology: ingress -> load-balancer -> 3 services.
function goldL01(): Game {
  const g = withTopology(new Game(L01), [
    n('lb', 'load-balancer'), n('s1', 'service'), n('s2', 'service'), n('s3', 'service'),
  ], [
    e('ingress', 'lb'), e('lb', 's1'), e('lb', 's2'), e('lb', 's3'),
  ]);
  g.edges[0] = e(g.nodes[0].id, 'lb');
  return g;
}
