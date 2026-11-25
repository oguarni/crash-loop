// Which phone, and which browser on it — the two facts the fullscreen guide
// cannot get from feature detection alone.
//
// Feature detection answers "can this page go fullscreen here", and that is what
// fullscreen.ts asks first. It cannot answer "where should the player go
// instead": a link tapped in Instagram opens in Instagram's own browser, which
// has no "Add to Home Screen" on an iPhone and keeps its own bars on screen on
// Android, and the way out of it differs by platform. Only the user agent says
// which app the page is inside, so this module reads it, and keeps the reading
// pure (a string and a number in, a description out) so every case is a test.

export type MobileOs = 'ios' | 'android' | 'other';

export interface Device {
  /** The phone's platform, or `other` for anything that is not one. */
  os: MobileOs;
  /**
   * The app whose built-in browser this page is running in — `Instagram`,
   * `Facebook`, … — or `app` when the browser is plainly embedded but the app is
   * not one this module names. Null in a real browser, and always null off a phone.
   */
  inApp: string | null;
  /** Safari itself on iOS: the one browser the iPhone guide installs from. */
  safari: boolean;
}

/**
 * Apps whose built-in browser announces itself in the user agent, checked in
 * order: Messenger before Facebook, because Messenger also carries `FBAN`.
 */
const IN_APP: ReadonlyArray<readonly [RegExp, string]> = [
  [/Instagram/, 'Instagram'],
  [/Messenger/, 'Messenger'],
  [/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'],
  [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'],
  [/Snapchat/, 'Snapchat'],
  [/LinkedInApp/, 'LinkedIn'],
  [/Pinterest/, 'Pinterest'],
  [/\bLine\//, 'LINE'],
];

/** iOS browsers that are not Safari, though every one of them says `Safari/`. */
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Ddg\/|YaBrowser/;

/**
 * Describe the device behind a user agent.
 *
 * @param ua the user agent string
 * @param touchPoints `navigator.maxTouchPoints`, which is how an iPad on iPadOS 13+
 *   — whose Safari asks for the desktop site and calls itself a Mac — still gives
 *   itself away
 * @example readDevice(navigator.userAgent, navigator.maxTouchPoints)
 */
export function readDevice(ua: string, touchPoints: number): Device {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const android = !ios && /Android/.test(ua);
  if (!ios && !android) return { os: 'other', inApp: null, safari: false };

  const named = IN_APP.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  // An embedded browser that does not name its app still has a tell. On iOS a
  // WKWebView drops the `Safari/` token every real browser keeps; on Android the
  // system WebView adds `; wv)`. A home-screen launch on iOS drops `Safari/` too,
  // which is why fullscreen.ts rules out a standalone display before asking this.
  const embedded = ios ? !/Safari\//.test(ua) : /;\s*wv\)/.test(ua);
  const inApp = named ?? (embedded ? 'app' : null);
  const safari = ios && inApp === null && !IOS_OTHER_BROWSER.test(ua);
  return { os: ios ? 'ios' : 'android', inApp, safari };
}

/** The device this page is running on, read defensively: the Node sim-check
 *  bundle has no navigator, or one that is not a browser's. */
export function currentDevice(): Device {
  try {
    const nav = (globalThis as { navigator?: { userAgent?: unknown; maxTouchPoints?: unknown } }).navigator;
    const ua = typeof nav?.userAgent === 'string' ? nav.userAgent : '';
    const touch = typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
    return readDevice(ua, touch);
  } catch {
    return { os: 'other', inApp: null, safari: false };
  }
}
