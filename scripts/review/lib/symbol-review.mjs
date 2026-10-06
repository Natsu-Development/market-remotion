#!/usr/bin/env node
/**
 * Symbol reviews of the market-review leaders — the output of the `symbol-reviewer` agent
 * (.claude/agents/symbol-reviewer.md): content/review/symbols/<date>/<SYM>.json (+ a short .md).
 *
 *   node scripts/review/lib/symbol-review.mjs measure <date> <SYM> [--format=daily]   the numbers the method starts from
 *   node scripts/review/lib/symbol-review.mjs <date> <SYM>                            validate one review (exit 1 on errors)
 *   node scripts/review/lib/symbol-review.mjs <date>                                  validate every review of that date
 *
 * `measure` is arithmetic on data the repo already holds: the fact-pack row, the terminal's /analyze bars
 * and FireAnt's own MA values (public/shots/review/<date>/<sym>-fireant.ma.json). It never computes a
 * moving average (user, 2026-10-01: "FireAnt also have the MA50 and MA200 … refer it, not need
 * self-calculation"): an MA the FireAnt photo did not give stays null and every check that needs it is
 * "pending". Ratios FROM FireAnt's values (price / MA50 − 1) are derived numbers, labelled as such.
 *
 * `validateReview` holds the agent to the method: known mark kinds, beats 0/1, at most four marks a beat,
 * every number in a label traced to `numbers[]` (at the precision shown, like verify's `facts` check),
 * prices and dates inside the window the photo shows, and no call words.
 */
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PATHS, ROOT, exists, round, tryJson} from './common.mjs';

export const REVIEW_DIR = 'content/review/symbols';
/**
 * Method version. /2 (user, 2026-10-03: "include the price action … trendline & resistance and each price must be
 * noted"): the review reads the price action first — swing structure, the nearest support and resistance, the active
 * trendline, the last candles — and its chart carries a support, a resistance and a candle read, every one priced.
 * /1 reviews (2026-10-01/02, before price action) still validate under the old rules.
 */
export const METHOD = 'symbol-reviewer/2';
export const MARK_KINDS = ['level', 'ma', 'pointer', 'zone', 'volume', 'trendline', 'candle'];
/**
 * In the method's priority order (symbol-reviewer.md, "Thế giá"): the day's price-action event first (a breakout that
 * closed in the upper half on volume, one sold from its high, a trendline broken or tested, a pullback onto support),
 * then the trend-template states.
 */
export const SETUP_KINDS = ['breakout', 'breakout-rejected', 'breakout-failed', 'trendline-break', 'trendline-test', 'pullback-to-support', 'ma50-test', 'extended', 'near-high', 'pullback', 'base', 'far-from-high', 'trend'];
export const ACCENTS = ['gold', 'red', 'green', 'white', 'up', 'down'];
export const MA_REFS = ['ma50', 'ma200'];
export const SOURCES = ['facts', 'universe', 'analyze', 'fireant', 'derived'];
export const ROLES = ['support', 'resistance'];
const FOCUS = /^(all|last|zone|(level|ma):[a-z0-9]+)$/i;
/** Beat 0 carries the structure (MA50, MA200, trendline, resistance, support): five; the close-up stays light. */
const MAX_MARKS_PER_BEAT = 5;
/** Bars FireAnt shows after interval D + reset view (VNINDEX 1D tab, calibrated 2026-10-01: 142 bars). */
const DEFAULT_WINDOW = 142;
/** A level may sit a little outside the candles it is drawn over (a pivot just above the last highs). */
const WINDOW_MARGIN = 0.03;
/** Lookback of the pivot: the highest high of the prior N sessions, today excluded. */
const PIVOT_SESSIONS = 20;
/** The fact pack's 52-week window (facts.mjs leaderDetail: price_history.slice(-250)). */
const YEAR_BARS = 250;

/** Phrases that turn a review into a call (writer.md: "Không bao giờ gọi giá"). Matched lower-case, NFC. */
export const FORBIDDEN = [
  'nên mua', 'nên bán', 'vào lệnh', 'mua ngay', 'bán ngay', 'mua thêm', 'bán bớt', 'chốt lời', 'cắt lỗ',
  'điểm mua', 'điểm bán', 'khuyến nghị', 'mục tiêu giá', 'giá mục tiêu', 'canh mua', 'canh bán',
  'xuống tiền', 'giải ngân', 'target', 'stop loss', 'take profit',
];

// Numbers on screen are matched the way scripts/verify.mjs matches them: digits (decimal comma or dot),
// sign ignored, at the precision shown. The exemptions are the skill's own (rules.claims.factsExemptions)
// plus the method's own windows — "TB20", "52 tuần", "20 phiên" are parameters, like EMA50; a built-in copy
// keeps the validator working while rules.json is being edited.
const BUILTIN_EXEMPT = [
  '\\b\\d{1,2}/\\d{1,2}(?:/\\d{4})?\\b', 'tháng\\s*\\d{1,2}', '\\bRS\\s*\\d{1,2}\\s*[MW]\\b',
  '\\b(?:EMA|SMA|MA)\\s*\\d{1,3}\\b', '#\\s?\\d{1,2}(?:[–-]\\d{1,2})?\\b', '\\b52\\s?T\\b',
];
const exemptPatterns = () => {
  const rules = tryJson('.claude/skills/market-review/rules.json');
  const fromRules = (rules?.claims?.factsExemptions ?? []).map((e) => e.pattern);
  const method = ['\\bTB\\s?20\\b', '\\b52\\s?tuần\\b', '\\b20\\s?phiên\\b'];
  return [...new Set([...(fromRules.length ? fromRules : BUILTIN_EXEMPT), ...method])].map((p) => new RegExp(p, 'giu'));
};
const decimals = (s) => (/[.,]/.test(s) ? s.split(/[.,]/)[1].length : 0);
const numbersIn = (text) => [...String(text).matchAll(/\d+(?:[.,]\d+)?/g)]
  .map((m) => ({raw: m[0], value: Number(m[0].replace(',', '.')), dp: decimals(m[0])}))
  .filter((x) => Number.isFinite(x.value));
const exemptIn = (text, patterns) => {
  const out = new Set();
  for (const re of patterns) for (const m of String(text).matchAll(re)) for (const n of m[0].matchAll(/\d+(?:[.,]\d+)?/g)) out.add(Number(n[0].replace(',', '.')));
  return out;
};

// ------------------------------------------------------------------ files

export const reviewPath = (date, sym) => `${REVIEW_DIR}/${date}/${sym.toUpperCase()}.json`;
export const loadReview = (date, sym) => tryJson(reviewPath(date, sym));
const photoBase = (date, sym) => `public/${PATHS.shots}/${date}/${sym.toLowerCase()}-fireant`;

/** The bars of a symbol: the edition's /analyze file, else a standalone fetch-market.mjs output. */
const barsOf = (date, SYM) => {
  const analyze = `${PATHS.analyze}/${date}/${SYM}.json`;
  const a = tryJson(analyze);
  if (a?.price_history?.length) return {path: analyze, field: 'price_history', bars: a.price_history};
  const standalone = `.review-cache/symbols/${SYM.toLowerCase()}-daily.json`;
  const s = tryJson(standalone);
  if (Array.isArray(s) && s.length) return {path: standalone, field: '', bars: s};
  return {path: analyze, field: 'price_history', bars: []};
};

/** The window of bars the photo shows: its calibration's first..last bar, else the last DEFAULT_WINDOW bars. */
const windowOf = (date, SYM, bars) => {
  const calib = tryJson(`${photoBase(date, SYM)}.calib.json`);
  let shown = bars.slice(-DEFAULT_WINDOW);
  let from = 'default';
  if (calib?.first_bar && calib?.last_bar) {
    const w = bars.filter((b) => b.t >= calib.first_bar && b.t <= calib.last_bar);
    if (w.length) { shown = w; from = `${photoBase(date, SYM)}.calib.json`; }
  }
  if (!shown.length) return null;
  return {
    source: from, bars: shown.length, from: shown[0].t, to: shown.at(-1).t,
    low: Math.min(...shown.map((b) => b.l)), high: Math.max(...shown.map((b) => b.h)),
    dates: new Set(shown.map((b) => b.t)),
    list: shown,
  };
};

// ------------------------------------------------------------------ price action (method /2)
//
// Arithmetic on the bars the photo shows — what a trader reads off the chart, measured instead of eyeballed:
// fractal swing points, the structure they make, horizontal levels where swings cluster, the active trendline through
// swing lows (or highs), and the anatomy of the last candles. No moving average is computed here (those are FireAnt's).

/** A swing high (low) is a bar whose high (low) no bar within SWING_N sessions on either side exceeds. */
export const SWING_N = 3;
/** Swing points within this fraction of each other are one horizontal level. */
const LEVEL_MERGE = 0.015;
/** A level nearer the close than this is "at" the close, not above or below it. */
const LEVEL_DEAD = 0.003;
/** A low within this fraction of a rising line touches it (a high, for a falling line). */
const TL_TOUCH = 0.01;
/**
 * A trendline is drawn the way a trader draws it: UNDER the lows (over the highs, for a falling line). Any low may dip
 * under it by at most TL_PIERCE, and at most ONE close may sit under it — two closes through it and it is not a line
 * anyone draws. (Round 1 of /2 tested closes only, with a 1% allowance; its MSR line from 23/7 was pierced by the lows of
 * 16/9 −0,2%, 17/9 −1,3%, 18/9 −1,6% and 21/9 −1,9% — the verify workflow of 4/10 caught it.)
 */
