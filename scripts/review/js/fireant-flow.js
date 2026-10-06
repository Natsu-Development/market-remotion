// Runs INSIDE FireAnt's public "Thống kê sàn" page (https://fireant.vn/thi-truong/thong-ke-san) through
// scripts/shoot.mjs --js — the headless shell, no sign-in, never the user's Chrome. Arguments arrive as
// window.__SHOOT_ARGS (shoot.mjs --js-args):
//   {exchange: 'HSX', aspect: 1.42, pieShare: 0.57}
// The section "Biến động theo sàn" holds two ECharts cards side by side: "Số lượng CP Tăng, Giảm, Không đổi"
// (a pie) and "Phân bổ dòng tiền" (bars, tỷ đồng) — the chart the user asked for on 2026-10-05. This script picks
// the exchange tab, reads both charts' OWN option objects (the `option` prop of the React component that owns each
// ECharts container; the canvas carries no text — measured 2026-10-05), reads the exchange tile above it (index,
// change, counts, total value), makes the two chart containers taller so the card frames at the reel panel's
// ratio (ECharts redraws itself at the new size; the option is never touched), hides fixed overlays, and tags the
// card #fireant-flow-card for --clip. Its return value lands in the photo's sidecar as `js`: the numbers, and each
// chart's box as fractions of the card. It fails loudly when the page no longer looks the way it was measured.
// Since 2026-10-05 evening (user: "add the image of 'Tác động đến Index' on scene 02 - on beat 2") the clip is TWO
// cards stacked in one wrapper: the money card on top, FireAnt's "Top cổ phiếu tác động" (points each stock added to /
// took from the index, top five each way) below, each at the panel's ratio — so the photo is one card wide and two
// tall, and every box in `js` is a fraction of that wrapper. The impact chart keeps its data in the React state of the
// component that draws it (betarest …/symbols/contribute-to-index), not in its `option` prop: it is read from there.
const A = window.__SHOOT_ARGS ?? {};
const EXCHANGE = A.exchange ?? 'HSX';
const ASPECT = A.aspect ?? 1.42;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const until = async (cond, ms = 20000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) if (cond()) return true;
  return false;
};
const fail = (msg) => { throw new Error(`fireant-flow.js: ${msg}`); };
const leafWith = (text) => [...document.querySelectorAll('h1,h2,h3,h4,div,span,p,button')]
  .find((e) => e.childElementCount === 0 && norm(e.textContent) === text);

// 1. The section and its two chart containers (ECharts tags its container with _echarts_instance_).
if (!(await until(() => leafWith('Biến động theo sàn')))) fail('no "Biến động theo sàn" heading — the page did not load or changed');
const section = leafWith('Biến động theo sàn').closest('section') ?? fail('the heading is not inside a <section>');
const charts = () => [...section.querySelectorAll('[_echarts_instance_]')];
if (!(await until(() => charts().length === 2 && charts().every((c) => c.querySelector('canvas'))))) fail(`expected 2 ECharts containers in the section, found ${charts().length}`);

// 2. The exchange tab ("Theo sàn: HSX | HNX | UPCOM", HSX by default).
const tab = [...document.querySelectorAll('button')].find((b) => norm(b.innerText) === EXCHANGE);
if (!tab) fail(`no "${EXCHANGE}" tab button`);
tab.click();
await sleep(1500);

