/**
 * The weekly edition's `week` scene on FireAnt's WEEKLY chart of the user's VNINDEX tab (rules.shots.fireantWeekly:
 * the tab of the daily photo at interval W + reset view, ~140 weeks). Until 2026-10-05 the scene was a stub — the
 * whole photo, the MACD pane and FireAnt's legend in view, one plate at a fixed spot — and the first weekly photo
 * was never taken. Now it is framed like a leader chart of that tab (lib/leader-fireant.mjs):
 *
 *   crop    price + volume only, at the panel's 1.42, right edge (the last weeks and the price scale) kept: ~75 weeks
 *   masks   FireAnt's legend rows inside the crop (OHLC, Volume, MA Cross — measured on this photo by fireant_ma.py),
 *           and, when the photo is newer than the edition, every week after it: candles, volume bars, the price-scale
 *           tags (they print the chart's LAST values) and the dotted last-price line — so the chart ends at the
 *           edition's week (a past week shot after the next Monday opened: only a test run, the freshness gate stops
 *           a real one)
 *   beat 1  the wide, the week's candle boxed, its change on a plate
 *   beat 2  a close-up on the last weeks: the week's range and close, and the volume against the week before
 *
 * Pure. Plates are settled by the caller's plateRoom (scaffold), which moves them off candles and volume bars.
 * Every number printed is in the fact pack's `weekly` block.
 */
import {round, signed, vi} from './common.mjs';

const clamp = (n) => Math.min(1, Math.max(0, round(n, 4)));
const pct = (n) => `${signed(n, 2)}%`;

/** The frame of the VNINDEX tab at 1080 wide (the leader photos' DEFAULT_SPEC): crop rect and price-scale start. */
const DEFAULT = {cropRect: {x: 0.0574, y: 0.1592, w: 0.9102, h: 0.7982}, scaleX: 0.9037, volumeFloor: 0.657};

