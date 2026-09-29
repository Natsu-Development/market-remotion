import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Panel} from '../layout/Panel';
import {Icon, type IconName} from './Icon';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT} from '../theme';
import {enter} from '../lib/anim';
import type {Visual} from '../types';

const CHIP_X = 55;
const CHIP = 70;
const TEXT_X = 157;
const ROW_PITCH = 112;

type Props = Extract<Visual, {type: 'list'}> & {beatIndex: number};

/** Icon-chip rows that reveal one after another. */
export const IconList: React.FC<Props> = ({items, accent, chipShape = 'square'}) => {
  const frame = useCurrentFrame();
  const colour = accentColor(accent);
  const top = (LAYOUT.panel.height - (items.length - 1) * ROW_PITCH) / 2;

  return (
    <Panel>
      {items.map((item, k) => (
        <div
          key={k}
          style={{
            position: 'absolute',
            left: CHIP_X,
            top: top + k * ROW_PITCH - CHIP / 2,
            display: 'flex',
            alignItems: 'center',
            ...enter(frame, {delay: 16 + k * 12, duration: 20, rise: 16}),
          }}
        >
          <div
            style={{
              width: CHIP,
              height: CHIP,
              borderRadius: chipShape === 'circle' ? '50%' : 12,
              border: `1.5px solid ${colour}66`,
              backgroundColor: `${colour}14`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={item.icon as IconName} size={34} color={colour} />
          </div>
          <div
            style={{
              marginLeft: TEXT_X - CHIP_X - CHIP,
              width: LAYOUT.panel.width - TEXT_X - 40,
              fontFamily: FONTS.text,
              fontWeight: 500,
              fontSize: 38,
              lineHeight: 1.25,
              color: COLORS.white,
            }}
          >
            {item.text}
          </div>
        </div>
      ))}
    </Panel>
  );
};
