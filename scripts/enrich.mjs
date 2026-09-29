#!/usr/bin/env node
/**
 * Turns a director brief into a scaffolded reel plus the facts it may cite.
 *
 *   node scripts/enrich.mjs brief/channel.md
 *   node scripts/enrich.mjs brief/channel.md --facts-only
 *   node scripts/enrich.mjs --facts-only --name=macd     numbers first, no brief yet
 *
 * Writes two files:
 *   content/<name>.json         scenes scaffolded — ids, acts, panels, durations
 *                               estimated from the word budget. narration and
 *                               headlines are left as TODO for the worker.
 *   content/<name>.facts.json   every number the worker is allowed to use,
 *                               computed from the price series.
 *
 * The split is the point. This script cannot write Vietnamese; the worker must
 * not invent numbers. Everything derivable from data is derived here, so the
 * worker's only job is prose — and verify's `facts` check then confirms that
 * every figure on a headline or a chart label came out of this file, matched at
 * the precision it is displayed with.
 *
 * Brief format — one H2 per scene, `## <role> · <panel>`, then 1-2 lines of
 * intent. Front matter is `key: value` lines before the first H2 (`name`, `title`,
 * `brand`, `act`, `disclaimer`, `symbol`). Inside a scene, `src:` / `source:` /
 * `caption:` / `fit:` / `focus:` lines fill the panel (for `image`, the photo the
 * director already took with scripts/shoot.mjs). When
 * content/<symbol>-analysis.json exists (fetch-market.mjs --signals), its
 * divergences, trendlines and signals join the fact pack as `terminal`; when
 * content/<symbol>-daily.json exists (--resample=none), the REAL last-year bars join
 * as `daily`. Front matter `ticker: daily` puts that latest session in the ticker
 * strip; `footer: <text>` names the source when the numbers really came from it.
 *
 *     title: VNINDEX · thanh khoản cạn dần
 *     act: blue
 *
 *     ## hook · candles
 *     Thanh khoản tháng 9 thấp nhất 14 tháng nhưng giá vẫn sát đỉnh.
 *
 *     ## outro · outro
 *     Mời vào cộng đồng.
 */
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = JSON.parse(readFileSync(resolve(ROOT, 'src/shared/content-rules.json'), 'utf8'));

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};
const briefPath = argv.find((a) => !a.startsWith('--'));

// `--facts-only --name=<name>` needs no brief. The director reads the numbers
// BEFORE writing the brief, so the brief cannot be a prerequisite for them.
if (!briefPath && !(flag('facts-only') && opt('name'))) {
  console.error('Usage: node scripts/enrich.mjs brief/<name>.md [--facts-only] [--force]');
  console.error('       node scripts/enrich.mjs --facts-only --name=<name>    (numbers first, brief later)');
  process.exit(2);
}
const BRIEF = briefPath ? resolve(ROOT, briefPath) : null;
if (BRIEF && !existsSync(BRIEF)) {
  console.error(`No brief at ${briefPath}`);
  process.exit(2);
}

// ---------------------------------------------------------------- brief

const parseBrief = (src) => {
  const lines = src.split('\n');
  const meta = {};
  const scenes = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      const [role, panel] = line.slice(3).split('·').map((x) => x.trim());
      cur = {role, panel, intent: [], fields: {}};
      scenes.push(cur);
      continue;
    }
    if (!line || line.startsWith('#')) continue;
    if (!cur) {
      const m = line.match(/^(\w[\w-]*):\s*(.+)$/);
      if (m) meta[m[1]] = m[2];
      continue;
    }
    // Inside a scene, "src: public/shots/x.png" style lines are panel fields, not intent:
    // the director shoots the photo first and points the scene at it here.
    const f = line.match(/^(src|source|caption|fit|focus|zoom):\s*(.+)$/);
    if (f) { cur.fields[f[1]] = f[2].trim(); continue; }
    cur.intent.push(line);
  }
  return {meta, scenes};
};

const {meta, scenes: briefScenes} = BRIEF
  ? parseBrief(readFileSync(BRIEF, 'utf8'))
  : {meta: {}, scenes: []};
if (BRIEF && !briefScenes.length) {
  console.error('No scenes found. Each scene is an H2: "## <role> · <panel>".');
  process.exit(2);
}

const name = meta.name ?? opt('name') ?? basename(BRIEF).replace(/\.(md|brief\.md)$/, '');

// ---------------------------------------------------------------- facts

const SERIES = JSON.parse(readFileSync(resolve(ROOT, R.series.path), 'utf8'));
const closes = SERIES.map((c) => c.c);

