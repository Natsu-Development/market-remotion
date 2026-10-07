/**
 * Pure geometry of a photo panel (ImagePanel): where the photo lands in the box, where the camera is on a
 * given frame, and where every mark's plate sits. No React, no Remotion and no runtime imports, so
 * scripts/frame-audit.mjs can import this file straight into Node and measure every frame of a reel with
 * the same numbers the renderer draws (user 2026-10-01: "not be overlap or cut by zoom-in or zoom-out, but
 * has smooth animation").
 *
 * Coordinates: "layer" = the box's pixels before the camera transform; screen = layer · z + t.
 */
import type {ImageAnnotation, ImageShot} from '../types';

export type Rect = {x: number; y: number; w: number; h: number};
export type Framing = {x: number; y: number; zoom: number};
/** Layer → screen: translate(tx, ty) scale(z), origin 0 0. */
export type Cam = {tx: number; ty: number; z: number};
/** What the camera shows, in layer coordinates cut to the painted region, and the layer → screen scale. */
export type View = {x0: number; y0: number; x1: number; y1: number; z: number};
/** The box, the whole photo drawn around the crop (`full`) and the part actually painted (`shown`). */
export type Geo = {W: number; H: number; full: Rect; shown: Rect};

/** Type size of a plate, in px at zoom 1. */
export const LABEL_SIZE = 20;
/** Screen px a plate keeps from the edge of what the camera shows. */
export const EDGE = 10;
/**
 * Frames a camera move takes from one framing to the next. 18 frames on the old steep ease did ~70% of
 * the travel in 6 frames (measured on the 1/10 contact sheets): a lunge. 32 on a sine ease peaks at 1.57×
 * the mean speed. A move never takes more than 45% of the hold before the next shot.
 */
export const MOVE = 32;
export const MOVE_MIN = 16;
/** Frames over which a held shot's drift runs to its full amount, and how far it drifts. */
export const DRIFT = 300;
export const DRIFT_SCALE = 0.06;
export const DRIFT_SLIDE = 0.04;
/** Screen px kept between a beat's marks and the edge of the frame when the camera is fitted to them. */
export const FIT_MARGIN = 16;
/** Screen px over which a plate fades as the point it belongs to leaves the frame. */
export const FADE = 36;
/** Screen px kept between two plates. */
export const GAP = 4;
/** Frames for the left-to-right reveal at scene start; first-beat marks wait for it. */
export const REVEAL = 40;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Sine in-out: zero speed at both ends, no kink where the hold's drift takes over. */
export const camEase = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * t));

/**
 * Where the photo's pixels land inside the box, given object-fit and object-position — so mark fractions
 * refer to the PHOTO, not to the box it is cropped into.
 */
