import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {fitText} from '@remotion/layout-utils';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT} from '../theme';
import type {Beat, Scene} from '../types';
import {easeInOut, easeOut} from '../lib/anim';

/**
 * Where Be Vietnam Pro puts its baseline inside a `line-height: 1` box.
 * Anchoring on the baseline rather than the box keeps every headline on the
 * same optical line even when auto-fit changes the size between scenes.
 */
const BASELINE_RATIO = 0.8585;
const WEIGHT = 800;
const CROSSFADE = 9;

const fittedSize = (text: string, cap: number) => {
  const {fontSize} = fitText({
    text,
    withinWidth: LAYOUT.headline.maxWidth,
    fontFamily: FONTS.display,
    fontWeight: WEIGHT,
    textTransform: 'uppercase',
  });
  return Math.min(fontSize, cap);
};

const Line: React.FC<{
  text: string;
  baseline: number;
  color: string;
  opacity: number;
  shift: number;
  cap: number;
}> = ({text, baseline, color, opacity, shift, cap}) => {
  const fontSize = fittedSize(text, cap);
  return (
    <div
      style={{
        position: 'absolute',
        left: LAYOUT.headline.x,
        top: baseline - fontSize * BASELINE_RATIO,
        width: LAYOUT.headline.maxWidth,
        fontFamily: FONTS.display,
        fontWeight: WEIGHT,
        fontSize,
        lineHeight: 1,
        color,
        letterSpacing: -0.5,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        opacity,
        transform: `translateY(${shift}px)`,
      }}
    >
      {text}
    </div>
  );
};

/**
 * The claim under the panel. A scene holds several beats; the panel stays put
 * while the headline escalates, which is what gives the reel its rhythm.
 */
export const Headline: React.FC<{beats: Beat[]; override?: Scene['headline']}> = ({
  beats,
  override,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const y1 = override?.line1Baseline ?? LAYOUT.headline.line1Baseline;
  const y2 = override?.line2Baseline ?? LAYOUT.headline.line2Baseline;
  const cap = override?.maxFontSize ?? LAYOUT.headline.fontSize;

  return (
    <>
      {beats.map((beat, k) => {
        const start = Math.round(beat.at * fps);
        const next = beats[k + 1] ? Math.round(beats[k + 1].at * fps) : Infinity;
        // Nothing to draw outside this beat's window (plus its fade tails).
        if (frame < start - 1 || frame > next + CROSSFADE) return null;

        const isFirst = k === 0;
        const inDur = isFirst ? 18 : CROSSFADE;
        const fadeIn = interpolate(frame, [start, start + inDur], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: easeOut,
        });
        const fadeOut =
          next === Infinity
            ? 1
            : interpolate(frame, [next, next + CROSSFADE], [1, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: easeInOut,
              });
        const opacity = fadeIn * fadeOut;
        if (opacity <= 0.001) return null;

        // First beat rises in; later beats swap with a smaller lift so the
        // eye reads it as the same slot updating, not a new element.
        const rise = isFirst ? 22 : 12;
        const shift = (1 - fadeIn) * rise - (1 - fadeOut) * rise * 0.5;
        const lagIn = interpolate(frame, [start + (isFirst ? 8 : 2), start + inDur + 8], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: easeOut,
        });

        return (
          <React.Fragment key={k}>
            <Line
              text={beat.line1}
              baseline={y1}
              color={COLORS.white}
              opacity={opacity}
              shift={shift}
              cap={cap}
            />
            {beat.line2 ? (
              <Line
                text={beat.line2}
                baseline={y2}
                color={accentColor(beat.accent ?? 'gold')}
                opacity={lagIn * fadeOut}
                shift={(1 - lagIn) * rise - (1 - fadeOut) * rise * 0.5}
                cap={cap}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </>
  );
};
