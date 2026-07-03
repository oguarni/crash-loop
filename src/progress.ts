// Persistent per-level scoring. Multi-axis, in the Zachtronics lineage the game
// cites (Opus Magnum: cost / cycles / area). Each axis keeps its own best,
// tracked independently — you chase them separately, like separate leaderboards.
// The FAIL/PASS/GOLD tier stays graded by the COST axis, so existing levels are
// unaffected; cycles and coverage are additional per-axis records. This is meta
// state only — it never feeds the deterministic simulation. Every localStorage
// touch is guarded so the Node sim-check bundle degrades to a no-op.

export type Tier = 'none' | 'pass' | 'gold';

export interface RunOutcome {
  tier: Tier;
  cost: number; // lower is better
  cycles?: number; // total latency (request-ticks in queues); lower is better
  coverage?: number; // fraction of services behind a gate (0..1); higher is better
  served: number;
  dropped: number;
}

export interface LevelRecord {
  tier: Tier;
  bestCost: number | null; // lowest passing cost; null until first cleared
  bestCycles: number | null; // lowest passing latency
  bestCoverage: number | null; // highest passing coverage
  served: number;
  dropped: number;
}

const KEY = 'crash-loop.progress.v2';
const EPS = 1e-9;
const tierRank: Record<Tier, number> = { none: 0, pass: 1, gold: 2 };

type Store = Record<string, LevelRecord>;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
function readAll(): Store {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}
function writeAll(store: Store): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota / denied — best-effort */
  }
}

/**
 * Fold a finished run into the prior record, keeping the best per axis: lowest
 * passing cost, lowest passing cycles, highest passing coverage, and the best
 * tier reached. Pure. `improved` is true when any axis or the tier got better.
 */
export function mergeRecord(prev: LevelRecord | null, run: RunOutcome): { record: LevelRecord; improved: boolean } {
  const record: LevelRecord = prev
    ? { ...prev }
    : { tier: 'none', bestCost: null, bestCycles: null, bestCoverage: null, served: 0, dropped: 0 };
  let improved = false;

  if (tierRank[run.tier] > tierRank[record.tier]) {
    record.tier = run.tier;
    improved = true;
  }
  // Only passing runs set records. Failed runs never count.
  if (run.tier !== 'none') {
    const cycles = run.cycles ?? 0;
    const coverage = run.coverage ?? 0;
    if (record.bestCost === null || run.cost < record.bestCost - EPS) {
      record.bestCost = run.cost;
      record.served = run.served;
      record.dropped = run.dropped;
      improved = true;
    }
    if (record.bestCycles === null || cycles < record.bestCycles - EPS) {
      record.bestCycles = cycles;
      improved = true;
    }
    if (record.bestCoverage === null || coverage > record.bestCoverage + EPS) {
      record.bestCoverage = coverage;
      improved = true;
    }
  }
  return { record, improved };
}

export function recordFor(levelId: string): LevelRecord | null {
  return readAll()[levelId] ?? null;
}
export function submit(levelId: string, run: RunOutcome): { record: LevelRecord; improved: boolean } {
  const store = readAll();
  const { record, improved } = mergeRecord(store[levelId] ?? null, run);
  store[levelId] = record;
  writeAll(store);
  return { record, improved };
}
export function clearedCount(levelIds: string[]): number {
  const store = readAll();
  return levelIds.filter((id) => store[id] && store[id].tier !== 'none').length;
}