export const drawnRect = (nat: [number, number] | null, boxW: number, boxH: number, fit: 'cover' | 'contain', focus: string): Rect => {
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

/** The crop is what gets FITTED into the box; the whole photo is then drawn around it. */
export const photoGeometry = (
  nat: [number, number] | null, crop: Rect | undefined, W: number, H: number, fit: 'cover' | 'contain', focus: string,
): Geo => {
  const c = crop ?? {x: 0, y: 0, w: 1, h: 1};
  const region = drawnRect(nat ? [nat[0] * c.w, nat[1] * c.h] : null, W, H, fit, focus);
  const full = {x: region.x - (c.x / c.w) * region.w, y: region.y - (c.y / c.h) * region.h, w: region.w / c.w, h: region.h / c.h};
  const x0 = Math.max(region.x, 0);
  const y0 = Math.max(region.y, 0);
  const shown = {x: x0, y: y0, w: Math.min(region.x + region.w, W) - x0, h: Math.min(region.y + region.h, H) - y0};
  return {W, H, full, shown};
};

/**
 * One axis of the painted-region clamp: while the painted part fits the box at zoom `z` it keeps the
 * placement `focus` gave it; once it is larger, the translation `t` may only run between its two edges.
 */
const clampAxis = (t: number, z: number, start: number, size: number, box: number) => {
  const lo = Math.max(start, 0);
  const hi = Math.min(start + size, box);
  if (z * (hi - lo) <= box) {
    const place = box > hi - lo ? lo / (box - (hi - lo)) : 0.5;
    return (box - z * (hi - lo)) * place - z * lo;
  }
  return Math.min(-z * lo, Math.max(box - z * hi, t));
};

/**
 * The transform that puts framing `f` (whole-photo fractions) in the middle of the box, clamped to the
 * painted region so the camera never travels into cut-away toolbars or past an edge. While that region
 * still fits, it keeps the placement `focus` gave it (at zoom 1 the transform is the identity).
 */
export const frameTransform = (f: Framing, g: Geo): Cam => {
  const z = Math.max(1, f.zoom);
  return {
    tx: clampAxis(g.W / 2 - z * (g.full.x + f.x * g.full.w), z, g.shown.x, g.shown.w, g.W),
    ty: clampAxis(g.H / 2 - z * (g.full.y + f.y * g.full.h), z, g.shown.y, g.shown.h, g.H),
    z,
  };
};

/** The same clamp for a camera that is between two framings (a letterboxed wide shot is not inside the photo). */
export const clampCam = (c: Cam, g: Geo): Cam => ({
  tx: clampAxis(c.tx, c.z, g.shown.x, g.shown.w, g.W),
  ty: clampAxis(c.ty, c.z, g.shown.y, g.shown.h, g.H),
  z: c.z,
});

/** A shot's framing `t` frames after it began: the hold drifts so the photo never sits dead. */
export const drifted = (shot: ImageShot, t: number): Framing => {
  const k = clamp(t / DRIFT, 0, 1);
  const {x, y, zoom} = shot;
  switch (shot.move ?? 'push_in') {
    case 'push_in': return {x, y, zoom: zoom * (1 + DRIFT_SCALE * k)};
    case 'pull_out': return {x, y, zoom: zoom * (1 + DRIFT_SCALE * (1 - k))};
    case 'pan': return {x: x + (DRIFT_SLIDE / zoom) * (k - 0.5), y, zoom};
    case 'tilt': return {x, y: y + (DRIFT_SLIDE / zoom) * (k - 0.5), zoom};
    default: return {x, y, zoom};
  }
};

export const shotStart = (s: ImageShot, beatStarts: number[]): number => beatStarts[Math.min(s.beat ?? 0, beatStarts.length - 1)] ?? 0;

/** Frames the move INTO shot `i` takes: MOVE, cut to 45% of that shot's hold when the next shot comes sooner. */
export const moveLength = (shots: ImageShot[], i: number, beatStarts: number[]): number => {
  const s = shotStart(shots[i], beatStarts);
  const next = i + 1 < shots.length ? shotStart(shots[i + 1], beatStarts) : Infinity;
  return Math.round(clamp((next - s) * 0.45, MOVE_MIN, MOVE));
};

/**
 * The camera between two framings, as a zoom about the one point that stays put on screen (the centre of
 * the similarity that maps one framing onto the other). Every point travels on a straight line and the
 * zoom runs evenly in log scale, so a close-up never swings sideways past its target — the old code eased
 * the centre linearly and the zoom geometrically, which bowed the path. A letterboxed wide shot is not
 * inside the photo, so the frames in between still go through clampCam.
 */
export const between = (a: Cam, b: Cam, p: number): Cam => {
  const z = Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * p);
  const q = Math.abs(a.z - b.z) < 1e-6 * a.z ? p : (a.z - z) / (a.z - b.z);
  return {tx: a.tx + (b.tx - a.tx) * q, ty: a.ty + (b.ty - a.ty) * q, z};
};

/**
 * Where the camera is on `frame` while shot `i` holds: that shot's drifted framing, reached from wherever
 * the camera actually was when the shot took over — recursively, so a shot that starts mid-move begins from
 * mid-move instead of snapping.
 */
const camOf = (shots: ImageShot[], i: number, beatStarts: number[], frame: number, g: Geo): Cam => {
  const cur = shots[i];
  const s = shotStart(cur, beatStarts);
  const now = frameTransform(drifted(cur, frame - s), g);
  if (i === 0 || cur.cut) return now;
  const p = camEase((frame - s) / moveLength(shots, i, beatStarts));
  if (p >= 1) return now;
  return clampCam(between(camOf(shots, i - 1, beatStarts, s, g), now, p), g);
};

