#!/usr/bin/env node
/**
 * Market breadth history: the share of stocks trading above their 200-session average, per session.
 *
 *   node scripts/review/breadth.mjs                    the latest pulled session
 *   node scripts/review/breadth.mjs --concurrency=4    parallel GETs to the terminal (default 4)
 *
 * The screener knows only today, so the line the breadth scene draws is recomputed: every stock the
 * screener reports with an SMA200 gets its daily closes from GET /api/analyze/<sym> (about a year of
 * bars, so ~55 sessions of a 200-session average), cached per session under
 * .review-cache/analyze-all/<date>/ (gitignored, ~50 KB a stock). Per session: how many stocks had
 * an average that day, how many closed above it. GET only — the one allowed POST is not needed here.
 *
 * Writes content/review/breadth.json: {asOf, source, symbols, rows: [{t, above, with, percent}]}.
 * The last row's percent will differ a little from the screener's own count (its SMA uses its bar
 * set); facts.mjs records both and the scene quotes the series it draws.
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {PATHS, abs, cli, die, exists, readJson, round, rules, tryJson, writeJson, zionle} from './lib/common.mjs';

const {opt} = cli();
const R = rules();
const CONC = Number(opt('concurrency', '4'));
if (!exists(PATHS.daily)) die(`no ${PATHS.daily} — run node scripts/review/pull.mjs first`);
const index = readJson(PATHS.daily);
const date = opt('date', index[index.length - 1].t);

// The universe of the session: the cached response of the allowed POST, or the snapshot's counts only.
const uni = tryJson(`${PATHS.cache}/${date}-universe.json`)?.stocks;
if (!uni?.length) die(`no ${PATHS.cache}/${date}-universe.json — pull.mjs writes it; run it for ${date} first`);
const symbols = uni.filter((s) => s.sma_200 > 0).map((s) => s.symbol).sort();
const dir = `${PATHS.cache}/analyze-all/${date}`;
mkdirSync(abs(dir), {recursive: true});

const t0 = Date.now();
let done = 0, failed = 0;
const fetchOne = async (sym) => {
  const file = abs(`${dir}/${sym}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  try {
    const a = await zionle(`/api/analyze/${encodeURIComponent(sym)}?interval=1D`, {timeout: 30000});
    const bars = (a.price_history ?? []).map((b) => [b.date, Number(b.close)]).filter(([t, c]) => t && Number.isFinite(c) && c > 0);
    writeFileSync(file, JSON.stringify(bars));
    return bars;
  } catch (e) {
    failed++;
    console.warn(`  ${sym}: ${e.message.split('\n')[0].slice(0, 120)}`);
    return null;
  } finally {
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${symbols.length} stocks · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
};

const PERIOD = 200;
const withAvg = new Map();   // t -> stocks with an average that day
const above = new Map();     // t -> stocks closing above it
const queue = [...symbols];
await Promise.all(Array.from({length: CONC}, async () => {
  while (queue.length) {
    const sym = queue.shift();
    const bars = await fetchOne(sym);
    if (!bars || bars.length <= PERIOD) continue;
    let sum = 0;
    for (let i = 0; i < bars.length; i++) {
      sum += bars[i][1];
      if (i >= PERIOD) sum -= bars[i - PERIOD][1];
      if (i < PERIOD - 1) continue;
      const [t, c] = bars[i];
      if (t > date) continue;
      withAvg.set(t, (withAvg.get(t) ?? 0) + 1);
      if (c > sum / PERIOD) above.set(t, (above.get(t) ?? 0) + 1);
    }
  }
}));

// Keep the sessions where (nearly) every stock had an average — the first days of the window are
// covered by the longest histories only, and would read as a different market.
const maxWith = Math.max(...withAvg.values());
const rows = [...withAvg.entries()]
  .filter(([, n]) => n >= maxWith * 0.9)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([t, n]) => ({t, above: above.get(t) ?? 0, with: n, percent: round((100 * (above.get(t) ?? 0)) / n, 1)}));
if (rows.length < 10) die(`only ${rows.length} sessions of breadth — the terminal's histories are too short`);

writeJson('content/review/breadth.json', {
  asOf: rows[rows.length - 1].t,
  fetchedAt: new Date().toISOString(),
  source: 'zionle.io.vn /api/analyze, SMA200 on daily closes',
  symbols: symbols.length,
  fetched: symbols.length - failed,
  period: PERIOD,
  rows,
});
const last = rows[rows.length - 1];
console.log(`breadth ${rows[0].t} → ${last.t}: ${rows.length} sessions · last ${last.above}/${last.with} = ${last.percent}% · ${symbols.length - failed}/${symbols.length} stocks in ${Math.round((Date.now() - t0) / 1000)} s`);
void R;
