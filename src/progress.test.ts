import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mergeRecord, submit, recordFor, clearedCount } from './progress';
import type { RunOutcome } from './progress';

// The persistence key progress.ts writes under. Duplicated here on purpose so a
// test can plant malformed JSON and exercise the parse-failure fallback.
const STORAGE_KEY = 'crash-loop.progress.v2';

/**
 * In-memory Storage stand-in. A named fake (per the Guidelines' "named fake
 * classes, not inline stubs") so the progress store can be tested without a real
 * browser localStorage.
 */
class FakeStorage implements Storage {
  private store = new Map<string, string>();
  [name: string]: unknown;

  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

/** A Storage whose writes always fail — models a quota-exceeded / denied store. */
class DeniedStorage extends FakeStorage {
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

const globalScope = globalThis as { localStorage?: Storage };
function useStorage(storage: Storage | undefined): void {
  globalScope.localStorage = storage;
}

const pass = (over: Partial<RunOutcome> = {}): RunOutcome => ({
  tier: 'pass', cost: 5, cycles: 100, coverage: 0.5, served: 900, dropped: 0, ...over,
});

describe('mergeRecord — per-axis best tracking (pure)', () => {
  it('records the tier, cost, cycles, and coverage on a first clear', () => {
    const { record, improved } = mergeRecord(null, pass({ tier: 'gold', cost: 4.5 }));
    expect(improved).toBe(true);
    expect(record).toMatchObject({ tier: 'gold', bestCost: 4.5, bestCycles: 100, bestCoverage: 0.5 });
  });

  it('upgrades the tier and cost when a cheaper gold run lands', () => {
    const first = mergeRecord(null, pass({ cost: 5 })).record;
    const { record, improved } = mergeRecord(first, pass({ tier: 'gold', cost: 4.5 }));
    expect(improved).toBe(true);
    expect(record.tier).toBe('gold');
    expect(record.bestCost).toBe(4.5);
  });

  it('keeps the lower cycles and higher coverage, each tracked independently', () => {
    let rec = mergeRecord(null, pass({ cost: 5, cycles: 100, coverage: 0.5 })).record;

    const faster = mergeRecord(rec, pass({ cost: 5, cycles: 80, coverage: 0.5 }));
    expect(faster.improved).toBe(true);
    expect(faster.record.bestCycles).toBe(80);
    expect(faster.record.bestCost).toBe(5); // unchanged
    rec = faster.record;

    const broader = mergeRecord(rec, pass({ cost: 5, cycles: 80, coverage: 0.9 }));
    expect(broader.improved).toBe(true);
    expect(broader.record.bestCoverage).toBe(0.9);
    expect(broader.record.bestCycles).toBe(80); // unchanged
  });

  it('does not regress on a worse, more expensive run', () => {
    const best = mergeRecord(null, pass({ tier: 'gold', cost: 4.5, cycles: 80, coverage: 0.9 })).record;
    const { record, improved } = mergeRecord(best, pass({ tier: 'pass', cost: 6, cycles: 120, coverage: 0.4 }));
    expect(improved).toBe(false);
    expect(record).toMatchObject({ tier: 'gold', bestCost: 4.5, bestCycles: 80, bestCoverage: 0.9 });
  });

  it('never lets a failed run set a record, even at a lower cost', () => {
    const best = mergeRecord(null, pass({ tier: 'gold', cost: 4.5 })).record;
    const { record, improved } = mergeRecord(best, { tier: 'none', cost: 0, served: 0, dropped: 600 });
    expect(improved).toBe(false);
    expect(record.tier).toBe('gold');
    expect(record.bestCost).toBe(4.5);

    const fromScratch = mergeRecord(null, { tier: 'none', cost: 0, served: 0, dropped: 600 });
    expect(fromScratch.improved).toBe(false);
    expect(fromScratch.record).toMatchObject({ tier: 'none', bestCost: null, bestCycles: null, bestCoverage: null });
  });

  it('defaults missing cycles/coverage axes to zero on a passing run', () => {
    const { record } = mergeRecord(null, { tier: 'pass', cost: 5, served: 900, dropped: 0 });
    expect(record.bestCycles).toBe(0);
    expect(record.bestCoverage).toBe(0);
  });
});

describe('persistence via localStorage', () => {
  beforeEach(() => useStorage(new FakeStorage()));
  afterEach(() => useStorage(undefined));

  it('submit persists a record that recordFor reads back', () => {
    const { record, improved } = submit('L01', pass({ tier: 'gold', cost: 4.5 }));
    expect(improved).toBe(true);
    expect(record.tier).toBe('gold');
    expect(recordFor('L01')).toMatchObject({ tier: 'gold', bestCost: 4.5 });
  });

  it('folds successive submits into the same stored record', () => {
    submit('L01', pass({ tier: 'pass', cost: 5 }));
    const second = submit('L01', pass({ tier: 'gold', cost: 4.5 }));
    expect(second.record.tier).toBe('gold');
    expect(recordFor('L01')?.bestCost).toBe(4.5);
  });

  it('counts only levels that have been cleared', () => {
    submit('L01', pass({ tier: 'gold', cost: 4.5 }));
    submit('L02', { tier: 'none', cost: 0, served: 0, dropped: 999 });
    expect(clearedCount(['L01', 'L02', 'L03'])).toBe(1);
  });

  it('returns null / empty for an unknown level', () => {
    expect(recordFor('L99')).toBeNull();
    expect(clearedCount(['L99'])).toBe(0);
  });

  it('recovers from malformed stored JSON by treating the store as empty', () => {
    globalScope.localStorage!.setItem(STORAGE_KEY, '{ not valid json');
    expect(recordFor('L01')).toBeNull();
  });
});

describe('storage degradation', () => {
  it('is a no-op with no localStorage (the Node sim-check environment)', () => {
    useStorage(undefined);
    const { record, improved } = submit('L01', pass({ tier: 'gold', cost: 4.5 }));
    expect(improved).toBe(true); // the pure merge still reports the improvement
    expect(record.tier).toBe('gold');
    expect(recordFor('L01')).toBeNull(); // but nothing was persisted
  });

  it('swallows write failures from a denied / quota-exceeded store', () => {
    useStorage(new DeniedStorage());
    expect(() => submit('L01', pass({ tier: 'gold', cost: 4.5 }))).not.toThrow();
    useStorage(undefined);
  });
});
