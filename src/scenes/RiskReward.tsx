import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {COLORS, LAYOUT} from '../theme';
import {easeOut} from '../lib/anim';
import type {Visual} from '../types';

const W = LAYOUT.panel.width;
const H = LAYOUT.panel.height;
const BASE = 380;
const BAR_W = 150;
const MAX_H = 200;

type Props = Extract<Visual, {type: 'riskReward'}> & {beatIndex: number};

/** One bar for what being right pays, one for what being wrong costs. */
export const RiskReward: React.FC<Props> = ({left, right}) => {
  const frame = useCurrentFrame();
  const peak = Math.max(left.value, right.value);
  const grow = interpolate(frame, [16, 52], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const sweep = interpolate(frame, [34, 78], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });

  const bars = [
    {...left, colour: '#8A96A3', x: W * 0.24 - BAR_W / 2},
    {...right, colour: COLORS.red, x: W * 0.74 - BAR_W / 2},
  ];

  const p0 = {x: bars[0].x, y: BASE + 28};
  const p1 = {x: bars[1].x + BAR_W, y: BASE - (right.value / peak) * MAX_H - 24};

  return (
    <Panel>
      <svg width={W} height={H}>
        <line
          x1={p0.x}
          y1={p0.y}
          x2={p0.x + (p1.x - p0.x) * sweep}
          y2={p0.y + (p1.y - p0.y) * sweep}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={1.4}
        />
        {bars.map((bar, k) => {
          const h = (bar.value / peak) * MAX_H * grow;
          return (
            <g key={k}>
              <rect x={bar.x} y={BASE - h} width={BAR_W} height={h} fill={bar.colour} rx={8} opacity={0.92} />
              <text
                x={bar.x + BAR_W / 2}
                y={BASE + 48}
                textAnchor="middle"
                fontFamily={FONTS.text}
                fontWeight={600}
                fontSize={28}
                letterSpacing={2}
                fill={k === 0 ? 'rgba(255,255,255,0.72)' : COLORS.red}
              >
                {bar.label.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
};
