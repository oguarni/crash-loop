// Host-side wiring for touch devices. Everything here is browser chrome, not
// game logic: the board owns its gestures, and a phone held upright gets nudged
// into landscape where the fixed 16:10 surface is actually readable.

import { enterFullscreen, fullscreenGuide, fullscreenRoute, type GuideStep } from './fullscreen';

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
 * The guide's opening line: where the player is, and why that is not yet
 * fullscreen. Everything after it is the step list in index.html.
 *
 * @param app the app whose built-in browser this is, `app` for one that does
 *   not name itself, or null in a real browser
 * @example guideLead('ios', 'browser', 'Instagram')
 */
export function guideLead(os: 'ios' | 'android', step: GuideStep, app: string | null): string {
  if (app !== null) {
    const where = app === 'app' ? "an app's built-in browser" : `${app}'s built-in browser`;
    return os === 'ios'
      ? `You opened crash-loop in ${where}, which cannot add it to your Home Screen. Open it in Safari first: from the Home Screen it runs fullscreen.`
      : `You opened crash-loop in ${where}, which keeps its own bars on screen. In Chrome the game takes the whole screen.`;
  }
  if (os === 'android') {
    return step === 'browser'
      ? 'This browser cannot run crash-loop fullscreen. Chrome can.'
      : 'In Chrome, crash-loop takes the whole screen on your first tap.';
  }
  return step === 'browser'
    ? 'On iPhone, crash-loop runs fullscreen from the Home Screen, and Safari is the browser that puts it there.'
    : 'Safari on iPhone cannot run a page fullscreen, but crash-loop added to your Home Screen opens with no browser bars.';
}

/** This page's address without the tracking query an app's browser appends
 *  (Instagram adds its own), so the link pasted elsewhere is the clean one. */
function pageLink(): string {
  try {
    const { origin, pathname, href } = window.location;
    return origin && origin !== 'null' ? origin + pathname : href;
  } catch {
    return '';
  }
}

/** Fill the guide for this phone: its platform's list, the step it is on, the
 *  lead line, and the link row where the next move is another browser. */
function renderGuide(sheet: HTMLElement): void {
  const guide = fullscreenGuide();
  const lead = sheet.querySelector('#guide-lead');
  if (lead) lead.textContent = guideLead(guide.os, guide.step, guide.app);

  for (const list of sheet.querySelectorAll<HTMLElement>('.guide-steps')) {
    list.hidden = list.dataset.os !== guide.os;
    if (list.hidden) continue;
    const steps = [...list.querySelectorAll<HTMLElement>('li[data-step]')];
    const at = steps.findIndex((li) => li.dataset.step === guide.step);
    steps.forEach((li, i) => {
      li.dataset.state = i < at ? 'done' : i === at ? 'now' : 'next';
    });
  }
  // Inside an app the way out is that app's menu; in another browser it is the
  // link, pasted by hand. Only one of the two instructions is ever true.
  const when = guide.app !== null ? 'in-app' : 'other-browser';
  for (const detail of sheet.querySelectorAll<HTMLElement>('[data-when]')) {
    detail.hidden = detail.dataset.when !== when;
  }
  for (const name of sheet.querySelectorAll<HTMLElement>('[data-app]')) {
    name.textContent = guide.app !== null && guide.app !== 'app' ? guide.app : 'the app';
  }

  const linkRow = sheet.querySelector<HTMLElement>('.guide-link');
  if (linkRow) linkRow.hidden = guide.step !== 'browser';
  const url = sheet.querySelector('#guide-url');
  if (url) url.textContent = pageLink();
}

// Whether a click on the guide's buttons is the player's. The tap on the board
// that opens the guide is still in flight when the sheet appears, and a touch's
// compatibility click is hit-tested when it is finally dispatched — by which
// time this overlay is under the finger that asked for it. Bound to click, the
// buttons would act on that ghost and close the sheet on its way in. That
// pointer's own down already went to the board, so only a press that lands on
// the sheet (or a key) arms them.
let guideArmed = true;

/**
 * Show the fullscreen guide: the route for a phone whose browser cannot simply
 * be asked — an app's built-in browser, or iPhone Safari. Every fullscreen
 * control on the page routes here instead of toggling when `fullscreenRoute()`
 * is not `api`, and the page opens it on arrival when shouldOpenGuideOnArrival()
 * says the player needs it before they would think to look.
 *
 * @param opts.pressInFlight the tap that opened it has not finished yet (a press
 *   on the board), so its click must not reach the guide's buttons
 * @example if (fullscreenRoute() !== 'api') showFullscreenHelp({ pressInFlight: true })
 */
export function showFullscreenHelp(opts: { pressInFlight?: boolean } = {}): void {
  const sheet = document.getElementById('install');
  if (!sheet) return;
  renderGuide(sheet);
  guideArmed = !opts.pressInFlight;
  sheet.hidden = false;
  sheet.scrollTop = 0;
}

/** Copy text, by the async clipboard where the browser allows it and by the
 *  selection where it does not (older in-app browsers). @returns whether it took */
async function copyText(text: string, source: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* no async clipboard here, or it was refused — fall back to the selection */
  }
  try {
    const range = document.createRange();
    range.selectNodeContents(source);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // The selection is left in place on purpose: if the copy fails, the link is
    // already highlighted and a long-press copies it by hand.
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/** Wire the guide's two buttons. Safe to call when the sheet is absent. */
export function installFullscreenHelp(): void {
  const sheet = document.getElementById('install');
  if (!sheet) return;
  const arm = (): void => {
    guideArmed = true;
  };
  sheet.addEventListener('pointerdown', arm, true);
  sheet.addEventListener('keydown', arm, true);

  document.getElementById('install-dismiss')?.addEventListener('click', () => {
    if (guideArmed) sheet.hidden = true;
  });

  const copy = document.getElementById('guide-copy');
  const url = document.getElementById('guide-url');
  if (!copy || !url) return;
  const label = copy.textContent ?? 'copy link';
  let reset: ReturnType<typeof setTimeout> | undefined;
  copy.addEventListener('click', () => {
    if (!guideArmed) return;
    void copyText(url.textContent ?? '', url).then((ok) => {
      copy.textContent = ok ? 'copied' : 'long-press the link';
      clearTimeout(reset);
      reset = setTimeout(() => {
        copy.textContent = label;
      }, 2500);
    });
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
 * matching once the device is landscape. Where the browser cannot be asked (an
 * app's built-in browser, or iPhone Safari) the button stays, pointing at the
 * route that device does have (the guide); it is dropped only on a desktop
 * browser, which needs neither.
 */
export function installRotateNudge(): void {
  const nudge = document.getElementById('rotate');
  if (!nudge) return;

  const go = document.getElementById('rotate-fullscreen');
  const route = fullscreenRoute();
  if (go && route !== 'none') {
    if (route !== 'api') go.textContent = 'how to go fullscreen';
    go.addEventListener('click', (e) => {
      e.stopPropagation(); // asking for landscape is not "play in portrait anyway"
      // A click on a page button is already over, so nothing follows it into
      // the guide: no pressInFlight here.
      if (route !== 'api') showFullscreenHelp();
      else void enterFullscreen();
    });
  } else if (go) {
    go.hidden = true; // nothing to route to — leave the player one honest answer
  }

  nudge.addEventListener('click', () => {
    document.body.classList.add('rotate-dismissed');
  });
}
