import React from 'react';
import {interpolateColors, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {measureText} from '@remotion/layout-utils';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {COLORS, LAYOUT} from '../theme';
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
/** The terminal's RS ratings run up to 99: a full bar is 99. */
const RS_MAX = 99;
const BAR_H = 12;

/** x of each column in the 1000-wide box; numbers are right-aligned on their column's edge. */
const X = {
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

const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
const dec = (v: number, dp: number) => Math.abs(v).toFixed(dp).replace('.', ',');
const fmtPrice = (v: number) => v.toFixed(2).replace('.', ',');
const fmtChange = (v: number) => `${sign(v)}${dec(v, 2)}%`;
/** The Movers board's volume unit: VOL/SMA as a whole signed percent, "+92%". */
const fmtWhole = (v: number) => `${sign(v)}${Math.abs(Math.round(v))}%`;
const fmtOne = (v: number) => `${sign(v)}${dec(v, 1)}%`;

/** A board row as drawn: a ticker row, or a sector row whose `label` is the group's name. */
type Item = Omit<BoardRow, 'symbol' | 'changePercent'> & {key: string; label: string; changePercent?: number; members?: number; aboveSma200Share?: number};

type Extra = Exclude<BoardColumn, 'price' | 'change' | 'rs1m'>;
/** The optional columns: header (an optional small line over the main one) and the row's text. */
const EXTRA: Record<Extra, {top?: string; main: string; text: (r: Item) => string | null}> = {
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
  const rows: Item[] = (props.mode === 'sector'
    ? props.rows.map((r: SectorRow): Item => ({...r, key: r.name, label: r.name}))
    : props.rows.map((r: BoardRow): Item => ({...r, key: r.symbol, label: r.symbol}))
  ).slice(0, MAX_ROWS);
  const n = Math.max(1, rows.length);
  const rowH = Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor((ROWS_BOTTOM - ROWS_TOP) / n)));
  const top0 = ROWS_TOP + Math.floor((ROWS_BOTTOM - ROWS_TOP - rowH * n) / 2);
  const shows = (c: BoardColumn) => columns.includes(c);
  // The pill slot after the price: the day's change, else (the weekly's boards) the week's change.
  const pillCol: 'change' | 'weekChange' | null = shows('change') ? 'change' : shows('weekChange') ? 'weekChange' : null;
  const pillValue = (r: Item) => (pillCol === 'change' ? r.changePercent : pillCol === 'weekChange' ? r.weekChangePercent : undefined);
  const extras = columns.filter((c): c is Extra => isExtra(c) && c !== pillCol).slice(0, 2);
  // A sector board sizes every name for one cell: up to 12px before the widest member count (else before the RS
  // figure), minus the magnifier's slot when any row is lit — so a lit name, however long, keeps its magnifier
  // (worker C, 2026-10-06: the longest lit name lost it). Same rule for every row, so the names share their sizes.
  const membersW = sector && shows('members') ? Math.max(...rows.map((r) => (r.members == null ? 1 : String(r.members).length))) * SIZE.num * MONO : 0;
  const nameRight = membersW ? XS.members - membersW - 12 : XS.rsNum - 2 * SIZE.rs * MONO - 12;
  const nameCell = Math.min(XS.nameMax, nameRight - (rows.some((r) => r.focus) ? LENS_SPAN + 8 : 0)) - XS.name;
  const sigColor = signalKind === 'breakout' ? COLORS.up : signalKind === 'breakdown' ? COLORS.down : COLORS.gold;

  // Timeline, in frames from the scene's start: rows land top-down, then the focus rows get their mark.
  const rowStart = (k: number) => 12 + 4 * k;
  const landed = rowStart(n - 1) + 24;
  const order = rows.map((r, k) => (r.focus ? rows.slice(0, k).filter((x) => x.focus).length : -1));
  const nFocus = order.filter((i) => i >= 0).length;
  const markIn = (k: number) => (order[k] < 0 ? 0 : ramp(frame, landed + 4 * order[k], landed + 4 * order[k] + 14, easeOut));

  // The emphasis on screen: the latest whose beat has begun. A one-beat scene plays it once the marks are in.
  const startOf = (e: BoardEmphasis) => (e.beat < beatStarts.length ? beatStarts[e.beat] : landed + 4 * nFocus + 36);
  const live = emphasis.filter((e) => e.beat >= 1 && frame >= startOf(e)).sort((a, b) => startOf(a) - startOf(b));
  const active = live.length ? live[live.length - 1] : null;
  const S0 = active ? startOf(active) : Infinity;
  const p = active ? ramp(frame, S0, S0 + 16, easeInOut) : 0;
  // The caption leaves before the plate arrives in the same spot, so the two never sit half-visible on each other.
  const capOut = active?.label ? ramp(frame, S0, S0 + 7, easeInOut) : 0;
  const plateIn = active?.label ? ramp(frame, S0 + 6, S0 + 20, easeOut) : 0;
  const lighting = active?.set === 'focus';
  /** When focus row k starts lighting up (frames from the scene's start): top-down, 8 frames apart. */
  const litAt = (k: number) => S0 + 6 + 8 * order[k];

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

  const rowEls = rows.map((r, k) => {
    const y = top0 + k * rowH;
    const mid = y + rowH / 2;
    const e = ramp(frame, rowStart(k), rowStart(k) + 18, easeOut);
    const grow = ramp(frame, rowStart(k) + 6, rowStart(k) + 34, easeOut);
    const isFocus = !!r.focus;
    const dim = active?.dim && !(lighting && isFocus) ? 1 - (1 - DIMMED) * p : 1;
    const g = pillOf(pillValue(r), sector ? XS.week : X.change);
    const pillX = g.x;
    const rsBar0 = sector ? XS.rsBar0 : X.rsBar0;
    const rsBar1 = sector ? XS.rsBar1 : X.rsBar1;
    const barW = (rsBar1 - rsBar0) * Math.min(1, Math.max(0, r.rs1m / RS_MAX)) * grow;

    // Focus: the mark from beat 1, then the light-up on the emphasis beat.
    const mark = isFocus ? markIn(k) : 0;
    const lit = isFocus && lighting;
    const t0 = lit ? litAt(k) : 0;
    const sweep = lit ? ramp(frame, t0, t0 + 14, easeInOut) : 0;
    const ringP = lit ? ramp(frame, t0 + 4, t0 + 22, easeInOut) : 0;
    const popS = lit ? spring({frame: frame - (t0 + 2), fps, config: {damping: 11, mass: 0.6, stiffness: 150}}) : 0;
    const lensS = lit ? spring({frame: frame - (t0 + 9), fps, config: {damping: 10, mass: 0.5, stiffness: 160}}) : 0;
    const gold = lit ? ramp(frame, t0 + 2, t0 + 14, easeInOut) : 0;
    // A slow breath once the row is lit: deterministic in the frame, small enough to read as light, not blinking.
    const breath = lit && frame > t0 + 24 ? 0.5 + 0.5 * Math.sin(((frame - t0 - 24) / 54) * 2 * Math.PI - Math.PI / 2) : 0;
    const ring = 2 * (W - 16 + rowH - 2);
    const tickerFill = gold > 0 ? interpolateColors(gold, [0, 1], [COLORS.white, COLORS.gold]) : COLORS.white;
    const rankFill = gold > 0 ? interpolateColors(gold, [0, 1], [COLORS.faint, COLORS.gold]) : COLORS.faint;

    const focusDeco = isFocus ? (
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
        <g key={r.key} opacity={e * dim} transform={`translate(${(1 - e) * -24} 0)`}>
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
    if (isFocus) {
      const right = X.ticker + tickerWidth(r.label) * (1 + POP);
      const priceW = shows('price') && r.price != null ? fmtPrice(r.price).length * SIZE.num * MONO : 0;
      const nextLeft = priceW ? X.price - priceW : pillCol ? pillX : X.rsNum - 2 * SIZE.rs * MONO;
      const avail = nextLeft - 12 - (right + 8);
      const fit = Math.min(1, avail / LENS_SPAN);
      if (fit >= 0.6) lens = {cx: right + 8 + (LENS + 5) * fit + Math.min(6, Math.max(0, avail - LENS_SPAN * fit) / 2), s: fit};
    }

    return (
      <g key={r.key} opacity={e * dim} transform={`translate(${(1 - e) * -24} 0)`}>
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
        <text x={X.rsNum} y={base(mid, SIZE.rs)} textAnchor="end" {...num} fontWeight={700} fontSize={SIZE.rs} fill={COLORS.white}>
          {r.rs1m}
        </text>
        <rect x={X.rsBar0} y={mid - BAR_H / 2} width={X.rsBar1 - X.rsBar0} height={BAR_H} rx={BAR_H / 2} fill={COLORS.white} fillOpacity={0.07} />
        <path d={barPath(X.rsBar0, mid - BAR_H / 2, barW, BAR_H)} fill={COLORS.signal} />
        {extras.map((c, i) => {
          if (c === 'signal') return signalPill(r, X.extra[i], mid);
          const t = EXTRA[c].text(r);
          return (
            <text key={c} x={X.extra[i]} y={base(mid, SIZE.extra)} textAnchor="end" {...num} fontWeight={500} fontSize={SIZE.extra} fill={t == null ? COLORS.faint : COLORS.inkSecondary}>
              {t ?? '—'}
            </text>
          );
        })}
        {separator}
      </g>
    );
  });

  // Footer: the caption on the left; the emphasis plate takes its place on its beat.
  const footBase = FOOT_Y + 36;
  const capAdv = SIZE.foot * MONO + 1.2;
  const capMax = Math.max(0, Math.floor((W - 2 * PAD) / capAdv));
  const cap = caption && caption.length > capMax ? `${caption.slice(0, Math.max(0, capMax - 1)).trimEnd()}…` : caption;
  const plate = active?.label ?? null;
  const plateW = plate ? plate.length * (SIZE.plate * MONO + 1) + 28 : 0;

  const heads = sector ? (
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
      {head(X.rsNum - 2 * SIZE.rs * MONO, 'RS 1M', 'start')}
      {extras.map((c, i) => head(X.extra[i], EXTRA[c].main, 'end', c === 'signal' && signalKind ? signalKind.toUpperCase() : EXTRA[c].top))}
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
          {heads}
          <line x1={PAD} x2={W - PAD} y1={RULE_Y} y2={RULE_Y} stroke={COLORS.hairline} strokeWidth={1} />
        </g>
        {rowEls}
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
