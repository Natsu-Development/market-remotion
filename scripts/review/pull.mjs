#!/usr/bin/env node
/**
 * Pulls one session's data for the market-review reels.
 *
 *   node scripts/review/pull.mjs                  the latest finished session
 *   node scripts/review/pull.mjs --no-screener    index history only (offline work on the engine)
 *   node scripts/review/pull.mjs --as-of=2026-09-29 --no-screener   a past session (the screener has no history)
 *
 * 1. VNINDEX daily bars since rules.market.historyFrom from SSI iBoard (GET, no auth); a bar
 *    of today fetched before 15:00 ICT is dropped.            -> content/review/vnindex.daily.json
 * 2. Freshness gate: GET /api/stocks/cache-info must be stamped after this session's close and
 *    before the next session opens. Otherwise exit 2 — a reel from the morning's cache would
 *    compare half a day's volume with full days.
 * 3. GET /api/config/{id} -> the user's saved filters (metrics_filter ONLY; the rest of that
 *    object holds their Telegram token and is dropped unread).  -> content/review/filters.json
 * 4. POST /api/stocks/filter — the one POST this skill sends (user, 2026-09-29): the universe
 *    ({match: "and"}, what the Screener sends on load), then each saved filter a scene uses.
 *    The server's result lists are authoritative; a local evaluation of the same conditions on
 *    the universe rows cross-checks them and settles whether volume_vs_sma is a ratio or a %.
 * 5. Ranks the scene picks (rules.screener.scenes) and GETs /api/analyze for each leader.
 *                                            -> content/review/snapshots/<date>.json, analyze/<date>/
 *
 * Exit codes: 0 pulled, 2 stale cache / bad environment.
 */
import {PATHS, cli, configId, die, finishedBars, ict, ictInstant, round, rules, ssiDaily, writeJson, writeRows, zionle} from './lib/common.mjs';

const {flag, opt} = cli();
const R = rules();
const now = new Date();
const log = (...a) => console.log(...a);

// ------------------------------------------------------------------ 1. index history

const {url: ssiUrl, bars: raw} = await ssiDaily(R.market.index, R.market.historyFrom, now).catch((e) => die(`SSI: ${e.message}`));
let {bars, dropped} = finishedBars(raw, now);
const latest = bars[bars.length - 1].t;
const asOf = opt('as-of');
if (asOf) {
  bars = bars.filter((b) => b.t <= asOf);
  if (bars[bars.length - 1]?.t !== asOf) die(`--as-of=${asOf}: no VNINDEX session on that date (last before it: ${bars[bars.length - 1]?.t})`);
}
const session = bars[bars.length - 1].t;
writeRows(PATHS.daily, bars);
writeJson(PATHS.daily.replace(/\.json$/, '.meta.json'), {
  source: R.market.source,
  sourceLabel: R.market.sourceLabel,
  symbol: R.market.index,
  resolution: 'daily',
  reconstructed: false,
  url: ssiUrl.replace(/&to=\d+/, ''),
  from: bars[0].t,
  to: session,
  bars: bars.length,
  fetchedAt: now.toISOString(),
  droppedIntraday: dropped,
  volumeUnit: 'matched shares per session',
});
log(`VNINDEX  ${bars.length} sessions ${bars[0].t} → ${session}${dropped ? ` (dropped ${dropped}: still trading at ${ict(now).hm} ICT)` : ''}`);

if (flag('no-screener')) {
  log('screener skipped (--no-screener)');
  process.exit(0);
}
if (asOf && asOf !== latest) {
  die(`--as-of=${asOf}: the screener only knows the latest session (${latest}) — add --no-screener for a past date`);
}

// ------------------------------------------------------------------ 2. freshness gate

const info = await zionle('/api/stocks/cache-info', {withId: false}).catch((e) => die(`terminal: ${e.message}`));
const cachedAt = new Date(info.cached_at);
const close = ictInstant(session, R.screener.freshAfter);
const c = ict(cachedAt);
// A stamp from a LATER session's trading hours is as wrong as one from this session's morning.
const laterSession = c.date > session && c.dow >= 1 && c.dow <= 5 && c.hm >= '09:00';
if (!(cachedAt >= close) || laterSession) {
  die(
    `screener cache is stamped ${c.date} ${c.hm} ICT, but the ${session} session closes ${R.screener.freshAfter} ICT` +
      (laterSession ? ' and the stamp belongs to a later session' : '') +
      `.\n  The filter rows would not be end-of-day ${session}. Wait for the terminal's post-close refresh ` +
      '(15:04 on 2026-09-29) and run again. This skill never POSTs /stocks/recompute.',
  );
}
log(`screener cache ${c.date} ${c.hm} ICT, ${info.total_stocks} stocks — fresh for ${session}`);

