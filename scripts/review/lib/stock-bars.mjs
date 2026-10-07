/**
 * Per-stock daily bars for the weekly edition, from SSI iBoard (GET, no auth) — the history the terminal's own
 * averages are computed on: the SMA200 of these closes equals the terminal's sma_200 to the third decimal (HPG
 * 23,296 / 23,2955 · MSR 39,295 / 39,2947 · HAH, PVS, ABB, VIC, ACB — measured 2026-10-06 on the 5/10 close), so a
 * count of stocks above their SMA200 computed here is the terminal's count. Prices in thousands of VND, like the
 * terminal; volume in shares.
 *
 * Cached per edition under .review-cache/stock-bars/<date>/<SYM>.json as [[t, o, h, l, c, v], …], bars after the
 * edition's session dropped. scripts/review/breadth.mjs fills it for the session's whole SMA200 universe (~900 GETs,
 * about a minute); facts.mjs only READS it (weekly board rows, ICB group medians) and never goes to the network.
 *
 *   readBars(date, sym)            the cached bars up to `date`, or null
 *   fetchBars(date, sym, {days})   the cache, else SSI from `days` calendar days before `date` (default 420, ~290
 *                                  sessions: an SMA200 for each of the last ~60 sessions), written to the cache;
 *                                  {force: true} refetches over the cache (breadth.mjs: a longer history for a stock
 *                                  that trades too rarely for 420 days to hold 200 closes)
 *   weekChangePercent(bars, date)  the close of `date` against the last close before that week's Monday, or null
 *                                  when the stock did not trade on `date` or has no bar before the week
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {PATHS, abs, ssiDaily, weekStart} from './common.mjs';

export const barsDir = (date) => `${PATHS.cache}/stock-bars/${date}`;
const fileOf = (date, sym) => abs(`${barsDir(date)}/${sym}.json`);
const daysBefore = (date, days) => new Date(new Date(`${date}T00:00:00Z`).getTime() - days * 86400e3).toISOString().slice(0, 10);

/** The cached bars of `sym` for the edition `date` ({t, o, h, l, c, v}, oldest first), or null. */
export const readBars = (date, sym) => {
  const f = fileOf(date, sym);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, 'utf8')).map(([t, o, h, l, c, v]) => ({t, o, h, l, c, v}));
  } catch {
    return null;
  }
};

/** The cached bars, else SSI's (bars after `date` dropped), cached. Throws when SSI has no bars for `sym`. */
export const fetchBars = async (date, sym, {days = 420, force = false} = {}) => {
  const hit = force ? null : readBars(date, sym);
  if (hit) return hit;
  const {bars} = await ssiDaily(sym, daysBefore(date, days));
  const kept = bars.filter((b) => b.t <= date && Number.isFinite(b.c) && b.c > 0);
  const f = fileOf(date, sym);
  mkdirSync(dirname(f), {recursive: true});
  writeFileSync(f, JSON.stringify(kept.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v])));
  return kept;
};

/** % change of the week holding `date`: its close against the last close before that week's Monday. */
export const weekChangePercent = (bars, date) => {
  if (!bars?.length) return null;
  const i = bars.findIndex((b) => b.t === date);
  if (i < 0) return null;
  const from = weekStart(date);
  let k = i - 1;
  while (k >= 0 && bars[k].t >= from) k--;
  return k >= 0 ? (bars[i].c / bars[k].c - 1) * 100 : null;
};
