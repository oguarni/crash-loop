// @vitest-environment jsdom
/// <reference types="vite/client" />
// The page furniture that only a phone ever sees. jsdom has no Fullscreen API —
// which is exactly the browser these tests care about, iPhone Safari — so what
// varies here is the pointer and the user agent: a coarse pointer has a home
// screen to install to and must keep its fullscreen affordance, a fine one has
// neither and must not be offered a dead control, and the user agent decides
// which guide a phone gets and which step of it the player is on.
//
// The nudge and the guide are read from index.html itself rather than copied
// into a fixture, so a renamed id or a dropped data-step fails here, not on a
// phone.
import { describe, it, expect, afterEach, vi } from 'vitest';
import indexHtml from '../index.html?raw';
import { guideLead, installFullscreenHelp, installRotateNudge, showFullscreenHelp } from './mobile';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.41.101',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  androidInstagram:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.134 Mobile Safari/537.36 Instagram 339.0.0.33.98 Android',
};

/** The portrait nudge and the fullscreen guide, exactly as index.html ships them. */
function fixture(): void {
  const page = new DOMParser().parseFromString(indexHtml, 'text/html');
  document.body.className = '';
  document.body.innerHTML = ['rotate', 'install'].map((id) => page.getElementById(id)!.outerHTML).join('');
}

function pointer(kind: 'coarse' | 'fine'): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: kind === 'coarse' && query === '(pointer: coarse)',
  }));
}

function agent(userAgent: string): void {
  vi.spyOn(Navigator.prototype, 'userAgent', 'get').mockReturnValue(userAgent);
}

const click = (el: Element): void => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
/** A fresh press, which is what arms the guide's buttons. */
const press = (el: Element): void => {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
};
const el = (id: string): HTMLElement => document.getElementById(id)!;
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The guide's step list for one platform, and each step's state by name. */
function steps(os: 'ios' | 'android'): { list: HTMLElement; state: Record<string, string | undefined> } {
  const list = document.querySelector<HTMLElement>(`.guide-steps[data-os="${os}"]`)!;
  const state: Record<string, string | undefined> = {};
  for (const li of list.querySelectorAll<HTMLElement>('li[data-step]')) state[li.dataset.step!] = li.dataset.state;
  return { list, state };
}
/** Whether the in-app or the other-browser instruction is showing for a step. */
const detail = (os: 'ios' | 'android', when: 'in-app' | 'other-browser'): HTMLElement =>
  document.querySelector<HTMLElement>(`.guide-steps[data-os="${os}"] [data-when="${when}"]`)!;
const linkRow = (): HTMLElement => document.querySelector<HTMLElement>('.guide-link')!;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { clipboard?: unknown }).clipboard;
  window.history.replaceState(null, '', '/');
  document.body.innerHTML = '';
});

describe('the portrait nudge', () => {
  it('keeps its fullscreen answer on a phone with no API, pointing at the guide', () => {
    pointer('coarse');
    fixture();
    installRotateNudge();
    installFullscreenHelp();

    const go = el('rotate-fullscreen');
    expect(go.hidden).toBe(false);
    expect(go.textContent).toContain('fullscreen');

    click(go);
    expect(el('install').hidden).toBe(false);
    // asking for fullscreen is not "play in portrait anyway": the click must not
    // also dismiss the nudge behind it
    expect(document.body.classList.contains('rotate-dismissed')).toBe(false);
  });

  it('points at the guide inside an app’s browser too', () => {
    pointer('coarse');
    agent(UA.androidInstagram);
    fixture();
    installRotateNudge();
    expect(el('rotate-fullscreen').textContent).toBe('how to go fullscreen');
  });

  it('drops that answer on a browser with neither route', () => {
    pointer('fine');
    fixture();
    installRotateNudge();
    expect(el('rotate-fullscreen').hidden).toBe(true);
  });

  it('dismisses for the session on its other answer', () => {
    pointer('coarse');
    fixture();
    installRotateNudge();
    click(el('rotate-dismiss'));
    expect(document.body.classList.contains('rotate-dismissed')).toBe(true);
  });

  it('does nothing at all where the nudge is absent', () => {
    document.body.innerHTML = '';
    expect(() => installRotateNudge()).not.toThrow();
  });
});

