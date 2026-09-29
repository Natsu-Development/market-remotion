import React, {useState} from 'react';
import {Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Panel} from '../layout/Panel';
import {FONTS} from '../fonts';
import {accentColor, COLORS, LAYOUT} from '../theme';
import {easeInOut, pop, ramp} from '../lib/anim';
import type {ImageAnnotation, ImageShot, Visual} from '../types';

const BOX = LAYOUT.imagePanel;
const W = BOX.width;
const H = BOX.height;
const PAD = 22;
/** Height of the caption bar along the bottom when a caption is set. */
const CAPTION_BAR = 48;
/** Frames for the left-to-right reveal at scene start — the photo "draws" like a chart. */
const REVEAL = 40;
/** Frames the camera takes to travel from one framing to the next (vox-director's cut-in, eased). */
const MOVE = 18;
/** Frames over which a held shot's drift runs to its full amount. */
const DRIFT = 300;
/** How far a held shot drifts: 6% scale for push/pull, 4% of the view for pan/tilt. */
const DRIFT_SCALE = 0.06;
const DRIFT_SLIDE = 0.04;

type Props = Extract<Visual, {type: 'image'}> & {beatIndex: number; beatFrame: number; beatStarts: number[]};
type Framing = {x: number; y: number; zoom: number};
type Rect = {x: number; y: number; w: number; h: number};


/** A shot's framing `t` frames after it began: the hold drifts so the photo never sits dead. */
const drifted = (shot: ImageShot, t: number): Framing => {
  const k = ramp(t, 0, DRIFT, (u) => u);
  const {x, y, zoom} = shot;
  switch (shot.move ?? 'push_in') {
    case 'push_in': return {x, y, zoom: zoom * (1 + DRIFT_SCALE * k)};
    case 'pull_out': return {x, y, zoom: zoom * (1 + DRIFT_SCALE * (1 - k))};
    case 'pan': return {x: x + (DRIFT_SLIDE / zoom) * (k - 0.5), y, zoom};
    case 'tilt': return {x, y: y + (DRIFT_SLIDE / zoom) * (k - 0.5), zoom};
    default: return {x, y, zoom};
  }
};

/**
 * Where the camera is on `frame` while shot `i` holds: that shot's drifted framing, eased in from
 * wherever the camera actually was when it took over — recursively, so a shot that arrives before
 * the previous move finished starts from mid-move instead of snapping. Zoom interpolates
 * geometrically so a 1× → 3× move feels even, not like it lunges at the end.
 */
const cameraOf = (shots: ImageShot[], i: number, beatStarts: number[], frame: number): Framing => {
  const startOf = (s: ImageShot) => beatStarts[Math.min(s.beat ?? 0, beatStarts.length - 1)] ?? 0;
  const cur = shots[i];
  const now = drifted(cur, frame - startOf(cur));
  if (i === 0 || cur.cut) return now;
  const from = cameraOf(shots, i - 1, beatStarts, startOf(cur));
  const p = ramp(frame - startOf(cur), 0, MOVE, easeInOut);
  return {
    x: from.x + (now.x - from.x) * p,
    y: from.y + (now.y - from.y) * p,
    zoom: Math.exp(Math.log(from.zoom) + (Math.log(now.zoom) - Math.log(from.zoom)) * p),
  };
};

const cameraAt = (shots: ImageShot[], beatIndex: number, beatStarts: number[], frame: number): Framing => {
  let i = 0;
  for (let k = 0; k < shots.length; k++) if ((shots[k].beat ?? 0) <= beatIndex) i = k;
  return cameraOf(shots, i, beatStarts, frame);
};

/**
 * The transform that puts framing `f` (whole-photo fractions, mapped through `full`, where the
 * whole photo is drawn) in the middle of the box, clamped to `shown` — the part of the photo that
 * is actually PAINTED: the crop, and within it only what a `cover` fit leaves inside the box — so
 * the camera never travels into cut-away toolbars or past an edge. While that part still fits,
 * it keeps the placement `focus` gave it (at zoom 1 the transform is the identity).
 * Returns translate + scale, origin 0 0.
 */
