import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {FONTS} from '../fonts';
import {COLORS, LAYOUT} from '../theme';
import {enter} from '../lib/anim';

/**
 * The channel's mark under the headline block: the logo in a small gold ring and the name beside
 * it, set in the display face rather than the chart mono so it reads as a signature, not a source
 * line (the user, 2026-10-01: "optimize its style"). Without a logo a gold dot holds the ring's
 * place. The outro carries the full card and the disclaimer, so the shell skips this there.
 */
export const Footer: React.FC<{text: string; logo?: string}> = ({text, logo}) => {
  const frame = useCurrentFrame();
  const F = LAYOUT.footer;
  const mark = F.markSize;
  return (
    <div
      style={{
        position: 'absolute',
        left: F.x,
        top: F.baseline - mark + 4,
        height: mark,
        width: LAYOUT.headline.maxWidth,
        display: 'flex',
        alignItems: 'center',
        gap: F.gap,
        ...enter(frame, {delay: 18, duration: 22, rise: 8}),
      }}
    >
      <div
        style={{
          width: mark,
          height: mark,
          flex: 'none',
          borderRadius: '50%',
          border: `1.5px solid ${COLORS.gold}B3`,
          boxShadow: `0 0 14px ${COLORS.gold}33`,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {logo ? (
          <Img src={staticFile(logo)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        ) : (
          <div style={{width: 8, height: 8, borderRadius: '50%', backgroundColor: COLORS.gold}} />
        )}
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontWeight: 700,
          fontSize: F.fontSize,
          letterSpacing: F.letterSpacing,
          color: COLORS.inkSecondary,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1,
          paddingTop: 2,
        }}
      >
        {text}
      </div>
    </div>
  );
};
