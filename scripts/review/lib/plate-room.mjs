/**
 * Free room for the label plates on a calibrated chart photo (user 2026-10-01: "not be overlap"; CLAUDE.md:
 * labels sit on plates in EMPTY areas, never on candles). The scaffold used to put a plate at a fixed offset
 * from the candle it talks about — "Đóng cửa …" 0.11 above today's close — and on 1/10 that offset landed on
 * the September rally. Here every `label` mark of a scene is moved to the nearest spot where its plate
 * covers no candle, no volume bar, no other mark and no plate placed before it, inside what the camera shows
 * on the plate's beat. Candles come from the photo's calibration and the bars it was fitted on, so the rule is
 * the same for every edition and every photo.
 *
 *   const room = plateRoom({photo, bars, unit, crop, volumeBand});
 *   visual: indexPhoto(room.settle(marks, shots))   // {annotations, shots}: labels moved, other marks untouched
 *   room.report                                     // what moved and why, for the console
 *
 * When a mark's label has no free spot in its beat's frame, that beat's shot is zoomed out (same centre, by
 * steps, never below 1) until it has — a close-up that leaves no room for its own label is too close.
 *
 * Geometry mirrors ImagePanel / src/lib/photoLayout.ts: the crop is fitted (contain) into the 1000×752 photo
 * panel, a plate is 20 px JetBrains Mono (0.6 em a glyph) plus 7 px padding, 1.36 em tall, shrunk by zoom^-0.6
 * inside a zoomed shot, and kept 10 px off the frame's edge.
 */

const LABEL = 20;
/** Screen px a placed plate keeps from the frame's edge (ImagePanel's own slide-in keeps 10; a plate parked there
 *  reads as cut by the panel border — QA 2/10, market beat 3). */
const EDGE = 16;
const PANEL = {w: 1000, h: 752};
/** Screen px kept between a plate and a candle, a mark or another plate. */
const CLEAR = 4;
/** Candidate grid, in screen px. */
const STEP_X = 6;
const STEP_Y = 3;
/**
 * A label within this many screen px of an arrow, ring or box belongs to it (the scaffold puts a mark's label
 * 30–130 px from the mark); farther, it is a free caption (the scaffold's headers sit 290+ px from any mark).
 */
const NEAR = 150;

const r4 = (n) => Math.round(n * 1e4) / 1e4;

/**
 * @param photo       {W, H, calib} — the scaffold's photo() record; calib from calib_auto.py (n, d, last_x, a, b, pane)
 * @param bars        the series the calibration was fitted on, oldest first, ending at the photo's last candle
 * @param unit        price × unit = the photo's quote (the terminal quotes the index in thousands)
 * @param crop        the visual's crop (whole-photo fractions), or null
 * @param volumeBand  share of the calibration pane's height at its bottom that holds the volume overlay (FireAnt: 0.3)
 */
