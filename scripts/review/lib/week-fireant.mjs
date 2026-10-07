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
 * With the pack's `indexWeekly` (user 2026-10-06: "eval the VNIndex as daily and weekly of this week" — the scene is
 * "VN-Index · Khung tuần", an EVALUATION of the weekly timeframe, not only the candle) the beats become:
 *   beat 1  a close-up on the week's candle: boxed, its change, range and close, the volume against the week before
 *   beat 2  the wide: the weekly structure (the last two swing highs joined, the last two swing lows joined, dashed),
 *           the nearest weekly zone overhead and underneath (swing levels and FireAnt's WEEKLY MA50/MA200 within 0,5%,
 *           as hlines priced), and the weekly MA200 / MA50 priced at their lines when no zone carries them
 *
 * Pure. Plates are settled by the caller's plateRoom (scaffold), which moves them off candles and volume bars.
 * Every number printed is in the fact pack's `weekly` / `indexWeekly` blocks.
 */
import {dm, round, signed, vi} from './common.mjs';

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
 * @param E      the fact pack's `indexWeekly` block (the weekly timeframe's evaluation), or null for the candle alone
 * @param provisional  the last session's volume is SSI's same-day figure (the week's volume ratio is provisional too)
 * @returns {visual, brief, after} or {why} when the calibration does not reach the edition's week
 */
export const weekVisual = ({W, toDm, p, ma, weeks, spec = {}, maskColor, E = null, provisional = false}) => {
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
  // With the evaluation (E) the candle's plates all come on beat 1 (the close-up) and leave for beat 2 (the wide).
  const candleBeat = E ? 0 : 1;
  const candleUntil = E ? {until: 0} : {};
  const annotations = [
    {kind: 'box', x: clamp(cx - bw / 2), y: clamp(top - 0.012), w: clamp(bw), h: clamp(bottom - top + 0.024), accent: down ? 'down' : 'up', beat: 0},
    {kind: 'label', x: clamp(cx - 0.03), y: clamp(top - 0.05), text: `Tuần ${W.fromDm} → ${toDm} · ${pct(W.changePercent)}`, accent: down ? 'red' : 'green', beat: 0, anchor: 'end', ...candleUntil},
    {kind: 'label', x: clamp(cx - 0.03), y: clamp(bottom + 0.04), text: `Cao ${vi(W.high)} · thấp ${vi(W.low)} · đóng ${vi(W.close)}`, accent: 'white', beat: candleBeat, anchor: 'end', ...candleUntil},
    // Not while the last session's volume is SSI's same-day figure: the skill never prints today's volume ratio (SKILL.md
    // market-review §9 — 1/10: 260M at 15:47, 449M on FireAnt), and the week's ratio carries it.
    ...(W.volumeVsPriorWeek != null && !provisional ? [{kind: 'label', x: clamp(cx - 0.03), y: clamp(bottom + 0.08), text: `KL mỗi phiên ×${vi(W.volumeVsPriorWeek)} tuần trước`, accent: 'white', beat: candleBeat, anchor: 'end', ...candleUntil}] : []),
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
  const closeUp = {x: clamp(Math.max(edge - vw1 / 2, cx + 0.03 - vw1 + 0.02)), y: clamp((hiY + loY) / 2 + 0.02), zoom: z1};
  let shots = [
    {beat: 0, x: clamp(crop.x + crop.w / 2), y: clamp(crop.y + crop.h / 2), zoom: 1.0, move: 'push_in'},
    {beat: 1, ...closeUp, move: 'pull_out'},
  ];

  const photoLine = `Ảnh FireAnt nến TUẦN (tab VNINDEX của người dùng ở khung W), ${vis.filter((b, i) => i <= at && xOf(i) >= crop.x).length} tuần trong khung (từ tuần ${vis.find((b, i) => xOf(i) >= crop.x)?.t ?? '?'})${after > 0 ? `; ảnh chụp sau tuần này nên ${after} tuần sau đó bị che — chart dừng ở tuần ${W.fromDm} → ${toDm}` : ''}.`;
  const candleLine = `tuần ${W.fromDm} → ${toDm}${E?.openThrough ? ` (tuần CHƯA khép lại: mới tới ${E.openThrough.toLowerCase()} — nói "tuần này tới ${E.openThrough.toLowerCase()}", không "cả tuần")` : ''} ${down ? 'giảm' : 'tăng'} ${vi(Math.abs(W.changePercent))}% so với đóng cửa tuần trước (${vi(W.prevClose)}); cao ${vi(W.high)}, thấp ${vi(W.low)}, đóng ${vi(W.close)} — đóng cửa ${CW.word} (${CW.at}% biên tuần, tính từ đáy)${W.volumeVsPriorWeek != null ? `; khối lượng mỗi phiên ×${vi(W.volumeVsPriorWeek)} tuần trước (${W.volumeVsPriorWeek >= 1 ? 'cao hơn' : 'thấp hơn'})${provisional ? ' — KL phiên cuối của SSI còn là số tạm (đủ sau 15:00 hôm sau): không đọc tỉ lệ KL ra lời' : ''}` : ''}`;
  if (!E) {
    return {
      after,
      visual: {crop, masks, ...(masks.length ? {maskColor} : {}), annotations, shots},
      brief: [
        `${photoLine} Hai đường trên chart là MA50/MA200 TUẦN của FireAnt (không phải MA ngày): lời không nhắc tới.`,
        `Beat 1 = cây nến tuần (khung ${down ? 'đỏ' : 'xanh'}). Beat 2 = cận cảnh: ${candleLine}.`,
        'Tối đa hai số đọc ra lời (writer.md, bản tuần). Từ của trader: nến tuần, biên tuần, đóng cửa sát đáy / sát đỉnh, khối lượng. Nhãn giữ số của pack (weekly.*).',
      ],
    };
  }

  // ---- the evaluation (beat 2): structure, the nearest zone each side, the weekly averages
  const idx = (t) => vis.findIndex((b) => b.t === t);
  const inX = (x) => x > crop.x + 0.01 && x < crop.x + crop.w - 0.01;
  const inY = (y) => y > crop.y + 0.02 && y < crop.y + crop.h - 0.02;
  const ptOf = (s) => ({...s, i: idx(s.t)});
  const evalMarks = [];
  const xsEval = [cx];
  const ysEval = [yOf(W.close)];
  for (const side of ['highs', 'lows']) {
    const [a, b] = (E.structure?.[side] ?? []).map(ptOf).filter((s) => s.i >= 0 && s.i <= at && inX(xOf(s.i)));
    if (a && b) {
      evalMarks.push({kind: 'line', from: [clamp(xOf(a.i)), clamp(yOf(a.price))], to: [clamp(xOf(b.i)), clamp(yOf(b.price))], dashed: true, accent: b.price > a.price ? 'up' : 'down', beat: 1});
      xsEval.push(xOf(a.i), xOf(b.i));
      ysEval.push(yOf(a.price), yOf(b.price));
    }
  }
  // A level from an earlier year keeps its year ("1/9/2025"): "1/9" alone reads as this September.
  const when = (m) => (m.t ? (m.t.slice(0, 4) === W.to?.slice(0, 4) ? dm(m.t) : `${dm(m.t)}/${m.t.slice(0, 4)}`) : null);
  const memberText = (m) => (m.kind === 'ma' ? `${m.name} ${vi(m.price)}` : `${m.name.charAt(0).toUpperCase()}${m.name.slice(1)} ${vi(m.price)}${when(m) ? ` (tuần ${when(m)})` : ''}`);
  const zoneText = (z) => z.members.map(memberText).join(' · ');
  const zones = [...(E.up ?? []).slice(0, 1).map((z) => ({z, up: true})), ...(E.down ?? []).slice(0, 1).map((z) => ({z, up: false}))];
  for (const {z, up} of zones) {
    const y = yOf(z.at);
    if (!inY(y)) continue;
    evalMarks.push({kind: 'hline', y: clamp(y), accent: up ? 'red' : 'green', beat: 1, label: zoneText(z), labelSide: 'left'});
    ysEval.push(y);
  }
  const inZone = (name) => zones.some(({z}) => z.members.some((m) => m.kind === 'ma' && m.name.startsWith(name)));
  const MA_ACCENT = {MA50: 'green', MA200: 'gold'};
  for (const [name, m] of Object.entries(E.ma ?? {})) {
    const y = yOf(m.value);
    if (inZone(name) || !inY(y)) continue;
    // A ring on the line at the edition's week holds the plate beside it (a lone plate is a free caption to the plate
    // room and goes to the top of the frame — the MA200 plate landed 364 px above its line, 6/10).
    evalMarks.push({kind: 'circle', x: clamp(cx), y: clamp(y), r: 0.014, accent: MA_ACCENT[name] ?? 'white', beat: 1});
    evalMarks.push({kind: 'label', x: clamp(cx - 0.035), y: clamp(y), text: `${name} tuần ${vi(m.value)}`, accent: MA_ACCENT[name] ?? 'white', beat: 1, anchor: 'end'});
    ysEval.push(y);
  }
  annotations.push(...evalMarks);
  // Beat 1 the close-up on the candle; beat 2 widens to hold the structure, the zones and the averages it prints.
  const span = {x0: Math.min(...xsEval) - 0.06, x1: Math.max(...xsEval) + 0.06, y0: Math.min(...ysEval) - 0.05, y1: Math.max(...ysEval) + 0.05};
  const zw = Math.max(1, Math.min(1.6, crop.w / Math.max(0.05, span.x1 - span.x0), crop.h / Math.max(0.05, span.y1 - span.y0)));
  shots = [
    {beat: 0, ...closeUp, move: 'push_in'},
    {beat: 1, x: clamp(Math.min(edge, (span.x0 + span.x1) / 2)), y: clamp((span.y0 + span.y1) / 2), zoom: round(zw, 2), move: 'pull_out'},
  ];
  const st = E.structure ?? {};
  const maText = Object.entries(E.ma ?? {}).map(([name, m]) => `${name} tuần ${vi(m.value)} (giá ${pct(m.closeVsPercent)})`).join('; ');
  const verdict = st.kind === 'down'
    ? `khung tuần đang ${E.ma?.MA200?.closeVsPercent > 0 ? 'điều chỉnh: đỉnh, đáy thấp dần nhưng giá vẫn trên MA200 tuần — xu hướng dài hạn chưa gãy' : 'giảm: đỉnh, đáy thấp dần và giá dưới MA200 tuần'}`
    : st.kind === 'up'
      ? `khung tuần tăng: đỉnh, đáy cao dần${E.ma?.MA50?.closeVsPercent < 0 ? ', nhưng giá đang dưới MA50 tuần' : ''}`
      : `khung tuần đi ngang: ${st.text ?? '—'}`;
  return {
    after,
    visual: {crop, masks, ...(masks.length ? {maskColor} : {}), annotations, shots},
    brief: [
      `VN-INDEX · KHUNG TUẦN (người dùng 2026-10-06: "eval the VNIndex as daily and weekly of this week") — ĐÁNH GIÁ khung tuần, không chỉ cây nến. ${photoLine} Hai đường trên chart là MA50 / MA200 TUẦN của FireAnt: gọi "MA50 tuần", "MA200 tuần" (không lẫn với MA ngày của scene sau).`,
      `Beat 1 = cận cảnh cây nến tuần (khung ${down ? 'đỏ' : 'xanh'}): ${candleLine}.`,
      `Beat 2 = toàn cảnh khung tuần (${E.window} tuần): ${st.text ?? '—'} (hai đường đứt: đỉnh ${(st.highs ?? []).map((s) => `${s.dm} ${vi(s.price)}`).join(' → ') || '—'}; đáy ${(st.lows ?? []).map((s) => `${s.dm} ${vi(s.price)}`).join(' → ') || '—'}). Giá ${E.maPosition ?? '—'} tuần${maText ? ` (${maText})` : E.maWhy ? ` — không có MA tuần của tuần này: ${E.maWhy}` : ''}. Vùng gần nhất phía trên: ${(E.up ?? []).slice(0, 1).map(zoneText).join('') || '—'}; phía dưới: ${(E.down ?? []).slice(0, 1).map(zoneText).join('') || '—'}. Kết luận do số quyết định: "${verdict}".`,
      'Tối đa hai số đọc ra lời; số đọc thành chữ, mức điểm đọc tròn. Từ của trader: nến tuần, biên tuần, đỉnh, đáy, kháng cự, hỗ trợ, MA50 tuần, MA200 tuần. Nhãn giữ số lẻ của pack (weekly.*, indexWeekly.*). Không nhánh nếu … thì (để scene watch).',
    ],
  };
};
