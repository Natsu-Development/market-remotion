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
const ROW_H = 82;
const CAPTION_Y = H - 18;

const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2).replace('.', ',')}%`;
const times = (v: number) => `×${v.toFixed(2).replace('.', ',')}`;
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

type Props = Extract<Visual, {type: 'movers'}> & {beatIndex: number; beatFrame: number; beatStarts: number[]};

/**
 * Two ranked columns side by side — the session's biggest gainers and losers inside a filter
 * (market-review's Volume spike scene; user 2026-09-30). Each row: rank, ticker, company, the
 * change coloured by direction, the volume ratio under it. The left column fills in beat 1, the
 * right one when beat 2 starts (or right after the left in a one-beat scene).
 */
export const Movers: React.FC<Props> = ({caption, left, right, beatIndex, beatFrame, beatStarts}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const twoBeats = beatStarts.length >= 2;
  const rightFrame = twoBeats ? (beatIndex >= 1 ? beatFrame : -1) : frame - 26;

  const column = (col: MoverColumn, x: number, t: number, key: string) => {
    const head = col.accent ? accentColor(col.accent) : COLORS.muted;
    return (
      <g key={key}>
        <text x={x} y={HEADER_Y} fontFamily={FONTS.mono} fontSize={19} fill={head} letterSpacing={1.4}>
          {col.title}
        </text>
        <line x1={x} x2={x + COL_W} y1={HEADER_Y + 14} y2={HEADER_Y + 14} stroke={COLORS.hairline} strokeWidth={1} />
        {col.rows.slice(0, 5).map((r, k) => {
          const s = t < 0 ? 0 : Math.min(1, pop(t, fps, 4 + k * 5));
          const y = ROWS_TOP + k * ROW_H;
          const dir = r.changePercent > 0 ? COLORS.up : r.changePercent < 0 ? COLORS.down : COLORS.muted;
          return (
            <g key={r.symbol} opacity={s} transform={`translate(${(1 - s) * (x < W / 2 ? -14 : 14)} 0)`}>
              <text x={x} y={y + 34} fontFamily={FONTS.mono} fontSize={16} fill={COLORS.faint}>
                {String(k + 1).padStart(2, '0')}
              </text>
              <text x={x + 34} y={y + 36} fontFamily={FONTS.display} fontWeight={800} fontSize={32} fill={COLORS.white} letterSpacing={0.5}>
                {r.symbol}
              </text>
              {r.name ? (
                <text x={x + 34} y={y + 60} fontFamily={FONTS.text} fontSize={15} fill={COLORS.muted}>
                  {trunc(r.name, 26)}
                </text>
              ) : null}
              <text x={x + COL_W} y={y + 36} textAnchor="end" fontFamily={FONTS.mono} fontWeight={700} fontSize={28} fill={dir} style={{fontVariantNumeric: 'tabular-nums'}}>
                {pct(r.changePercent)}
              </text>
              {r.volumeRatio != null ? (
                <text x={x + COL_W} y={y + 60} textAnchor="end" fontFamily={FONTS.mono} fontSize={15} fill={COLORS.muted}>
                  KL {times(r.volumeRatio)}
                </text>
              ) : null}
              {k < Math.min(col.rows.length, 5) - 1 ? (
                <line x1={x} x2={x + COL_W} y1={y + ROW_H - 8} y2={y + ROW_H - 8} stroke={COLORS.hairline} strokeWidth={1} />
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
        <line x1={W / 2} x2={W / 2} y1={HEADER_Y - 16} y2={ROWS_TOP + ROW_H * 5 - 12} stroke={COLORS.hairline} strokeWidth={1} />
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
