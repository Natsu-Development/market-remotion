import React from 'react';
import {interpolateColors, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT} from '../theme';
import {easeInOut, easeOut, pop, ramp} from '../lib/anim';
import type {BoardEmphasis, MoverColumn, Visual} from '../types';

const W = LAYOUT.panel.width;
const H = LAYOUT.panel.height;
const PAD = 22;
const GAP = 28;
const COL_W = (W - PAD * 2 - GAP) / 2;
const HEADER_Y = 52;
const ROWS_TOP = 88;
const CAPTION_Y = H - 18;
/** Up to five rows a column get the two-line row; more get the one-line row (user 2026-10-01: ten a column). */
const LOOSE_ROWS = 5;
const LOOSE_ROW_H = 82;
const MAX_ROWS = 10;

/** The focus look, as on the filter boards (FilterBoard.tsx): how far a lit ticker grows, the lens, the dimmed rows. */
const POP = 0.12;
const LENS = 10;
const DIMMED = 0.32;
/** How far a row's gold band and outline reach past its column, each side. */
const BAND_OUT = 10;
const PLATE = 17;
/** JetBrains Mono advances 0.6 em per glyph — the plate is sized from it. */
const MONO = 0.6;

const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2).replace('.', ',')}%`;
const times = (v: number) => `×${v.toFixed(2).replace('.', ',')}`;
/** Volume against its 20-session average in whole percent, the terminal's VOL/SMA: +92 → "+92%". */
const vsAvg = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}%`;
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/**
 * A ticker's width at Be Vietnam Pro 800, from per-glyph classes: a deterministic estimate that errs wide (a browser
 * measurement can run before the font has loaded). Measured on the 2026-10-06 stills: "DGW" at 24px is 64px of ink,
 * the classes give 68. Only the magnifier's place depends on it.
 */
const glyphEm = (c: string) => (/[WM]/.test(c) ? 1.12 : /[IJ1]/.test(c) ? 0.4 : /[EFLTSZ]/.test(c) ? 0.74 : /[0-9]/.test(c) ? 0.7 : 0.86);
const tickerWidth = (symbol: string, size: number) =>
  [...symbol].reduce((w, c) => w + glyphEm(c) * size, 0) + Math.max(0, symbol.length - 1) * 0.5;

