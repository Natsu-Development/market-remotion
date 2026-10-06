import React from 'react';
import type {Visual} from '../types';
import {Outro} from './Outro';
import {ImagePanel} from './ImagePanel';
import {LineChart} from './LineChart';
import {Movers} from './Movers';
import {FilterBoard} from './FilterBoard';

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
    case 'image':
      return <ImagePanel {...visual} beatIndex={beatIndex} beatFrame={extras.beatFrame ?? 0} beatStarts={extras.beatStarts ?? [0]} />;
    case 'lines':
      return <LineChart {...visual} beatIndex={beatIndex} beatFrame={extras.beatFrame ?? 0} beatStarts={extras.beatStarts ?? [0]} />;
    case 'movers':
      return <Movers {...visual} beatIndex={beatIndex} beatFrame={extras.beatFrame ?? 0} beatStarts={extras.beatStarts ?? [0]} />;
    case 'board':
      return <FilterBoard {...visual} beatIndex={beatIndex} beatFrame={extras.beatFrame ?? 0} beatStarts={extras.beatStarts ?? [0]} />;
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
