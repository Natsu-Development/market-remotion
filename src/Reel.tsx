import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SceneShell, activeBeatIndex} from './layout/SceneShell';
import {renderVisual} from './scenes';
import type {Reel as ReelContent, Scene} from './types';
import {FONTS} from './fonts';

export const sceneFrames = (scene: Scene, fps: number): number => Math.round(scene.duration * fps);

export const totalFrames = (reel: ReelContent, fps: number): number =>
  reel.scenes.reduce((sum, s) => sum + sceneFrames(s, fps), 0);

/** One scene: shell + panel contents + its own narration track. */
const SceneBlock: React.FC<{scene: Scene; reel: ReelContent; durationInFrames: number}> = ({
  scene,
  reel,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const beatIndex = activeBeatIndex(scene.beats, frame, fps);
  // Frames since the active beat began — annotations on a photo animate in from here.
  const beatFrame = frame - Math.round(scene.beats[beatIndex].at * fps);
  // Where every beat starts, so a photo's camera knows how long its current shot has held.
  const beatStarts = scene.beats.map((b) => Math.round(b.at * fps));

  return (
    <SceneShell scene={scene} reel={reel} durationInFrames={durationInFrames}>
      {renderVisual(scene.visual, beatIndex, {
        disclaimer: reel.disclaimer,
        footnoteY: scene.headline?.footnoteY,
        beatFrame,
        beatStarts,
      })}
    </SceneShell>
  );
};

export const Reel: React.FC<{reel: ReelContent}> = ({reel}) => {
  const {fps} = useVideoConfig();

  // Scenes are laid end to end; precompute each one's start frame.
  let cursor = 0;
  const timeline = reel.scenes.map((scene) => {
    const duration = sceneFrames(scene, fps);
    const from = cursor;
    cursor += duration;
    return {scene, from, duration};
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#000000', fontFamily: FONTS.text}}>
      {reel.music ? (
        <Audio src={staticFile(reel.music)} volume={reel.musicVolume ?? 0.12} loop />
      ) : null}

      {timeline.map(({scene, from, duration}) => (
        <Sequence key={scene.id} from={from} durationInFrames={duration} name={scene.id}>
          {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
          <SceneBlock scene={scene} reel={reel} durationInFrames={duration} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