// 3. Each chart's own option, from the React fiber of its container.
const optionOf = (el) => {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
  for (let f = key ? el[key] : null, hops = 0; f && hops < 40; f = f.return, hops++) {
    const p = f.memoizedProps;
    if (p && typeof p === 'object' && p.option && Array.isArray(p.option.series)) return p.option;
  }
  return null;
};
const opts = charts().map((el) => ({el, option: optionOf(el)}));
if (opts.some((o) => !o.option)) fail('a chart container has no React `option` prop — FireAnt changed how it mounts ECharts');
const pieO = opts.find((o) => o.option.series[0]?.type === 'pie') ?? fail('no pie series');
const barO = opts.find((o) => o.option.series[0]?.type === 'bar') ?? fail('no bar series');
const KEY = {'Tăng': 'up', 'Giảm': 'down', 'Không đổi': 'flat', 'Kh. đổi': 'flat'};
const keyOf = (name) => KEY[Object.keys(KEY).find((k) => norm(name).startsWith(k))] ?? null;
const counts = {};
for (const d of pieO.option.series[0].data ?? []) {
  const k = keyOf(d.name);
  if (k) counts[k] = Number(d.value);
}
const xAxis = [].concat(barO.option.xAxis ?? [])[0] ?? {};
const cats = xAxis.data ?? [];
const money = {};
(barO.option.series[0].data ?? []).forEach((d, i) => {
  const k = keyOf(typeof cats[i] === 'object' ? cats[i]?.value : cats[i]);
  if (k) money[k] = Number(typeof d === 'object' ? d.value : d);
});
for (const k of ['up', 'down', 'flat']) {
  if (!Number.isFinite(counts[k])) fail(`pie has no "${k}" slice (${JSON.stringify(pieO.option.series[0].data)})`);
  if (!Number.isFinite(money[k])) fail(`bars have no "${k}" bar (categories ${JSON.stringify(cats)})`);
}

// 4. The exchange tile: "Sàn HSX 1753.20 +15.49 / +0.89% 162 155 49 Tổng giá trị 13.333,41 …".
const tileText = norm([...document.querySelectorAll('div')]
  .filter((d) => norm(d.innerText).startsWith(`Sàn ${EXCHANGE} `) && norm(d.innerText).includes('Tổng giá trị'))
  .sort((a, b) => norm(a.innerText).length - norm(b.innerText).length)[0]?.innerText);
const m = tileText.match(new RegExp(`^Sàn ${EXCHANGE}\\s+([\\d.]+)\\s+([+-]?[\\d.]+)\\s*/\\s*([+-]?[\\d.]+)%\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+Tổng giá trị\\s+([\\d.,]+)`));
if (!m) fail(`the ${EXCHANGE} tile reads "${tileText.slice(0, 120)}"`);
const viNum = (s) => Number(s.replace(/\./g, '').replace(',', '.'));
const tile = {index: Number(m[1]), change: Number(m[2]), changePercent: Number(m[3]), up: Number(m[4]), down: Number(m[5]), flat: Number(m[6]), totalValue: viNum(m[7])};
if (tile.up !== counts.up || tile.down !== counts.down || tile.flat !== counts.flat) {
  fail(`the tile counts ${tile.up}/${tile.down}/${tile.flat} disagree with the pie ${counts.up}/${counts.down}/${counts.flat}`);
}

// 5. The card at the panel's ratio. The card is a two-column grid; the pie gets the wider column (PIE_SHARE) because
//    ECharts truncates a pie label that reaches its container's edge ("Tăng (..." at 50/50, measured 2026-10-05),
//    then both chart containers grow until card width / card height = ASPECT.
const card = (() => {
  let c = pieO.el;
  while (c && !(c.contains(barO.el) && /rounded/.test(String(c.className)))) c = c.parentElement;
  return c ?? fail('no rounded card holding both charts');
})();
const PIE_SHARE = A.pieShare ?? 0.57;
if (getComputedStyle(card).display === 'grid') {
  const w0 = pieO.el.getBoundingClientRect().width;
  card.style.gridTemplateColumns = `${PIE_SHARE}fr ${1 - PIE_SHARE}fr`;
  await until(() => Math.abs(pieO.el.querySelector('canvas').getBoundingClientRect().width - pieO.el.getBoundingClientRect().width) < 1.5
    && Math.abs(pieO.el.getBoundingClientRect().width - w0) > 2, 8000);
  await sleep(600);
}
const h0 = pieO.el.getBoundingClientRect().height;
const r0 = card.getBoundingClientRect();
const side = pieO.el.getBoundingClientRect().right <= barO.el.getBoundingClientRect().left + 1;
if (!side) fail('the two charts are stacked at this viewport — use a viewport wide enough for the side-by-side layout (≥ 768 px)');
const target = Math.round(r0.width / ASPECT - (r0.height - h0));
for (const o of [pieO, barO]) o.el.style.height = `${target}px`;
window.dispatchEvent(new Event('resize'));
const grown = await until(() => [pieO, barO].every((o) => Math.abs(o.el.querySelector('canvas').getBoundingClientRect().height - target) < 1.5), 8000);
if (!grown) fail(`ECharts did not redraw at ${target} px (canvas ${pieO.el.querySelector('canvas').getBoundingClientRect().height} px)`);
await sleep(1600);   // the redraw animates

