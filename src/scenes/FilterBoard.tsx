import React from 'react';
import {interpolateColors, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {measureText} from '@remotion/layout-utils';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT} from '../theme';
import {easeInOut, easeOut, ramp} from '../lib/anim';
import type {BoardColumn, BoardEmphasis, BoardRow, SectorRow, Visual} from '../types';

/** The board is the scene, like a chart: it takes the photo panels' box (1000×752), not the 880×560 card. */
const BOX = LAYOUT.imagePanel;
const W = BOX.width;
const H = BOX.height;
const PAD = 30;
const HEAD_BASE = 58;
const RULE_Y = 74;
const FOOT_H = 58;
const FOOT_Y = H - FOOT_H;
const ROWS_TOP = RULE_Y + 4;
const ROWS_BOTTOM = FOOT_Y - 8;
const ROW_MIN = 52;
const ROW_MAX = 80;
const MAX_ROWS = 10;
/** A scrolling board (`scroll`, the weekly's watchlist, 2026-10-18) keeps ten rows in view and holds at most this many
 * (scripts/review/lib/board.mjs BOARD_SCROLL_ROWS — 40 since RS Strong found 33 names on 16/10). */
const MAX_SCROLL_ROWS = 40;
/** How long a scroll step takes, frames. */
const SCROLL_FRAMES = 24;
/** The terminal's RS ratings run up to 99: a full bar is 99. */
const RS_MAX = 99;
const BAR_H = 12;

/** x of each column in the 1000-wide box; numbers are right-aligned on their column's edge. */
const X_BASE = {
  rank: PAD,
  ticker: PAD + 36,
  price: 316,
  change: 474,
  rsNum: 552,
  rsBar0: 566,
  rsBar1: 708,
  extra: [834, W - PAD],
} as const;
/**
 * The watchlist board (`filters` column, 2026-10-18): no price, the week's pill and a shorter RS bar on the left, and the
 * filter chips from `extra[0]` to the right edge (four chips need ~450px).
 */
const X_TAGS = {
  rank: PAD,
  ticker: PAD + 36,
  price: 316,
  change: 316,
  rsNum: 392,
  rsBar0: 406,
  rsBar1: 486,
  extra: [508, W - PAD],
} as const;
/**
 * The picks' board ("Mã đáng chú ý tuần sau", columns watchUp / watchDown, 2026-10-18): price, the filter chips (three need
 * ~350px), then the two prices to watch, right-aligned — no RS 1M.
 */
const X_WATCH = {
  rank: PAD,
  ticker: PAD + 36,
  price: 300,
  change: 300,
  rsNum: 300,
  rsBar0: 300,
  rsBar1: 300,
  extra: [326, 824, W - PAD],
} as const;
/** The watchlist's chips: the terminal's filter name → the chip's label and colour, in the order they are drawn. */
const TAGS: {name: string; label: string; color: string}[] = [
  {name: 'RS Strong', label: 'RS STRONG', color: COLORS.signal},
  {name: 'Uptrend', label: 'UPTREND', color: COLORS.white},
  {name: 'Momentum breakout', label: 'BREAKOUT', color: COLORS.up},
  {name: 'Momentum breakdown', label: 'BREAKDOWN', color: COLORS.down},
];
const TAG_GAP = 8;
/**
 * A sector board (mode 'sector', the weekly's ICB groups, 2026-10-06): the group's name takes the ticker, price and
 * change slots; then how many stocks it counts, its median RS 1M with the bar, the week's median change on the pill
 * and the share of its stocks above SMA200.
 */
const XS = {
  name: PAD + 36,
  nameMax: 420,
  members: 492,
  rsNum: 572,
  rsBar0: 586,
  rsBar1: 706,
  week: 860,
  share: W - PAD,
} as const;
/**
 * A sector board that lists each group's strongest tickers (column `topSymbols`, 2026-10-09 — user: "With the scene 05
 * also listing 2-3 stock with this major ranking?"): the tickers take the old count's column and part of the RS bar, the
 * count goes small and grey under the group's name, the name's cell narrows. Without the column the board is drawn on XS.
 */
const XT = {
  name: PAD + 36,
  tickers: 396,
  tickersMax: 556,
  rsNum: 618,
  rsBar0: 630,
  rsBar1: 704,
  week: 860,
  share: W - PAD,
} as const;
/** The tickers (JetBrains Mono, never wrapped: a wider set shrinks to the column) and the count line under the name. */
const TICK = {size: 21, gap: 21, count: 15, nameMax: 0.42} as const;
const SIZE = {rank: 18, ticker: 38, num: 27, pill: 25, rs: 34, extra: 26, head: 17, headTop: 14, foot: 16, plate: 19};
/** JetBrains Mono advances exactly 0.6 em per glyph — plates and pills are sized from it. */
const MONO = 0.6;
/** Baseline that centres a line of digits/caps of `size` on `mid`. */
const base = (mid: number, size: number) => mid + size * 0.36;
/** A group name's size range (Be Vietnam Pro 700): a long name shrinks to fit its cell, never cut. */
const NAME_MAX = 30;
const NAME_MIN = 18;
/** The signal pill (XÁC NHẬN / TIỀM NĂNG): JetBrains Mono 700 at this size, letter-spaced, 10 px a side. */
const SIG = 16;
const SIG_TRACK = 0.8;

/** The focus look: how far a lit ticker grows, the magnifier's lens radius, the dimmed rows' opacity. */
const POP = 0.12;
const LENS = 10;
/** The magnifier's width at scale 1: halo's left edge (lens + 5) to the handle's round tip. */
const LENS_SPAN = LENS + 5 + LENS * 1.55 + 2.2;
const DIMMED = 0.32;
/** Frames a spotlight (`set: 'spot'`) takes to fade out from its `until` beat. */
const UNLIT = 10;

/**
 * The notes under a weekly Momentum board's rows (`notes`, 2026-10-09): the state plate (always, its room kept even at
 * ten rows) and the definition card (while the rows are ≤ 6 — its minimum room is kept by shortening the rows). The
 * card fills the rest of the panel down to the footer: one condition a line while they fit, else two wrapped lines.
 */
const NOTE = {stateH: 52, gap: 14, defMin: 128, defRows: 6, pad: 20, titleH: 30, state: 26, item: 34, wrap: 21} as const;

const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
const dec = (v: number, dp: number) => Math.abs(v).toFixed(dp).replace('.', ',');
const fmtPrice = (v: number) => v.toFixed(2).replace('.', ',');
const fmtChange = (v: number) => `${sign(v)}${dec(v, 2)}%`;
/** The Movers board's volume unit: VOL/SMA as a whole signed percent, "+92%". */
const fmtWhole = (v: number) => `${sign(v)}${Math.abs(Math.round(v))}%`;
const fmtOne = (v: number) => `${sign(v)}${dec(v, 1)}%`;

