#!/usr/bin/env node
/**
 * Pulls one session's data for the market-review reels.
 *
 *   node scripts/review/pull.mjs                  the latest finished session
 *   node scripts/review/pull.mjs --no-screener    index history only (offline work on the engine)
 *   node scripts/review/pull.mjs --as-of=2026-09-29 --no-screener   a past session (the screener has no history)
 *   node scripts/review/pull.mjs --rebuild        re-rank the latest snapshot from its cached universe, no network
 *                                                 (after a rules.screener change; --as-of=<date> for an older one)
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
 * 5. Ranks each table scene's picks (rules.screener.scenes — one saved filter per scene, sorted by
 *    its own column; user 2026-09-30: RS Strong and Uptrend are two scenes, not an intersection)
 *    and the chart countdown (rules.screener.leaders: the top names of one scene, or of the names
 *    in every listed scene), then GETs /api/analyze for each leader.
 * 6. Reads FireAnt's public market page for the session's advancers/unchanged/decliners per exchange
 *    (headless shell, no sign-in); kept only when the page shows this session's close. --no-fireant skips.
 *                                            -> content/review/snapshots/<date>.json, analyze/<date>/
 *
 * --rebuild skips every network step: the bars on disk, content/review/filters.json, the cached
 * universe (.review-cache/<date>-universe.json) and the server's filter lists already in that
 * session's snapshot are reused, so a rules change re-ranks a past session's picks without asking
 * the terminal again (it keeps no history). A leader whose /analyze file was never pulled is
 * reported, not fetched; the FireAnt count is carried over.
 *
 * Exit codes: 0 pulled, 2 stale cache / bad environment.
 */
import {PATHS, cli, configId, die, exists, finishedBars, ict, ictInstant, readJson, round, rules, ssiDaily, tryJson, writeJson, writeRows, zionle} from './lib/common.mjs';
import {fetchFireantBreadth, matchesSession} from './lib/fireant.mjs';

const {flag, opt} = cli();
const R = rules();
const now = new Date();
const log = (...a) => console.log(...a);
const REBUILD = flag('rebuild');
const asOf = opt('as-of');

// ------------------------------------------------------------------ 1. index history

let bars;
let session;
if (REBUILD) {
  if (!exists(PATHS.daily)) die(`--rebuild needs ${PATHS.daily} from an earlier online pull`);
  bars = readJson(PATHS.daily);
  if (asOf) bars = bars.filter((b) => b.t <= asOf);
  session = bars[bars.length - 1]?.t ?? die(`${PATHS.daily} holds no session${asOf ? ` up to ${asOf}` : ''}`);
  if (asOf && session !== asOf) die(`--as-of=${asOf}: no VNINDEX session on that date (last before it: ${session})`);
  log(`VNINDEX  ${bars.length} sessions on disk → ${session} (--rebuild: nothing fetched)`);
} else {
  const {url: ssiUrl, bars: raw} = await ssiDaily(R.market.index, R.market.historyFrom, now).catch((e) => die(`SSI: ${e.message}`));
  const finished = finishedBars(raw, now);
  bars = finished.bars;
  const latest = bars[bars.length - 1].t;
  if (asOf) {
    bars = bars.filter((b) => b.t <= asOf);
    if (bars[bars.length - 1]?.t !== asOf) die(`--as-of=${asOf}: no VNINDEX session on that date (last before it: ${bars[bars.length - 1]?.t})`);
  }
  session = bars[bars.length - 1].t;
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
    droppedIntraday: finished.dropped,
    volumeUnit: 'matched shares per session',
  });
  log(`VNINDEX  ${bars.length} sessions ${bars[0].t} → ${session}${finished.dropped ? ` (dropped ${finished.dropped}: still trading at ${ict(now).hm} ICT)` : ''}`);

  if (flag('no-screener')) {
    log('screener skipped (--no-screener)');
    process.exit(0);
  }
  if (asOf && asOf !== latest) {
    die(`--as-of=${asOf}: the screener only knows the latest session (${latest}) — add --no-screener for a past date, or --rebuild to re-rank its snapshot`);
  }
}

// ------------------------------------------------------------------ 2–4. cache stamp, saved filters, universe, filter lists

const needed = [...new Set(Object.values(R.screener.scenes).flatMap((s) => [...s.filters, s.photo]))];
const pick = ({name, match, negate, conditions, groups, exchanges}) => ({name, match, ...(negate ? {negate} : {}), ...(conditions ? {conditions} : {}), ...(groups ? {groups} : {}), ...(exchanges ? {exchanges} : {})});
let info;
let saved;
let universe;
const server = {};
let prior = null;

