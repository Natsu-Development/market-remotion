import React from 'react';
import {useCurrentFrame} from 'remotion';
import {FONTS} from '../fonts';
import {COLORS, LAYOUT} from '../theme';
import {ramp} from '../lib/anim';

/**
 * One quiet line under the headline block: where the numbers come from and
 * that none of this is advice. Finance viewers look for it; regulators expect
 * it. The outro scene carries the full disclaimer, so the shell skips this
 * line there rather than stacking the two.
 */
export const Footer: React.FC<{text: string}> = ({text}) => {
  const frame = useCurrentFrame();
  const F = LAYOUT.footer;
  return (
    <div
      style={{
        position: 'absolute',
        left: F.x,
        top: F.baseline - F.fontSize,
        width: LAYOUT.headline.maxWidth,
        fontFamily: FONTS.mono,
        fontSize: F.fontSize,
        letterSpacing: F.letterSpacing,
        color: COLORS.inkMuted,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: ramp(frame, 20, 40),
      }}
    >
      {text.toUpperCase()}
    </div>
  );
};
