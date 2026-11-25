import { describe, it, expect, afterEach } from 'vitest';
import {
  enterFullscreen,
  exitFullscreen,
  fullscreenGuide,
  fullscreenOffered,
  fullscreenRoute,
  fullscreenSupported,
  isFullscreen,
  isStandaloneDisplay,
  phoneSized,
  shouldAutoFullscreen,
  shouldOpenGuideOnArrival,
  toggleFullscreen,
} from './fullscreen';

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

const globalScope = globalThis as {
  document?: unknown;
  screen?: unknown;
  matchMedia?: unknown;
  navigator?: unknown;
};

function plant(doc: unknown, scr: unknown = new FakeScreen()): void {
  globalScope.document = doc;
  globalScope.screen = scr;
}

/** matchMedia as the module uses it: the listed queries match and nothing else
 *  does — which is also how a browser answers a feature it does not have. Absent
 *  entirely by default, as in the Node sim-check bundle. */
function plantMedia(...matching: string[]): void {
  globalScope.matchMedia = (query: string) => ({ matches: matching.includes(query) });
}

afterEach(() => {
  delete globalScope.document;
  delete globalScope.screen;
  delete globalScope.matchMedia;
  delete globalScope.navigator;
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

describe('which route a browser has to fullscreen', () => {
  it('toggles directly wherever the API works', () => {
    plant(new FakeDocument());
    plantMedia('(pointer: coarse)');
    expect(fullscreenRoute()).toBe('api');
    expect(fullscreenOffered()).toBe(true);
  });

  it('sends a phone with no API to the install sheet, rather than nowhere', () => {
    plant(new FakeIosDocument());
    plantMedia('(pointer: coarse)');
    expect(fullscreenRoute()).toBe('install');
    expect(fullscreenOffered()).toBe(true);
  });

  it('offers nothing on a desktop browser with no API', () => {
    plant(new FakeIosDocument());
    plantMedia(); // a fine pointer: no home screen to install to
    expect(fullscreenRoute()).toBe('none');
    expect(fullscreenOffered()).toBe(false);
  });

  it('offers nothing to a launch that already has no browser chrome', () => {
    plant(new FakeIosDocument());
    plantMedia('(pointer: coarse)', '(display-mode: fullscreen)');
    expect(isStandaloneDisplay()).toBe(true);
    expect(fullscreenRoute()).toBe('none');
  });

  it('reads navigator.standalone, the iOS spelling of the same fact', () => {
    plant(new FakeIosDocument());
    plantMedia('(pointer: coarse)');
    globalScope.navigator = { standalone: true };
    expect(isStandaloneDisplay()).toBe(true);
    expect(fullscreenRoute()).toBe('none');
  });

  it('recognises a phone-sized screen by either dimension', () => {
    plantMedia('(max-height: 520px)');
    expect(phoneSized()).toBe(true);
    plantMedia('(max-width: 820px)');
    expect(phoneSized()).toBe(true);
    plantMedia();
    expect(phoneSized()).toBe(false);
  });

  it('answers false rather than throwing where matchMedia is absent or angry', () => {
    plant(new FakeIosDocument());
    expect(fullscreenRoute()).toBe('none'); // no matchMedia at all
    expect(phoneSized()).toBe(false);
    globalScope.matchMedia = () => {
      throw new TypeError('unparsable query');
    };
    expect(fullscreenRoute()).toBe('none');
    expect(isStandaloneDisplay()).toBe(false);
    expect(phoneSized()).toBe(false);
  });
});

describe('taking the screen unasked', () => {
  const PHONE = ['(max-width: 820px)', '(pointer: coarse)'];

  it('takes it on a phone whose browser can', () => {
    plant(new FakeDocument());
    plantMedia(...PHONE);
    expect(shouldAutoFullscreen()).toBe(true);
  });

  it('leaves a desktop-sized screen alone, touch or not', () => {
    plant(new FakeDocument());
    plantMedia('(pointer: coarse)'); // a touchscreen, but not a phone-sized one
    expect(shouldAutoFullscreen()).toBe(false);
  });

  it('requests nothing where the install route is the only one', () => {
    plant(new FakeIosDocument());
    plantMedia(...PHONE);
    expect(fullscreenRoute()).toBe('install');
    expect(shouldAutoFullscreen()).toBe(false);
  });

  it('leaves a launch that is already chrome-free alone', () => {
    plant(new FakeDocument());
    plantMedia(...PHONE, '(display-mode: fullscreen)');
    expect(shouldAutoFullscreen()).toBe(false);
  });

  it('does not ask again once the page is already fullscreen', async () => {
    plant(new FakeDocument());
    plantMedia(...PHONE);
    await enterFullscreen();
    expect(shouldAutoFullscreen()).toBe(false);
  });
});

/** Just enough of a user agent for device.ts to place it — device.test.ts holds
 *  the full strings. */
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.41.101';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const ANDROID_INSTAGRAM =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.134 Mobile Safari/537.36 Instagram 339.0.0.33.98 Android';

function plantAgent(userAgent: string, extra: Record<string, unknown> = {}): void {
  globalScope.navigator = { userAgent, maxTouchPoints: 5, ...extra };
}

describe('a link opened inside an app', () => {
  const PHONE = ['(max-width: 820px)', '(pointer: coarse)'];

  it('routes Instagram on an iPhone to the guide, which opens by itself', () => {
    plant(new FakeIosDocument());
    plantMedia(...PHONE);
    plantAgent(IPHONE_INSTAGRAM);
    expect(fullscreenRoute()).toBe('browser');
    expect(fullscreenOffered()).toBe(true);
    expect(shouldOpenGuideOnArrival()).toBe(true);
    expect(fullscreenGuide()).toEqual({ os: 'ios', step: 'browser', app: 'Instagram' });
  });

  it('routes Instagram on Android there too, even though its WebView reports the API', () => {
    plant(new FakeDocument());
    plantMedia(...PHONE);
    plantAgent(ANDROID_INSTAGRAM);
    expect(fullscreenSupported()).toBe(true);
    expect(fullscreenRoute()).toBe('browser');
    expect(shouldAutoFullscreen()).toBe(false); // the guide's job, not a request's
    expect(shouldOpenGuideOnArrival()).toBe(true);
    expect(fullscreenGuide()).toEqual({ os: 'android', step: 'browser', app: 'Instagram' });
  });

  it('takes a home-screen launch for one, not for an in-app browser', () => {
    // An iOS web app keeps no Safari/ token either, but it is already chrome-free.
    plant(new FakeIosDocument());
    plantMedia(...PHONE);
    plantAgent(IPHONE_INSTAGRAM.replace(/ Instagram.*/, ''), { standalone: true });
    expect(fullscreenRoute()).toBe('none');
    expect(shouldOpenGuideOnArrival()).toBe(false);
  });
});

describe('the guide in a real browser', () => {
  const PHONE = ['(max-width: 820px)', '(pointer: coarse)'];

  it('opens by itself in iPhone Safari, on the Home Screen step', () => {
    plant(new FakeIosDocument());
    plantMedia(...PHONE);
    plantAgent(IPHONE_SAFARI);
    expect(fullscreenRoute()).toBe('install');
    expect(shouldOpenGuideOnArrival()).toBe(true);
    expect(fullscreenGuide()).toEqual({ os: 'ios', step: 'install', app: null });
  });

  it('sends Chrome on an iPhone to Safari first', () => {
    plant(new FakeIosDocument());
    plantMedia(...PHONE);
    plantAgent(IPHONE_CHROME);
    expect(fullscreenGuide()).toEqual({ os: 'ios', step: 'browser', app: null });
  });

  it('stays shut on an iOS screen that is not phone-sized', () => {
    plant(new FakeIosDocument());
    plantMedia('(pointer: coarse)');
    plantAgent(IPHONE_SAFARI);
    expect(shouldOpenGuideOnArrival()).toBe(false);
  });

  it('stays shut in Chrome on Android, whose first touch takes the screen', () => {
    plant(new FakeDocument());
    plantMedia(...PHONE);
    plantAgent(ANDROID_CHROME);
    expect(fullscreenRoute()).toBe('api');
    expect(shouldOpenGuideOnArrival()).toBe(false);
    expect(shouldAutoFullscreen()).toBe(true);
    expect(fullscreenGuide()).toEqual({ os: 'android', step: 'launch', app: null });
  });

  it('stays shut on a desktop', () => {
    plant(new FakeDocument());
    plantMedia();
    expect(shouldOpenGuideOnArrival()).toBe(false);
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
