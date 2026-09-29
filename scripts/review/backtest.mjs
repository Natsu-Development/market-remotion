#!/usr/bin/env node
/**
 * How often a follow-through day led to a higher market, per FTD threshold, on the whole
 * VNINDEX history in content/review/vnindex.daily.json (run scripts/review/pull.mjs first).
 *
 *   node scripts/review/backtest.mjs            table
 *   node scripts/review/backtest.mjs --json     rows, for facts.mjs and the review page
 *
 * Thresholds and the forward window come from rules.followThrough (backtestThresholds,
 * backtestForwardSessions); everything else from the distribution/followThrough blocks.
 * Rough on purpose: overlapping windows, no stops. It exists so the threshold in rules.json
 * is chosen with numbers.
 */
import {PATHS, cli, die, exists, readJson, rules} from './lib/common.mjs';
import {backtest} from './lib/market-state.mjs';

const {flag} = cli();
const R = rules();
if (!exists(PATHS.daily)) die(`no ${PATHS.daily} — run node scripts/review/pull.mjs first`);
const bars = readJson(PATHS.daily);
const rows = backtest(bars, {distribution: R.distribution, followThrough: R.followThrough}, {
  thresholds: R.followThrough.backtestThresholds,
  forward: R.followThrough.backtestForwardSessions,
});

if (flag('json')) {
  console.log(JSON.stringify({from: bars[0].t, to: bars[bars.length - 1].t, sessions: bars.length, forward: R.followThrough.backtestForwardSessions, ddMaxChangePercent: R.distribution.maxChangePercent, rows}, null, 2));
} else {
  console.log(`VNINDEX ${bars[0].t} → ${bars[bars.length - 1].t} · ${bars.length} sessions · DD ≤ ${R.distribution.maxChangePercent}% · forward ${R.followThrough.backtestForwardSessions} sessions\n`);
  console.log('FTD ≥     FTDs  graded  higher   median   after day 7   failed');
  for (const r of rows) {
    const mark = r.threshold === R.followThrough.minChangePercent ? '  ← rules.json' : '';
    console.log(`+${String(r.threshold).padEnd(6)} ${String(r.ftds).padStart(5)} ${String(r.evaluated).padStart(7)} ${String(r.higherPercent).padStart(6)}% ${String(r.medianReturnPercent).padStart(7)}% ${String(r.afterDay7).padStart(13)} ${String(r.failed).padStart(8)}${mark}`);
  }
}
