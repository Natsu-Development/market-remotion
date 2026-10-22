// node --test scripts/review/lib/symbol-review.test.mjs
// The price action of method symbol-reviewer/2 (user 2026-10-03: "include the price action … trendline & resistance and
// each price must be noted") on synthetic bars, and the validator's rules — each broken once. Round 2 (4/10, the verify
// workflow's completeness critic): hull-fitted trendlines, the validator held to the method (structure, setup, beat-0
// structure, mandatory trendline, the last-bar candle on beat 1, a price on every label), equal swings, failed breakouts,
// level touches counted per session.
import test from 'node:test';
import assert from 'node:assert/strict';
import {NEAR_SINCE, candleOf, candleReads, failedBreakoutOf, levelsOf, nearLinesOf, rolesOf, structureOf, swingsOf, trendlinesOf, validateReview} from './symbol-review.mjs';

// 40 sessions: a rising zig-zag (swing lows at 5, 15, 25; highs at 10, 20, 30), then a last session that breaks the high
// intraday and closes low in its range — the MSR 2/10 shape.
const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const bars = [];
for (let i = 0; i < 40; i++) {
  const base = 20 + i * 0.25 + 1.6 * Math.sin(((i - 5) / 10) * Math.PI * 2 - Math.PI / 2);
  bars.push({t: day(i), o: base, h: base + 0.4, l: base - 0.4, c: base + 0.1, v: 1000});
}
const L = bars.length - 1;
bars[L] = {t: day(L), o: 31, h: 34, l: 30.8, c: 31.9, v: 3000};   // a new high sold from the top
const window = {low: Math.min(...bars.map((b) => b.l)), high: Math.max(...bars.map((b) => b.h)), dates: new Set(bars.map((b) => b.t)), list: bars, from: bars[0].t, to: bars[L].t};

const sw = swingsOf(bars);
const st = structureOf(bars, sw);
const fit = trendlinesOf(bars, sw);
const tl = fit.support.active;
const lv = levelsOf(bars, sw, bars[L].c);
const support = lv.below[0];
const vi = (n) => n.toFixed(2).replace('.', ',');

test('swings, structure, levels and the hull trendline are measured from the bars', () => {
  assert.ok(sw.lows.length >= 3 && sw.highs.length >= 2, 'swing points found');
  assert.equal(st.kind, 'up');
  assert.equal(st.brokeLastHigh, true);
  assert.ok(tl, 'a rising support line under the lows');
  assert.ok(tl.touches >= 2);
  // Under every low from its first anchor on, within 0,5%; at most one close under it.
  for (let i = tl.a.i; i <= L; i++) {
    const v = tl.a.price + ((tl.b.price - tl.a.price) * (i - tl.a.i)) / (tl.b.i - tl.a.i);
    assert.ok(bars[i].l >= v * (1 - 0.005) - 1e-9, `low of ${bars[i].t} under the line`);
  }
  assert.ok(tl.worstPiercePercent <= 0.5 && tl.closesThrough <= 1);
  assert.ok(lv.below.length >= 1, 'an old swing below the close is support');
});

test('a line pierced by a low is not fitted', () => {
  const b2 = bars.map((b) => ({...b}));
  const i = tl.b.i + 2;                        // a session between the second anchor and the last bar dips well under the line
  const v = tl.a.price + ((tl.b.price - tl.a.price) * (i - tl.a.i)) / (tl.b.i - tl.a.i);
  b2[i].l = v * 0.98;
  const again = trendlinesOf(b2, swingsOf(b2)).support.all;
  assert.ok(!again.some((l) => l.a.t === tl.a.t && l.b.t === tl.b.t), 'the pierced line is gone');
});

test('equal lows read as a double bottom (range), not a higher low', () => {
  const s = structureOf(bars, {highs: [{i: 10, t: day(10), price: 30}, {i: 20, t: day(20), price: 31}], lows: [{i: 15, t: day(15), price: 22.25}, {i: 25, t: day(25), price: 22.3}]});
  assert.equal(s.hl, 'equal');
  assert.equal(s.kind, 'range');
});

