import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT, type AccentName} from '../theme';
import {CANDLES, FIRST, LAST, monthIndex} from '../lib/series';
import {rsi} from '../lib/indicators';
import {pop, ramp} from '../lib/anim';
import type {Visual} from '../types';

const W = LAYOUT.panel.width;
const H = LAYOUT.panel.height;
const PAD = 22;

/** Price rides in the upper pane, the oscillator below it — the standard layout. */
const PRICE_TOP = 92;
const PRICE_BOTTOM = 248;
const RSI_TOP = 286;
const RSI_BOTTOM = 468;
const HEADER_Y = 62;
const AXIS_Y = 502;
const FOOTER_Y = 530;

const OVERBOUGHT = 70;
const OVERSOLD = 30;

const PERIOD = 14;
const SERIES = rsi(CANDLES.map((c) => c.c), PERIOD);
/** First bar with a reading — everything before it is undefined, not zero. */
const START = CANDLES.findIndex((_, k) => SERIES[k] != null);

const x = (i: number) => PAD + ((i - FIRST) / (LAST - FIRST)) * (W - PAD * 2);
/** The oscillator is bounded 0-100, so its scale is fixed rather than fitted. */
const yr = (v: number) => RSI_BOTTOM - (v / 100) * (RSI_BOTTOM - RSI_TOP);

const priceLo = Math.min(...CANDLES.map((c) => c.c));
const priceHi = Math.max(...CANDLES.map((c) => c.c));
const logSpan = Math.log(priceHi) - Math.log(priceLo);
const yp = (p: number) =>
  PRICE_TOP + ((Math.log(priceHi) - Math.log(p)) / logSpan) * (PRICE_BOTTOM - PRICE_TOP) * 0.94 + 6;

const barAt = (month: string) => {
  const i = CANDLES.findIndex((c) => c.t === month);
  return i < 0 ? null : {...CANDLES[i], k: i, rsi: SERIES[i] ?? 0};
};

type Props = Extract<Visual, {type: 'rsi'}> & {beatIndex: number};

