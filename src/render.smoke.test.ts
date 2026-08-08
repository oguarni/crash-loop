// @vitest-environment jsdom
// Geometry guards for the canvas layer. The renderer is excluded from the coverage
// gates (it draws, it does not decide), but its *layout* is arithmetic and can be
// checked: overlay text that runs past a panel edge and hit-boxes that swallow
// their neighbour are silent bugs on a 960x600 surface scaled down to a phone.
//
// RecordingCtx is a named fake 2D context: it collects every draw with its
// bounding box and measures monospace text the way IBM Plex Mono does (0.6em
// advance per character), so the numbers here match what a browser produces.
import { describe, it, expect } from 'vitest';
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
  layoutHelpButton,
  layoutLevelSelect,
  layoutMenuButton,
  layoutMuteButton,
  layoutRail,
  layoutTutorialButton,
  layoutTutorialStartButton,
} from './render';
import { RAIL_W, VIEW_H, VIEW_W, WORK_BOTTOM, inflate, type Rect } from './layout';
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
  it('keeps the rail rows clear of the mute row, for every level', () => {
    for (const level of LEVELS) {
      const mute = layoutMuteButton();
      for (const item of layoutRail(new Game(level))) {
        expect(item.rect.y + item.rect.h).toBeLessThan(mute.y);
        expect(item.rect.x + item.rect.w).toBeLessThanOrEqual(RAIL_W);
      }
    }
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
    mute: { x: 3, y: 4 },
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
    const chrome = [
      inflate(layoutMenuButton(), SLACK.header.x, SLACK.header.y),
      inflate(layoutHelpButton(), SLACK.header.x, SLACK.header.y),
      inflate(layoutMuteButton(), SLACK.mute.x, SLACK.mute.y),
    ];
    expect(overlaps(chrome[0], chrome[1])).toBe(false);
    expect(overlaps(chrome[1], chrome[2])).toBe(false);
    for (const r of rail) {
      for (const c of chrome) expect(overlaps(r, c)).toBe(false);
    }
    // the mute row must not reach into the HUD, where the Run button lives
    expect(chrome[2].y + chrome[2].h).toBeLessThanOrEqual(WORK_BOTTOM);

    const buttons = layoutButtons(g).map((b) => inflate(b.rect, SLACK.button.x, SLACK.button.y));
    for (let i = 0; i < buttons.length; i++) {
      for (let j = i + 1; j < buttons.length; j++) {
        expect(overlaps(buttons[i], buttons[j])).toBe(false);
      }
      expect(buttons[i].x + buttons[i].w).toBeLessThanOrEqual(VIEW_W);
      expect(buttons[i].y).toBeGreaterThan(WORK_BOTTOM - 6); // stays out of the board
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
