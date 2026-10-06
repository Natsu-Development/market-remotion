import React, {useMemo, useState} from 'react';
import {Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT} from '../theme';
import {pop, ramp} from '../lib/anim';
import {
  LABEL_SIZE, REVEAL, camAt, fitShots, framePlates, markStates, photoGeometry, reserveOf, settleDelay, uiOf, viewOf,
  type Geo, type Placed, type PlateSpec, type View,
} from '../lib/photoLayout';
import type {ImageAnnotation, Visual} from '../types';

const BOX = LAYOUT.imagePanel;
const W = BOX.width;
const H = BOX.height;
const PAD = 22;
/** Height of the caption bar along the bottom when a caption is set. */
const CAPTION_BAR = 48;

type Props = Extract<Visual, {type: 'image'}> & {beatIndex: number; beatFrame: number; beatStarts: number[]};

/**
 * A label on its own dark plate, so it reads over candles instead of fighting them. Where the plate goes
 * is decided for all plates at once (framePlates in src/lib/photoLayout.ts): inside the frame, off the
 * other plates and the ringed candles, fading when the point it belongs to leaves the frame — so no number
 * is ever cut, also mid-zoom.
 */
const PlateView: React.FC<{spec: PlateSpec; placed: Placed; color: string; opacity: number}> = ({spec, placed, color, opacity}) => {
  const size = LABEL_SIZE * spec.ui;
  const padX = 7 * spec.ui;
  const r = placed.rect;
  const tx = spec.anchor === 'end' ? r.x + r.w - padX : spec.anchor === 'middle' ? r.x + r.w / 2 : r.x + padX;
  const a = opacity * placed.opacity;
  if (a <= 0.001) return null;
  return (
    <g opacity={a}>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={5 * spec.ui} fill={COLORS.plot} fillOpacity={0.84} stroke={color} strokeOpacity={0.45} strokeWidth={1.2 * spec.ui} />
      <text x={tx} y={spec.base + placed.dy} textAnchor={spec.anchor} fontFamily={FONTS.mono} fontWeight={700} fontSize={size} fill={color}>
        {spec.text}
      </text>
    </g>
  );
};

/**
 * One mark's drawing, in pixels, at reveal progress `s` (0..1). Strokes DRAW themselves (dash offset)
 * rather than fading in, so a level or a box arrives the way a hand would draw it. Plates are drawn
 * separately, above every mark. Level lines span what the camera shows, so a close-up draws them
 * across the frame instead of from an edge that is off screen.
 */