export const shotIndexAt = (shots: ImageShot[], beatIndex: number): number => {
  let i = 0;
  for (let k = 0; k < shots.length; k++) if ((shots[k].beat ?? 0) <= beatIndex) i = k;
  return i;
};

export const camAt = (shots: ImageShot[], beatIndex: number, beatStarts: number[], frame: number, g: Geo): Cam =>
  camOf(shots, shotIndexAt(shots, beatIndex), beatStarts, frame, g);

/** What `cam` shows, in layer coordinates, cut to the painted region. */
export const viewOf = (cam: Cam, g: Geo): View => {
  const z = cam.z;
  const x0 = -cam.tx / z, x1 = (g.W - cam.tx) / z, y0 = -cam.ty / z, y1 = (g.H - cam.ty) / z;
  return {
    x0: Math.max(x0, g.shown.x), x1: Math.min(x1, g.shown.x + g.shown.w),
    y0: Math.max(y0, g.shown.y), y1: Math.min(y1, g.shown.y + g.shown.h), z,
  };
};

/** Inside a zoomed shot plates and strokes shrink in layer units, so on screen they grow only as z^0.4. */
export const uiOf = (z: number): number => Math.pow(z, -0.6);

// ------------------------------------------------------------------------------------------------ plates

/**
 * One mark's label plate before layout. `pin` is the point the plate belongs to (it fades as that point
 * leaves the frame; null = a free caption, which slides along the frame edge instead). `axis` restricts
 * how a plate may move: an hline's plate rides the line (x only), a vline's the line (y only).
 */
export type PlateSpec = {
  key: number;
  text: string;
  x: number;
  base: number;
  anchor: 'start' | 'middle' | 'end';
  ui: number;
  pin: [number, number] | null;
  axis?: 'x' | 'y';
  /** How much of its space the plate holds (its fade-in, or its reserve): a half-held plate pushes half as far. */
  alpha?: number;
  /** Free captions of one colour and one beat: their stacked lines form one caption (see `stacked`). */
  group?: string;
};

/** JetBrains Mono advances exactly 0.6 em per glyph, so a plate is sized from its text. */
export const plateRect = (p: Pick<PlateSpec, 'text' | 'x' | 'base' | 'anchor' | 'ui'>): Rect => {
  const size = LABEL_SIZE * p.ui;
  const w = [...p.text].length * size * 0.6;
  const padX = 7 * p.ui;
  const left = p.anchor === 'end' ? p.x - w : p.anchor === 'middle' ? p.x - w / 2 : p.x;
  return {x: left - padX, y: p.base - size * 1.02, w: w + padX * 2, h: size * 1.36};
};

const X = (g: Geo, f: number) => g.full.x + f * g.full.w;
const Y = (g: Geo, f: number) => g.full.y + f * g.full.h;

/**
 * The plate of mark `a`, placed as the mark's own drawing places it: above a box (from its right edge in the
 * right third), above a circle, at an arrow's tail, at a line's labelled end. Level lines put theirs just
 * inside the edge of what the CAMERA shows — on a close-up a label pinned to the photo's edge left the
 * level unlabelled (1/10: "Đáy nhịp hồi", the leaders' EMA50, both watch levels).
 */
