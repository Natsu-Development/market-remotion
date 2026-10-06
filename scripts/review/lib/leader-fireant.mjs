/**
 * A leader scene on the symbol's own FireAnt DAILY chart. User 2026-10-01: "With each symbol review let's get its
 * chart from FireAnt and draw on it since the chart on the terminal also include the trendline break and its so
 * confused and annoy" — and "The FireAnt also have the MA50 and MA200 for this symbol refer it not need
 * self-calculation". So the marks REFER to the moving averages FireAnt draws itself: their values are what FireAnt
 * prints, read off the photo by scripts/review/fireant_ma.py into <sym>-fireant.ma.json. Nothing here computes an
 * average; "% trên MA50" is the price over FireAnt's own MA50.
 *
 * Pure. In: the photo (scaffold's photo(): rel, W, H, calib), its MA reading, the session's bars (the symbol's
 * /analyze price_history, for date → x), the leader's fact-pack entry, and — when the symbol-reviewer agent
 * (.claude/agents/symbol-reviewer.md) wrote one — its review (content/review/symbols/<date>/<SYM>.json, interface B:
 * marks in PRICE/DATE terms). Out: the scene's `visual`, the brief's detail line, and every number printed
 * (`numbers`, so facts.mjs can carry them and verify trace them).
 *
 * Plates are PLACED, not pinned (house rule: a label never sits on candles; the user, 2026-10-01: "not be overlap or
 * cut by zoom-in or zoom-out"): every text plate of a beat is put inside that beat's camera view, clear of candles
 * (from the bars + calibration), volume bars (measured on the photo), the price scale, the source chip and the
 * other plates. A line that carries on into the close-up gets a second plate placed for the close-up; the first one
 * clears (`until`) when the camera moves.
 */
import {round, signed, vi} from './common.mjs';

const clamp = (n) => Math.min(1, Math.max(0, round(n, 4)));
const pct = (n, dp = 1) => `${signed(n, dp)}%`;

/** The accent whose colour is nearest FireAnt's line colour, so a plate reads as its line's (no blue accent: white). */
const ACCENT_RGB = {gold: [243, 192, 25], green: [46, 204, 113], red: [229, 51, 58], white: [235, 235, 235]};
export const nearestAccent = (rgb) => {
  if (!Array.isArray(rgb)) return 'white';
  let best = 'white';
  let bd = Infinity;
  for (const [name, c] of Object.entries(ACCENT_RGB)) {
    const dist = Math.hypot(rgb[0] - c[0], rgb[1] - c[1], rgb[2] - c[2]);
    if (dist < bd) { bd = dist; best = name; }
  }
  return bd < 150 ? best : 'white';
};

/**
 * FireAnt's chart at 1080 wide (rules.shots.fireantStock): the frame of the VNINDEX daily photo — crop off the site
 * header, tab strip, toolbar, drawing bar, right sidebar and range bar; masks over the OHLC/legend rows (measured per
 * photo by fireant_ma.py), the legend's collapse button under them, the TradingView logo and the axis gear.
 */
export const DEFAULT_SPEC = {
  cropRect: {x: 0.0574, y: 0.1592, w: 0.9102, h: 0.7982},
  fixedMasks: [
    {x: 0.0648, y: 0.8593, w: 0.0407, h: 0.0507},
    {x: 0.9287, y: 0.9181, w: 0.0278, h: 0.03},
  ],
  /** Where FireAnt's price scale starts (x) and its event markers/time axis begin (y), photo fractions. */
  scaleX: 0.9037,
  floorY: 0.885,
};

// ImagePanel's geometry (src/scenes/ImagePanel.tsx, LAYOUT.imagePanel): a 1000×752 box, plates of 20 px type at zoom 1
// shrinking as zoom^-0.6, 7 px side padding, the source chip bottom-right (~190×30 px, 16 px from the right, 14 from
// the bottom). A shot drifts ±6 % in scale while it holds.
const BOX_W = 1000;
const BOX_H = 752;
const LABEL = 20;
const DRIFT = 1.06;