const Mark: React.FC<{a: ImageAnnotation; g: Geo; view: View; s: number; ui: number}> = ({a, g, view, s, ui}) => {
  const c = accentColor(a.accent ?? 'gold');
  const sw = (n: number) => n * ui;
  const rect = g.full;
  const X = (f: number) => rect.x + f * rect.w;
  const Y = (f: number) => rect.y + f * rect.h;
  const drawn = (len: number) => ({strokeDasharray: len, strokeDashoffset: len * (1 - s)});
  const vx0 = Math.max(view.x0, g.shown.x), vx1 = Math.min(view.x1, g.shown.x + g.shown.w);
  const vy0 = Math.max(view.y0, g.shown.y), vy1 = Math.min(view.y1, g.shown.y + g.shown.h);
  switch (a.kind) {
    case 'box': {
      const bw = a.w * rect.w, bh = a.h * rect.h;
      return (
        <g>
          <rect x={X(a.x)} y={Y(a.y)} width={bw} height={bh} rx={6} fill={c} fillOpacity={0.08 * s} stroke="none" />
          <rect x={X(a.x)} y={Y(a.y)} width={bw} height={bh} rx={6} fill="none" stroke={c} strokeWidth={sw(2)} {...drawn(2 * (bw + bh))} />
        </g>
      );
    }
    case 'circle': {
      const r = a.r * Math.min(rect.w, rect.h);
      return <circle cx={X(a.x)} cy={Y(a.y)} r={r} fill="none" stroke={c} strokeWidth={sw(2.4)} transform={`rotate(-90 ${X(a.x)} ${Y(a.y)})`} {...drawn(2 * Math.PI * r)} />;
    }
    case 'hline': {
      const y = Y(a.y);
      return <line x1={vx0} y1={y} x2={vx1} y2={y} stroke={c} strokeWidth={sw(1.8)} {...drawn(Math.max(1, vx1 - vx0))} />;
    }
    case 'vline': {
      const x = X(a.x);
      return <line x1={x} y1={vy0} x2={x} y2={vy1} stroke={c} strokeWidth={sw(1.8)} strokeDasharray="6 5" opacity={s} />;
    }
    case 'arrow': {
      const [x1, y1] = [X(a.from[0]), Y(a.from[1])];
      const [x2, y2] = [X(a.to[0]), Y(a.to[1])];
      if (a.style === 'block') {
        // A solid signal arrow for a single session (market-review's distribution days and FTD, user
        // 2026-09-29: the thin line arrow was "so hard to see"). Thick shaft, wide head, a white rim so
        // a red arrow never melts into a red candle, and a dark halo that lifts it off the chart. It
        // grows from the tail; the tip lands on `to`.
        const k = typeof a.weight === 'number' ? a.weight : 1;
        const L = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
        const vx = -uy, vy = ux;
        // Sized for candles ~6 px apart (FireAnt daily): the head of one arrow must not cover its
        // neighbour's candle even when two distribution days are adjacent (user 2026-09-29: shorter,
        // straight onto the candle).
        const hl = Math.min(sw(15 * k), L * 0.62);
        const hh = sw(8 * k);
        const hw = sw(3.2 * k);
        const len = Math.max(hl, L * s);
        const tx = x1 + ux * len, ty = y1 + uy * len;
        const bx = tx - ux * hl, by = ty - uy * hl;
        const pts = [
          [x1 + vx * hw, y1 + vy * hw], [bx + vx * hw, by + vy * hw], [bx + vx * hh, by + vy * hh], [tx, ty],
          [bx - vx * hh, by - vy * hh], [bx - vx * hw, by - vy * hw], [x1 - vx * hw, y1 - vy * hw],
        ].map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
        return (
          <g opacity={Math.min(1, s * 1.6)}>
            <polygon points={pts} fill="none" stroke="rgba(4, 6, 10, 0.72)" strokeWidth={sw(5)} strokeLinejoin="round" />
            <polygon points={pts} fill={c} stroke="#FFFFFF" strokeWidth={sw(2.2)} strokeLinejoin="round" paintOrder="stroke" />
          </g>
        );
      }
      const ex = x1 + (x2 - x1) * s;
      const ey = y1 + (y2 - y1) * s;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      // `weight` thickens a signal arrow (market-review's distribution/FTD arrows use 2); default 1.
      const wt = typeof a.weight === 'number' ? a.weight : 1;
      const head = sw(12 * Math.sqrt(wt));
      return (
        <g>
          <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={c} strokeWidth={sw(2.4 * wt)} strokeLinecap="round" />
          <path
            d={`M${ex},${ey} L${ex - head * Math.cos(ang - 0.45)},${ey - head * Math.sin(ang - 0.45)} L${ex - head * Math.cos(ang + 0.45)},${ey - head * Math.sin(ang + 0.45)} Z`}
            fill={c}
            opacity={s}
          />
        </g>
      );
    }
    case 'line': {
      const [x1, y1] = [X(a.from[0]), Y(a.from[1])];
      const [x2, y2] = [X(a.to[0]), Y(a.to[1])];
      const len = Math.hypot(x2 - x1, y2 - y1);
      // Dashed lines animate their opacity so the dash pattern stays put while the camera moves; a solid
      // line draws itself. The dash pattern stays in layer units: scaled by the per-frame `ui` it would
      // slide along the line during every camera move.
      const dash = a.dashed ? {strokeDasharray: '8 6', opacity: s} : drawn(len);
      return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={sw(2)} strokeLinecap="round" {...dash} />;
    }
    case 'label':
      return null;
  }
};

