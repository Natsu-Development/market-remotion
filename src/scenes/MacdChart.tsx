import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {COLORS, LAYOUT} from '../theme';
import {CANDLES, FIRST, LAST} from '../lib/series';
import {macd} from '../lib/indicators';
import {pop, ramp} from '../lib/anim';
import type {Visual} from '../types';

const W = LAYOUT.panel.width;
const H = LAYOUT.panel.height;
const PAD = 22;

const PLOT_TOP = 96;
const PLOT_BOTTOM = 344;
const HEADER_Y = 60;
const CAPTION_Y = 408;

const UP = COLORS.up;
const DOWN = COLORS.down;
const SIGNAL = COLORS.signal;

const M = macd(CANDLES.map((c) => c.c));
const SPAN = Math.max(...M.macd.map(Math.abs), ...M.signal.map(Math.abs)) * 1.12;
/** The all-time-high MACD reading the reel points at. */
const PEAK = Math.max(...M.macd);

const x = (i: number) => PAD + ((i - FIRST) / (LAST - FIRST)) * (W - PAD * 2);
const y = (v: number) => PLOT_TOP + ((SPAN - v) / (SPAN * 2)) * (PLOT_BOTTOM - PLOT_TOP);
const step = (W - PAD * 2) / (LAST - FIRST);

/** Last N months get boxed as "the histogram is narrowing". */
const TAIL = 9;

type Props = Extract<Visual, {type: 'macd'}> & {beatIndex: number};

export const MacdChart: React.FC<Props> = ({caption, note, peakLabel, beatIndex}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const draw = ramp(frame, 10, 58);
  const drawnUpTo = FIRST + (LAST - FIRST) * draw;
  const peakLine = ramp(frame, 60, 82);
  // The narrowing callout only appears once the argument turns to it.
  const callout = beatIndex >= 1 ? pop(frame, fps, 6) : 0;

  const path = (values: number[]) =>
    CANDLES.map((c, k) => `${k === 0 ? 'M' : 'L'}${x(c.i).toFixed(1)},${y(values[k]).toFixed(1)}`).join(' ');

  const tailStart = CANDLES.length - TAIL;

  return (
    <Panel tint="rgba(2, 4, 8, 0.55)">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <clipPath id="macdClip">
            <rect x={0} y={PLOT_TOP - 30} width={PAD + (W - PAD * 2) * draw} height={PLOT_BOTTOM - PLOT_TOP + 60} />
          </clipPath>
        </defs>

        <text x={PAD} y={HEADER_Y} fontFamily={FONTS.mono} fontSize={19} fill="rgba(255,255,255,0.55)" letterSpacing={1.4}>
          MACD (12,26,9) · KHUNG THÁNG
        </text>

        <rect x={PAD} y={PLOT_TOP - 26} width={W - PAD * 2} height={PLOT_BOTTOM - PLOT_TOP + 40} fill={COLORS.plot} />

        <g clipPath="url(#macdClip)">
          {CANDLES.map((c, k) => {
            if (c.i > drawnUpTo) return null;
            const h = M.histogram[k];
            const top = h >= 0 ? y(h) : y(0);
            return (
              <rect
                key={c.t}
                x={x(c.i) - step * 0.34}
                y={top}
                width={Math.max(2, step * 0.68)}
                height={Math.max(1, Math.abs(y(h) - y(0)))}
                fill={h >= 0 ? UP : DOWN}
                opacity={0.8}
              />
            );
          })}
          <path d={path(M.signal)} fill="none" stroke={SIGNAL} strokeWidth={2} opacity={0.9} />
          <path d={path(M.macd)} fill="none" stroke={COLORS.white} strokeWidth={1.6} opacity={0.75} />
        </g>

        <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />

        {/* The prior all-time-high reading, as a ceiling. */}
        <g opacity={peakLine}>
          <line
            x1={PAD}
            y1={y(PEAK)}
            x2={PAD + (W - PAD * 2) * peakLine}
            y2={y(PEAK)}
            stroke={COLORS.red}
            strokeWidth={1.4}
            strokeDasharray="7 6"
            opacity={0.85}
          />
          <text x={PAD + 6} y={y(PEAK) - 9} fontFamily={FONTS.mono} fontWeight={700} fontSize={17} fill={COLORS.red}>
            {peakLabel ?? 'LỊCH SỬ MACD'}
          </text>
        </g>

        {/* Narrowing-momentum callout. */}
        <g opacity={callout}>
          <rect
            x={x(CANDLES[tailStart].i) - step}
            y={y(SPAN * 0.42)}
            width={x(LAST) - x(CANDLES[tailStart].i) + step * 2}
            height={y(0) - y(SPAN * 0.42) + 10}
            fill="none"
            stroke={COLORS.gold}
            strokeWidth={1.5}
            rx={4}
          />
          <text
            x={W - PAD}
            y={PLOT_BOTTOM + 4}
            textAnchor="end"
            fontFamily={FONTS.mono}
            fontWeight={700}
            fontSize={19}
            fill={COLORS.gold}
          >
            {note ?? 'histogram thu hẹp ↑'}
          </text>
        </g>
      </svg>
      {caption ? (
        <div
          style={{
            position: 'absolute',
            left: PAD,
            top: CAPTION_Y,
            width: W - PAD * 2,
            fontFamily: FONTS.text,
            fontWeight: 400,
            fontSize: 25,
            lineHeight: 1.4,
            color: 'rgba(255, 255, 255, 0.8)',
            opacity: ramp(frame, 30, 52),
          }}
        >
          {caption}
        </div>
      ) : null}
    </Panel>
  );
};
