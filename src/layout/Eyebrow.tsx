import React from 'react';
import {useCurrentFrame} from 'remotion';
import {FONTS} from '../fonts';
import {COLORS, LAYOUT} from '../theme';
import {enter, ramp} from '../lib/anim';

/** Gold rule + wide-tracked label. The rule wipes in, the label follows. */
export const Eyebrow: React.FC<{label: string}> = ({label}) => {
  const frame = useCurrentFrame();
  const wipe = ramp(frame, 4, 22);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: LAYOUT.rule.x,
          top: LAYOUT.rule.y,
          width: LAYOUT.rule.width * wipe,
          height: LAYOUT.rule.height,
          backgroundColor: COLORS.gold,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: LAYOUT.eyebrow.x,
          top: LAYOUT.eyebrow.baseline - LAYOUT.eyebrow.fontSize,
          fontFamily: FONTS.text,
          fontSize: LAYOUT.eyebrow.fontSize,
          fontWeight: 600,
          letterSpacing: LAYOUT.eyebrow.letterSpacing,
          color: COLORS.muted,
          whiteSpace: 'nowrap',
          ...enter(frame, {delay: 8, duration: 20, rise: 14}),
        }}
      >
        {label.toUpperCase()}
      </div>
    </>
  );
};
