import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT, type AccentName} from '../theme';
import {CANDLES, CHANNEL, DOMAIN, FIRST, LAST, MAX_VOLUME, PEAKS, YEAR_TICKS, monthIndex} from '../lib/series';
import {pop, ramp} from '../lib/anim';
import type {Visual} from '../types';

const W = LAYOUT.panel.width;
const H = LAYOUT.panel.height;

const PAD = 22;
const PRICE_TOP = 16;
const PRICE_BOTTOM = 360;
const VOL_TOP = 376;
const VOL_BOTTOM = 438;
const AXIS_Y = 468;
const RULE_Y = 488;
const FOOTER_Y = 512;

const UP = COLORS.up;
const DOWN = COLORS.down;
const RAIL = COLORS.signal;

const x = (i: number) => PAD + ((i - FIRST) / (LAST - FIRST)) * (W - PAD * 2);
const logSpan = Math.log(DOMAIN.hi) - Math.log(DOMAIN.lo);
const y = (p: number) =>
  PRICE_TOP + ((Math.log(DOMAIN.hi) - Math.log(p)) / logSpan) * (PRICE_BOTTOM - PRICE_TOP);

const step = (W - PAD * 2) / (LAST - FIRST);
const bodyW = Math.max(2.6, step * 0.62);

type Props = Extract<Visual, {type: 'candles'}> & {beatIndex: number};

export const CandleChart: React.FC<Props> = ({caption, touches = [], bands = [], beatIndex}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // The series draws itself left to right, like a chart replaying.
  const draw = ramp(frame, 10, 52);
  const drawnUpTo = FIRST + (LAST - FIRST) * draw;

  const band = bands[beatIndex];
  const bandBar = band ? CANDLES.find((c) => c.t.startsWith(band.year)) : undefined;
  const bandYear = band?.year;

  return (
    <Panel tint="rgba(2, 4, 8, 0.55)">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <clipPath id="plotClip">
            <rect x={0} y={0} width={PAD + (W - PAD * 2) * draw} height={VOL_BOTTOM + 2} />
          </clipPath>
          <marker id="dropArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill={COLORS.red} />
          </marker>
        </defs>

        <text
          x={W / 2}
          y={PRICE_TOP + 132}
          textAnchor="middle"
          fontFamily={FONTS.display}
          fontWeight={800}
          fontSize={62}
          fill="rgba(255, 255, 255, 0.045)"
          letterSpacing={6}
        >
          VNINDEX · 1M
        </text>

        <g clipPath="url(#plotClip)">
          {/* Channel rails, drawn under the price. */}
          {([CHANNEL.upper, CHANNEL.lower] as const).map((rail, k) => (
            <line
              key={k}
              x1={x(FIRST)}
              y1={y(rail(FIRST))}
              x2={x(LAST)}
              y2={y(rail(LAST))}
              stroke={RAIL}
              strokeWidth={1.6}
              opacity={0.75}
            />
          ))}

          {CANDLES.map((c) => {
            if (c.i > drawnUpTo) return null;
            const cx = x(c.i);
            const stroke = c.up ? UP : DOWN;
            const top = y(Math.max(c.o, c.c));
            const bot = y(Math.min(c.o, c.c));
            const volH = (c.v / MAX_VOLUME) * (VOL_BOTTOM - VOL_TOP);
            return (
              <g key={c.t}>
                <line x1={cx} y1={y(c.h)} x2={cx} y2={y(c.l)} stroke={stroke} strokeWidth={1} />
                <rect
                  x={cx - bodyW / 2}
                  y={top}
                  width={bodyW}
                  height={Math.max(1, bot - top)}
                  fill={stroke}
                />
                <rect
                  x={cx - bodyW / 2}
                  y={VOL_BOTTOM - volH}
                  width={bodyW}
                  height={volH}
                  fill={stroke}
                  opacity={0.55}
                />
              </g>
            );
          })}
        </g>

        {/* Vertical highlight for the year this beat is about. */}
        {band && bandBar ? (
          <Band bar={bandBar} label={band.label} accent={band.accent} drop={band.drop} />
        ) : null}

        {/* Dots where price met the upper rail. */}
        {PEAKS.filter((p) => touches.includes(p.year)).map((p, k) => {
          const s = pop(frame, fps, 62 + k * 14);
          return (
            <circle
              key={p.t}
              cx={x(p.i)}
              cy={y(p.price)}
              r={6 * s}
              fill={COLORS.red}
              opacity={s}
            />
          );
        })}

        <line x1={PAD} y1={RULE_Y} x2={W - PAD} y2={RULE_Y} stroke="rgba(255,255,255,0.09)" strokeWidth={1} />

        {YEAR_TICKS.map((yr) => {
          const i = monthIndex(`${yr}-06`);
          if (i < FIRST || i > LAST) return null;
          const on = yr === bandYear;
          return (
            <text
              key={yr}
              x={x(i)}
              y={AXIS_Y}
              textAnchor="middle"
              fontFamily={FONTS.mono}
              fontWeight={on ? 700 : 400}
              fontSize={18}
              fill={on ? accentColor(band!.accent) : COLORS.faint}
            >
              {yr}
            </text>
          );
        })}

        <text
          x={PAD}
          y={FOOTER_Y}
          fontFamily={FONTS.mono}
          fontSize={17}
          fill={COLORS.inkMuted}
          letterSpacing={1.6}
        >
          {caption ?? 'VNINDEX · 1M · THANG LOG · KÊNH GIÁ 10 NĂM'}
        </text>
      </svg>
    </Panel>
  );
};