// 5b. "Top cổ phiếu tác động" — the index's pullers and draggers (user 2026-10-05: beat 2 of scene 02). It loads when
//     scrolled into view; its numbers live in the hooks of the component above its ECharts container (arrays of
//     {symbol, value}: the five that added most, the five that took most) and the option it draws from is a useMemo
//     there too, so both are read from the fiber's hook states.
const impHead = leafWith('Top cổ phiếu tác động') ?? fail('no "Top cổ phiếu tác động" heading');
const impSection = impHead.closest('section') ?? fail('the impact heading is not inside a <section>');
const impEl = impSection.querySelector('[_echarts_instance_]') ?? fail('no ECharts container in the impact section');
impSection.scrollIntoView({block: 'center'});
const hookValues = (el) => {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
  const out = [];
  for (let f = key ? el[key] : null, hops = 0; f && hops < 12; f = f.return, hops++) {
    for (let st = f.memoizedState, i = 0; st && typeof st === 'object' && 'next' in st && i < 40; st = st.next, i++) {
      const v = st.memoizedState;
      out.push(v, ...(Array.isArray(v) ? [v[0]] : []));
    }
    if (f.memoizedProps?.option) out.push(f.memoizedProps.option);
  }
  return out;
};
const isRows = (v) => Array.isArray(v) && v.length > 0 && v.every((r) => r && typeof r.symbol === 'string' && Number.isFinite(r.value));
let impRows = null, impOption = null;
await until(() => {
  const vals = hookValues(impEl);
  const rows = vals.filter(isRows);
  impOption = vals.find((v) => v && typeof v === 'object' && Array.isArray(v.series) && (v.series[0]?.data ?? []).length) ?? null;
  if (rows.length >= 2 && impEl.querySelector('canvas')) { impRows = rows; return true; }
  return false;
}, 20000);
if (!impRows) fail('the impact chart never got its rows (contribute-to-index) — FireAnt changed the component');
const ups = impRows.find((r) => r.every((x) => x.value >= 0)) ?? fail('no all-positive impact list');
const downs = impRows.find((r) => r.every((x) => x.value <= 0)) ?? fail('no all-negative impact list');
const impCard = (() => {
  let c = impEl;
  while (c && !/rounded/.test(String(c.className))) c = c.parentElement;
  return c && impSection.contains(c) ? c : fail('no rounded card around the impact chart');
})();
// One wrapper, two cards: the money card, then the impact card, both as wide as the money card and each at ASPECT.
const wrap = document.createElement('div');
const W0 = card.getBoundingClientRect().width;
wrap.style.cssText = `display:flex;flex-direction:column;gap:0;width:${W0}px;background:${getComputedStyle(document.body).backgroundColor}`;
card.parentElement.insertBefore(wrap, card);
wrap.appendChild(card);
wrap.appendChild(impCard);
impCard.style.width = `${W0}px`;
impCard.style.margin = '0';
const ih0 = impEl.getBoundingClientRect().height;
const ir0 = impCard.getBoundingClientRect();
const impTarget = Math.round(ir0.width / ASPECT - (ir0.height - ih0));
impEl.style.height = `${impTarget}px`;
window.dispatchEvent(new Event('resize'));
const impGrown = await until(() => Math.abs(impEl.querySelector('canvas').getBoundingClientRect().height - impTarget) < 1.5, 8000);
if (!impGrown) fail(`the impact chart did not redraw at ${impTarget} px`);
await sleep(1600);
wrap.scrollIntoView({block: 'start'});
await sleep(400);

