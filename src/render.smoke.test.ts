// @vitest-environment jsdom
// Geometry guards for the canvas layer. The renderer is excluded from the coverage
// gates (it draws, it does not decide), but its *layout* is arithmetic and can be
// checked: overlay text that runs past a panel edge and hit-boxes that swallow
// their neighbour are silent bugs on a 960x600 surface scaled down to a phone.
//
// RecordingCtx is a named fake 2D context: it collects every draw with its
// bounding box and measures monospace text the way IBM Plex Mono does (0.6em
// advance per character), so the numbers here match what a browser produces.
import { describe, it, expect, beforeAll } from 'vitest';
import { Game } from './game';
import { LEVELS } from './levels';
import { L01 } from './levels/L01';
import { L07 } from './levels/L07';
import {
  draw,
  drawHelpOverlay,
  drawMenu,
  drawTitle,
  drawTutorial,
  layoutButtons,
  layoutFooterRows,
  layoutHelpButton,
  layoutLevelSelect,
  layoutMenuButton,
  layoutMenuFullscreenButton,
  layoutRail,
  layoutTutorialButton,
  layoutTutorialStartButton,
} from './render';
import { RAIL_W, VIEW_H, VIEW_W, WORK_BOTTOM, inflate, type Rect } from './layout';
import { fullscreenRoute } from './fullscreen';
import type { GameImages } from './images';

const MONO_ADVANCE = 0.6; // em per character, IBM Plex Mono

interface DrawnText {
  text: string;
  x: number;
  y: number;
  width: number;
  align: string;
}

/** Fake 2D context that records what was drawn instead of rasterising it. */
class RecordingCtx {
  texts: DrawnText[] = [];
  strokedRects: Rect[] = [];
  font = '500 13px mono';
  textAlign = 'left';
  textBaseline = 'alphabetic';
  fillStyle: unknown = '';
  strokeStyle: unknown = '';
  lineWidth = 1;
  lineDashOffset = 0;
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  filter = 'none';
  shadowColor = '';
  shadowBlur = 0;
  shadowOffsetY = 0;
  // width 0 makes the bloom post-pass bail out: it needs a real backing store.
  canvas = { width: 0, height: 0 };

  private pending: Rect | null = null;

  private fontSize(): number {
    return Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 13);
  }

  measureText(text: string): { width: number } {
    return { width: text.length * this.fontSize() * MONO_ADVANCE };
  }

  fillText(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y, width: this.measureText(text).width, align: this.textAlign });
  }

  roundRect(x: number, y: number, w: number, h: number): void {
    this.pending = { x, y, w, h };
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.pending = { x, y, w, h };
  }
  stroke(): void {
    if (this.pending) this.strokedRects.push(this.pending);
  }

  // Everything else is ignored on purpose: this fake asserts geometry, not pixels.
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  fill(): void {}
  fillRect(): void {}
  clearRect(): void {}
  clip(): void {}
  setLineDash(): void {}
  translate(): void {}
  scale(): void {}
  setTransform(): void {}
  drawImage(): void {}
  createRadialGradient(): { addColorStop: () => void } {
    return { addColorStop: () => {} };
  }
}

const ctx = (): CanvasRenderingContext2D => new RecordingCtx() as unknown as CanvasRenderingContext2D;
const recorder = (c: CanvasRenderingContext2D): RecordingCtx => c as unknown as RecordingCtx;

/** No image ever reports ready(), so the art paths are skipped deterministically. */
const NO_IMAGES = {
  logo: { complete: false, naturalWidth: 0, naturalHeight: 0 },
  avatar: { complete: false, naturalWidth: 0, naturalHeight: 0 },
  icon: { complete: false, naturalWidth: 0, naturalHeight: 0 },
} as unknown as GameImages;

/** Left/right extent of a recorded text run, honouring its alignment. */
function span(t: DrawnText): { left: number; right: number } {
  if (t.align === 'center') return { left: t.x - t.width / 2, right: t.x + t.width / 2 };
  if (t.align === 'right') return { left: t.x - t.width, right: t.x };
  return { left: t.x, right: t.x + t.width };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * jsdom implements no Fullscreen API, so the rail and the menu would draw their
 * *narrower* layouts here — the ones with nothing to collide with. Plant the two
 * members the detection looks for, and assert the route agrees, so this suite
 * always guards the tight split-footer geometry (and the row that still carries
 * a key hint) rather than passing vacuously.
 */
beforeAll(() => {
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    value: () => Promise.resolve(),
    configurable: true,
  });
  expect(fullscreenRoute()).toBe('api');
});

/** Every text run drawn inside a chrome row, in the order it was drawn. */
function textsIn(c: CanvasRenderingContext2D, r: Rect): DrawnText[] {
  return recorder(c).texts.filter((t) => t.y > r.y && t.y <= r.y + r.h + 4 && span(t).left >= r.x - 1 && span(t).left < r.x + r.w);
}