const TL_PIERCE = 0.005;
/** Trendline anchors at least this many sessions apart. */
const TL_MIN_SPAN = 5;
/** Two swing points within this fraction of each other are EQUAL — equal lows are a double bottom, not a higher low. */
export const SWING_EQ = 0.005;
export const swingsOf = (bars, n = SWING_N) => {
  const highs = [];
  const lows = [];
  for (let i = n; i < bars.length - n; i++) {
    const b = bars[i];
    let hi = true;
    let lo = true;
    for (let k = 1; k <= n; k++) {
      if (bars[i - k].h > b.h || bars[i + k].h > b.h) hi = false;
      if (bars[i - k].l < b.l || bars[i + k].l < b.l) lo = false;
    }
    // A flat top (bottom) — equal highs (lows) within the span — counts once, at its first bar; `iEnd` keeps its last
    // bar, where a trendline anchors (PVT 7/9 and 8/9, both 19,90: the line rises from 8/9).
    if (hi) {
      const p = highs.at(-1);
      if (p && i - (p.iEnd ?? p.i) <= n && p.price === b.h) Object.assign(p, {iEnd: i, tEnd: b.t});
      else highs.push({i, t: b.t, price: b.h});
    }
    if (lo) {
      const p = lows.at(-1);
      if (p && i - (p.iEnd ?? p.i) <= n && p.price === b.l) Object.assign(p, {iEnd: i, tEnd: b.t});
      else lows.push({i, t: b.t, price: b.l});
    }
  }
  return {highs, lows};
};

/** A straight line through two swing points, in bar-index units. */
export const lineAt = (a, b, i) => a.price + ((b.price - a.price) * (i - a.i)) / (b.i - a.i);

/**
 * Trendlines fitted the way a trader draws them — the hull of the lows (highs):
 *   support: from each swing-low anchor A, the SMALLEST slope to any later low at least TL_MIN_SPAN sessions on — the
 *            line that rests under every later low and touches one (the second anchor, B); it must rise;
 *   resistance: from each swing-high anchor, the LARGEST slope to a later high — a falling line over the highs.
 * A line is kept only when no low (high) from A on pierces it by more than TL_PIERCE and fewer than two closes cross it.
 * ACTIVE: holds through the last bar. BROKEN: held through a bar in the last five sessions, then a close went through it
 * by more than TL_PIERCE (with ≥ 3 touches, news: "thủng trendline"). Touches: sessions whose low (high) came within
 * TL_TOUCH of the line, three sessions apart at least. `all` lists every kept line — the validator accepts any of them.
 */
