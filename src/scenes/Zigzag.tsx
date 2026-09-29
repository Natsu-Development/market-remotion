import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {COLORS, LAYOUT} from '../theme';
import {easeOut, ramp} from '../lib/anim';
import type {Visual} from '../types';

const W = LAYOUT.panel.width;
const H = LAYOUT.panel.height;
const LEFT = 68;
const RIGHT = 760;
const TOP = 88;

type Props = Extract<Visual, {type: 'zigzag'}> & {beatIndex: number};

/**
 * Distribution drawn as a staircase: every bounce gets labelled "hope", every
 * lower high gets labelled "hesitate", and the last leg has no bounce at all.
 */
export const Zigzag: React.FC<Props> = ({topLabel, endLabel, upLabel, downLabel, steps, beatIndex}) => {
  const frame = useCurrentFrame();

  // Geometry: each step drops, then retraces about half of the drop.
  const legs = steps * 2;
  const spanX = RIGHT - LEFT;
  const dx = spanX / (legs + 2);
  const drop = 50;

  const pts: {x: number; y: number}[] = [{x: LEFT, y: TOP}];
  for (let s = 0; s < steps; s++) {
    const last = pts[pts.length - 1];
    pts.push({x: last.x + dx, y: last.y + drop});
    pts.push({x: last.x + dx * 2, y: last.y + drop - drop * 0.45});
  }
  const tail = pts[pts.length - 1];
  // The final leg: no bounce, steeper than anything before it.
  pts.push({x: tail.x + dx * 2, y: tail.y + drop * 4.3});

  // Cumulative length so the line can draw at a constant speed.
  const seg = pts.slice(1).map((p, k) => Math.hypot(p.x - pts[k].x, p.y - pts[k].y));
  const total = seg.reduce((a, b) => a + b, 0);
  const progress = ramp(frame, 14, 120, easeOut);
  const drawn = total * progress;

  const visible: {x: number; y: number}[] = [pts[0]];
  let acc = 0;
  for (let k = 0; k < seg.length; k++) {
    if (acc + seg[k] <= drawn) {
      visible.push(pts[k + 1]);
      acc += seg[k];
    } else {
      const t = (drawn - acc) / seg[k];
      visible.push({
        x: pts[k].x + (pts[k + 1].x - pts[k].x) * t,
        y: pts[k].y + (pts[k + 1].y - pts[k].y) * t,
      });
      break;
    }
  }

  const reached = (p: {x: number; y: number}) =>
    visible.length > 1 && visible[visible.length - 1].x >= p.x - 1;

  const path = visible.map((p, k) => `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <Panel tint="rgba(4, 2, 3, 0.5)">
      <svg width={W} height={H}>
        <line x1={LEFT} y1={TOP} x2={RIGHT + 40} y2={TOP} stroke="rgba(255,255,255,0.16)" strokeWidth={1} strokeDasharray="4 7" />
        <text x={LEFT} y={TOP - 14} fontFamily={FONTS.mono} fontSize={19} fill="rgba(255,255,255,0.8)">
          {topLabel}
        </text>

        <path d={path} fill="none" stroke={COLORS.red} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />

        {/* "hope" above each bounce, "hesitate" under each lower high. */}
        {new Array(steps).fill(0).map((_, s) => {
          const bottom = pts[s * 2 + 1];
          const bounce = pts[s * 2 + 2];
          const onBounce = reached(bounce);
          const onBottom = reached(bottom);
          const fade = (ok: boolean) => (ok ? 1 : 0);
          return (
            <g key={s}>
              <text
                x={bounce.x + 6}
                y={bounce.y - 12}
                fontFamily={FONTS.text}
                fontWeight={s === steps - 1 ? 700 : 500}
                fontSize={23}
                fill={COLORS.green}
                opacity={fade(onBounce) * (s === steps - 1 ? 1 : 0.72)}
              >
                {upLabel}
              </text>
              <text
                x={bottom.x - 4}
                y={bottom.y + 26}
                fontFamily={FONTS.text}
                fontWeight={500}
                fontSize={23}
                fill={COLORS.red}
                opacity={fade(onBottom) * 0.72}
              >
                {downLabel}
              </text>
            </g>
          );
        })}

        {/* The last leg only gets named once the headline turns. */}
        <text
          x={W - 24}
          y={pts[pts.length - 1].y + 44}
          textAnchor="end"
          fontFamily={FONTS.mono}
          fontWeight={700}
          fontSize={21}
          fill={COLORS.red}
          opacity={
            beatIndex >= 1
              ? interpolate(frame, [4, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
              : 0
          }
        >
          {endLabel}
        </text>
      </svg>
    </Panel>
  );
};