/** A board row as drawn: a ticker row, or a sector row whose `label` is the group's name. */
type Item = Omit<BoardRow, 'symbol' | 'changePercent'> & {key: string; label: string; changePercent?: number; members?: number; aboveSma200Share?: number; topSymbols?: string[]};

type Extra = Exclude<BoardColumn, 'price' | 'change' | 'rs1m'>;
/** The optional columns: header (an optional small line over the main one) and the row's text. */
const EXTRA: Record<Extra, {top?: string; main: string; text: (r: Item) => string | null; fill?: string}> = {
  rs52w: {main: 'RS 52W', text: (r) => (r.rs52w == null ? null : String(r.rs52w))},
  volume: {main: 'KL/TB20', text: (r) => (r.volumeVsSma20Percent == null ? null : fmtWhole(r.volumeVsSma20Percent))},
  aboveEma50: {top: 'TRÊN', main: 'EMA50', text: (r) => (r.aboveEma50Percent == null ? null : fmtOne(r.aboveEma50Percent))},
  aboveSma200: {top: 'TRÊN', main: 'SMA200', text: (r) => (r.aboveSma200Percent == null ? null : fmtOne(r.aboveSma200Percent))},
  // The weekly boards (2026-10-06). `weekChange` is a pill in the change slot when the board has no day column;
  // `signal` is drawn as a pill (see signalPill) — its text here is what a missing value falls back to.
  weekChange: {main: '% TUẦN', text: (r) => (r.weekChangePercent == null ? null : fmtChange(r.weekChangePercent))},
  signal: {main: 'TÍN HIỆU', text: (r) => (r.signal == null ? null : r.signal === 'confirmed' ? 'XÁC NHẬN' : 'TIỀM NĂNG')},
  rs3m: {main: 'RS 3M', text: (r) => (r.rs3m == null ? null : String(r.rs3m))},
  members: {main: 'SỐ MÃ', text: (r) => (r.members == null ? null : String(r.members))},
  aboveSma200Share: {top: '% MÃ TRÊN', main: 'SMA200', text: (r) => (r.aboveSma200Share == null ? null : `${Math.round(r.aboveSma200Share)}%`)},
  topSymbols: {top: 'TOP 3 · RS 1M', main: 'MÃ MẠNH NHẤT', text: (r) => (r.topSymbols?.length ? r.topSymbols.join(' · ') : null)},
  // Drawn as chips (see filterChips); the text is what a missing value falls back to.
  filters: {main: 'BỘ LỌC', text: (r) => (r.filters?.length ? r.filters.join(' · ') : null)},
  // The picks' board (2026-10-18): the close above which the name is watched, and the close under which it is a warning.
  watchUp: {top: 'THEO DÕI', main: 'VƯỢT', text: (r) => (r.watchUp == null ? null : fmtPrice(r.watchUp)), fill: COLORS.up},
  watchDown: {top: 'LƯU Ý', main: 'THỦNG', text: (r) => (r.watchDown == null ? null : fmtPrice(r.watchDown)), fill: COLORS.down},
};
const isExtra = (c: BoardColumn): c is Extra => c in EXTRA;

/** A ticker's width at the board's size. Be Vietnam Pro is proportional; ~0.78 em a capital is the fallback. */
const tickerWidth = (symbol: string) => {
  try {
    return measureText({text: symbol, fontFamily: FONTS.display, fontSize: SIZE.ticker, fontWeight: '800', letterSpacing: '0.5px'}).width;
  } catch {
    return symbol.length * SIZE.ticker * 0.78;
  }
};

/**
 * A group name's width in em at Be Vietnam Pro 700, from per-glyph classes — deterministic, so its size is the same
 * on every frame (a browser measurement can run before the font has loaded and cache the fallback's width). The
 * classes alone ran 1–4% narrow of the rendered ink (measured 2026-10-06 on ten ICB names at 25–30 px), hence the
 * 5% margin: the estimate errs wide.
 */
const EM_MARGIN = 1.05;
const NARROW = new Set([...'iìíỉĩịjlI.,;:!|\'']);
const SLIM = new Set([...'frtJ()[]-']);
const WIDE = new Set([...'mwMW@%']);
const emWidth = (s: string) => {
  let em = 0;
  for (const ch of s.normalize('NFC')) {
    const bare = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (ch === ' ') em += 0.27;
    else if (ch === '&') em += 0.74;
    else if (NARROW.has(ch) || NARROW.has(bare)) em += 0.3;
    else if (SLIM.has(bare)) em += 0.42;
    else if (WIDE.has(bare)) em += 0.9;
    else if (/[0-9]/.test(bare)) em += 0.62;
    else if (bare === 'Đ' || bare === 'đ') em += bare === 'Đ' ? 0.76 : 0.64;
    else if (bare !== bare.toLowerCase()) em += 0.72;
    else em += 0.6;
  }
  return em * EM_MARGIN;
};
/** The size that fits a group name in a cell `cellW` wide, NAME_MIN..NAME_MAX. */
const nameSize = (label: string, cellW: number) => Math.max(NAME_MIN, Math.min(NAME_MAX, Math.floor(cellW / Math.max(1, emWidth(label)))));

