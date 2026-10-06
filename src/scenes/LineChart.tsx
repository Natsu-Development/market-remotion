import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT} from '../theme';
import {ramp} from '../lib/anim';
import type {LinePane, Visual} from '../types';

const W = LAYOUT.panel.width;
const H = LAYOUT.panel.height;
const PAD_L = 22;
/** Room on the right for the endpoint value plate. */
const PAD_R = 124;
const TOP = {y0: 74, y1: 246};
const BOTTOM = {y0: 322, y1: 494};
const HEADER_TOP = 50;
const HEADER_BOTTOM = 298;
const AXIS_Y = 532;

/** 1777.73 -> "1.778" (the ticker's integer form), 27.9 -> "27,9%". */
const fmt = (v: number, unit: LinePane['unit']) =>
  unit === 'percent' ? `${v.toFixed(1).replace('.', ',')}%` : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** "2026-08-03" -> "3/8". */
const dm = (t: string) => {
  const [, m, d] = t.split('-').map(Number);
  return `${d}/${m}`;
};

type Props = Extract<Visual, {type: 'lines'}> & {beatIndex: number; beatFrame: number; beatStarts: number[]};

/**
 * Two lines that share a time axis, one above the other: the index, and a breadth series under it
 * (market-review's "the index rises while the share of stocks above their average falls"). Two
 * panes rather than two y-axes on one: a reader can compare direction without a second scale.
 * The top line draws in beat 1; the bottom line draws when beat 2 starts (or right after the top
 * line in a one-beat scene). Endpoints carry the last value on a plate.
 */
export const LineChart: React.FC<Props> = ({caption, top, bottom, events = [], beatIndex, beatFrame, beatStarts}) => {
  const frame = useCurrentFrame();
  const dates = [...new Set([...top.points, ...bottom.points].map((p) => p[0]))].sort();
  const n = dates.length;
  const xOf = (t: string) => PAD_L + (dates.indexOf(t) / Math.max(1, n - 1)) * (W - PAD_L - PAD_R);

  const scaleOf = (pane: LinePane, box: {y0: number; y1: number}) => {
    const vs = pane.points.map((p) => p[1]);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const pad = (hi - lo) * 0.14 || 1;
    const a = pane.min ?? lo - pad, b = pane.max ?? hi + pad;
    return {y: (v: number) => box.y1 - ((v - a) / (b - a)) * (box.y1 - box.y0), a, b};
  };
  const sTop = scaleOf(top, TOP);
  const sBot = scaleOf(bottom, BOTTOM);

  const drawTop = ramp(frame, 8, 54);
  const twoBeats = beatStarts.length >= 2;
  const drawBottom = twoBeats ? (beatIndex >= 1 ? ramp(beatFrame, 2, 40) : 0) : ramp(frame, 50, 90);
  const eventsIn = ramp(frame, 30, 50);

  const pathOf = (pane: LinePane, y: (v: number) => number, upTo: number) => {
    const pts = pane.points.filter((p) => dates.indexOf(p[0]) <= Math.floor((n - 1) * upTo + 1e-6));
    return {
      d: pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${xOf(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' '),
      tip: pts[pts.length - 1],
    };
  };
  const gridOf = (s: {a: number; b: number}, count = 3) =>
    Array.from({length: count}, (_, k) => s.a + ((k + 0.5) / count) * (s.b - s.a));

  const pane = (p: LinePane, s: {y: (v: number) => number; a: number; b: number}, box: {y0: number; y1: number}, headerY: number, progress: number, key: string) => {
    const colour = p.accent ? accentColor(p.accent) : 'rgba(255,255,255,0.82)';
    const {d, tip} = pathOf(p, s.y, progress);
    const areaId = `area-${key}`;
    return (
      <g key={key}>
        <text x={PAD_L} y={headerY} fontFamily={FONTS.mono} fontSize={19} fill="rgba(255,255,255,0.55)" letterSpacing={1.4}>
          {p.label}
        </text>
        {gridOf(s).map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={s.y(v)} y2={s.y(v)} stroke={COLORS.hairline} strokeWidth={1} />
            <text x={W - PAD_R + 8} y={s.y(v) + 5} fontFamily={FONTS.mono} fontSize={14} fill={COLORS.faint}>
              {fmt(v, p.unit)}
            </text>
          </g>
        ))}
        {p.ref != null && p.ref > s.a && p.ref < s.b ? (
          <line x1={PAD_L} x2={W - PAD_R} y1={s.y(p.ref)} y2={s.y(p.ref)} stroke="rgba(255,255,255,0.28)" strokeWidth={1.2} strokeDasharray="7 6" />
        ) : null}
        {progress > 0 && tip ? (
          <>
            <defs>
              <linearGradient id={areaId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={colour} stopOpacity={0.3} />
                <stop offset="1" stopColor={colour} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={`${d} L${xOf(tip[0]).toFixed(1)},${box.y1} L${PAD_L},${box.y1} Z`} fill={`url(#${areaId})`} />
            <path d={d} fill="none" stroke={colour} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={xOf(tip[0])} cy={s.y(tip[1])} r={5.5} fill={colour} stroke={COLORS.plot} strokeWidth={2} />
            <g transform={`translate(${xOf(tip[0]) + 12} ${s.y(tip[1]) - 14})`}>
              <rect x={0} y={0} width={PAD_R - 22} height={28} rx={5} fill="rgba(4, 6, 10, 0.86)" stroke={colour} strokeWidth={1} />
              <text x={(PAD_R - 22) / 2} y={19} textAnchor="middle" fontFamily={FONTS.mono} fontSize={17} fontWeight={700} fill={colour}>
                {fmt(tip[1], p.unit)}
              </text>
            </g>
          </>
        ) : null}
      </g>
    );
  };

  // Axis: first and last session, plus the first session of each month in between.
  const ticks = dates.filter((t, k) => k === 0 || k === n - 1 || (k > 0 && t.slice(0, 7) !== dates[k - 1].slice(0, 7)));

  return (
    <Panel tint="rgba(2, 4, 8, 0.55)">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {pane(top, sTop, TOP, HEADER_TOP, drawTop, 'top')}
        {pane(bottom, sBot, BOTTOM, HEADER_BOTTOM, drawBottom, 'bottom')}
        {events.map((e) => {
          if (!dates.includes(e.t)) return null;
          const c = accentColor(e.accent ?? 'gold');
          const x = xOf(e.t);
          return (
            <g key={e.t} opacity={eventsIn}>
              <line x1={x} x2={x} y1={TOP.y0 - 8} y2={BOTTOM.y1} stroke={c} strokeWidth={1.4} strokeDasharray="5 5" opacity={0.8} />
              {e.label ? (
                <text x={x + 6} y={TOP.y0 - 12} fontFamily={FONTS.mono} fontSize={15} fill={c}>
                  {e.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {ticks.map((t) => (
          <text key={t} x={xOf(t)} y={AXIS_Y} textAnchor={t === dates[0] ? 'start' : t === dates[n - 1] ? 'end' : 'middle'} fontFamily={FONTS.mono} fontSize={15} fill={COLORS.faint}>
            {dm(t)}
          </text>
        ))}
        {caption ? (
          <text x={W / 2} y={H - 12} textAnchor="middle" fontFamily={FONTS.mono} fontSize={16} fill={COLORS.inkMuted} letterSpacing={1.2}>
            {caption}
          </text>
        ) : null}
      </svg>
    </Panel>
  );
};
