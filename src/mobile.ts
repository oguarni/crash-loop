// Host-side wiring for touch devices. Everything here is browser chrome, not
// game logic: the board owns its gestures, and a phone held upright gets nudged
// into landscape where the fixed 16:10 surface is actually readable.

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
 * Wire the portrait-orientation nudge: CSS decides when to show it (small screen
 * + portrait), this only lets the player dismiss it and play anyway. Dismissal
 * lasts for the page session — a rotate/rotate-back does not bring it back.
 */
export function installRotateNudge(): void {
  const nudge = document.getElementById('rotate');
  if (!nudge) return;
  nudge.addEventListener('click', () => {
    document.body.classList.add('rotate-dismissed');
  });
}