export const plateOf = (a: ImageAnnotation, key: number, g: Geo, view: View, ui: number): PlateSpec | null => {
  const vx0 = Math.max(view.x0, g.shown.x);
  const vx1 = Math.min(view.x1, g.shown.x + g.shown.w);
  const vy0 = Math.max(view.y0, g.shown.y);
  switch (a.kind) {
    case 'box': {
      if (!a.label) return null;
      const right = a.x + a.w / 2 > 0.62;
      const x = right ? X(g, a.x + a.w) : X(g, a.x);
      return {key, text: a.label, x, base: Y(g, a.y) - 10 * ui, anchor: right ? 'end' : 'start', ui, pin: [x, Y(g, a.y)]};
    }
    case 'circle': {
      if (!a.label) return null;
      const r = a.r * Math.min(g.full.w, g.full.h);
      return {key, text: a.label, x: X(g, a.x), base: Y(g, a.y) - r - 10 * ui, anchor: 'middle', ui, pin: [X(g, a.x), Y(g, a.y) - r]};
    }
    case 'hline': {
      if (!a.label) return null;
      const y = Y(g, a.y);
      const left = a.labelSide === 'left';
      const x = left ? vx0 + (vx1 - vx0) * 0.03 : vx0 + (vx1 - vx0) * 0.97;
      return {key, text: a.label, x, base: y - 8 * ui, anchor: left ? 'start' : 'end', ui, pin: [x, y], axis: 'x'};
    }
    case 'vline': {
      if (!a.label) return null;
      const x = X(g, a.x);
      return {key, text: a.label, x: x + 8 * ui, base: vy0 + 24 * ui, anchor: 'start', ui, pin: [x, vy0], axis: 'y'};
    }
    case 'arrow': {
      if (!a.label) return null;
      const x1 = X(g, a.from[0]), y1 = Y(g, a.from[1]);
      return {key, text: a.label, x: x1, base: y1 - 10 * ui, anchor: X(g, a.to[0]) < x1 ? 'end' : 'start', ui, pin: [x1, y1]};
    }
    case 'line': {
      if (!a.label) return null;
      const end = a.labelAt === 'from' ? a.from : a.to;
      const lx = X(g, end[0]), ly = Y(g, end[1]);
      return {key, text: a.label, x: lx, base: ly - 10 * ui, anchor: lx > g.full.x + g.full.w * 0.62 ? 'end' : 'start', ui, pin: [lx, ly]};
    }
    case 'label':
      return {key, text: a.text, x: X(g, a.x), base: Y(g, a.y), anchor: a.anchor ?? 'start', ui: ui * (a.size ?? 1), pin: null, group: `${a.accent ?? 'gold'}|${a.beat ?? 0}`};
  }
};

/** Shapes a plate must not cover: a ringed candle, the head of a signal arrow. `alpha` = how much it holds. */
export type Obstacle = {key: number; rect: Rect; alpha: number};
export const obstacleOf = (a: ImageAnnotation, key: number, g: Geo, ui: number, alpha: number): Obstacle | null => {
  if (a.kind === 'circle') {
    const r = a.r * Math.min(g.full.w, g.full.h);
    return {key, rect: {x: X(g, a.x) - r, y: Y(g, a.y) - r, w: 2 * r, h: 2 * r}, alpha};
  }
  if (a.kind === 'arrow' && a.style === 'block') {
    const xs = [X(g, a.from[0]), X(g, a.to[0])], ys = [Y(g, a.from[1]), Y(g, a.to[1])];
    const pad = 3 * ui * (a.weight ?? 1);
    return {key, rect: {x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.abs(xs[1] - xs[0]) + 2 * pad, h: Math.abs(ys[1] - ys[0]) + 2 * pad}, alpha};
  }
  return null;
};

export type Placed = {key: number; dx: number; dy: number; opacity: number; rect: Rect};

/**
 * Two plates that are the lines of one caption ("Nửa trên kênh" over "→ hạ đòn bẩy", Channel): free captions
 * of one colour and beat, same alignment and edge, stacked within two plate heights — drawn touching on
 * purpose, never pushed apart.
 */
export const stacked = (p: Pick<PlateSpec, 'anchor' | 'x' | 'base' | 'ui' | 'group'>, q: Pick<PlateSpec, 'anchor' | 'x' | 'base' | 'ui' | 'group'>): boolean =>
  !!p.group && p.group === q.group && p.anchor === q.anchor && Math.abs(p.x - q.x) < 3 && Math.abs(p.base - q.base) < LABEL_SIZE * Math.max(p.ui, q.ui) * 2.2;

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * Lays out every visible plate for one frame, in a fixed order (see framePlates — the same on every frame,
 * so nothing flips): fade by how far the plate's point is outside the frame; slide inside the frame; then
 * push off any plate already placed and any ringed candle or arrow head. A push goes along the axis the
 * plate has sunk in least, away from the other's centre (a level's plate slides along its line instead),
 * and is weighted by how much space the other holds, so a plate eases aside as a neighbour arrives and
 * eases back as it leaves. Every step is continuous in the camera: nothing jumps between frames.
 */
