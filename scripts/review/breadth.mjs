#!/usr/bin/env node
/**
 * Market breadth history for the weekly edition: how many stocks close above their 200-session average, per session.
 *
 *   node scripts/review/breadth.mjs                    the latest pulled session
 *   node scripts/review/breadth.mjs --date=2026-10-05  a session whose universe is cached (.review-cache/<date>-universe.json)
 *   node scripts/review/breadth.mjs --concurrency=6    parallel GETs to SSI (default 6)
 *
 * The user asked for the NUMBER (2026-10-06: "amount of stock have price better than its SMA200"). The SET is the
 * terminal's own: every stock the session's screener universe gives an SMA200 (sma_200 > 0), only those with
 * volume_sma20 ≥ rules.formats.weekly.breadth.minVolumeSma20 when that floor is above 0. The HEADLINE count the reel
 * says is the terminal's (current_price > sma_200 on that set — what the user gets filtering price > SMA200 on the
 * terminal); this script recomputes the HISTORY behind it, which the screener does not keep, from SSI iBoard daily
 * closes (GET, no auth; nothing goes to the terminal — until 2026-10-06 this script sent ~900 GETs to the user's
 * /api/analyze): lib/stock-bars.mjs caches each stock's bars per edition, and a stock's SMA200 on a session is the mean
 * of its last 200 closes CARRIED FORWARD over market sessions (a session without a trade keeps the previous close).
 *
 * Measured 2026-10-06 on the 5/10 universe (901 stocks with an SMA200, terminal 247 above):
 *   carry-forward 236/899 (residual −11, −1,2% of the set)   trade-only closes 168/728 (−79)
 * The gap is the ~170 near-untradable names (volume_sma20 of 0–6 000 shares), whose SMA200 the terminal computes in a
 * way SSI's bars do not reproduce; on liquid stocks the two agree (volume_sma20 ≥ 10 000: 100 vs 99; ≥ 50 000: 72 vs 71).
 *
 * Writes content/review/breadth.json: {asOf, source, method, set: {rule, floor, size}, period, rows: [{t, above, with,
 * percent}], terminal: {above, with, percent}, residual: {count, sharePercent}}.
 */
import {PATHS, cli, die, exists, readJson, round, rules, tryJson, writeJson} from './lib/common.mjs';
import {fetchBars, readBars} from './lib/stock-bars.mjs';

const {opt} = cli();
const R = rules();
const CONC = Number(opt('concurrency', '6'));
const PERIOD = 200;
const WINDOW = 60;           // sessions of history the scene draws
const LONG_DAYS = 1900;      // ~5 years, for a stock too thinly traded for the default window to hold its 200 closes
if (!exists(PATHS.daily)) die(`no ${PATHS.daily} — run node scripts/review/pull.mjs first`);
const index = readJson(PATHS.daily);
const date = opt('date', index[index.length - 1].t);
const sessions = index.map((b) => b.t).filter((t) => t <= date);
if (sessions[sessions.length - 1] !== date) die(`${date} is not a VNINDEX session in ${PATHS.daily}`);
// The first session whose carried-forward close a stock needs: 200 closes before the oldest session drawn.
const needFrom = sessions[Math.max(0, sessions.length - (PERIOD + WINDOW - 1))];

const B = R.formats?.weekly?.breadth ?? {};
const floor = Number(B.minVolumeSma20 ?? 0);
const uni = tryJson(`${PATHS.cache}/${date}-universe.json`)?.stocks;
if (!uni?.length) die(`no ${PATHS.cache}/${date}-universe.json — pull.mjs writes it; run it for ${date} first`);
const set = uni.filter((s) => s.sma_200 > 0 && (floor > 0 ? s.volume_sma20 >= floor : true));
const terminalAbove = set.filter((s) => s.current_price > s.sma_200).length;

const t0 = Date.now();
let done = 0, failed = 0, long = 0;
/** Bars covering `needFrom`, refetched over ~5 years when the default window starts after it (a thinly traded name). */
const barsOf = async (sym) => {
  const once = async () => {
    let bars = readBars(date, sym) ?? await fetchBars(date, sym);
    if (bars.length && bars[0].t > needFrom) {
      const first = await fetchBars(date, sym, {days: LONG_DAYS, force: true});
      if (first.length > bars.length) long++;
      bars = first;
    }
    return bars;
  };
  try {
    return await once().catch(once);
  } catch (e) {
    failed++;
    console.warn(`  ${sym}: ${e.message.split('\n')[0].slice(0, 120)}`);
    return null;
  } finally {
    done++;
    if (done % 200 === 0) console.log(`  ${done}/${set.length} stocks · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
};

const drawn = sessions.slice(-WINDOW);
const at = new Map(drawn.map((t, i) => [t, i]));
const withAvg = drawn.map(() => 0);
const above = drawn.map(() => 0);
const queue = set.map((s) => s.symbol);
await Promise.all(Array.from({length: CONC}, async () => {
  while (queue.length) {
    const sym = queue.shift();
    const bars = await barsOf(sym);
    if (!bars?.length) continue;
    // Closes carried forward over market sessions from the stock's first bar.
    const close = new Map(bars.map((b) => [b.t, b.c]));
    let last = null;
    let sum = 0;
    const vals = [];
    for (const t of sessions) {
      if (t < bars[0].t) continue;
      if (close.has(t)) last = close.get(t);
      vals.push(last);
      sum += last;
      if (vals.length > PERIOD) sum -= vals[vals.length - 1 - PERIOD];
      const i = at.get(t);
      if (i === undefined || vals.length < PERIOD) continue;
      withAvg[i]++;
      if (last > sum / PERIOD) above[i]++;
    }
  }
}));

// Keep the sessions where (nearly) every stock had an average.
const maxWith = Math.max(...withAvg);
const rows = drawn
  .map((t, i) => ({t, above: above[i], with: withAvg[i], percent: withAvg[i] ? round((100 * above[i]) / withAvg[i], 1) : null}))
  .filter((r) => r.with >= maxWith * 0.9);
if (rows.length < 10) die(`only ${rows.length} sessions of breadth — the SSI histories are too short`);

const lastRow = rows[rows.length - 1];
const residual = lastRow.t === date ? lastRow.above - terminalAbove : null;
writeJson('content/review/breadth.json', {
  asOf: lastRow.t,
  fetchedAt: new Date().toISOString(),
  source: 'SSI iBoard daily closes (scripts/review/lib/stock-bars.mjs)',
  method: 'SMA200 of closes carried forward over market sessions',
  set: {rule: `sma_200 > 0 on the terminal${floor > 0 ? ` and volume_sma20 ≥ ${floor}` : ''}`, floor, size: set.length},
  symbols: set.length,
  fetched: set.length - failed,
  period: PERIOD,
  terminal: {above: terminalAbove, with: set.length, percent: round((100 * terminalAbove) / set.length, 1)},
  residual: residual == null ? null : {count: residual, sharePercent: round((100 * residual) / set.length, 2)},
  rows,
});
console.log(`breadth ${rows[0].t} → ${lastRow.t}: ${rows.length} sessions · line ${lastRow.above}/${lastRow.with} = ${lastRow.percent}% · terminal ${terminalAbove}/${set.length} = ${round((100 * terminalAbove) / set.length, 1)}%${residual == null ? '' : ` · residual ${residual > 0 ? '+' : ''}${residual}`}`);
console.log(`        ${set.length - failed}/${set.length} stocks (${long} refetched over ~5 years), floor ${floor || 'none'}, ${Math.round((Date.now() - t0) / 1000)} s → content/review/breadth.json`);