export const plateRoom = ({photo, bars, unit = 1, crop = null, volumeBand = 0, box = PANEL}) => {
  const {W, H, calib} = photo;
  const C = crop ?? {x: 0, y: 0, w: 1, h: 1};
  const s = Math.min(box.w / (W * C.w), box.h / (H * C.h));     // panel px per photo px at zoom 1
  const fx = (px) => px / (W * s);                                // panel px → photo fraction (x)
  const fy = (px) => px / (H * s);                                // panel px → photo fraction (y)
  const yOf = (price) => (calib.a + calib.b * price * unit) / H;
  const pane = calib.pane
    ? {x0: calib.pane[0] / W, y0: calib.pane[1] / H, x1: calib.pane[2] / W, y1: calib.pane[3] / H}
    : {x0: C.x, y0: C.y, x1: C.x + C.w, y1: C.y + C.h};
  // The candles the photo shows, as photo-fraction boxes from wick to wick — and, on a chart whose volume is an
  // overlay at the bottom of the price pane (FireAnt), each session's volume bar: TradingView scales the overlay
  // to the largest volume on screen, filling `volumeBand` of the pane's height.
  const vis = bars.slice(-calib.n);
  const half = calib.d / 2 / W;
  const vMax = Math.max(1, ...vis.map((b) => b.v ?? 0));
  const candles = [];
  const volumes = [];
  vis.forEach((b, i) => {
    const cx = (calib.last_x - calib.d * (calib.n - 1 - i)) / W;
    const top = yOf(b.h), bottom = yOf(b.l);
    candles.push({x: cx - half, y: Math.min(top, bottom), w: 2 * half, h: Math.abs(bottom - top)});
    if (volumeBand > 0 && b.v) {
      const vh = (b.v / vMax) * volumeBand * (pane.y1 - pane.y0);
      volumes.push({x: cx - half, y: pane.y1 - vh, w: 2 * half, h: vh});
    }
  });
  // Where plates may go: inside the crop, left of the price axis, above the pane's bottom. The strip between the
  // crop's top and the pane is the masked legend — empty, and usable.
  const allowed = {x0: Math.max(pane.x0, C.x), x1: Math.min(pane.x1, C.x + C.w), y0: C.y, y1: Math.min(pane.y1, C.y + C.h)};
  const report = [];

  /**
   * What a shot shows, in photo fractions, at its zoom: `full` is the frame, x0..y1 the part a plate may use —
   * 3% off each edge for the hold's drift (push-in grows 6%).
   */
  const viewOf = (shot) => {
    const z = Math.max(1, shot?.zoom ?? 1);
    const hw = fx(box.w / 2 / z), hh = fy(box.h / 2 / z);
    const axis = (c, h, lo, hi) => {
      if (2 * h >= hi - lo) return [lo, hi];
      const a = Math.min(Math.max(c - h, lo), hi - 2 * h);
      return [a, a + 2 * h];
    };
    const [fx0, fx1] = axis(shot?.x ?? C.x + C.w / 2, hw, C.x, C.x + C.w);
    const [fy0, fy1] = axis(shot?.y ?? C.y + C.h / 2, hh, C.y, C.y + C.h);
    const ix = (fx1 - fx0) * 0.03, iy = (fy1 - fy0) * 0.03;
    return {x0: fx0 + ix, x1: fx1 - ix, y0: fy0 + iy, y1: fy1 - iy, z, full: {x0: fx0, x1: fx1, y0: fy0, y1: fy1}};
  };
  const shotAt = (shots, beat) => {
    let pick = shots?.[0];
    for (const sh of shots ?? []) if ((sh.beat ?? 0) <= beat) pick = sh;
    return pick;
  };

  /** A plate's box for a label at (x, y) — y is the text baseline, as ImagePanel draws it. */
  const plateBox = (text, x, y, anchor, ui) => {
    const size = LABEL * ui;
    const w = fx([...text].length * size * 0.6 + 14 * ui);
    const h = fy(size * 1.36);
    const left = anchor === 'end' ? x - w + fx(7 * ui) : anchor === 'middle' ? x - w / 2 : x - fx(7 * ui);
    return {x: left, y: y - fy(size * 1.02), w, h};
  };
  const hit = (a, b, gx, gy) => a.x < b.x + b.w + gx && b.x < a.x + a.w + gx && a.y < b.y + b.h + gy && b.y < a.y + a.h + gy;

  /** The space every non-label mark takes (and the plate an hline shows at the frame's left/right edge). */
  const markBoxes = (a, view, ui) => {
    const X = a.x, Y = a.y;
    switch (a.kind) {
      case 'circle': { const r = a.r * Math.min(W * s, H * s); return [{x: X - fx(r), y: Y - fy(r), w: 2 * fx(r), h: 2 * fy(r)}]; }
      case 'box': return [{x: X, y: Y, w: a.w, h: a.h}];
      case 'arrow': {
        const pad = 9 * ui * (a.weight ?? 1);
        const x0 = Math.min(a.from[0], a.to[0]), x1 = Math.max(a.from[0], a.to[0]);
        const y0 = Math.min(a.from[1], a.to[1]), y1 = Math.max(a.from[1], a.to[1]);
        const out = [{x: x0 - fx(pad), y: y0 - fy(pad), w: x1 - x0 + 2 * fx(pad), h: y1 - y0 + 2 * fy(pad)}];
        if (a.label) out.push(plateBox(a.label, a.from[0], a.from[1] - fy(10 * ui), a.to[0] < a.from[0] ? 'end' : 'start', ui));
        return out;
      }
      case 'hline': {
        const out = [{x: view.x0, y: Y - fy(2), w: view.x1 - view.x0, h: fy(4)}];
        if (a.label) {
          const left = a.labelSide === 'left';
          const x = left ? view.x0 + (view.x1 - view.x0) * 0.03 : view.x0 + (view.x1 - view.x0) * 0.97;
          out.push(plateBox(a.label, x, Y - fy(8 * ui), left ? 'start' : 'end', ui));
        }
        return out;
      }
      case 'vline': return [{x: X - fx(2), y: view.y0, w: fx(4), h: view.y1 - view.y0}];
      default: return [];
    }
  };
  const alive = (a, beat) => (a.beat ?? 0) <= beat && (a.until === undefined || a.until >= beat);
  // The source chip ("ẢNH · FIREANT.VN", ~200×32 px) sits 16 px from the frame's right and 14 px from its bottom, in screen space.
  const chipBox = (view) => ({x: view.full.x1 - fx(16 + 200) / view.z, y: view.full.y1 - fy(14 + 32) / view.z, w: fx(200) / view.z, h: fy(32) / view.z});

  /**
   * Moves every `label` (and every stack of label lines: same beat and alignment, one under the other) to the
   * free spot nearest where the scaffold put it, inside the frame of its beat's shot. Labels are settled in beat
   * order, then list order; a settled plate is an obstacle for the rest while both are on screen.
   */
  const settle = (marks, shotsIn) => {
    const out = marks.map((m) => ({...m}));
    const shots = (shotsIn ?? []).map((sh) => ({...sh}));
    const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const labels = out.map((m, i) => ({m, i})).filter(({m}) => m.kind === 'label');
    // Stacks: consecutive label lines, same beat, same alignment and x, spaced like plates at zoom 1 (the
    // scaffold stacks them 0.04 apart) — they move as one block.
    const lineH = fy(LABEL * 1.36);
    const groups = [];
    for (const l of labels) {
      const g = groups.at(-1);
      const last = g?.at(-1)?.m;
      if (last && (last.beat ?? 0) === (l.m.beat ?? 0) && (last.anchor ?? 'start') === (l.m.anchor ?? 'start') && Math.abs(last.x - l.m.x) < 0.002 && Math.abs(last.y - l.m.y) < lineH * 1.7 && (last.until ?? null) === (l.m.until ?? null)) g.push(l);
      else groups.push([l]);
    }
    // A label that sits by a mark (an arrow, a ring, a box…) is that mark's and settles first; a free caption
    // ("4/25 phiên phân phối" at the top) settles after them, so it never takes the room a mark's label needs.
    const near = (m) => out.some((o) => o.kind !== 'label' && (o.beat ?? 0) <= (m.beat ?? 0) && o.kind !== 'hline' && o.kind !== 'vline'
      && Math.hypot(((o.to?.[0] ?? o.from?.[0] ?? o.x) - m.x) * W * s, ((o.to?.[1] ?? o.from?.[1] ?? o.y) - m.y) * H * s) < NEAR);
    const rank = (g) => (g.some(({m}) => near(m)) ? 0 : 1);
    groups.sort((a, b) => rank(a) - rank(b) || (a[0].m.beat ?? 0) - (b[0].m.beat ?? 0) || a[0].i - b[0].i);
    let settled = [];
    const original = out.map((m) => ({...m}));
    // First the labels of marks: nearest free spot (zooming the shot out if they must) — a label belongs next to
    // its arrow or ring. Then free captions, which are headers: the top quarter of their frame, else the bottom
    // quarter, else the nearest free spot left — never parked beside some other mark mid-chart if a band is free.
    const placeGroup = (g, mode, overVolume = false) => {
      const beat = g[0].m.beat ?? 0;
      const free0 = rank(g) === 1;
      const shot = shotAt(shots, beat);
      const lifeOf = (m) => [m.beat ?? 0, m.until ?? Infinity];
      const [from, to] = lifeOf(g[0].m);
      const overlapsLife = (m) => { const [f, t] = lifeOf(m); return f <= to && from <= t; };
      // One try in a given frame: the free spot nearest where the scaffold put the block, or null.
      const tryIn = (view) => {
        // The largest the plate gets while it is on screen: the widest framing from its beat on.
        const zMin = Math.min(view.z, ...shots.filter((sh) => (sh.beat ?? 0) >= beat).map((sh) => Math.max(1, sh.zoom ?? 1)));
        const ui = Math.pow(zMin, -0.6);
        const plates = g.map(({m}) => plateBox(m.text, m.x, m.y, m.anchor ?? 'start', ui * (m.size ?? 1)));
        const block = {x: Math.min(...plates.map((p) => p.x)), y: Math.min(...plates.map((p) => p.y)), x1: Math.max(...plates.map((p) => p.x + p.w)), y1: Math.max(...plates.map((p) => p.y + p.h))};
        const bw = block.x1 - block.x, bh = block.y1 - block.y;
        // Obstacles: candles (and volume bars), other marks alive with it, plates settled before it that share its time.
        const obstacles = overVolume ? [...candles] : [...candles, ...volumes];
        for (const m of out) if (m.kind !== 'label' && overlapsLife(m)) obstacles.push(...markBoxes(m, view, ui));
        for (const p of settled) if (overlapsLife(p.m)) obstacles.push(p.box);
        obstacles.push(chipBox(view));
        // A mark's label keeps clear of the hold's drift; a free caption may use the whole frame, as ImagePanel lets it.
        const f = free0 ? view.full : view;
        const mx = fx(EDGE / view.z), my = fy(EDGE / view.z);
        const lo = {x: Math.max(f.x0 + mx, allowed.x0), y: Math.max(f.y0 + my, allowed.y0)};
        const hi = {x: Math.min(f.x1 - mx, allowed.x1) - bw, y: Math.min(f.y1 - my, allowed.y1) - bh};
        if (mode === 'top') hi.y = Math.min(hi.y, lo.y + (f.y1 - f.y0) * 0.25);
        if (mode === 'bottom') lo.y = Math.max(lo.y, hi.y - (f.y1 - f.y0) * 0.25);
        if (lo.x > hi.x || lo.y > hi.y) return null;
        const gx = fx(CLEAR), gy = fy(CLEAR);
        const isFree = (x, y) => {
          const r = {x, y, w: bw, h: bh};
          for (const o of obstacles) if (hit(r, o, gx, gy)) return false;
          return true;
        };
        if (block.x >= lo.x && block.x <= hi.x && block.y >= lo.y && block.y <= hi.y && isFree(block.x, block.y)) return {dx: 0, dy: 0, cost: 0, plates};
        let best = null;
        const sx = fx(STEP_X), sy = fy(STEP_Y);
        for (let y = lo.y; y <= hi.y + 1e-9; y += sy) {
          for (let x = lo.x; x <= hi.x + 1e-9; x += sx) {
            // Screen distance from where the scaffold wanted it; sideways costs more than up/down, so a plate stays
            // over (or under) the candles it talks about.
            const cost = Math.hypot((x - block.x) * W * s * 1.5, (y - block.y) * H * s);
            if (best && cost >= best.cost) continue;
            if (isFree(x, y)) best = {dx: x - block.x, dy: y - block.y, cost, plates};
          }
        }
        return best;
      };
      let view = viewOf(shot);
      let best = tryIn(view);
      if (!best && (mode === 'top' || mode === 'bottom')) return false;
      let zoomedFrom = null;
      if (!best && mode !== 'try' && free0 && shot && (shot.zoom ?? 1) > 1 && mode === 'near') {
        // A caption with no room in a close-up: the close-up gives way (wider by steps), as for a mark's label.
        zoomedFrom = shot.zoom;
        while (!best && shot.zoom > 1) {
          shot.zoom = r4(Math.max(1, shot.zoom * 0.9));
          view = viewOf(shot);
          best = tryIn(view);
        }
      }
      if (!best && !free0 && shot && (shot.zoom ?? 1) > 1) {
        zoomedFrom = shot.zoom;
        while (!best && shot.zoom > 1) {
          shot.zoom = r4(Math.max(1, shot.zoom * 0.9));
          view = viewOf(shot);
          best = tryIn(view);
        }
      }
      const what = g.map(({m: lm}) => `"${lm.text}"`).join(' + ');
      if (!best) {
        if (zoomedFrom != null) shot.zoom = zoomedFrom;
        if (mode === 'try') return false;
        // Never left outside the frame: the spot fully inside it that covers the least (candles first).
        view = viewOf(shot);
        const zMin = Math.min(view.z, ...shots.filter((sh) => (sh.beat ?? 0) >= beat).map((sh) => Math.max(1, sh.zoom ?? 1)));
        const ui = Math.pow(zMin, -0.6);
        const plates = g.map(({m}) => plateBox(m.text, m.x, m.y, m.anchor ?? 'start', ui * (m.size ?? 1)));
        const bx = Math.min(...plates.map((p) => p.x)), by = Math.min(...plates.map((p) => p.y));
        const bw = Math.max(...plates.map((p) => p.x + p.w)) - bx, bh = Math.max(...plates.map((p) => p.y + p.h)) - by;
        const f = view.full, mx = fx(EDGE / view.z), my = fy(EDGE / view.z);
        const lo = {x: Math.max(f.x0 + mx, allowed.x0), y: Math.max(f.y0 + my, allowed.y0)};
        const hi = {x: Math.max(lo.x, Math.min(f.x1 - mx, allowed.x1) - bw), y: Math.max(lo.y, Math.min(f.y1 - my, allowed.y1) - bh)};
        const obs = [...candles, ...volumes, ...settled.filter((p) => overlapsLife(p.m)).map((p) => p.box)];
        let pick = {x: Math.min(Math.max(bx, lo.x), hi.x), y: Math.min(Math.max(by, lo.y), hi.y), c: Infinity};
        for (let y = lo.y; y <= hi.y + 1e-9; y += fy(STEP_Y)) for (let x = lo.x; x <= hi.x + 1e-9; x += fx(STEP_X)) {
          const r = {x, y, w: bw, h: bh};
          let c = 0;
          for (const o of obs) c += area(r, o);
          c += 1e-9 * Math.hypot(x - bx, y - by);
          if (c < pick.c) pick = {x, y, c};
        }
        for (const [k, {m: lm, i}] of g.entries()) {
          out[i] = {...lm, x: r4(lm.x + pick.x - bx), y: r4(lm.y + pick.y - by)};
          settled.push({m: out[i], box: {...plates[k], x: plates[k].x + pick.x - bx, y: plates[k].y + pick.y - by}});
        }
        report.push(`${what}: no free room in beat ${beat}'s frame even zoomed out — placed fully inside it where it covers least`);
        return true;
      }
      if (overVolume) report.push(`${what}: over the volume bars — no room clear of them`);
      for (const [k, {m: lm, i}] of g.entries()) {
        out[i] = {...lm, x: r4(lm.x + best.dx), y: r4(lm.y + best.dy)};
        settled.push({m: out[i], box: {...best.plates[k], x: best.plates[k].x + best.dx, y: best.plates[k].y + best.dy}});
      }
      if (zoomedFrom != null) report.push(`beat ${beat}'s shot zoomed out ${zoomedFrom} → ${shot.zoom} to make room for ${what}`);
      if (best.cost > 0) report.push(`${what}: moved ${Math.round(best.dx * W * s)} px, ${Math.round(best.dy * H * s)} px off the candles`);
      return true;
    };
    // A mark's label: as one block, else line by line, else over the volume bars (never over candles).
    const placeLabels = () => {
      for (const g of groups.filter((x) => rank(x) === 0)) {
        if (placeGroup(g, 'try')) continue;
        const lines = g.length > 1 ? g.map((l) => [l]) : [g];
        for (const l of lines) if (!placeGroup(l, 'try')) placeGroup(l, 'near', true);
      }
      for (const g of groups.filter((x) => rank(x) === 1)) if (!placeGroup(g, 'top') && !placeGroup(g, 'bottom')) placeGroup(g, 'near');
    };
    // Two rounds: the first settles how far each beat's shot must widen for its labels; then the level lines
    // take their room along the line at those framings (their words name the line, so they choose first), and
    // the labels are laid again around them.
    const mark0 = report.length;
    placeLabels();
    const zooms = report.slice(mark0).filter((l) => l.startsWith('beat '));
    report.length = mark0;
    report.push(...zooms);
    for (const [i, m] of original.entries()) if (m.kind === 'label') out[i] = {...m};
    settled = [];
    levelPass();
    placeLabels();
    // A level line's plate rides the left or the right edge of the frame (ImagePanel). Pick the side where it
    // covers the fewest candles, volume bars and other marks over every beat the line is on screen — the rally
    // low's plate sat on the very wicks that made the low (QA 2/10).
    // Runs before the labels; the labels then avoid the plates it lays along the lines.
    function levelPass() {
    const grow = (r) => ({x: r.x - fx(CLEAR), y: r.y - fy(CLEAR), w: r.w + 2 * fx(CLEAR), h: r.h + 2 * fy(CLEAR)});
    for (const [i, a] of out.entries()) {
      if (a.kind !== 'hline' || !a.label) continue;
      const beats = [...new Set(shots.map((sh) => sh.beat ?? 0))].filter((b) => b >= (a.beat ?? 0) && (a.until === undefined || b <= a.until));
      if (!beats.length) beats.push(a.beat ?? 0);
      const cost = (side) => {
        let c = 0;
        for (const b of beats) {
          const v = viewOf(shotAt(shots, b));
          if (a.y < v.full.y0 || a.y > v.full.y1) continue;
          const ui = Math.pow(v.z, -0.6);
          const x = side === 'left' ? v.full.x0 + (v.full.x1 - v.full.x0) * 0.03 : v.full.x0 + (v.full.x1 - v.full.x0) * 0.97;
          // ±6% of the frame's width: ImagePanel fits the camera to the beat's marks and the hold drifts, so
          // the edge the plate rides can sit a little left or right of this estimate.
          const tol = (v.full.x1 - v.full.x0) * 0.06;
          const p0 = grow(plateBox(a.label, x, a.y - fy(8 * ui), side === 'left' ? 'start' : 'end', ui));
          const plate = {...p0, x: p0.x - tol, w: p0.w + 2 * tol};
          for (const o of [...candles, ...volumes, ...settled.map((q) => q.box)]) c += area(plate, o);
          for (const m of out) if (m !== a && m.kind !== 'label' && m.kind !== 'hline') for (const o of markBoxes(m, v, ui)) c += area(plate, o);
          // The price axis right of the pane carries FireAnt's own figures: as bad as a candle.
          c += area(plate, {x: allowed.x1, y: 0, w: 1, h: 1});
        }
        return c;
      };
      const now = a.labelSide === 'left' ? 'left' : 'right';
      const other = now === 'left' ? 'right' : 'left';
      const [cn, co] = [cost(now), cost(other)];
      if (co < cn * 0.5) {
        out[i] = {...a, labelSide: other};
        report.push(`"${a.label}": plate moved to the ${other} edge, off ${Math.round(cn * W * H * s * s)} px² of candles`);
      }
      if (Math.min(cn, co) * W * H * s * s < 40) continue;
      // Both edges cover candles (or FireAnt's axis): the level's words become a plate of their own, laid right
      // along the line — just above or just below it — where it is free, in the stretch of the line every beat
      // shows if there is one. The line keeps no edge plate.
      const shown = beats.map((b) => [b, viewOf(shotAt(shots, b))]).filter(([, v]) => a.y >= v.full.y0 && a.y <= v.full.y1);
      const views = shown.map(([, v]) => v);
      if (!views.length) continue;
      const zMin = Math.min(...views.map((v) => v.z));
      const uiAll = Math.pow(zMin, -0.6);
      const ui = uiAll;
      const obs = [...candles, ...settled.map((q) => q.box)];
      for (const m of out) if (m !== a && m.kind !== 'label') obs.push(...markBoxes(m, views[0], ui).filter((o) => m.kind !== 'hline' || o.h > fy(5)));
      const tryRange = (x0, x1, overVolume = false, ui = uiAll) => {
        const size = LABEL * ui;
        let best = null;
        const blockers = overVolume ? obs : [...obs, ...volumes];
        const probe = plateBox(a.label, 0, 0, 'start', ui);
        for (const [below, base] of [[false, a.y - fy(4) - fy(size * 0.34)], [true, a.y + fy(4) + fy(size * 1.02)]]) {
          for (let x = x0; x <= x1 - probe.w + 1e-9; x += fx(STEP_X)) {
            const box = plateBox(a.label, x + fx(7 * ui), base, 'start', ui);
            if (box.y < allowed.y0 || box.y + box.h > allowed.y1) continue;
            if (blockers.some((o) => hit(box, o, fx(CLEAR), fy(CLEAR)))) continue;
            const cost = Math.abs(x - x0) * W * s + (below ? 40 : 0);
            if (!best || cost < best.cost) best = {x: x + fx(7 * ui), base, box, cost, below};
          }
        }
        return best;
      };
      const m = (v) => [Math.max(v.full.x0 + fx(EDGE / v.z), allowed.x0), Math.min(v.full.x1 - fx(EDGE / v.z), allowed.x1)];
      const common = views.map(m).reduce((r, q) => [Math.max(r[0], q[0]), Math.min(r[1], q[1])]);
      // Clear of candles AND volume bars if possible; else over the volume bars (a plate under the level, on the
      // tops of the volume bars, still reads — on the candles it names it does not). One spot every beat shows if
      // there is one; else one plate per beat, each inside its own beat's frame (ImagePanel would slide a plate
      // that is off screen back in at the frame's edge — onto whatever is there).
      const find = (r, u = uiAll) => (r[1] > r[0] ? tryRange(r[0], r[1], false, u) ?? tryRange(r[0], r[1], true, u) : null);
      const common1 = find(common);
      // One plate per beat, each sized for its own beat's zoom.
      const perBeat = common1 ? null : views.map((v) => find(m(v), Math.pow(v.z, -0.6)));
      if (!common1 && perBeat.some((x) => !x)) continue;
      const {label, labelSide, ...line} = out[i];
      out[i] = line;
      const add = (spot, extra) => {
        out.push({kind: 'label', x: r4(spot.x), y: r4(spot.base), text: label, accent: a.accent ?? 'gold', ...extra});
        settled.push({m: out.at(-1), box: spot.box});
      };
      const beatsShown = shown.map(([b]) => b);
      if (common1) add(common1, {beat: a.beat ?? 0, ...(a.until !== undefined ? {until: a.until} : {})});
      else perBeat.forEach((spot, k) => add(spot, {beat: beatsShown[k], ...(k < perBeat.length - 1 ? {until: beatsShown[k]} : a.until !== undefined ? {until: a.until} : {})}));
      report.push(`"${label}": both edges sit on candles — plate laid along the line where it is free${common1 ? '' : ', one per beat'}`);
    }
    };
    return {annotations: out, shots};
  };

  return {settle, report, candles, allowed, viewOf};
};