export const layoutPlates = (
  specs: PlateSpec[], view: View, obstacles: Obstacle[] = [],
  /** The painted photo: which side of another plate has room is judged here, not in the moving frame. */
  bounds?: Rect,
): Map<number, Placed> => {
  const z = view.z;
  const m = EDGE / z;
  const gap = GAP / z;
  const fade = FADE / z;
  const out = new Map<number, Placed>();
  const placed: {rect: Rect; alpha: number; spec: PlateSpec}[] = [];
  const inside = (r: Rect, axis?: 'x' | 'y'): Rect => {
    let {x, y} = r;
    if (axis !== 'y') {
      if (r.w > view.x1 - view.x0 - 2 * m) x = view.x0 + m;
      else x = clamp(x, view.x0 + m, view.x1 - m - r.w);
    }
    if (axis !== 'x') {
      if (r.h > view.y1 - view.y0 - 2 * m) y = view.y0 + m;
      else y = clamp(y, view.y0 + m, view.y1 - m - r.h);
    }
    return {...r, x, y};
  };
  const b = bounds ?? {x: view.x0, y: view.y0, w: view.x1 - view.x0, h: view.y1 - view.y0};
  for (const p of specs) {
    const r0 = plateRect(p);
    let opacity = 1;
    if (p.pin) {
      const [px, py] = p.pin;
      const dx = p.axis === 'x' ? 0 : Math.max(view.x0 - px, px - view.x1, 0);
      const dy = p.axis === 'y' ? 0 : Math.max(view.y0 - py, py - view.y1, 0);
      opacity = clamp(1 - Math.max(dx, dy) / fade, 0, 1);
    } else {
      // A free caption: fully visible while any of it is in frame, fading once it lies wholly beyond the edge.
      const dx = Math.max(view.x0 - (r0.x + r0.w), r0.x - view.x1, 0);
      const dy = Math.max(view.y0 - (r0.y + r0.h), r0.y - view.y1, 0);
      opacity = clamp(1 - Math.max(dx, dy) / fade, 0, 1);
    }
    let r = inside(r0);
    const others = [...placed.filter((o) => !stacked(p, o.spec)), ...obstacles.filter((o) => o.key !== p.key)];
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const {rect: q, alpha} of others) {
        if (alpha <= 0 || !overlaps(r, q, gap)) continue;
        const w = Math.min(1, alpha);
        if (p.axis === 'x') {
          // A level's plate rides its line, away from the frame edge it starts at.
          const to = p.anchor === 'end' ? q.x - gap - r.w : q.x + q.w + gap;
          r = inside({...r, x: r.x + (to - r.x) * w}, 'x');
        } else {
          // Along the axis it has sunk in least (a plate that meets another from the side is nudged sideways,
          // never sent round it), away from the other's centre — measured from the plate's own point (or, for
          // a free caption, its natural place), fixed on the photo, so the side never flips while the camera
          // moves. The far side only when the PHOTO has no room on the near one — judged on the painted photo,
          // which does not move, so the choice holds for the whole scene. A side the moving frame blocks is not
          // swapped (that would be a jump): the plate stays clamped, and a free caption that still overlaps
          // fades below. A vline's plate only moves along its line.
          const penX = Math.min(r.x + r.w + gap - q.x, q.x + q.w + gap - r.x);
          const penY = Math.min(r.y + r.h + gap - q.y, q.y + q.h + gap - r.y);
          if (p.axis !== 'y' && penX < penY) {
            const mine = p.pin ? p.pin[0] : r0.x + r0.w / 2;
            const right = q.x + q.w + gap, left = q.x - gap - r.w;
            let toRight = mine >= q.x + q.w / 2;
            if (toRight && right + r.w > b.x + b.w - m && left >= b.x + m) toRight = false;
            else if (!toRight && left < b.x + m && right + r.w <= b.x + b.w - m) toRight = true;
            const to = toRight ? right : left;
            r = inside({...r, x: r.x + (to - r.x) * w}, 'x');
          } else {
            const mine = p.pin ? p.pin[1] : r0.y + r0.h / 2;
            const below = q.y + q.h + gap, above = q.y - gap - r.h;
            let down = mine >= q.y + q.h / 2;
            if (down && below + r.h > b.y + b.h - m && above >= b.y + m) down = false;
            else if (!down && above < b.y + m && below + r.h <= b.y + b.h - m) down = true;
            const to = down ? below : above;
            r = inside({...r, y: r.y + (to - r.y) * w}, 'y');
          }
        }
        moved = true;
      }
      if (!moved) break;
    }
    if (!p.pin) {
      // A free caption yields: once it cannot be cleared off a plate that was placed before it, it fades
      // with the share it would cover — measured with the gap between them, so a caption pushed clear (one
      // gap away) stays whole and one squeezed closer is already fading when the two touch.
      let covered = 0;
      for (const {rect: q, alpha} of others) {
        const ix = Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x) + gap * 0.98;
        const iy = Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y) + gap * 0.98;
        if (ix > 0 && iy > 0) covered = Math.max(covered, ((ix * iy) / (r.w * r.h)) * Math.min(1, alpha));
      }
      opacity *= clamp(1 - covered * 6, 0, 1);
    }
    placed.push({rect: r, alpha: opacity * (p.alpha ?? 1), spec: p});
    out.set(p.key, {key: p.key, dx: r.x - r0.x, dy: r.y - r0.y, opacity, rect: r});
  }
  return out;
};

