import type {AccentName, ActName} from './theme';

/**
 * A beat is one headline state inside a scene. A scene usually holds two or
 * three: the panel stays put while the claim underneath it escalates.
 * `at` is seconds from the start of the scene.
 */
export type Beat = {
  at: number;
  line1: string;
  line2?: string;
  accent?: AccentName;
  /**
   * Index of the narration sentence this headline belongs to. When set,
   * scripts/voiceover.mjs overwrites `at` with that sentence's measured start,
   * so the headline turns exactly as the voice reaches it.
   */
  atSentence?: number;
};

/** Monthly OHLC bar. */
export type Candle = {t: string; o: number; h: number; l: number; c: number; v: number};

/**
 * `beat` is the first beat a mark shows on; `until` (optional) the last — after it the mark
 * fades out, so a later beat can reuse the space (vox-director: one idea per framing).
 */
export type ImageAnnotation =
  | {kind: 'box'; x: number; y: number; w: number; h: number; label?: string; accent?: AccentName; beat?: number; until?: number}
  | {kind: 'circle'; x: number; y: number; r: number; label?: string; accent?: AccentName; beat?: number; until?: number}
  | {kind: 'arrow'; from: [number, number]; to: [number, number]; label?: string; accent?: AccentName; beat?: number; until?: number; weight?: number; style?: 'line' | 'block'}
  /** Straight segment between two photo points — a trendline or channel boundary. Extends nothing:
   *  give it the endpoints you want drawn. `dashed` for a projection; label sits at the `to` end. */
  | {kind: 'line'; from: [number, number]; to: [number, number]; label?: string; labelAt?: 'from' | 'to'; dashed?: boolean; accent?: AccentName; beat?: number; until?: number}
  /** Free text at a photo point; `anchor: 'end'` right-aligns it there so a label near the right
   *  edge grows leftwards instead of running off the photo. */
  | {kind: 'label'; x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; accent?: AccentName; beat?: number; until?: number}
  /** Horizontal level (support / resistance) across the photo at fraction y; label at the right end. */
  | {kind: 'hline'; y: number; label?: string; labelSide?: 'left' | 'right'; accent?: AccentName; beat?: number; until?: number}
  /** Vertical marker (a date) across the photo at fraction x; label at the top. */
  | {kind: 'vline'; x: number; label?: string; accent?: AccentName; beat?: number; until?: number};

/**
 * One framing of a photo — vox-director's "shot". A scene cuts from a wide shot that orients to
 * a close cut-in on the detail the narration names, so a 10s photo never holds still.
 * `x`/`y` is the centre of the framing in fractions of the PHOTO (like annotations), `zoom` the
 * magnification over the fitted photo (1 = the whole photo). `move` is the drift while the shot
 * holds: `pan` runs left → right (forward in time), `tilt` top → bottom (price pane down to the
 * indicator pane), `static` for the payoff. The camera eases from the previous framing unless `cut`.
 */
export type ImageShot = {
  beat?: number;
  x: number;
  y: number;
  zoom: number;
  move?: 'push_in' | 'pull_out' | 'pan' | 'tilt' | 'static';
  cut?: boolean;
};