/** Vertical slab + peak marker calling out one year. */
const Band: React.FC<{
  bar: (typeof CANDLES)[number];
  label: string;
  accent: AccentName;
  drop?: boolean;
}> = ({bar, label, accent, drop}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const colour = accentColor(accent);
  const grow = ramp(frame, 4, 22);
  const marker = pop(frame, fps, 16);

  const year = bar.t.slice(0, 4);
  // The band is clamped to the panel: a partial final year (the series stops in
  // September) would otherwise put its closing rail past the right edge, where
  // overflow:hidden silently eats it.
  const left = Math.max(2, x(monthIndex(`${year}-01`)) - step * 3);
  const right = Math.min(W - 2, x(monthIndex(`${year}-12`)) + step * 3);
  const inYear = CANDLES.filter((c) => c.t.startsWith(year));
  // The band's peak is the named swing high when the year has one, so the dot,
  // the touch marker and the drawdown all sit on the same candle the fact pack
  // measured (enrich.mjs drawdownFrom). Falling back to the year's highest
  // wick gave -41% for 2022 where the pack says -42.8%.
  const anchored = PEAKS.find((p) => p.year === year);
  const peak = anchored
    ? CANDLES.find((c) => c.t === anchored.t) ?? bar
    : inYear.reduce((m, c) => (c.h > m.h ? c : m), bar);
  // The drawdown that followed the touch — measured, not typed in.
  // Close to close, which is how the move is quoted; wick extremes overstate it.
  const trough = CANDLES.filter((c) => c.i > peak.i && c.i <= peak.i + 14).reduce(
    (m, c) => (c.c < m.c ? c : m),
    inYear[inYear.length - 1],
  );
  const drawdown = Math.round(((trough.c - peak.c) / peak.c) * 100);
  const arrow = ramp(frame, 26, 48);
  const lx = x(peak.i);
  const py = y(peak.h);
  // The highest peak sits at the top edge of the plot and the latest one at
  // the right edge; a label centred above it would be clipped by the panel.
  // Near the top it moves beside the dot; near the right it right-aligns.
  // 20px mono needs ~16px of glyph height above its baseline at py - 26.
  const above = py - 46 >= 0;
  const nearRight = lx > W - 110;
  const anchor: 'middle' | 'end' = above && !nearRight ? 'middle' : 'end';
  const labelX = above ? (nearRight ? lx - 4 : lx) : lx - 14;
  const labelY = above
    ? interpolate(marker, [0, 1], [py - 6, py - 26])
    : interpolate(marker, [0, 1], [py + 27, py + 7]);

  return (
    <g opacity={grow}>
      <rect x={left} y={PRICE_TOP} width={right - left} height={RULE_Y - PRICE_TOP} fill={colour} opacity={0.07} />
      {[left, right].map((lx) => (
        <line key={lx} x1={lx} y1={PRICE_TOP} x2={lx} y2={RULE_Y} stroke={colour} strokeWidth={1.4} opacity={0.85} />
      ))}
      {drop ? (
        <g opacity={arrow}>
          <line
            x1={x(peak.i)}
            y1={py + 16}
            x2={x(peak.i) + (x(trough.i) - x(peak.i)) * arrow}
            y2={py + 16 + (y(trough.c) - py - 16) * arrow}
            stroke={COLORS.red}
            strokeWidth={2}
            markerEnd="url(#dropArrow)"
          />
          <text
            x={x(peak.i) - 8}
            y={py + (y(trough.c) - py) * 0.55}
            textAnchor="end"
            fontFamily={FONTS.mono}
            fontWeight={700}
            fontSize={19}
            fill={COLORS.red}
          >
            {drawdown}%
          </text>
        </g>
      ) : null}
      <circle cx={lx} cy={py} r={5 * marker} fill={colour} />
      {/* A plot-coloured halo keeps the label legible where it crosses a wick. */}
      <text
        x={labelX}
        y={labelY}
        textAnchor={anchor}
        fontFamily={FONTS.mono}
        fontWeight={700}
        fontSize={20}
        fill={colour}
        stroke={COLORS.plot}
        strokeWidth={5}
        paintOrder="stroke"
        opacity={marker}
      >
        {label}
      </text>
    </g>
  );
};