/** The magnifier of a focus row, drawn (a glyph would fall back to another font): lens, glint, handle. */
const Magnifier: React.FC<{cx: number; cy: number; s: number; rot: number; opacity: number}> = ({cx, cy, s, rot, opacity}) => (
  <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`} opacity={opacity}>
    <circle r={LENS + 5} fill={COLORS.gold} fillOpacity={0.16} />
    <circle r={LENS} fill={COLORS.plot} stroke={COLORS.gold} strokeWidth={3.2} />
    <path d={`M${-LENS * 0.5} ${-LENS * 0.15} A${LENS * 0.55} ${LENS * 0.55} 0 0 1 ${-LENS * 0.1} ${-LENS * 0.52}`} fill="none" stroke={COLORS.gold} strokeWidth={2} strokeLinecap="round" opacity={0.8} />
    <line x1={LENS * 0.72} y1={LENS * 0.72} x2={LENS * 1.55} y2={LENS * 1.55} stroke={COLORS.gold} strokeWidth={4.4} strokeLinecap="round" />
  </g>
);

/** A bar from the baseline with a 4px rounded data end and a square start (dataviz mark spec). */
const barPath = (x0: number, y0: number, w: number, h: number) => {
  if (w <= 4) return `M${x0} ${y0} h${Math.max(0, w)} v${h} h${-Math.max(0, w)} Z`;
  const r = 4;
  return `M${x0} ${y0} H${x0 + w - r} Q${x0 + w} ${y0} ${x0 + w} ${y0 + r} V${y0 + h - r} Q${x0 + w} ${y0 + h} ${x0 + w - r} ${y0 + h} H${x0} Z`;
};

/** The change pill's geometry for a value, right edge at `right`: direction colour, text, width, left edge. */
const pillOf = (v: number | null | undefined, right: number) => {
  const dir = v == null ? null : v > 0 ? COLORS.up : v < 0 ? COLORS.down : null;
  const text = v == null ? '—' : fmtChange(v);
  const tri = dir ? 18 : 0;
  const w = text.length * SIZE.pill * MONO + tri + 24;
  return {v, dir, text, w, x: right - w, right};
};

type Props = Extract<Visual, {type: 'board'}> & {beatIndex: number; beatFrame: number; beatStarts: number[]};

/**
 * One saved screener filter as a ranked table (market-review's rs and uptrend scenes; user 2026-10-01 evening:
 * "Make the RS strong scene more attractive, must have the RS1M column, price change & more info", and for
 * Uptrend "more info and attractive like … RS strong"). Each row: rank, ticker, price, the day's change on a
 * direction-tinted pill, RS 1M as a figure plus a bar on the 0–99 scale, and up to two columns that say what
 * the filter tests. User 2026-10-05: one column of rows sorted by RS 1M, "decoration and animation with the symbol
 * need focused", the same on RS Strong and Uptrend — and nothing that says a name is in another filter.
 *
 * The weekly (2026-10-06) adds two kinds: the Momentum breakout / breakdown boards — the week's change on the pill
 * (`weekChange` in place of the day's `change`) and the filter's signal as a pill (XÁC NHẬN filled, TIỀM NĂNG dashed,
 * green for a breakout, red for a breakdown: `signalKind`) — and the sector board (`mode: 'sector'`): ICB groups with
 * their name in place of the ticker, how many stocks they count, their median RS 1M on the same bar, the week's
 * median change and the share above SMA200. Same motion, same focus.
 *
 * Motion: the rows land top-down (eased slide and fade, the RS bars growing behind them), then each `focus` row gets
 * a gold mark at its left edge. On the emphasis beat the other rows dim and the focus rows light up one after
 * another, top-down: a gold band sweeps across the row, an outline is drawn round it, the ticker grows and turns
 * gold, a magnifier pops in after it; then band and outline breathe slowly. The plate saying it replaces the caption.
 * Every figure on screen is the fact pack's at every frame — nothing counts up.
 */
export const FilterBoard: React.FC<Props> = (props) => {
  const {caption, columns, startRank = 1, emphasis = [], beatStarts} = props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sector = props.mode === 'sector';
  const signalKind = props.mode === 'sector' ? undefined : props.signalKind;
  const scroll = props.mode === 'sector' ? undefined : props.scroll?.length ? props.scroll : undefined;
  const rows: Item[] = (props.mode === 'sector'
    ? props.rows.map((r: SectorRow): Item => ({...r, key: r.name, label: r.name}))
    : props.rows.map((r: BoardRow): Item => ({...r, key: r.symbol, label: r.symbol}))
  ).slice(0, scroll ? MAX_SCROLL_ROWS : MAX_ROWS);
  // A scrolling board sizes and times everything on the ten rows in view; the rest wait below the window.
  const n = Math.max(1, scroll ? Math.min(rows.length, MAX_ROWS) : rows.length);
  /** Rows scrolled out of view at this frame: each step eases from the offset before it, from its beat's start. */
  const scrolled = (() => {
    if (!scroll) return 0;
    let at = 0;
    for (const s of [...scroll].sort((a, b) => a.beat - b.beat)) {
      const t0 = s.beat < beatStarts.length ? beatStarts[s.beat] : Infinity;
      const to = Math.max(0, Math.min(s.offset, rows.length - n));
      if (frame < t0) break;
      if (frame < t0 + SCROLL_FRAMES) return at + (to - at) * ramp(frame, t0, t0 + SCROLL_FRAMES, easeInOut);
      at = to;
    }
    return at;
  })();
  // A board with notes (the weekly's Momentum boards) anchors its rows at the top and keeps room for the plates under
  // them; every other board centres its rows in the whole area, as before.
  const notes = props.mode === 'sector' ? undefined : props.notes;
  const hasDef = !!notes?.definition?.items?.length && rows.length <= NOTE.defRows;
  const room = notes ? (notes.state ? NOTE.stateH + NOTE.gap : 0) + (hasDef ? NOTE.defMin + NOTE.gap : 0) : 0;
  const rowH = Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor((ROWS_BOTTOM - ROWS_TOP - room) / n)));
  const top0 = notes ? ROWS_TOP : ROWS_TOP + Math.floor((ROWS_BOTTOM - ROWS_TOP - rowH * n) / 2);
  const shows = (c: BoardColumn) => columns.includes(c);
  // The picks' board (watchUp / watchDown) and the watchlist board (a `filters` column) lay their columns out for the chips.
  const watch = shows('watchUp') || shows('watchDown');
  const X = watch ? X_WATCH : shows('filters') ? X_TAGS : X_BASE;
  // The pill slot after the price: the day's change, else (the weekly's boards) the week's change.
  const pillCol: 'change' | 'weekChange' | null = shows('change') ? 'change' : shows('weekChange') ? 'weekChange' : null;
  const pillValue = (r: Item) => (pillCol === 'change' ? r.changePercent : pillCol === 'weekChange' ? r.weekChangePercent : undefined);
  const extras = columns.filter((c): c is Extra => isExtra(c) && c !== pillCol).slice(0, X.extra.length);
  // A sector board sizes every name for one cell: up to 12px before the widest member count (else before the RS
  // figure), minus the magnifier's slot when any row is lit — so a lit name, however long, keeps its magnifier
  // (worker C, 2026-10-06: the longest lit name lost it). Same rule for every row, so the names share their sizes.
  // With the tickers (`topSymbols`) the name's cell ends 16px before them and the count moves under the name.
  const tk = sector && shows('topSymbols');
  const membersW = sector && !tk && shows('members') ? Math.max(...rows.map((r) => (r.members == null ? 1 : String(r.members).length))) * SIZE.num * MONO : 0;
  const nameRight = tk ? XT.tickers - 16 : membersW ? XS.members - membersW - 12 : XS.rsNum - 2 * SIZE.rs * MONO - 12;
  const nameCell = Math.min(tk ? nameRight : XS.nameMax, nameRight - (rows.some((r) => r.focus) ? LENS_SPAN + 8 : 0)) - XS.name;
  const sigColor = signalKind === 'breakout' ? COLORS.up : signalKind === 'breakdown' ? COLORS.down : COLORS.gold;

  // Timeline, in frames from the scene's start: rows land top-down, then the focus rows get their mark.
  const rowStart = (k: number) => 12 + 4 * k;
  const landed = rowStart(n - 1) + 24;
  const order = rows.map((r, k) => (r.focus ? rows.slice(0, k).filter((x) => x.focus).length : -1));
  const nFocus = order.filter((i) => i >= 0).length;
  const markIn = (k: number) => (order[k] < 0 ? 0 : ramp(frame, landed + 4 * order[k], landed + 4 * order[k] + 14, easeOut));

  // The emphasis on screen: the latest whose beat has begun. A one-beat scene plays it once the marks are in.
  const startOf = (e: BoardEmphasis) => (e.beat < beatStarts.length ? beatStarts[e.beat] : landed + 4 * nFocus + 36);
  // A spotlight ends on its `until` beat and fades out over UNLIT frames; every other emphasis holds to the scene's end.
  const endOf = (e: BoardEmphasis) => (e.until != null && e.until < beatStarts.length ? beatStarts[e.until] : Infinity);
  const live = emphasis.filter((e) => e.beat >= 1 && frame >= startOf(e) && frame < endOf(e) + UNLIT).sort((a, b) => startOf(a) - startOf(b));
  const active = live.length ? live[live.length - 1] : null;
  const S0 = active ? startOf(active) : Infinity;
  /** 1 while the emphasis holds, then down to 0 as a spotlight ends. */
  const hold = !active ? 0 : endOf(active) === Infinity ? 1 : 1 - ramp(frame, endOf(active), endOf(active) + UNLIT, easeInOut);
  const p = active ? ramp(frame, S0, S0 + 16, easeInOut) * hold : 0;
  // The caption leaves before the plate arrives in the same spot, so the two never sit half-visible on each other.
  const capOut = active?.label ? ramp(frame, S0, S0 + 7, easeInOut) * hold : 0;
  const plateIn = active?.label ? ramp(frame, S0 + 6, S0 + 20, easeOut) * hold : 0;
  const lighting = active?.set === 'focus' || active?.set === 'spot';
  /** The rows this emphasis lights: the `spot` rows of a spotlight, else the focus rows. */
  const inSet = (r: Item) => (active?.set === 'spot' ? !!r.spot : !!r.focus);
  const litOrder = rows.map((r, k) => (inSet(r) ? rows.slice(0, k).filter(inSet).length : -1));
  // `collapse` (a scrolling board's focus beat, 2026-10-18 — the user's six picks lay on rows 3–15, more than a page): every
  // row fades out, then only the focus rows come back, top-down in the order their scenes play, and light up there.
  const collapse = !sector && active?.set === 'focus' && active?.collapse?.length ? active.collapse : null;
  const C_OUT = 10;
  const C_IN = 14;
  const slotOf = (r: Item) => (collapse ? collapse.indexOf(r.key) : -1);
  /** When lit row k starts lighting up (frames from the scene's start): top-down, 8 frames apart. */
  const litAt = (k: number) => (collapse ? S0 + C_OUT + C_IN + 6 + 8 * Math.max(0, slotOf(rows[k])) : S0 + 6 + 8 * litOrder[k]);

  const headIn = ramp(frame, 6, 22);
  const head = (x: number, main: string, anchor: 'start' | 'end', top?: string) => (
    <g key={`${main}-${x}`}>
      {top ? (
        <text x={x} y={HEAD_BASE - 21} textAnchor={anchor} fontFamily={FONTS.mono} fontSize={SIZE.headTop} fill={COLORS.faint} letterSpacing={1.2}>
          {top}
        </text>
      ) : null}
      <text x={x} y={HEAD_BASE} textAnchor={anchor} fontFamily={FONTS.mono} fontSize={SIZE.head} fill={COLORS.muted} letterSpacing={1.2}>
        {main}
      </text>
    </g>
  );

  const num = {fontFamily: FONTS.mono, style: {fontVariantNumeric: 'tabular-nums' as const}};

  /** The change pill (day or week), right edge at `g.right`. */
  const pill = (g: ReturnType<typeof pillOf>, mid: number) => (
    <g>
      <rect x={g.x} y={mid - 19} width={g.w} height={38} rx={19} fill={g.dir ?? COLORS.white} fillOpacity={g.dir ? 0.18 : 0.06} />
      {g.dir ? (
        <path
          d={(g.v ?? 0) > 0
            ? `M${g.x + 12} ${mid + 5} L${g.x + 22} ${mid + 5} L${g.x + 17} ${mid - 5} Z`
            : `M${g.x + 12} ${mid - 5} L${g.x + 22} ${mid - 5} L${g.x + 17} ${mid + 5} Z`}
          fill={g.dir}
        />
      ) : null}
      <text x={g.right - 12} y={base(mid, SIZE.pill)} textAnchor="end" {...num} fontWeight={600} fontSize={SIZE.pill} fill={g.dir ? COLORS.white : COLORS.inkMuted}>
        {g.text}
      </text>
    </g>
  );

  /** The filter's signal as a pill in an extra column, right edge at `right`: filled when confirmed, dashed when potential. */
  const signalPill = (r: Item, right: number, mid: number) => {
    const t = EXTRA.signal.text(r);
    if (t == null) {
      return (
        <text key="signal" x={right} y={base(mid, SIZE.extra)} textAnchor="end" {...num} fontWeight={500} fontSize={SIZE.extra} fill={COLORS.faint}>
          —
        </text>
      );
    }
    const confirmed = r.signal === 'confirmed';
    const w = t.length * (SIG * MONO + SIG_TRACK) + 20;
    return (
      <g key="signal">
        <rect
          x={right - w} y={mid - 15} width={w} height={30} rx={15}
          fill={sigColor} fillOpacity={confirmed ? 0.22 : 0.05}
          stroke={sigColor} strokeOpacity={confirmed ? 0.9 : 0.75} strokeWidth={1.5} strokeDasharray={confirmed ? undefined : '4 3'}
        />
        <text x={right - 10} y={base(mid, SIG)} textAnchor="end" fontFamily={FONTS.mono} fontWeight={700} fontSize={SIG} letterSpacing={SIG_TRACK} fill={confirmed ? COLORS.white : sigColor}>
          {t}
        </text>
      </g>
    );
  };

  /** The saved filters that found a name, one chip each from `left`, in TAGS order (a name the table does not know keeps its text). */
  const filterChips = (r: Item, left: number, mid: number) => {
    const names = r.filters ?? [];
    if (!names.length && !r.added) {
      return (
        <text key="filters" x={left} y={base(mid, SIZE.extra)} {...num} fontWeight={500} fontSize={SIZE.extra} fill={COLORS.faint}>
          —
        </text>
      );
    }
    const known = TAGS.filter((t) => names.includes(t.name));
    const rest = names.filter((n) => !TAGS.some((t) => t.name === n)).map((n) => ({name: n, label: n.toUpperCase(), color: COLORS.muted}));
    // A name the user picked onto the table (the weekly's watchlist, 2026-10-18): one gold chip after its filters.
    const added = r.added ? [{name: '__added', label: 'THÊM', color: COLORS.gold}] : [];
    let x = left;
    return (
      <g key="filters">
        {[...known, ...rest, ...added].map((t) => {
          const w = t.label.length * (SIG * MONO + SIG_TRACK) + 20;
          const el = (
            <g key={t.name}>
              <rect x={x} y={mid - 15} width={w} height={30} rx={15} fill={t.color} fillOpacity={0.18} stroke={t.color} strokeOpacity={0.85} strokeWidth={1.5} />
              <text x={x + w / 2} y={base(mid, SIG)} textAnchor="middle" fontFamily={FONTS.mono} fontWeight={700} fontSize={SIG} letterSpacing={SIG_TRACK} fill={COLORS.white}>
                {t.label}
              </text>
            </g>
          );
          x += w + TAG_GAP;
          return el;
        })}
      </g>
    );
  };

  const rowEls = rows.map((r, k) => {
    const slot = slotOf(r);
    const landing = !!collapse && frame >= S0 + C_OUT;
    const cIn = landing && slot >= 0 ? ramp(frame, S0 + C_OUT + 4 * slot, S0 + C_OUT + 4 * slot + C_IN, easeOut) : 0;
    /** 1 outside a collapse; while it runs, every row fades out, then the kept rows land in their slots. */
    const kept = !collapse ? 1 : landing ? (slot >= 0 ? cIn : 0) : 1 - ramp(frame, S0, S0 + C_OUT, easeInOut);
    const slide = landing && slot >= 0 ? (1 - cIn) * -24 : 0;
    const y = landing && slot >= 0 ? top0 + slot * rowH : top0 + (k - scrolled) * rowH;
    const mid = y + rowH / 2;
    const e = ramp(frame, rowStart(k), rowStart(k) + 18, easeOut);
    const grow = ramp(frame, rowStart(k) + 6, rowStart(k) + 34, easeOut);
    const isFocus = !!r.focus;
    /** Lit on this beat: a focus row on the focus beat, a `spot` row on its spotlight. */
    const isLit = lighting && inSet(r);
    const dim = active?.dim && !isLit ? 1 - (1 - DIMMED) * p : 1;
    const g = pillOf(pillValue(r), tk ? XT.week : sector ? XS.week : X.change);
    const pillX = g.x;
    const rsBar0 = tk ? XT.rsBar0 : sector ? XS.rsBar0 : X.rsBar0;
    const rsBar1 = tk ? XT.rsBar1 : sector ? XS.rsBar1 : X.rsBar1;
    const barW = (rsBar1 - rsBar0) * Math.min(1, Math.max(0, r.rs1m / RS_MAX)) * grow;

    // Focus: the mark from beat 1, then the light-up on the emphasis beat.
    const mark = isFocus ? markIn(k) : 0;
    const lit = isLit;
    const t0 = lit ? litAt(k) : 0;
    // `hold` is 1 except while a spotlight fades out: band, outline, gold ticker and magnifier go with it.
    const sweep = lit ? ramp(frame, t0, t0 + 14, easeInOut) * hold : 0;
    const ringP = lit ? ramp(frame, t0 + 4, t0 + 22, easeInOut) * hold : 0;
    const popS = lit ? spring({frame: frame - (t0 + 2), fps, config: {damping: 11, mass: 0.6, stiffness: 150}}) * hold : 0;
    const lensS = lit ? spring({frame: frame - (t0 + 9), fps, config: {damping: 10, mass: 0.5, stiffness: 160}}) * hold : 0;
    const gold = lit ? ramp(frame, t0 + 2, t0 + 14, easeInOut) * hold : 0;
    // A slow breath once the row is lit: deterministic in the frame, small enough to read as light, not blinking.
    const breath = lit && frame > t0 + 24 ? 0.5 + 0.5 * Math.sin(((frame - t0 - 24) / 54) * 2 * Math.PI - Math.PI / 2) : 0;
    const ring = 2 * (W - 16 + rowH - 2);
    const tickerFill = gold > 0 ? interpolateColors(gold, [0, 1], [COLORS.white, COLORS.gold]) : COLORS.white;
    const rankFill = gold > 0 ? interpolateColors(gold, [0, 1], [COLORS.faint, COLORS.gold]) : COLORS.faint;

    // A spot row wears the same band and outline while its spotlight lasts (it has no beat-1 mark: `mark` stays 0).
    const focusDeco = isFocus || r.spot ? (
      <g>
        <rect x={12} y={y + 3} width={(W - 24) * sweep} height={rowH - 6} rx={10} fill={COLORS.gold} fillOpacity={0.15 + 0.05 * breath} />
        <rect x={12} y={y + 6 - 3 * sweep} width={4 + sweep} height={rowH - 12 + 6 * sweep} rx={2.5} fill={COLORS.gold} opacity={Math.max(0.6 * mark, sweep)} />
        {ringP > 0 ? (
          <g>
            <rect
              x={8} y={y + 1} width={W - 16} height={rowH - 2} rx={12}
              fill="none" stroke={COLORS.gold} strokeWidth={7} opacity={(0.16 + 0.14 * breath) * ringP}
              filter="url(#fb-glow)"
            />
            <rect
              x={8} y={y + 1} width={W - 16} height={rowH - 2} rx={12}
              fill="none" stroke={COLORS.gold} strokeOpacity={0.85} strokeWidth={2.2}
              strokeDasharray={ring} strokeDashoffset={ring * (1 - ringP)}
            />
          </g>
        ) : null}
      </g>
    ) : null;
    const rankEl = (
      <text x={X.rank} y={base(mid, SIZE.rank)} {...num} fontSize={SIZE.rank} fill={rankFill}>
        {String(startRank + k).padStart(2, '0')}
      </text>
    );
    const separator = k < rows.length - 1 ? <line x1={PAD} x2={W - PAD} y1={y + rowH} y2={y + rowH} stroke={COLORS.hairline} strokeWidth={1} /> : null;

    if (tk) {
      // Two lines in the name's cell: the group's name (≤ 42% of the row's height) and, small and grey under it, how many
      // liquid stocks it counts; then its tickers, strongest first, on the row's middle. A lit row turns name and
      // tickers gold together; its magnifier sits after the name, on the name's line.
      const showCount = shows('members') && r.members != null;
      const size = Math.min(nameSize(r.label, nameCell), Math.max(NAME_MIN, Math.floor(rowH * TICK.nameMax)));
      const nameW = emWidth(r.label) * size;
      const nameY = showCount ? mid + 1 : base(mid, size * 0.92);
      // 7px under the name's baseline: clear of its descenders (g, p, y ≈ 0.22 em) at any size the cell allows.
      const countY = nameY + 7 + TICK.count * 0.9;
      const room = Math.max(1, nameCell / Math.max(1, nameW));
      const scale = 1 + Math.min(POP, Math.max(0, room - 1)) * popS;
      let lens: {cx: number; s: number} | null = null;
      if (isFocus) {
        const right = XT.name + nameW * Math.min(1 + POP, room);
        const avail = nameRight - (right + 8);
        const fit = Math.min(1, avail / LENS_SPAN);
        if (fit >= 0.6) lens = {cx: right + 8 + (LENS + 5) * fit + Math.min(6, Math.max(0, avail - LENS_SPAN * fit) / 2), s: fit};
      }
      // The tickers fit the column at TICK.size, else all shrink together — never wrapped, never cut.
      const syms = r.topSymbols ?? [];
      const chars = syms.reduce((a, x) => a + x.length, 0);
      const natural = chars * TICK.size * MONO + Math.max(0, syms.length - 1) * TICK.gap;
      const k0 = natural > 0 ? Math.min(1, (XT.tickersMax - XT.tickers) / natural) : 1;
      const tSize = TICK.size * k0;
      const tGap = TICK.gap * k0;
      let tx = XT.tickers;
      const tickEls = syms.map((x, j) => {
        const w = x.length * tSize * MONO;
        const at = tx;
        tx += w + tGap;
        const strongest = j === 0;
        const base0 = strongest ? COLORS.white : COLORS.inkSecondary;
        const fill = gold > 0 ? interpolateColors(gold, [0, 1], [base0, COLORS.gold]) : base0;
        return (
          <g key={x}>
            <text x={at} y={base(mid, tSize)} fontFamily={FONTS.mono} fontWeight={strongest || gold > 0.5 ? 700 : 500} fontSize={tSize} fill={fill}>
              {x}
            </text>
            {j < syms.length - 1 ? (
              <text x={at + w + tGap / 2} y={base(mid, tSize)} textAnchor="middle" fontFamily={FONTS.mono} fontSize={tSize} fill={COLORS.faint}>
                ·
              </text>
            ) : null}
          </g>
        );
      });
      const share = EXTRA.aboveSma200Share.text(r);
      return (
        <g key={r.key} opacity={e * dim * kept} transform={`translate(${(1 - e) * -24 + slide} 0)`}>
          {focusDeco}
          {rankEl}
          <g transform={scale !== 1 ? `translate(${XT.name} ${nameY}) scale(${scale}) translate(${-XT.name} ${-nameY})` : undefined}>
            <text x={XT.name} y={nameY} fontFamily={FONTS.display} fontWeight={700} fontSize={size} fill={tickerFill} letterSpacing={0.2}>
              {r.label}
            </text>
          </g>
          {showCount ? (
            <text x={XT.name} y={countY} fontFamily={FONTS.mono} fontWeight={500} fontSize={TICK.count} fill={COLORS.inkMuted} letterSpacing={0.6}>
              {`${r.members} mã`}
            </text>
          ) : null}
          {lens && lensS > 0.001 ? <Magnifier cx={lens.cx} cy={nameY - size * 0.36} s={lens.s * Math.max(0, lensS)} rot={-24 * (1 - Math.min(1, lensS))} opacity={Math.min(1, lensS * 1.4)} /> : null}
          {syms.length ? tickEls : (
            <text x={XT.tickers} y={base(mid, TICK.size)} fontFamily={FONTS.mono} fontSize={TICK.size} fill={COLORS.faint}>
              —
            </text>
          )}
          <text x={XT.rsNum} y={base(mid, SIZE.rs)} textAnchor="end" {...num} fontWeight={700} fontSize={SIZE.rs} fill={COLORS.white}>
            {r.rs1m}
          </text>
          <rect x={rsBar0} y={mid - BAR_H / 2} width={rsBar1 - rsBar0} height={BAR_H} rx={BAR_H / 2} fill={COLORS.white} fillOpacity={0.07} />
          <path d={barPath(rsBar0, mid - BAR_H / 2, barW, BAR_H)} fill={COLORS.signal} />
          {pillCol ? pill(g, mid) : null}
          {shows('aboveSma200Share') ? (
            <text x={XT.share} y={base(mid, SIZE.extra)} textAnchor="end" {...num} fontWeight={500} fontSize={SIZE.extra} fill={share == null ? COLORS.faint : COLORS.inkSecondary}>
              {share ?? '—'}
            </text>
          ) : null}
          {separator}
        </g>
      );
    }

    if (sector) {
      // The group's name grows on its focus beat only as far as its cell allows, and its magnifier sits in the slot
      // the cell leaves free (nameCell), 8px after the grown name, 12px before the member count.
      const size = nameSize(r.label, nameCell);
      const nameW = emWidth(r.label) * size;
      const nameY = base(mid, size * 0.92);
      const room = Math.max(1, nameCell / Math.max(1, nameW));
      const scale = 1 + Math.min(POP, Math.max(0, room - 1)) * popS;
      let lens: {cx: number; s: number} | null = null;
      if (isFocus) {
        const right = XS.name + nameW * Math.min(1 + POP, room);
        const avail = nameRight - (right + 8);
        const fit = Math.min(1, avail / LENS_SPAN);
        if (fit >= 0.6) lens = {cx: right + 8 + (LENS + 5) * fit + Math.min(6, Math.max(0, avail - LENS_SPAN * fit) / 2), s: fit};
      }
      const share = EXTRA.aboveSma200Share.text(r);
      return (
        <g key={r.key} opacity={e * dim * kept} transform={`translate(${(1 - e) * -24 + slide} 0)`}>
          {focusDeco}
          {rankEl}
          <g transform={scale !== 1 ? `translate(${XS.name} ${nameY}) scale(${scale}) translate(${-XS.name} ${-nameY})` : undefined}>
            <text x={XS.name} y={nameY} fontFamily={FONTS.display} fontWeight={700} fontSize={size} fill={tickerFill} letterSpacing={0.2}>
              {r.label}
            </text>
          </g>
          {lens && lensS > 0.001 ? <Magnifier cx={lens.cx} cy={mid - 1} s={lens.s * Math.max(0, lensS)} rot={-24 * (1 - Math.min(1, lensS))} opacity={Math.min(1, lensS * 1.4)} /> : null}
          {shows('members') ? (
            <text x={XS.members} y={base(mid, SIZE.num)} textAnchor="end" {...num} fontWeight={600} fontSize={SIZE.num} fill={r.members == null ? COLORS.faint : COLORS.inkSecondary}>
              {r.members == null ? '—' : String(r.members)}
            </text>
          ) : null}
          <text x={XS.rsNum} y={base(mid, SIZE.rs)} textAnchor="end" {...num} fontWeight={700} fontSize={SIZE.rs} fill={COLORS.white}>
            {r.rs1m}
          </text>
          <rect x={rsBar0} y={mid - BAR_H / 2} width={rsBar1 - rsBar0} height={BAR_H} rx={BAR_H / 2} fill={COLORS.white} fillOpacity={0.07} />
          <path d={barPath(rsBar0, mid - BAR_H / 2, barW, BAR_H)} fill={COLORS.signal} />
          {pillCol ? pill(g, mid) : null}
          {shows('aboveSma200Share') ? (
            <text x={XS.share} y={base(mid, SIZE.extra)} textAnchor="end" {...num} fontWeight={500} fontSize={SIZE.extra} fill={share == null ? COLORS.faint : COLORS.inkSecondary}>
              {share ?? '—'}
            </text>
          ) : null}
          {separator}
        </g>
      );
    }

    const tickerY = base(mid, SIZE.ticker);
    const scale = 1 + POP * popS;

    // The magnifier sits after the grown ticker and clear of the first figure to its right (price, else the pill):
    // 8px after the ticker, 12px before the figure, shrunk to fit a wide price ("232,00"), left out below 60%.
    let lens: {cx: number; s: number} | null = null;
    if (isFocus || r.spot) {
      const right = X.ticker + tickerWidth(r.label) * (1 + POP);
      const priceW = shows('price') && r.price != null ? fmtPrice(r.price).length * SIZE.num * MONO : 0;
      const nextLeft = priceW ? X.price - priceW : pillCol ? pillX : X.rsNum - 2 * SIZE.rs * MONO;
      const avail = nextLeft - 12 - (right + 8);
      const fit = Math.min(1, avail / LENS_SPAN);
      if (fit >= 0.6) lens = {cx: right + 8 + (LENS + 5) * fit + Math.min(6, Math.max(0, avail - LENS_SPAN * fit) / 2), s: fit};
    }

    return (
      <g key={r.key} opacity={e * dim * kept} transform={`translate(${(1 - e) * -24 + slide} 0)`}>
        {focusDeco}
        {rankEl}
        <g transform={scale !== 1 ? `translate(${X.ticker} ${tickerY}) scale(${scale}) translate(${-X.ticker} ${-tickerY})` : undefined}>
          <text x={X.ticker} y={tickerY} fontFamily={FONTS.display} fontWeight={800} fontSize={SIZE.ticker} fill={tickerFill} letterSpacing={0.5}>
            {r.label}
          </text>
        </g>
        {lens && lensS > 0.001 ? <Magnifier cx={lens.cx} cy={mid - 1} s={lens.s * Math.max(0, lensS)} rot={-24 * (1 - Math.min(1, lensS))} opacity={Math.min(1, lensS * 1.4)} /> : null}
        {shows('price') && r.price != null ? (
          <text x={X.price} y={base(mid, SIZE.num)} textAnchor="end" {...num} fontWeight={600} fontSize={SIZE.num} fill={COLORS.white}>
            {fmtPrice(r.price)}
          </text>
        ) : null}
        {pillCol ? pill(g, mid) : null}
        {watch ? null : (
          <>
            <text x={X.rsNum} y={base(mid, SIZE.rs)} textAnchor="end" {...num} fontWeight={700} fontSize={SIZE.rs} fill={COLORS.white}>
              {r.rs1m}
            </text>
            <rect x={X.rsBar0} y={mid - BAR_H / 2} width={X.rsBar1 - X.rsBar0} height={BAR_H} rx={BAR_H / 2} fill={COLORS.white} fillOpacity={0.07} />
            <path d={barPath(X.rsBar0, mid - BAR_H / 2, barW, BAR_H)} fill={COLORS.signal} />
          </>
        )}
        {extras.map((c, i) => {
          if (c === 'signal') return signalPill(r, X.extra[i], mid);
          if (c === 'filters') return filterChips(r, X.extra[i], mid);
          const t = EXTRA[c].text(r);
          return (
            <text key={c} x={X.extra[i]} y={base(mid, SIZE.extra)} textAnchor="end" {...num} fontWeight={EXTRA[c].fill ? 700 : 500} fontSize={SIZE.extra} fill={t == null ? COLORS.faint : EXTRA[c].fill ?? COLORS.inkSecondary}>
              {t ?? '—'}
            </text>
          );
        })}
        {separator}
      </g>
    );
  });

  // The notes (weekly Momentum boards): the state plate right under the rows, the definition card filling the space
  // below it. They land once the rows (and focus marks) are in, or on their own beat (`notes.beat`, a board with no focus).
  // An EMPTY board (no stock passed the filter this session — both Momentum filters on 9/10): the plates are the panel,
  // at the top from the scene's start.
  const notesAt = !notes ? Infinity : notes.beat && notes.beat < beatStarts.length ? beatStarts[notes.beat] : rows.length ? landed + 4 * nFocus + 10 : 12;
  const sIn = notes ? ramp(frame, notesAt, notesAt + 12, easeOut) : 0;
  const stateY = rows.length ? top0 + rowH * n + NOTE.gap : top0;
  const defY = stateY + (notes?.state ? NOTE.stateH + NOTE.gap : 0);
  const defH = ROWS_BOTTOM - defY;
  const stateEl = notes?.state && sIn > 0 ? (() => {
    const c = accentColor(notes.state.accent ?? 'gold');
    const mid = stateY + NOTE.stateH / 2;
    return (
      <g opacity={sIn} transform={`translate(${(1 - sIn) * -18} 0)`}>
        <rect x={PAD - 10} y={stateY} width={W - 2 * PAD + 20} height={NOTE.stateH} rx={10} fill={c} fillOpacity={0.12} stroke={c} strokeOpacity={0.55} strokeWidth={1.5} />
        <rect x={PAD - 10} y={stateY + 8} width={5} height={NOTE.stateH - 16} rx={2.5} fill={c} />
        <text x={PAD + 12} y={base(mid, NOTE.state)} fontFamily={FONTS.display} fontSize={NOTE.state} fontWeight={600} fill={COLORS.inkSecondary}>
          {`${notes.state.label}: `}
          <tspan fontWeight={800} fill={c}>{notes.state.value}</tspan>
          <tspan fill={COLORS.faint}>{'  ·  '}</tspan>
          <tspan fontWeight={700} fill={COLORS.white}>{notes.state.list}</tspan>
        </text>
      </g>
    );
  })() : null;
  const defEl = hasDef && notes?.definition && defH >= NOTE.defMin && sIn > 0 ? (() => {
    const {title, items} = notes.definition;
    const dIn = ramp(frame, notesAt + 4, notesAt + 16, easeOut);
    const inner = defH - 2 * NOTE.pad - NOTE.titleH;
    const lineH = Math.min(64, Math.floor(inner / items.length));
    // One condition a line while each gets ≥ 34px; else the conditions joined and wrapped onto two mono lines.
    const listMode = lineH >= 34;
    const size = listMode ? Math.min(NOTE.item, Math.floor(lineH * 0.6)) : NOTE.wrap;
    const lines: string[] = [];
    if (listMode) lines.push(...items);
    else {
      const max = Math.floor((W - 2 * PAD - 24) / (NOTE.wrap * MONO));
      for (const it of items) {
        const last = lines.length ? lines[lines.length - 1] : null;
        if (last != null && `${last} · ${it}`.length <= max) lines[lines.length - 1] = `${last} · ${it}`;
        else lines.push(it);
      }
    }
    const step = listMode ? lineH : Math.round(NOTE.wrap * 1.45);
    const block = NOTE.titleH + step * lines.length;
    const y0 = defY + Math.max(NOTE.pad, Math.floor((defH - block) / 2));
    return (
      <g opacity={dIn} transform={`translate(0 ${(1 - dIn) * 10})`}>
        <rect x={PAD - 10} y={defY} width={W - 2 * PAD + 20} height={defH} rx={12} fill={COLORS.white} fillOpacity={0.035} stroke={COLORS.hairline} strokeWidth={1.2} />
        <text x={PAD + 12} y={y0 + 18} fontFamily={FONTS.mono} fontSize={15} fill={COLORS.inkMuted} letterSpacing={1.4}>
          {`${title.toUpperCase()} · ĐIỀU KIỆN`}
        </text>
        {lines.map((t, i) => {
          const mid = y0 + NOTE.titleH + step * i + step / 2;
          // Quick enough to be complete ~20 frames into its beat (a short scene's last still is taken about there).
          const k = ramp(frame, notesAt + 4 + 2 * i, notesAt + 14 + 2 * i, easeOut);
          return listMode ? (
            <g key={t} opacity={k}>
              <circle cx={PAD + 18} cy={mid} r={5} fill={COLORS.gold} />
              <text x={PAD + 36} y={base(mid, size)} fontFamily={FONTS.display} fontSize={size} fontWeight={600} fill={COLORS.white}>
                {t}
              </text>
            </g>
          ) : (
            <text key={t} x={PAD + 12} y={base(mid, size)} opacity={k} fontFamily={FONTS.mono} fontSize={size} fontWeight={500} fill={COLORS.white}>
              {t}
            </text>
          );
        })}
      </g>
    );
  })() : null;

  // Footer: the caption on the left; the emphasis plate takes its place on its beat.
  const footBase = FOOT_Y + 36;
  const capAdv = SIZE.foot * MONO + 1.2;
  const capMax = Math.max(0, Math.floor((W - 2 * PAD) / capAdv));
  const cap = caption && caption.length > capMax ? `${caption.slice(0, Math.max(0, capMax - 1)).trimEnd()}…` : caption;
  const plate = active?.label ?? null;
  const plateW = plate ? plate.length * (SIZE.plate * MONO + 1) + 28 : 0;

  const heads = tk ? (
    <>
      {head(X.rank, '#', 'start')}
      {head(XT.name, 'NGÀNH', 'start')}
      {head(XT.tickers, EXTRA.topSymbols.main, 'start', EXTRA.topSymbols.top)}
      {head(XT.rsNum - 2 * SIZE.rs * MONO, 'RS 1M', 'start', 'TRUNG VỊ')}
      {pillCol ? head(XT.week, '% TUẦN', 'end') : null}
      {shows('aboveSma200Share') ? head(XT.share, EXTRA.aboveSma200Share.main, 'end', EXTRA.aboveSma200Share.top) : null}
    </>
  ) : sector ? (
    <>
      {head(X.rank, '#', 'start')}
      {head(XS.name, 'NGÀNH', 'start')}
      {shows('members') ? head(XS.members, EXTRA.members.main, 'end') : null}
      {head(XS.rsNum - 2 * SIZE.rs * MONO, 'RS 1M', 'start', 'TRUNG VỊ')}
      {pillCol ? head(XS.week, '% TUẦN', 'end') : null}
      {shows('aboveSma200Share') ? head(XS.share, EXTRA.aboveSma200Share.main, 'end', EXTRA.aboveSma200Share.top) : null}
    </>
  ) : (
    <>
      {head(X.rank, '#', 'start')}
      {head(X.ticker, 'MÃ', 'start')}
      {shows('price') ? head(X.price, 'GIÁ', 'end') : null}
      {pillCol ? head(X.change, pillCol === 'change' ? '% NGÀY' : '% TUẦN', 'end') : null}
      {/* Over the figure and the start of its bar, clear of "% NGÀY". */}
      {watch ? null : head(X.rsNum - 2 * SIZE.rs * MONO, 'RS 1M', 'start')}
      {extras.map((c, i) => (c === 'filters' ? head(X.extra[i], EXTRA[c].main, 'start') : head(X.extra[i], EXTRA[c].main, 'end', c === 'signal' && signalKind ? signalKind.toUpperCase() : EXTRA[c].top)))}
    </>
  );

  return (
    <Panel tint={COLORS.plot} box={BOX}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <filter id="fb-glow" x="-5%" y="-60%" width="110%" height="220%">
            <feGaussianBlur stdDeviation={5} />
          </filter>
        </defs>
        <g opacity={headIn}>
          {rows.length || sector ? heads : null}
          <line x1={PAD} x2={W - PAD} y1={RULE_Y} y2={RULE_Y} stroke={COLORS.hairline} strokeWidth={1} />
        </g>
        {scroll ? (
          <>
            <clipPath id="fb-rows-window">
              <rect x={0} y={top0 - 2} width={W} height={rowH * n + 4} />
            </clipPath>
            <g clipPath="url(#fb-rows-window)">{rowEls}</g>
          </>
        ) : rowEls}
        {stateEl}
        {defEl}
        <line x1={0} x2={W} y1={FOOT_Y} y2={FOOT_Y} stroke={COLORS.panelStroke} strokeWidth={1} opacity={headIn} />
        {cap ? (
          <text x={PAD} y={footBase} fontFamily={FONTS.mono} fontSize={SIZE.foot} fill={COLORS.inkMuted} letterSpacing={1.2} opacity={ramp(frame, 20, 38) * (1 - capOut)}>
            {cap}
          </text>
        ) : null}
        {plate ? (
          <g opacity={plateIn} transform={`translate(0 ${(1 - plateIn) * 8})`}>
            <rect x={PAD - 8} y={footBase - 25} width={plateW} height={34} rx={6} fill={COLORS.plot} stroke={COLORS.gold} strokeOpacity={0.55} strokeWidth={1.4} />
            <text x={PAD + 6} y={footBase - 1} fontFamily={FONTS.mono} fontWeight={700} fontSize={SIZE.plate} fill={COLORS.gold} letterSpacing={1}>
              {plate.toUpperCase()}
            </text>
          </g>
        ) : null}
      </svg>
    </Panel>
  );
};