const frameTransform = (f: Framing, full: Rect, shown: Rect, boxW: number, boxH: number) => {
  const z = Math.max(1, f.zoom);
  const axis = (focus: number, fullStart: number, fullSize: number, start: number, size: number, box: number) => {
    const lo = Math.max(start, 0);
    const hi = Math.min(start + size, box);
    const t = box / 2 - z * (fullStart + focus * fullSize);
    if (z * (hi - lo) <= box) {
      const place = box > hi - lo ? lo / (box - (hi - lo)) : 0.5;
      return (box - z * (hi - lo)) * place - z * lo;
    }
    return Math.min(-z * lo, Math.max(box - z * hi, t));
  };
  return {
    tx: axis(f.x, full.x, full.w, shown.x, shown.w, boxW),
    ty: axis(f.y, full.y, full.h, shown.y, shown.h, boxH),
    z,
  };
};

/**
 * A label on its own dark plate, so it reads over candles instead of fighting them (a halo alone
 * left words tangled in wicks). The plate is sized from the text: JetBrains Mono advances exactly
 * 0.6em per glyph. `ui` undoes most of the camera zoom.
 */
const LABEL_SIZE = 20;
/** Screen pixels a plate keeps from the edge of what the camera shows. */
const EDGE = 10;
/** The part of the layer the camera shows right now (layer coords) and the layer→screen scale. */
type View = {x0: number; y0: number; x1: number; y1: number; z: number};
const ViewCtx = React.createContext<View | null>(null);
const Halo: React.FC<{x: number; y: number; text: string; color: string; anchor?: 'start' | 'middle' | 'end'; opacity?: number; ui?: number}> = ({
  x, y, text, color, anchor = 'start', opacity = 1, ui = 1,
}) => {
  const view = React.useContext(ViewCtx);
  const size = LABEL_SIZE * ui;
  const w = [...text].length * size * 0.6;
  const padX = 7 * ui;
  let left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  let base = y;
  let seen = 1;
  if (view) {
    // Keep the whole plate inside the frame: a label that would cross the panel border (or the
    // crop edge) slides back in by the overflow, so no number is ever cut — also mid-zoom.
    // A label whose plate lies wholly outside the frame belongs to a mark that is off screen;
    // it fades instead of sticking to the edge.
    const m = EDGE / view.z;
    const bx0 = left - padX, bx1 = left + w + padX, by0 = base - size * 1.02, by1 = base + size * 0.34;
    const outside = bx1 < view.x0 || bx0 > view.x1 || by1 < view.y0 || by0 > view.y1;
    if (outside) seen = 0;
    const dx = bx0 < view.x0 + m ? view.x0 + m - bx0 : bx1 > view.x1 - m ? view.x1 - m - bx1 : 0;
    const dy = by0 < view.y0 + m ? view.y0 + m - by0 : by1 > view.y1 - m ? view.y1 - m - by1 : 0;
    left += dx;
    base += dy;
  }
  const tx = anchor === 'end' ? left + w : anchor === 'middle' ? left + w / 2 : left;
  return (
    <g opacity={opacity * seen}>
      <rect
        x={left - padX}
        y={base - size * 1.02}
        width={w + padX * 2}
        height={size * 1.36}
        rx={5 * ui}
        fill={COLORS.plot}
        fillOpacity={0.84}
        stroke={color}
        strokeOpacity={0.45}
        strokeWidth={1.2 * ui}
      />
      <text x={tx} y={base} textAnchor={anchor} fontFamily={FONTS.mono} fontWeight={700} fontSize={size} fill={color}>
        {text}
      </text>
    </g>
  );
};

/**
 * Where the photo's pixels actually land inside the image area, given object-fit and
 * object-position — so annotation fractions refer to the PHOTO, not to the box it is
 * cropped into. Without this a mark placed on "the 2022 peak" drifts with every crop.
 */