/** Monday-keyed weekly bars from daily ones (the weeks FireAnt's W interval draws). */
export const weeklyBars = (daily) => {
  const out = [];
  for (const b of daily) {
    const d = new Date(`${b.t}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
    const w = out[out.length - 1];
    if (w && w.t === monday) { w.h = Math.max(w.h, b.h); w.l = Math.min(w.l, b.l); w.c = b.c; w.v += b.v; }
    else out.push({t: monday, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v});
  }
  return out;
};

/** Where the week closed inside its own range, in the words the brief may use (decided by the numbers). */
export const closeWord = (W) => {
  const at = W.high > W.low ? (W.close - W.low) / (W.high - W.low) : 0.5;
  return {at: round(100 * at, 0), word: at <= 0.25 ? 'sát đáy biên tuần' : at >= 0.75 ? 'sát đỉnh biên tuần' : 'giữa biên tuần'};
};

/**
 * @param W      the fact pack's `weekly` block (from, fromDm, high, low, close, changePercent, volumeVsPriorWeek)
 * @param toDm   the edition's session as "2/10"
 * @param p      scaffold's photo() record of vnindex-weekly (W, H, calib)
 * @param ma     vnindex-weekly.ma.json (legendRows, tags, volumeBar) or null
 * @param weeks  Monday-keyed weekly bars, oldest first, ending at the photo's last candle (calib.last_bar)
 * @param spec   rules.shots.fireantStock merged with rules.shots.fireantWeekly
 * @returns {visual, brief, after} or {why} when the calibration does not reach the edition's week
 */
export const weekVisual = ({W, toDm, p, ma, weeks, spec = {}, maskColor}) => {
  const S = {...DEFAULT, ...spec};
  const C = p.calib;
  const vis = weeks.slice(-C.n);
  const at = vis.findIndex((b) => b.t === W.from);
  if (at < 0) return {why: `the photo's calibration (${C.first_bar} → ${C.last_bar}) has no week of ${W.from}`};
  const after = vis.length - 1 - at;
  const bar = vis[at];
  const xOf = (i) => (C.last_x - C.d * (C.n - 1 - i)) / p.W;
  const yOf = (price) => (C.a + C.b * price) / p.H;
  const half = (C.d * 0.45) / p.W;

  // ---- crop: price + volume, the panel's ratio, right edge kept. A photo newer than the edition ends at the price
  // scale instead: its tags print the chart's LAST values (the later week's close and MAs), and masking them one by
  // one left their borders and half of the labels next to them (frame audit, 5/10) — the plates carry the prices.
  const base = S.cropRect;
  const floor = ma?.volumeBar?.bottom ?? S.volumeFloor;
  const h = Math.min(base.h, floor + 0.008 - base.y);
  const w = Math.min(base.w, (h * 1.42 * p.H) / p.W);
  const right = after > 0 ? S.scaleX - 0.002 : base.x + base.w;
  const crop = {x: round(right - w, 4), y: base.y, w: round(w, 4), h: round(h, 4)};

  // ---- masks: the legend rows that reach into the crop
  const masks = [];
  for (const r of ma?.legendRows ?? []) {
    const x0 = Math.max(crop.x, r.x0 - 0.004);
    if (r.x1 + 0.004 > x0) masks.push({x: clamp(x0), y: clamp(r.y0 - 0.004), w: clamp(r.x1 + 0.004 - x0), h: clamp(r.y1 - r.y0 + 0.008)});
  }
  if (!ma?.legendRows?.length) masks.push({x: crop.x, y: 0.1546, w: clamp(0.9 - crop.x), h: 0.08});

  // ---- the weeks after the edition (a photo newer than its week)
  if (after > 0) {
    const xa = xOf(at) + (C.d * 0.62) / p.W;
    masks.push({x: clamp(xa), y: clamp(crop.y), w: clamp(crop.x + crop.w - xa), h: clamp(crop.h)});
    // FireAnt's dotted last-price line runs at the LAST week's close: blank it between the candles it crosses.
    const yl = yOf(vis.at(-1).c);
    const band = 0.0035;
    let x0 = crop.x;
    for (let i = 0; i <= at; i++) {
      const xi = xOf(i);
      if (xi + half < crop.x) continue;
      if (yOf(vis[i].h) - band < yl && yl < yOf(vis[i].l) + band) {
        if (xi - half - 0.001 > x0) masks.push({x: clamp(x0), y: clamp(yl - band), w: clamp(xi - half - 0.001 - x0), h: clamp(2 * band)});
        x0 = xi + half + 0.001;
      }
    }
    if (xa > x0) masks.push({x: clamp(x0), y: clamp(yl - band), w: clamp(xa - x0), h: clamp(2 * band)});
  }

  // ---- marks
  const cx = xOf(at);
  const top = yOf(bar.h);
  const bottom = yOf(bar.l);
  const bw = Math.max(half * 2 + 0.012, 0.016);
  const down = W.changePercent < 0;
  const CW = closeWord(W);
  const annotations = [
    {kind: 'box', x: clamp(cx - bw / 2), y: clamp(top - 0.012), w: clamp(bw), h: clamp(bottom - top + 0.024), accent: down ? 'down' : 'up', beat: 0},
    {kind: 'label', x: clamp(cx - 0.03), y: clamp(top - 0.05), text: `Tuần ${W.fromDm} → ${toDm} · ${pct(W.changePercent)}`, accent: down ? 'red' : 'green', beat: 0, anchor: 'end'},
    {kind: 'label', x: clamp(cx - 0.03), y: clamp(bottom + 0.04), text: `Cao ${vi(W.high)} · thấp ${vi(W.low)} · đóng ${vi(W.close)}`, accent: 'white', beat: 1, anchor: 'end'},
    ...(W.volumeVsPriorWeek != null ? [{kind: 'label', x: clamp(cx - 0.03), y: clamp(bottom + 0.08), text: `KL mỗi phiên ×${vi(W.volumeVsPriorWeek)} tuần trước`, accent: 'white', beat: 1, anchor: 'end'}] : []),
  ];

  // ---- camera: the wide (the weekly trend), then the last weeks up to the edition's candle
  const recent = vis.slice(Math.max(0, at - 15), at + 1);
  const hiY = Math.min(...recent.map((b) => yOf(b.h)));
  const loY = Math.max(...recent.map((b) => yOf(b.l)));
  // The close-up ends just left of the price scale (a frame edge through its labels showed "19", "17", … — audit 5/10),
  // so the week's candle sits near its right edge; ImagePanel drifts a moving shot by 6 %, hence the 1.06.
  const z1 = 2.0;
  const vw1 = crop.w / (z1 * 1.06);
  const edge = Math.min(crop.x + crop.w, S.scaleX - 0.004);
  const shots = [
    {beat: 0, x: clamp(crop.x + crop.w / 2), y: clamp(crop.y + crop.h / 2), zoom: 1.0, move: 'push_in'},
    {beat: 1, x: clamp(Math.max(edge - vw1 / 2, cx + 0.03 - vw1 + 0.02)), y: clamp((hiY + loY) / 2 + 0.02), zoom: z1, move: 'pull_out'},
  ];

  return {
    after,
    visual: {crop, masks, ...(masks.length ? {maskColor} : {}), annotations, shots},
    brief: [
      `Ảnh FireAnt nến TUẦN (tab VNINDEX của người dùng ở khung W), ${vis.filter((b, i) => i <= at && xOf(i) >= crop.x).length} tuần trong khung (từ tuần ${vis.find((b, i) => xOf(i) >= crop.x)?.t ?? '?'})${after > 0 ? `; ảnh chụp sau tuần này nên ${after} tuần sau đó bị che — chart dừng ở tuần ${W.fromDm} → ${toDm}` : ''}. Hai đường trên chart là MA50/MA200 TUẦN của FireAnt (không phải MA ngày): lời không nhắc tới.`,
      `Beat 1 = cây nến tuần (khung ${down ? 'đỏ' : 'xanh'}): tuần ${W.fromDm} → ${toDm} ${down ? 'giảm' : 'tăng'} ${vi(Math.abs(W.changePercent))}% so với đóng cửa tuần trước (${vi(W.prevClose)}). Beat 2 = cận cảnh: cao ${vi(W.high)}, thấp ${vi(W.low)}, đóng ${vi(W.close)} — đóng cửa ${CW.word} (${CW.at}% biên tuần, tính từ đáy)${W.volumeVsPriorWeek != null ? `; khối lượng mỗi phiên ×${vi(W.volumeVsPriorWeek)} tuần trước (${W.volumeVsPriorWeek >= 1 ? 'cao hơn' : 'thấp hơn'})` : ''}.`,
      'Tối đa hai số đọc ra lời (writer.md, bản tuần). Từ của trader: nến tuần, biên tuần, đóng cửa sát đáy / sát đỉnh, khối lượng. Nhãn giữ số của pack (weekly.*).',
    ],
  };
};
