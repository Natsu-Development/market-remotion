import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Panel} from '../layout/Panel';
import {Icon} from './Icon';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT} from '../theme';
import {enter} from '../lib/anim';
import type {Visual} from '../types';

const PAD = 52;
const GAP = 32;
const TOP = 61;
const HEIGHT = 447;

type Props = Extract<Visual, {type: 'cards'}> & {beatIndex: number};

/** The named risks, as cards that glow in one after another. */
export const WarnCards: React.FC<Props> = ({cards, accent}) => {
  const frame = useCurrentFrame();
  const colour = accentColor(accent);
  const width = (LAYOUT.panel.width - PAD * 2 - GAP * (cards.length - 1)) / cards.length;

  return (
    <Panel>
      {cards.map((card, k) => (
        <div
          key={k}
          style={{
            position: 'absolute',
            left: PAD + k * (width + GAP),
            top: TOP,
            width,
            height: HEIGHT,
            borderRadius: 12,
            border: `1.5px solid ${colour}`,
            backgroundColor: 'rgba(28, 4, 8, 0.72)',
            boxShadow: `0 0 34px ${colour}33, inset 0 0 26px ${colour}1A`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 34px',
            textAlign: 'center',
            ...enter(frame, {delay: 14 + k * 14, duration: 22, rise: 18}),
          }}
        >
          <Icon name="warning" size={42} color={colour} />
          <div
            style={{
              marginTop: 26,
              fontFamily: FONTS.display,
              fontWeight: 800,
              fontSize: 42,
              lineHeight: 1.18,
              letterSpacing: 0.4,
              color: COLORS.white,
              textTransform: 'uppercase',
            }}
          >
            {card.title}
          </div>
          <div
            style={{
              marginTop: 20,
              fontFamily: FONTS.text,
              fontWeight: 400,
              fontSize: 26,
              lineHeight: 1.35,
              color: 'rgba(255, 255, 255, 0.72)',
            }}
          >
            {card.body}
          </div>
        </div>
      ))}
    </Panel>
  );
};