if (REBUILD) {
  prior = tryJson(`${PATHS.snapshots}/${session}.json`) ?? die(`--rebuild: no snapshot for ${session} at ${PATHS.snapshots}/${session}.json`);
  const cached = tryJson(`${PATHS.cache}/${session}-universe.json`) ?? die(`--rebuild: no cached universe at ${PATHS.cache}/${session}-universe.json (an online pull writes it; the directory is git-ignored)`);
  universe = cached.stocks ?? [];
  if (!universe.length) die(`--rebuild: the cached universe for ${session} is empty`);
  info = {cached_at: cached.cachedAt ?? prior.cachedAt, total_stocks: universe.length};
  saved = (tryJson(PATHS.filters)?.filters ?? die(`--rebuild: no ${PATHS.filters} — it is written by an online pull`)).map(pick);
  for (const name of needed) {
    const f = prior.filters?.[name];
    if (!f) die(`--rebuild: the ${session} snapshot has no server list for "${name}" — that filter was never pulled; run pull.mjs online after the next close`);
    server[name] = f.symbols;
  }
  const c = ict(new Date(info.cached_at));
  log(`screener cache ${c.date} ${c.hm} ICT, ${universe.length} stocks — reused from ${PATHS.cache}/${session}-universe.json`);
} else {
  info = await zionle('/api/stocks/cache-info', {withId: false}).catch((e) => die(`terminal: ${e.message}`));
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

  const config = await zionle(`/api/config/${encodeURIComponent(configId())}`, {withId: false}).catch((e) => die(`terminal: ${e.message}`));
  saved = (config.metrics_filter ?? []).map(pick);
  writeJson(PATHS.filters, {fetchedAt: now.toISOString(), _note: 'names and conditions only, taken from GET /api/config/{id}.metrics_filter', filters: saved});
}
const missing = needed.filter((n) => !saved.some((f) => f.name === n));
if (missing.length) die(`saved filter(s) not in the terminal config: ${missing.join(', ')}. Saved: ${saved.map((f) => f.name).join(', ')}`);

