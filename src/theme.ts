/**
 * Design tokens, measured off the reference reel at 720x1280 and scaled to 1080x1920.
 * Every scene reads its geometry from here, so the whole series stays on-grid.
 */

export const CANVAS = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

/** Left/right gutter. Card and every text block align to this. */
export const GUTTER = 100;
export const CONTENT_WIDTH = CANVAS.width - GUTTER * 2; // 880

/**
 * Vertical safe zone. Short-video players draw their own UI over roughly the
 * top 15% and bottom 15% of the frame, so nothing that must be read sits
 * outside 288..1632. The ticker and footer sit just inside those edges; the
 * panel and headline are well within.
 */
export const SAFE = {top: 288, bottom: 1632} as const;

export const LAYOUT = {
  /** Market-context strip: symbol · timeframe · last · change · as-of. */
  header: {x: GUTTER, baseline: 326, fontSize: 24, letterSpacing: 2.2},
  /** Small accent rule above the eyebrow. */
  rule: {x: GUTTER, y: 379, width: 54, height: 4},
  /** Eyebrow label: uppercase, wide tracking. */
  eyebrow: {x: GUTTER, baseline: 446, fontSize: 34, letterSpacing: 5.6},
  /** The panel that holds each scene's visual. */
  panel: {x: GUTTER, y: 640, width: CONTENT_WIDTH, height: 560, radius: 18},
  /**
   * Photo panels (charts). A chart is the scene, so it gets most of the frame: 1000 wide (it
   * bleeds 60px past the text gutter on each side) and an image area of 1000×704 — a 1.42 ratio
   * that the `crop` of every photo matches, so no letterbox bars — plus the 48px caption bar.
   * Top sits under the eyebrow, bottom clears the headline's cap height by ~110px.
   */
  imagePanel: {x: 40, y: 500, width: 1000, height: 752, radius: 18},
  /** Two-line headline under the panel. */
  headline: {
    x: GUTTER,
    line1Baseline: 1419,
    line2Baseline: 1545,
    fontSize: 78,
    maxWidth: CONTENT_WIDTH,
  },
  /** Source + disclaimer line under the headline block (every scene but the outro). */
  footer: {x: GUTTER, baseline: 1628, fontSize: 20, letterSpacing: 1.8},
  /** Fine print under the headline (outro only). */
  footnote: {x: GUTTER, y: 1570, fontSize: 28, lineHeight: 1.55},
} as const;

export const COLORS = {
  white: '#FFFFFF',
  /** Headline accents. These are text colours: bright, high contrast. */
  gold: '#F3C019',
  red: '#E5333A',
  green: '#2ECC71',
  /**
   * Market direction, for MARKS: candles, histogram bars, the ticker arrow.
   * Green up / red down is the Vietnamese board convention and stays. This
   * exact pair was picked by the palette validator on the chart surface
   * (`plot`): in the dark lightness band, >= 3:1 contrast, and deutan/protan
   * ΔE 10.2 — a plain green/red pair sits at 6.7. Direction is also carried
   * by shape (candle body, bar side of zero), never by colour alone.
   */
  up: '#1FA377',
  down: '#EC5F38',
  /** Indicator signal line and channel rails: one cool hue, never confused with direction. */
  signal: '#6C7CE8',
  /**
   * Mark accent for an up-pointing signal — the follow-through day's arrow, paired with `red` for the
   * distribution days' down arrows (user, 2026-09-29: "up color blue for FTD and down color red for
   * DD"). Picked with the dataviz validator against `red` on FireAnt's chart surface #161921: dark
   * lightness band, >= 3:1 contrast, protan ΔE 29.5.
   */
  blue: '#3D8BFF',
  /** The plot area inside chart panels. */
  plot: '#04060A',
  /** Eyebrow / secondary copy. */
  muted: '#93A1AF',
  /** Body copy on the dark surface. */
  inkSecondary: 'rgba(255, 255, 255, 0.72)',
  /** Captions, footers, source lines. */
  inkMuted: 'rgba(255, 255, 255, 0.5)',
  /** Chart gridlines, axis labels. */
  faint: 'rgba(255, 255, 255, 0.28)',
  hairline: 'rgba(255, 255, 255, 0.09)',
  panelFill: 'rgba(255, 255, 255, 0.028)',
  panelStroke: 'rgba(255, 255, 255, 0.075)',
} as const;

export type AccentName = 'gold' | 'red' | 'green' | 'white' | 'blue';

export const accentColor = (a: AccentName): string => COLORS[a];

/**
 * The reel moves through four moods. The background base hue shifts with the
 * argument being made: cool while it is still analysis, maroon once it turns
 * into a warning, warm for the call to action, navy for the sign-off.
 */
export type ActName = 'blue' | 'maroon' | 'amber' | 'navy';

export const ACTS: Record<ActName, {base: string; glow: string; grid: string}> = {
  blue: {base: '#060F19', glow: '#0C1D2E', grid: 'rgba(90, 150, 200, 0.05)'},
  maroon: {base: '#0D0304', glow: '#140609', grid: 'rgba(200, 90, 90, 0.045)'},
  amber: {base: '#0D0403', glow: '#170D04', grid: 'rgba(200, 165, 90, 0.045)'},
  navy: {base: '#0B1F3B', glow: '#0E2542', grid: 'rgba(120, 170, 230, 0.055)'},
};
