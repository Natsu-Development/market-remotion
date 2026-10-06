import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Panel} from '../layout/Panel';
import {accentColor, LAYOUT} from '../theme';
import {pop} from '../lib/anim';
import type {Visual} from '../types';

const GLYPH_W = 45;
const COL_GAP = 50;
const ROW_GAP = 34;

type Props = Extract<Visual, {type: 'pictogram'}> & {beatIndex: number};

/**
 * "95 out of 100 people" as a grid you can actually count. `glyph: 'dot'` draws plain dots instead of
 * the person icon — for things that are not people (market-review counts stocks; user 2026-09-29).
 */
export const Pictogram: React.FC<Props> = ({rows, columns, filledPercent, accent, glyph = 'person'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const colour = accentColor(accent);

  const total = rows * columns;
  const filled = Math.round((filledPercent / 100) * total);
  const colPitch = GLYPH_W + COL_GAP;
  const rowPitch = GLYPH_W * 1.12 + ROW_GAP;
  const gridW = (columns - 1) * colPitch + GLYPH_W;
  const gridH = (rows - 1) * rowPitch + GLYPH_W * 1.12;
  const left = (LAYOUT.panel.width - gridW) / 2;
  const top = (LAYOUT.panel.height - gridH) / 2;

  return (
    <Panel>
      <svg width={LAYOUT.panel.width} height={LAYOUT.panel.height}>
        {new Array(total).fill(0).map((_, k) => {
          const r = Math.floor(k / columns);
          const c = k % columns;
          // The unfilled few are scattered, not left in a clump at the end.
          const isFilled = (k * 7 + 3) % total >= total - filled;
          const s = pop(frame, fps, 10 + (r + c) * 2.2);
          const cx = left + c * colPitch + GLYPH_W / 2;
          const cy = top + r * rowPitch;
          return (
            <g key={k} opacity={Math.min(1, s)} transform={`translate(${cx} ${cy}) scale(${Math.min(1, s)})`}>
              {glyph === 'dot' ? (
                <circle cx={0} cy={GLYPH_W * 0.56} r={GLYPH_W * 0.4} fill={isFilled ? colour : '#39424C'} />
              ) : (
                <>
                  <circle cx={0} cy={GLYPH_W * 0.24} r={GLYPH_W * 0.24} fill={isFilled ? colour : '#39424C'} />
                  <path
                    d={`M ${-GLYPH_W * 0.36} ${GLYPH_W * 1.12}
                        a ${GLYPH_W * 0.36} ${GLYPH_W * 0.42} 0 0 1 ${GLYPH_W * 0.72} 0 Z`}
                    fill={isFilled ? colour : '#39424C'}
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>
    </Panel>
  );
};