// ------------------------------------------------------------------------------------------------ fitting

/**
 * Fits a shot to the marks it has to show: every non-caption mark that first appears while the shot holds,
 * with its plate, stays inside the frame with FIT_MARGIN to spare — through the whole hold, drift included.
 * The shot keeps its intent: the zoom only drops as far as the marks need, and the centre only moves as far
 * as they need. Free captions (`label`) slide along the frame edge instead, and level lines only need their
 * height in frame (their plate follows the camera).
 */
export const fitShot = (shot: ImageShot, marks: ImageAnnotation[], g: Geo): ImageShot => {
  if (!marks.length) return shot;
  const ui = uiOf(Math.max(1, shot.zoom));
  const xs: number[] = [];
  const ys: number[] = [];
  const addRect = (r: Rect) => { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h); };
  const whole: View = {x0: g.shown.x, y0: g.shown.y, x1: g.shown.x + g.shown.w, y1: g.shown.y + g.shown.h, z: 1};
  for (const a of marks) {
    const plate = plateOf(a, 0, g, whole, ui);
    switch (a.kind) {
      case 'box': addRect({x: X(g, a.x), y: Y(g, a.y), w: a.w * g.full.w, h: a.h * g.full.h}); if (plate) addRect(plateRect(plate)); break;
      case 'circle': { const r = a.r * Math.min(g.full.w, g.full.h); addRect({x: X(g, a.x) - r, y: Y(g, a.y) - r, w: 2 * r, h: 2 * r}); if (plate) addRect(plateRect(plate)); break; }
      case 'arrow': xs.push(X(g, a.from[0]), X(g, a.to[0])); ys.push(Y(g, a.from[1]), Y(g, a.to[1])); if (plate) addRect(plateRect(plate)); break;
      case 'line': if (plate && plate.pin) { addRect(plateRect(plate)); xs.push(plate.pin[0]); ys.push(plate.pin[1]); } break;
      case 'hline': { const y = Y(g, a.y); ys.push(y + 2, plate ? y - 8 * ui - LABEL_SIZE * ui * 1.36 : y - 2); break; }
      case 'vline': { const x = X(g, a.x); xs.push(x - 2, x + 2); break; }
      default: break;
    }
  }
  const lo = (v: number[], s: number) => Math.max(Math.min(...v), s);
  const hi = (v: number[], e: number) => Math.min(Math.max(...v), e);
  const rx = xs.length ? [lo(xs, g.shown.x), hi(xs, g.shown.x + g.shown.w)] : null;
  const ry = ys.length ? [lo(ys, g.shown.y), hi(ys, g.shown.y + g.shown.h)] : null;
  const move = shot.move ?? 'push_in';
  const grow = move === 'push_in' || move === 'pull_out' ? 1 + DRIFT_SCALE : 1;
  // Pan/tilt drift moves the centre by ±DRIFT_SLIDE/2 of the photo over the hold: keep that as extra room.
  const slideX = move === 'pan' ? (DRIFT_SLIDE / Math.max(1, shot.zoom)) * 0.5 * g.full.w : 0;
  const slideY = move === 'tilt' ? (DRIFT_SLIDE / Math.max(1, shot.zoom)) * 0.5 * g.full.h : 0;
  let cap = Infinity;
  if (rx) cap = Math.min(cap, (g.W - 2 * FIT_MARGIN) / Math.max(1, rx[1] - rx[0] + 2 * slideX));
  if (ry) cap = Math.min(cap, (g.H - 2 * FIT_MARGIN) / Math.max(1, ry[1] - ry[0] + 2 * slideY));
  const zoom = Math.max(1, Math.min(shot.zoom, cap / grow));
  // Centre: inside the interval that keeps the marks in frame at the drift's tightest moment.
  const zr = zoom * grow;
  const halfW = g.W / 2 / zr, halfH = g.H / 2 / zr, mm = FIT_MARGIN / zr;
  let cx = X(g, shot.x), cy = Y(g, shot.y);
  if (rx) {
    const a = rx[1] + mm - halfW + slideX, b = rx[0] - mm + halfW - slideX;
    cx = a <= b ? clamp(cx, a, b) : (a + b) / 2;
  }
  if (ry) {
    const a = ry[1] + mm - halfH + slideY, b = ry[0] - mm + halfH - slideY;
    cy = a <= b ? clamp(cy, a, b) : (a + b) / 2;
  }
  return {...shot, x: (cx - g.full.x) / g.full.w, y: (cy - g.full.y) / g.full.h, zoom};
};