// 6. Fixed and sticky overlays (header, the "Tính năng mới" pill, ads) would print over a clipped capture.
for (const e of document.querySelectorAll('body *')) {
  const p = getComputedStyle(e).position;
  // display:none, not visibility:hidden — a child that sets its own visibility (the header's blurred search and buttons)
  // still painted two grey patches over the money card's titles once the stacked wrapper scrolled under it (5/10).
  if ((p === 'fixed' || p === 'sticky') && !e.contains(wrap)) e.style.display = 'none';
}
wrap.id = 'fireant-flow-card';

const rc = wrap.getBoundingClientRect();
const frac = (el) => {
  const r = el.getBoundingClientRect();
  return {x: (r.x - rc.x) / rc.width, y: (r.y - rc.y) / rc.height, w: r.width / rc.width, h: r.height / rc.height};
};
const titleOf = (el) => {
  let c = el;
  while (c && c.parentElement !== card && !c.parentElement?.contains(pieO.el === el ? barO.el : pieO.el)) c = c.parentElement;
  const t = [...(c ?? el).querySelectorAll('div')].find((d) => d.childElementCount === 0 && norm(d.textContent).length > 3);
  return t ? {text: norm(t.textContent), ...frac(t)} : null;
};
// Each bar's box from the canvas pixels in the bar's own colour (bars are solid; the value labels are not coloured).
// The pie's slices share their colours with the label leader lines, so the pie is located from its option instead:
// ECharts puts a '50%' radius at half of half the container's shorter side, centred at ['50%', '50%'].
const hex = (c) => {
  const mm = /^#?([0-9a-f]{6})$/i.exec(String(c ?? ''));
  return mm ? [0, 2, 4].map((i) => parseInt(mm[1].slice(i, i + 2), 16)) : null;
};
const barItems = (() => {
  const cv = barO.el.querySelector('canvas');
  const {width: W, height: H} = cv;
  const px = cv.getContext('2d').getImageData(0, 0, W, H).data;
  const r = cv.getBoundingClientRect();
  return (barO.option.series[0].data ?? []).map((d, i) => {
    const c = hex(d?.itemStyle?.color);
    const key = keyOf(typeof cats[i] === 'object' ? cats[i]?.value : cats[i]);
    if (!c) return {key, box: null};
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        if (Math.abs(px[k] - c[0]) <= 2 && Math.abs(px[k + 1] - c[1]) <= 2 && Math.abs(px[k + 2] - c[2]) <= 2) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return {key, colour: d.itemStyle.color, box: null};
    const sx = r.width / W, sy = r.height / H;
    return {key, colour: d.itemStyle.color, box: {x: (r.x + x0 * sx - rc.x) / rc.width, y: (r.y + y0 * sy - rc.y) / rc.height, w: ((x1 - x0 + 1) * sx) / rc.width, h: ((y1 - y0 + 1) * sy) / rc.height}};
  });
})();
const pieGeo = (() => {
  const s = pieO.option.series[0];
  const pr = pieO.el.getBoundingClientRect();
  const pctOf = (v, size) => (typeof v === 'string' && v.endsWith('%') ? (Number(v.slice(0, -1)) / 100) * size : Number(v));
  const outer = Array.isArray(s.radius) ? s.radius[1] : s.radius ?? '75%';
  const rPx = pctOf(outer, Math.min(pr.width, pr.height) / 2);
  const [cx, cy] = (s.center ?? ['50%', '50%']).map((v, i) => pctOf(v, i ? pr.height : pr.width));
  return {cx: (pr.x + cx - rc.x) / rc.width, cy: (pr.y + cy - rc.y) / rc.height, rx: rPx / rc.width, ry: rPx / rc.height};
})();

