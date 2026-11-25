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

import { currentDevice } from './device';

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
 * was not granted the permission. It answers "will a request work", not "should
 * a control be drawn" — that is fullscreenRoute(), which still offers a phone
 * the install route when the answer here is no.
 *
 * @example if (fullscreenSupported()) void toggleFullscreen()
 */
export function fullscreenSupported(): boolean {
  const d = doc();
  const el = root();
  if (!d || !el) return false;
  const canRequest = typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
  const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false;
  return canRequest && enabled;
}

/** A media query, answered defensively: there is no matchMedia in the Node
 *  sim-check bundle, and a browser may throw on a query it cannot parse. */
function media(query: string): boolean {
  try {
    const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
    return typeof mm === 'function' ? mm.call(globalThis, query).matches === true : false;
  } catch {
    return false;
  }
}

/**
 * Whether the page is already running without browser chrome, because it was
 * launched from a home-screen icon rather than opened in a tab. The web app
 * manifest's display: "fullscreen" has then already done this module's job
 * (`navigator.standalone` is the iOS spelling of the same fact), so there is no
 * space left to reclaim and nothing to offer.
 */
export function isStandaloneDisplay(): boolean {
  if (media('(display-mode: fullscreen)') || media('(display-mode: standalone)')) return true;
  try {
    return (globalThis as { navigator?: { standalone?: boolean } }).navigator?.standalone === true;
  } catch {
    return false;
  }
}

/**
 * How this browser can reach fullscreen, and therefore what a fullscreen control
 * should do when it is pressed:
 *
 * - `api`     — the Fullscreen API works here; the control is a toggle.
 * - `browser` — an app's built-in browser (a link tapped in Instagram, Facebook,
 *               TikTok, …). Whatever it claims about the API, it cannot add the
 *               page to an iPhone's home screen and keeps its own bars on an
 *               Android one, so the way to fullscreen starts with leaving it for
 *               the phone's real browser. The control opens the guide that says so.
 * - `install` — no API, but a touch device that can install the page to its home
 *               screen, where the manifest opens it without browser chrome. This
 *               is the whole of iPhone Safari; the control opens the same guide.
 * - `none`    — a desktop browser without the API, or a page already launched
 *               from an icon: nothing to draw, because a control that cannot act
 *               is worse than no control.
 */
export type FullscreenRoute = 'api' | 'browser' | 'install' | 'none';

/** @example if (fullscreenRoute() !== 'api') showFullscreenHelp() */
export function fullscreenRoute(): FullscreenRoute {
  // Checked before the API: an Android WebView may well report the API, and the
  // bars it keeps are the in-app browser's own, which no request takes away. The
  // standalone check comes first because an iOS home-screen launch drops the
  // `Safari/` token just as an embedded browser does (see readDevice()).
  if (!isStandaloneDisplay() && currentDevice().inApp !== null) return 'browser';
  if (fullscreenSupported()) return 'api';
  if (isStandaloneDisplay()) return 'none';
  // A coarse pointer is the honest test for "can this be added to a home
  // screen": every browser that has no Fullscreen API but does install — iOS
  // Safari, and the iOS engines every other iPhone browser is built on — is a
  // touch device, and no desktop is.
  return media('(pointer: coarse)') ? 'install' : 'none';
}

/** Whether any fullscreen affordance should be drawn — see fullscreenRoute(). */
export function fullscreenOffered(): boolean {
  return fullscreenRoute() !== 'none';
}

/**
 * Whether the screen is small enough that browser chrome is worth reclaiming
 * without being asked. The breakpoint is the page CSS's own — the size at which
 * the stage already strips its padding and hint line for the same reason — so
 * the two agree on what counts as a phone.
 */
export function phoneSized(): boolean {
  return media('(max-width: 820px)') || media('(max-height: 520px)');
}

/**
 * Whether the page should take the screen on a touch it was given for something
 * else, rather than waiting to be asked. True only on a phone-sized screen whose
 * browser can actually do it and is not already there: an installed launch has no
 * chrome left to reclaim, and a desktop has room to spare. A browser without the
 * API is shouldOpenGuideOnArrival()'s business, not this one's.
 *
 * The caller owns the other half of the decision: *when* to offer it (a finger,
 * once per session) and when to stop (the moment the player leaves fullscreen).
 */
export function shouldAutoFullscreen(): boolean {
  return fullscreenRoute() === 'api' && phoneSized() && !isFullscreen() && !isStandaloneDisplay();
}

/**
 * Whether the fullscreen guide should open by itself as the page loads, before
 * the player has asked anything. The phone that shouldAutoFullscreen() cannot
 * help is the one that most needs telling, and it would otherwise never be told:
 * a player who came from an Instagram link has no reason to look for a
 * fullscreen control, and inside that app's browser the control could not act
 * anyway. So the guide opens on arrival in any app's built-in browser, and in an
 * iPhone browser tab, where the home screen is the only way to full screen. An
 * Android browser with the API needs no guide: its first touch takes the screen.
 */
export function shouldOpenGuideOnArrival(): boolean {
  const route = fullscreenRoute();
  if (route === 'browser') return true;
  return route === 'install' && currentDevice().os === 'ios' && phoneSized();
}

/** A step of the fullscreen guide — see fullscreenGuide(). */
export type GuideStep = 'browser' | 'install' | 'launch';

/**
 * Which guide this phone gets, and the step it is on. The two platforms take
 * different roads to the same place, so they get different steps:
 *
 * - iOS:     open in Safari → Add to Home Screen → launch from the icon. The home
 *            screen is the only fullscreen an iPhone gives a page, and Safari is
 *            the browser that reliably puts one there.
 * - Android: open in Chrome → tap the game, which takes the screen on its own.
 *            Installing is an optional extra, not a step on the way.
 *
 * `app` names the app whose browser the player is in, when there is one, so the
 * guide can say where its menu is.
 *
 * @example const { os, step } = fullscreenGuide() // { os: 'ios', step: 'browser', app: 'Instagram' }
 */
export function fullscreenGuide(): { os: 'ios' | 'android'; step: GuideStep; app: string | null } {
  const device = currentDevice();
  const app = isStandaloneDisplay() ? null : device.inApp;
  if (device.os === 'android') {
    return { os: 'android', step: app !== null || !fullscreenSupported() ? 'browser' : 'launch', app };
  }
  // iOS, and the odd touch device that is neither: the home-screen route is the
  // one a browser without the API has, and those steps describe it.
  const inSafari = device.os === 'ios' ? device.safari : app === null;
  return { os: 'ios', step: app !== null || !inSafari ? 'browser' : 'install', app };
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
