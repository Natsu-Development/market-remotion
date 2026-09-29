import React from 'react';
import type {Visual} from '../types';
import {CandleChart} from './CandleChart';
import {MacdChart} from './MacdChart';
import {RsiChart} from './RsiChart';
import {Pictogram} from './Pictogram';
import {BarPair} from './BarPair';
import {IconList} from './IconList';
import {WarnCards} from './WarnCards';
import {Zigzag} from './Zigzag';
import {RiskReward} from './RiskReward';
import {Outro} from './Outro';
import {ImagePanel} from './ImagePanel';

/**
 * Content picks a visual by name. Adding a new panel type means adding a
 * variant to `Visual` and one branch here — nothing else in the reel changes.
 */
export const renderVisual = (
  visual: Visual,
  beatIndex: number,
  extras: {disclaimer?: string; footnoteY?: number; beatFrame?: number; beatStarts?: number[]},
): React.ReactNode => {
  switch (visual.type) {
    case 'candles':
      return <CandleChart {...visual} beatIndex={beatIndex} />;
    case 'macd':
      return <MacdChart {...visual} beatIndex={beatIndex} />;
    case 'rsi':
      return <RsiChart {...visual} beatIndex={beatIndex} />;
    case 'pictogram':
      return <Pictogram {...visual} beatIndex={beatIndex} />;
    case 'bars':
      return <BarPair {...visual} beatIndex={beatIndex} />;
    case 'list':
      return <IconList {...visual} beatIndex={beatIndex} />;
    case 'cards':
      return <WarnCards {...visual} beatIndex={beatIndex} />;
    case 'zigzag':
      return <Zigzag {...visual} beatIndex={beatIndex} />;
    case 'riskReward':
      return <RiskReward {...visual} beatIndex={beatIndex} />;
    case 'image':
      return <ImagePanel {...visual} beatIndex={beatIndex} beatFrame={extras.beatFrame ?? 0} beatStarts={extras.beatStarts ?? [0]} />;
    case 'outro':
      return (
        <Outro
          {...visual}
          beatIndex={beatIndex}
          disclaimer={extras.disclaimer}
          footnoteY={extras.footnoteY}
        />
      );
  }
};