export const RsiChart: React.FC<Props> = ({
  caption,
  note,
  highlightZone,
  marks = [],
  divergence,
  beatIndex,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const draw = ramp(frame, 10, 56);
  const drawnUpTo = FIRST + (LAST - FIRST) * draw;
  const zone = highlightZone ? ramp(frame, 40, 64) : 0;

  const path = (project: (k: number) => number, from = 0) =>
    CANDLES.slice(from)
      .map((c, n) => `${n === 0 ? 'M' : 'L'}${x(c.i).toFixed(1)},${project(from + n).toFixed(1)}`)
      .join(' ');

  const div = divergence
    ? {a: barAt(divergence.from), b: barAt(divergence.to)}
    : null;

  return (
    <Panel tint="rgba(2, 4, 8, 0.55)">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <clipPath id="rsiClip">
            <rect x={0} y={0} width={PAD + (W - PAD * 2) * draw} height={RSI_BOTTOM + 4} />
          </clipPath>
        </defs>

        <text x={PAD} y={HEADER_Y} fontFamily={FONTS.mono} fontSize={19} fill="rgba(255,255,255,0.55)" letterSpacing={1.4}>
          RSI ({PERIOD}) · KHUNG THÁNG
        </text>

        {/* Overbought / oversold band, shaded when the scene is about it. */}
        {highlightZone ? (
          <rect
            x={PAD}
            y={highlightZone === 'overbought' ? yr(100) : yr(OVERSOLD)}
            width={W - PAD * 2}
            height={
              highlightZone === 'overbought' ? yr(OVERBOUGHT) - yr(100) : yr(0) - yr(OVERSOLD)
            }
            fill={highlightZone === 'overbought' ? COLORS.down : COLORS.up}
            opacity={0.12 * zone}
          />
        ) : null}

        <g clipPath="url(#rsiClip)">
          <path d={path((k) => yp(CANDLES[k].c))} fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth={1.8} />
          <path
            d={path((k) => yr(SERIES[k] ?? 50), START)}
            fill="none"
            stroke={COLORS.gold}
            strokeWidth={2}
          />
        </g>

        {/* The two thresholds, plus the midline. */}
        {[
          {v: OVERBOUGHT, c: COLORS.red, dash: '7 6'},
          {v: 50, c: 'rgba(255,255,255,0.16)', dash: '2 6'},
          {v: OVERSOLD, c: COLORS.green, dash: '7 6'},
        ].map((line) => (
          <g key={line.v}>
            <line
              x1={PAD}
              y1={yr(line.v)}
              x2={W - PAD}
              y2={yr(line.v)}
              stroke={line.c}
              strokeWidth={1.2}
              strokeDasharray={line.dash}
              opacity={0.85}
            />
            {line.v === 50 ? null : (
              <text
                x={PAD + 4}
                y={yr(line.v) - 7}
                fontFamily={FONTS.mono}
                fontSize={16}
                fill={line.c}
              >
                {line.v}
              </text>
            )}
          </g>
        ))}

        {/* Readings the scene calls out. */}
        {marks.map((m, k) => {
          const bar = barAt(m.month);
          if (!bar) return null;
          const s = pop(frame, fps, 58 + k * 12);
          const colour = accentColor(m.accent);
          return (
            <g key={m.month} opacity={Math.min(1, s)}>
              <circle cx={x(bar.i)} cy={yr(bar.rsi)} r={6 * Math.min(1, s)} fill={colour} />
              <text
                x={x(bar.i)}
                y={yr(bar.rsi) - 16}
                textAnchor="middle"
                fontFamily={FONTS.mono}
                fontWeight={700}
                fontSize={19}
                fill={colour}
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Price makes a higher high while the oscillator does not. */}
        {div?.a && div.b ? (
          <g opacity={beatIndex >= 1 ? ramp(frame, 6, 26) : 0}>
            <line
              x1={x(div.a.i)} y1={yp(div.a.c)} x2={x(div.b.i)} y2={yp(div.b.c)}
              stroke={COLORS.green} strokeWidth={2} />
            <line
              x1={x(div.a.i)} y1={yr(div.a.rsi)} x2={x(div.b.i)} y2={yr(div.b.rsi)}
              stroke={COLORS.red} strokeWidth={2} />
            {[div.a, div.b].map((b) => (
              <g key={b.t}>
                <circle cx={x(b.i)} cy={yp(b.c)} r={4.5} fill={COLORS.green} />
                <circle cx={x(b.i)} cy={yr(b.rsi)} r={4.5} fill={COLORS.red} />
              </g>
            ))}
            <text
              x={(x(div.a.i) + x(div.b.i)) / 2}
              y={(yr(div.a.rsi) + yr(div.b.rsi)) / 2 + 26}
              textAnchor="middle"
              fontFamily={FONTS.mono}
              fontWeight={700}
              fontSize={19}
              fill={COLORS.red}
            >
              {divergence?.label}
            </text>
          </g>
        ) : null}

        <line x1={PAD} y1={AXIS_Y - 20} x2={W - PAD} y2={AXIS_Y - 20} stroke="rgba(255,255,255,0.09)" strokeWidth={1} />

        {['2014', '2018', '2022', '2026'].map((yr2) => {
          const i = monthIndex(`${yr2}-06`);
          if (i < FIRST || i > LAST) return null;
          return (
            <text
              key={yr2}
              x={x(i)}
              y={AXIS_Y}
              textAnchor="middle"
              fontFamily={FONTS.mono}
              fontSize={17}
              fill={COLORS.faint}
            >
              {yr2}
            </text>
          );
        })}

        {note ? (
          // Ends left of the last year tick so the two never overlap.
          <text
            x={W - PAD - 64}
            y={RSI_BOTTOM + 22}
            textAnchor="end"
            fontFamily={FONTS.mono}
            fontWeight={700}
            fontSize={18}
            fill={COLORS.gold}
            opacity={ramp(frame, 46, 68)}
          >
            {note}
          </text>
        ) : null}

        <text x={PAD} y={FOOTER_Y} fontFamily={FONTS.mono} fontSize={17} fill={COLORS.inkMuted} letterSpacing={1.6}>
          {caption ?? 'VNINDEX · RSI 14 · KHUNG THÁNG'}
        </text>
      </svg>
    </Panel>
  );
};