/** The magnifier of a lit row, drawn (a glyph would fall back to another font): lens, glint, handle. */
const Magnifier: React.FC<{cx: number; cy: number; s: number; rot: number; opacity: number}> = ({cx, cy, s, rot, opacity}) => (
  <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`} opacity={opacity}>
    <circle r={LENS + 5} fill={COLORS.gold} fillOpacity={0.16} />
    <circle r={LENS} fill={COLORS.plot} stroke={COLORS.gold} strokeWidth={3.2} />
    <path d={`M${-LENS * 0.5} ${-LENS * 0.15} A${LENS * 0.55} ${LENS * 0.55} 0 0 1 ${-LENS * 0.1} ${-LENS * 0.52}`} fill="none" stroke={COLORS.gold} strokeWidth={2} strokeLinecap="round" opacity={0.8} />
    <line x1={LENS * 0.72} y1={LENS * 0.72} x2={LENS * 1.55} y2={LENS * 1.55} stroke={COLORS.gold} strokeWidth={4.4} strokeLinecap="round" />
  </g>
);

type Props = Extract<Visual, {type: 'movers'}> & {beatIndex: number; beatFrame: number; beatStarts: number[]};

/**
 * Two ranked columns side by side. Each row: rank, ticker, and the column's metric — the session's
 * change coloured by direction with the volume under it (`metric: 'change'`, the Volume spike board;
 * user 2026-09-30) as % of its 20-session average when the row has `volumeVsSma20Percent` ("KL +92%",
 * user 2026-10-01 evening), else as a ratio ("KL ×1,92"), or the RS 1M rating with the change under it (`metric: 'rs'`, the RS Strong
 * and Uptrend boards; user 2026-10-01). Up to five rows a column keep the two-line row; six to ten
 * rows switch to a one-line row so a whole filter fits (user 2026-10-01: "each column have 10
 * symbols"). The left column fills in beat 1, the right one when beat 2 starts (or right after the
 * left in a one-beat scene).
 *
 * Focus (user 2026-10-06: "With the volumn spike also have the animation with this scene for me highlight the symbol
 * must noted" — the same as the RS Strong and Uptrend boards): a row marked `focus` (a name the reel reviews next) gets
 * a gold mark at its left edge once it lands; on the `emphasis` beat the other rows dim and the focus rows light up one
 * after another, left column first, top-down — a gold band sweeps across the row, an outline is drawn round it, the
 * ticker grows and turns gold, a magnifier pops in after it; then band and outline breathe slowly. The plate saying it
 * ("XEM KỸ: DGW") takes the caption's place.
 */
export const Movers: React.FC<Props> = ({caption, left, right, emphasis = [], beatIndex, beatStarts}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const twoBeats = beatStarts.length >= 2;
  // Frames since the right column began: from beat 2's start, so a third beat (the emphasis) does not replay it.
  const rightFrame = twoBeats ? (beatIndex >= 1 ? frame - beatStarts[1] : -1) : frame - 26;
  const n = Math.min(MAX_ROWS, Math.max(left.rows.length, right?.rows.length ?? 0, 1));
  const dense = n > LOOSE_ROWS;
  const rowH = dense ? Math.floor((CAPTION_Y - 30 - ROWS_TOP) / n) : LOOSE_ROW_H;
  const rowsBottom = ROWS_TOP + rowH * n;
  const step = dense ? 3 : 5;

  // The emphasis on screen: the latest whose beat has begun (a one-beat scene plays it once both columns are in).
  const startOf = (e: BoardEmphasis) => (e.beat < beatStarts.length ? beatStarts[e.beat] : 26 + 4 + step * n + 60);
  const live = emphasis.filter((e) => e.beat >= 1 && frame >= startOf(e)).sort((a, b) => startOf(a) - startOf(b));
  const active = live.length ? live[live.length - 1] : null;
  const S0 = active ? startOf(active) : Infinity;
  const p = active ? ramp(frame, S0, S0 + 16, easeInOut) : 0;
  const lighting = active?.set === 'focus';
  // The caption leaves before the plate arrives in the same spot, so the two never sit half-visible on each other.
  const capOut = active?.label ? ramp(frame, S0, S0 + 7, easeInOut) : 0;
  const plateIn = active?.label ? ramp(frame, S0 + 6, S0 + 20, easeOut) : 0;
  // Light-up order: the left column's focus rows top-down, then the right column's, 8 frames apart.
  const leftRows = left.rows.slice(0, MAX_ROWS);
  const rightRows = (right?.rows ?? []).slice(0, MAX_ROWS);
  const litOrder = [...leftRows.filter((r) => r.focus).map((r) => `L:${r.symbol}`), ...rightRows.filter((r) => r.focus).map((r) => `R:${r.symbol}`)];

  const column = (col: MoverColumn, x: number, t: number, key: 'L' | 'R') => {
    const head = col.accent ? accentColor(col.accent) : COLORS.muted;
    const rows = col.rows.slice(0, MAX_ROWS);
    const metric = col.metric ?? 'change';
    const rank = (k: number) => String((col.startRank ?? 1) + k).padStart(2, '0');
    return (
      <g key={key}>
        <text x={x} y={HEADER_Y} fontFamily={FONTS.mono} fontSize={19} fill={head} letterSpacing={1.4}>
          {col.title}
        </text>
        <line x1={x} x2={x + COL_W} y1={HEADER_Y + 14} y2={HEADER_Y + 14} stroke={COLORS.hairline} strokeWidth={1} />
        {rows.map((r, k) => {
          const s = t < 0 ? 0 : Math.min(1, pop(t, fps, 4 + k * step));
          const y = ROWS_TOP + k * rowH;
          const dir = r.changePercent > 0 ? COLORS.up : r.changePercent < 0 ? COLORS.down : COLORS.muted;
          const big = metric === 'rs' && r.rs1m != null ? String(r.rs1m) : pct(r.changePercent);
          const bigFill = metric === 'rs' && r.rs1m != null ? COLORS.white : dir;
          const small = metric === 'rs'
            ? pct(r.changePercent)
            : r.volumeVsSma20Percent != null
              ? `KL ${vsAvg(r.volumeVsSma20Percent)}`
              : r.volumeRatio != null
                ? `KL ${times(r.volumeRatio)}`
                : '';
          const smallFill = metric === 'rs' ? dir : COLORS.muted;
          const shift = `translate(${(1 - s) * (x < W / 2 ? -14 : 14)} 0)`;

          // Focus: the mark once the row has landed, then the light-up on the emphasis beat.
          const isFocus = !!r.focus;
          const dim = active?.dim && !(lighting && isFocus) ? 1 - (1 - DIMMED) * p : 1;
          const landed = 4 + k * step + 10;
          const mark = isFocus && t >= 0 ? ramp(t, landed, landed + 14, easeOut) : 0;
          const lit = isFocus && lighting;
          const t0 = lit ? S0 + 6 + 8 * Math.max(0, litOrder.indexOf(`${key}:${r.symbol}`)) : 0;
          const sweep = lit ? ramp(frame, t0, t0 + 14, easeInOut) : 0;
          const ringP = lit ? ramp(frame, t0 + 4, t0 + 22, easeInOut) : 0;
          const popS = lit ? spring({frame: frame - (t0 + 2), fps, config: {damping: 11, mass: 0.6, stiffness: 150}}) : 0;
          const lensS = lit ? spring({frame: frame - (t0 + 9), fps, config: {damping: 10, mass: 0.5, stiffness: 160}}) : 0;
          const gold = lit ? ramp(frame, t0 + 2, t0 + 14, easeInOut) : 0;
          // A slow breath once the row is lit: deterministic in the frame, small enough to read as light, not blinking.
          const breath = lit && frame > t0 + 24 ? 0.5 + 0.5 * Math.sin(((frame - t0 - 24) / 54) * 2 * Math.PI - Math.PI / 2) : 0;
          const tickerFill = gold > 0 ? interpolateColors(gold, [0, 1], [COLORS.white, COLORS.gold]) : COLORS.white;
          const rankFill = gold > 0 ? interpolateColors(gold, [0, 1], [COLORS.faint, COLORS.gold]) : COLORS.faint;

          // The row's box (a dense row is one line; a loose row's rule sits 8px above the next row).
          const boxY = y + 2;
          const boxH = dense ? rowH - 4 : rowH - 12;
          const boxX = x - BAND_OUT;
          const boxW = COL_W + BAND_OUT * 2;
          const perimeter = 2 * (boxW + boxH);
          const tickerX = x + (dense ? 30 : 34);
          const tickerSize = dense ? 24 : 32;
          const tickerY = dense ? y + rowH * 0.68 : y + 36;
          const scale = 1 + POP * popS;
          const lensScale = dense ? Math.min(0.85, (rowH - 8) / (2 * (LENS + 5))) : 1;
          const lensX = tickerX + tickerWidth(r.symbol, tickerSize) * (1 + POP) + 8 + (LENS + 5) * lensScale;
          const lensY = tickerY - tickerSize * 0.36;

          const focusDeco = isFocus ? (
            <g>
              <rect x={boxX} y={boxY} width={boxW * sweep} height={boxH} rx={8} fill={COLORS.gold} fillOpacity={0.15 + 0.05 * breath} />
              <rect x={boxX} y={boxY + 3 - 2 * sweep} width={4 + sweep} height={boxH - 6 + 4 * sweep} rx={2.5} fill={COLORS.gold} opacity={Math.max(0.6 * mark, sweep)} />
              {ringP > 0 ? (
                <g>
                  <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={10} fill="none" stroke={COLORS.gold} strokeWidth={6} opacity={(0.16 + 0.14 * breath) * ringP} filter="url(#mv-glow)" />
                  <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={10} fill="none" stroke={COLORS.gold} strokeOpacity={0.85} strokeWidth={2} strokeDasharray={perimeter} strokeDashoffset={perimeter * (1 - ringP)} />
                </g>
              ) : null}
            </g>
          ) : null;
          const tickerEl = (
            <g transform={scale !== 1 ? `translate(${tickerX} ${tickerY}) scale(${scale}) translate(${-tickerX} ${-tickerY})` : undefined}>
              <text x={tickerX} y={tickerY} fontFamily={FONTS.display} fontWeight={800} fontSize={tickerSize} fill={tickerFill} letterSpacing={0.5}>
                {r.symbol}
              </text>
            </g>
          );
          const lensEl = lit && lensS > 0.001
            ? <Magnifier cx={lensX} cy={lensY} s={lensScale * Math.max(0, lensS)} rot={-24 * (1 - Math.min(1, lensS))} opacity={Math.min(1, lensS * 1.4)} />
            : null;

          if (dense) {
            // One line: rank · ticker · small metric · big metric, baseline near the row's middle.
            const base = y + rowH * 0.68;
            return (
              <g key={r.symbol} opacity={s * dim} transform={shift}>
                {focusDeco}
                <text x={x} y={base} fontFamily={FONTS.mono} fontSize={13} fill={rankFill}>
                  {rank(k)}
                </text>
                {tickerEl}
                {lensEl}
                {small ? (
                  <text x={x + COL_W - 112} y={base} textAnchor="end" fontFamily={FONTS.mono} fontSize={14} fill={smallFill} style={{fontVariantNumeric: 'tabular-nums'}}>
                    {small}
                  </text>
                ) : null}
                <text x={x + COL_W} y={base} textAnchor="end" fontFamily={FONTS.mono} fontWeight={700} fontSize={22} fill={bigFill} style={{fontVariantNumeric: 'tabular-nums'}}>
                  {big}
                </text>
                {k < rows.length - 1 ? (
                  <line x1={x} x2={x + COL_W} y1={y + rowH - 1} y2={y + rowH - 1} stroke={COLORS.hairline} strokeWidth={1} />
                ) : null}
              </g>
            );
          }
          return (
            <g key={r.symbol} opacity={s * dim} transform={shift}>
              {focusDeco}
              <text x={x} y={y + 34} fontFamily={FONTS.mono} fontSize={16} fill={rankFill}>
                {rank(k)}
              </text>
              {tickerEl}
              {lensEl}
              {r.name ? (
                <text x={x + 34} y={y + 60} fontFamily={FONTS.text} fontSize={15} fill={COLORS.muted}>
                  {trunc(r.name, 26)}
                </text>
              ) : null}
              <text x={x + COL_W} y={y + 36} textAnchor="end" fontFamily={FONTS.mono} fontWeight={700} fontSize={28} fill={bigFill} style={{fontVariantNumeric: 'tabular-nums'}}>
                {big}
              </text>
              {small ? (
                <text x={x + COL_W} y={y + 60} textAnchor="end" fontFamily={FONTS.mono} fontSize={15} fill={smallFill} style={{fontVariantNumeric: 'tabular-nums'}}>
                  {small}
                </text>
              ) : null}
              {k < rows.length - 1 ? (
                <line x1={x} x2={x + COL_W} y1={y + rowH - 8} y2={y + rowH - 8} stroke={COLORS.hairline} strokeWidth={1} />
              ) : null}
            </g>
          );
        })}
      </g>
    );
  };

  const plate = active?.label ? active.label.toUpperCase() : null;
  const plateW = plate ? plate.length * (PLATE * MONO + 1) + 28 : 0;

  return (
    <Panel tint="rgba(2, 4, 8, 0.55)">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <filter id="mv-glow" x="-5%" y="-60%" width="110%" height="220%">
            <feGaussianBlur stdDeviation={5} />
          </filter>
        </defs>
        {column(left, PAD, frame, 'L')}
        <line x1={W / 2} x2={W / 2} y1={HEADER_Y - 16} y2={rowsBottom - (dense ? 2 : 12)} stroke={COLORS.hairline} strokeWidth={1} />
        {right ? column(right, PAD + COL_W + GAP, rightFrame, 'R') : null}
        {caption ? (
          <text x={W / 2} y={CAPTION_Y} textAnchor="middle" fontFamily={FONTS.mono} fontSize={16} fill={COLORS.inkMuted} letterSpacing={1.2} opacity={1 - capOut}>
            {caption}
          </text>
        ) : null}
        {plate ? (
          <g opacity={plateIn} transform={`translate(0 ${(1 - plateIn) * 8})`}>
            <rect x={(W - plateW) / 2} y={CAPTION_Y - 23} width={plateW} height={32} rx={6} fill={COLORS.plot} stroke={COLORS.gold} strokeOpacity={0.55} strokeWidth={1.4} />
            <text x={W / 2} y={CAPTION_Y} textAnchor="middle" fontFamily={FONTS.mono} fontWeight={700} fontSize={PLATE} fill={COLORS.gold} letterSpacing={1}>
              {plate}
            </text>
          </g>
        ) : null}
      </svg>
    </Panel>
  );
};