/**
 * A photograph of a live page — the user's trading terminal, FireAnt, a broker's screen —
 * in the same panel as the drawn charts, with the same caption furniture. Every photo
 * scene moves: the image reveals left to right like a chart drawing itself, pushes in
 * slowly for the whole scene, and its marks draw themselves on the beat they belong to.
 * With `shots` the camera instead cuts in per beat — a wide that orients, then a close on the
 * detail the narration names — easing between framings and drifting while each one holds. Each
 * shot is first fitted to the marks it has to show (src/lib/photoLayout.ts), so a zoom never cuts the
 * mark the narration is naming, and the move between two framings is a zoom about the point that stays
 * put on screen, eased over ~1 s; a later beat's marks draw once the camera has settled. Image and marks
 * share one transformed wrapper, so the camera never separates them. The source chip says where the
 * picture came from. scripts/frame-audit.mjs --check measures every frame with the same module.
 */
export const ImagePanel: React.FC<Props> = ({
  src, caption, source, fit = 'cover', focus = 'center', zoom, annotations = [], sourceCorner, shots,
  crop, masks = [], maskColor, beatIndex, beatFrame, beatStarts,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const [nat, setNat] = useState<[number, number] | null>(null);
  const imageH = caption ? H - CAPTION_BAR : H;
  const reveal = ramp(frame, 4, 4 + REVEAL);
  const push = zoom === false ? 1 : 1 + 0.045 * ramp(frame, 0, 480, (t) => t);
  const g = photoGeometry(nat, crop, W, imageH, fit, focus);
  const {full, shown} = g;
  // Shots fitted to the marks they must show — a pure function of the content, the same on every frame.
  const fitted = useMemo(
    () => (shots?.length ? fitShots(shots, annotations, g) : null),
    [shots, annotations, g.full.x, g.full.y, g.full.w, g.full.h, g.shown.x, g.shown.y, g.shown.w, g.shown.h],
  );
  // With a shot list the camera is the shots; without one, the old scene-long push-in.
  const cam = fitted ? camAt(fitted, beatIndex, beatStarts, frame, g) : null;
  const layer = cam
    ? {transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.z})`, transformOrigin: '0 0'}
    : {transform: `scale(${push})`, transformOrigin: focus};
  const ui = cam ? uiOf(cam.z) : 1;
  // What the camera shows, in layer coordinates, cut to the painted region.
  const view: View = (() => {
    if (cam) return viewOf(cam, g);
    // scale(push) about the focus point
    const z = push;
    const pos = (word: string | undefined, size: number) => {
      const t = (word ?? 'center').trim();
      const f = t.endsWith('%') ? parseFloat(t) / 100 : t === 'left' || t === 'top' ? 0 : t === 'right' || t === 'bottom' ? 1 : 0.5;
      return f * size;
    };
    const parts = focus.split(/\s+/);
    const ox = pos(parts[0], W), oy = pos(parts[1] ?? parts[0], imageH);
    return {
      x0: Math.max(ox - ox / z, shown.x), x1: Math.min(ox + (W - ox) / z, shown.x + shown.w),
      y0: Math.max(oy - oy / z, shown.y), y1: Math.min(oy + (imageH - oy) / z, shown.y + shown.h), z,
    };
  })();

  // Each mark's state on this frame, and every plate laid out together (src/lib/photoLayout.ts).
  const live = markStates(annotations, beatIndex, beatFrame, (beat) => settleDelay(fitted, beat, beatStarts), (f, delay) => pop(f, fps, delay));
  const plates = nat
    ? framePlates(live, g, view, ui, reserveOf(fitted, beatIndex, beatFrame, beatStarts))
    : new Map<number, {spec: PlateSpec; placed: Placed; alpha: number}>();

  return (
    <Panel tint={COLORS.plot} box={BOX}>
      {/* The reveal sweeps in SCREEN space when a shot list drives the camera: clipped inside the
          scaled layer, a first shot framed on the right edge would sit black until the sweep got there. */}
      <div style={{position: 'absolute', left: 0, top: 0, width: W, height: imageH, overflow: 'hidden', ...(cam ? {clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`} : {})}}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            ...layer,
            ...(cam ? {} : {clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`}),
          }}
        >
          {/* Everything photo-side lives inside the painted region, so cut-away toolbars never show,
              not even in a letterbox, and marks cannot spill onto them. */}
          <div style={{position: 'absolute', left: shown.x, top: shown.y, width: shown.w, height: shown.h, overflow: 'hidden'}}>
            <Img
              src={staticFile(src)}
              onLoad={(e) => setNat([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
              style={nat
                ? {position: 'absolute', left: full.x - shown.x, top: full.y - shown.y, width: full.w, height: full.h, maxWidth: 'none'}
                : {width: '100%', height: '100%', objectFit: fit, objectPosition: focus}}
            />
            {nat && masks.length ? (
              <svg width={W} height={imageH} style={{position: 'absolute', left: -shown.x, top: -shown.y}}>
                {masks.map((m, k) => (
                  <rect key={k} x={full.x + m.x * full.w} y={full.y + m.y * full.h} width={m.w * full.w} height={m.h * full.h} fill={m.color ?? maskColor ?? COLORS.plot} />
                ))}
              </svg>
            ) : null}
            {nat && live.length ? (
              <svg width={W} height={imageH} viewBox={`0 0 ${W} ${imageH}`} style={{position: 'absolute', left: -shown.x, top: -shown.y, overflow: 'visible'}}>
                {/* Every mark first, every plate above them all: a later mark's line never crosses a plate. */}
                {live.map((st) => (
                  <g key={st.k} opacity={1 - st.gone}>
                    <Mark a={st.a} g={g} view={view} s={st.s} ui={ui} />
                  </g>
                ))}
                {live.map((st) => {
                  const p = plates.get(st.k);
                  return p ? <PlateView key={`p${st.k}`} spec={p.spec} placed={p.placed} color={accentColor(st.a.accent ?? 'gold')} opacity={p.alpha} /> : null;
                })}
              </svg>
            ) : null}
          </div>
        </div>
        {/* A thin leading edge on the reveal, like a plotter head. */}
        {reveal < 1 ? (
          <div style={{position: 'absolute', top: 0, bottom: 0, left: cam ? `calc(${reveal * 100}% - 2px)` : `${reveal * 100}%`, width: 2, backgroundColor: COLORS.gold, opacity: 0.7}} />
        ) : null}
      </div>

      {source ? (
        <div
          style={{
            position: 'absolute',
            // Annotations tend to crowd the top-right of a chart (latest highs, latest
            // signal), so an annotated photo carries its source chip bottom-right instead.
            ...(() => {
              const corner = sourceCorner ?? (annotations.length ? 'bottom-right' : 'top-right');
              const v = corner.startsWith('top') ? {top: 14} : {top: imageH - 14 - 30};
              const h = corner.endsWith('right') ? {right: PAD - 6} : {left: PAD - 6};
              return {...v, ...h};
            })(),
            padding: '5px 12px',
            borderRadius: 6,
            backgroundColor: 'rgba(4, 6, 10, 0.72)',
            border: `1px solid ${COLORS.panelStroke}`,
            fontFamily: FONTS.mono,
            fontSize: 15,
            letterSpacing: 1.4,
            color: COLORS.inkMuted,
            whiteSpace: 'nowrap',
            opacity: ramp(frame, 20, 40),
          }}
        >
          {`ẢNH · ${source}`.toUpperCase()}
        </div>
      ) : null}

      {caption ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: imageH,
            width: W,
            height: CAPTION_BAR,
            borderTop: `1px solid ${COLORS.panelStroke}`,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: PAD,
            fontFamily: FONTS.mono,
            fontSize: 17,
            letterSpacing: 1.6,
            color: COLORS.inkMuted,
            whiteSpace: 'nowrap',
            opacity: ramp(frame, 30, 52),
          }}
        >
          {caption}
        </div>
      ) : null}
    </Panel>
  );
};
