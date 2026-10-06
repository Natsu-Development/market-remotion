import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {COLORS, LAYOUT} from '../theme';
import {enter, ramp} from '../lib/anim';
import type {Visual} from '../types';

const MARK = 174;

type Props = Extract<Visual, {type: 'outro'}> & {
  beatIndex: number;
  disclaimer?: string;
  footnoteY?: number;
};

/**
 * Sign-off card. `logo` points at a file under public/ — drop a brand mark
 * there and it replaces the generated monogram inside the ring; the channel
 * name stays printed under it either way.
 */
export const Outro: React.FC<Props> = ({logo, brand, kicker, pill, line, disclaimer, footnoteY}) => {
  const frame = useCurrentFrame();
  const initials = brand
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <Panel tint="rgba(255, 255, 255, 0.04)">
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: MARK,
              height: MARK,
              borderRadius: '50%',
              border: `2px solid ${COLORS.gold}`,
              boxShadow: `0 0 40px ${COLORS.gold}44`,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              ...enter(frame, {delay: 8, duration: 24, rise: 14}),
            }}
          >
            {logo ? (
              <Img src={staticFile(logo)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            ) : (
              <>
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontWeight: 800,
                    fontSize: 54,
                    color: COLORS.gold,
                    lineHeight: 1,
                  }}
                >
                  {initials}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: FONTS.mono,
                    fontSize: 13,
                    letterSpacing: 3,
                    color: 'rgba(255,255,255,0.55)',
                  }}
                >
                  {kicker.toUpperCase()}
                </div>
              </>
            )}
          </div>

          {/* The name always prints under the mark: an avatar-style logo (the user's owl, 2026-09-30)
              carries no wordmark, and the monogram never did. */}
          <div
            style={{
              marginTop: 24,
              fontFamily: FONTS.display,
              fontWeight: 800,
              fontSize: 34,
              letterSpacing: 3,
              color: COLORS.white,
              textTransform: 'uppercase',
              ...enter(frame, {delay: 16, duration: 22, rise: 12}),
            }}
          >
            {brand}
          </div>

          <div
            style={{
              marginTop: 30,
              padding: '14px 34px',
              borderRadius: 999,
              border: `1.5px solid ${COLORS.gold}`,
              backgroundColor: `${COLORS.gold}12`,
              fontFamily: FONTS.text,
              fontWeight: 700,
              fontSize: 27,
              letterSpacing: 1.6,
              color: COLORS.gold,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              ...enter(frame, {delay: 26, duration: 22, rise: 12}),
            }}
          >
            {pill}
          </div>

          <div
            style={{
              marginTop: 26,
              fontFamily: FONTS.text,
              fontWeight: 400,
              fontSize: 29,
              color: 'rgba(255, 255, 255, 0.82)',
              ...enter(frame, {delay: 34, duration: 22, rise: 10}),
            }}
          >
            {line}
          </div>
        </div>
      </Panel>

      {disclaimer ? (
        // Centred fine print under the headline, balanced over two lines, with a short gold rule
        // above it so it reads as the card's footnote and not as a third headline (the user,
        // 2026-10-01: "justify center", "optimize its styles").
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: footnoteY ?? LAYOUT.footnote.y,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            opacity: ramp(frame, 48, 74),
          }}
        >
          <div style={{width: 36, height: 3, borderRadius: 2, backgroundColor: `${COLORS.gold}99`}} />
          <div
            style={{
              marginTop: 18,
              maxWidth: LAYOUT.footnote.maxWidth,
              padding: '0 20px',
              fontFamily: FONTS.text,
              fontWeight: 500,
              fontSize: LAYOUT.footnote.fontSize,
              lineHeight: LAYOUT.footnote.lineHeight,
              letterSpacing: 0.3,
              color: 'rgba(255, 255, 255, 0.58)',
              textAlign: 'center',
              textWrap: 'balance',
            } as React.CSSProperties}
          >
            {disclaimer}
          </div>
        </div>
      ) : null}
    </>
  );
};