describe('the fullscreen guide, step by step', () => {
  it('walks Instagram on an iPhone out to Safari first', () => {
    pointer('coarse');
    agent(UA.iphoneInstagram);
    window.history.replaceState(null, '', '/crash-loop/?igsh=MTIzNDU2');
    fixture();
    showFullscreenHelp();

    expect(el('install').hidden).toBe(false);
    const ios = steps('ios');
    expect(ios.list.hidden).toBe(false);
    expect(steps('android').list.hidden).toBe(true);
    expect(ios.state).toEqual({ browser: 'now', install: 'next', launch: 'next' });

    // the way out is Instagram's own menu, named as such
    expect(detail('ios', 'in-app').hidden).toBe(false);
    expect(detail('ios', 'other-browser').hidden).toBe(true);
    expect(detail('ios', 'in-app').textContent).toContain('Instagram');
    expect(el('guide-lead').textContent).toContain('Instagram');
    expect(el('guide-lead').textContent).toContain('Safari');

    // and the link to paste, without the tracking query the app appended
    expect(linkRow().hidden).toBe(false);
    expect(el('guide-url').textContent).toBe(`${window.location.origin}/crash-loop/`);
  });

  it('picks up in Safari at the Home Screen step', () => {
    pointer('coarse');
    agent(UA.iphoneSafari);
    fixture();
    showFullscreenHelp();

    expect(steps('ios').state).toEqual({ browser: 'done', install: 'now', launch: 'next' });
    expect(linkRow().hidden).toBe(true); // already in the right browser
  });

  it('sends another iPhone browser to Safari by the link', () => {
    pointer('coarse');
    agent(UA.iphoneChrome);
    fixture();
    showFullscreenHelp();

    expect(steps('ios').state.browser).toBe('now');
    expect(detail('ios', 'other-browser').hidden).toBe(false);
    expect(detail('ios', 'in-app').hidden).toBe(true);
    expect(linkRow().hidden).toBe(false);
  });

  it('gives Android its own steps, out to Chrome', () => {
    pointer('coarse');
    agent(UA.androidInstagram);
    fixture();
    showFullscreenHelp();

    const android = steps('android');
    expect(android.list.hidden).toBe(false);
    expect(steps('ios').list.hidden).toBe(true);
    expect(android.state).toEqual({ browser: 'now', launch: 'next', install: 'next' });
    expect(detail('android', 'in-app').textContent).toContain('Instagram');
    expect(el('guide-lead').textContent).toContain('Chrome');
  });
});

describe('the fullscreen guide’s buttons', () => {
  it('ignore the click of the board tap that opened the guide', () => {
    pointer('coarse');
    fixture();
    installFullscreenHelp();
    showFullscreenHelp({ pressInFlight: true });

    // That click is hit-tested late, by which time the guide is under the finger.
    click(el('install-dismiss'));
    expect(el('install').hidden).toBe(false);

    press(el('install-dismiss'));
    click(el('install-dismiss'));
    expect(el('install').hidden).toBe(true);
  });

  it('answer at once when the guide opened on arrival', () => {
    pointer('coarse');
    fixture();
    installFullscreenHelp();
    showFullscreenHelp();
    click(el('install-dismiss'));
    expect(el('install').hidden).toBe(true);
  });

  it('are the only way to close it: a tap on the steps is reading, not leaving', () => {
    pointer('coarse');
    fixture();
    installFullscreenHelp();
    showFullscreenHelp();
    const sheet = el('install');
    press(sheet);
    click(sheet);
    expect(sheet.hidden).toBe(false);
  });

  it('copy the clean link to the clipboard', async () => {
    pointer('coarse');
    agent(UA.iphoneInstagram);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fixture();
    installFullscreenHelp();
    showFullscreenHelp();

    click(el('guide-copy'));
    await settle();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/`);
    expect(el('guide-copy').textContent).toBe('copied');
  });

  it('point at a long-press where nothing can copy', async () => {
    pointer('coarse');
    agent(UA.iphoneInstagram);
    fixture();
    installFullscreenHelp();
    showFullscreenHelp();

    click(el('guide-copy'));
    await settle();
    expect(el('guide-copy').textContent).toBe('long-press the link');
  });

  it('do nothing at all where the guide is absent', () => {
    document.body.innerHTML = '';
    expect(() => installFullscreenHelp()).not.toThrow();
    expect(() => showFullscreenHelp()).not.toThrow();
  });
});

describe('the guide’s lead line', () => {
  it('names the app, or says plainly that it is one', () => {
    expect(guideLead('ios', 'browser', 'Instagram')).toContain("Instagram's built-in browser");
    expect(guideLead('android', 'browser', 'app')).toContain("an app's built-in browser");
  });

  it('tells each platform where it is going', () => {
    expect(guideLead('ios', 'browser', null)).toContain('Safari');
    expect(guideLead('ios', 'install', null)).toContain('Home Screen');
    expect(guideLead('android', 'browser', null)).toContain('Chrome');
  });
});
