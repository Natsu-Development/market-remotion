#!/usr/bin/env node
/**
 * Pulls price history — and, from the VN Trading Terminal, RSI-divergence signals —
 * and writes them in the shape the charts expect.
 *
 *   node scripts/fetch-market.mjs --symbol=VNINDEX --resample=none --signals   -> content/vnindex-daily.json + -analysis.json
 *   node scripts/fetch-market.mjs --symbol=VNINDEX --source=ssi --replace-series   -> the REAL 13-year monthly series
 *   node scripts/fetch-market.mjs --symbol=FPT --resample=1M --out=content/fpt-monthly.json
 *   node scripts/fetch-market.mjs --probe --symbol=VNINDEX     print the raw response shape
 *   node scripts/fetch-market.mjs --symbol=HPG --resample=none  keep the daily bars (content/hpg-daily.json)
 *
 * Sources (--source):
 *   zionle  (default) the user's terminal, https://zionle.io.vn. ~1 year of daily bars, plus the
 *           divergences/trendlines/signals the page computed (--signals). Prices in thousands.
 *   ssi     SSI iBoard chart feed. Daily VNINDEX from 2013-01-02, prices in points, volume =
 *           MATCHED shares (agrees with FireAnt's "KL khớp"). No auth. Measured 2026-09-23: 3400 bars.
 *   entrade DNSE Entrade chart feed. Same prices as SSI; volume includes put-through
 *           (agrees with FireAnt's "Tổng KL"). No auth. Alternate when SSI is down.
 *
 * It will not write content/vnindex-monthly.json (the 13-year chart series) without
 * --replace-series. Every series write also drops <out>.meta.json (source, dates, bars)
 * so the footer and the docs can say where the numbers came from.
 *
 * MEASURED 2026-09-22 against the user's config_id: the feed returns ~254 DAILY bars
 * (about one year) and ignores start_date/end_date, so it cannot fill the
 * 13-year monthly series the channel charts read. It is a daily feed with RSI,
 * divergences and trendlines already computed server-side.
 *
 * Units: everything arrives in thousands of VND, which is the normal quote unit
 * for a stock (FPT 66.6 = 66,600d) but divides an INDEX by 1000 (VNINDEX 1.809
 * = 1809 points). --scale fixes that; auto multiplies indices back up.
 *
 * Every data endpoint needs a config_id. The web app mints one per browser and
 * keeps it in localStorage under `trading-app_config-id`; this script reads it
 * from --config-id, then $ZIONLE_CONFIG_ID, then the file .zionle-config.
 * Nothing here ever POSTs — it will not create a config on your service.
 *
 * The response contract was read out of the site's JS bundle, not from docs.
 * `price_history` field names are therefore matched leniently: --probe prints
 * exactly what came back so the mapping below can be corrected in one edit.
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://zionle.io.vn/api';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const SYMBOL = opt('symbol', '');
const SOURCE = opt('source', 'zionle');
if (!['zionle', 'ssi', 'entrade'].includes(SOURCE)) {
  console.error(`--source=${SOURCE} must be zionle, ssi or entrade.`);
  process.exit(1);
}
const INTERVAL = opt('interval', '');
const RESAMPLE = opt('resample', '1M');
const START = opt('start', '');
const END = opt('end', '');
const PROBE = flag('probe');
const WANT_SIGNALS = flag('signals');

/** Indices arrive divided by 1000 so they share the stock quote unit. */
const INDEX_SYMBOLS = new Set(['VNINDEX', 'VN30', 'VN100', 'HNXINDEX', 'HNX30', 'UPCOMINDEX']);
const SCALE = (() => {
  const raw = opt('scale', 'auto');
  // Only the terminal quotes an index divided by 1000; SSI and Entrade send points.
  if (raw === 'auto') return SOURCE === 'zionle' && INDEX_SYMBOLS.has(SYMBOL.toUpperCase()) ? 1000 : 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`--scale=${raw} must be a positive number, or "auto".`);
    process.exit(1);
  }
  return n;
})();

if (!SYMBOL) {
  console.error('Missing --symbol=<TICKER>. Example: --symbol=VNINDEX');
  process.exit(1);
}

const configId = () => {
  const explicit = opt('config-id', process.env.ZIONLE_CONFIG_ID);
  if (explicit) return explicit;
  const file = resolve(ROOT, '.zionle-config');
  if (existsSync(file)) {
    const v = readFileSync(file, 'utf8').trim();
    if (v) return v;
  }
  console.error(
    'No config_id.\n' +
      '  Open https://zionle.io.vn, then DevTools > Application > Local Storage and copy\n' +
      '  the value of `trading-app_config-id`. Then either:\n' +
      '    echo "<id>" > .zionle-config\n' +
      '    export ZIONLE_CONFIG_ID=<id>\n' +
      '    node scripts/fetch-market.mjs --config-id=<id> --symbol=' + SYMBOL,
  );
  process.exit(1);
};