export type Visual =
  /** Candlesticks inside a log price channel, with touch markers. */
  | {
      type: 'candles';
      caption?: string;
      /** Years to mark with a dot where price meets the upper rail. */
      touches?: string[];
      /**
       * Per-beat vertical highlight: which year to band, and its colour.
       * `drop` adds an arrow from that year's high to its low, labelled with
       * the drawdown computed from the series.
       */
      bands?: {year: string; label: string; accent: AccentName; drop?: boolean}[];
    }
  /** MACD histogram + signal, drawn from the same series as the candles. */
  | {type: 'macd'; caption?: string; note?: string; peakLabel?: string}
  /** Price over a bounded 0-100 oscillator, with the 70/30 thresholds. */
  | {
      type: 'rsi';
      caption?: string;
      note?: string;
      /** Shade the region above 70 or below 30. */
      highlightZone?: 'overbought' | 'oversold';
      /** Dots on specific months, e.g. the readings at each swing high. */
      marks?: {month: string; label: string; accent: AccentName}[];
      /** Price higher high against an oscillator lower high, revealed on beat 2. */
      divergence?: {from: string; to: string; label: string}
    }
  /** Grid of person glyphs — n filled out of total. */
  | {type: 'pictogram'; rows: number; columns: number; filledPercent: number; accent: AccentName; glyph?: 'person' | 'dot'}
  /** Two labelled bars that race to their percentage. */
  | {type: 'bars'; bars: {label: string; percent: number; accent: AccentName}[]}
  /** Icon + text rows that reveal in sequence. */
  | {
      type: 'list';
      items: {icon: string; text: string}[];
      accent: AccentName;
      chipShape?: 'square' | 'circle';
    }
  /** Side-by-side warning cards. */
  | {type: 'cards'; cards: {title: string; body: string}[]; accent: AccentName}
  /** Descending staircase with "hope / hesitate" annotations. */
  | {
      type: 'zigzag';
      topLabel: string;
      endLabel: string;
      upLabel: string;
      downLabel: string;
      steps: number;
    }
  /** Small win vs. large loss, drawn to scale. */
  | {type: 'riskReward'; left: {label: string; value: number}; right: {label: string; value: number}}
  /**
   * A photograph of a live page (scripts/shoot.mjs), path under public/.
   * `source` is shown as a chip so the viewer knows the picture is quoted.
   */
  | {
      type: 'image';
      src: string;
      caption?: string;
      source?: string;
      fit?: 'cover' | 'contain';
      /** CSS object-position, e.g. "center", "top", "60% 40%". */
      focus?: string;
      /** Slow push-in over the scene; off by default when annotations are set, so marks stay put. */
      zoom?: boolean;
      /** Corner for the source chip. Default: top-right, or bottom-right when annotations are set. */
      sourceCorner?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
      /**
       * Marks drawn over the photo by Remotion, in FRACTIONS (0..1) of the image area.
       * `beat` is the first beat index on which a mark shows (default 0); it animates in as
       * that beat starts. This is how a photographed chart gets "drawn on" reproducibly.
       */
      annotations?: ImageAnnotation[];
      /**
       * Per-beat camera over the photo, one entry per framing, `beat` ascending. When set it
       * replaces the scene-long push-in and `focus` only positions the fitted photo.
       */
      shots?: ImageShot[];
      /**
       * The part of the photo the panel shows, in fractions of the whole photo — cuts the source
       * page's own toolbars away. Marks and shots keep whole-photo coordinates, so a crop never
       * means re-measuring them. Match the panel's 1.42 ratio (LAYOUT.imagePanel) to avoid bars.
       */
      crop?: {x: number; y: number; w: number; h: number};
      /**
       * Rects (whole-photo fractions) painted over the source page's own text — a legend or price
       * header sitting on the candles — in `color` (default: the page's background, maskColor).
       */
      masks?: {x: number; y: number; w: number; h: number; color?: string}[];
      maskColor?: string;
    }
  /** Sign-off card: avatar, pill, one line of copy. */
  | {type: 'outro'; logo?: string; brand: string; kicker: string; pill: string; line: string};

export type Scene = {
  id: string;
  /**
   * The scene's job in the story — a key of `arc.roles` in src/shared/content-rules.json
   * (hook, chapter, scenario…). enrich writes it, verify and the review page read it; the
   * renderer ignores it. Relabel a voiced scene here, never in `id`: the id names its audio file.
   */
  role?: string;
  /** Uppercase label above the panel. */
  eyebrow: string;
  /** Mood of the background for this scene. */
  act: ActName;
  /** Seconds. Overwritten by scripts/voiceover.mjs when narration audio exists. */
  duration: number;
  beats: Beat[];
  visual: Visual;
  /**
   * Per-scene headline geometry. The outro carries a disclaimer under it, so
   * its headline sits higher and smaller than the rest of the reel.
   */
  headline?: {
    line1Baseline?: number;
    line2Baseline?: number;
    maxFontSize?: number;
    footnoteY?: number;
  };
  /** Spoken line. Drives TTS and, through it, `duration`. */
  narration?: string;
  /** Path under public/, e.g. "voiceover/01-channel.wav". */
  audio?: string;
  /** Measured start of each narration sentence inside `audio`. Written by the voiceover script. */
  sentenceStarts?: number[];
};

export type Reel = {
  title: string;
  /** Small print under the final headline. */
  disclaimer?: string;
  /**
   * Market-context strip above the eyebrow (symbol · timeframe · last close ·
   * change · as-of). Derived from the price series unless overridden here;
   * `false` hides it. `last`/`prev` replace the series' closes — the monthly
   * series is a reconstruction, so a reel about the current market sets them
   * from facts.daily (`ticker: daily` in the brief). `asOf` may be a day.
   */
  ticker?: false | {symbol?: string; timeframe?: string; asOf?: string; last?: number; prev?: number};
  /**
   * Source / disclaimer line under the headline block. Defaults to the
   * series' as-of month plus "not investment advice"; `false` hides it. Name
   * the source here only when the series really came from it.
   */
  footer?: false | string;
  /** Optional bed music under the whole reel, path under public/. */
  music?: string;
  musicVolume?: number;
  scenes: Scene[];
};
