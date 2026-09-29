import React from 'react';
import {Composition} from 'remotion';
import {Reel, totalFrames} from './Reel';
import {CANVAS} from './theme';
import type {Reel as ReelContent} from './types';
import channel from '../content/channel.json';

/**
 * One composition per content file. Duration is derived from each scene list,
 * so adding a scene or re-running the voiceover script re-times that reel
 * without touching any code.
 */
const REELS: {id: string; content: ReelContent}[] = [
  {id: 'Channel', content: channel as unknown as ReelContent},
];

export const RemotionRoot: React.FC = () => (
  <>
    {REELS.map(({id, content}) => (
      <Composition
        key={id}
        id={id}
        component={Reel}
        width={CANVAS.width}
        height={CANVAS.height}
        fps={CANVAS.fps}
        durationInFrames={1}
        defaultProps={{reel: content}}
        calculateMetadata={({props}) => ({
          durationInFrames: totalFrames(props.reel, CANVAS.fps),
        })}
      />
    ))}
  </>
);