export const trendlinesOf = (bars, swings) => {
  const last = bars.length - 1;
  const ext = (i, role) => (role === 'support' ? bars[i].l : bars[i].h);
  const fitUpTo = (role, upTo) => {
    const anchors = role === 'support' ? swings.lows : swings.highs;
    const out = [];
    for (const S of anchors) {
      const A = {i: S.iEnd ?? S.i, t: S.tEnd ?? S.t, price: S.price};
      if (A.i > upTo - TL_MIN_SPAN - 1) continue;
      let best = null;
      // The second touch comes before the bar being judged: a line through today's own low is not yet a line.
      for (let j = A.i + TL_MIN_SPAN; j < upTo; j++) {
        const sl = (ext(j, role) - A.price) / (j - A.i);
        if (!best || (role === 'support' ? sl < best.s : sl > best.s)) best = {j, s: sl};
      }
      if (!best || (role === 'support' ? best.s <= 0 : best.s >= 0)) continue;
      const at = (i) => A.price + best.s * (i - A.i);
      let worst = 0;
      let crossed = 0;
      for (let i = A.i; i <= upTo; i++) {
        const v = at(i);
        worst = Math.max(worst, role === 'support' ? (v - bars[i].l) / v : (bars[i].h - v) / v);
        if (role === 'support' ? bars[i].c < v : bars[i].c > v) crossed++;
      }
      if (worst > TL_PIERCE || crossed >= 2) continue;
      const touches = [];
      for (let i = A.i; i <= upTo; i++) {
        if (Math.abs(ext(i, role) / at(i) - 1) <= TL_TOUCH && (!touches.length || i - touches.at(-1) >= 3)) touches.push(i);
      }
      out.push({
        role, a: {i: A.i, t: A.t, price: A.price}, b: {i: best.j, t: bars[best.j].t, price: ext(best.j, role)}, slope: best.s,
        upTo, worstPiercePercent: worst * 100, closesThrough: crossed, touchIdx: touches,
      });
    }
    return out;
  };
  const finish = (l, brokenAt = null) => {
    const proj = l.a.price + l.slope * (last - l.a.i);
    return {
      role: l.role, a: l.a, b: l.b, price: proj, touches: l.touchIdx.length, touchDates: l.touchIdx.map((i) => bars[i].t),
      slopePerSessionPercent: (l.slope / l.a.price) * 100, worstPiercePercent: l.worstPiercePercent, closesThrough: l.closesThrough,
      brokenAt: brokenAt == null ? null : bars[brokenAt].t, brokenAtIndex: brokenAt, closeVsLinePercent: (bars[last].c / proj - 1) * 100,
    };
  };
  const score = (l) => l.touches * 10 + (l.b.i / Math.max(1, last)) * 5 + (l.b.i - l.a.i) / Math.max(1, last);
  const side = (role) => {
    const active = fitUpTo(role, last).map((l) => finish(l));
    const broken = [];
    const seen = new Set(active.map((l) => `${l.a.t}|${l.b.t}`));
    for (let k = 1; k <= 5; k++) {
      for (const l of fitUpTo(role, last - k)) {
        const key = `${l.a.t}|${l.b.t}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let br = null;
        for (let i = last - k + 1; i <= last; i++) {
          const v = l.a.price + l.slope * (i - l.a.i);
          if (role === 'support' ? bars[i].c < v * (1 - TL_PIERCE) : bars[i].c > v * (1 + TL_PIERCE)) { br = i; break; }
        }
        if (br != null) broken.push(finish(l, br));
      }
    }
    return {
      active: [...active].sort((p, q) => score(q) - score(p))[0] ?? null,
      broken: broken.filter((l) => l.touches >= 3).sort((p, q) => score(q) - score(p))[0] ?? null,
      all: [...active, ...broken],
    };
  };
  return {support: side('support'), resistance: side('resistance')};
};

/**
 * Horizontal levels: swing highs and lows (and the window's own high and low) clustered within LEVEL_MERGE. A level's
 * price is its most recent member's (a real high or low the chart shows), its touches every session whose high or low
 * came within LEVEL_MERGE of it (swingTouches: the fractal members alone). Above the
 * close it is resistance, below it support — an old high under the price has turned into support.
 */
export const levelsOf = (bars, swings, close) => {
  const pts = [
    ...swings.highs.map((p) => ({...p, side: 'high'})),
    ...swings.lows.map((p) => ({...p, side: 'low'})),
  ].sort((p, q) => p.price - q.price);
  const clusters = [];
  for (const p of pts) {
    const c = clusters.at(-1);
    if (c && p.price <= c.min * (1 + LEVEL_MERGE)) c.members.push(p);
    else clusters.push({min: p.price, members: [p]});
  }
  const levels = clusters.map((c) => {
    const recent = c.members.reduce((m, p) => (p.i > m.i ? p : m));
    // A touch is any session whose high or low came within LEVEL_MERGE of the level — not only the fractal swings.
    const touchDates = bars.filter((b) => Math.abs(b.h / recent.price - 1) <= LEVEL_MERGE || Math.abs(b.l / recent.price - 1) <= LEVEL_MERGE).map((b) => b.t);
    return {
      price: recent.price, t: recent.t, touches: touchDates.length, swingTouches: c.members.length, touchDates,
      kind: c.members.every((p) => p.side === 'high') ? 'swing-high' : c.members.every((p) => p.side === 'low') ? 'swing-low' : 'swing-high-low',
      dates: c.members.map((p) => p.t).sort(),
    };
  });
  const above = levels.filter((l) => l.price > close * (1 + LEVEL_DEAD)).sort((p, q) => p.price - q.price);
  const below = levels.filter((l) => l.price < close * (1 - LEVEL_DEAD)).sort((p, q) => q.price - p.price);
  return {levels, above, below};
};

/** The anatomy of bar `i`: where it closed in its range, its wicks and body, its range and volume against the 20 before. */
export const candleOf = (bars, i, avgN = 20) => {
  const b = bars[i];
  const p = bars[i - 1];
  const range = b.h - b.l;
  const prior = bars.slice(Math.max(0, i - avgN), i);
  const avgRange = prior.length ? prior.reduce((s, x) => s + (x.h - x.l), 0) / prior.length : null;
  const avgVol = prior.length ? prior.reduce((s, x) => s + (x.v ?? 0), 0) / prior.length : null;
  const top = Math.max(b.o, b.c);
  const bot = Math.min(b.o, b.c);
  return {
    t: b.t, o: b.o, h: b.h, l: b.l, c: b.c,
    changePercent: p ? (b.c / p.c - 1) * 100 : null,
    closeRangePercent: range > 0 ? ((b.c - b.l) / range) * 100 : 50,
    upperWickPercent: range > 0 ? ((b.h - top) / range) * 100 : 0,
    lowerWickPercent: range > 0 ? ((bot - b.l) / range) * 100 : 0,
    bodyPercent: range > 0 ? ((top - bot) / range) * 100 : 0,
    rangeVsAvg: avgRange ? range / avgRange : null,
    volumeVsAvg20Percent: avgVol && b.v != null ? (b.v / avgVol - 1) * 100 : null,
    gapPercent: p ? (b.o / p.c - 1) * 100 : null,
    gap: p ? (b.l > p.h ? 'up' : b.h < p.l ? 'down' : null) : null,
    inside: p ? b.h <= p.h && b.l >= p.l : false,
    outside: p ? b.h > p.h && b.l < p.l : false,
    engulf: p ? (b.c > b.o && p.c < p.o && b.c >= p.o && b.o <= p.c ? 'bull' : b.c < b.o && p.c > p.o && b.c <= p.o && b.o >= p.c ? 'bear' : null) : null,
  };
};

/**
 * The trader's words for a candle (writer.md vocabulary), each with the price it is told by. `id` is what a `candle`
 * mark's `read` names; the validator checks the read was measured on that bar.
 */
export const candleReads = (k) => {
  const v = (n) => round(n, 2).toFixed(2).replace('.', ',');
  const out = [];
  const r = (id, text, price, keys) => out.push({id, text, price: round(price, 2), keys});
  if (k.upperWickPercent >= 40 && k.closeRangePercent <= 50) r('upper-wick', `râu trên dài — bị bán từ ${v(k.h)}`, k.h, ['upperWickPercent', 'closeRangePercent']);
  if (k.lowerWickPercent >= 40 && k.closeRangePercent >= 50) r('lower-wick', `nến rút chân — lực mua đỡ từ ${v(k.l)}`, k.l, ['lowerWickPercent', 'closeRangePercent']);
  if (k.closeRangePercent <= 15) r('close-near-low', `đóng cửa sát đáy phiên ${v(k.l)}`, k.c, ['closeRangePercent']);
  if (k.closeRangePercent >= 85) r('close-near-high', `đóng cửa sát đỉnh phiên ${v(k.h)}`, k.c, ['closeRangePercent']);
  if (k.rangeVsAvg != null && k.rangeVsAvg <= 0.6) r('narrow-range', `biên hẹp — tích luỹ quanh ${v(k.c)}`, k.c, ['rangeVsAvg']);
  if (k.rangeVsAvg != null && k.rangeVsAvg >= 1.5) r('wide-range', `nến biên rộng ${v(k.l)}–${v(k.h)}`, k.h, ['rangeVsAvg']);
  if (k.inside) r('inside', `nến inside — nén giá trong biên phiên trước`, k.c, []);
  if (k.outside) r('outside', `nến outside — biên trùm phiên trước`, k.c, []);
  if (k.engulf === 'bull') r('bull-engulf', `nến bao trùm tăng, đóng cửa ${v(k.c)}`, k.c, []);
  if (k.engulf === 'bear') r('bear-engulf', `nến bao trùm giảm, đóng cửa ${v(k.c)}`, k.c, []);
  if (k.gap === 'up') r('gap-up', `mở cửa nhảy giá lên ${v(k.o)}`, k.o, ['gapPercent']);
  if (k.gap === 'down') r('gap-down', `mở cửa nhảy giá xuống ${v(k.o)}`, k.o, ['gapPercent']);
  if (!out.length) r('mid-range', `đóng cửa giữa biên ${v(k.c)}`, k.c, ['closeRangePercent']);
  return out;
};

/**
 * Swing structure from the last two swing highs and lows, and what the last bar did to it. Two swings within SWING_EQ are
 * EQUAL: equal highs are a double top, equal lows a double bottom — a range, never "higher" or "lower".
 */
export const structureOf = (bars, swings) => {
  const H = swings.highs.slice(-2);
  const L = swings.lows.slice(-2);
  const last = bars.at(-1);
  const cmp = (b, a) => (b > a * (1 + SWING_EQ) ? true : b < a * (1 - SWING_EQ) ? false : 'equal');
  const hh = H.length === 2 ? cmp(H[1].price, H[0].price) : null;
  const hl = L.length === 2 ? cmp(L[1].price, L[0].price) : null;
  const kind = hh === true && hl === true ? 'up' : hh === false && hl === false ? 'down' : 'range';
  const lastHigh = swings.highs.at(-1) ?? null;
  const lastLow = swings.lows.at(-1) ?? null;
  const hText = hh === true ? 'đỉnh sau cao hơn đỉnh trước' : hh === false ? 'đỉnh sau thấp hơn đỉnh trước' : hh === 'equal' ? 'hai đỉnh ngang nhau' : null;
  const lText = hl === true ? 'đáy sau cao hơn đáy trước' : hl === false ? 'đáy sau thấp hơn đáy trước' : hl === 'equal' ? 'hai đáy ngang nhau' : null;
  const tail = kind === 'up' ? 'xu hướng tăng' : kind === 'down' ? 'xu hướng giảm' : hl === 'equal' ? 'đi ngang, hai đáy' : hh === 'equal' ? 'đi ngang, hai đỉnh' : 'đi ngang';
  return {
    kind, hh, hl,
    highs: H.map(({t, price}) => ({t, price})), lows: L.map(({t, price}) => ({t, price})),
    brokeLastHigh: lastHigh ? last.h > lastHigh.price : null,
    closedAboveLastHigh: lastHigh ? last.c > lastHigh.price : null,
    closedBelowLastLow: lastLow ? last.c < lastLow.price : null,
    text: `${[hText, lText].filter(Boolean).join(', ') || 'chưa đủ đỉnh và đáy dao động'} — ${tail}`,
  };
};

/**
 * A breakout that failed: within the last five sessions a close went above a prior swing high, and the last bar closes back
 * under it — the old high was taken and given back. Returns the most recent such high, or null.
 */
export const failedBreakoutOf = (bars, swings) => {
  const last = bars.length - 1;
  for (const h of [...swings.highs].reverse()) {
    if (h.i >= last - 1) continue;
    const from = Math.max(h.i + 1, last - 5);
    for (let k = from; k < last; k++) {
      if (bars[k].c > h.price && bars[last].c < h.price) return {t: h.t, price: h.price, aboveOn: bars[k].t};
    }
  }
  return null;
};

// ------------------------------------------------------------------ measure

/**
 * The fact pack of the edition a review belongs to: the one whose asOf IS `date`. `content/review-<format>.facts.json`
 * moves on with every edition and a review is validated again long after it was written — on 5/10 the 2/10 PVT review
 * failed against the 5/10 daily pack (price 24,20 for 23,50 moved its nearest resistance). Tried in order: the format's
 * own pack, the other format's (that Friday's daily and weekly share the session), then an archived pack of that
 * session. {F: null} when none is — `measure` then takes the row from the session's universe cache.
 */
const packOf = (date, format = 'daily', factsPath = null) => {
  // An explicit pack (--facts, a staging copy) is used as given — when it is of that session.
  if (factsPath) {
    const F = tryJson(factsPath);
    return {F: F?.asOf === date ? F : null, factsPath};
  }
  const own = `content/review-${format}.facts.json`;
  const names = [own, ...['daily', 'weekly'].filter((f) => f !== format).map((f) => `content/review-${f}.facts.json`)];
  if (exists(PATHS.archive)) names.push(...readdirSync(resolve(ROOT, PATHS.archive)).filter((f) => f.startsWith(date) && f.endsWith('.facts.json')).map((f) => `${PATHS.archive}/${f}`));
  for (const p of names) {
    const F = tryJson(p);
    if (F?.asOf === date) return {F, factsPath: p};
  }
  return {F: null, factsPath: own};
};

/**
 * Every number the method may cite, each with its source and path, the checks it implies and the setup
 * classes that match — the starting point of a review. The agent's judgment (which detail, which marks,
 * what the branches say) is not here.
 */
export const measure = (date, sym, {format = 'daily', facts = null} = {}) => {
  const SYM = sym.toUpperCase();
  const {F, factsPath} = packOf(date, format, facts);
  const numbers = [];
  const add = (key, value, source, path, extra = {}) => {
    numbers.push({key, value: value == null || !Number.isFinite(value) ? null : round(value, 2), source, path, ...extra});
  };

  // The row: a leader of the edition, else any board row of the pack, else the session's universe cache.
  const tables = ['leaders', 'rs', 'uptrend', 'spike'];
  let row = null;
  let rowPath = null;
  for (const t of tables) {
    const list = F?.screener?.[t]?.top ?? [];
    const i = list.findIndex((x) => x.symbol === SYM);
    if (i >= 0) { row = list[i]; rowPath = `${factsPath}#screener.${t}.top[${i}]`; break; }
    // A name the user asked for on the review page (screener.requested, user 2026-10-05) right after the leaders.
    if (t === 'leaders') {
      const req = F?.screener?.requested ?? [];
      const j = req.findIndex((x) => x.symbol === SYM);
      if (j >= 0) { row = req[j]; rowPath = `${factsPath}#screener.requested[${j}]`; break; }
    }
  }
  let source = 'facts';
  if (!row) {
    const U = tryJson(`${PATHS.cache}/${date}-universe.json`);
    const u = (U?.stocks ?? []).find((x) => x.symbol === SYM);
    if (u) {
      source = 'universe';
      rowPath = `${PATHS.cache}/${date}-universe.json#stocks[symbol=${SYM}]`;
      row = {
        symbol: SYM, price: u.current_price, changePercent: u.price_change_pct, rs1m: u.rs_1m, rs52w: u.rs_52w,
        volumeVsSma20Percent: u.volume_sma20 ? (u.current_volume / u.volume_sma20 - 1) * 100 : null,
        ema50: u.ema_50 || null, sma200: u.sma_200 || null, filters: [],
      };
    }
  }
  if (!row) throw new Error(`${SYM}: not in ${factsPath} nor in ${PATHS.cache}/${date}-universe.json — pull the session first`);
  for (const k of ['price', 'changePercent', 'volumeVsSma20Percent', 'rs1m', 'rs52w', 'high52w', 'fromHigh52wPercent']) {
    if (row[k] != null) add(k, row[k], source, `${rowPath}.${k}`);
  }
  // The terminal's EMA50/SMA200: context only — the leader scene names FireAnt's MA50/MA200.
  if (row.ema50 != null) add('ema50Terminal', row.ema50, source, `${rowPath}.ema50`, {note: 'terminal EMA50, context only'});
  if (row.sma200 != null) add('sma200Terminal', row.sma200, source, `${rowPath}.sma200`, {note: 'terminal SMA200, context only'});
  if (F?.session) {
    add('indexClose', F.session.close, 'facts', `${factsPath}#session.close`);
    add('indexChangePercent', F.session.changePercent, 'facts', `${factsPath}#session.changePercent`);
  }
  // The market's clock (the reel's state machine): a leader that holds while the count nears the user's
  // danger tier (distribution.dangerAt, 5 days — user 2026-10-01) is the context of the day, not a detail.
  const D = F?.distribution;
  if (D) {
    add('distributionCount', D.count, 'facts', `${factsPath}#distribution.count`);
    if (D.dangerAt != null) add('dangerAt', D.dangerAt, 'facts', `${factsPath}#distribution.dangerAt`);
    if (D.toDanger != null) add('toDanger', D.toDanger, 'facts', `${factsPath}#distribution.toDanger`);
  }

  // Bars: 52-week low, the pivot, the pullback since it, the last swing low, today's range.
  const B = barsOf(date, SYM);
  const bars = B.bars.filter((b) => b.t <= date);
  const at = (field) => `${B.path}${B.field ? `#${B.field}` : ''}${field ? `:${field}` : ''}`;
  const last = bars.at(-1);
  const dates = {};
  const flags = {};
  if (last && last.t !== date) flags.lastBarIsNotTheSession = last.t;
  if (bars.length >= PIVOT_SESSIONS + 1) {
    const year = bars.slice(-YEAR_BARS);
    const lo = year.reduce((m, b) => (b.l < m.l ? b : m));
    const hi = year.reduce((m, b) => (b.h > m.h ? b : m));
    add('low52w', lo.l, 'analyze', at(`min(l) of the last ${YEAR_BARS} bars`), {date: lo.t});
    dates.low52w = lo.t;
    dates.high52w = hi.t;
    if (row.high52w == null) add('high52w', hi.h, 'analyze', at(`max(h) of the last ${YEAR_BARS} bars`), {date: hi.t});
    const prior = bars.slice(-PIVOT_SESSIONS - 1, -1);
    const pv = prior.reduce((m, b) => (b.h > m.h ? b : m));
    add('pivot', pv.h, 'analyze', at(`max(h) of the ${PIVOT_SESSIONS} sessions before ${last.t}`), {date: pv.t});
    dates.pivot = pv.t;
    const after = bars.filter((b) => b.t > pv.t);
    if (after.length) {
      const pl = after.reduce((m, b) => (b.l < m.l ? b : m));
      add('pullbackLow', pl.l, 'analyze', at(`min(l) after ${pv.t}`), {date: pl.t});
      add('pullbackDepthPercent', (pl.l / pv.h - 1) * 100, 'derived', 'pullbackLow / pivot − 1', {formula: 'pullbackLow / pivot − 1'});
      dates.pullbackLow = pl.t;
      // Volume of the pullback against the pivot session's (a lower-volume pullback is the constructive one).
      const pvVol = pv.v;
      const pbVol = after.reduce((s, b) => s + b.v, 0) / after.length;
      if (pvVol > 0) add('pullbackVolumeVsPivotPercent', (pbVol / pvVol - 1) * 100, 'derived', 'mean(v after pivot) / v(pivot) − 1', {formula: 'mean(v after pivot) / v(pivot) − 1'});
    }
    // The last confirmed swing low: a low no higher than the two sessions on each side.
    for (let i = bars.length - 3; i >= 2; i--) {
      const b = bars[i];
      if ([-2, -1, 1, 2].every((k) => bars[i + k].l >= b.l)) {
        add('swingLow', b.l, 'analyze', at(`5-bar pivot low on ${b.t}`), {date: b.t});
        dates.swingLow = b.t;
        break;
      }
    }
    // The prior 20 sessions as a range: a tight one is a base (tích luỹ).
    const rh = Math.max(...prior.map((b) => b.h));
    const rl = Math.min(...prior.map((b) => b.l));
    add('range20High', rh, 'analyze', at(`max(h) of the ${PIVOT_SESSIONS} sessions before ${last.t}`));
    add('range20Low', rl, 'analyze', at(`min(l) of the ${PIVOT_SESSIONS} sessions before ${last.t}`));
    add('range20DepthPercent', (rl / rh - 1) * 100, 'derived', 'range20Low / range20High − 1', {formula: 'range20Low / range20High − 1'});
    add('todayHigh', last.h, 'analyze', at(`h on ${last.t}`), {date: last.t});
    add('todayLow', last.l, 'analyze', at(`l on ${last.t}`), {date: last.t});
    if (last.h > last.l) add('closeRangePercent', ((last.c - last.l) / (last.h - last.l)) * 100, 'derived', '(c − l) / (h − l) of the session', {formula: '(c − l) / (h − l)'});
    const priorYearHigh = Math.max(...year.slice(0, -1).map((b) => b.h));
    flags.newHigh52w = last.h > priorYearHigh;
    flags.closeAbovePivot = row.price > pv.h;
  }
  const price = row.price;
  const num = (k) => numbers.find((n) => n.key === k)?.value ?? null;
  if (num('low52w') != null) add('aboveLow52wPercent', (price / num('low52w') - 1) * 100, 'derived', 'price / low52w − 1', {formula: 'price / low52w − 1'});
  if (num('pivot') != null) add('closeVsPivotPercent', (price / num('pivot') - 1) * 100, 'derived', 'price / pivot − 1', {formula: 'price / pivot − 1'});

  // FireAnt's MA50 / MA200 — read off the photo by the fireant-leaders step, never computed here.
  const maPath = `${photoBase(date, SYM)}.ma.json`;
  const MA = tryJson(maPath);
  for (const ref of MA_REFS) {
    const v = MA?.ma?.[ref]?.value;
    add(ref, Number.isFinite(v) ? v : null, 'fireant', `${maPath}#ma.${ref}.value`, MA ? {} : {pending: 'no FireAnt MA file yet'});
  }
  const ma50 = num('ma50');
  const ma200 = num('ma200');
  add('aboveMa50Percent', ma50 ? (price / ma50 - 1) * 100 : null, 'derived', 'price / ma50 (FireAnt) − 1', {formula: 'price / ma50 − 1'});
  add('aboveMa200Percent', ma200 ? (price / ma200 - 1) * 100 : null, 'derived', 'price / ma200 (FireAnt) − 1', {formula: 'price / ma200 − 1'});

  // ---- price action (method /2): on the bars the photo shows, so every level and line can be drawn on it
  const W = windowOf(date, SYM, bars);
  const wb = W?.list ?? bars.slice(-DEFAULT_WINDOW);
  const wat = (what) => `${B.path}${B.field ? `#${B.field}` : ''} (window ${wb[0]?.t} → ${wb.at(-1)?.t}): ${what}`;
  let pa = null;
  if (wb.length >= 2 * SWING_N + 3 && wb.at(-1)?.t === last?.t) {
    const sw = swingsOf(wb);
    const st = structureOf(wb, sw);
    const lv = levelsOf(wb, sw, price);
    const tl = trendlinesOf(wb, sw);
    sw.highs.slice(-2).reverse().forEach((s, k) => add(`swingHigh${k + 1}`, s.price, 'analyze', wat(`${SWING_N}-bar fractal high on ${s.t}`), {date: s.t}));
    sw.lows.slice(-2).reverse().forEach((s, k) => add(`swingLow${k + 1}`, s.price, 'analyze', wat(`${SWING_N}-bar fractal low on ${s.t}`), {date: s.t}));
    // The nearest levels each side, with how many swing points made them.
    const levelNum = (key, l) => {
      add(key, l.price, 'analyze', wat(`${l.kind} level from ${l.dates.join(', ')} (swings within ${LEVEL_MERGE * 100}%)`), {date: l.t, touches: l.touches, kind: l.kind});
      add(`${key}Touches`, l.touches, 'derived', `sessions whose high or low came within ${LEVEL_MERGE * 100}% of ${l.price}: ${l.touchDates.join(', ')}`);
    };
    lv.above.slice(0, 2).forEach((l, k) => levelNum(`resistance${k + 1}`, l));
    lv.below.slice(0, 2).forEach((l, k) => levelNum(`support${k + 1}`, l));
    // A fresh high has no swing above it: the session's own high is where it was sold (or met no seller yet).
    if (!lv.above.length) add('resistance1', last.h, 'analyze', at(`h on ${last.t} — the session high; no swing high above the close`), {date: last.t, touches: 1, kind: 'session-high'});
    for (const role of ['support', 'resistance']) {
      const K = role === 'support' ? 'trendlineSupport' : 'trendlineResistance';
      const t = tl[role].active;
      if (t) {
        add(K, t.price, 'derived', wat(`hull line ${role === 'support' ? 'under the lows' : 'over the highs'} from ${t.a.t} (${t.a.price}) touching ${t.b.t} (${t.b.price}), at ${last.t}`), {formula: 'a + (b − a)·(i − iA)/(iB − iA)', anchors: [{date: t.a.t, price: t.a.price}, {date: t.b.t, price: t.b.price}]});
        add(`${K}Touches`, t.touches, 'derived', `sessions whose ${role === 'support' ? 'low' : 'high'} came within ${TL_TOUCH * 100}% of the line: ${t.touchDates.join(', ')}`);
        add(`${K}SlopePercent`, t.slopePerSessionPercent, 'derived', 'line rise per session / anchor A − 1');
        add(`closeVs${role === 'support' ? 'Support' : 'Resistance'}TrendlinePercent`, t.closeVsLinePercent, 'derived', 'close / line at the last bar − 1');
        add(`${K}WorstPiercePercent`, t.worstPiercePercent, 'derived', `deepest ${role === 'support' ? 'low under' : 'high over'} the line from its first anchor on (≤ ${TL_PIERCE * 100}%)`);
      }
      const br = tl[role].broken;
      if (br) add(`${K}Broken`, br.price, 'derived', wat(`line through ${br.a.t} (${br.a.price}) and ${br.b.t} (${br.b.price}), closed through on ${br.brokenAt}; value at ${last.t}`), {anchors: [{date: br.a.t, price: br.a.price}, {date: br.b.t, price: br.b.price}], brokenAt: br.brokenAt});
    }
    const fb = failedBreakoutOf(wb, sw);
    if (fb) add('failedBreakoutLevel', fb.price, 'analyze', wat(`swing high of ${fb.t}, closed above on ${fb.aboveOn}, closed back under on ${last.t}`), {date: fb.t});
    // The last three candles: the session and the two before it (d0 = the session, d1 = the one before, …).
    const ks = [wb.length - 3, wb.length - 2, wb.length - 1].filter((i) => i >= 1).map((i) => candleOf(wb, i));
    ks.forEach((k, j) => {
      const d = `d${ks.length - 1 - j}`;
      for (const f of ['o', 'h', 'l', 'c']) add(`${d}${{o: 'Open', h: 'High', l: 'Low', c: 'Close'}[f]}`, k[f], 'analyze', at(`${f} on ${k.t}`), {date: k.t});
    });
    const k0 = ks.at(-1);
    add('upperWickPercent', k0.upperWickPercent, 'derived', '(h − max(o, c)) / (h − l) of the session', {date: k0.t});
    add('lowerWickPercent', k0.lowerWickPercent, 'derived', '(min(o, c) − l) / (h − l) of the session', {date: k0.t});
    add('bodyPercent', k0.bodyPercent, 'derived', '|c − o| / (h − l) of the session', {date: k0.t});
    if (k0.rangeVsAvg != null) add('rangeVsAvg20', k0.rangeVsAvg, 'derived', '(h − l) / mean(h − l) of the 20 sessions before', {date: k0.t});
    if (k0.gapPercent != null) add('gapPercent', k0.gapPercent, 'derived', 'open / previous close − 1', {date: k0.t});
    pa = {
      structure: st,
      failedBreakout: fb,
      swings: {highs: sw.highs.slice(-4).map(({t, price}) => ({t, price})), lows: sw.lows.slice(-4).map(({t, price}) => ({t, price}))},
      levels: {
        above: lv.above.slice(0, 3).map(({price, t, touches, swingTouches, kind, dates}) => ({price, t, touches, swingTouches, kind, dates})),
        below: lv.below.slice(0, 3).map(({price, t, touches, swingTouches, kind, dates}) => ({price, t, touches, swingTouches, kind, dates})),
      },
      trendlines: Object.fromEntries(['support', 'resistance'].map((role) => [role, Object.fromEntries(['active', 'broken'].map((s) => {
        const t = tl[role][s];
        return [s, t ? {a: {date: t.a.t, price: t.a.price}, b: {date: t.b.t, price: t.b.price}, price: round(t.price, 2), touches: t.touches, touchDates: t.touchDates, slopePerSessionPercent: round(t.slopePerSessionPercent, 3), worstPiercePercent: round(t.worstPiercePercent, 2), closesThrough: t.closesThrough, brokenAt: t.brokenAt, closeVsLinePercent: round(t.closeVsLinePercent, 2)} : null];
      }))])),
      candles: ks.map((k) => ({
        t: k.t, o: k.o, h: k.h, l: k.l, c: k.c,
        closeRangePercent: round(k.closeRangePercent, 1), upperWickPercent: round(k.upperWickPercent, 1), lowerWickPercent: round(k.lowerWickPercent, 1),
        bodyPercent: round(k.bodyPercent, 1), rangeVsAvg: k.rangeVsAvg == null ? null : round(k.rangeVsAvg, 2), volumeVsAvg20Percent: k.volumeVsAvg20Percent == null ? null : round(k.volumeVsAvg20Percent, 0),
        gap: k.gap, inside: k.inside, outside: k.outside, engulf: k.engulf, reads: candleReads(k),
      })),
    };
  }

  // The checklist (symbol-reviewer.md, "Bảng kiểm"). true / false / "pending".
  const P = (v) => (v == null ? 'pending' : v);
  const above50 = num('aboveMa50Percent');
  const vol = num('volumeVsSma20Percent');
  const chg = num('changePercent');
  const idx = num('indexChangePercent');
  const checks = [
    {id: 'price-ma50', label: 'Giá trên MA50', pass: P(ma50 == null ? null : price > ma50), keys: ['price', 'ma50']},
    {id: 'price-ma200', label: 'Giá trên MA200', pass: P(ma200 == null ? null : price > ma200), keys: ['price', 'ma200']},
    {id: 'ma50-ma200', label: 'MA50 trên MA200', pass: P(ma50 == null || ma200 == null ? null : ma50 > ma200), keys: ['ma50', 'ma200']},
    {id: 'near-high', label: 'Trong vòng 25% dưới đỉnh 52 tuần', pass: P(num('fromHigh52wPercent') == null ? null : num('fromHigh52wPercent') >= -25), keys: ['fromHigh52wPercent']},
    {id: 'above-low', label: 'Trên đáy 52 tuần ít nhất 30%', pass: P(num('aboveLow52wPercent') == null ? null : num('aboveLow52wPercent') >= 30), keys: ['aboveLow52wPercent']},
    {id: 'rs', label: 'RS 1M và RS 52W từ 70', pass: P(num('rs1m') == null || num('rs52w') == null ? null : num('rs1m') >= 70 && num('rs52w') >= 70), keys: ['rs1m', 'rs52w']},
    {id: 'extension', label: 'Không kéo xa MA50 quá 25%', pass: P(above50 == null ? null : above50 <= 25), keys: ['aboveMa50Percent']},
    // O'Neil: a breakout wants volume at least 40–50% above average; a down day on such volume is selling.
    {id: 'volume-up', label: 'Phiên tăng có khối lượng từ +40% TB20', pass: vol == null || chg == null ? 'pending' : chg > 0 ? vol >= 40 : 'n/a', keys: ['volumeVsSma20Percent', 'changePercent']},
    {id: 'volume-down', label: 'Phiên giảm không kèm khối lượng từ +40% TB20', pass: vol == null || chg == null ? 'pending' : chg < 0 ? vol < 40 : 'n/a', keys: ['volumeVsSma20Percent', 'changePercent']},
    {id: 'pivot', label: 'Đóng cửa trên đỉnh 20 phiên trước', pass: P(num('closeVsPivotPercent') == null ? null : num('closeVsPivotPercent') > 0), keys: ['closeVsPivotPercent', 'pivot']},
    // Leaders hold up on the market's down days: up, flat, or down less than half the index's fall.
    {id: 'day', label: 'Giữ giá khi chỉ số giảm (giảm chưa tới một nửa chỉ số)', pass: idx == null || chg == null ? 'pending' : idx >= 0 ? 'n/a' : chg >= idx / 2, keys: ['changePercent', 'indexChangePercent']},
  ];
  // Price action (method /2): the structure, the close against the active trendline, and where the session closed.
  if (pa) {
    const has = (k) => num(k) != null;
    checks.push(
      {id: 'structure', label: 'Đỉnh sau cao hơn, đáy sau cao hơn (HH/HL)', pass: pa.structure.hh == null || pa.structure.hl == null ? 'pending' : pa.structure.kind === 'up', keys: ['swingHigh1', 'swingHigh2', 'swingLow1', 'swingLow2'].filter(has)},
      {id: 'trendline', label: 'Đóng cửa trên trendline hỗ trợ', pass: has('trendlineSupport') ? price > num('trendlineSupport') : 'n/a', keys: has('trendlineSupport') ? ['trendlineSupport'] : []},
      // O'Neil: a breakout closes in the upper half of its range, on volume; a close low in the range after a new high is selling.
      {id: 'close-range', label: 'Đóng cửa ở nửa trên biên độ phiên', pass: has('closeRangePercent') ? num('closeRangePercent') >= 50 : 'pending', keys: ['closeRangePercent']},
    );
  }

  // Setup classes that match, in priority order (the agent picks the first one not taken by the other leader).
  const fromHigh = num('fromHigh52wPercent');
  const cvp = num('closeVsPivotPercent');
  const depth = num('pullbackDepthPercent');
  const rDepth = num('range20DepthPercent');
  const classes = [];
  const cls = (kind, ok, why) => { if (ok) classes.push({kind, why}); };
  const clv = num('closeRangePercent');
  const upW = num('upperWickPercent');
  const piv = num('pivot');
  const tls = num('trendlineSupport');
  const sup1 = num('support1');
  const hi0 = num('todayHigh');
  const lo0 = num('todayLow');
  // The day's price-action event first.
  cls('breakout', flags.closeAbovePivot && chg > 0 && vol != null && vol >= 40 && (clv == null || clv >= 50), `đóng cửa trên đỉnh ${PIVOT_SESSIONS} phiên (${piv}) ở nửa trên biên độ, KL ${vol != null ? `+${round(vol, 0)}%` : '?'}${flags.newHigh52w ? ', đỉnh 52 tuần mới' : ''}`);
  cls('breakout-rejected', piv != null && hi0 != null && hi0 > piv && clv != null && (clv < 50 || (upW != null && upW >= 40)), `vượt đỉnh ${piv} trong phiên lên ${hi0} nhưng đóng cửa ở ${clv != null ? round(clv, 0) : '?'}% biên độ${upW != null ? `, râu trên ${round(upW, 0)}%` : ''} — bị bán từ đỉnh${flags.closeAbovePivot ? '' : ', đóng cửa lại dưới đỉnh cũ'}`);
  cls('breakout-failed', num('failedBreakoutLevel') != null, `đóng cửa vượt đỉnh ${num('failedBreakoutLevel')} trong 5 phiên gần nhất rồi đóng cửa lại dưới nó — vượt đỉnh thất bại`);
  cls('trendline-break', num('trendlineSupportBroken') != null && price < num('trendlineSupportBroken'), `đóng cửa dưới trendline hỗ trợ (${num('trendlineSupportBroken')})`);
  cls('trendline-test', tls != null && lo0 != null && lo0 <= tls * (1 + TL_TOUCH) && price >= tls, `giá thấp nhất ${lo0} chạm trendline hỗ trợ ${tls}, đóng cửa trên nó`);
  cls('pullback-to-support', cvp != null && cvp <= 0 && sup1 != null && (price / sup1 - 1) * 100 <= 3 && (lo0 == null || lo0 >= sup1 * (1 - TL_TOUCH)), `chỉnh về sát hỗ trợ ${sup1} (${sup1 != null ? round((price / sup1 - 1) * 100, 1) : '?'}% trên nó)`);
  // Then the trend-template states.
  cls('ma50-test', above50 != null && Math.abs(above50) <= 3, `cách MA50 ${above50 != null ? round(above50, 1) : '?'}%`);
  cls('extended', above50 != null && above50 > 25, `cao hơn MA50 ${above50 != null ? round(above50, 1) : '?'}%`);
  cls('near-high', fromHigh != null && fromHigh >= -5, `cách đỉnh 52 tuần ${fromHigh}%`);
  cls('pullback', cvp != null && cvp <= 0 && cvp >= -10 && depth != null && depth >= -12 && (vol == null || vol < 40), `dưới đỉnh ${PIVOT_SESSIONS} phiên ${cvp != null ? round(cvp, 1) : '?'}%, nhịp chỉnh ${depth != null ? round(depth, 1) : '?'}%`);
  cls('base', rDepth != null && rDepth >= -12 && cvp != null && cvp <= 0, `biên độ ${PIVOT_SESSIONS} phiên ${rDepth != null ? round(rDepth, 1) : '?'}%`);
  cls('far-from-high', fromHigh != null && fromHigh < -15, `cách đỉnh 52 tuần ${fromHigh}%`);
  cls('trend', true, 'mặc định');

  return {
    symbol: SYM, date, method: METHOD,
    inputs: {
      facts: rowPath, analyze: B.path,
      photo: exists(`${photoBase(date, SYM)}.png`) ? `${photoBase(date, SYM)}.png` : null,
      ma: MA ? maPath : null,
    },
    window: W ? {source: W.source, bars: W.bars, from: W.from, to: W.to, low: W.low, high: W.high} : null,
    dates, flags, numbers, checks, classes,
    priceAction: pa,
    filters: row.filters ?? [], tier: row.tier ?? null,
    market: F?.state ? {status: F.state.status, label: F.state.label, danger: D?.danger ?? null, toDanger: D?.toDanger ?? null} : null,
  };
};

// ------------------------------------------------------------------ validate

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const lower = (s) => String(s ?? '').normalize('NFC').toLowerCase();

/**
 * The other leaders' reviews of the same edition that rank ABOVE `sym` (screener.leaders.top order of the fact pack): their
 * setups are taken — "#1 keeps its setup; the other avoids it". Unknown ranks hold nothing.
 */
const othersAbove = (date, sym, format = 'daily') => {
  const top = (packOf(date, format).F?.screener?.leaders?.top ?? []).map((x) => x.symbol);
  const mine = top.indexOf(sym);
  if (mine < 0) return [];
  return top.slice(0, mine).map((o) => loadReview(date, o)).filter((o) => o?.detail?.kind).map((o) => ({symbol: o.symbol, setup: o.detail.kind}));
};

/**
 * Error strings for one review (empty = valid). `ctx.window` (from windowOf) bounds prices and dates;
 * without it the validator loads the bars the review names.
 */
export const validateReview = (r, ctx = {}) => {
  const errs = [];
  const e = (m) => errs.push(m);
  if (!r || typeof r !== 'object') return ['not an object'];
  const SYM = r.symbol;
  if (typeof SYM !== 'string' || !/^[A-Z0-9]{3}$/.test(SYM)) e(`symbol "${SYM}" is not a three-character ticker`);
  if (!isDate(r.date)) e(`date "${r.date}" is not YYYY-MM-DD`);
  if (typeof r.method !== 'string' || !r.method.startsWith('symbol-reviewer/')) e(`method "${r.method}" is not symbol-reviewer/<n>`);
  if (!r.inputs || typeof r.inputs !== 'object') e('inputs missing');
  else for (const k of ['facts', 'analyze']) if (typeof r.inputs[k] !== 'string' || !r.inputs[k]) e(`inputs.${k} missing`);

  // numbers[]
  const nums = Array.isArray(r.numbers) ? r.numbers : (e('numbers[] missing'), []);
  const byKey = new Map();
  for (const [i, n] of nums.entries()) {
    const at = `numbers[${i}]${n?.key ? ` (${n.key})` : ''}`;
    if (typeof n?.key !== 'string' || !n.key) { e(`${at}: key missing`); continue; }
    if (byKey.has(n.key)) e(`${at}: key repeated`);
    byKey.set(n.key, n);
    if (!(n.value === null || Number.isFinite(n.value))) e(`${at}: value must be a number or null`);
    if (!SOURCES.includes(n.source)) e(`${at}: source "${n.source}" not one of ${SOURCES.join('|')}`);
    if (typeof n.path !== 'string' || !n.path) e(`${at}: path missing — every number names where it came from`);
    // Never compute a moving average (user 2026-10-01): an MA is FireAnt's, or the terminal's as context.
    if (/^(?:e|s)?ma\d+$/i.test(n.key) && n.source !== 'fireant') e(`${at}: an MA must come from FireAnt (source "fireant"), not "${n.source}"`);
    if (n.source === 'derived' && /(?:^|[^a-z])(?:e|s)?ma\d+$/i.test(n.key)) e(`${at}: a derived number cannot be a moving average`);
  }
  const valueOf = (k) => byKey.get(k)?.value;

  // checks[]
  const checks = Array.isArray(r.checks) ? r.checks : (e('checks[] missing'), []);
  const ids = new Set();
  for (const [i, c] of checks.entries()) {
    const at = `checks[${i}]${c?.id ? ` (${c.id})` : ''}`;
    if (typeof c?.id !== 'string' || !c.id) e(`${at}: id missing`);
    else if (ids.has(c.id)) e(`${at}: id repeated`);
    ids.add(c?.id);
    if (typeof c?.label !== 'string' || !c.label) e(`${at}: label missing`);
    if (![true, false, 'pending', 'n/a'].includes(c?.pass)) e(`${at}: pass must be true, false, "pending" or "n/a"`);
    for (const k of c?.keys ?? []) if (!byKey.has(k)) e(`${at}: key "${k}" is not in numbers[]`);
    if (c?.pass === true || c?.pass === false) for (const k of c?.keys ?? []) if (byKey.get(k)?.value == null) e(`${at}: decided while ${k} is null — mark it "pending"`);
  }

  if (typeof r.verdict !== 'string' || !r.verdict.trim()) e('verdict missing');
  if (!r.detail || !SETUP_KINDS.includes(r.detail.kind)) e(`detail.kind "${r.detail?.kind}" not one of ${SETUP_KINDS.join('|')}`);
  if (typeof r.detail?.text !== 'string' || !r.detail.text.trim()) e('detail.text missing');
  if (r.setup != null && r.setup !== r.detail?.kind) e(`setup "${r.setup}" differs from detail.kind "${r.detail?.kind}"`);
  for (const k of r.detail?.keys ?? []) {
    if (!byKey.has(k)) e(`detail: key "${k}" is not in numbers[]`);
    else if (byKey.get(k).value == null) e(`detail: key "${k}" is null — the detail cannot rest on a pending number`);
  }

  // The window the photo shows.
  let W = ctx.window ?? null;
  if (!W && isDate(r.date) && typeof SYM === 'string') {
    const B = barsOf(r.date, SYM);
    W = windowOf(r.date, SYM, B.bars.filter((b) => b.t <= r.date));
  }
  const inPrice = (p) => !W || (p >= W.low * (1 - WINDOW_MARGIN) && p <= W.high * (1 + WINDOW_MARGIN));
  const inDate = (d) => !W || d === 'last' || W.dates.has(d);
  const priceMsg = (p) => `${p} is outside the photo's price range ${W ? `${round(W.low, 2)}–${round(W.high, 2)} (${W.from} → ${W.to})` : ''}`;

  // Method /2: price action. The bars the photo shows, their swings, the lines the method fits, and "is this price
  // printed on the label". The validator re-runs the method (`measure`) and holds the review to it: structure, setup,
  // the beat-0 structure and the mandatory trendline are the method's, not the reviewer's to choose.
  const v2 = r.method !== 'symbol-reviewer/1';
  const close = valueOf('price');
  const wlist = W?.list ?? [];
  const swings = wlist.length ? swingsOf(wlist) : {highs: [], lows: []};
  const fitted = wlist.length ? trendlinesOf(wlist, swings) : {support: {all: []}, resistance: {all: []}};
  const priced = (label, price) => numbersIn(label).some((n) => Number(Math.abs(n.value).toFixed(n.dp)) === Number(Math.abs(price).toFixed(n.dp)) && (n.dp >= 1 || Math.abs(price) >= 100));
  let M = ctx.measured ?? null;
  if (v2 && !M && isDate(r.date) && typeof SYM === 'string') {
    try { M = measure(r.date, SYM, {format: ctx.format ?? 'daily', facts: ctx.facts ?? null}); } catch (err) { e(`cannot re-run the method for ${SYM} on ${r.date}: ${err.message}`); }
  }
  const mNum = (k) => M?.numbers?.find((n) => n.key === k)?.value ?? null;

  // marks[]
  const marks = Array.isArray(r.marks) ? r.marks : (e('marks[] missing'), []);
  const perBeat = {};
  for (const [i, m] of marks.entries()) {
    const at = `marks[${i}]${m?.kind ? ` (${m.kind})` : ''}`;
    if (!MARK_KINDS.includes(m?.kind)) { e(`${at}: kind "${m?.kind}" not one of ${MARK_KINDS.join('|')}`); continue; }
    if (![0, 1].includes(m.beat)) e(`${at}: beat must be 0 (wide) or 1 (close-up)`);
    perBeat[m.beat] = (perBeat[m.beat] ?? 0) + 1;
    if (!ACCENTS.includes(m.accent)) e(`${at}: accent "${m.accent}" not one of ${ACCENTS.join('|')}`);
    if (typeof m.label !== 'string' || !m.label.trim()) e(`${at}: label missing`);
    else if ([...m.label].length > 30) e(`${at}: label "${m.label}" is ${[...m.label].length} characters — a plate holds ~30`);
    switch (m.kind) {
      case 'level':
        if (!Number.isFinite(m.price)) e(`${at}: price missing`);
        else if (!inPrice(m.price)) e(`${at}: ${priceMsg(m.price)}`);
        if (v2) {
          if (!ROLES.includes(m.role)) e(`${at}: role "${m.role}" not support|resistance — a level is one or the other`);
          else if (Number.isFinite(m.price) && Number.isFinite(close)) {
            if (m.role === 'support' && m.price > close * 1.003) e(`${at}: support ${m.price} is above the close ${close}`);
            if (m.role === 'resistance' && m.price < close * 0.997) e(`${at}: resistance ${m.price} is below the close ${close}`);
          }
          if (Number.isFinite(m.price) && !priced(m.label, m.price)) e(`${at}: label "${m.label}" does not print its price ${m.price} — every level is noted with its price`);
        }
        break;
      case 'trendline': {
        if (!ROLES.includes(m.role)) { e(`${at}: role "${m.role}" not support|resistance`); break; }
        const A = Array.isArray(m.anchors) ? m.anchors : [];
        if (A.length !== 2 || !A.every((p) => isDate(p?.date) && Number.isFinite(p?.price))) { e(`${at}: anchors must be two {date, price} points`); break; }
        if (A[0].date >= A[1].date) e(`${at}: anchors out of order`);
        // The anchors are a line the method fitted (under the lows / over the highs, pierced ≤ 0,5%, < 2 closes through).
        const line = (fitted[m.role]?.all ?? []).find((l) => l.a.t === A[0].date && l.b.t === A[1].date && Math.abs(l.a.price - A[0].price) <= 0.006 && Math.abs(l.b.price - A[1].price) <= 0.006);
        if (!line) {
          const offered = (fitted[m.role]?.all ?? []).map((l) => `${l.a.t}→${l.b.t}`).join(', ') || 'none';
          e(`${at}: anchors ${A[0].date} ${A[0].price} → ${A[1].date} ${A[1].price} are not a ${m.role} trendline the method fits on the bars the photo shows (measured: ${offered})`);
          break;
        }
        if (!Number.isFinite(m.price) || Math.abs(m.price - line.price) > 0.006) e(`${at}: price ${m.price} is not the line's value at the last bar (${round(line.price, 2)})`);
        if (!priced(m.label, line.price)) e(`${at}: label "${m.label}" does not print the line's price at the last bar (${round(line.price, 2)})`);
        if (!inPrice(line.price)) e(`${at}: ${priceMsg(line.price)}`);
        break;
      }
      case 'candle': {
        if (!(m.date === 'last' || isDate(m.date))) { e(`${at}: date must be "last" or YYYY-MM-DD`); break; }
        if (!inDate(m.date)) { e(`${at}: ${m.date} is not a session the photo shows`); break; }
        // The read is of the SESSION's candle, told on the close-up.
        if (!(m.date === 'last' || m.date === r.date || m.date === wlist.at(-1)?.t)) e(`${at}: a candle read is of the last bar (the session), not ${m.date}`);
        if (m.beat !== 1) e(`${at}: the candle read belongs to beat 1 (the close-up on the last bar)`);
        const ix = m.date === 'last' ? wlist.length - 1 : wlist.findIndex((b) => b.t === m.date);
        if (ix < 1) { e(`${at}: no bar before ${m.date} to read the candle against`); break; }
        const k = candleOf(wlist, ix);
        const reads = candleReads(k);
        if (!reads.some((x) => x.id === m.read)) e(`${at}: read "${m.read}" was not measured on ${k.t} (measured: ${reads.map((x) => x.id).join(', ')})`);
        if (!Number.isFinite(m.price) || ![k.o, k.h, k.l, k.c].some((v) => Math.abs(v - m.price) <= 0.006)) e(`${at}: price ${m.price} is not the open, high, low or close of ${k.t}`);
        else if (!priced(m.label, m.price)) e(`${at}: label "${m.label}" does not print its price ${m.price}`);
        if (m.side != null && !['above', 'below'].includes(m.side)) e(`${at}: side must be above|below`);
        break;
      }
      case 'ma':
        if (!MA_REFS.includes(m.ref)) e(`${at}: ref "${m.ref}" not one of ${MA_REFS.join('|')}`);
        else if (byKey.get(m.ref)?.source !== 'fireant' || byKey.get(m.ref)?.value == null) e(`${at}: ${m.ref} has no FireAnt value — a plate on FireAnt's line needs the number FireAnt shows`);
        else if (!inPrice(byKey.get(m.ref).value)) e(`${at}: ${priceMsg(byKey.get(m.ref).value)}`);
        else if (v2 && typeof m.label === 'string' && !priced(m.label, byKey.get(m.ref).value)) e(`${at}: label "${m.label}" does not print FireAnt's ${m.ref} ${byKey.get(m.ref).value}`);
        break;
      case 'pointer':
        if (!(m.date === 'last' || isDate(m.date))) e(`${at}: date must be "last" or YYYY-MM-DD`);
        else if (!inDate(m.date)) e(`${at}: ${m.date} is not a session the photo shows`);
        if (!Number.isFinite(m.price)) e(`${at}: price missing`);
        else if (!inPrice(m.price)) e(`${at}: ${priceMsg(m.price)}`);
        else if (v2 && typeof m.label === 'string' && !priced(m.label, m.price)) e(`${at}: label "${m.label}" does not print its price ${m.price}`);
        if (m.side != null && !['above', 'below'].includes(m.side)) e(`${at}: side must be above|below`);
        break;
      case 'zone':
        for (const k of ['from', 'to']) {
          if (!(m[k] === 'last' || isDate(m[k]))) e(`${at}: ${k} must be "last" or YYYY-MM-DD`);
          else if (!inDate(m[k])) e(`${at}: ${k} ${m[k]} is not a session the photo shows`);
        }
        if (isDate(m.from) && isDate(m.to) && m.from > m.to) e(`${at}: from is after to`);
        if (!Number.isFinite(m.low) || !Number.isFinite(m.high) || m.low >= m.high) e(`${at}: needs low < high`);
        else {
          for (const p of [m.low, m.high]) if (!inPrice(p)) e(`${at}: ${priceMsg(p)}`);
          if (v2 && typeof m.label === 'string' && !(priced(m.label, m.low) && priced(m.label, m.high))) e(`${at}: label "${m.label}" does not print the zone's ${m.low}–${m.high}`);
        }
        break;
      case 'volume':
        if (!(m.date === 'last' || isDate(m.date))) e(`${at}: date must be "last" or YYYY-MM-DD`);
        else if (!inDate(m.date)) e(`${at}: ${m.date} is not a session the photo shows`);
        break;
    }
  }
  for (const [b, n] of Object.entries(perBeat)) if (n > MAX_MARKS_PER_BEAT) e(`beat ${b} has ${n} marks — at most ${MAX_MARKS_PER_BEAT}`);
  if (!marks.some((m) => m?.beat === 0)) e('no mark on beat 0 (the wide shot)');
  if (v2) {
    const roled = (role) => marks.some((m) => (m?.kind === 'level' || m?.kind === 'trendline') && m.role === role);
    if (!roled('support')) e('no support on the chart — draw the nearest support (a level or the rising trendline) with its price');
    if (!roled('resistance')) e('no resistance on the chart — draw the nearest resistance (at a fresh high: the session high) with its price');
    if (!marks.some((m) => m?.kind === 'candle')) e('no candle read on the chart — the close-up names what the last candle did, with its price');
    // The structure on the wide shot: FireAnt's MA50 + MA200 plates (when FireAnt gave values), the NEAREST resistance,
    // and the nearest support or a trendline.
    const b0 = marks.filter((m) => m?.beat === 0);
    const near = (a, b) => a != null && b != null && Math.abs(a - b) <= 0.006;
    if (M) {
      for (const ref of MA_REFS) if (mNum(ref) != null && !b0.some((m) => m.kind === 'ma' && m.ref === ref)) e(`beat 0 has no ${ref.toUpperCase()} plate — FireAnt shows ${mNum(ref)}; the wide shot carries the structure`);
      const r1 = mNum('resistance1');
      if (!b0.some((m) => (m.kind === 'level' && m.role === 'resistance' && near(m.price, r1)) || (m.kind === 'trendline' && m.role === 'resistance'))) e(`beat 0 has no nearest resistance — the method measures ${r1 ?? '—'}${M.numbers?.find((n) => n.key === 'resistance1')?.kind === 'session-high' ? ' (the session high: no swing above the close)' : ''}`);
      const s1 = mNum('support1');
      if (!b0.some((m) => (m.kind === 'level' && m.role === 'support' && near(m.price, s1)) || m.kind === 'trendline')) e(`beat 0 has neither the nearest support (${s1 ?? '—'}) nor a trendline`);
      // The trendline is the user's word ("trendline & resistance"): when the method fits one on the photo, it is drawn.
      const T = M.priceAction?.trendlines;
      const lines = T ? ['support', 'resistance'].flatMap((role) => ['active', 'broken'].map((k) => T[role]?.[k]).filter(Boolean)) : [];
      if (lines.some((l) => inPrice(l.price)) && !marks.some((m) => m?.kind === 'trendline')) e(`no trendline on the chart — the method fits ${lines.map((l) => `${l.a.date}→${l.b.date} (${l.price})`).join(', ')}; it is mandatory when there is one`);
      // The setup is the method's: the first measured class, unless a higher-ranked leader of the same edition holds it.
      const kinds = (M.classes ?? []).map((c) => c.kind);
      const taken = new Set((ctx.others ?? othersAbove(r.date, SYM, ctx.format ?? 'daily')).map((o) => o.setup));
      const allowed = kinds.find((k) => !taken.has(k)) ?? kinds[0];
      if (r.detail?.kind && !kinds.includes(r.detail.kind)) e(`setup "${r.detail.kind}" is not a class the method measures (${kinds.join(', ')})`);
      else if (r.detail?.kind && allowed && r.detail.kind !== allowed) e(`setup "${r.detail.kind}" — the method's setup is "${allowed}"${taken.size ? ` (a higher-ranked leader holds ${[...taken].join(', ')})` : ''}`);
    }
    const pa = r.priceAction;
    if (!pa || typeof pa !== 'object') e('priceAction missing — structure, levels, trendline and the candle read come before the setup');
    else {
      if (!['up', 'down', 'range'].includes(pa.structure)) e(`priceAction.structure "${pa.structure}" not up|down|range`);
      else if (M?.priceAction?.structure?.kind && pa.structure !== M.priceAction.structure.kind) e(`priceAction.structure "${pa.structure}" — the method measures "${M.priceAction.structure.kind}" (${M.priceAction.structure.text})`);
      if (typeof pa.read !== 'string' || !pa.read.trim()) e('priceAction.read missing — one sentence of price action in trader words');
      const keys = Array.isArray(pa.keys) ? pa.keys : [];
      if (!keys.length) e('priceAction.keys missing — the measured numbers the read rests on');
      for (const k of keys) {
        if (!byKey.has(k)) e(`priceAction: key "${k}" is not in numbers[]`);
        else if (byKey.get(k).value == null) e(`priceAction: key "${k}" is null`);
      }
      const paKeys = /^(closeRangePercent|upperWickPercent|lowerWickPercent|bodyPercent|rangeVsAvg20|gapPercent|swing(High|Low)\d|resistance\d|support\d|trendline|d\d(Open|High|Low|Close)|todayHigh|todayLow)/;
      if (keys.length && !keys.some((k) => paKeys.test(k))) e('priceAction.keys cite no price-action number (candle anatomy, swings, levels or trendline)');
    }
  }

  // camera[] (optional)
  for (const [i, c] of (r.camera ?? []).entries()) {
    if (![0, 1].includes(c?.beat)) e(`camera[${i}]: beat must be 0 or 1`);
    if (typeof c?.focus !== 'string' || !FOCUS.test(c.focus)) e(`camera[${i}]: focus "${c?.focus}" not all|last|zone|level:<ref>|ma:<ref>`);
    if (c?.zoom != null && !(c.zoom >= 1 && c.zoom <= 4)) e(`camera[${i}]: zoom ${c.zoom} outside 1..4`);
  }

  // branches[]
  const branches = Array.isArray(r.branches) ? r.branches : (e('branches[] missing'), []);
  if (!branches.length) e('branches[] is empty — at least one "nếu … thì"');
  for (const [i, b] of branches.entries()) {
    if (typeof b?.if !== 'string' || !b.if.trim()) e(`branches[${i}].if missing`);
    if (typeof b?.then !== 'string' || !b.then.trim()) e(`branches[${i}].then missing`);
  }
  if (!Array.isArray(r.unsupported)) e('unsupported[] missing (an empty list is fine)');

  // Every number in the texts the screen or the writer uses traces to numbers[], at the precision shown.
  const patterns = exemptPatterns();
  const values = [...byKey.values()].map((n) => n.value).filter((v) => v != null);
  const traced = (n, dp) => values.some((v) => Number(Math.abs(v).toFixed(dp)) === Number(n.toFixed(dp)));
  const texts = [
    ['verdict', r.verdict], ['detail.text', r.detail?.text], ['priceAction.read', r.priceAction?.read],
    ...marks.map((m, i) => [`marks[${i}].label`, m?.label]),
    ...branches.flatMap((b, i) => [[`branches[${i}].if`, b?.if], [`branches[${i}].then`, b?.then]]),
  ];
  for (const [where, text] of texts) {
    if (typeof text !== 'string') continue;
    const exempt = exemptIn(text, patterns);
    for (const {raw, value, dp} of numbersIn(text)) {
      if (exempt.has(value) || traced(value, dp)) continue;
      e(`${where}: "${raw}" in "${text}" is not in numbers[] at that precision`);
    }
  }
  // No call words anywhere a reader sees.
  const all = [r.verdict, r.detail?.text, r.priceAction?.read, ...marks.map((m) => m?.label), ...branches.flatMap((b) => [b?.if, b?.then]), ...checks.map((c) => c?.label)].map(lower).join(' \n ');
  for (const w of FORBIDDEN) if (all.includes(w)) e(`call word "${w}" — a review states what the chart and the rules say, never what to do`);
  return errs;
};

/**
 * The numbers a review actually cites — in its mark labels, detail, branches and verdict — as {key: value}.
 * facts.mjs puts only these into the pack (screener.leaders.top[i].review.numbers): verify's `facts` check
 * accepts a figure when ANY pack number rounds to it, so ingesting every measured number would widen the gate.
 */
export const citedNumbers = (r) => {
  const patterns = exemptPatterns();
  const nums = (r?.numbers ?? []).filter((n) => n.value != null);
  const out = {};
  const texts = [r?.verdict, r?.detail?.text, r?.priceAction?.read, ...(r?.marks ?? []).map((m) => m?.label), ...(r?.branches ?? []).flatMap((b) => [b?.if, b?.then])];
  // One key per cited figure: the key of an object the chart draws (a mark's ref, or a mark at that price) when there is
  // one, else the first key with that value — keys of objects without a mark (an unrelated swing or level that happens to
  // round to the same figure) stay out of the pack (verify 4/10: every match widened the facts gate).
  const markedRefs = new Set((r?.marks ?? []).map((m) => m?.ref).filter(Boolean));
  const markPrices = (r?.marks ?? []).flatMap((m) => [m?.price, m?.low, m?.high]).filter(Number.isFinite);
  const isMarked = (n) => markedRefs.has(n.key) || markPrices.some((p) => Math.abs(p - n.value) <= 0.006);
  for (const text of texts) {
    if (typeof text !== 'string') continue;
    const exempt = exemptIn(text, patterns);
    for (const {value, dp} of numbersIn(text)) {
      if (exempt.has(value)) continue;
      const hits = nums.filter((n) => Number(Math.abs(n.value).toFixed(dp)) === Number(value.toFixed(dp)));
      const pick = hits.find((n) => markedRefs.has(n.key)) ?? hits.find(isMarked) ?? hits[0];
      if (pick) out[pick.key] = pick.value;
    }
  }
  // A plate on FireAnt's own line prints that line's value.
  for (const m of r?.marks ?? []) if (m?.kind === 'ma') { const n = nums.find((x) => x.key === m.ref); if (n) out[n.key] = n.value; }
  return out;
};

// ------------------------------------------------------------------ cli

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
  const pos = args.filter((a) => !a.startsWith('--'));
  if (pos[0] === 'measure') {
    const [, date, sym] = pos;
    if (!isDate(date) || !sym) { console.error('usage: symbol-review.mjs measure <date> <SYM> [--format=daily] [--facts=<pack>]'); process.exit(2); }
    const m = measure(date, sym, {format: opt('format', 'daily'), facts: opt('facts', null)});
    console.log(JSON.stringify(m, null, 2));
    process.exit(0);
  }
  const [date, sym] = pos;
  if (!isDate(date)) { console.error('usage: symbol-review.mjs <date> [SYM]   |   symbol-review.mjs measure <date> <SYM>'); process.exit(2); }
  const dir = `${REVIEW_DIR}/${date}`;
  const syms = sym ? [sym.toUpperCase()] : (exists(dir) ? readdirSync(resolve(ROOT, dir)).filter((f) => /^[A-Z0-9]{3}\.json$/.test(f)).map((f) => f.slice(0, 3)) : []);
  if (!syms.length) { console.error(`no reviews in ${dir}`); process.exit(2); }
  let bad = 0;
  for (const s of syms) {
    const r = loadReview(date, s);
    if (!r) { console.log(`✗ ${s}: no ${reviewPath(date, s)}`); bad++; continue; }
    const errs = validateReview(r, {facts: opt('facts', null)});
    if (r.symbol !== s) errs.unshift(`symbol "${r.symbol}" does not match the file name ${s}`);
    if (r.date !== date) errs.unshift(`date "${r.date}" does not match the folder ${date}`);
    if (errs.length) { bad++; console.log(`✗ ${s}: ${errs.length} error(s)`); for (const x of errs) console.log(`   - ${x}`); }
    else {
      const pending = (r.checks ?? []).filter((c) => c.pass === 'pending').map((c) => c.id);
      console.log(`✓ ${s}: valid · ${r.detail.kind} · ${(r.marks ?? []).length} marks${pending.length ? ` · pending: ${pending.join(', ')}` : ''}`);
    }
  }
  process.exit(bad ? 1 : 0);
}