/** The marks a shot must show: the non-caption marks first drawn on a beat this shot holds, still on screen. */
export const marksForShot = (shots: ImageShot[], i: number, annotations: ImageAnnotation[]): ImageAnnotation[] => {
  const from = shots[i].beat ?? 0;
  const to = i + 1 < shots.length ? shots[i + 1].beat ?? 0 : Infinity;
  return annotations.filter((a) => {
    const b = a.beat ?? 0;
    return a.kind !== 'label' && b >= from && b < to && (a.until === undefined || a.until >= from);
  });
};

export const fitShots = (shots: ImageShot[], annotations: ImageAnnotation[], g: Geo): ImageShot[] =>
  shots.map((s, i) => fitShot(s, marksForShot(shots, i, annotations), g));

// ------------------------------------------------------------------------------------------------ one frame

/**
 * When a beat's marks start drawing: first-beat marks wait for the reveal; a later beat's marks wait for the
 * camera to settle on that beat's framing (45% of the move), so they draw where the eye has arrived
 * instead of while the frame still moves.
 */
export const settleDelay = (fitted: ImageShot[] | null, beat: number, beatStarts: number[]): number => {
  if (beat === 0) return REVEAL - 6;
  if (!fitted) return 4;
  const i = fitted.findIndex((s) => (s.beat ?? 0) === beat);
  return i > 0 ? Math.round(moveLength(fitted, i, beatStarts) * 0.45) : 4;
};

export type MarkState = {a: ImageAnnotation; k: number; at: number; gone: number; s: number};

/**
 * Each mark's state on a frame: drawn from its beat on (`s` 0..1, through `pop`, the house spring), cleared
 * over 8 frames once the beat after its `until` starts. Staggered by position WITHIN the beat (measured
 * 2026-09-23: staggering over the whole list made beat-2 marks two seconds late).
 */
