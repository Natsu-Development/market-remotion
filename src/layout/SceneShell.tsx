import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Background} from './Background';
import {Eyebrow} from './Eyebrow';
import {Headline} from './Headline';
import {Ticker, fmtMonth, type Market} from './Ticker';
import {Footer} from './Footer';
import {sceneFade} from '../lib/anim';
import {CANDLES, SERIES_META} from '../lib/series';
import type {Beat, Reel, Scene} from '../types';

/** Market context off the price series, with the reel free to override the labels. */
export const marketOf = (reel: Pick<Reel, 'ticker'>): Market | null => {
  if (reel.ticker === false) return null;
  const last = CANDLES[CANDLES.length - 1];
  const prev = CANDLES[CANDLES.length - 2] ?? last;
  return {
    symbol: reel.ticker?.symbol ?? 'VN-INDEX',
    timeframe: reel.ticker?.timeframe ?? '1M',
    last: reel.ticker?.last ?? last.c,
    prev: reel.ticker?.prev ?? prev.c,
    asOf: reel.ticker?.asOf ?? last.t,
  };
};

export const footerOf = (reel: Pick<Reel, 'footer'>): string | null => {
  if (reel.footer === false) return null;
  if (reel.footer) return reel.footer;
  const asOf = fmtMonth(CANDLES[CANDLES.length - 1].t);
  // A reconstruction is not a source; only real data gets named.
  // Keep it under ~62 characters: the footer is 20px mono across 880px and does not wrap.
  // Sources only: the "not investment advice" line lives once, under the outro (user, 2026-09-28).
  const src = SERIES_META.reconstructed ? 'Dữ liệu' : `Nguồn: ${SERIES_META.sourceLabel} ·`;
  return `${src} tới ${asOf}`;
};

/** Which beat is on screen right now. Visuals key their state off this. */
export const activeBeatIndex = (beats: Beat[], frame: number, fps: number): number => {
  let idx = 0;
  for (let k = 0; k < beats.length; k++) {
    if (frame >= Math.round(beats[k].at * fps)) idx = k;
  }
  return idx;
};

/**
 * Every scene is the same three-part frame: eyebrow up top, panel in the
 * middle, headline below. Only the panel's contents change — that consistency
 * is most of why the reel reads as one piece.
 */
export const SceneShell: React.FC<{
  scene: Scene;
  reel: Pick<Reel, 'ticker' | 'footer'>;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({scene, reel, durationInFrames, children}) => {
  const frame = useCurrentFrame();
  const opacity = sceneFade(frame, durationInFrames);
  const market = marketOf(reel);
  // The outro carries the full disclaimer under its headline; no footer there.
  const footer = scene.visual.type === 'outro' ? null : footerOf(reel);

  return (
    <AbsoluteFill style={{opacity}}>
      <Background act={scene.act} />
      {market ? <Ticker market={market} /> : null}
      {scene.eyebrow ? <Eyebrow label={scene.eyebrow} /> : null}
      {children}
      <Headline beats={scene.beats} override={scene.headline} />
      {footer ? <Footer text={footer} /> : null}
    </AbsoluteFill>
  );
};
