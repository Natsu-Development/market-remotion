import React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {ACTS, type ActName, CANVAS} from '../theme';

/** Fewer, dimmer than before: a trading terminal is still, not a night sky. */
const PARTICLES = 16;

/**
 * The backdrop: a flat base, one soft glow behind the panel, a barely-there
 * grid, a little drifting dust, and a vignette. Each scene paints its own copy, so the
 * act-to-act colour shift happens for free during the cross-dissolve.
 */
export const Background: React.FC<{act: ActName}> = ({act}) => {
  const frame = useCurrentFrame();
  const {base, glow, grid} = ACTS[act];

  return (
    <AbsoluteFill style={{backgroundColor: base}}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(62% 38% at 50% 32%, ${glow} 0%, transparent 78%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
          backgroundSize: '92px 92px',
        }}
      />
      <AbsoluteFill>
        {new Array(PARTICLES).fill(0).map((_, k) => {
          const x = random(`px-${k}`) * CANVAS.width;
          const y0 = random(`py-${k}`) * CANVAS.height;
          const size = 1.5 + random(`ps-${k}`) * 2.4;
          const speed = 0.06 + random(`pv-${k}`) * 0.22;
          const y = (y0 - frame * speed + CANVAS.height * 4) % CANVAS.height;
          return (
            <div
              key={k}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: size,
                height: size,
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.55)',
                opacity: 0.06 + random(`po-${k}`) * 0.18,
              }}
            />
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          backgroundImage:
            'radial-gradient(80% 54% at 50% 44%, transparent 58%, rgba(0, 0, 0, 0.18) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