export const markStates = (
  annotations: ImageAnnotation[], beatIndex: number, beatFrame: number,
  delayOf: (beat: number) => number, pop: (frame: number, delay: number) => number,
): MarkState[] => {
  const out: MarkState[] = [];
  annotations.forEach((a, k) => {
    const at = a.beat ?? 0;
    if (beatIndex < at) return;
    const gone = a.until === undefined || beatIndex <= a.until ? 0 : beatIndex === a.until + 1 ? clamp(beatFrame / 8, 0, 1) : 1;
    if (gone >= 1) return;
    const kInBeat = annotations.slice(0, k).filter((b) => (b.beat ?? 0) === at).length;
    const s = beatIndex === at ? clamp(pop(beatFrame, delayOf(at) + kInBeat * 5), 0, 1) : 1;
    out.push({a, k, at, gone, s});
  });
  return out;
};

/** Attached labels arrive just after their shape starts drawing; a free label fades with its pop. */
export const plateAlpha = (st: MarkState): number => (st.a.kind === 'label' ? st.s : Math.max(0, st.s * 1.4 - 0.4));

/**
 * The space a mark's plate holds before it is drawn: from frame 0 for the first beat's marks (all placed
 * before the first one appears, so none shoves another as it pops in), and over the camera's move into a
 * later beat for that beat's marks — so whatever has to make room glides aside with the camera instead of
 * being shoved when the new plate pops in.
 */
export const reserveOf = (fitted: ImageShot[] | null, beatIndex: number, beatFrame: number, beatStarts: number[]) => (st: MarkState): number => {
  if (st.at < beatIndex || st.at === 0) return 1;
  if (!fitted) return plateAlpha(st);
  const i = fitted.findIndex((s) => (s.beat ?? 0) === st.at);
  if (i <= 0) return plateAlpha(st);
  return clamp(beatFrame / moveLength(fitted, i, beatStarts), 0, 1);
};

/**
 * Every plate of a frame, laid out together: plates that belong to a point first, free captions after them
 * (a caption yields to a level's or a candle's plate, never the other way round); inside each group earlier
 * beats first (a new beat's plate never shoves an old one), then list order. The ringed candles and arrow
 * heads are obstacles. A plate that is clearing (`until`) no longer holds its place — the next beat may
 * take that space — and is placed against the others without pushing them.
 */
export const framePlates = (
  live: MarkState[], g: Geo, view: View, ui: number,
  reserve: (st: MarkState) => number = plateAlpha,
): Map<number, {spec: PlateSpec; placed: Placed; alpha: number}> => {
  const free = (st: MarkState) => (st.a.kind === 'label' ? 1 : 0);
  const order = [...live].sort((p, q) => free(p) - free(q) || p.at - q.at || p.k - q.k);
  const specs: PlateSpec[] = [];
  const ghost: PlateSpec[] = [];
  const byKey = new Map<number, MarkState>();
  for (const st of order) {
    byKey.set(st.k, st);
    const hold = Math.max(plateAlpha(st), reserve(st));
    if (hold <= 0) continue;
    const spec = plateOf(st.a, st.k, g, view, ui);
    if (!spec) continue;
    (st.gone > 0 ? ghost : specs).push({...spec, alpha: hold});
  }
  const obstacles = live
    .filter((st) => st.gone === 0)
    .map((st) => obstacleOf(st.a, st.k, g, ui, Math.max(reserve(st), st.a.kind === 'arrow' ? Math.min(1, st.s * 1.6) : st.s)))
    .filter((o): o is Obstacle => !!o && o.alpha > 0);
  const laid = layoutPlates(specs, view, obstacles, g.shown);
  // The clearing plates are laid out together, against the same obstacles, so each keeps the place it held while
  // live: laid out one by one, a plate that had been pushed off a neighbour snapped back for a frame as both cleared
  // ("MA200 1796,12" over "MA50 1775,98 · Kháng cự 1776,85" in the weekly's watch, frame-audit jump, 2026-10-06).
  for (const [key, one] of layoutPlates(ghost, view, obstacles, g.shown)) laid.set(key, one);
  const out = new Map<number, {spec: PlateSpec; placed: Placed; alpha: number}>();
  for (const spec of [...specs, ...ghost]) {
    const st = byKey.get(spec.key)!;
    const placed = laid.get(spec.key);
    if (placed) out.set(spec.key, {spec, placed, alpha: plateAlpha(st) * (1 - st.gone)});
  }
  return out;
};