if (!REBUILD) {
  const body = (f) => {
    const {name, ...rest} = f;
    return rest;
  };
  universe = (await zionle(R.screener.endpoint, {body: R.screener.universeBody}).catch((e) => die(`terminal: ${e.message}`))).stocks ?? [];
  if (!universe.length) die('the universe query returned no stocks');
  writeJson(`${PATHS.cache}/${session}-universe.json`, {cachedAt: info.cached_at, stocks: universe});
  for (const name of needed) {
    const f = saved.find((x) => x.name === name);
    const res = await zionle(R.screener.endpoint, {body: body(f)}).catch((e) => die(`terminal (${name}): ${e.message}`));
    server[name] = (res.stocks ?? []).map((s) => s.symbol);
  }
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
const ranked = (rows, by) => {
  const key = sortKey[by] ?? die(`unknown sortBy "${by}" — one of ${Object.keys(sortKey).join(', ')}`);
  return [...rows].sort((a, b) => key(b) - key(a) || a.symbol.localeCompare(b.symbol));
};
const picks = {};
const members = {};
for (const [scene, spec] of Object.entries(R.screener.scenes)) {
  const sets = spec.filters.map((n) => new Set(server[n]));
  const inAll = [...sets[0]].filter((sym) => sets.every((s) => s.has(sym)));
  // A moving average of 0 means "not computable yet" (new listing), not "below the price".
  const usesMa = spec.filters.some((n) => /"(?:rhs_)?field":"(?:ema|sma)_/.test(JSON.stringify(saved.find((f) => f.name === n))));
  const rows = ranked(inAll.map((sym) => bySymbol.get(sym)).filter(Boolean).filter((s) => !usesMa || maOk(s)), spec.sortBy);
  members[scene] = rows.map((s) => s.symbol);
  picks[scene] = rows.slice(0, spec.top).map((s) => s.symbol);
}

// The chart countdown (rules.screener.leaders): the ranked names of ONE table scene, or the names
// in every scene of a list (["rs", "uptrend"] = the RS Strong ∩ Uptrend the reel showed before
// 2026-09-30). Their charts draw an EMA50 line, so a name without averages is never a leader.
const L = R.screener.leaders ?? {from: 'uptrend', sortBy: 'rs_1m', top: 3};
const leaderFrom = [].concat(L.from);
for (const k of leaderFrom) if (!members[k]) die(`rules.screener.leaders.from names "${k}", which is not a scene in rules.screener.scenes (${Object.keys(R.screener.scenes).join(', ')})`);
const pool = members[leaderFrom[0]].filter((sym) => leaderFrom.every((k) => members[k].includes(sym)));
const leaderRows = ranked(pool.map((sym) => bySymbol.get(sym)).filter((s) => s && maOk(s)), L.sortBy ?? 'rs_1m');
members.leaders = leaderRows.map((s) => s.symbol);
picks.leaders = members.leaders.slice(0, L.top ?? 3);

const keep = new Set([...Object.values(members).flat()]);
const compact = (s) => ({
  name: s.name ?? null, exchange: s.exchange ?? null,
  price: s.current_price, changePercent: s.price_change_pct,
  volume: s.current_volume, volumeSma20: s.volume_sma20, volumeRatio: volumeRatio(s) == null ? null : round(volumeRatio(s), 4),
  rs_1m: s.rs_1m, rs_3m: s.rs_3m, rs_6m: s.rs_6m, rs_9m: s.rs_9m, rs_52w: s.rs_52w,
  ema_9: s.ema_9, ema_21: s.ema_21, ema_50: s.ema_50, sma_200: s.sma_200,
  signals: Object.fromEntries(Object.entries(s).filter(([k, v]) => k.startsWith('has_') && v)),
});
// A moving average of 0 means the server could not compute it (new listing), so the shares are
// taken among the stocks that have one.
const withEma50 = universe.filter((s) => s.ema_50 > 0);
const withSma200 = universe.filter((s) => s.sma_200 > 0);
const breadth = {
  universe: universe.length,
  withEma50: withEma50.length,
  aboveEma50: withEma50.filter((s) => s.current_price > s.ema_50).length,
  withSma200: withSma200.length,
  aboveSma200: withSma200.filter((s) => s.current_price > s.sma_200).length,
  up: universe.filter((s) => s.price_change_pct > 0).length,
  down: universe.filter((s) => s.price_change_pct < 0).length,
};

// ------------------------------------------------------------------ leaders' charts (GET)

const analyzed = {};
for (const sym of picks.leaders) {
  const rel = `${PATHS.analyze}/${session}/${sym}.json`;
  if (REBUILD) {
    if (exists(rel)) analyzed[sym] = rel;
    else console.warn(`  /analyze ${sym}: not on disk (${rel}) — --rebuild fetches nothing; the leader scene will have no chart until an online pull`);
    continue;
  }
  const a = await zionle(`/api/analyze/${encodeURIComponent(sym)}?interval=1D`).catch((e) => {
    console.warn(`  /analyze ${sym}: ${e.message}`);
    return null;
  });
  if (!a) continue;
  writeJson(rel, {
    symbol: sym, fetchedAt: new Date().toISOString(), timestamp: a.timestamp ?? null,
    _units: 'prices in thousands of VND (the terminal quotes stocks that way); volume in shares',
    price_history: (a.price_history ?? []).map((b) => ({t: b.date, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume, rsi: b.rsi})),
    signals: a.signals ?? [], trendlines: a.trendlines ?? [], divergences: a.divergences ?? [],
  });
  analyzed[sym] = rel;
}

// ------------------------------------------------------------------ FireAnt advance/decline

let fireant = null;
if (REBUILD) {
  fireant = prior.fireant ?? null;
  log(fireant ? 'fireant  count carried over from the snapshot (--rebuild)' : 'fireant  no count in the snapshot — the terminal counts are used');
} else if (!flag('no-fireant')) {
  const fa = fetchFireantBreadth(`${PATHS.cache}/${session}-fireant-thitruong.png`);
  fireant = fa ? {...fa, matchesSession: matchesSession(fa, bars[bars.length - 1].c)} : null;
  const h = fireant?.exchanges?.HSX;
  log(fireant
    ? `fireant  HSX ▲${h?.up} ●${h?.flat} ▼${h?.down} at VN-INDEX ${h?.index} — ${fireant.matchesSession ? 'this session' : 'NOT this session (live/later value); the terminal counts are used'}`
    : 'fireant  market page not readable — the terminal counts are used');
}

const snapshot = {
  date: session,
  cachedAt: info.cached_at,
  fetchedAt: REBUILD ? prior.fetchedAt ?? now.toISOString() : now.toISOString(),
  ...(REBUILD ? {rebuiltAt: now.toISOString(), _rebuilt: 'picks re-ranked offline from the cached universe and the server lists below (pull.mjs --rebuild)'} : {}),
  universe: universe.length,
  volumeVsSmaUnit,
  agreement: agree,
  _agreement: 'share of symbols the server and a local evaluation of the same saved conditions agree on (1 = identical lists)',
  filters: Object.fromEntries(needed.map((n) => [n, {count: server[n].length, symbols: server[n]}])),
  members,
  picks,
  leaders: {from: leaderFrom, sortBy: L.sortBy ?? 'rs_1m', top: L.top ?? 3},
  breadth,
  analyze: analyzed,
  fireant,
  rows: Object.fromEntries([...keep].sort().map((sym) => [sym, compact(bySymbol.get(sym))])),
};
const snapRel = writeJson(`${PATHS.snapshots}/${session}.json`, snapshot);

log(`filters  ${needed.map((n) => `${n} ${server[n].length} (local agree ${agree[n]})`).join(' · ')}`);
log(`         volume_vs_sma reads as a ${volumeVsSmaUnit ?? '?'}`);
for (const [scene, list] of Object.entries(picks)) log(`${scene.padEnd(8)} ${members[scene].length} names · top ${list.join(', ') || '—'}${scene === 'leaders' ? ` (from ${leaderFrom.join(' ∩ ')}, by ${L.sortBy ?? 'rs_1m'})` : ''}`);
log(`breadth  ${breadth.up} up · ${breadth.down} down · ${breadth.aboveSma200}/${breadth.universe} above SMA200`);
log(`wrote    ${REBUILD ? '' : `${PATHS.daily}, ${PATHS.filters}, `}${snapRel}${Object.keys(analyzed).length && !REBUILD ? `, ${PATHS.analyze}/${session}/` : ''}`);
