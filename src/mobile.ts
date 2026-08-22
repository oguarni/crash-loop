// Host-side wiring for touch devices. Everything here is browser chrome, not
// game logic: the board owns its gestures, and a phone held upright gets nudged
// into landscape where the fixed 16:10 surface is actually readable.

import { enterFullscreen, fullscreenRoute } from './fullscreen';

/**
 * Stop the browser from claiming gestures that belong to the board. `touch-action:
 * none` (set in the page CSS) covers pan / pinch / double-tap zoom on the canvas
 * itself; these listeners close the remaining holes — the long-press menu that
 * interrupts a drag, and iOS Safari's page-level pinch, which ignores touch-action.
 *
 * @example installBoardGestureGuards(document.querySelector('canvas')!)
 */
export function installBoardGestureGuards(canvas: HTMLCanvasElement): void {
  // long-press (touch) and right-click (mouse) both surface a menu over the board
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // a stray double-tap would otherwise select the surrounding page furniture
  canvas.addEventListener('dblclick', (e) => e.preventDefault());
  // iOS-only pinch gesture events, which touch-action does not suppress. Bound to
  // the board rather than the document, so the rest of the page stays zoomable.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    canvas.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
}

/**
 * Show the "add to home screen" sheet — the fullscreen route for a browser that
 * has no Fullscreen API to offer. Every fullscreen control on the page routes
 * here instead of toggling when `fullscreenRoute()` says `install`, so a phone
 * whose browser cannot do it still gets told how it is done.
 *
 * @example if (fullscreenRoute() === 'install') showFullscreenHelp()
 */
export function showFullscreenHelp(): void {
  const sheet = document.getElementById('install');
  if (sheet) sheet.hidden = false;
}

/** Wire the install sheet's single answer. Safe to call when it is absent. */
export function installFullscreenHelp(): void {
  const sheet = document.getElementById('install');
  if (!sheet) return;
  // Anywhere on the sheet closes it, the button included: it carries no choice,
  // only an explanation, so there is nothing a stray tap could get wrong.
  //
  // On pointerdown, not click, because the tap that *opens* the sheet is still in
  // flight when it appears. A touch's compatibility click is hit-tested when it
  // is finally dispatched, by which time this overlay is under the finger that
  // asked for it — bound to click, the sheet would close itself on the way in.
  // That pointer's own down already went to the board; only a new one lands here.
  sheet.addEventListener('pointerdown', () => {
    sheet.hidden = true;
  });
}

/**
 * Wire the portrait-orientation nudge: CSS decides when to show it (small screen
 * + portrait), this only handles its two answers. Dismissal lasts for the page
 * session — a rotate/rotate-back does not bring it back.
 *
 * Its first answer is fullscreen, because that is the one that can actually turn
 * the device: an orientation lock is honoured only for a fullscreen document, so
 * a phone whose rotation is locked to portrait — where "rotate your device" does
 * nothing at all — is fixed by this button and by nothing else on the page. The
 * nudge then disappears on its own, since the media query behind it stops
 * matching once the device is landscape. Where the browser has no Fullscreen API
 * the button stays, pointing at the one route that device does have (the install
 * sheet); it is dropped only on a desktop browser, which needs neither.
 */
export function installRotateNudge(): void {
  const nudge = document.getElementById('rotate');
  if (!nudge) return;

  const go = document.getElementById('rotate-fullscreen');
  const route = fullscreenRoute();
  if (go && route !== 'none') {
    if (route === 'install') go.textContent = 'how to go fullscreen';
    go.addEventListener('click', (e) => {
      e.stopPropagation(); // asking for landscape is not "play in portrait anyway"
      if (route === 'install') showFullscreenHelp();
      else void enterFullscreen();
    });
  } else if (go) {
    go.hidden = true; // nothing to route to — leave the player one honest answer
  }

  nudge.addEventListener('click', () => {
    document.body.classList.add('rotate-dismissed');
  });
}