// ------------------------------------------------------------------ 3. saved filters

const config = await zionle(`/api/config/${encodeURIComponent(configId())}`, {withId: false}).catch((e) => die(`terminal: ${e.message}`));
const pick = ({name, match, negate, conditions, groups, exchanges}) => ({name, match, ...(negate ? {negate} : {}), ...(conditions ? {conditions} : {}), ...(groups ? {groups} : {}), ...(exchanges ? {exchanges} : {})});
const saved = (config.metrics_filter ?? []).map(pick);
writeJson(PATHS.filters, {fetchedAt: now.toISOString(), _note: 'names and conditions only, taken from GET /api/config/{id}.metrics_filter', filters: saved});
const needed = [...new Set(Object.values(R.screener.scenes).flatMap((s) => [...s.filters, s.photo]))];
const missing = needed.filter((n) => !saved.some((f) => f.name === n));
if (missing.length) die(`saved filter(s) not in the terminal config: ${missing.join(', ')}. Saved: ${saved.map((f) => f.name).join(', ')}`);

// ------------------------------------------------------------------ 4. screener

const body = (f) => {
  const {name, ...rest} = f;
  return rest;
};
const universe = (await zionle(R.screener.endpoint, {body: R.screener.universeBody}).catch((e) => die(`terminal: ${e.message}`))).stocks ?? [];
if (!universe.length) die('the universe query returned no stocks');
writeJson(`${PATHS.cache}/${session}-universe.json`, {cachedAt: info.cached_at, stocks: universe});

const server = {};
for (const name of needed) {
  const f = saved.find((x) => x.name === name);
  const res = await zionle(R.screener.endpoint, {body: body(f)}).catch((e) => die(`terminal (${name}): ${e.message}`));
  server[name] = (res.stocks ?? []).map((s) => s.symbol);
}