export const fireantLeaderVisual = (args) => {
  const {L, p, ma, review = null, bars = [], date, spec = {}, spiking = false, volLabel = null, maskColor} = args;
  const S = {...DEFAULT_SPEC, ...spec};
  // Price + volume only (QA 4/10: FireAnt's MACD pane took ~30% of the wide shot and shrank every plate on a phone): the
  // crop runs from the price pane's top down to the volume floor, at the panel's 1.42 ratio, keeping the right edge (the
  // last bar and the price scale) — older history on the left gives way. Marks stay in whole-photo fractions.
  const crop = (() => {
    const base = S.cropRect;
    if (S.priceVolumeOnly === false) return base;
    const floor = ma?.volumeBar?.bottom ?? S.volumeFloor ?? null;
    if (floor == null || floor <= base.y + 0.1) return base;
    const h = Math.min(base.h, floor + 0.008 - base.y);
    const w = Math.min(base.w, (h * 1.42 * p.H) / p.W);
    const right = base.x + base.w;
    return {x: round(right - w, 4), y: base.y, w: round(w, 4), h: round(h, 4)};
  })();
  const C = p.calib;
  const numbers = [];
  const note = (key, value, text, source) => numbers.push({key, value, text, source});
  const vis = C ? bars.slice(-C.n) : [];
  const xOf = (i) => (C.last_x - C.d * (C.n - 1 - i)) / p.W;
  const half = C ? (C.d * 0.45) / p.W : 0.003;
  const barX = (t) => {
    if (!C) return null;
    // 'last' = the edition's candle, which is not the chart's last one when the photo is newer than the edition.
    const i = t === 'last' ? (asOf >= 0 ? asOf : vis.length - 1) : vis.findIndex((b) => b.t === t);
    return i < 0 ? null : xOf(i);
  };
  const priceY = (price) => (C ? (C.a + C.b * price) / p.H : null);
  const inside = (y, m = 0.02) => y != null && y > crop.y + m && y < crop.y + crop.h - m;
  const MA = ma?.ma ?? {};
  const ma50 = MA.ma50?.value ?? null;
  const ma200 = MA.ma200?.value ?? null;

  // ---- masks: FireAnt's legend rows (and the collapse button under the last one), logo, gear
  const masks = [];
  const rows = (ma?.legendRows ?? []).filter((r) => r.y0 < crop.y + 0.2);
  for (const r of rows) masks.push({x: clamp(Math.max(crop.x, r.x0 - 0.004)), y: clamp(r.y0 - 0.004), w: clamp(r.x1 - Math.max(crop.x, r.x0 - 0.004) + 0.008), h: clamp(r.y1 - r.y0 + 0.008)});
  if (rows.length) masks.push({x: clamp(crop.x + 0.002), y: clamp(rows.at(-1).y1 + 0.004), w: 0.04, h: 0.038});
  else masks.push({x: 0.0574, y: 0.1546, w: 0.8454, h: 0.0254}, {x: 0.0574, y: 0.1811, w: 0.1944, h: 0.0254}, {x: 0.0611, y: 0.2088, w: 0.037, h: 0.03});
  masks.push(...S.fixedMasks);

  // ---- an edition older than the chart (the 1/10 reel shot on 3/10 ends at 2/10): FireAnt's sessions after the
  // edition are masked — the candles and their volume bars right of the edition's candle, the price-scale tags (they
  // print the chart's LAST values), and FireAnt's dotted last-price line between the candles it would cross — so the
  // photo reads as of the edition's close. The MA values come from the legend read on the edition's candle.
  const asOf = C ? vis.findIndex((b) => b.t === date) : -1;
  const after = asOf >= 0 ? vis.length - 1 - asOf : 0;
  if (after > 0 && S.maskAfterEdition !== false) {
    const xa = xOf(asOf) + (C.d * 0.62) / p.W;
    masks.push({x: clamp(xa), y: clamp(crop.y), w: clamp(S.scaleX - 0.001 - xa), h: clamp(0.922 - crop.y)});
    for (const t of ma?.tags ?? []) masks.push({x: clamp(t.x0), y: clamp(t.y0 - 0.003), w: clamp(t.x1 - t.x0), h: clamp(t.y1 - t.y0 + 0.006)});
    const lastC = vis.at(-1)?.c;
    if (lastC != null) {
      const yl = priceY(lastC);
      const band = 0.0035;
      let x0 = crop.x;
      for (let i = 0; i <= asOf; i++) {
        const xi = xOf(i);
        if (priceY(vis[i].h) - band < yl && yl < priceY(vis[i].l) + band) {
          if (xi - half - 0.001 > x0) masks.push({x: clamp(x0), y: clamp(yl - band), w: clamp(xi - half - 0.001 - x0), h: clamp(2 * band)});
          x0 = xi + half + 0.001;
        }
      }
      if (xa > x0) masks.push({x: clamp(x0), y: clamp(yl - band), w: clamp(xa - x0), h: clamp(2 * band)});
    }
  }
  const seen = after > 0 ? vis.slice(0, asOf + 1) : vis;     // candles the viewer sees (and plates must avoid)

  // ---- the last session
  const closeX = barX(date) ?? barX('last') ?? crop.x + crop.w * 0.9;
  const closeY = priceY(L.price) ?? crop.y + crop.h * 0.3;
  const lastBar = vis.find((b) => b.t === date) ?? vis.at(-1);
  const highY = lastBar && C ? priceY(lastBar.h) : closeY - 0.03;
  const lowY = lastBar && C ? priceY(lastBar.l) : closeY + 0.03;

  // ---- camera: a wide that shows FireAnt's lines, then a close-up on the last sessions
  const kx = BOX_W / crop.w;                   // layer px per photo-width fraction (the crop fills the box's width)
  const ky = kx * (p.H / p.W);
  const viewOf = (shot) => {
    const z = Math.max(1, shot.zoom) * (shot.move === 'static' ? 1 : DRIFT);
    const vw = Math.min(crop.w, BOX_W / z / kx);
    const vh = Math.min(crop.h, BOX_H / z / ky);
    const cx = Math.min(Math.max(shot.x, crop.x + vw / 2), crop.x + crop.w - vw / 2);
    const cy = Math.min(Math.max(shot.y, crop.y + vh / 2), crop.y + crop.h - vh / 2);
    return {x0: cx - vw / 2, x1: cx + vw / 2, y0: cy - vh / 2, y1: cy + vh / 2, z: Math.max(1, shot.zoom), vw, vh};
  };
  const wide = {beat: 0, x: clamp(crop.x + crop.w / 2), y: clamp(crop.y + crop.h / 2), zoom: 1.0, move: 'push_in'};
  // The close-up's zoom: the review's, capped by a retry when a line that must keep its price finds no room (below).
  const z1 = S.closeZoom ?? review?.camera?.find((c) => c.beat === 1)?.zoom ?? 1.7;
  const vh1 = Math.min(crop.h, BOX_H / (z1 * DRIFT) / ky);
  const vw1 = Math.min(crop.w, BOX_W / (z1 * DRIFT) / kx);
  // The close-up keeps the last candle a little in from the right edge and spans its high to the room below its low.
  // Vertically the close-up spans the last high down to the lowest low of the last 25 sessions — the move into the edition's
  // candle fills the frame on its diagonal instead of an empty corner (a steep run-up left the lower-left dark, 2/10).
  const runLowY = C ? Math.max(lowY, ...vis.slice(Math.max(0, (asOf >= 0 ? asOf : vis.length - 1) - 24), (asOf >= 0 ? asOf : vis.length - 1) + 1).map((b) => priceY(b.l))) : lowY;
  const cy1 = Math.min((highY + runLowY) / 2, highY - 0.05 + vh1 / 2);
  const close = {beat: 1, x: clamp(Math.min(closeX + 0.03, crop.x + crop.w) - vw1 / 2), y: clamp(Math.min(Math.max(cy1, crop.y + vh1 / 2), crop.y + crop.h - vh1 / 2)), zoom: z1, move: 'pull_out'};
  const focus = review?.camera?.find((c) => c.beat === 1)?.focus;
  if (focus === 'all') Object.assign(close, {x: wide.x, y: wide.y, zoom: 1.0});
  const shots = [wide, close];
  const views = shots.map(viewOf);

  // ---- what a plate must not cover
  const tops = ma?.volumeTops ?? [];
  const plates = [];                            // {beat, until, x0, y0, x1, y1}
  const lineYs = [];                            // horizontal levels drawn across the photo: plates keep off them
  const segs = [];                              // trendlines (photo fractions, [[x, y], [x, y]]): plates keep off them too
  const sizeOf = (text, z, k = 1) => {
    const u = Math.pow(z, -0.6);
    const size = LABEL * u * k;
    return {w: ([...text].length * size * 0.6 + 2 * 7 * u) / kx, h: (size * 1.36) / ky, size: size / ky, pad: (7 * u) / kx};
  };
  const chipOf = (v) => ({x0: v.x0 + v.vw * (790 / BOX_W), x1: v.x1, y0: v.y0 + v.vh * (700 / BOX_H), y1: v.y1});
  const overlaps = (a, b, g = 0) => a.x0 < b.x1 + g && b.x0 < a.x1 + g && a.y0 < b.y1 + g && b.y0 < a.y1 + g;
  /** Does the segment a→b cross a candle (other than candle `skip`)? Sampled every half candle. */
  const crossesCandles = (a, b, skip) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (half || 0.003)));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
      for (let i = 0; i < seen.length; i++) {
        if (i === skip) continue;
        const cx = xOf(i);
        if (Math.abs(cx - x) > half) continue;
        if (y > priceY(seen[i].h) - 0.003 && y < priceY(seen[i].l) + 0.003) return true;
      }
    }
    return false;
  };
  const blocked = (r, beat, opts = {}) => {
    const v = views[beat];
    // ≥ 16 screen px from the frame's edges on both axes (QA 4/10: the 63,20 plates were clipped at the panel top).
    const mx = 18 / v.z / kx, my = 18 / v.z / ky;
    if (r.x0 < v.x0 + mx || r.x1 > v.x1 - mx || r.y0 < v.y0 + my || r.y1 > v.y1 - my) return true;
    if ((opts.scale !== false && r.x1 > S.scaleX - 0.004) || r.y1 > S.floorY) return true;
    if (overlaps(r, chipOf(v))) return true;
    for (let i = 0; i < seen.length; i++) {
      const x = xOf(i);
      if (x + half + 0.005 < r.x0 || x - half - 0.005 > r.x1) continue;
      const yh = priceY(seen[i].h) - 0.005, yl = priceY(seen[i].l) + 0.005;
      if (yh < r.y1 && r.y0 < yl) return true;
    }
    for (const [x, top] of tops) if (x + half >= r.x0 && x - half <= r.x1 && r.y1 > top - 0.004) return true;
    for (const q of plates) if (q !== r.self && q.beat <= beat && (q.until === undefined || q.until >= beat) && overlaps(r, q, 0.005)) return true;
    // A line keeps plates off it from the beat it is drawn on (a close-up level must not crowd the wide shot's plates).
    if (opts.lines === false) return false;
    for (const {y: ly, beat: lb} of lineYs) if (lb <= beat && r.y0 < ly + 0.003 && r.y1 > ly - 0.003) return true;
    for (const {seg: [a, b], beat: sb} of segs) {
      if (sb > beat) continue;
      const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.003));
      for (let k = 0; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
        if (x > r.x0 - 0.003 && x < r.x1 + 0.003 && y > r.y0 - 0.004 && y < r.y1 + 0.004) return true;
      }
    }
    return false;
  };
  /**
   * Put `text` on a plate in beat `beat`'s view, as near `target` as there is room: `rule` is 'near' (anywhere around
   * the point), 'above'/'below' (touching a horizontal line at target.y), 'path' (next to a curve, target.path).
   * Returns a label mark, or null when the view holds no free spot.
   */
  const place = (text, target, beat, accent, rule = 'near', extra = {}, accept = null) => {
    const v = views[beat];
    const {w, h, size, pad} = sizeOf(text, v.z);
    const cand = [];
    const pushRect = (x0, y0, score) => cand.push({x0, y0, x1: x0 + w, y1: y0 + h, score});
    const stepX = 0.006, stepY = 0.005;
    if (rule === 'above' || rule === 'below') {
      const y0 = rule === 'above' ? target.y - 0.004 - h : target.y + 0.004;
      for (let x0 = v.x0; x0 + w <= v.x1; x0 += stepX) pushRect(x0, y0, Math.abs(x0 + w / 2 - target.x));
      // the other side of the line, a little worse
      const y0b = rule === 'above' ? target.y + 0.004 : target.y - 0.004 - h;
      for (let x0 = v.x0; x0 + w <= v.x1; x0 += stepX) pushRect(x0, y0b, Math.abs(x0 + w / 2 - target.x) + 0.08);
    } else if (rule === 'path') {
      // Next to the curve: on either side, a little further out step by step (a trendline under the lows has candles
      // on one side and other lines on the other — 2026-10-03, PVT's line found no spot at 0,005 alone).
      for (const [px, py] of target.path ?? []) {
        if (px < v.x0 || px > v.x1) continue;
        [0.005, 0.012, 0.02, 0.03, 0.045].forEach((off, k) => {
          for (const [y0, pen] of [[py + off, 0], [py - off - h, 0.01]]) {
            for (const x0 of [px - w, px - w / 2, px]) pushRect(x0, y0, Math.abs(px - target.x) + pen + k * 0.012);
          }
        });
      }
    } else {
      for (let y0 = v.y0; y0 + h <= v.y1; y0 += stepY) {
        for (let x0 = v.x0; x0 + w <= v.x1; x0 += stepX) {
          const cx = x0 + w / 2, cy = y0 + h / 2;
          pushRect(x0, y0, Math.hypot((cx - target.x) * 1.0, (cy - target.y) * 1.25));
        }
      }
    }
    cand.sort((a, b) => a.score - b.score);
    // A plate that stays on through later beats first looks for a spot free in all of them, so the camera move carries it
    // instead of cross-fading two copies (seen at the cut-in, 2026-10-03).
    const keep = extra.keepFor ?? [];
    const ok = (r) => !blocked(r, beat, extra.blockOpts) && (!accept || accept(r)) && (!extra.within || extra.within(r));
    const hit = (keep.length ? cand.find((r) => ok(r) && keep.every((b) => !blocked(r, b))) : null) ?? cand.find(ok);
    if (!hit) return null;
    const rec = {beat, until: extra.until, x0: hit.x0, y0: hit.y0, x1: hit.x1, y1: hit.y1};
    plates.push(rec);
    return {kind: 'label', x: clamp(hit.x0 + pad), y: clamp(hit.y0 + size * 1.02), text, accent, beat, ...(extra.until !== undefined ? {until: extra.until} : {}), _rect: hit, _rec: rec, _finalUntil: extra.finalUntil};
  };
  /**
   * Keep a plate placed for an earlier beat through beat `beat` when it is still free inside that beat's view —
   * one plate per line through a camera move, no cross-fade between two copies. Returns true when kept.
   */
  const carry = (mark, beat) => {
    if (!mark?._rec) return false;
    const r = {...mark._rec, self: mark._rec};
    if (blocked(r, beat)) return false;
    mark._rec.until = mark._finalUntil;
    if (mark._finalUntil === undefined) delete mark.until;
    else mark.until = mark._finalUntil;
    return true;
  };

  const marks = [];
  const add = (m) => { if (m) marks.push(m); return m; };
  // The levels this scene will draw, known before any plate is placed, so no plate lands on one of them.
  const useHigh = !(spiking && volLabel && ma?.volumeBar) && L.high52w != null && inside(priceY(L.high52w), 0.03);
  for (const {price: p, beat: b} of review?.marks?.length ? review.marks.filter((m) => m.kind === 'level').map((m) => ({price: m.price, beat: m.beat ?? 0})) : useHigh ? [{price: L.high52w, beat: 0}] : []) {
    const y = priceY(p);
    if (inside(y, 0.03)) lineYs.push({y, beat: b});
  }
  /** A review trendline in photo fractions: from its first anchor to its value on the edition's candle. */
  const segOf = (m) => {
    const xa = barX(m.anchors?.[0]?.date);
    const xe = barX('last');
    if (xa == null || xe == null || !Number.isFinite(m.price)) return null;
    return [[xa, priceY(m.anchors[0].price)], [xe, priceY(m.price)]];
  };
  for (const m of review?.marks ?? []) if (m.kind === 'trendline') { const sg = segOf(m); if (sg) segs.push({seg: sg, beat: m.beat ?? 0}); }
  // The symbol plate replaces FireAnt's legend, top-left, on the wide only.
  add(place(`${L.symbol} · RS 1M ${L.rs1m} · ${pct(L.changePercent, 2)}`, {x: views[0].x0, y: views[0].y0}, 0, 'gold', 'near', {until: 0}));
  note('rs1m', L.rs1m, `RS 1M ${L.rs1m}`, 'facts');
  note('changePercent', L.changePercent, pct(L.changePercent, 2), 'facts');

  // ---- every plate stays with its own mark, in every beat's framing (coordinator 4/10, the v2b close-ups: plates drifted
  // ~200 px from what they label — a 60,00 plate eight points under its line on a long leader, trendline plates far from
  // their diagonal, a candle read ~200 px above its ring). Distances are SCREEN pixels of that beat's framing.
  const NEAR_PX = 24;            // a level / MA / trendline / box plate from its own mark
  const CANDLE_PX = 60;          // a candle read's plate from its candle
  const LEADER_PX = 60;          // no leader longer than this
  const lastB = views.length - 1;
  const sx = (b) => kx * views[b].z;
  const sy = (b) => ky * views[b].z;
  const pxRectPoint = (r, b, x, y) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1) * sx(b), Math.max(r.y0 - y, 0, y - r.y1) * sy(b));
  const pxRectPath = (r, b, pts) => pts.reduce((m, [x, y]) => Math.min(m, pxRectPoint(r, b, x, y)), Infinity);
  const pxRectBox = (r, b, q) => Math.hypot(Math.max(q.x0 - r.x1, r.x0 - q.x1, 0) * sx(b), Math.max(q.y0 - r.y1, r.y0 - q.y1, 0) * sy(b));
  const inViewPts = (b, pts) => pts.filter(([x, y]) => x >= views[b].x0 && x <= views[b].x1 && y >= views[b].y0 && y <= views[b].y1);
  /**
   * How far a plate is from a LINE (a trendline, an MA curve): the plate's horizontal centre must lie over the given stretch
   * of the line, and the gap between the line (at that x) and the plate's nearer edge is the distance — a wide plate whose
   * corner merely grazes the line does not count as sitting on it (v2b: "Trendline hỗ trợ" plates read as floating).
   */
  const pxRectLine = (r, b, pts) => {
    if (!pts.length) return Infinity;
    const cx = (r.x0 + r.x1) / 2;
    const xs = pts.map((q) => q[0]);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const tol = 6 / sx(b);
    if (cx < lo - tol || cx > hi + tol) return Infinity;
    let best = pts[0];
    for (const q of pts) if (Math.abs(q[0] - cx) < Math.abs(best[0] - cx)) best = q;
    const ly = best[1];
    return (ly < r.y0 ? r.y0 - ly : ly > r.y1 ? ly - r.y1 : 0) * sy(b);
  };
  /** A plate within `px` of its mark: the rule's own spots first, then any free spot that near; lines may be crossed last. */
  const RELAX = [{px: NEAR_PX}, {px: 36}, {px: 48, lines: false}];
  const placeNear = (text, target, b, accent, rule, dist, steps = RELAX) => {
    for (const [k, st] of steps.entries()) {
      const extra = {...(b < lastB ? {until: b} : {}), within: (r) => dist(r, b) <= st.px, ...(st.lines === false ? {blockOpts: {lines: false}} : {})};
      const got = add(place(text, target, b, accent, k === 0 ? rule : 'near', extra));
      if (got) return got;
    }
    return null;
  };
  /**
   * Plates placed for an earlier beat, re-checked for every later beat AFTER that beat's own marks have their plates
   * (they give way): carried as they are when still free and within NEAR_PX of their mark in the new framing, set again
   * beside their mark when there is room that near, else hidden in that beat — the line stays, its price was read on the
   * wide shot.
   */
  const later = [];
  const extendAll = () => {
    // Lines that can never be hidden (FireAnt's own MA curves; the trendline, whose price the user wants in every beat)
    // claim their room first; the rest give way.
    // Trendline first (its value applies only at the right end, by the last bar — the tightest spot), then the MA curves.
    const order = [...later].sort((a, b) => (b.prio ?? (b.always ? 1 : 0)) - (a.prio ?? (a.always ? 1 : 0)));
    for (const e of order) {
      if (e.line && e.line.until !== undefined && e.line.until < e.beat) continue;   // never shown: no price, no line
      let cur = e.lab;
      for (let b = e.beat + 1; b <= lastB; b++) {
        if (e.coveredFrom != null && b >= e.coveredFrom) { cur = null; continue; }   // another plate prints this price here
        if (!e.shown(b)) { cur = null; continue; }
        if (cur?._rec && cur._rec.until === b - 1) {
          const r = {...cur._rec, self: cur._rec};
          if (!blocked(r, b) && e.dist(r, b) <= NEAR_PX) {
            const u = b < lastB ? b : undefined;
            cur._rec.until = u;
            if (u === undefined) delete cur.until;
            else cur.until = u;
            continue;
          }
        }
        cur = e.always ? e.own(b) : e.own(b, [{px: NEAR_PX}]);
        // A line that shows must show its price (QA 4/10, "each price must be noted"): no plate here → the line goes too.
        if (!cur && e.line) {
          e.line.until = b - 1;
          break;
        }
      }
    }
  };

  /**
   * A horizontal level: the line from beat `beat` on; its plate on the line (touching it), per beat — above the line for a
   * resistance, below it for a support, and each level aimed at its own stretch of the line so plates of nearby levels
   * spread instead of stacking (PVT 2/10: 23,70 / 23,36 / 23,27 within ~30 px). A level whose price a candle read prints in
   * a beat (same price, `coveredFrom`) keeps its line there without a second plate.
   */
  /** A plate within LEADER_PX of a line (points `pts`), with a straight leader from its nearer edge to the nearest point. */
  const leadered = (text, pts, b, accent, prefer = null) => {
    if (!pts.length) return null;
    const anchor = prefer ?? pts.at(-1);
    const got = placeNear(text, {x: anchor[0] - 0.04, y: anchor[1] + 0.04}, b, accent, 'near', (r, bb) => pxRectPath(r, bb, pts), [{px: LEADER_PX}, {px: LEADER_PX, lines: false}]);
    if (!got) return null;
    const r = got._rect;
    let q = pts[0];
    for (const c of pts) if (pxRectPoint(r, b, c[0], c[1]) < pxRectPoint(r, b, q[0], q[1])) q = c;
    const ex = Math.min(Math.max(q[0], r.x0 + 0.004), r.x1 - 0.004);
    const ey = q[1] < r.y0 ? r.y0 : q[1] > r.y1 ? r.y1 : (r.y0 + r.y1) / 2;
    if (Math.hypot((ex - q[0]) * sx(b), (ey - q[1]) * sy(b)) > 8) marks.push({kind: 'line', from: [clamp(ex), clamp(ey)], to: [clamp(q[0]), clamp(q[1])], accent, beat: b, ...(b < lastB ? {until: b} : {})});
    return got;
  };
  let levelN = 0;
  const level = (price, text, accent, beat, role = null, coveredFrom = null) => {
    const y = priceY(price);
    if (!inside(y, 0.03)) return;
    const line = {kind: 'hline', y: clamp(y), accent, beat};
    marks.push(line);
    const k = levelN++;
    const dist = (r) => Math.max(r.y0 - y, 0, y - r.y1);
    const distPx = (r, b) => dist(r) * sy(b);
    const shown = (b) => y >= views[b].y0 && y <= views[b].y1;
    const side = role === 'support' ? 'below' : 'above';
    const own = (b, steps) => {
      if (!shown(b)) return null;
      const v = views[b];
      const tx = Math.max(v.x0, Math.min(closeX - (0.2 + 0.17 * (k % 3)) / v.z, v.x1));
      return placeNear(text, {x: tx, y}, b, accent, side, distPx, steps);
    };
    const lab = coveredFrom != null && coveredFrom <= beat ? null : own(beat);
    if (!lab && !(coveredFrom != null && coveredFrom <= beat)) { line.until = beat - 1; }   // no plate in its own beat: no line
    later.push({lab, beat, dist: distPx, own, shown, line, coveredFrom});
  };
  /** A plate on FireAnt's own MA line (no second line of ours) — on the line, near the recent candles or where the two lines part. */
  const maPlate = (key, text, beat, accent) => {
    const m = MA[key];
    if (!m || m.yAtLast == null) return false;
    const path = m.path?.length ? m.path : [[closeX, m.yAtLast]];
    // An MA plate is never red — red means down/danger in this reel; FireAnt's orange MA200 reads as gold.
    const tone = accent ?? (nearestAccent(m.color) === 'red' ? 'gold' : nearestAccent(m.color));
    const other = MA[key === 'ma50' ? 'ma200' : 'ma50'];
    const otherY = (x) => {
      let best = null;
      for (const [px, py] of other?.path ?? []) if (!best || Math.abs(px - x) < Math.abs(best[0] - x)) best = [px, py];
      return best && Math.abs(best[0] - x) < 0.02 ? best[1] : null;
    };
    const distPx = (r, b) => pxRectLine(r, b, inViewPts(b, path));
    const shown = (b) => inViewPts(b, path).length > 0;
    const own = (b, steps = RELAX) => {
      const pts = inViewPts(b, path);
      if (!pts.length) return null;
      // 1. along the line nearest the recent candles; 2. where the two FireAnt lines run apart (PVT: Jun–Aug)
      let got = placeNear(text, {x: views[b].x1, path: pts}, b, tone, 'path', distPx, steps.slice(0, 1));
      if (!got) {
        const sep = pts.map(([x, y]) => ({x, y, d: otherY(x) == null ? 0 : Math.abs(y - otherY(x))})).sort((p, q) => q.d - p.d);
        for (const pt of sep.slice(0, 16)) {
          got = placeNear(text, {x: pt.x, path: [[pt.x, pt.y]]}, b, tone, 'path', distPx, steps.slice(0, 1));
          if (got) break;
        }
      }
      if (!got && steps.length > 1) got = placeNear(text, {x: views[b].x1, path: pts}, b, tone, 'path', distPx, steps.slice(1));
      // The curve is FireAnt's and stays on screen: its plate may sit up to LEADER_PX away, with a leader onto the curve.
      if (!got && steps.length > 1) got = leadered(text, pts, b, tone);
      return got;
    };
    const lab = own(beat);
    later.push({lab, beat, dist: distPx, own, shown, always: true});
    return !!lab;
  };
  /**
   * A pointer onto a candle: the plate within CANDLE_PX of the candle, a leader no longer than LEADER_PX from the plate's
   * facing edge to the wick or body it names (none when the plate already touches the candle).
   */
  const pointer = (text, accent, beat, t = 'last', side = 'below', aim = null, focus = null) => {
    const x = barX(t) ?? closeX;
    const bar = t === 'last' ? lastBar : vis.find((b) => b.t === t);
    const hy = bar ? priceY(bar.h) : highY;
    const ly = bar ? priceY(bar.l) : lowY;
    const idx = t === 'last' ? (asOf >= 0 ? asOf : vis.length - 1) : vis.findIndex((b) => b.t === t);
    // The plate sits within CANDLE_PX of its candle (v2b: "đóng ở đáy 23,50" sat ~200 px above its ring), as near as there
    // is room to the part the read names (its wick, its close — the ring or box drawn there).
    const box = {x0: x - half, x1: x + half, y0: hy, y1: ly};
    const arrowFor = (r) => {
      const my = (r.y0 + r.y1) / 2;
      if (r.y0 > ly) return [[Math.min(Math.max(x, r.x0 + 0.01), r.x1 - 0.01), r.y0 - 0.004], [x, ly + 0.008]];
      if (r.y1 < hy) return [[Math.min(Math.max(x, r.x0 + 0.01), r.x1 - 0.01), r.y1 + 0.004], [x, hy - 0.008]];
      if (r.x1 < x) return [[r.x1 + 0.004, my], [x - half - 0.004, Math.min(Math.max(my, hy), ly)]];
      return [[r.x0 - 0.004, my], [x + half + 0.004, Math.min(Math.max(my, hy), ly)]];
    };
    const crossesPlates = (a, b) => plates.some((q) => q.beat <= beat && (q.until === undefined || q.until >= beat) && [0.25, 0.5, 0.75, 1].some((u) => {
      const px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u;
      return px > q.x0 - 0.004 && px < q.x1 + 0.004 && py > q.y0 - 0.004 && py < q.y1 + 0.004;
    }));
    const lenPx = ([a, b]) => Math.hypot((a[0] - b[0]) * sx(beat), (a[1] - b[1]) * sy(beat));
    const TOUCH = 14;
    const ok = (r) => {
      const d = pxRectBox(r, beat, box);
      if (d > CANDLE_PX) return false;
      if (d <= TOUCH) return true;
      const ar = arrowFor(r);
      return lenPx(ar) <= LEADER_PX && !crossesCandles(ar[0], ar[1], idx) && !crossesPlates(ar[0], ar[1]);
    };
    const fy = focus ? (focus[0] + focus[1]) / 2 : null;
    const target = fy != null ? {x: x - 0.02, y: fy + (side === 'below' ? 0.02 : -0.02)} : {x: x - 0.02, y: side === 'below' ? ly + 0.03 : hy - 0.03};
    const extra = (lines) => ({within: ok, ...(lines === false ? {blockOpts: {lines: false}} : {})});
    const lab = add(place(text, target, beat, accent, 'near', extra()))
      ?? add(place(text, target, beat, accent, 'near', extra(false)));
    if (!lab) return;
    const [from, to] = arrowFor(lab._rect);
    // An arrow onto the candle's high says "the high"; a read about the low (or a close at the low) never gets one.
    const wrongEnd = (aim === 'low' && to[1] < (hy + ly) / 2) || (aim === 'high' && to[1] > (hy + ly) / 2);
    if (pxRectBox(lab._rect, beat, box) > TOUCH && lenPx([from, to]) >= 12 && lenPx([from, to]) <= LEADER_PX && !wrongEnd && !crossesCandles(from, to, idx)) {
      marks.push({kind: 'arrow', from: [clamp(from[0]), clamp(from[1])], to: [clamp(to[0]), clamp(to[1])], accent, beat, weight: 1.2});
    }
  };
  /** The day's volume bar in a gold box; its plate within NEAR_PX of the box. */
  const volumeBox = (text, beat, t = 'last') => {
    const vb = ma?.volumeBar;
    const x = barX(t) ?? closeX;
    const floor = vb?.bottom ?? S.volumeFloor ?? 0.915;
    const top = (t === 'last' && vb) ? vb.top : floor - 0.1;
    // Inside the crop and left of the price scale, on every side (the camera agent saw the box at the last candle
    // cross the crop's right edge, 2026-10-03): a box that leaves the photo is cut by the panel mid-zoom.
    const bx0 = Math.max(crop.x + 0.002, x - 0.008);
    const bx1 = Math.min(crop.x + crop.w - 0.002, S.scaleX - 0.002, x + 0.008);
    const by0 = Math.max(crop.y + 0.002, top - 0.006);
    const by1 = Math.min(crop.y + crop.h - 0.002, floor + 0.002);
    const shown = (b) => x > views[b].x0 && x < views[b].x1 && top < views[b].y1 && by1 > views[b].y0;
    if (!shown(beat)) return;
    const until = views.map((_, b) => b >= beat && shown(b)).lastIndexOf(true);
    const vbox = {kind: 'box', x: clamp(bx0), y: clamp(by0), w: clamp(bx1 - bx0), h: clamp(by1 - by0), accent: 'gold', beat, ...(until < lastB ? {until} : {})};
    marks.push(vbox);
    const q = {x0: bx0, x1: bx1, y0: by0, y1: by1};
    const distPx = (r, b) => pxRectBox(r, b, q);
    const own = (b, steps) => (shown(b) ? placeNear(text, {x: x - 0.06, y: top - 0.03}, b, 'gold', 'near', distPx, steps) : null);
    later.push({lab: own(beat), beat, dist: distPx, own, shown, line: vbox});
  };
  /** A zone (a base, a pullback) as a box; its plate within NEAR_PX of the box. */
  const zone = (m) => {
    const x0 = barX(m.from), x1 = barX(m.to ?? 'last');
    const y0 = priceY(m.high), y1 = priceY(m.low);
    if (x0 == null || x1 == null || y0 == null) return;
    const beat = m.beat ?? 0;
    marks.push({kind: 'box', x: clamp(x0 - 0.004), y: clamp(y0), w: clamp(x1 - x0 + 0.008), h: clamp(y1 - y0), accent: m.accent ?? 'white', beat});
    if (!m.label) return;
    const q = {x0: x0 - 0.004, x1: x1 + 0.004, y0, y1};
    const distPx = (r, b) => pxRectBox(r, b, q);
    const shown = (b) => x1 > views[b].x0 && x0 < views[b].x1 && y1 > views[b].y0 && y0 < views[b].y1;
    const own = (b, steps) => (shown(b) ? placeNear(m.label, {x: (x0 + x1) / 2, y: y0 - 0.02}, b, m.accent ?? 'white', 'near', distPx, steps) : null);
    later.push({lab: own(beat), beat, dist: distPx, own, shown});
  };

  /**
   * A trendline of the review: the line from its first anchor through the second to its value on the edition's candle,
   * its plate (name + that price) along the line NEAR ITS RIGHT END — the last 40 % of the part of the line in view.
   */
  const trendline = (m) => {
    const sg = segOf(m);
    if (!sg) return;
    const [a, b] = sg;
    const beat = m.beat ?? 0;
    const accent = m.accent ?? (m.role === 'resistance' ? 'gold' : 'green');
    marks.push({kind: 'line', from: [clamp(a[0]), clamp(a[1])], to: [clamp(b[0]), clamp(b[1])], accent, beat});
    const n = 60;
    const path = Array.from({length: n + 1}, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    // The plate belongs at the line's RIGHT end, by the last bar, where its price applies (QA 4/10: MSR's 51,03 plate sat at
    // the line's left start, where the line is ~32).
    const rightEnd = (bt) => inViewPts(bt, path.slice(Math.floor(n * 0.82)));
    const distPx = (r, bt) => pxRectLine(r, bt, rightEnd(bt));
    const shown = (bt) => inViewPts(bt, path).length > 0;
    const own = (bt, steps) => {
      const pts = rightEnd(bt);
      if (!pts.length) return null;
      let got = placeNear(m.label, {x: pts.at(-1)[0], path: pts}, bt, accent, 'path', distPx, steps);
      // Every beat keeps the trendline's price: by its right end with a short leader when the stretch itself is crowded.
      if (!got) got = leadered(m.label, pts, bt, accent, pts.at(-1));
      // A right end buried in candles (PVT 2/10: the line runs under the lows of 24/9 and 1/10): the price alone as a tag
      // in the line's colour at its end, right of the last bar — over the edge of the price scale if it must.
      if (!got) {
        const [ex, ey] = pts.at(-1);
        got = add(place(vi(m.price), {x: ex + 0.03, y: ey}, bt, accent, 'near', {...(bt < lastB ? {until: bt} : {}), within: (r) => pxRectPoint(r, bt, ex, ey) <= NEAR_PX, blockOpts: {lines: false, scale: false}}));
      }
      return got;
    };
    const line = marks.at(-1);
    const lab = own(beat);
    if (!lab) line.until = beat - 1;
    later.push({lab, beat, dist: distPx, own, shown, always: true, prio: 2, line});
  };
  /** A candle read: the plate in free space by that candle, the arrow onto the wick or body it names. */
  const UP_READS = new Set(['upper-wick', 'close-near-high', 'gap-up', 'wide-range', 'outside', 'bull-engulf']);
  const candle = (m) => {
    const t = m.date === 'last' || m.date === date ? 'last' : m.date;
    const beat = m.beat ?? 1;
    const bar = t === 'last' ? lastBar : vis.find((b) => b.t === t);
    const x = barX(t);
    // A wick read rings the wick it names: the box spans the shadow, so the eye lands on it before the plate is read.
    if (bar && x != null && bar.o != null && (m.read === 'upper-wick' || m.read === 'lower-wick')) {
      const yTop = priceY(m.read === 'upper-wick' ? bar.h : Math.min(bar.o, bar.c));
      const yBot = priceY(m.read === 'upper-wick' ? Math.max(bar.o, bar.c) : bar.l);
      if (yBot - yTop > 0.004) marks.push({kind: 'box', x: clamp(x - half * 1.3), y: clamp(yTop - 0.003), w: clamp(half * 2.6), h: clamp(yBot - yTop + 0.006), accent: m.accent ?? 'white', beat});
    }
    // Any other read is about a price on the candle (its close, its open): a ring on that price, sized to the candle
    // spacing so it holds ONE session — ImagePanel draws r × the photo's shorter side, and the fixed 0,014 was 12 px
    // around candles 6 px apart (PVT 2/10: the ring on the 23,50 close also took in the 1/10 candle and its 23,30 low).
    else if (bar && x != null && Number.isFinite(m.price)) marks.push({kind: 'circle', x: clamp(x), y: clamp(priceY(m.price)), r: C ? Math.min(0.014, round((1.15 * C.d) / Math.min(p.W, p.H), 4)) : 0.014, accent: m.accent ?? 'white', beat});
    const up = UP_READS.has(m.read);
    const aim = m.read === 'upper-wick' ? 'high' : m.read === 'lower-wick' || m.read === 'close-near-low' || m.read === 'gap-down' ? 'low' : null;
    // What the read names: the upper wick, the lower wick, or the one price on the candle (close, open, gap).
    const focus = bar && bar.o != null && m.read === 'upper-wick' ? [priceY(bar.h), priceY(Math.max(bar.o, bar.c))]
      : bar && bar.o != null && m.read === 'lower-wick' ? [priceY(Math.min(bar.o, bar.c)), priceY(bar.l)]
      : Number.isFinite(m.price) ? [priceY(m.price), priceY(m.price)] : null;
    pointer(m.label, m.accent ?? 'white', beat, t, m.side ?? (up ? 'above' : 'below'), aim, focus);
  };

  let detail = '';
  if (review?.marks?.length) {
    // ---- the symbol review's marks (interface B), price/date → photo
    // A candle read wants the spot by its candle; levels can put their plates anywhere along their line — reads first.
    const order = {ma: 0, candle: 1, level: 2, trendline: 3, zone: 4, volume: 5, pointer: 6};
    // A candle read and a level at the same price print it ONCE (QA 4/10: "Kháng cự · đỉnh 52T 63,20" and "Râu trên · bị
    // bán từ 63,20" both in MSR's close-up): from the read's beat on the level keeps its line, the read's plate its price.
    const coveredFrom = (lv) => {
      const c = review.marks.find((x) => x.kind === 'candle' && Number.isFinite(x.price) && Math.abs(x.price - lv.price) <= 0.006);
      return c ? c.beat ?? 1 : null;
    };
    for (const m of [...review.marks].sort((a, b) => (a.beat ?? 0) - (b.beat ?? 0) || (order[a.kind] ?? 9) - (order[b.kind] ?? 9))) {
      const beat = m.beat ?? 0;
      if (m.kind === 'ma') maPlate(m.ref, m.label, beat, m.accent);
      // Support green, resistance gold (red only when the review says the level is the one whose break is the damage).
      else if (m.kind === 'level') level(m.price, m.label, m.accent ?? (m.role === 'support' ? 'green' : 'gold'), beat, m.role ?? null, coveredFrom(m));
      else if (m.kind === 'trendline') trendline(m);
      else if (m.kind === 'zone') zone(m);
      else if (m.kind === 'volume') volumeBox(m.label, beat, m.date ?? 'last');
      else if (m.kind === 'candle') candle(m);
      else if (m.kind === 'pointer') pointer(m.label, m.accent ?? 'green', beat, m.date ?? 'last', m.side ?? 'below');
    }
    detail = review.detail?.text ?? '';
    for (const n of review.numbers ?? []) note(n.key, n.value, n.text ?? null, n.source ?? 'review');
  } else {
    // ---- default marks: FireAnt's MA50/MA200 named on their lines, ONE detail, the last candle pointed at
    if (ma50 != null && maPlate('ma50', `MA50 ${vi(ma50)}`, 0)) note('ma50', ma50, `MA50 ${vi(ma50)}`, 'fireant');
    if (ma200 != null && maPlate('ma200', `MA200 ${vi(ma200)}`, 0)) note('ma200', ma200, `MA200 ${vi(ma200)}`, 'fireant');
    if (spiking && volLabel && ma?.volumeBar) {
      volumeBox(`KL ${volLabel}`, 0);
      detail = `khối lượng hôm nay ${volLabel} so với trung bình 20 phiên (hộp vàng trên cột khối lượng của FireAnt; headline in cùng đơn vị "KL ${volLabel}") — mã vừa đột biến khối lượng vừa dẫn dắt`;
    } else if (L.high52w != null && inside(priceY(L.high52w), 0.03)) {
      level(L.high52w, `Đỉnh 52T ${vi(L.high52w)} · ${pct(L.fromHigh52wPercent)}`, 'gold', 0);
      note('high52w', L.high52w, vi(L.high52w), 'facts');
      note('fromHigh52wPercent', L.fromHigh52wPercent, pct(L.fromHigh52wPercent), 'facts');
      detail = `đỉnh 52 tuần ${vi(L.high52w)}, giá đang ${pct(L.fromHigh52wPercent)} so với đỉnh (đường vàng)`;
    }
    // Beat 2: the last candle pointed at — its distance to FireAnt's MA50 when FireAnt shows it. Without FireAnt's MA50
    // the plate says the close: the terminal's EMA50 is not a line on this chart, so it is not named on it.
    const above50 = ma50 ? round((L.price / ma50 - 1) * 100, 1) : null;
    const text = above50 != null ? `${pct(above50)} trên MA50` : `Đóng cửa ${vi(L.price)}`;
    if (C) {
      pointer(text, 'green', 1);
      if (above50 != null) note('aboveMa50Percent', above50, pct(above50), 'derived: price / FireAnt MA50 − 1');
      else note('price', L.price, vi(L.price), 'facts');
    }
  }

  // Later beats: the earlier beats' plates come back only where their mark has room for them (they give way to the
  // close-up's own marks, placed above in beat order).
  extendAll();
  // A line that must keep its price in every beat (the trendline, FireAnt's MA curves) and found no room in the close-up:
  // frame the close-up wider and lay the scene out again (coordinator 4/10: "cap the zoom") — down to 1,2×.
  const starved = later.some((e) => e.always && e.line && e.line.until !== undefined && e.line.until < lastB);
  if (starved && z1 > 1.25) return fireantLeaderVisual({...args, spec: {...spec, closeZoom: round(Math.max(1.2, z1 - 0.2), 2)}});

  const missing = marks.filter((m) => m.kind === 'label').length;
  return {
    visual: {
      type: 'image', src: p.rel, source: 'fireant.vn', fit: 'contain',
      // A legend mask left of a narrower crop clips to zero width — verify rejects an empty rect, and it hides nothing.
      crop, masks: masks.filter((m) => m.w > 0 && m.h > 0), ...(maskColor ? {maskColor} : {}),
      annotations: marks.map(({_rect, _rec, _finalUntil, ...m}) => m), shots,
    },
    detail,
    numbers,
    closeX,
    closeY,
    plates: missing,
    maSource: {ma50, ma200, file: ma ? 'ma.json' : null},
  };
};
