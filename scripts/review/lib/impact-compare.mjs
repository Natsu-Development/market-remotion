/**
 * The index's lead mover next to the index — market-review's `impact` scene (user 2026-10-05: "with VIC symbol since it
 * affect to the market so much, so need a sentence and something like view VIC behavior price action change beside the
 * VNIndex? Only with VIC symbol"). Built only when the reel reviews the name that moved VN-Index most today
 * (flow.impact.lead is a leader or a requested name) and that name carried at least half of the index's move.
 *
 * The panel is a PHOTO, not a drawn chart (house rule): the name's FireAnt daily photo and the VNINDEX one were shot in
 * the same tab at the same size, 6 px a session, so cropping both to the last `sessions` and stacking them puts every
 * session in the same column — VIC's candles over the index's. scripts/review/compose_impact.py paints FireAnt's legend
 * rows out and stacks the strips; this module works out the geometry from the two calibrations, writes the sidecars
 * (<sym>-vnindex.json / .calib.json: per-half price → y, the shared date → x) and places the marks by DATE and PRICE.
 *
 * Beat 1 (wide): the two names, today's column (a dashed line through both strips, a ring on each candle) and today's
 * figures. Beat 2: the index's distribution days on which the name fell too (bands across both strips), and a session
 * where the two parted, when there is one.
 */
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {ROOT, abs, dm, exists, round, signed, tryJson, vi, writeJson} from './common.mjs';

const PY = process.env.TTS_PYTHON ?? resolve(ROOT, '../video-factory/.venv/bin/python');
const clamp = (n) => Math.min(1, Math.max(0, round(n, 4)));
const pct = (n, dp = 2) => `${signed(n, dp)}%`;

/** FireAnt's chart background on the VNINDEX tab (sampled on both 5/10 photos: 21,24,32 / 22,25,33). */
const BG = [22, 25, 33];
const SEP = 8;            // dark gap between the strips, a hairline in its middle
const MARGIN = 14;        // px above the highest high and below the lowest low of the window
const SCALE_R = 1045;     // right edge of FireAnt's price scale (rules.shots.fireantStock.cropRect, 0.9676 × 1080)
const LABEL = 20;         // ImagePanel plate type at zoom 1 (src/lib/photoLayout.ts LABEL_SIZE)

/**
 * @returns {{why: string}} when the scene does not apply, else {visual, brief, numbers, figures}
 */