/** One saved condition against one row, the way the terminal's QueryBuilder states it. */
const fieldOf = (row, field, unit) => {
  if (field === 'volume_vs_sma') {
    if (!(row.volume_sma20 > 0)) return NaN;
    return unit === 'ratio' ? row.current_volume / row.volume_sma20 : ((row.current_volume - row.volume_sma20) / row.volume_sma20) * 100;
  }
  const v = row[field];
  return typeof v === 'boolean' ? Number(v) : Number(v);
};
const OPS = {'>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '=': (a, b) => a === b};
const holds = (cond, row, unit) => {
  const a = fieldOf(row, cond.field, unit);
  const b = cond.rhs_field !== undefined ? fieldOf(row, cond.rhs_field, unit) : Number(cond.value === true ? 1 : cond.value);
  return Number.isFinite(a) && Number.isFinite(b) && OPS[cond.op]?.(a, b);
};
const evaluate = (f, row, unit) => {
  const parts = [...(f.conditions ?? []).map((cnd) => holds(cnd, row, unit)), ...(f.groups ?? []).map((g) => evaluate(g, row, unit))];
  const ok = f.match === 'or' ? parts.some(Boolean) : parts.every(Boolean);
  return f.negate ? !ok : ok;
};
const agreement = (a, b) => {
  const A = new Set(a), B = new Set(b);
  const both = [...A].filter((x) => B.has(x)).length;
  const any = new Set([...A, ...B]).size;
  return any ? round(both / any, 3) : 1;
};
const usesVolumeVsSma = (f) => JSON.stringify(f).includes('volume_vs_sma');
const units = {};
const agree = {};
for (const name of needed) {
  const f = saved.find((x) => x.name === name);
  const tries = usesVolumeVsSma(f) ? ['ratio', 'percent'] : ['ratio'];
  const scored = tries.map((u) => ({u, a: agreement(universe.filter((row) => evaluate(f, row, u)).map((row) => row.symbol), server[name])}));
  scored.sort((x, y) => y.a - x.a);
  agree[name] = scored[0].a;
  if (usesVolumeVsSma(f)) units[name] = scored[0].u;
}
const volumeVsSmaUnit = Object.values(units)[0] ?? null;

// ------------------------------------------------------------------ 5. picks

const bySymbol = new Map(universe.map((s) => [s.symbol, s]));
const maOk = (s) => !R.screener.dropZeroMa || (s.ema_50 > 0 && s.sma_200 > 0);
const volumeRatio = (s) => (s.volume_sma20 > 0 ? s.current_volume / s.volume_sma20 : null);
const sortKey = {volumeRatio: (s) => volumeRatio(s) ?? -Infinity, rs_1m: (s) => s.rs_1m ?? -Infinity};
const picks = {};
const members = {};
for (const [scene, spec] of Object.entries(R.screener.scenes)) {
  const sets = spec.filters.map((n) => new Set(server[n]));
  const inAll = [...sets[0]].filter((sym) => sets.every((s) => s.has(sym)));
  // A moving average of 0 means "not computable yet" (new listing), not "below the price".
  const usesMa = spec.filters.some((n) => /"(?:rhs_)?field":"(?:ema|sma)_/.test(JSON.stringify(saved.find((f) => f.name === n))));
  const rows = inAll.map((sym) => bySymbol.get(sym)).filter(Boolean).filter((s) => !usesMa || maOk(s));
  rows.sort((a, b) => sortKey[spec.sortBy](b) - sortKey[spec.sortBy](a) || a.symbol.localeCompare(b.symbol));
  members[scene] = rows.map((s) => s.symbol);
  picks[scene] = rows.slice(0, spec.top).map((s) => s.symbol);
}

const keep = new Set([...Object.values(members).flat()]);
const compact = (s) => ({
  name: s.name ?? null, exchange: s.exchange ?? null,
  price: s.current_price, changePercent: s.price_change_pct,
  volume: s.current_volume, volumeSma20: s.volume_sma20, volumeRatio: volumeRatio(s) == null ? null : round(volumeRatio(s), 4),
  rs_1m: s.rs_1m, rs_3m: s.rs_3m, rs_6m: s.rs_6m, rs_9m: s.rs_9m, rs_52w: s.rs_52w,
  ema_9: s.ema_9, ema_21: s.ema_21, ema_50: s.ema_50, sma_200: s.sma_200,
  signals: Object.fromEntries(Object.entries(s).filter(([k, v]) => k.startsWith('has_') && v)),
});
const breadth = {
  universe: universe.length,
  aboveEma50: universe.filter((s) => s.ema_50 > 0 && s.current_price > s.ema_50).length,
  aboveSma200: universe.filter((s) => s.sma_200 > 0 && s.current_price > s.sma_200).length,
  up: universe.filter((s) => s.price_change_pct > 0).length,
  down: universe.filter((s) => s.price_change_pct < 0).length,
};

// ------------------------------------------------------------------ leaders' charts (GET)

const analyzed = {};
for (const sym of [...new Set(Object.values(picks).flat())]) {
  if (!picks.leaders?.includes(sym)) continue;
  const a = await zionle(`/api/analyze/${encodeURIComponent(sym)}?interval=1D`).catch((e) => {
    console.warn(`  /analyze ${sym}: ${e.message}`);
    return null;
  });
  if (!a) continue;
  const rel = `${PATHS.analyze}/${session}/${sym}.json`;
  writeJson(rel, {
    symbol: sym, fetchedAt: new Date().toISOString(), timestamp: a.timestamp ?? null,
    _units: 'prices in thousands of VND (the terminal quotes stocks that way); volume in shares',
    price_history: (a.price_history ?? []).map((b) => ({t: b.date, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume, rsi: b.rsi})),
    signals: a.signals ?? [], trendlines: a.trendlines ?? [], divergences: a.divergences ?? [],
  });
  analyzed[sym] = rel;
}

const snapshot = {
  date: session,
  cachedAt: info.cached_at,
  fetchedAt: now.toISOString(),
  universe: universe.length,
  volumeVsSmaUnit,
  agreement: agree,
  _agreement: 'share of symbols the server and a local evaluation of the same saved conditions agree on (1 = identical lists)',
  filters: Object.fromEntries(needed.map((n) => [n, {count: server[n].length, symbols: server[n]}])),
  members,
  picks,
  breadth,
  analyze: analyzed,
  rows: Object.fromEntries([...keep].sort().map((sym) => [sym, compact(bySymbol.get(sym))])),
};
const snapRel = writeJson(`${PATHS.snapshots}/${session}.json`, snapshot);

log(`filters  ${needed.map((n) => `${n} ${server[n].length} (local agree ${agree[n]})`).join(' · ')}`);
log(`         volume_vs_sma reads as a ${volumeVsSmaUnit ?? '?'}`);
for (const [scene, list] of Object.entries(picks)) log(`${scene.padEnd(8)} ${members[scene].length} names · top ${list.join(', ') || '—'}`);
log(`breadth  ${breadth.up} up · ${breadth.down} down · ${breadth.aboveSma200}/${breadth.universe} above SMA200`);
log(`wrote    ${PATHS.daily}, ${PATHS.filters}, ${snapRel}${Object.keys(analyzed).length ? `, ${PATHS.analyze}/${session}/` : ''}`);

