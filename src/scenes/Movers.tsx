import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT} from '../theme';
import {pop} from '../lib/anim';
import type {MoverColumn, Visual} from '../types';

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

const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2).replace('.', ',')}%`;
const times = (v: number) => `×${v.toFixed(2).replace('.', ',')}`;
/** Volume against its 20-session average in whole percent, the terminal's VOL/SMA: +92 → "+92%". */
const vsAvg = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}%`;
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

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
 */
export const Movers: React.FC<Props> = ({caption, left, right, beatIndex, beatFrame, beatStarts}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const twoBeats = beatStarts.length >= 2;
  const rightFrame = twoBeats ? (beatIndex >= 1 ? beatFrame : -1) : frame - 26;
  const n = Math.min(MAX_ROWS, Math.max(left.rows.length, right?.rows.length ?? 0, 1));
  const dense = n > LOOSE_ROWS;
  const rowH = dense ? Math.floor((CAPTION_Y - 30 - ROWS_TOP) / n) : LOOSE_ROW_H;
  const rowsBottom = ROWS_TOP + rowH * n;

  const column = (col: MoverColumn, x: number, t: number, key: string) => {
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
          const s = t < 0 ? 0 : Math.min(1, pop(t, fps, 4 + k * (dense ? 3 : 5)));
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
          if (dense) {
            // One line: rank · ticker · small metric · big metric, baseline near the row's middle.
            const base = y + rowH * 0.68;
            return (
              <g key={r.symbol} opacity={s} transform={shift}>
                <text x={x} y={base} fontFamily={FONTS.mono} fontSize={13} fill={COLORS.faint}>
                  {rank(k)}
                </text>
                <text x={x + 30} y={base} fontFamily={FONTS.display} fontWeight={800} fontSize={24} fill={COLORS.white} letterSpacing={0.5}>
                  {r.symbol}
                </text>
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
            <g key={r.symbol} opacity={s} transform={shift}>
              <text x={x} y={y + 34} fontFamily={FONTS.mono} fontSize={16} fill={COLORS.faint}>
                {rank(k)}
              </text>
              <text x={x + 34} y={y + 36} fontFamily={FONTS.display} fontWeight={800} fontSize={32} fill={COLORS.white} letterSpacing={0.5}>
                {r.symbol}
              </text>
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

  return (
    <Panel tint="rgba(2, 4, 8, 0.55)">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {column(left, PAD, frame, 'left')}
        <line x1={W / 2} x2={W / 2} y1={HEADER_Y - 16} y2={rowsBottom - (dense ? 2 : 12)} stroke={COLORS.hairline} strokeWidth={1} />
        {column(right, PAD + COL_W + GAP, rightFrame, 'right')}
        {caption ? (
          <text x={W / 2} y={CAPTION_Y} textAnchor="middle" fontFamily={FONTS.mono} fontSize={16} fill={COLORS.inkMuted} letterSpacing={1.2}>
            {caption}
          </text>
        ) : null}
      </svg>
    </Panel>
  );
};