const ema = (v, p) => {
  const k = 2 / (p + 1);
  let prev = v[0];
  return v.map((x, i) => (prev = i === 0 ? x : x * k + prev * (1 - k)));
};
const rsiSeries = (v, period) => {
  const out = new Array(v.length).fill(null);
  if (v.length <= period) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = v[i] - v[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  g /= period; l /= period;
  const val = () => 100 - 100 / (1 + g / (l || 1e-9));
  out[period] = val();
  for (let i = period + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (period - 1) + Math.max(d, 0)) / period;
    l = (l * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = val();
  }
  return out;
};

const rsi = rsiSeries(closes, R.series.rsiPeriod);
const fast = ema(closes, 12), slow = ema(closes, 26);
const macdLine = fast.map((x, i) => x - slow[i]);
const signal = ema(macdLine, 9);
const hist = macdLine.map((x, i) => x - signal[i]);

const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r0 = (x) => (x == null ? null : Math.round(x));

const byYear = new Map();
for (const c of SERIES) {
  const y = c.t.slice(0, 4);
  const b = byYear.get(y) ?? {year: y, high: -Infinity, low: Infinity, first: c.o, last: c.c, volume: 0};
  b.high = Math.max(b.high, c.h);
  b.low = Math.min(b.low, c.l);
  b.last = c.c;
  b.volume += c.v;
  byYear.set(y, b);
}

const idx = new Map(SERIES.map((c, i) => [c.t, i]));
const at = (t) => {
  const i = idx.get(t);
  if (i == null) return null;
  return {month: t, close: r0(SERIES[i].c), high: r0(SERIES[i].h), low: r0(SERIES[i].l),
          rsi: r1(rsi[i]), macd: r1(macdLine[i]), histogram: r1(hist[i])};
};

/**
 * Peak-to-trough inside the 14 months after a named peak. `percent` is close to close (how a
 * monthly move is quoted); `highToLow` runs from the peak month's intraday high to the lowest
 * low that followed — "1536 về 874" — which is how a chart reader sees the same fall.
 */
const drawdownFrom = (t) => {
  const i = idx.get(t);
  if (i == null) return null;
  const after = SERIES.slice(i + 1, i + 15);
  if (!after.length) return null;
  const trough = after.reduce((m, c) => (c.c < m.c ? c : m));
  const lowest = after.reduce((m, c) => (c.l < m.l ? c : m));
  return {
    from: t, to: trough.t, percent: r1(((trough.c - SERIES[i].c) / SERIES[i].c) * 100),
    highToLow: {high: r0(SERIES[i].h), low: r0(lowest.l), lowMonth: lowest.t,
                percent: r1(((lowest.l - SERIES[i].h) / SERIES[i].h) * 100)},
  };
};

/**
 * The same window measured the way a chart reader says "the 2022 fall": from the peak month's
 * intraday HIGH to the lowest intraday LOW after it. Close to close understates a crash that
 * bottoms mid-month — 2022 is -31.9% by closes and -43.1% high to low (1536 -> 874).
 */
const drawdownHighToLow = (t) => {
  const i = idx.get(t);
  if (i == null) return null;
  const after = SERIES.slice(i + 1, i + 15);
  if (!after.length) return null;
  const trough = after.reduce((m, c) => (c.l < m.l ? c : m));
  return {from: t, to: trough.t, high: r0(SERIES[i].h), low: r0(trough.l),
          percent: r1(((trough.l - SERIES[i].h) / SERIES[i].h) * 100)};
};

/** First month after `t` where the histogram closes below zero: the MACD/signal cross-down. */
const crossDownAfter = (t) => {
  const i = idx.get(t);
  if (i == null) return null;
  for (let k = i + 1; k < SERIES.length; k++) {
    if (hist[k] < 0) return {month: SERIES[k].t, monthsAfter: k - i};
  }
  return null;
};

const withRsi = rsi.map((v, i) => ({v, t: SERIES[i].t})).filter((x) => x.v != null);
const last = SERIES[SERIES.length - 1];

/**
 * Straight lines a chart reader draws on the MONTHLY chart (linear price axis, FireAnt's
 * default): the upper boundary through the intraday highs of the first two pinned peaks, the
 * lower boundary through the intraday lows of the last two pinned troughs. Every level the
 * reel quotes about "the channel" comes from here — where the line sits at a later peak, at the
 * latest month, and a few months ahead — so a trendline on a photo is a traceable number, not a
 * feeling. Month arithmetic is on calendar months so projections can run past the series.
 */
const mnum = (t) => { const [y, m] = t.split('-').map(Number); return y * 12 + (m - 1); };
const addMonths = (t, n) => { const k = mnum(t) + n; return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`; };
const lineThrough = (p1, p2) => {
  const slope = (p2.v - p1.v) / (mnum(p2.t) - mnum(p1.t));   // points per month
  const atMonth = (t) => r0(p1.v + slope * (mnum(t) - mnum(p1.t)));
  return {slope, slopePerYear: r1(slope * 12), atMonth};
};
const channelFacts = () => {
  const P = R.series.peakMonths, T = R.series.troughMonths;
  if (P.length < 2 || T.length < 2 || !P.every((t) => idx.has(t)) || !T.every((t) => idx.has(t))) return null;
  const hi = (t) => SERIES[idx.get(t)].h, lo = (t) => SERIES[idx.get(t)].l;
  const up = lineThrough({t: P[0], v: hi(P[0])}, {t: P[1], v: hi(P[1])});
  const t2 = T[T.length - 2], t1 = T[T.length - 1];
  const dn = lineThrough({t: t2, v: lo(t2)}, {t: t1, v: lo(t1)});
  const upperAtLatest = up.atMonth(last.t), lowerAtLatest = dn.atMonth(last.t);
  const close = r0(last.c);
  const projection = (line) => [3, 6, 12].map((n) => ({month: addMonths(last.t, n), level: line.atMonth(addMonths(last.t, n))}));
  return {
    _comment: 'Monthly chart, linear axis. upper = line through peaks[0].high and peaks[1].high; lower = line through the last two troughs\' lows. Levels in points; percents vs the latest monthly close.',
    upper: {
      through: [{month: P[0], high: r0(hi(P[0]))}, {month: P[1], high: r0(hi(P[1]))}],
      slopePerYear: up.slopePerYear,
      laterPeaks: P.slice(2).map((t) => ({month: t, high: r0(hi(t)), line: up.atMonth(t), vsLinePercent: r1(((hi(t) - up.atMonth(t)) / up.atMonth(t)) * 100)})),
      atLatest: upperAtLatest,
      latestCloseVsPercent: r1(((close - upperAtLatest) / upperAtLatest) * 100),
      riseToUpperPercent: r1(((upperAtLatest - close) / close) * 100),
      projection: projection(up),
    },
    lower: {
      through: [{month: t2, low: r0(lo(t2))}, {month: t1, low: r0(lo(t1))}],
      slopePerYear: dn.slopePerYear,
      atLatest: lowerAtLatest,
      latestCloseVsPercent: r1(((close - lowerAtLatest) / lowerAtLatest) * 100),
      fallToLowerPercent: r1(((lowerAtLatest - close) / close) * 100),
      projection: projection(dn),
    },
    slopeDiffPercent: r1((Math.abs(up.slope - dn.slope) / Math.abs(up.slope)) * 100),
    widthAtLatestPercent: r1(((upperAtLatest - lowerAtLatest) / lowerAtLatest) * 100),
    positionPercent: r1(((close - lowerAtLatest) / (upperAtLatest - lowerAtLatest)) * 100),
    latestClose: close,
  };
};

/**
 * The cycle read: how far apart the pinned peaks are, how long each fall took, and what the two
 * earlier falls would mean if they repeated from the latest peak's high and from today's close.
 * "If it repeats" is a scenario, not a forecast — the worker must say so.
 */
const cycleFacts = () => {
  const P = R.series.peakMonths.filter((t) => idx.has(t));
  if (P.length < 2) return null;
  const lastPeak = P[P.length - 1];
  const athHigh = r0(SERIES[idx.get(lastPeak)].h);
  const close = r0(last.c);
  const spacing = P.slice(1).map((t, k) => ({from: P[k], to: t, months: mnum(t) - mnum(P[k])}));
  const falls = P.slice(0, -1).map((t) => {
    const d = drawdownHighToLow(t);
    return d && {peak: t, high: d.high, low: d.low, lowMonth: d.to, percent: d.percent, months: mnum(d.to) - mnum(t)};
  }).filter(Boolean);
  return {
    peakSpacing: spacing,
    falls,
    latestPeak: {month: lastPeak, high: athHigh, monthsSince: mnum(last.t) - mnum(lastPeak), closeVsHighPercent: r1(((close - athHigh) / athHigh) * 100)},
    ifRepeat: falls.map((f) => ({
      like: f.peak, percent: f.percent,
      fromAth: r0(athHigh * (1 + f.percent / 100)),
      fromLatestClose: r0(close * (1 + f.percent / 100)),
      athTargetVsLatestClosePercent: r1(((athHigh * (1 + f.percent / 100) - close) / close) * 100),
    })),
  };
};

const SERIES_META_PATH = resolve(ROOT, R.series.path.replace(/\.json$/, '.meta.json'));
const SERIES_META = existsSync(SERIES_META_PATH) ? JSON.parse(readFileSync(SERIES_META_PATH, 'utf8')) : null;

const facts = {
  $comment: 'Generated by scripts/enrich.mjs. The worker may cite ONLY numbers that appear here. Regenerate after changing the series.',
  source: SERIES_META
    ? {label: SERIES_META.sourceLabel, reconstructed: !!SERIES_META.reconstructed, fetchedAt: SERIES_META.fetchedAt ?? null}
    : {label: 'unknown', reconstructed: true, fetchedAt: null},
  series: {
    path: R.series.path,
    months: SERIES.length,
    from: SERIES[0].t,
    to: last.t,
    latest: at(last.t),
  },
  peaks: R.series.peakMonths.map((t) => ({...at(t), drawdown: drawdownFrom(t), drawdownHighToLow: drawdownHighToLow(t),
    macdCrossDown: crossDownAfter(t)})),
  troughs: R.series.troughMonths.map((t) => at(t)),
  channel: channelFacts(),
  cycle: cycleFacts(),
  rsi: {
    period: R.series.rsiPeriod,
    warmupEndsAt: SERIES[R.series.rsiPeriod]?.t ?? null,
    current: r1(rsi[rsi.length - 1]),
    max: {value: r1(Math.max(...withRsi.map((x) => x.v))),
          month: withRsi.reduce((m, x) => (x.v > m.v ? x : m)).t},
    min: {value: r1(Math.min(...withRsi.map((x) => x.v))),
          month: withRsi.reduce((m, x) => (x.v < m.v ? x : m)).t},
    monthsAbove70: withRsi.filter((x) => x.v > 70).length,
    monthsBelow30: withRsi.filter((x) => x.v < 30).length,
    monthsMeasured: withRsi.length,
  },
  macd: (() => {
    const n = macdLine.length;
    const maxI = macdLine.indexOf(Math.max(...macdLine));
    const hMaxI = hist.indexOf(Math.max(...hist));
    // Consecutive months the histogram has shrunk, counted back from the latest bar.
    let falling = 0;
    for (let i = n - 1; i > 0 && hist[i] < hist[i - 1]; i--) falling++;
    const TRAIL = 9; // the months MacdChart boxes as its "histogram thu hẹp" callout
    return {
      params: {fast: 12, slow: 26, signal: 9},
      current: r1(macdLine[n - 1]),
      signalCurrent: r1(signal[n - 1]),
      aboveSignal: macdLine[n - 1] > signal[n - 1],
      max: {value: r1(macdLine[maxI]), month: SERIES[maxI].t, histogram: r1(hist[maxI])},
      monthsSinceMax: n - 1 - maxI,
      histogramCurrent: r1(hist[n - 1]),
      histogramMax: {value: r1(hist[hMaxI]), month: SERIES[hMaxI].t},
      histogramFallingMonths: falling,
      histogramTrail: SERIES.slice(-TRAIL).map((c, k) => ({month: c.t, value: r1(hist[n - TRAIL + k])})),
      _trailNote: 'histogramTrail is the window MacdChart draws its narrowing callout around.',
    };
  })(),
  years: [...byYear.values()].map((b) => ({
    year: b.year, high: r0(b.high), low: r0(b.low), close: r0(b.last),
    changePercent: r1(((b.last - b.first) / b.first) * 100),
    avgVolume: r1(b.volume / SERIES.filter((c) => c.t.startsWith(b.year)).length),
  })),
  volume: (() => {
    const vols = SERIES.map((c) => c.v);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const last12 = vols.slice(-12);
    const prev12 = vols.slice(-24, -12);
    const lowest = SERIES.reduce((m, c) => (c.v < m.v ? c : m));
    // How far back you must go to find a quieter month than the latest one.
    let quieterAgo = 0;
    for (let i = SERIES.length - 2; i >= 0; i--) {
      if (SERIES[i].v < last.v) break;
      quieterAgo++;
    }
    return {
      latest: r1(last.v),
      trailing12Average: r1(mean(last12)),
      previous12Average: prev12.length ? r1(mean(prev12)) : null,
      latestVsTrailingPercent: r1(((last.v - mean(last12)) / mean(last12)) * 100),
      trailingVsPreviousPercent: prev12.length
        ? r1(((mean(last12) - mean(prev12)) / mean(prev12)) * 100) : null,
      monthsSinceQuieter: quieterAgo,
      lowestEver: {month: lowest.t, value: r1(lowest.v)},
      _unit: (() => {
        const metaPath = resolve(ROOT, R.series.path.replace(/\.json$/, '.meta.json'));
        const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
        return meta && !meta.reconstructed
          ? `${meta.volumeUnit ?? 'shares'} (source: ${meta.sourceLabel}) — quote ratios or rounded billions, not the raw integer`
          : 'same arbitrary unit as content/*-monthly.json v — compare ratios, never quote it as a raw figure';
      })(),
    };
  })(),
};

/**
 * What the user's terminal (zionle.io.vn /analyze) already worked out for the symbol:
 * divergences, trendlines and signals, saved by `fetch-market.mjs --signals`. Prices in that
 * file are raw API units; `scale` says what turns an index into points.
 */
const SYMBOL = (meta.symbol ?? opt('symbol') ?? 'VNINDEX').toUpperCase();
const analysisPath = resolve(ROOT, `content/${SYMBOL.toLowerCase()}-analysis.json`);
const IS_INDEX = SYMBOL === 'VNINDEX' || SYMBOL.startsWith('VN') || SYMBOL.startsWith('HNX');
const analysis = existsSync(analysisPath) ? JSON.parse(readFileSync(analysisPath, 'utf8')) : null;
if (analysis) {
  const a = analysis;
  const k = Number(a.scale ?? 1);
  const px = (v) => (v == null ? null : IS_INDEX ? r0(v * k) : r1(v * k));
  const point = (p) => (p ? {date: p.date, price: px(p.price)} : null);
  const lines = (a.trendlines ?? []).map((t) => ({
    type: t.type, from: point(t.data_points?.[0]), to: point(t.data_points?.at(-1))}));
  // The points the page drew its lines through, oldest first: resistance lines hang
  // off swing highs, support lines off swing lows. These are the page's pivots.
  const touches = (want) => [...new Map(lines.filter((l) => String(l.type).includes(want))
    .flatMap((l) => [l.from, l.to]).filter(Boolean).map((p) => [p.date, p])).values()]
    .sort((x, y) => x.date.localeCompare(y.date));
  const divergences = (a.divergences ?? []).map((d) => {
    const pts = d.divergence_points ?? [];
    return {type: d.type, early: !!d.is_early, from: pts[0]?.date ?? null, to: pts[pts.length - 1]?.date ?? null,
            priceFrom: px(pts[0]?.price), priceTo: px(pts[pts.length - 1]?.price)};
  });
  const signals = (a.signals ?? []).slice().sort((x, y) => String(x.time).localeCompare(String(y.time)));
  const count = (arr, f) => arr.filter(f).length;
  facts.terminal = {
    _comment: 'From the user\'s VN Trading Terminal (zionle.io.vn /analyze), daily bars, about one year. Cite these for divergence / trendline / signal claims; the page itself is what the image panel photographs.',
    symbol: a.symbol ?? SYMBOL,
    asOf: String(a.timestamp ?? '').slice(0, 10) || null,
    divergences: {
      total: divergences.length,
      bullish: count(divergences, (d) => d.type === 'bullish'),
      bearish: count(divergences, (d) => d.type === 'bearish'),
      list: divergences,
    },
    trendlines: {
      total: (a.trendlines ?? []).length,
      support: count(a.trendlines ?? [], (t) => String(t.type).includes('support')),
      resistance: count(a.trendlines ?? [], (t) => String(t.type).includes('resistance')),
      list: lines,
      highs: touches('resistance'),
      lows: touches('support'),
      _pivotNote: 'highs/lows are the dated points the page drew its resistance/support lines through, oldest first',
    },
    signals: {
      total: signals.length,
      confirmed: count(signals, (s) => String(s.type).endsWith('_confirmed')),
      potential: count(signals, (s) => String(s.type).endsWith('_potential')),
      breakout: count(signals, (s) => String(s.type).includes('breakout')),
      breakdown: count(signals, (s) => String(s.type).includes('breakdown')),
      latest: signals.slice(-3).reverse().map((s) => ({type: s.type, date: s.time, price: px(s.price)})),
      list: signals.map((s) => ({type: s.type, date: s.time, price: px(s.price), line: px(s.price_line)})),
    },
  };
}

/**
 * Daily bars for the last ~year: the same terminal feed the /analyze screenshot shows, kept by
 * `fetch-market.mjs --resample=none` as content/<symbol>-daily.json, with a session still
 * trading dropped. Claims about the latest session and the current range cite `daily`, so the
 * video agrees with the terminal image. The monthly series above says where it came from in
 * `source`; while it was a reconstruction (until 2026-09-23) it missed this feed by up to 160
 * points, which is why `vsTurningPoints` only trusts a reconstruction's pinned anchors.
 */
const dailyPath = resolve(ROOT, `content/${SYMBOL.toLowerCase()}-daily.json`);
const makeSeries = resolve(ROOT, 'scripts/make-series.mjs');
const RECONSTRUCTED = facts.source.reconstructed;
const PINNED = new Set(existsSync(makeSeries)
  ? [...readFileSync(makeSeries, 'utf8').matchAll(/\['(\d{4}-\d{2})',\s*[\d.]+\]/g)].map((m) => m[1]) : []);
if (existsSync(dailyPath)) {
  const k = Number(analysis?.scale ?? (IS_INDEX ? 1000 : 1));
  const px = (v) => (v == null ? null : IS_INDEX ? r0(v * k) : r1(v * k));
  const all = JSON.parse(readFileSync(dailyPath, 'utf8'))
    .filter((r) => r.date && Number.isFinite(r.close))
    .sort((x, y) => x.date.localeCompare(y.date));
  // HOSE closes at 14:45 ICT. A bar dated the day the file was fetched, fetched before
  // 15:00 ICT, is a session still trading — its close is just the last print.
  const ict = new Date(statSync(dailyPath).mtimeMs + 7 * 3600e3);
  const intraday = all.at(-1)?.date === ict.toISOString().slice(0, 10) && ict.getUTCHours() < 15;
  const rows = intraday ? all.slice(0, -1) : all;
  const last = rows.at(-1), prev = rows.at(-2);
  const pct = (a, b) => r1(((a - b) / b) * 100);
  const extreme = (list, f, pick) => list.reduce((m, r) => (pick(f(r), f(m)) ? r : m));
  const hi = (list) => { const r = extreme(list, (x) => x.high, (a, b) => a > b); return {value: px(r.high), date: r.date}; };
  const lo = (list) => { const r = extreme(list, (x) => x.low, (a, b) => a < b); return {value: px(r.low), date: r.date}; };
  const volM = (list) => r1(list.reduce((s, r) => s + (r.volume ?? 0), 0) / list.length / 1e6);

  const byMonth = new Map();
  for (const r of rows) {
    const t = r.date.slice(0, 7);
    if (!byMonth.has(t)) byMonth.set(t, []);
    byMonth.get(t).push(r);
  }
  const monthRows = [...byMonth.entries()];
  const maxVol = Math.max(...monthRows.map(([, l]) => volM(l)));
  const months = monthRows.map(([t, l], i) => ({
    month: t,
    sessions: l.length,
    open: px(l[0].open), high: px(Math.max(...l.map((r) => r.high))), low: px(Math.min(...l.map((r) => r.low))),
    close: px(l.at(-1).close),
    changePercent: i ? pct(l.at(-1).close, monthRows[i - 1][1].at(-1).close) : null,
    avgVolumeM: volM(l),
    volumeVsMaxMonthPercent: r1((volM(l) / maxVol) * 100),
    rsiEnd: r1(l.at(-1).rsi),
  }));

  const year = last.date.slice(0, 4);
  const ytdRows = rows.filter((r) => r.date.startsWith(year));
  const before = rows.filter((r) => r.date < `${year}-01-01`).at(-1);
  const yHi = extreme(ytdRows, (x) => x.high, (a, b) => a > b);
  const yLo = extreme(ytdRows, (x) => x.low, (a, b) => a < b);
  const rsiRows = rows.filter((r) => r.rsi > 0);
  const volMonths = months.filter((m) => m.avgVolumeM > 0);
  const maxM = volMonths.reduce((m, x) => (x.avgVolumeM > m.avgVolumeM ? x : m));
  const minM = volMonths.reduce((m, x) => (x.avgVolumeM < m.avgVolumeM ? x : m));

  facts.daily = {
    _comment: 'REAL daily bars from the user\'s terminal (zionle.io.vn /analyze). Prices in index points (or thousand VND for a stock), highs/lows intraday. Use this block for anything about the last twelve months; the monthly series is a reconstruction.',
    path: dailyPath.replace(ROOT + '/', ''),
    from: rows[0].date,
    to: last.date,
    sessions: rows.length,
    droppedIntraday: intraday ? all.at(-1).date : null,
    // changePercent at 2dp and the unrounded closes: the ticker strip prints "1.817 ▲ 0,96%".
    latest: {date: last.date, close: px(last.close), closeExact: Math.round(last.close * k * 100) / 100,
             rsi: r1(last.rsi), changePercent: Math.round(((last.close - prev.close) / prev.close) * 1e4) / 100,
             volumeM: r1(last.volume / 1e6)},
    previous: {date: prev.date, close: px(prev.close), closeExact: Math.round(prev.close * k * 100) / 100},
    high: hi(rows),
    low: lo(rows),
    ytd: before ? {
      year: Number(year),
      startClose: px(before.close),
      startDate: before.date,
      changePercent: pct(last.close, before.close),
      high: {value: px(yHi.high), date: yHi.date},
      low: {value: px(yLo.low), date: yLo.date},
      widthPercent: pct(yHi.high, yLo.low),
      positionPercent: r1(((last.close - yLo.low) / (yHi.high - yLo.low)) * 100),
      toHighPercent: pct(yHi.high, last.close),
      toLowPercent: pct(yLo.low, last.close),
      _note: 'range = intraday high/low since Jan 1; positionPercent 0 = at the low, 100 = at the high',
    } : null,
    months,
    rsi: {
      current: r1(last.rsi),
      max: {value: r1(Math.max(...rsiRows.map((r) => r.rsi))), date: extreme(rsiRows, (x) => x.rsi, (a, b) => a > b).date},
      min: {value: r1(Math.min(...rsiRows.map((r) => r.rsi))), date: extreme(rsiRows, (x) => x.rsi, (a, b) => a < b).date},
      daysAbove70: rsiRows.filter((r) => r.rsi > 70).length,
      daysBelow30: rsiRows.filter((r) => r.rsi < 30).length,
      daysMeasured: rsiRows.length,
    },
    volume: {
      _unit: 'million shares per session, averaged per month; the latest month may be partial (see months[].sessions)',
      latestMonth: {month: months.at(-1).month, avgM: months.at(-1).avgVolumeM, sessions: months.at(-1).sessions},
      maxMonth: {month: maxM.month, avgM: maxM.avgVolumeM},
      minMonth: {month: minM.month, avgM: minM.avgVolumeM},
      latestVsMaxMonthPercent: pct(months.at(-1).avgVolumeM, maxM.avgVolumeM),
      last60VsPrevious60Percent: rows.length >= 120 ? pct(volM(rows.slice(-60)), volM(rows.slice(-120, -60))) : null,
    },
    // Today against the long-horizon turning points that predate this feed. A peak is its
    // month's intraday HIGH and a trough its LOW — "vượt đỉnh 2022" means above 1536, not
    // above January 2022's close of 1479. A reconstructed series only has real values at
    // make-series.mjs's ANCHORS (monthly closes), so then only those months, by close.
    vsTurningPoints: [
      ...R.series.peakMonths.map((t) => ['peak', t]),
      ...R.series.troughMonths.map((t) => ['trough', t]),
    ].filter(([, t]) => t < rows[0].date.slice(0, 7) && idx.has(t) && (!RECONSTRUCTED || PINNED.has(t)))
      .map(([kind, t]) => {
        const c = SERIES[idx.get(t)];
        const level = RECONSTRUCTED ? c.c : kind === 'peak' ? c.h : c.l;
        return {kind, month: t, level: r0(level), levelIs: RECONSTRUCTED ? 'close' : kind === 'peak' ? 'high' : 'low',
          close: r0(c.c),
          latestVsPercent: pct(last.close * k, level),
          ytdHighVsPercent: before ? pct(yHi.high * k, level) : null};
      }),
  };
}

const factsOut = resolve(ROOT, `content/${name}.facts.json`);
mkdirSync(dirname(factsOut), {recursive: true});
writeFileSync(factsOut, JSON.stringify(facts, null, 2) + '\n');

if (flag('facts-only')) {
  console.log(`wrote content/${name}.facts.json — ${SERIES.length} months, ${facts.rsi.monthsMeasured} RSI readings`);
  process.exit(0);
}

// ---------------------------------------------------------------- scaffold

/** A panel's required props, stubbed so verify's schema check can run at once. */
const STUB = {
  candles: () => ({type: 'candles', caption: 'VNINDEX · 1M · THANG LOG'}),
  macd: () => ({type: 'macd', caption: 'TODO', note: 'TODO'}),
  rsi: () => ({type: 'rsi', caption: 'TODO'}),
  pictogram: () => ({type: 'pictogram', rows: 6, columns: 8, filledPercent: 50, accent: 'green'}),
  bars: () => ({type: 'bars', bars: [{label: 'TODO', percent: 50, accent: 'gold'},
                                     {label: 'TODO', percent: 50, accent: 'red'}]}),
  list: () => ({type: 'list', accent: 'gold', chipShape: 'square',
                items: [{icon: 'up', text: 'TODO'}, {icon: 'warning', text: 'TODO'}, {icon: 'cross', text: 'TODO'}]}),
  cards: () => ({type: 'cards', accent: 'red',
                 cards: [{title: 'TODO', body: 'TODO'}, {title: 'TODO', body: 'TODO'}]}),
  zigzag: () => ({type: 'zigzag', topLabel: 'vùng đỉnh', endLabel: 'TODO',
                  upLabel: 'hy vọng', downLabel: 'chần chừ', steps: 5}),
  riskReward: () => ({type: 'riskReward', left: {label: 'Đúng', value: 20}, right: {label: 'Sai', value: 55}}),
  image: () => ({type: 'image', src: 'TODO', caption: 'TODO', source: 'TODO'}),
  outro: () => ({type: 'outro', brand: meta.brand ?? 'Kênh của bạn', kicker: 'Chứng khoán',
                 pill: 'Nhóm cộng đồng · Miễn phí', line: 'Cần hỗ trợ? Nhắn tin trực tiếp cho mình'}),
};

/** Brief-declared panel fields override the stub. `src` is made relative to public/. */
const applyFields = (visual, fields) => {
  const out = {...visual};
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (k === 'src') out.src = v.replace(/^public\//, '');
    else if (k === 'zoom') out.zoom = v !== 'false';
    else out[k] = v;
  }
  return out;
};

/** Acts follow the argument; a brief may override per scene. */
const actFor = (role, i, n) => {
  if (role === 'outro') return 'navy';
  if (role === 'action') return 'amber';
  if (role === 'warning' || role === 'mechanism') return 'maroon';
  return 'blue';
};

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const N = R.narration;
const [loWords, hiWords] = N.warnWordsPerScene;
const midWords = Math.round((loWords + hiWords) / 2);
// Pace is designed per role (content-rules.style.pace): hook and outro aim below the middle of
// the comfortable band, evidence above it, everything else at the middle. verify's style check
// reads the same map, so a reel whose hook is longer than its evidence gets a WARN.
const PACE = R.style?.pace ?? {shortRoles: [], longRoles: []};
const targetWords = (role) => PACE.shortRoles?.includes(role) ? Math.round((loWords + midWords) / 2)
  : PACE.longRoles?.includes(role) ? Math.round((midWords + hiWords) / 2)
  : midWords;
const estDuration = (w) => Math.round((w / N.wordsPerSecond + R.audio.leadIn + R.audio.tail) * 100) / 100;

// public/voiceover/ is shared by every reel and files are named <NN>-<id>.wav,
// so two reels whose third scene is both "concept-3" would silently share one
// voice track (verify: voice-stems). Prefixing with the reel name prevents it.
const roleCount = new Map();
for (const b of briefScenes) roleCount.set(b.role, (roleCount.get(b.role) ?? 0) + 1);

const scenes = briefScenes.map((b, i) => {
  if (!STUB[b.panel]) {
    console.error(`Scene ${i + 1}: panel "${b.panel}" is not one of ${Object.keys(STUB).join('|')}`);
    process.exit(2);
  }
  if (!R.arc.roles.includes(b.role)) {
    console.error(`Scene ${i + 1}: role "${b.role}" is not one of ${R.arc.roles.join('|')}`);
    process.exit(2);
  }
  const id = slug(roleCount.get(b.role) > 1 ? `${name}-${b.role}-${i + 1}` : `${name}-${b.role}`);
  return {
    id,
    _brief: b.intent.join(' '),
    _role: b.role,
    _words: targetWords(b.role),
    eyebrow: 'TODO',
    act: meta.act && i < briefScenes.length - 1 ? meta.act : actFor(b.role, i, briefScenes.length),
    duration: estDuration(targetWords(b.role)),
    narration: 'TODO',
    beats: [{atSentence: 0, at: R.audio.leadIn, line1: 'TODO', line2: 'TODO', accent: 'gold'}],
    visual: applyFields(STUB[b.panel](), b.fields),
    ...(b.panel === 'outro'
      ? {headline: {line1Baseline: 1338, line2Baseline: 1418, maxFontSize: 60, footnoteY: 1484}}
      : {}),
  };
});

const tickerFromDaily = () => {
  if (!facts.daily) {
    console.error(`ticker: daily needs content/${SYMBOL.toLowerCase()}-daily.json (fetch-market.mjs --resample=none)`);
    process.exit(2);
  }
  return {symbol: SYMBOL === 'VNINDEX' ? 'VN-INDEX' : SYMBOL, timeframe: '1D',
          last: facts.daily.latest.closeExact, prev: facts.daily.previous.closeExact, asOf: facts.daily.latest.date};
};

const reel = {
  title: meta.title ?? name,
  status: 'scaffolded',
  brief: briefPath,
  facts: `content/${name}.facts.json`,
  disclaimer: meta.disclaimer
    ?? 'Mọi thông tin chỉ là thông tin tham khảo, không phải khuyến nghị đầu tư.',
  // `ticker: daily` in the brief: the strip shows the latest REAL session from facts.daily
  // instead of the reconstructed monthly close. `footer:` names the source when it is real.
  ...(meta.ticker === 'daily' ? {ticker: tickerFromDaily()} : {}),
  ...(meta.footer ? {footer: meta.footer} : {}),
  scenes,
};

const out = resolve(ROOT, `content/${name}.json`);
if (existsSync(out) && !flag('force')) {
  console.error(`content/${name}.json already exists. Pass --force to overwrite the draft.`);
  process.exit(2);
}
writeFileSync(out, JSON.stringify(reel, null, 2) + '\n');

console.log(`${name}: ${scenes.length} scenes scaffolded from ${briefPath}`);
console.log(`  facts     content/${name}.facts.json  (${SERIES.length} months, RSI ${facts.rsi.current}, ${facts.rsi.monthsAbove70}/${facts.rsi.monthsMeasured} above 70)`);
console.log(`  scaffold  content/${name}.json        (status: scaffolded)`);
console.log(`  roles     ${briefScenes.map((b) => `${b.role}·${b.panel}`).join('  ')}`);
console.log(`\nNext: run the per-scene worker (SKILL.md muc 1c), merge, set status: enriched.`);
console.log(`Then:  register it in src/Root.tsx, then npm run verify -- <Composition>.`);
