import React from 'react';
import {Composition} from 'remotion';
import {Reel, totalFrames} from './Reel';
import {CANVAS} from './theme';
import type {Reel as ReelContent} from './types';
import channel from '../content/channel.json';
import reviewDaily from '../content/review-daily.json';

/**
 * One composition per content file. Duration is derived from each scene list,
 * so adding a scene or re-running the voiceover script re-times that reel
 * without touching any code.
 */
const REELS: {id: string; content: ReelContent}[] = [
  {id: 'Channel', content: channel as unknown as ReelContent},
  // market-review skill (.claude/skills/market-review/): the latest daily edition, rebuilt each session.
  {id: 'DailyReview', content: reviewDaily as unknown as ReelContent},
  // WeeklyReview (weekly-review skill) is registered here by its first real weekly scaffold (weekly-review SKILL.md); the
  // 28/9–2/10 test edition was removed 2026-10-06.
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