const get = async (path) => {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {headers: {'Content-Type': 'application/json'}});
  } catch (err) {
    console.error(`GET ${path} failed to connect: ${err.message}`);
    process.exit(1);
  }
  const body = (await res.json().catch(() => null)) ?? {error: `non-JSON response (${res.status})`};
  if (!res.ok) {
    console.error(`GET ${path} -> ${res.status}: ${body.error ?? JSON.stringify(body).slice(0, 200)}`);
    // Two distinct failures that read alike. Verified live 2026-09-22.
    if (res.status === 400) {
      console.error('  No config_id reached the server — check .zionle-config / $ZIONLE_CONFIG_ID.');
    } else if (res.status === 404 && String(body.error).includes('configuration')) {
      console.error('  That config_id is not on the server any more. Re-copy it from the browser.');
    }
    process.exit(1);
  }
  return body;
};

/** Accept whatever the API calls these fields; --probe prints the truth. */
const pick = (row, names) => {
  for (const n of names) if (row[n] != null) return row[n];
  return undefined;
};

const FIELDS = {
  time: ['date', 'time', 't', 'timestamp', 'Date', 'datetime'],
  open: ['open', 'o', 'Open'],
  high: ['high', 'h', 'High'],
  low: ['low', 'l', 'Low'],
  close: ['close', 'c', 'Close'],
  volume: ['volume', 'v', 'Volume', 'vol'],
  rsi: ['rsi', 'RSI'],
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-08-31", "2026-08", epoch seconds or ms -> "2026-08". null if unreadable. */
const toMonth = (t) => {
  if (t == null) return null;
  if (typeof t === 'number') {
    const ms = t > 1e11 ? t : t * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 7);
  }
  const m = String(t).slice(0, 7);
  return MONTH.test(m) ? m : null;
};

/** Daily bars collapse into the repo's monthly {t,o,h,l,c,v} shape. */
const toMonthly = (rows) => {
  // Open must come from the month's FIRST bar and close from its LAST, so the
  // feed is sorted before bucketing rather than trusted to arrive in order.
  const dated = [];
  let unreadable = 0;
  for (const r of rows) {
    const t = toMonth(pick(r, FIELDS.time));
    if (!t) unreadable++;
    else dated.push([t, r]);
  }
  if (unreadable) {
    console.warn(`note: skipped ${unreadable} row(s) with an unreadable date.`);
  }
  dated.sort((a, b) => (a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1));

  const buckets = new Map();
  for (const [t, r] of dated) {
    const c = Number(pick(r, FIELDS.close)) * SCALE;
    if (!Number.isFinite(c)) continue;
    const o = Number(pick(r, FIELDS.open)) * SCALE;
    const h = Number(pick(r, FIELDS.high)) * SCALE;
    const l = Number(pick(r, FIELDS.low)) * SCALE;
    const v = Number(pick(r, FIELDS.volume) ?? 0);
    const rsi = Number(pick(r, FIELDS.rsi));
    const hi = Number.isFinite(h) ? h : c;
    const lo = Number.isFinite(l) ? l : c;
    const b = buckets.get(t);
    if (!b) {
      buckets.set(t, {t, o: Number.isFinite(o) ? o : c, h: hi, l: lo, c,
                      v: Number.isFinite(v) ? v : 0,
                      ...(Number.isFinite(rsi) ? {rsi} : {})});
    } else {
      b.h = Math.max(b.h, hi);
      b.l = Math.min(b.l, lo);
      b.c = c;
      if (Number.isFinite(v)) b.v += v;
      // Month-end reading, not an average — an averaged oscillator is meaningless.
      if (Number.isFinite(rsi)) b.rsi = rsi;
    }
  }
  return [...buckets.values()];
};

/** UDF-style {t[],o[],h[],l[],c[],v[]} -> rows the FIELDS mapping understands. */
const fromUdf = (d) => (d.t ?? []).map((t, i) => ({
  date: new Date(Number(t) * 1000).toISOString().slice(0, 10),
  open: Number(d.o?.[i]), high: Number(d.h?.[i]), low: Number(d.l?.[i]), close: Number(d.c?.[i]),
  volume: Number(d.v?.[i] ?? 0),
}));

const epoch = (iso, fallback) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : fallback);