export function impactCompare({F, R, date, dir, analyzeBars, indexBars}) {
  const I = F.flow?.impact;
  const lead = I?.lead?.symbol;
  if (!lead) return {why: 'the pack has no flow.impact (FireAnt "Top cổ phiếu tác động")'};
  const minShare = R.screener?.impact?.minShare ?? 50;
  if (!(Math.abs(I.leadShare ?? 0) >= minShare)) return {why: `${lead} carried ${I.leadShare}% of the index's move (< ${minShare}%)`};
  const L = [...(F.screener.requested ?? []), ...(F.screener.leaders?.top ?? [])].find((x) => x.symbol === lead);
  if (!L) return {why: `${lead} moved the index most but the reel does not review it (not a leader, not requested)`};
  const sym = lead.toLowerCase();
  const sp = `public/${dir}/${sym}-fireant`;
  const ip = `public/${dir}/vnindex-daily`;
  const sc = tryJson(`${sp}.calib.json`);
  const ic = tryJson(`${ip}.calib.json`);
  if (!sc || !ic) return {why: `no calibrated ${!sc ? `${sym}-fireant` : 'vnindex-daily'} photo`};
  if (sc.last_bar !== date || ic.last_bar !== date) return {why: `the photos end ${sc.last_bar} / ${ic.last_bar}, not on ${date}`};
  if (Math.abs(sc.d - ic.d) > 0.05) return {why: `the two photos space sessions differently (${sc.d} / ${ic.d} px)`};
  const N = Math.min(R.screener?.impact?.sessions ?? 85, sc.n, ic.n);
  const sBars = analyzeBars.filter((b) => b.t <= date).slice(-N);
  const iBars = indexBars.filter((b) => b.t <= date).slice(-N);
  if (sBars.length < N || iBars.length < N || sBars.some((b, k) => b.t !== iBars[k].t)) return {why: `${lead} and VN-Index do not share the last ${N} sessions`};

  // ---- geometry (source px): the last candle's column, the strip each photo gives
  const d = sc.d;
  const shift = Math.round(sc.last_x - ic.last_x);           // VIC's 5/10 sits right of the index's by this much
  const sx0 = Math.round(sc.last_x - d * (N - 1) - d / 2 - 8);
  const ix0 = sx0 - shift;
  const W = SCALE_R - ix0;                                     // the index strip keeps its whole price scale
  const yOf = (c, price) => c.a + c.b * price;
  const span = (c, bars) => [Math.floor(yOf(c, Math.max(...bars.map((b) => b.h))) - MARGIN), Math.ceil(yOf(c, Math.min(...bars.map((b) => b.l))) + MARGIN)];
  const [sy0, sy1] = span(sc, sBars);
  const [iy0, iy1] = span(ic, iBars);
  const hS = sy1 - sy0;
  const hI = iy1 - iy0;
  const H = hS + SEP + hI;
  const iTop = hS + SEP;

  // FireAnt's legend rows inside the strips (measured per photo by fireant_ma.py: <photo>.ma.json legendRows), and the
  // collapse button under the last one — painted with the chart's own background before cropping.
  const legendMasks = (path, c) => {
    const rows = tryJson(`${path}.ma.json`)?.legendRows ?? [];
    const m = rows.map((r) => [Math.floor(r.x0 * 1080) - 4, Math.floor(r.y0 * 867) - 3, Math.ceil(r.x1 * 1080) + 6, Math.ceil(r.y1 * 867) + 3]);
    if (rows.length) m.push([60, Math.ceil(rows.at(-1).y1 * 867) + 2, 110, Math.ceil(rows.at(-1).y1 * 867) + 36]);
    return m;
  };
  const out = `public/${dir}/${sym}-vnindex.png`;
  const spec = {
    out: abs(out), size: [W, H], bg: BG,
    parts: [
      {src: abs(`${sp}.png`), crop: [sx0, sy0, sx0 + W, sy1], at: [0, 0], masks: legendMasks(sp, sc), keepRight: SCALE_R},
      {src: abs(`${ip}.png`), crop: [ix0, iy0, ix0 + W, iy1], at: [0, iTop], masks: legendMasks(ip, ic)},
    ],
    rules: [[0, hS + SEP / 2, W, hS + SEP / 2, [43, 48, 61]]],
  };
  const specPath = `.review-cache/staging/impact-${sym}-compose.json`;
  writeJson(specPath, spec);
  const r = spawnSync(PY, ['scripts/review/compose_impact.py', abs(specPath)], {cwd: ROOT, encoding: 'utf8'});
  if (r.status !== 0 || !exists(out)) return {why: `compose_impact.py failed: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ')}`};

  // ---- the composite's own calibration: one date → x, two price → y
  const lastX = sc.last_x - sx0;
  const xOf = (t) => {
    const k = sBars.findIndex((b) => b.t === t);
    return k < 0 ? null : lastX - d * (N - 1 - k);
  };
  const halves = {
    stock: {symbol: lead, y0: 0, y1: hS, a: sc.a - sy0, b: sc.b, bars: sBars, scaleX: SCALE_R - sx0 - (SCALE_R - 967)},
    index: {symbol: 'VNINDEX', y0: iTop, y1: H, a: ic.a - iy0 + iTop, b: ic.b, bars: iBars, scaleX: 967 - ix0},
  };
  const Y = (h, price) => h.a + h.b * price;
  const side = tryJson(`${sp}.json`) ?? {};
  const iside = tryJson(`${ip}.json`) ?? {};
  // A composite is as fresh as its older half (review-fresh reads capturedAt).
  const capturedAt = [side.capturedAt, iside.capturedAt].filter(Boolean).sort()[0] ?? null;
  writeJson(`public/${dir}/${sym}-vnindex.json`, {
    kind: 'impact-compare', symbol: lead, capturedAt, url: 'https://fireant.vn/charts',
    sources: [`${dir}/${sym}-fireant.png`, `${dir}/vnindex-daily.png`], sessions: N, from: sBars[0].t, to: date, shift,
    crops: {stock: [sx0, sy0, sx0 + W, sy1], index: [ix0, iy0, ix0 + W, iy1]}, size: [W, H],
  });
  writeJson(`public/${dir}/${sym}-vnindex.calib.json`, {
    img: abs(out), size: [W, H], n: N, d, last_x: round(lastX, 2), first_bar: sBars[0].t, last_bar: date,
    halves: Object.fromEntries(Object.entries(halves).map(([k, h]) => [k, {symbol: h.symbol, y0: h.y0, y1: h.y1, a: round(h.a, 4), b: h.b}])),
  });

  // ---- plates: placed off the candles of their half, inside their beat's view, off each other
  const s = Math.min(1000 / W, 752 / H);                      // composite px → ImagePanel layer px (fit: contain)
  const candles = (h) => h.bars.map((b) => ({x0: xOf(b.t) - d / 2 - 1, x1: xOf(b.t) + d / 2 + 1, y0: Y(h, b.h) - 3, y1: Y(h, b.l) + 3}));
  const obstacles = {stock: candles(halves.stock), index: candles(halves.index)};
  const plates = [];
  const sizeOf = (text, zoom) => {
    const ui = Math.pow(zoom, -0.6);
    const font = (LABEL * ui) / s;
    const w = [...text].length * font * 0.6 + (14 * ui) / s;
    return {w, h: font * 1.36, font};
  };
  const hits = (r, list) => list.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
  /** Nearest free spot to (tx, ty) in half `hk`, inside view `v` (composite px), returns the label annotation. */
  const place = (text, hk, tx, ty, accent, beat, v, zoom, until) => {
    const h = halves[hk];
    const {w, h: ph, font} = sizeOf(text, zoom);
    const lim = {x0: Math.max(v.x0, 4), x1: Math.min(v.x1, h.scaleX - 4), y0: Math.max(v.y0, h.y0 + 3), y1: Math.min(v.y1, h.y1 - 3)};
    const live = plates.filter((p) => p.beat <= beat && (p.until == null || p.until >= beat)).map((p) => p.r);
    const cands = [];
    for (let dy = -H; dy <= H; dy += 4) for (let dx = -W; dx <= W; dx += 6) cands.push([dx, dy, Math.abs(dx) + 1.5 * Math.abs(dy)]);
    cands.sort((a, b) => a[2] - b[2]);
    let best = null;
    for (const [dx, dy] of cands) {
      const x0 = tx + dx;
      const yb = ty + dy;                                    // the plate's baseline
      const r = {x0: x0 - 4, x1: x0 + w + 4, y0: yb - font * 1.02 - 3, y1: yb - font * 1.02 + ph + 3};
      if (r.x0 < lim.x0 || r.x1 > lim.x1 || r.y0 < lim.y0 || r.y1 > lim.y1) continue;
      if (hits(r, obstacles[hk]) || hits(r, live)) continue;
      best = {x0, yb, r};
      break;
    }
    if (!best) return null;
    plates.push({r: best.r, beat, until});
    return {kind: 'label', x: clamp(best.x0 / W), y: clamp(best.yb / H), text, accent, beat, ...(until != null ? {until} : {})};
  };

  // ---- camera (composite px views; ImagePanel frames x/y as photo fractions, zoom over the fitted photo)
  const today = date;
  const tX = xOf(today);
  const shots = [];
  const viewOf = (cx, cy, z) => ({x0: cx - W / (2 * z), x1: cx + W / (2 * z), y0: cy - H / (2 * z), y1: cy + H / (2 * z)});
  shots.push({beat: 0, x: 0.5, y: 0.5, zoom: 1, move: 'push_in'});
  const marks = [];
  const v0 = viewOf(W / 2, H / 2, 1);

  // beat 1 — the two names, today's column and today's figures
  const sBar = sBars.at(-1);
  const iBar = iBars.at(-1);
  marks.push({kind: 'vline', x: clamp(tX / W), accent: 'gold', beat: 0});
  marks.push({kind: 'circle', x: clamp(tX / W), y: clamp(Y(halves.stock, (sBar.h + sBar.l) / 2) / H), r: 0.03, accent: 'green', beat: 0, until: 0});
  marks.push({kind: 'circle', x: clamp(tX / W), y: clamp(Y(halves.index, (iBar.h + iBar.l) / 2) / H), r: 0.03, accent: 'green', beat: 0, until: 0});
  const figS = `${lead} ${pct(L.changePercent)} · ${signed(I.lead.points, 2)} điểm`;
  const figI = `VN-Index ${pct(F.session.changePercent)} · ${signed(I.indexChange, 2)} điểm`;
  const nameS = place(lead, 'stock', 10, halves.stock.y0 + 22, 'gold', 0, v0, 1, 0);
  const nameI = place('VN-Index', 'index', 10, halves.index.y0 + 22, 'white', 0, v0, 1, 0);
  const plateS = place(figS, 'stock', tX - sizeOf(figS, 1).w - 24, Y(halves.stock, sBar.h) - 14, 'green', 0, v0, 1, 0);
  const plateI = place(figI, 'index', tX - sizeOf(figI, 1).w - 24, Y(halves.index, iBar.h) - 14, 'green', 0, v0, 1, 0);
  for (const m of [nameS, nameI, plateS, plateI]) if (m) marks.push(m);

  // beat 2 — the index's distribution days on which the name fell too, and a session where the two parted
  const chg = (bars, t) => {
    const k = bars.findIndex((b) => b.t === t);
    return k > 0 ? (bars[k].c / bars[k - 1].c - 1) * 100 : null;
  };
  const dd = (F.distribution?.active ?? []).filter((x) => xOf(x.date) != null);
  const together = dd.filter((x) => (chg(sBars, x.date) ?? 0) < 0);
  const parted = dd.filter((x) => (chg(sBars, x.date) ?? 0) > 0);
  // Adjacent sessions share one band (23/9 and 24/9): at most three bands.
  const groups = [];
  for (const x of together) {
    const last = groups.at(-1);
    const k = sBars.findIndex((b) => b.t === x.date);
    if (last && k === last.k1 + 1) { last.k1 = k; last.dates.push(x); } else groups.push({k0: k, k1: k, dates: [x]});
  }
  const bands = groups.slice(-3);
  const left = Math.min(...bands.map((g) => xOf(sBars[g.k0].t)), parted.length ? xOf(parted.at(-1).date) : Infinity);
  const cx = Math.min(W - W / (2 * 1.25), Math.max(W / (2 * 1.25), (left + tX) / 2 + 20));
  const z1 = 1.25;
  shots.push({beat: 1, x: clamp(cx / W), y: 0.5, zoom: z1, move: 'pan'});
  const v1 = viewOf(cx, H / 2, z1);
  for (const g of bands) {
    const x0 = xOf(sBars[g.k0].t) - d / 2 - 2;
    const x1 = xOf(sBars[g.k1].t) + d / 2 + 2;
    marks.push({kind: 'box', x: clamp(x0 / W), y: 0.01, w: clamp((x1 - x0) / W), h: 0.98, accent: 'red', beat: 1});
  }
  const ddText = 'Phiên phân phối';
  const bandX = bands.length ? xOf(sBars[bands[0].k0].t) : tX;
  const ddPlate = place(ddText, 'index', bandX - 10, halves.index.y1 - 16, 'red', 1, v1, z1);
  const fellText = `${lead} cũng giảm`;
  const fellPlate = place(fellText, 'stock', bandX - 10, halves.stock.y1 - 16, 'red', 1, v1, z1);
  for (const m of [ddPlate, fellPlate]) if (m) marks.push(m);
  let partedLine = '';
  const p = parted.at(-1);
  if (p) {
    const pb = sBars.find((b) => b.t === p.date);
    const ib = iBars.find((b) => b.t === p.date);
    marks.push({kind: 'circle', x: clamp(xOf(p.date) / W), y: clamp(Y(halves.stock, (pb.h + pb.l) / 2) / H), r: 0.026, accent: 'green', beat: 1});
    marks.push({kind: 'circle', x: clamp(xOf(p.date) / W), y: clamp(Y(halves.index, (ib.h + ib.l) / 2) / H), r: 0.026, accent: 'red', beat: 1});
    const t = `${p.dm} ${lead} bật lên`;
    const m = place(t, 'stock', xOf(p.date) - sizeOf(t, z1).w - 16, Y(halves.stock, pb.l) + 26, 'green', 1, v1, z1);
    if (m) marks.push(m);
    partedLine = ` Phiên ${p.dm} (phiên phân phối) chỉ số ${pct(p.changePercent)} mà ${lead} ${pct(chg(sBars, p.date))} — hai chart tách nhau (vòng xanh / vòng đỏ ở beat 2).`;
  }

  const visual = {type: 'image', src: `${dir}/${sym}-vnindex.png`, source: 'fireant.vn', fit: 'contain', annotations: marks, shots};
  const together4 = together.map((x) => `${x.dm} (chỉ số ${pct(x.changePercent)}, ${lead} ${pct(chg(sBars, x.date))})`).join('; ');
  const brief = [
    `${lead} VÀ VN-INDEX, CÙNG MỘT TRỤC NGÀY (người dùng 2026-10-05: "with VIC symbol since it affect to the market so much, so need a sentence and something like view VIC behavior price action change beside the VNIndex? Only with VIC symbol"): ảnh ghép hai chart FireAnt nến ngày, ${lead} ở trên, VN-Index ở dưới, ${N} phiên ${dm(sBars[0].t)} → ${dm(date)}, mỗi phiên một cột thẳng hàng. Scene này chỉ có khi mã kéo chỉ số nhiều nhất hôm nay (flow.impact.lead) là mã reel đang soi và gánh ≥ ${minShare}% mức thay đổi của chỉ số: hôm nay ${lead} ${signed(I.lead.points, 2)} trong ${signed(I.indexChange, 2)} điểm = ${vi(I.leadShare, 1)}%.`,
    `Câu đầu là CÂU người dùng hỏi: vì sao ${lead} quan trọng với chỉ số hôm nay — nói số điểm MỘT lần (headline giữ số của pack: ${signed(I.lead.points, 2)}, ${signed(I.indexChange, 2)}, ${pct(L.changePercent)}, ${pct(F.session.changePercent)}); scene 02 đã nói "${lead} góp … trong … điểm" — đổi cách nói, không chép câu đó, không "khoảng", không "gần như toàn bộ".`,
    `Beat 1 = cả hai chart: tên hai mã, đường vàng đứt qua cột ${dm(date)}, vòng xanh trên nến hôm nay của từng chart, nhãn "${figS}" và "${figI}". Beat 2 = máy lia sang cuối tháng chín: dải đỏ trên các phiên phân phối của chỉ số mà ${lead} cũng giảm — ${together4 || 'không có'}.${partedLine} Câu ghim beat 2 kể price action của ${lead} cạnh chỉ số trên chính hai chart này (cùng giảm ở các phiên phân phối, phiên tách nhau, nhịp hồi hôm nay).`,
    `Từ của trader: kéo chỉ số, phiên phân phối, bật lên, hồi. Không gọi giá, không mua bán, không nói ${lead} ở bộ lọc nào, không "bạn chọn". Số đọc thành chữ; tối đa hai số đọc ra lời.`,
  ];
  return {visual, brief, figures: {together: together.map((x) => x.dm), parted: p?.dm ?? null}};
}