test('a close back under a swing high taken in the last five sessions is a failed breakout', () => {
  const b2 = bars.map((b) => ({...b}));
  const h = sw.highs.at(-1);
  b2[L - 2] = {...b2[L - 2], c: h.price * 1.01, h: h.price * 1.02};
  b2[L] = {...b2[L], c: h.price * 0.98, h: h.price * 1.0, l: h.price * 0.97};
  assert.equal(failedBreakoutOf(b2, swingsOf(b2))?.price, h.price);
});

test('a level counts every session that came within the tolerance', () => {
  const l = lv.below[0];
  assert.ok(l.touches >= l.swingTouches);
  assert.equal(l.touches, l.touchDates.length);
});

test('a close low in the range after a new high reads as selling from the high', () => {
  const k = candleOf(bars, L);
  assert.ok(k.closeRangePercent < 50);
  assert.ok(candleReads(k).some((r) => r.id === 'upper-wick'));
});

// What `measure` would report for the synthetic chart (the validator re-runs the method; tests hand it in).
const measured = {
  numbers: [
    {key: 'resistance1', value: lv.above[0]?.price ?? bars[L].h, kind: lv.above.length ? 'swing-high' : 'session-high'},
    {key: 'support1', value: support.price},
    {key: 'ma50', value: 25},
    {key: 'ma200', value: 22},
  ],
  priceAction: {
    structure: {kind: st.kind, text: st.text},
    trendlines: {support: {active: {a: {date: tl.a.t, price: tl.a.price}, b: {date: tl.b.t, price: tl.b.price}, price: tl.price}, broken: null}, resistance: {active: null, broken: null}},
  },
  classes: [{kind: 'breakout-rejected'}, {kind: 'extended'}, {kind: 'trend'}],
};
const r1 = measured.numbers[0].value;
const valid = () => ({
  symbol: 'TST', date: day(L), method: 'symbol-reviewer/2',
  inputs: {facts: 'synthetic', analyze: 'synthetic'},
  numbers: [
    {key: 'price', value: bars[L].c, source: 'facts', path: 'synthetic'},
    {key: 'todayHigh', value: bars[L].h, source: 'analyze', path: 'synthetic'},
    {key: 'resistance1', value: r1, source: 'analyze', path: 'synthetic'},
    {key: 'support1', value: support.price, source: 'analyze', path: 'synthetic'},
    {key: 'trendlineSupport', value: Number(tl.price.toFixed(2)), source: 'derived', path: 'synthetic'},
    {key: 'closeRangePercent', value: Number(candleOf(bars, L).closeRangePercent.toFixed(2)), source: 'derived', path: 'synthetic'},
    {key: 'ma50', value: 25, source: 'fireant', path: 'synthetic'},
    {key: 'ma200', value: 22, source: 'fireant', path: 'synthetic'},
  ],
  checks: [],
  setup: 'breakout-rejected',
  priceAction: {structure: st.kind, read: `Vượt đỉnh lên ${vi(bars[L].h)} nhưng đóng cửa ${vi(bars[L].c)} — râu trên dài, bị bán từ đỉnh.`, keys: ['todayHigh', 'price', 'closeRangePercent']},
  verdict: `Xu hướng tăng, nhưng phiên vượt đỉnh ${vi(bars[L].h)} bị bán.`,
  detail: {kind: 'breakout-rejected', text: `Đóng cửa ${vi(bars[L].c)} dưới nửa biên độ.`, keys: ['price', 'closeRangePercent']},
  marks: [
    {kind: 'ma', ref: 'ma50', label: 'MA50 · 25,00', accent: 'green', beat: 0},
    {kind: 'ma', ref: 'ma200', label: 'MA200 · 22,00', accent: 'gold', beat: 0},
    {kind: 'trendline', role: 'support', anchors: [{date: tl.a.t, price: tl.a.price}, {date: tl.b.t, price: tl.b.price}], price: Number(tl.price.toFixed(2)), label: `Trendline hỗ trợ · ${vi(tl.price)}`, accent: 'green', beat: 0},
    {kind: 'level', role: 'resistance', price: r1, label: `Kháng cự · ${vi(r1)}`, accent: 'gold', beat: 0},
    {kind: 'level', role: 'support', price: support.price, label: `Hỗ trợ · ${vi(support.price)}`, accent: 'green', beat: 0},
    {kind: 'candle', date: 'last', read: 'upper-wick', price: bars[L].h, label: `Râu trên · bán từ ${vi(bars[L].h)}`, accent: 'red', beat: 1},
  ],
  branches: [{if: `Nếu giữ trên ${vi(support.price)}`, then: 'xu hướng tăng còn nguyên.'}],
  unsupported: [],
});
const errs = (r, extra = {}) => validateReview(r, {window, measured, others: [], ...extra});
const has = (list, re) => list.some((x) => re.test(x));