const fetchPublic = async (source) => {
  const from = epoch(START, 1356998400);                       // 2013-01-01
  const to = epoch(END, Math.floor(Date.now() / 1000) + 86400);
  const sym = SYMBOL.toUpperCase();
  const url = source === 'ssi'
    ? `https://iboard-api.ssi.com.vn/statistics/charts/history?resolution=1D&symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}`
    : `https://services.entrade.com.vn/chart-api/v2/ohlcs/${INDEX_SYMBOLS.has(sym) ? 'index' : 'stock'}?from=${from}&to=${to}&symbol=${encodeURIComponent(sym)}&resolution=1D`;
  let res;
  try {
    res = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0', Accept: 'application/json'}, signal: AbortSignal.timeout(45000)});
  } catch (err) {
    console.error(`GET ${url} failed: ${err.message}`);
    process.exit(1);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    console.error(`GET ${url} -> ${res.status}`);
    process.exit(1);
  }
  const udf = source === 'ssi' ? body.data : body;
  if (!udf?.t?.length) {
    console.error(`${source}: no bars for ${sym}. Response: ${JSON.stringify(body).slice(0, 200)}`);
    process.exit(1);
  }
  return {url, price_history: fromUdf(udf), symbol: sym, timestamp: new Date().toISOString()};
};

let data;
if (SOURCE === 'zionle') {
  const params = new URLSearchParams({config_id: configId()});
  if (START) params.set('start_date', START);
  if (END) params.set('end_date', END);
  if (INTERVAL) params.set('interval', INTERVAL);
  data = await get(`/analyze/${encodeURIComponent(SYMBOL)}?${params.toString()}`);
} else {
  if (WANT_SIGNALS) {
    console.error('--signals needs the terminal (--source=zionle); SSI/Entrade carry prices only.');
    process.exit(1);
  }
  data = await fetchPublic(SOURCE);
}

if (PROBE) {
  console.log(`symbol            ${data.symbol}`);
  console.log(`timestamp         ${data.timestamp}`);
  console.log(`processing_time   ${data.processing_time_ms} ms`);
  console.log(`top-level keys    ${Object.keys(data).join(', ')}`);
  console.log(`scale applied     x${SCALE}${SCALE === 1000 ? '  (index -> points)' : ''}`);
  for (const k of ['divergences', 'trendlines', 'signals']) {
    const v = data[k];
    if (Array.isArray(v)) {
      console.log(`${k.padEnd(18)}array[${v.length}]`);
      if (v.length) console.log(`  first           ${JSON.stringify(v[0]).slice(0, 190)}`);
    }
  }
  const ph = data.price_history;
  console.log(`price_history     ${Array.isArray(ph) ? `array[${ph.length}]` : typeof ph}`);
  if (Array.isArray(ph) && ph.length) {
    console.log(`  row keys        ${Object.keys(ph[0]).join(', ')}`);
    console.log(`  first           ${JSON.stringify(ph[0])}`);
    console.log(`  last            ${JSON.stringify(ph[ph.length - 1])}`);
  } else if (ph && typeof ph === 'object') {
    console.log(`  keys            ${Object.keys(ph).join(', ')}`);
  }
  if (data.signals?.length) {
    console.log(`signal types      ${[...new Set(data.signals.map((s) => s.type))].sort().join(', ')}`);
  }
  process.exit(0);
}

const rows = Array.isArray(data.price_history)
  ? data.price_history
  : data.price_history?.candles ?? data.price_history?.data ?? null;

if (!Array.isArray(rows) || !rows.length) {
  console.error(
    `No usable price_history for ${SYMBOL}. Got: ${String(JSON.stringify(data.price_history)).slice(0, 300)}\n` +
      '  Run again with --probe to see the response shape, then widen FIELDS in this script.',
  );
  process.exit(1);
}

const sample = rows[0];
const missing = Object.entries(FIELDS)
  .filter(([, names]) => pick(sample, names) === undefined)
  .map(([k]) => k);
const fatal = missing.filter((k) => k === 'time' || k === 'close');
if (fatal.length) {
  console.error(
    `price_history rows have keys [${Object.keys(sample).join(', ')}] — cannot find ${fatal.join(', ')}.\n` +
      '  Add the real names to FIELDS in this script.',
  );
  process.exit(1);
}
if (missing.length) console.warn(`note: no ${missing.join('/')} in the feed — substituting close.`);

if (RESAMPLE !== '1M' && RESAMPLE !== 'none') {
  console.error(`--resample=${RESAMPLE} is not implemented. Use 1M (monthly) or none (pass through).`);
  process.exit(1);
}
const candles = RESAMPLE === '1M' ? toMonthly(rows) : rows;
if (!candles.length) {
  console.error('Every row was dropped — no candle survived parsing. Run with --probe and widen FIELDS.');
  process.exit(1);
}
const out = resolve(ROOT, opt('out',
  `content/${SYMBOL.toLowerCase()}-${RESAMPLE === '1M' ? 'monthly' : 'daily'}.json`));
