// Fullscreen for the board, and the landscape lock that rides along with it.
//
// The board is a fixed 960x600 surface scaled to fit, so on a phone every pixel
// of browser chrome — URL bar, tab strip, system bars — comes straight out of
// the board, and out of the 11px type it has to render at. Fullscreen hands that
// space back. It is also the only state in which a browser will honour an
// orientation lock, which is the real answer for a phone whose rotation is
// locked to portrait: "rotate your device" cannot help there, and a locked
// landscape can.
//
// Everything here is best-effort and never throws into the game loop. The API is
// absent on iPhone Safari (an installed home-screen launch is the fullscreen
// route there — see the web app manifest), a request is rejected without user
// activation, and the orientation lock is unsupported on the desktop. Each call
// is guarded and reports a boolean instead.

/** The prefixed corners of the Fullscreen API that Safari still needs. */
interface FullscreenDoc extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenEl extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** Screen orientation as the browsers that have it actually expose it. */
interface LockableOrientation {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

function doc(): FullscreenDoc | null {
  try {
    return typeof document !== 'undefined' ? (document as FullscreenDoc) : null;
  } catch {
    return null;
  }
}

function root(): FullscreenEl | null {
  return (doc()?.documentElement as FullscreenEl | undefined) ?? null;
}

function orientation(): LockableOrientation | null {
  try {
    if (typeof screen === 'undefined') return null;
    return (screen as Screen & { orientation?: LockableOrientation }).orientation ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether this browser can put the page in fullscreen at all. False on iPhone
 * Safari (which carries the methods on <video> only) and inside an iframe that
 * was not granted the permission — both cases where the toggle must not be
 * drawn, because a control that cannot act is worse than no control.
 *
 * @example if (fullscreenSupported()) drawChromeRow(ctx, layoutFullscreenButton(), ...)
 */
export function fullscreenSupported(): boolean {
  const d = doc();
  const el = root();
  if (!d || !el) return false;
  const canRequest = typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
  const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false;
  return canRequest && enabled;
}

/** Whether the page is fullscreen right now — including an exit the player made
 *  through the browser's own affordance (Esc, a swipe, the system back gesture). */
export function isFullscreen(): boolean {
  const d = doc();
  return !!(d && (d.fullscreenElement ?? d.webkitFullscreenElement));
}

/**
 * Go fullscreen and ask for landscape. The document element is the target, not
 * the canvas, so the page furniture that lives beside it — the portrait nudge —
 * comes along instead of being left behind on a hidden page.
 *
 * Must be called from an event that carries transient user activation. Per HTML
 * that is `pointerdown` for a mouse but `pointerup` for a finger, so the input
 * layer fires this on the event that actually activates for the pointer at hand.
 *
 * @returns whether the page ended up fullscreen
 */
export async function enterFullscreen(): Promise<boolean> {
  const el = root();
  const request = el?.requestFullscreen ?? el?.webkitRequestFullscreen;
  if (!el || !request) return false;
  try {
    await request.call(el);
  } catch {
    return false; // no user activation, or the browser refused outright
  }
  await lockLandscape();
  return isFullscreen();
}

/** Leave fullscreen and release the orientation lock. A no-op when not in it. */
export async function exitFullscreen(): Promise<void> {
  const d = doc();
  if (!d || !isFullscreen()) return;
  // The spec releases the lock on exit anyway; doing it first keeps the device
  // from spending a frame locked to a landscape it is no longer filling.
  unlockOrientation();
  const exit = d.exitFullscreen ?? d.webkitExitFullscreen;
  try {
    await exit?.call(d);
  } catch {
    /* already leaving, or the UA declined — the state is read back, not assumed */
  }
}

/** Flip the current state. @returns whether the page is fullscreen afterwards. */
export async function toggleFullscreen(): Promise<boolean> {
  if (isFullscreen()) {
    await exitFullscreen();
    return false;
  }
  return enterFullscreen();
}

/**
 * Pin the device to landscape, where a 16:10 board is readable. Only a
 * fullscreen document may hold a lock, and only Android honours it at all — on
 * the desktop and on iOS the promise rejects, which is not a failure worth
 * reporting: the player simply keeps whatever orientation they had.
 */
async function lockLandscape(): Promise<void> {
  try {
    await orientation()?.lock?.('landscape');
  } catch {
    /* unsupported (desktop, iOS) or refused — landscape stays the player's job */
  }
}

function unlockOrientation(): void {
  try {
    orientation()?.unlock?.();
  } catch {
    /* ditto */
  }
}