describe('every screen draws without throwing', () => {
  it('draws the board for every level, in edit / running / result', () => {
    for (const level of LEVELS) {
      const g = new Game(level);
      expect(() => draw(ctx(), g, { x: 400, y: 300 }, 1000, NO_IMAGES, 1000)).not.toThrow();
      g.run(); // an empty board fails validation, which is a result screen
      expect(() => draw(ctx(), g, { x: 400, y: 300 }, 1000, NO_IMAGES, 1000)).not.toThrow();
      expect(() => drawHelpOverlay(ctx(), g)).not.toThrow();
    }
  });

  it('draws the boot screen, the menu, and the tutorial', () => {
    const records = LEVELS.map(() => null);
    expect(() => drawTitle(ctx(), NO_IMAGES, 5000, 3, LEVELS.length)).not.toThrow();
    expect(() => drawMenu(ctx(), NO_IMAGES, LEVELS, records, { x: 480, y: 300 }, 3)).not.toThrow();
    expect(() => drawTutorial(ctx())).not.toThrow();
  });

  it('draws a node in hand, with its origin ghost and carry prompt', () => {
    const g = new Game(L01);
    const s = g.placeNode('service', 500, 150)!;
    g.beginCarry(s.id, 500, 150);
    g.moveCarried(760, 420); // far enough that the origin outline is drawn too
    const c = ctx();
    expect(() => draw(c, g, { x: 760, y: 420 }, 1000, NO_IMAGES, 1000)).not.toThrow();
    expect(recorder(c).texts.some((t) => t.text.includes('carrying'))).toBe(true);
  });
});

describe('overlay text stays inside its panel', () => {
  // L07 has the most components in play, so its help legend is the tallest.
  it('the help overlay never runs into its own footer button', () => {
    const g = new Game(L07);
    const c = ctx();
    drawHelpOverlay(c, g);
    const tut = layoutTutorialButton();
    const body = recorder(c).texts.filter((t) => !t.text.startsWith('press anywhere') && !t.text.includes('how to play'));
    const lowest = Math.max(...body.map((t) => t.y));
    expect(lowest).toBeLessThan(tut.y - 8);
    for (const t of body) {
      const { left, right } = span(t);
      expect(left).toBeGreaterThanOrEqual(128);
      expect(right).toBeLessThanOrEqual(128 + 704);
    }
  });

  it('the tutorial never runs into its Start button', () => {
    const c = ctx();
    drawTutorial(c);
    const btn = layoutTutorialStartButton();
    const steps = recorder(c).texts.filter((t) => !t.text.startsWith('press anywhere') && t.text !== 'Start >');
    expect(Math.max(...steps.map((t) => t.y))).toBeLessThan(btn.y - 8);
    // and its footer line stays inside the panel
    expect(btn.y + btn.h).toBeLessThan(VIEW_H);
  });
});

