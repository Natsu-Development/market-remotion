import {Easing, interpolate, spring} from 'remotion';

/** Cubic ease-out — the house curve for entrances. */
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
/** Symmetric ease for cross-fades between beats. */
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * Fade + rise entrance. `delay` and `duration` are in frames.
 * Returns the style object directly so scenes stay declarative.
 */
export const enter = (
  frame: number,
  {delay = 0, duration = 18, rise = 26}: {delay?: number; duration?: number; rise?: number} = {},
) => {
  const p = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  return {opacity: p, transform: `translateY(${(1 - p) * rise}px)`};
};

/** 0 → 1 ramp with clamping, in frames. */
export const ramp = (
  frame: number,
  from: number,
  to: number,
  easing: (t: number) => number = easeOut,
) =>
  interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

/** A soft pop used for markers and badges. */
export const pop = (frame: number, fps: number, delay = 0) =>
  spring({frame: frame - delay, fps, config: {damping: 14, mass: 0.5, stiffness: 120}});

/**
 * Fade a scene in at its head and out at its tail. The reference reel
 * cross-dissolves rather than cutting, which is what keeps it feeling calm.
 */
export const sceneFade = (frame: number, durationInFrames: number, len = 14) =>
  interpolate(
    frame,
    [0, len, durationInFrames - len, durationInFrames],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeInOut},
  );
