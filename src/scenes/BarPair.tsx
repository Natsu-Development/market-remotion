import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT} from '../theme';
import {easeOut, enter} from '../lib/anim';
import type {Visual} from '../types';

const PAD = 48;
/** Thin marks: the bar is a ruler, not a block. */
const BAR_H = 22;
const GROUP_PITCH = 176;

type Props = Extract<Visual, {type: 'bars'}> & {beatIndex: number};

/**
 * Labelled bars that race to their share. Flat fill, rounded only at the data
 * end and square at the baseline, a hairline track: the same grammar as the
 * histogram bars in the charts, so the reel's marks all speak one language.
 */
export const BarPair: React.FC<Props> = ({bars}) => {
  const frame = useCurrentFrame();
  const trackW = LAYOUT.panel.width - PAD * 2;
  const top = (LAYOUT.panel.height - ((bars.length - 1) * GROUP_PITCH + BAR_H + 60)) / 2;

  return (
    <Panel>
      {bars.map((bar, k) => {
        const colour = accentColor(bar.accent);
        const delay = 18 + k * 14;
        const grow = interpolate(frame, [delay + 6, delay + 40], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: easeOut,
        });
        const shown = Math.round(bar.percent * grow);
        return (
          <div
            key={k}
            style={{
              position: 'absolute',
              left: PAD,
              top: top + k * GROUP_PITCH,
              width: trackW,
              ...enter(frame, {delay, duration: 20, rise: 14}),
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.text,
                  fontWeight: 600,
                  fontSize: 30,
                  letterSpacing: 1.4,
                  color: COLORS.inkSecondary,
                  textTransform: 'uppercase',
                }}
              >
                {bar.label}
              </span>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontWeight: 700,
                  fontSize: 36,
                  fontVariantNumeric: 'tabular-nums',
                  color: colour,
                }}
              >
                {shown}%
              </span>
            </div>
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: BAR_H,
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  width: `${bar.percent * grow}%`,
                  backgroundColor: colour,
                  borderRadius: '0 4px 4px 0',
                }}
              />
              {/* Hairline baseline at zero, like an axis. */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: -8,
                  width: 1,
                  height: BAR_H + 16,
                  backgroundColor: 'rgba(255, 255, 255, 0.28)',
                }}
              />
            </div>
          </div>
        );
      })}
    </Panel>
  );
};
