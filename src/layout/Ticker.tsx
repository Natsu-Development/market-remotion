import React from 'react';
import {useCurrentFrame} from 'remotion';
import {FONTS} from '../fonts';
import {COLORS, LAYOUT} from '../theme';
import {enter} from '../lib/anim';

export type Market = {
  symbol: string;
  timeframe: string;
  /** Latest close and the close before it, in index points. */
  last: number;
  prev: number;
  /** "2026-09" -> "T9/2026"; a session "2026-09-22" -> "22/9/2026". */
  asOf: string;
};

/** 1878 -> "1.878", 2.85 -> "2,85": Vietnamese digit grouping. */
export const fmtInt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const fmtPct = (n: number) => `${Math.abs(n).toFixed(2).replace('.', ',')}%`;
export const fmtMonth = (t: string) => {
  const [y, m] = t.split('-');
  return `T${Number(m)}/${y}`;
};
const fmtAsOf = (t: string) => {
  const [y, m, d] = t.split('-');
  return d ? `${Number(d)}/${Number(m)}/${y}` : fmtMonth(t);
};

/** Direction glyph drawn, not typed: ▲/▼ are absent from some subsets and fall back. */
const Arrow: React.FC<{up: boolean; color: string; size: number}> = ({up, color, size}) => (
  <svg width={size} height={size} viewBox="0 0 10 10" style={{display: 'block'}}>
    <path d={up ? 'M5 1.5 9 8.5H1z' : 'M5 8.5 1 1.5h8z'} fill={color} />
  </svg>
);

/**
 * The market-context strip above the eyebrow: what is being charted, where it
 * closed, how the last bar moved, and how fresh the data is. It is the same row
 * on every scene, which is what makes the reel read as a finance channel
 * rather than a slideshow — the viewer never loses the instrument.
 */
export const Ticker: React.FC<{market: Market}> = ({market}) => {
  const frame = useCurrentFrame();
  const change = ((market.last - market.prev) / market.prev) * 100;
  const up = change >= 0;
  const dir = up ? COLORS.up : COLORS.down;
  const H = LAYOUT.header;

  return (
    <div
      style={{
        position: 'absolute',
        left: H.x,
        top: H.baseline - H.fontSize,
        width: LAYOUT.headline.maxWidth,
        height: H.fontSize * 1.3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: FONTS.mono,
        fontSize: H.fontSize,
        letterSpacing: H.letterSpacing,
        color: COLORS.muted,
        whiteSpace: 'nowrap',
        ...enter(frame, {delay: 2, duration: 18, rise: 10}),
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 22}}>
        <span style={{color: COLORS.white, fontWeight: 700}}>{market.symbol}</span>
        <span>{market.timeframe}</span>
        <span style={{color: COLORS.white, fontWeight: 700, letterSpacing: 0.5}}>{fmtInt(market.last)}</span>
        <span style={{display: 'flex', alignItems: 'center', gap: 8, color: dir, fontWeight: 700, letterSpacing: 0.5}}>
          <Arrow up={up} color={dir} size={H.fontSize * 0.6} />
          {fmtPct(change)}
        </span>
      </div>
      <span>{fmtAsOf(market.asOf)}</span>
    </div>
  );
};
