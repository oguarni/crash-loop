import { describe, it, expect, afterEach } from 'vitest';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, toggleFullscreen } from './fullscreen';

// The module is all graceful degradation — every browser it runs on is missing
// or refusing some part of the API — so what is worth testing is exactly that:
// which shapes it recognises, and that a refusal anywhere reports false instead
// of throwing into the game loop. Named fakes stand in for `document` and
// `screen`, planted on globalThis the way progress.test.ts plants a Storage.

/** A browser with the modern, unprefixed Fullscreen API. */
class FakeDocument {
  fullscreenEnabled = true;
  fullscreenElement: unknown = null;
  documentElement: FakeElement;
  requests = 0;
  exits = 0;

  constructor(rejectRequest = false) {
    this.documentElement = new FakeElement(this, rejectRequest);
  }

  exitFullscreen = async (): Promise<void> => {
    this.exits += 1;
    this.fullscreenElement = null;
  };
}

class FakeElement {
  constructor(
    private readonly doc: FakeDocument,
    private readonly reject: boolean,
  ) {}

  requestFullscreen = async (): Promise<void> => {
    this.doc.requests += 1;
    // A request without transient user activation rejects — the single most
    // common failure, and the one a phone hits when the toggle acts too early.
    if (this.reject) throw new TypeError('permissions check failed');
    this.doc.fullscreenElement = this.doc.documentElement;
  };
}

/** Safari's prefixed spelling of the same API, with none of the modern names. */
class FakeWebkitDocument {
  webkitFullscreenEnabled = true;
  webkitFullscreenElement: unknown = null;
  documentElement: { webkitRequestFullscreen: () => void };
  exits = 0;

  constructor() {
    this.documentElement = {
      webkitRequestFullscreen: (): void => {
        // the old prefixed call returns void, not a promise
        this.webkitFullscreenElement = this.documentElement;
      },
    };
  }

  webkitExitFullscreen = (): void => {
    this.exits += 1;
    this.webkitFullscreenElement = null;
  };
}

/** iPhone Safari: the flag is false and no element carries the method. */
class FakeIosDocument {
  webkitFullscreenEnabled = false;
  webkitFullscreenElement: unknown = null;
  documentElement = {};
}

class FakeScreen {
  locked: string | null = null;
  unlocks = 0;
  constructor(private readonly refuse = false) {}

  orientation = {
    lock: async (orientation: string): Promise<void> => {
      if (this.refuse) throw new DOMException('not available on this device');
      this.locked = orientation;
    },
    unlock: (): void => {
      this.unlocks += 1;
      this.locked = null;
    },
  };
}

const globalScope = globalThis as { document?: unknown; screen?: unknown };

function plant(doc: unknown, scr: unknown = new FakeScreen()): void {
  globalScope.document = doc;
  globalScope.screen = scr;
}

afterEach(() => {
  delete globalScope.document;
  delete globalScope.screen;
});

describe('feature detection', () => {
  it('reports no support with no document at all (the Node sim-check bundle)', () => {
    expect(fullscreenSupported()).toBe(false);
    expect(isFullscreen()).toBe(false);
  });

  it('recognises the unprefixed API and the prefixed one', () => {
    plant(new FakeDocument());
    expect(fullscreenSupported()).toBe(true);
    plant(new FakeWebkitDocument());
    expect(fullscreenSupported()).toBe(true);
  });

  it('reports no support on iPhone Safari, where the toggle must not be drawn', () => {
    plant(new FakeIosDocument());
    expect(fullscreenSupported()).toBe(false);
  });

  it('reports no support when the flag is off, as inside a forbidden iframe', () => {
    const doc = new FakeDocument();
    doc.fullscreenEnabled = false;
    plant(doc);
    expect(fullscreenSupported()).toBe(false);
  });
});

describe('entering and leaving', () => {
  it('enters, reports the state, and leaves again', async () => {
    const doc = new FakeDocument();
    plant(doc);

    expect(await enterFullscreen()).toBe(true);
    expect(isFullscreen()).toBe(true);

    await exitFullscreen();
    expect(isFullscreen()).toBe(false);
    expect(doc.exits).toBe(1);
  });

  it('toggles both ways from whatever state it is in', async () => {
    plant(new FakeDocument());
    expect(await toggleFullscreen()).toBe(true);
    expect(await toggleFullscreen()).toBe(false);
    expect(isFullscreen()).toBe(false);
  });

  it('drives the prefixed API, whose calls return no promise', async () => {
    const doc = new FakeWebkitDocument();
    plant(doc);
    expect(await enterFullscreen()).toBe(true);
    await exitFullscreen();
    expect(doc.exits).toBe(1);
    expect(isFullscreen()).toBe(false);
  });

  it('reports a refused request instead of throwing', async () => {
    plant(new FakeDocument(true));
    await expect(enterFullscreen()).resolves.toBe(false);
    expect(isFullscreen()).toBe(false);
  });

  it('does nothing on a browser with no API', async () => {
    plant(new FakeIosDocument());
    expect(await enterFullscreen()).toBe(false);
    await expect(exitFullscreen()).resolves.toBeUndefined();
  });

  it('leaves an already-windowed page alone', async () => {
    const doc = new FakeDocument();
    plant(doc);
    await exitFullscreen();
    expect(doc.exits).toBe(0);
  });
});

describe('the landscape lock', () => {
  it('pins landscape on entry and releases it on the way out', async () => {
    const scr = new FakeScreen();
    plant(new FakeDocument(), scr);

    await enterFullscreen();
    expect(scr.locked).toBe('landscape');

    await exitFullscreen();
    expect(scr.unlocks).toBe(1);
    expect(scr.locked).toBe(null);
  });

  it('still goes fullscreen where the lock is refused (desktop, iPad)', async () => {
    const scr = new FakeScreen(true);
    plant(new FakeDocument(), scr);
    expect(await enterFullscreen()).toBe(true);
    expect(scr.locked).toBe(null);
  });

  it('still goes fullscreen where there is no orientation API at all', async () => {
    plant(new FakeDocument(), {});
    expect(await enterFullscreen()).toBe(true);
  });
});