test('the synthetic /2 review is valid', () => {
  assert.deepEqual(errs(valid()), []);
});

test('no support on the chart is rejected', () => {
  const r = valid();
  r.marks = r.marks.filter((m) => m.role !== 'support');
  assert.ok(has(errs(r), /no support/));
});

test('no resistance on the chart is rejected', () => {
  const r = valid();
  r.marks = r.marks.filter((m) => m.role !== 'resistance');
  assert.ok(has(errs(r), /no resistance/));
});

test('no candle read is rejected', () => {
  const r = valid();
  r.marks = r.marks.filter((m) => m.kind !== 'candle');
  assert.ok(has(errs(r), /no candle read/));
});

test('a level label without its price is rejected', () => {
  const r = valid();
  r.marks[3].label = 'Kháng cự · đỉnh phiên';
  assert.ok(has(errs(r), /does not print its price/));
});

test('an MA plate without FireAnt\'s value is rejected', () => {
  const r = valid();
  r.marks[0].label = 'MA50 của FireAnt';
  assert.ok(has(errs(r), /does not print FireAnt's ma50/));
});

test('a pointer label without its price is rejected', () => {
  const r = valid();
  r.marks.push({kind: 'pointer', date: 'last', price: bars[L].c, label: 'Đóng cửa', accent: 'white', beat: 1});
  assert.ok(has(errs(r), /pointer.*does not print its price/));
});

test('a zone label without its bounds is rejected', () => {
  const r = valid();
  r.marks.push({kind: 'zone', from: day(L - 6), to: day(L - 1), low: bars[L - 3].l, high: bars[L - 3].h, label: 'Nền giá', accent: 'white', beat: 1});
  assert.ok(has(errs(r), /zone.*does not print the zone/));
});

test('a trendline the method does not fit is rejected', () => {
  const r = valid();
  r.marks[2].anchors[1] = {date: day(L - 2), price: bars[L - 2].l};
  assert.ok(has(errs(r), /not a support trendline the method fits/));
});

test("a trendline whose price is not the line's value at the last bar is rejected", () => {
  const r = valid();
  r.marks[2].price = Number((tl.price + 1).toFixed(2));
  r.marks[2].label = `Trendline hỗ trợ · ${vi(tl.price + 1)}`;
  assert.ok(has(errs(r), /not the line's value/));
});

test('no trendline while the method fits one is rejected', () => {
  const r = valid();
  r.marks = r.marks.filter((m) => m.kind !== 'trendline');
  assert.ok(has(errs(r), /no trendline on the chart/));
});

test('a candle read that was not measured on that bar is rejected', () => {
  const r = valid();
  r.marks[5].read = 'lower-wick';
  assert.ok(has(errs(r), /was not measured/));
});

test('a candle read of an earlier bar is rejected', () => {
  const r = valid();
  r.marks[5] = {...r.marks[5], date: day(L - 1), price: bars[L - 1].h, label: `Nến · ${vi(bars[L - 1].h)}`};
  assert.ok(has(errs(r), /candle read is of the last bar/));
});

test('a candle read on the wide shot is rejected', () => {
  const r = valid();
  r.marks[5].beat = 0;
  assert.ok(has(errs(r), /belongs to beat 1/));
});

test('beat 0 without the MA plates is rejected', () => {
  const r = valid();
  r.marks[0].beat = 1;
  assert.ok(has(errs(r), /beat 0 has no MA50 plate/));
});

test('beat 0 without the nearest resistance is rejected', () => {
  const r = valid();
  r.marks[3].beat = 1;
  assert.ok(has(errs(r), /beat 0 has no nearest resistance/));
});

test('beat 0 without the nearest support or a trendline is rejected', () => {
  const r = valid();
  r.marks[2].beat = 1;
  r.marks[4].beat = 1;
  assert.ok(has(errs(r), /beat 0 has neither the nearest support/));
});

test('a structure other than the measured one is rejected', () => {
  const r = valid();
  r.priceAction.structure = 'down';
  assert.ok(has(errs(r), /the method measures "up"/));
});

test('a setup the method does not measure is rejected', () => {
  const r = valid();
  r.setup = r.detail.kind = 'base';
  assert.ok(has(errs(r), /not a class the method measures/));
});

test('a later class while the first is free is rejected', () => {
  const r = valid();
  r.setup = r.detail.kind = 'extended';
  assert.ok(has(errs(r), /the method's setup is "breakout-rejected"/));
});

test('the next class is right when a higher-ranked leader holds the first', () => {
  const r = valid();
  r.setup = r.detail.kind = 'extended';
  assert.deepEqual(errs(r, {others: [{symbol: 'TOP', setup: 'breakout-rejected'}]}).filter((x) => /setup/.test(x)), []);
});

test('a support above the close is rejected', () => {
  const r = valid();
  r.marks[4].price = bars[L].h;
  r.marks[4].label = `Hỗ trợ · ${vi(bars[L].h)}`;
  assert.ok(has(errs(r), /is above the close/));
});

test('a review without priceAction is rejected', () => {
  const r = valid();
  delete r.priceAction;
  assert.ok(has(errs(r), /priceAction missing/));
});

test('a call word in the price-action read is rejected', () => {
  const r = valid();
  r.priceAction.read += ' Nên mua.';
  assert.ok(has(errs(r), /call word/));
});

test('a /1 review (before price action) keeps the old rules', () => {
  const r = valid();
  r.method = 'symbol-reviewer/1';
  delete r.priceAction;
  r.marks = r.marks.filter((m) => m.kind !== 'candle' && m.kind !== 'trendline').map((m) => ({...m, role: undefined}));
  r.detail.kind = 'pullback';
  r.setup = 'pullback';
  assert.deepEqual(errs(r).filter((x) => /support|resistance|candle|priceAction|structure|setup|trendline/.test(x)), []);
});

// ---- the holder's near lines (user 2026-10-11: "Optimize the SL of PVP since it so far and not make-sense")
// PVP 17/9 → 9/10: a run from the 21/9 low (17,95) to 25,55 on 7/10 with one pullback (30/9, low 20,60) and no base, then a
// bearish engulfing on 9/10 (25,15 → 24,10, low 24,00). FireAnt's MA50 18,52; the nearest support 19,65 is 18,5% under.
const PVP = [
  ['2026-09-17', 18.6, 18.75, 18.05, 18.15], ['2026-09-18', 18.2, 18.35, 18.05, 18.1], ['2026-09-21', 18.2, 18.35, 17.95, 18.25],
  ['2026-09-22', 18.35, 19.5, 18.3, 19.5], ['2026-09-23', 20, 20.5, 19.5, 19.5], ['2026-09-24', 19.9, 20.3, 19, 19.2],
  ['2026-09-25', 19.35, 20.5, 19.25, 20.5], ['2026-09-28', 21, 21.5, 20.5, 20.85], ['2026-09-29', 21, 22.3, 20.85, 21.9],
  ['2026-09-30', 21.9, 21.9, 20.6, 20.9], ['2026-10-01', 20.85, 21.7, 20.85, 21.6], ['2026-10-02', 21.95, 23.05, 21.95, 22],
  ['2026-10-05', 22.4, 23.25, 22.15, 22.85], ['2026-10-06', 23.5, 24, 23, 23.9], ['2026-10-07', 24.25, 25.55, 23.9, 24.6],
  ['2026-10-08', 24.95, 25.2, 24.15, 25], ['2026-10-09', 25.15, 25.15, 24, 24.1],
].map(([t, o, h, l, c]) => ({t, o, h, l, c, v: 1e6}));
const pvpNum = (NL, over = {}) => {
  const v = {
    price: 24.1, aboveMa50Percent: 30.13, aboveMa200Percent: 48.67, ma50: 18.52, ma200: 16.21, pivot: 25.55, closeVsPivotPercent: -5.68,
    support1: 19.64, support2: 19.26, trendlineSupport: 17.02, run15Percent: 34.26,
    reversalLow: NL.reversal?.price ?? null, low2Sessions: NL.low2.price, higherLow: NL.higherLow?.price ?? null, ...over,
  };
  return (k) => v[k] ?? null;
};
const EXT = [{kind: 'extended'}, {kind: 'pullback'}, {kind: 'trend'}];

test('PVP 9/10: half under the reversal candle low, the rest under the run\'s last higher low', () => {
  const NL = nearLinesOf(PVP, 18.52);
  assert.deepEqual(NL.reversal, {price: 24, t: '2026-10-09', read: 'bear-engulf'});
  assert.deepEqual(NL.higherLow, {price: 20.6, t: '2026-09-30', under: '2026-09-29', age: 7});
  const {holder, notHolder} = rolesOf({num: pvpNum(NL), classes: EXT, price: 24.1, danger: true, date: '2026-10-09'});
  assert.equal(holder.case, 'extended');
  assert.equal(holder.priceKey, 'reversalLow');
  assert.equal(holder.price, 24);
  assert.equal(holder.if, 'Nếu đóng cửa dưới đáy nến đảo chiều 24,00');
  assert.equal(holder.plate, 'Đang giữ: dưới 24,00 chốt 1/2');
  assert.equal(holder.say, 'Đang giữ, thủng 24,00 thì chốt lời một nửa.');
  assert.deepEqual(holder.full, {priceKey: 'higherLow', price: 20.6, label: 'đáy nhịp tăng gần nhất 20,60', then: 'thoát hết', say: 'Dưới 20,60 thì thoát hết.'});
  assert.equal(notHolder.case, 'exhausted');
  assert.equal(notHolder.say, 'Chưa có hàng thì không mua đuổi, giá đã kéo xa.');
});

test('no reversal candle: the half comes off under the last two sessions\' low', () => {
  const bars2 = [...PVP.slice(0, -1), {t: '2026-10-09', o: 24.9, h: 25.1, l: 24.3, c: 24.5, v: 1e6}];   // an inside day, no engulfing
  const NL = nearLinesOf(bars2, 18.52);
  assert.equal(NL.reversal, null);
  assert.deepEqual(NL.low2, {price: 24.15, t: '2026-10-08'});
  assert.equal(NL.higherLow.price, 20.6);
  const {holder} = rolesOf({num: pvpNum(NL, {price: 24.5}), classes: EXT, price: 24.5, date: '2026-10-09'});
  assert.equal(holder.priceKey, 'low2Sessions');
  assert.equal(holder.price, 24.15);
  assert.equal(holder.if, 'Nếu đóng cửa dưới đáy hai phiên gần nhất 24,15');
  assert.equal(holder.plate, 'Đang giữ: dưới 24,15 chốt 1/2');
  assert.equal(holder.full.price, 20.6);
});

test('the guard: a trend whose nearest support is more than 8% under the close trails the near lines too', () => {
  const NL = nearLinesOf(PVP, 18.52);
  const far = rolesOf({num: pvpNum(NL, {aboveMa50Percent: 20, pivot: 26, support1: 21.9, support2: 21.2}), classes: [{kind: 'trend'}], price: 24.1, date: '2026-10-09'}).holder;
  assert.equal(far.case, 'trend-intact');
  assert.equal(far.price, 24);
  assert.equal(far.then, 'hạ tỷ trọng một nửa');
  assert.equal(far.full.price, 20.6);
  // A support within 8%: the table's line, unchanged (P2 = support2, the stop moves up to it).
  const near = rolesOf({num: pvpNum(NL, {aboveMa50Percent: 20, pivot: 26, support1: 23.6, support2: 22.8}), classes: [{kind: 'trend'}], price: 24.1, date: '2026-10-09'}).holder;
  assert.equal(near.priceKey, 'support2');
  assert.equal(near.full, undefined);
});

test(`editions before ${NEAR_SINCE} keep the table they were written under`, () => {
  const NL = nearLinesOf(PVP, 18.52);
  const {holder} = rolesOf({num: pvpNum(NL), classes: EXT, price: 24.1, danger: true, date: '2026-10-08'});
  assert.equal(holder.priceKey, 'support1');
  assert.equal(holder.price, 19.65);
  assert.equal(holder.full, undefined);
});

test('a holder whose rest-of-position line differs from the method is rejected', () => {
  const holder = {case: 'extended', priceKey: 'reversalLow', price: 24, if: 'Nếu đóng cửa dưới đáy nến đảo chiều 24,00', then: 'hạ tỷ trọng, chốt lời một nửa', plate: 'Đang giữ: dưới 24,00 chốt 1/2', full: {priceKey: 'higherLow', price: 20.6, then: 'thoát hết'}};
  const notHolder = {case: 'exhausted', priceKey: null, price: null, if: null, then: 'không mua đuổi', plate: 'Chưa mua: không mua đuổi'};
  const r = valid();
  r.date = '2026-10-09';
  r.roles = {holder: {...holder, full: {...holder.full, price: 19.65}}, notHolder};
  const ctx = {measured: {...measured, roles: {holder, notHolder}}};
  assert.ok(has(errs(r, ctx), /roles\.holder\.full/));
  r.roles.holder.full.price = 20.6;
  assert.ok(!has(errs(r, ctx), /roles\.holder\.full/));
});

test('a fresh break of the descending trendline under MA200: the one without it waits for the base (PVD 22/10)', () => {
  // User 2026-10-22, PVD broke its 9/10–19/10 downtrend line on 21/10, still under MA200: "Phá được trendline giảm chưa mua
  // vội, theo dõi và đợi cổ phiếu tạo nền ở nhịp 2" — §6c downtrend-break, ahead of below-ma, at the danger level too.
  const pvd = {price: 18.9, ma50: 18.58, ma200: 19.29, support1: 18.8, trendlineSupport: 17.48, trendlineResistanceBroken: 17.68, downtrendBrokenSessionsAgo: 1, aboveMa50Percent: 1.72, aboveMa200Percent: -2.02, resistance1: 19};
  const num = (o) => (k) => (o[k] ?? null);
  const {notHolder} = rolesOf({num: num(pvd), classes: [{kind: 'ma50-test'}, {kind: 'trend'}], price: 18.9, danger: true, date: '2026-10-22'});
  assert.equal(notHolder.case, 'downtrend-break');
  assert.equal(notHolder.say, 'Chưa có hàng thì chưa mua vội, theo dõi và đợi cổ phiếu tạo nền ở nhịp hai.');
  assert.equal(notHolder.plate, 'Chưa mua: đợi tạo nền');
  // a stale break (more than DOWNTREND_BREAK_FRESH sessions back) falls through to below-ma
  assert.equal(rolesOf({num: num({...pvd, downtrendBrokenSessionsAgo: 9}), classes: [{kind: 'trend'}], price: 18.9, danger: true, date: '2026-10-22'}).notHolder.case, 'below-ma');
  // a stock already in its uptrend (over MA200, MA50 over MA200) is not a turn: the old table decides
  assert.notEqual(rolesOf({num: num({...pvd, ma50: 18.2, ma200: 17.9, aboveMa200Percent: 5.6}), classes: [{kind: 'trend'}], price: 18.9, danger: true, date: '2026-10-22'}).notHolder.case, 'downtrend-break');
});
