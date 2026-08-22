// @vitest-environment jsdom
// The page furniture that only a phone ever sees. jsdom has no Fullscreen API —
// which is exactly the browser these tests care about, iPhone Safari — so what
// varies here is the pointer: a coarse one has a home screen to install to and
// must keep its fullscreen affordance, a fine one has neither and must not be
// offered a dead control.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installFullscreenHelp, installRotateNudge, showFullscreenHelp } from './mobile';

/** The two nudge answers and the install sheet, as index.html declares them. */
function fixture(): void {
  document.body.className = '';
  document.body.innerHTML = `
    <div id="rotate">
      <button id="rotate-fullscreen">go fullscreen &amp; rotate</button>
      <button id="rotate-dismiss">play in portrait anyway</button>
    </div>
    <div id="install" hidden></div>`;
}

function pointer(kind: 'coarse' | 'fine'): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: kind === 'coarse' && query === '(pointer: coarse)',
  }));
}

const click = (el: Element): void => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
/** A fresh press, as the install sheet listens for it. */
const press = (el: Element): void => {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
};
const el = (id: string): HTMLElement => document.getElementById(id)!;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('the portrait nudge', () => {
  it('keeps its fullscreen answer on a phone with no API, pointing at the install sheet', () => {
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

describe('the install sheet', () => {
  it('opens on demand and closes on any tap', () => {
    fixture();
    installFullscreenHelp();
    expect(el('install').hidden).toBe(true);

    showFullscreenHelp();
    expect(el('install').hidden).toBe(false);

    // The compatibility click of the very tap that opened it must not close it
    // again: that click is hit-tested late, by which time the sheet is under the
    // finger. Only a new press counts.
    click(el('install'));
    expect(el('install').hidden).toBe(false);

    press(el('install'));
    expect(el('install').hidden).toBe(true);
  });

  it('does nothing at all where the sheet is absent', () => {
    document.body.innerHTML = '';
    expect(() => installFullscreenHelp()).not.toThrow();
    expect(() => showFullscreenHelp()).not.toThrow();
  });
});
