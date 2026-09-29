import React from 'react';
import {useCurrentFrame} from 'remotion';
import {COLORS, LAYOUT} from '../theme';
import {enter} from '../lib/anim';

/** The card every visual lives in. Fixed geometry, so scenes share a baseline. */
type Box = {x: number; y: number; width: number; height: number; radius: number};

/** `box` overrides the geometry — photo panels use LAYOUT.imagePanel. */
export const Panel: React.FC<{children: React.ReactNode; tint?: string; box?: Box}> = ({children, tint, box = LAYOUT.panel}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderRadius: box.radius,
        backgroundColor: tint ?? COLORS.panelFill,
        border: `1px solid ${COLORS.panelStroke}`,
        overflow: 'hidden',
        ...enter(frame, {delay: 2, duration: 22, rise: 18}),
      }}
    >
      {children}
    </div>
  );
};