describe('hit regions are reachable and disjoint', () => {
  it('keeps the rail rows clear of the footer toggles, for every level', () => {
    for (const level of LEVELS) {
      const footer = layoutFooterRows(true);
      for (const item of layoutRail(new Game(level))) {
        expect(item.rect.y + item.rect.h).toBeLessThan(footer.mute.y);
        expect(item.rect.x + item.rect.w).toBeLessThanOrEqual(RAIL_W);
      }
    }
  });

  it('splits the footer into two rows only where fullscreen exists', () => {
    const alone = layoutFooterRows(false);
    expect(alone.fullscreen).toBe(null);
    expect(alone.mute.x + alone.mute.w).toBe(RAIL_W - 12);

    const split = layoutFooterRows(true);
    expect(split.fullscreen).not.toBe(null);
    expect(overlaps(split.mute, split.fullscreen!)).toBe(false);
    expect(split.mute.y).toBe(alone.mute.y); // the sound row never moves
    expect(split.fullscreen!.x + split.fullscreen!.w).toBe(RAIL_W - 12);
  });

  it('keeps the menu and help rows side by side inside the rail', () => {
    const menu = layoutMenuButton();
    const help = layoutHelpButton();
    expect(overlaps(menu, help)).toBe(false);
    expect(help.x + help.w).toBeLessThanOrEqual(RAIL_W - 12);
    expect(menu.w).toBeGreaterThan(60); // still wide enough for "menu" + its key
  });

  // Mirrors TOUCH_SLACK in main.ts: the pads a finger's tap is tested against.
  // They are duplicated here on purpose — this suite is the proof that they are
  // safe, so it has to state them independently of the code under test.
  const SLACK = {
    rail: { x: 3, y: 3 },
    header: { x: 3, y: 9 },
    footer: { x: 3, y: 4 },
    button: { x: 5, y: 5 },
  };

  it('survives touch slack without one hit-box swallowing its neighbour', () => {
    // L07 has the fullest rail, so its rows sit closest together.
    const g = new Game(L07);
    const rail = layoutRail(g).map((i) => inflate(i.rect, SLACK.rail.x, SLACK.rail.y));
    for (let i = 0; i < rail.length; i++) {
      for (let j = i + 1; j < rail.length; j++) {
        expect(overlaps(rail[i], rail[j])).toBe(false);
      }
    }
    const footer = layoutFooterRows(true);
    const chrome = [
      inflate(layoutMenuButton(), SLACK.header.x, SLACK.header.y),
      inflate(layoutHelpButton(), SLACK.header.x, SLACK.header.y),
      inflate(footer.mute, SLACK.footer.x, SLACK.footer.y),
      inflate(footer.fullscreen!, SLACK.footer.x, SLACK.footer.y),
    ];
    for (let i = 0; i < chrome.length; i++) {
      for (let j = i + 1; j < chrome.length; j++) {
        expect(overlaps(chrome[i], chrome[j])).toBe(false);
      }
      expect(chrome[i].x + chrome[i].w).toBeLessThanOrEqual(RAIL_W);
    }
    for (const r of rail) {
      for (const c of chrome) expect(overlaps(r, c)).toBe(false);
    }
    // neither footer row may reach into the HUD, where the Run button lives
    expect(chrome[2].y + chrome[2].h).toBeLessThanOrEqual(WORK_BOTTOM);
    expect(chrome[3].y + chrome[3].h).toBeLessThanOrEqual(WORK_BOTTOM);

    const buttons = layoutButtons(g).map((b) => inflate(b.rect, SLACK.button.x, SLACK.button.y));
    for (let i = 0; i < buttons.length; i++) {
      for (let j = i + 1; j < buttons.length; j++) {
        expect(overlaps(buttons[i], buttons[j])).toBe(false);
      }
      expect(buttons[i].x + buttons[i].w).toBeLessThanOrEqual(VIEW_W);
      expect(buttons[i].y).toBeGreaterThan(WORK_BOTTOM - 6); // stays out of the board
    }
  });

  it('keeps the menu fullscreen row clear of the level cards', () => {
    const row = inflate(layoutMenuFullscreenButton(), SLACK.button.x, SLACK.button.y);
    expect(row.x).toBeGreaterThanOrEqual(0);
    expect(row.y).toBeGreaterThanOrEqual(0);
    for (const card of layoutLevelSelect(LEVELS.length)) {
      expect(overlaps(row, inflate(card.rect, SLACK.button.x, SLACK.button.y))).toBe(false);
    }
  });

  it('keeps the level cards apart under touch slack', () => {
    const cards = layoutLevelSelect(LEVELS.length).map((c) => inflate(c.rect, SLACK.button.x, SLACK.button.y));
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        expect(overlaps(cards[i], cards[j])).toBe(false);
      }
      expect(cards[i].x).toBeGreaterThanOrEqual(0);
      expect(cards[i].x + cards[i].w).toBeLessThanOrEqual(VIEW_W);
    }
  });
});

// The chrome rows are the tightest type on the board: a glyph, a label and a key
// hint sharing a box under 100px wide, which the split footer made tighter still.
// Nothing about that is visible until it is wrong on a phone, so it is measured.
describe('chrome rows hold their own text', () => {
  function assertRowFits(c: CanvasRenderingContext2D, r: Rect, name: string): void {
    const texts = textsIn(c, r);
    expect(texts.length, `${name} draws glyph + label + key`).toBe(3);
    for (const t of texts) {
      const { left, right } = span(t);
      expect(left, `${name}: "${t.text}" starts inside the row`).toBeGreaterThanOrEqual(r.x);
      expect(right, `${name}: "${t.text}" ends inside the row`).toBeLessThanOrEqual(r.x + r.w);
    }
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = span(texts[i]);
        const b = span(texts[j]);
        expect(a.right <= b.left || b.right <= a.left, `${name}: "${texts[i].text}" clears "${texts[j].text}"`).toBe(true);
      }
    }
  }

  it('fits the rail header and both footer toggles, muted or not', () => {
    // L07 has the fullest rail; the sound row is drawn from live audio state, so
    // both spellings of its label have to fit the narrower split row.
    const g = new Game(L07);
    const footer = layoutFooterRows(true);
    const c = ctx();
    draw(c, g, { x: 400, y: 300 }, 1000, NO_IMAGES, 1000);
    assertRowFits(c, layoutMenuButton(), 'menu');
    assertRowFits(c, layoutHelpButton(), 'help');
    assertRowFits(c, footer.mute, 'sound');
    assertRowFits(c, footer.fullscreen!, 'fullscreen');
  });

  it('fits the menu screen fullscreen row', () => {
    const c = ctx();
    drawMenu(c, NO_IMAGES, LEVELS, LEVELS.map(() => null), { x: 480, y: 300 }, 3);
    assertRowFits(c, layoutMenuFullscreenButton(), 'menu fullscreen');
  });
});
