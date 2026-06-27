// Persistent per-level scoring. Each cleared level keeps its best tier and the
// lowest passing cost (a golf-style metric, true to the Zachtronics lineage the
// game cites). This is meta state only — it never feeds the deterministic
// simulation. The merge rule is a pure function so it stays unit-testable, and
// every localStorage touch is guarded so the Node sim-check bundle (and locked-
// down iframes) degrade to a no-op instead of throwing.

export type Tier = 'none' | 'pass' | 'gold';

export interface RunOutcome {
  tier: Tier;
  cost: number;
  served: number;
  dropped: number;
}

export interface LevelRecord {
  tier: Tier;
  bestCost: number | null; // lowest passing cost; null until the level is first cleared
  served: number;
  dropped: number;
}

const KEY = 'crash-loop.progress.v1';
const EPS = 1e-9;
const tierRank: Record<Tier, number> = { none: 0, pass: 1, gold: 2 };

type Store = Record<string, LevelRecord>;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // access itself can throw in sandboxed / privacy-mode contexts
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
    /* quota exceeded / denied — best-effort persistence only */
  }
}

/**
 * Fold a finished run into the prior record, keeping the best tier reached and
 * the lowest passing cost. Pure: same inputs, same output. `improved` is true
 * when the run upgraded the tier or beat the cost record, so the UI can
 * celebrate a new best.
 */
export function mergeRecord(prev: LevelRecord | null, run: RunOutcome): { record: LevelRecord; improved: boolean } {
  const record: LevelRecord = prev
    ? { ...prev }
    : { tier: 'none', bestCost: null, served: 0, dropped: 0 };
  let improved = false;

  if (tierRank[run.tier] > tierRank[record.tier]) {
    record.tier = run.tier;
    improved = true;
  }
  // A passing run that costs less than the saved best is a better record, even
  // at the same tier (cheaper gold beats pricier gold). Failed runs never count.
  if (run.tier !== 'none' && (record.bestCost === null || run.cost < record.bestCost - EPS)) {
    record.bestCost = run.cost;
    record.served = run.served;
    record.dropped = run.dropped;
    improved = true;
  }
  return { record, improved };
}

/** Read the saved record for one level, or null if it has never been run. */
export function recordFor(levelId: string): LevelRecord | null {
  return readAll()[levelId] ?? null;
}

/** Merge a run into storage and return the new record plus whether it improved. */
export function submit(levelId: string, run: RunOutcome): { record: LevelRecord; improved: boolean } {
  const store = readAll();
  const { record, improved } = mergeRecord(store[levelId] ?? null, run);
  store[levelId] = record;
  writeAll(store);
  return { record, improved };
}

/** How many of the given levels have been cleared (tier above 'none'). */
export function clearedCount(levelIds: string[]): number {
  const store = readAll();
  return levelIds.filter((id) => store[id] && store[id].tier !== 'none').length;
}