const drawnRect = (
  nat: [number, number] | null, boxW: number, boxH: number, fit: 'cover' | 'contain', focus: string,
): {x: number; y: number; w: number; h: number} => {
  if (!nat) return {x: 0, y: 0, w: boxW, h: boxH};
  const [nw, nh] = nat;
  const scale = fit === 'cover' ? Math.max(boxW / nw, boxH / nh) : Math.min(boxW / nw, boxH / nh);
  const w = nw * scale;
  const h = nh * scale;
  const pos = (word: string): number => {
    const t = word.trim();
    if (t.endsWith('%')) return parseFloat(t) / 100;
    if (t === 'left' || t === 'top') return 0;
    if (t === 'right' || t === 'bottom') return 1;
    return 0.5;
  };
  const parts = focus.split(/\s+/);
  const fx = pos(parts[0] ?? 'center');
  const fy = pos(parts[1] ?? parts[0] ?? 'center');
  return {x: (boxW - w) * fx, y: (boxH - h) * fy, w, h};
};

/**
 * One mark, in pixels, at reveal progress `s` (0..1). Strokes DRAW themselves (dash offset)
 * rather than fading in, so a level or a box arrives the way a hand would draw it.
 */
const Mark: React.FC<{a: ImageAnnotation; rect: Rect; view: Rect; s: number; ui?: number}> = ({a, rect, view, s, ui = 1}) => {
  const c = accentColor(a.accent ?? 'gold');
  // Inside a zoomed shot the whole layer is scaled up; `ui` keeps strokes and labels near their
  // on-screen size (they still grow a little, which reads as the cut-in it is).
  const sw = (n: number) => n * ui;
  const X = (f: number) => rect.x + f * rect.w;
  const Y = (f: number) => rect.y + f * rect.h;
  const w = rect.w;
  const h = rect.h;
  const drawn = (len: number) => ({strokeDasharray: len, strokeDashoffset: len * (1 - s)});
  switch (a.kind) {
    case 'box': {
      const bw = a.w * w, bh = a.h * h;
      // A box in the right third labels from its right edge, so the text stays over the photo
      // even after the push-in has grown the frame a few percent.
      const rightHeavy = a.x + a.w / 2 > 0.62;
      return (
        <g>
          <rect x={X(a.x)} y={Y(a.y)} width={bw} height={bh} rx={6} fill={c} fillOpacity={0.08 * s} stroke="none" />
          <rect x={X(a.x)} y={Y(a.y)} width={bw} height={bh} rx={6} fill="none" stroke={c} strokeWidth={sw(2)} {...drawn(2 * (bw + bh))} />
          {a.label ? <Halo ui={ui} x={rightHeavy ? X(a.x) + bw : X(a.x)} y={Y(a.y) - sw(10)} text={a.label} color={c} anchor={rightHeavy ? 'end' : 'start'} opacity={Math.max(0, s * 1.4 - 0.4)} /> : null}
        </g>
      );
    }
    case 'circle': {
      const r = a.r * Math.min(w, h);
      return (
        <g>
          <circle cx={X(a.x)} cy={Y(a.y)} r={r} fill="none" stroke={c} strokeWidth={sw(2.4)} transform={`rotate(-90 ${X(a.x)} ${Y(a.y)})`} {...drawn(2 * Math.PI * r)} />
          {a.label ? <Halo ui={ui} x={X(a.x)} y={Y(a.y) - r - sw(10)} text={a.label} color={c} anchor="middle" opacity={Math.max(0, s * 1.4 - 0.4)} /> : null}
        </g>
      );
    }
    case 'hline': {
      // Levels span the SHOWN part of the photo (the crop), not the cut-away toolbars around it;
      // the label sits just inside the shown edge — right by default, `labelSide: 'left'` for the
      // side where older, lower candles leave room for the plate.
      const y = Y(a.y);
      return (
        <g>
          <line x1={view.x} y1={y} x2={view.x + view.w} y2={y} stroke={c} strokeWidth={sw(1.8)} {...drawn(view.w)} />
          {a.label ? (
            a.labelSide === 'left'
              ? <Halo ui={ui} x={view.x + view.w * 0.03} y={y - sw(8)} text={a.label} color={c} anchor="start" opacity={Math.max(0, s * 1.4 - 0.4)} />
              : <Halo ui={ui} x={view.x + view.w * 0.97} y={y - sw(8)} text={a.label} color={c} anchor="end" opacity={Math.max(0, s * 1.4 - 0.4)} />
          ) : null}
        </g>
      );
    }
    case 'vline': {
      const x = X(a.x);
      return (
        <g>
          <line x1={x} y1={view.y} x2={x} y2={view.y + view.h} stroke={c} strokeWidth={sw(1.8)} strokeDasharray="6 5" opacity={s} />
          {a.label ? <Halo ui={ui} x={x + sw(8)} y={view.y + sw(24)} text={a.label} color={c} opacity={Math.max(0, s * 1.4 - 0.4)} /> : null}
        </g>
      );
    }
    case 'arrow': {
      const [x1, y1] = [X(a.from[0]), Y(a.from[1])];
      const [x2, y2] = [X(a.to[0]), Y(a.to[1])];
      const ex = x1 + (x2 - x1) * s;
      const ey = y1 + (y2 - y1) * s;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      // `weight` thickens a signal arrow (market-review's distribution/FTD arrows use 2); default 1.
      const wt = 'weight' in a && typeof a.weight === 'number' ? a.weight : 1;
      const head = sw(12 * Math.sqrt(wt));
      return (
        <g>
          <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={c} strokeWidth={sw(2.4 * wt)} strokeLinecap="round" />
          <path
            d={`M${ex},${ey} L${ex - head * Math.cos(ang - 0.45)},${ey - head * Math.sin(ang - 0.45)} L${ex - head * Math.cos(ang + 0.45)},${ey - head * Math.sin(ang + 0.45)} Z`}
            fill={c}
            opacity={s}
          />
          {a.label ? <Halo ui={ui} x={x1} y={y1 - sw(10)} text={a.label} color={c} anchor={x2 < x1 ? 'end' : 'start'} opacity={Math.max(0, s * 1.4 - 0.4)} /> : null}
        </g>
      );
    }
    case 'line': {
      const [x1, y1] = [X(a.from[0]), Y(a.from[1])];
      const [x2, y2] = [X(a.to[0]), Y(a.to[1])];
      const len = Math.hypot(x2 - x1, y2 - y1);
      // Dashed lines animate their offset over the full length so the dash pattern stays put
      // while the visible part grows; a solid line just draws itself.
      // The dash pattern stays in layer units: scaled by the per-frame `ui` it would slide along the
      // line during every camera move.
      const dash = a.dashed ? {strokeDasharray: '8 6', opacity: s} : drawn(len);
      const lx = a.labelAt === 'from' ? x1 : x2;
      const ly = a.labelAt === 'from' ? y1 : y2;
      const anchor = lx > rect.x + w * 0.62 ? 'end' : 'start';
      return (
        <g>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={sw(2)} strokeLinecap="round" {...dash} />
          {a.label ? <Halo ui={ui} x={lx} y={ly - sw(10)} text={a.label} color={c} anchor={anchor} opacity={Math.max(0, s * 1.4 - 0.4)} /> : null}
        </g>
      );
    }
    case 'label':
      return (
        <g opacity={s}>
          <Halo ui={ui} x={X(a.x)} y={Y(a.y)} text={a.text} color={c} anchor={a.anchor ?? 'start'} />
        </g>
      );
  }
};