// The impact bars, left to right as drawn: from the option FireAnt draws (its own categories and colours) when the
// useMemo was found, else in the page's order (the five that added most, largest first, then the five that took most,
// smallest first — as on 5/10). Each box comes from the canvas pixels in that bar's colour, scanned column by column.
const impCats = impOption ? ([].concat(impOption.xAxis ?? [])[0]?.data ?? []).map((c) => (typeof c === 'object' ? c?.value : c)) : null;
const impOrder = impCats?.length ? impCats : [...ups.map((x) => x.symbol), ...[...downs].reverse().map((x) => x.symbol)];
const valueOf = new Map([...ups, ...downs].map((x) => [x.symbol, x.value]));
const impBars = (() => {
  const cv = impEl.querySelector('canvas');
  const {width: W, height: H} = cv;
  const px = cv.getContext('2d').getImageData(0, 0, W, H).data;
  const r = cv.getBoundingClientRect();
  // Coloured columns: saturated pixels (bars are solid green or red; axis text and grid lines are grey).
  const colOf = (x) => {
    let n = 0, y0 = Infinity, y1 = -Infinity;
    for (let y = 0; y < H; y++) {
      const k = (y * W + x) * 4;
      const mx = Math.max(px[k], px[k + 1], px[k + 2]), mn = Math.min(px[k], px[k + 1], px[k + 2]);
      if (px[k + 3] > 200 && mx - mn > 70 && mx > 110) { n++; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return n > 2 ? {y0, y1} : null;
  };
  const runs = [];
  for (let x = 0; x < W; x++) {
    const c = colOf(x);
    if (c && runs.length && runs.at(-1).x1 === x - 1) { const R = runs.at(-1); R.x1 = x; R.y0 = Math.min(R.y0, c.y0); R.y1 = Math.max(R.y1, c.y1); }
    else if (c) runs.push({x0: x, x1: x, y0: c.y0, y1: c.y1});
  }
  // Bars are at least 4 px wide on the canvas; thinner runs are label glyphs.
  const bars = runs.filter((b) => b.x1 - b.x0 >= 3);
  const sx = r.width / W, sy = r.height / H;
  return impOrder.map((symbol, i) => {
    const b = bars.length === impOrder.length ? bars[i] : null;
    return {symbol, points: valueOf.get(symbol) ?? null, box: b ? {x: (r.x + b.x0 * sx - rc.x) / rc.width, y: (r.y + b.y0 * sy - rc.y) / rc.height, w: ((b.x1 - b.x0 + 1) * sx) / rc.width, h: ((b.y1 - b.y0 + 1) * sy) / rc.height} : null};
  });
})();
const impTitle = (() => {
  const t = [...impSection.querySelectorAll('div,h2,h3,p,span')].find((d) => d.childElementCount === 0 && /kéo|đẩy/i.test(norm(d.textContent)));
  return t ? norm(t.textContent) : null;
})();

const total = money.up + money.down + money.flat;
return {
  url: location.href,
  exchange: EXCHANGE,
  tile,
  counts: {...counts, total: counts.up + counts.down + counts.flat},
  money: {...money, total},
  unit: 'tỷ đồng',
  source: {
    counts: 'ECharts option of the pie (series[0].data), read from the React prop of its container; equals the tile',
    money: 'ECharts option of the bars (series[0].data × xAxis.data), read from the React prop of its container',
    index: `the "Sàn ${EXCHANGE}" tile`,
  },
  pie: {...frac(pieO.el), radius: pieO.option.series[0].radius ?? null, center: pieO.option.series[0].center ?? null, geo: pieGeo, title: titleOf(pieO.el)},
  bars: {...frac(barO.el), grid: barO.option.grid ?? null, categories: cats, items: barItems, title: titleOf(barO.el)},
  card: {w: rc.width, h: rc.height, aspect: rc.width / rc.height, money: frac(card), impact: frac(impCard)},
  impact: {
    ...frac(impEl),
    title: 'Top cổ phiếu tác động',
    subtitle: impTitle,
    unit: 'điểm',
    up: ups.map((x) => ({symbol: x.symbol, points: x.value})),
    down: downs.map((x) => ({symbol: x.symbol, points: x.value})),
    bars: impBars,
    source: 'React hook state of the chart component (FireAnt betarest /symbols/contribute-to-index, top 5 each way); order and colours from its useMemo option when found',
  },
  chartHeight: {from: h0, to: target},
};