// content/vnindex-monthly.json is the 13-year series every chart panel reads. This feed
// holds ~13 months, so writing it there breaks every reel. Happened 2026-09-23: the
// default --out for --resample=none was <symbol>-monthly.json and replaced it with daily rows
// (restored with scripts/make-series.mjs).
const isChartSeries = out === resolve(ROOT, 'content/vnindex-monthly.json');
if (isChartSeries && !flag('replace-series')) {
  console.error(
    `Refusing to overwrite content/vnindex-monthly.json with ${candles.length} ${RESAMPLE === '1M' ? 'monthly candles' : 'daily rows'}:\n` +
      '  that file is the 13-year series the chart panels read. Pass --out=<another file>,\n' +
      '  or --replace-series if you really mean to swap the chart series.',
  );
  process.exit(1);
}
mkdirSync(dirname(out), {recursive: true});
writeFileSync(out, JSON.stringify(candles, null, 0) + '\n');
// Provenance next to the series: who, when, what range. src/lib/series.ts reads the one for
// the chart series so the reel's footer can name its source.
const SOURCE_LABEL = {zionle: 'zionle.io.vn', ssi: 'SSI iBoard', entrade: 'DNSE Entrade'};
writeFileSync(out.replace(/\.json$/, '') + '.meta.json', JSON.stringify({
  source: SOURCE, sourceLabel: SOURCE_LABEL[SOURCE], symbol: SYMBOL.toUpperCase(),
  resolution: RESAMPLE === '1M' ? 'monthly' : 'daily', reconstructed: false,
  fetchedAt: new Date().toISOString(), from: candles[0].t ?? candles[0].date,
  to: candles[candles.length - 1].t ?? candles[candles.length - 1].date, bars: candles.length,
  rawRows: rows.length, scale: SCALE,
  volumeUnit: SOURCE === 'ssi' ? 'matched shares, summed per bar' : SOURCE === 'entrade' ? 'total shares incl. put-through, summed per bar' : 'shares, summed per bar',
  ...(data.url ? {url: data.url} : {}),
}, null, 2) + '\n');

const unit = RESAMPLE === '1M' ? 'monthly candles' : 'daily rows';
console.log(`${SYMBOL}: ${rows.length} raw rows -> ${candles.length} ${unit}  (scale x${SCALE})`);
console.log(`  range     ${candles[0].t ?? candles[0].date} .. ${candles[candles.length - 1].t ?? candles[candles.length - 1].date}`);
console.log(`  wrote     ${out.replace(ROOT + '/', '')}`);

if (WANT_SIGNALS) {
  // The terminal has already found the divergences and trendlines. Keep them —
  // re-deriving analysis the source of record already published is how the
  // video ends up disagreeing with the site it came from.
  const analysis = {
    symbol: data.symbol,
    timestamp: data.timestamp,
    scale: SCALE,
    divergences: data.divergences ?? [],
    trendlines: data.trendlines ?? [],
    signals: data.signals ?? [],
  };
  const sigOut = resolve(ROOT, opt('signals-out', `content/${SYMBOL.toLowerCase()}-analysis.json`));
  mkdirSync(dirname(sigOut), {recursive: true});
  writeFileSync(sigOut, JSON.stringify(analysis, null, 2) + '\n');
  const byType = analysis.signals.reduce((m, s) => ({...m, [s.type]: (m[s.type] ?? 0) + 1}), {});
  console.log(`  analysis  ${analysis.divergences.length} divergences · ${analysis.trendlines.length} trendlines · ${analysis.signals.length} signals`);
  if (analysis.signals.length) {
    console.log(`            ${Object.entries(byType).map(([k, n]) => `${k}:${n}`).join(', ')}`);
  }
  console.log(`  wrote     ${sigOut.replace(ROOT + '/', '')}`);
}

// src/lib/series.ts fits the channel through months named in PEAK_MONTHS /
// TROUGH_MONTHS at module scope. A range that does not cover them throws during
// bundle evaluation and kills EVERY composition, so say so here rather than there.
// Measured: the feed returns ~1 year of daily bars whatever start_date says.
if (RESAMPLE === '1M' && candles.length < 60) {
  console.warn(
    `\n⚠ Only ${candles.length} monthly candles (${candles[0].t} .. ${candles[candles.length - 1].t}).\n` +
      '  The channel and MACD panels are built for ~13 years. This feed is a DAILY feed —\n' +
      '  use it for short-horizon reels (--resample=none) rather than as the monthly series.',
  );
}

const have = new Set(candles.map((c) => c.t));
const ANCHORS = ['2018-04', '2022-01', '2026-08', '2014-01', '2020-03', '2022-11'];
const absent = ANCHORS.filter((m) => !have.has(m));
if (absent.length && isChartSeries) {
  console.warn(
    `\n⚠ src/lib/series.ts names months this feed does not contain: ${absent.join(', ')}.\n` +
      '  Update PEAK_MONTHS / TROUGH_MONTHS to months that exist, or every composition\n' +
      '  will throw "No candle for <month>" at bundle time — including reels with no chart.',
  );
}