/**
 * A photograph of a live page — the user's trading terminal, FireAnt, a broker's screen —
 * in the same panel as the drawn charts, with the same caption furniture. Every photo
 * scene moves: the image reveals left to right like a chart drawing itself, pushes in
 * slowly for the whole scene, and its marks draw themselves on the beat they belong to.
 * With `shots` the camera instead cuts in per beat — a wide that orients, then a close on the
 * detail the narration names — easing between framings and drifting while each one holds.
 * Image and marks share one transformed wrapper, so the camera never separates them.
 * The source chip says where the picture came from.
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
  // The crop is what gets FITTED into the box; the whole photo is then drawn around it (`full`),
  // so marks and shots in whole-photo fractions land where they always did.
  const c = crop ?? {x: 0, y: 0, w: 1, h: 1};
  const region = drawnRect(nat ? [nat[0] * c.w, nat[1] * c.h] : null, W, imageH, fit, focus);
  const full: Rect = {x: region.x - (c.x / c.w) * region.w, y: region.y - (c.y / c.h) * region.h, w: region.w / c.w, h: region.h / c.h};
  // Painted = the crop, cut to the box (a `cover` fit spills past it).
  const shown: Rect = (() => {
    const x0 = Math.max(region.x, 0), y0 = Math.max(region.y, 0);
    return {x: x0, y: y0, w: Math.min(region.x + region.w, W) - x0, h: Math.min(region.y + region.h, imageH) - y0};
  })();
  const rect = full;
  // With a shot list the camera is the shots; without one, the old scene-long push-in.
  const cam = shots?.length ? frameTransform(cameraAt(shots, beatIndex, beatStarts, frame), full, shown, W, imageH) : null;
  const layer = cam
    ? {transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.z})`, transformOrigin: '0 0'}
    : {transform: `scale(${push})`, transformOrigin: focus};
  const ui = cam ? Math.pow(cam.z, -0.6) : 1;
  // What the camera shows, in layer coordinates, cut to the painted region.
  const view: View = (() => {
    const z = cam ? cam.z : push;
    let x0: number, x1: number, y0: number, y1: number;
    if (cam) {
      x0 = -cam.tx / z; x1 = (W - cam.tx) / z; y0 = -cam.ty / z; y1 = (imageH - cam.ty) / z;
    } else {
      // scale(push) about the focus point
      const pos = (word: string | undefined, size: number) => {
        const t = (word ?? 'center').trim();
        const f = t.endsWith('%') ? parseFloat(t) / 100 : t === 'left' || t === 'top' ? 0 : t === 'right' || t === 'bottom' ? 1 : 0.5;
        return f * size;
      };
      const parts = focus.split(/\s+/);
      const ox = pos(parts[0], W), oy = pos(parts[1] ?? parts[0], imageH);
      x0 = ox - ox / z; x1 = ox + (W - ox) / z; y0 = oy - oy / z; y1 = oy + (imageH - oy) / z;
    }
    return {
      x0: Math.max(x0, shown.x), x1: Math.min(x1, shown.x + shown.w),
      y0: Math.max(y0, shown.y), y1: Math.min(y1, shown.y + shown.h), z,
    };
  })();

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
          {annotations.length ? (
            <ViewCtx.Provider value={view}>
            <svg width={W} height={imageH} viewBox={`0 0 ${W} ${imageH}`} style={{position: 'absolute', left: -shown.x, top: -shown.y, overflow: 'visible'}}>
              {annotations.map((a, k) => {
                const at = a.beat ?? 0;
                if (beatIndex < at) return null;
                // A mark with `until` clears over 8 frames once the beat after its last one starts.
                const gone = a.until === undefined || beatIndex <= a.until ? 0
                  : beatIndex === a.until + 1 ? ramp(beatFrame, 0, 8, (t) => t) : 1;
                if (gone >= 1) return null;
                // First-beat marks wait for the reveal to pass; later beats draw as their beat starts.
                // Stagger by position WITHIN the beat, not in the whole list — otherwise a second
                // beat's marks inherit the first beat's count as extra delay (measured 2026-09-23:
                // four beat-1 marks after eight beat-0 marks appeared two seconds late).
                const kInBeat = annotations.slice(0, k).filter((b) => (b.beat ?? 0) === at).length;
                const delay = (at === 0 ? REVEAL - 6 : 4) + kInBeat * 5;
                const s = beatIndex === at ? Math.min(1, Math.max(0, pop(beatFrame, fps, delay))) : 1;
                return (
                  <g key={k} opacity={1 - gone}>
                    <Mark a={a} rect={rect} view={shown} s={s} ui={ui} />
                  </g>
                );
              })}
            </svg>
            </ViewCtx.Provider>
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
