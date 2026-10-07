#!/usr/bin/env node
/**
 * The fact pack of one market-review edition: every number that may reach the screen.
 *
 *   node scripts/review/facts.mjs --format=daily            latest pulled session
 *   node scripts/review/facts.mjs --format=weekly --date=2026-10-02
 *   node scripts/review/facts.mjs --format=daily --date=2026-10-02 --out=content/review/archive/2026-10-02-daily.facts.json
 *                                                           a past session's pack, the live one untouched
 *
 * Reads content/review/vnindex.daily.json, the session's snapshot (and, for the weekly
 * edition, the week's snapshots), the leaders' /analyze files and rules.json; writes
 * content/review-<format>.facts.json.
 *
 * Deliberately lean. verify's facts check accepts a number on screen when ANY number in the
 * pack rounds to it at the shown precision, so a pack holding a year of prices would trace
 * almost anything. Histories stay in content/review/; only the figures a scene may show
 * come here, rounded the way they are shown.
 */
import {PATHS, cli, die, dm, dmy, exists, ict, readJson, round, rules, tryJson, weekStart, writeJson} from './lib/common.mjs';
import {analyze, backtest} from './lib/market-state.mjs';
import {citedNumbers, levelsOf, loadReview, reviewPath, swingsOf, validateReview} from './lib/symbol-review.mjs';
import {FLOW_PHOTO, flowFacts} from './lib/fireant-flow.mjs';
import {compactRow, readRequests, requestKey, requestsPath} from './lib/requested.mjs';
import {sectorFacts} from './lib/sectors.mjs';
import {structureOf} from './lib/symbol-review.mjs';
import {weeklyBars} from './lib/week-fireant.mjs';
import {readBars as readStockBars, weekChangePercent as stockWeekChange} from './lib/stock-bars.mjs';

const {opt, flag} = cli();
const R = rules();
const FORMAT = opt('format', 'daily');
const fmt = R.formats[FORMAT];
if (!fmt) die(`--format=${FORMAT}: one of ${Object.keys(R.formats).join(', ')}`);
if (!exists(PATHS.daily)) die(`no ${PATHS.daily} — run node scripts/review/pull.mjs first`);

const all = readJson(PATHS.daily);
const date = opt('date', all[all.length - 1].t);
const bars = all.filter((b) => b.t <= date);
if (bars[bars.length - 1].t !== date) die(`no VNINDEX session on ${date}`);
const P = {distribution: R.distribution, followThrough: R.followThrough};
const st = analyze(bars, P);
const T = bars.length - 1;
const last = bars[T];
const prev = bars[T - 1];

const snap = tryJson(`${PATHS.snapshots}/${date}.json`);
if (!snap) die(`no screener snapshot for ${date} — run node scripts/review/pull.mjs after the post-close refresh`);

const pct = (a, b) => (a / b - 1) * 100;
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const label = (s) => R.status[s];

// ------------------------------------------------------------------ session and distribution

const avg20 = avg(bars.slice(T - 20, T).map((b) => b.v));
// The stretch the reel looks at: the last 60 sessions. (It used to start where the SMA200 breadth line started —
// content/review/breadth.json, ~55 sessions — until the user replaced that scene with FireAnt's chart, 2026-10-05.)
const winBars = bars.slice(-60);
const hiBar = winBars.reduce((m, b) => (b.h > m.h ? b : m), winBars[0]);
const loBar = winBars.reduce((m, b) => (b.l < m.l ? b : m), winBars[0]);
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const session = {
  date, dm: dm(date), dmy: dmy(date),
  /** "Thứ Ba" — the hook opens on the session's day (user, 2026-09-30). */
  weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
  /** The stretch the reel looks at: its range and its net move, for a hook that speaks plainly. */
  window: {
    sessions: winBars.length, from: winBars[0].t, fromDm: dm(winBars[0].t),
    high: round(hiBar.h, 2), highDm: dm(hiBar.t), low: round(loBar.l, 2), lowDm: dm(loBar.t),
    firstClose: round(winBars[0].c, 2), changePercent: round(pct(last.c, winBars[0].c), 1),
    positionPercent: round((100 * (last.c - loBar.l)) / (hiBar.h - loBar.l), 0),
  },
  close: round(last.c, 2), prevClose: round(prev.c, 2),
  change: round(last.c - prev.c, 2), changePercent: round(pct(last.c, prev.c), 2),
  high: round(last.h, 2), low: round(last.l, 2),
  volumeM: round(last.v / 1e6, 1), volumeRatio: round(last.v / prev.v, 2), volumeVsAvg20: round(last.v / avg20, 2),
  isDistribution: st.today.isDistribution, isFtd: st.today.isFtd,
  /** Advancers and decliners of the session, per exchange, from the screener's universe (the hook's opener). */
  breadthToday: (() => {
    const uni = tryJson(`${PATHS.cache}/${date}-universe.json`)?.stocks ?? [];
    const per = {};
    for (const s of uni) {
      const e = s.exchange || '?';
      per[e] ??= {up: 0, down: 0, flat: 0, total: 0};
      per[e].total++;
      if (s.price_change_pct > 0) per[e].up++; else if (s.price_change_pct < 0) per[e].down++; else per[e].flat++;
    }
    const all = Object.values(per).reduce((a, x) => ({up: a.up + x.up, down: a.down + x.down, flat: a.flat + x.flat, total: a.total + x.total}), {up: 0, down: 0, flat: 0, total: 0});
    const term = per.HOSE ? {exchange: 'HOSE', ...per.HOSE, source: 'zionle.io.vn screener, price_change_pct per stock'} : null;
    // FireAnt's own count for the session (▲ ● ▼ next to VN-INDEX on fireant.vn/thi-truong) leads
    // when pull.mjs saw the page showing this session's close; the terminal's count is the fallback.
    const fa = snap.fireant?.matchesSession ? snap.fireant.exchanges?.HSX : null;
    // FireAnt labels the exchange HSX; the screen says HOSE (and verify's ticker scan knows HOSE, not HSX).
    const h = fa ? {exchange: 'HOSE', up: fa.up, down: fa.down, flat: fa.flat, total: fa.total, source: 'fireant.vn/thi-truong'} : term;
    // The words the hook may use for the day, decided by the numbers, not by mood.
    const c = last.c / prev.c - 1;
    const indexWord = Math.abs(c) < 0.003 ? 'đi ngang' : c > 0.01 ? 'tăng mạnh' : c > 0 ? 'tăng' : c < -0.01 ? 'giảm mạnh' : 'giảm';
    const ratio = h && h.up ? h.down / h.up : null;
    const breadthWord = !h ? null
      : h.down >= h.total * 0.6 ? 'phần lớn cổ phiếu đi xuống'
      : h.up >= h.total * 0.6 ? 'phần lớn cổ phiếu đi lên'
      : ratio >= 1.15 ? 'mã giảm nhiều hơn mã tăng'
      : ratio <= 1 / 1.15 ? 'mã tăng nhiều hơn mã giảm'
      : 'mã tăng giảm cân bằng';
    return {...(h ?? {}), all, indexWord, breadthWord, downUpRatio: ratio == null ? null : round(ratio, 2), screener: term, fireant: fa ?? null};
  })(),
};

const dd = st.distribution.active.map((d) => ({
  date: d.t, dm: dm(d.t),
  changePercent: round(d.changePercent, 2), volumeRatio: round(d.volumeRatio, 2), close: round(d.close, 2),
  sessionsLeft: d.sessionsLeft, expireLevel: round(d.expireLevel, 2),
}));
const nextExpiry = [...dd].sort((a, b) => a.sessionsLeft - b.sessionsLeft)[0] ?? null;
const lowestExpireLevel = dd.length ? Math.min(...dd.map((d) => d.expireLevel)) : null;
const distribution = {
  count: st.distribution.count,
  window: R.distribution.windowSessions,
  active: dd,
  nextExpiry,
  lowestExpireLevel,
  toUnderPressure: Math.max(0, R.distribution.underPressureAt - st.distribution.count),
  toCorrection: Math.max(0, R.distribution.correctionAt - st.distribution.count),
  // The user's danger level (rules.distribution.dangerAt, 2026-10-01: five DDs "is dangerous and must warning and
  // re-check the symbol and risk"): a warning tier while the uptrend stands, not a state of the machine.
  dangerAt: R.distribution.dangerAt ?? null,
  toDanger: R.distribution.dangerAt == null ? null : Math.max(0, R.distribution.dangerAt - st.distribution.count),
  danger: R.distribution.dangerAt != null && st.distribution.count >= R.distribution.dangerAt && ['CONFIRMED_UPTREND', 'UNDER_PRESSURE'].includes(st.status),
};

const ftdOut = (f) => (f ? {
  date: f.t, dm: dm(f.t), dmy: dmy(f.t), day: f.day,
  changePercent: round(f.changePercent, 2), volumeRatio: round(f.volumeRatio, 2),
  close: round(f.close, 2), low: round(f.low, 2), rallyLow: round(f.rallyLow, 2),
  ...(f.ended ? {ended: {date: f.ended.t, dm: dm(f.ended.t), why: f.ended.why}} : {}),
} : null);
const state = {
  status: st.status,
  label: label(st.status).vi,
  short: label(st.status).short,
  since: st.since, sinceDm: dm(st.since),
  rallyDay: st.rallyDay,
  day1: st.day1 ? {date: st.day1, dm: dm(st.day1)} : null,
  rallyLow: st.rallyLow == null ? null : round(st.rallyLow, 2),
  correctionLow: st.correctionLow == null ? null : round(st.correctionLow, 2),
  ftd: ftdOut(st.ftd),
  lastFtd: ftdOut(st.lastFtd),
  distanceToRallyLowPercent: st.rallyLow == null ? null : round(pct(last.c, st.rallyLow), 1),
  sessionsSinceFtd: st.ftd ? T - bars.findIndex((b) => b.t === st.ftd.t) : null,
};

/** What would change the status next, in the machine's own terms (the market scene's "nếu … thì"). */
const watch = [];
if (st.status === 'CONFIRMED_UPTREND' || st.status === 'UNDER_PRESSURE') {
  // Thresholds still ahead, nearest first; a state already reached is the market scene's news, not a branch
  // ("thêm 0 phiên phân phối → chịu áp lực" used to sit here). Five DDs is the user's danger level.
  if (distribution.toUnderPressure > 0) watch.push({if: `thêm ${distribution.toUnderPressure} phiên phân phối`, then: label('UNDER_PRESSURE').vi, count: distribution.toUnderPressure});
  const DG = R.distribution.danger ?? {vi: 'Mức nguy hiểm', action: 'rà lại từng mã và rủi ro'};
  if (distribution.toDanger > 0) watch.push({if: `thêm ${distribution.toDanger} phiên phân phối`, then: `${DG.vi.toLowerCase()} (${distribution.dangerAt} phiên) — ${DG.action}`, count: distribution.toDanger, danger: true});
  watch.push({if: `thêm ${distribution.toCorrection} phiên phân phối`, then: label('CORRECTION').vi, count: distribution.toCorrection});
  watch.push({if: `thủng đáy nhịp hồi ${round(st.rallyLow, 2)}`, then: 'FTD thất bại', level: round(st.rallyLow, 2)});
  if (nextExpiry) watch.push({if: `qua ${nextExpiry.sessionsLeft} phiên nữa`, then: `phiên ${nextExpiry.dm} hết hạn`, sessions: nextExpiry.sessionsLeft});
} else if (st.status === 'RALLY_ATTEMPT') {
  watch.push({if: `từ ngày ${R.followThrough.minDay}, tăng từ ${R.followThrough.minChangePercent}% với khối lượng cao hơn`, then: 'FTD xác nhận xu hướng tăng'});
  watch.push({if: `thủng đáy ${round(st.rallyLow, 2)}`, then: 'nỗ lực hồi phục bắt đầu lại', level: round(st.rallyLow, 2)});
} else {
  watch.push({if: 'có một phiên đóng cửa tăng', then: 'ngày 1 của nỗ lực hồi phục'});
  watch.push({if: `thủng đáy ${round(st.correctionLow, 2)}`, then: 'đáy điều chỉnh mới', level: round(st.correctionLow, 2)});
}

// ------------------------------------------------------------------ screener

const rowOf = (sym) => ({symbol: sym, ...snap.rows[sym]});
/** The format's own screener scenes (rules.formats.<format>.screener.scenes — the weekly's Momentum breakout / breakdown,
 *  user 2026-10-06) and the spec of any scene key, the format's first. */
const ownScenes = fmt.screener?.scenes ?? {};
const sceneSpec = (k) => ownScenes[k] ?? R.screener.scenes[k];
// Only the saved filters of the scenes this edition shows (the daily's three; the weekly's two Momentum filters since
// 2026-10-06): the snapshot holds every filter any format pulls.
const shownFilters = new Set(Object.entries({...R.screener.scenes, ...ownScenes}).filter(([k]) => fmt.roles.includes(k)).flatMap(([, s]) => s.filters));
/** The saved filters a symbol passes today, from the server's own lists — so a scene may say "ở cả ba bộ lọc". */
const filtersOf = (sym) => Object.entries(snap.filters ?? {}).filter(([n, f]) => shownFilters.has(n) && (f.symbols ?? []).includes(sym)).map(([n]) => n);
const show = (r, rank) => ({
  rank, symbol: r.symbol, name: r.name, exchange: r.exchange,
  price: r.price, changePercent: round(r.changePercent, 2),
  volumeRatio: r.volumeRatio == null ? null : round(r.volumeRatio, 2),
  // The terminal's VOL/SMA: (volume − SMA20) / SMA20 × 100, whole percent, as the spike board prints it
  // (user 2026-10-01 evening: "the volume must be the percent with its volume avg 20").
  volumeVsSma20Percent: r.volume != null && r.volumeSma20 > 0 ? round(((r.volume - r.volumeSma20) / r.volumeSma20) * 100, 0) : null,
  rs1m: r.rs_1m, rs52w: r.rs_52w,
  filters: filtersOf(r.symbol),
});
const mv = R.screener.scenes.spike.movers ?? {gainers: 5, losers: 5};
const spikeRows = snap.members.spike.map(rowOf);
// The two spike columns (rules.screener.scenes.spike.movers). User 2026-10-01 evening: "sort by the price
// change percent: DESC and ASC for both column" — gainers from the biggest gain down, losers from the
// deepest fall up (movers.order). `sortBy: "rs_1m"` is the RS 1M board of earlier that day.
const byRs = (a, b) => (b.rs_1m ?? -1) - (a.rs_1m ?? -1) || a.symbol.localeCompare(b.symbol);
const moverSort = mv.sortBy ?? 'changePercent';
if (!['rs_1m', 'changePercent'].includes(moverSort)) die(`rules.screener.scenes.spike.movers.sortBy "${moverSort}" — one of rs_1m, changePercent`);
const moverOrder = {gainers: 'desc', losers: 'asc', ...(mv.order ?? {})};
const byChange = (dir) => (a, b) => (dir === 'asc' ? a.changePercent - b.changePercent : b.changePercent - a.changePercent) || a.symbol.localeCompare(b.symbol);
const gainersOrder = moverSort === 'rs_1m' ? byRs : byChange(moverOrder.gainers);
const losersOrder = moverSort === 'rs_1m' ? byRs : byChange(moverOrder.losers);
const spike = {
  filter: R.screener.scenes.spike.photo,
  count: snap.filters[R.screener.scenes.spike.photo].count,
  top: snap.picks.spike.map((s, i) => show(rowOf(s), i + 1)),
  up: spikeRows.filter((r) => r.changePercent > 0).length,
  down: spikeRows.filter((r) => r.changePercent < 0).length,
  flat: spikeRows.filter((r) => r.changePercent === 0).length,
  sortedBy: moverSort,
  /** Per column: desc = the biggest value first. RS 1M is always descending. */
  order: moverSort === 'rs_1m' ? {gainers: 'desc', losers: 'desc'} : {gainers: moverOrder.gainers, losers: moverOrder.losers},
  /** How a row's volume is printed: percentVsSma20 = the terminal's VOL/SMA in %, ratio = ×. */
  volumeUnit: mv.volume ?? 'ratio',
  /** The filter's gainers and losers for the movers board, up to movers.gainers / movers.losers each. */
  gainers: spikeRows.filter((r) => r.changePercent > 0).sort(gainersOrder).slice(0, mv.gainers).map((r, i) => show(r, i + 1)),
  losers: spikeRows.filter((r) => r.changePercent < 0).sort(losersOrder).slice(0, mv.losers).map((r, i) => show(r, i + 1)),
};

const leaderDetail = (sym, rank, r = rowOf(sym), analyzeRel = snap.analyze?.[sym]) => {
  const a = analyzeRel ? tryJson(analyzeRel) : null;
  const ph = a?.price_history ?? [];
  const year = ph.slice(-250);
  const sig = [...(a?.signals ?? [])].sort((x, y) => String(x.time).localeCompare(String(y.time))).pop() ?? null;
  return {
    ...show(r, rank),
    ema50: round(r.ema_50, 2), sma200: round(r.sma_200, 2),
    aboveEma50Percent: round(pct(r.price, r.ema_50), 1),
    aboveSma200Percent: round(pct(r.price, r.sma_200), 1),
    high52w: year.length ? round(Math.max(...year.map((b) => b.h)), 2) : null,
    fromHigh52wPercent: year.length ? round(pct(r.price, Math.max(...year.map((b) => b.h))), 1) : null,
    signal: sig ? {type: sig.type, price: round(sig.price, 2), date: String(sig.time).slice(0, 10), dm: dm(String(sig.time).slice(0, 10))} : null,
    chart: a ? {bars: ph.length, from: ph[0]?.t, to: ph[ph.length - 1]?.t} : null,
    ...fireantOf(sym, r.price),
  };
};
/**
 * The moving averages FireAnt itself draws on the pick's chart photo (user 2026-10-01: "The FireAnt also have the
 * MA50 and MA200 for this symbol refer it not need self-calculation"): the values scripts/review/fireant_ma.py read
 * off public/shots/review/<date>/<sym>-fireant.png — on the edition's candle — and the price's distance to them.
 * Nothing is averaged here; a value FireAnt did not show stays null. shots.mjs writes the reading after facts.mjs ran
 * once — run facts.mjs again after the shots so the labels on the leader charts trace.
 */
function fireantOf(sym, price) {
  const m = tryJson(`public/shots/review/${date}/${sym.toLowerCase()}-fireant.ma.json`);
  if (!m?.ma) return {};
  const v50 = m.ma.ma50?.value ?? null;
  const v200 = m.ma.ma200?.value ?? null;
  return {
    fireant: {
      ma50: v50, ma200: v200,
      aboveMa50Percent: v50 ? round(pct(price, v50), 1) : null,
      aboveMa200Percent: v200 ? round(pct(price, v200), 1) : null,
      photo: `shots/review/${date}/${sym.toLowerCase()}-fireant.png`,
      source: 'fireant.vn (legend / price-scale tags, OCR)',
      asOf: m.hoverCheck ? {date, closeRead: m.hoverCheck.readClose, ok: m.hoverCheck.ok} : {date},
    },
  };
}
/**
 * One table scene of the screener (rules.screener.scenes.<key>, spike aside): its saved filter, the
 * server's count, and the rows pull.mjs ranked by the scene's own column. The user split RS Strong
 * and Uptrend into two such scenes on 2026-09-30 — no intersection is shown as a filter of its own.
 */
/**
 * How far a board row's price sits above its EMA50 and SMA200, % at one decimal — the Uptrend board's two extra
 * columns (user 2026-10-01 evening: the Uptrend scene "must have more info"; the filter IS price > EMA50 > SMA200).
 * The averages are the terminal's own; a 0 (not computable yet) prints nothing.
 */
const trendOf = (r) => ({
  ...(r.ema_50 > 0 ? {aboveEma50Percent: round(pct(r.price, r.ema_50), 1)} : {}),
  ...(r.sma_200 > 0 ? {aboveSma200Percent: round(pct(r.price, r.sma_200), 1)} : {}),
});
const tableScene = (key) => {
  const spec = sceneSpec(key);
  const rows = (snap.members[key] ?? []).map(rowOf);
  return {
    filter: spec.photo,
    sortBy: spec.sortBy,
    count: snap.filters[spec.photo]?.count ?? null,
    ranked: rows.length,
    up: rows.filter((r) => r.changePercent > 0).length,
    down: rows.filter((r) => r.changePercent < 0).length,
    top: (snap.picks[key] ?? []).map((s, i) => ({...show(rowOf(s), i + 1), ...trendOf(rowOf(s))})),
  };
};
const tables = Object.fromEntries(Object.keys(R.screener.scenes).filter((k) => k !== 'spike').map((k) => [k, tableScene(k)]));
/**
 * The format's own boards (the weekly's Momentum breakout / breakdown, user 2026-10-06: "eval the filter: Momentum
 * breakout, Momentum breakdown"): the same table shape plus what those boards print — RS 3M, the terminal's trendline
 * signal of the board's kind (`board.signal`: breakout = closes through a falling trendline / resistance, breakdown =
 * through a rising one / support; "confirmed" or "potential" from the row's has_* flags) and the WEEK's change from
 * SSI's bars (lib/stock-bars.mjs, cached by breadth.mjs; null when a name's bars are not cached — facts.mjs never
 * fetches). `confirmed`/`potential` and `weekUp`/`weekDown` count the whole filter, not only the rows shown.
 */
const signalOf = (r, kind) => (!kind ? null : r.signals?.[`has_${kind}_confirmed`] ? 'confirmed' : r.signals?.[`has_${kind}_potential`] ? 'potential' : null);
const weekOf = (sym) => {
  const w = stockWeekChange(readStockBars(date, sym), date);
  return w == null ? null : round(w, 2);
};
const ownTables = Object.fromEntries(Object.entries(ownScenes).map(([k, spec]) => {
  const t = tableScene(k);
  const kind = spec.board?.signal ?? null;
  const rows = (snap.members[k] ?? []).map(rowOf);
  const weeks = rows.map((r) => weekOf(r.symbol)).filter((w) => w != null);
  return [k, {
    ...t,
    signalKind: kind,
    confirmed: rows.filter((r) => signalOf(r, kind) === 'confirmed').length,
    potential: rows.filter((r) => signalOf(r, kind) === 'potential').length,
    weekUp: weeks.filter((w) => w > 0).length,
    weekDown: weeks.filter((w) => w < 0).length,
    weekOf: weekStart(date),
    top: t.top.map((x) => ({...x, rs3m: snap.rows[x.symbol]?.rs_3m ?? null, signal: signalOf(rowOf(x.symbol), kind), weekChangePercent: weekOf(x.symbol)})),
  }];
}));
// The chart countdown: rules.screener.leaders.from is a list of TIERS of scene keys — the names in all
// three filters first, then RS Strong ∩ Uptrend (user 2026-10-01) — and pull.mjs ranked ONE pool per session, tier
// by tier, RS 1M inside a tier, whatever the format. A format may keep only the first tier(s) of it
// (rules.formats.<fmt>.leaders.from, a prefix of screener.leaders.from): the daily reviews only the names in all three
// filters (user 2026-10-06: "remove the stock not in all 3 filter, only keep the stock on all 3 filters"; picked "All 3
// filters only" — no RS Strong ∩ Uptrend fallback, a day without such a name has no leader scene). The pool the reel
// calls "có mặt ở cả hai bộ lọc" is the LAST tier the format keeps.
const normTiers = (from) => (Array.isArray(from) && from.some(Array.isArray) ? from.map((t) => [].concat(t)) : [[].concat(from)]);
const LR = R.screener.leaders ?? {from: [['rs', 'uptrend']], top: 2};
const allTiers = normTiers(LR.from);
const fmtTiers = fmt.leaders?.from ? normTiers(fmt.leaders.from) : null;
if (fmtTiers && (fmtTiers.length > allTiers.length || fmtTiers.some((t, i) => JSON.stringify(t) !== JSON.stringify(allTiers[i])))) {
  die(`rules.formats.${FORMAT}.leaders.from ${JSON.stringify(fmtTiers)} must be the first tier(s) of rules.screener.leaders.from ${JSON.stringify(allTiers)} — pull.mjs ranks one pool per session for every format`);
}
// `since`: the first edition the format's tiers apply to — an older edition rebuilt with --date keeps the tiers it was
// published with (the 5/10 pack still reviews MSR and DGW).
const tiers = fmtTiers && !(fmt.leaders.since && date < fmt.leaders.since) ? fmtTiers : allTiers;
const filtersOfTier = (t) => [...new Set(t.flatMap((k) => R.screener.scenes[k]?.filters ?? []))];
const tierOf = snap.leaders?.tierOf ?? {};
/** A pool name inside the tiers this format keeps (pull.mjs numbers each by the first tier it qualified in, from 1). */
const inTiers = (s) => tiers.length === allTiers.length || (tierOf[s] ?? Infinity) <= tiers.length;
const pool = (snap.members.leaders ?? []).filter(inTiers);
// snap.picks.leaders is the head of that tier-ordered pool, so the picks inside the format's tiers are exactly the head
// of the format's own pool: a later tier's name is only ever picked after every name of the earlier tiers.
const picksAll = snap.picks.leaders ?? [];
const picksKept = picksAll.filter(inTiers);
const tierWords = (t) => filtersOfTier(t).join(' ∩ ');
{
  const left = picksAll.filter((s) => !inTiers(s));
  if (left.length) console.log(`${FORMAT}: ${left.map((s) => `${s} (${tierWords(allTiers[(tierOf[s] ?? allTiers.length) - 1])})`).join(', ')} not reviewed — rules.formats.${FORMAT}.leaders keeps ${tiers.map(tierWords).join(' → ')} only`);
  if (!picksKept.length) console.log(`${FORMAT}: no name in ${tiers.map(tierWords).join(' or ')} — no leader scene`);
}
/**
 * The symbol-reviewer's review of each pick (.claude/agents/symbol-reviewer.md → content/review/symbols/<date>/<SYM>.json,
 * written after shots.mjs; run facts.mjs again afterwards): its setup, its one detail, and ONLY the numbers its labels,
 * detail and branches cite — verify's `facts` check accepts a figure when any pack number rounds to it, so the other
 * measured numbers stay out of the pack. An invalid review is left out (scaffold then places its default marks) and
 * said out loud.
 */
const reviewOf = (sym) => {
  const r = loadReview(date, sym);
  if (!r) return null;
  const errs = validateReview(r);
  if (errs.length) {
    console.warn(`${reviewPath(date, sym)}: ${errs.length} error(s), review not used — ${errs[0]}`);
    return null;
  }
  return {
    setup: r.detail.kind,
    verdict: r.verdict,
    detail: r.detail.text,
    // Method /2 (user 2026-10-03): the price action the scene speaks — structure and the one-sentence read.
    priceAction: r.priceAction ? {structure: r.priceAction.structure, read: r.priceAction.read} : null,
    // Method /3 (user 2026-10-07: "add the role of holder and not holder with action and behavior"): what the one holding
    // the name and the one without it do — the scene's action beat and its two closing sentences.
    roles: r.roles?.holder && r.roles?.notHolder ? Object.fromEntries(['holder', 'notHolder'].map((k) => [k, (({case: c, if: i, then: t, price, plate, say, headline}) => ({case: c, if: i ?? null, then: t, price: price ?? null, plate, say: say ?? null, headline: headline ?? null}))(r.roles[k])])) : null,
    numbers: citedNumbers(r),
    pending: (r.checks ?? []).filter((c) => c.pass === 'pending').map((c) => c.id),
    path: reviewPath(date, sym),
  };
};
const leaders = {
  from: tiers,
  filters: filtersOfTier(tiers[tiers.length - 1]),
  /** Each tier: its scenes, its filters, and the pool names that first qualified there (RS 1M order). */
  tiers: tiers.map((t, i) => ({scenes: t, filters: filtersOfTier(t), names: pool.filter((s) => tierOf[s] === i + 1)})),
  count: pool.length,
  top: picksKept.map((s, i) => ({...leaderDetail(s, i + 1), review: reviewOf(s), tier: tierOf[s] ?? null, tierFilters: filtersOfTier(tiers[Math.min(tierOf[s] ?? tiers.length, tiers.length) - 1])})),
  // Every name of the pool (not only the picks) that is also in the spike filter — the material of
  // loop 2 (spike → leader #1); scaffold's hookTwo picks the branch the day supports.
  alsoSpiking: pool.filter((s) => snap.members.spike.includes(s)),
};
// The snapshot is ranked on the GLOBAL tiers (one pool for every format), so it is checked against those.
if (snap.leaders && JSON.stringify(normTiers(snap.leaders.from)) !== JSON.stringify(allTiers)) {
  die(`the ${date} snapshot ranked its leaders from ${JSON.stringify(snap.leaders.from)}, rules.screener.leaders.from now says ${JSON.stringify(allTiers)} — run node scripts/review/pull.mjs --rebuild first`);
}
/**
 * A format's own reviews (rules.formats.<format>.screener.leaders — the weekly: one review per Momentum filter, user
 * 2026-10-06 "Top of each filter"). pull.mjs ranked them into snapshot.leadersByFormat.<format>: tier by tier over the
 * format's own scene keys, at most `perTier` a tier, a name already taken skipped. `order: "tier"` = the scenes play in
 * tier order, each right after its own board, so top[k] is review scene k and top[k].tierScene the board that leads into
 * it. Rows are shaped like the daily leaders' (leaderDetail + review), so the leader scene, shots.mjs and symbol-review
 * read them unchanged. null for a format without its own leaders — the pack then carries `leaders` above.
 */
const weeklyLeaders = fmt.screener?.leaders ? (() => {
  const FL = fmt.screener.leaders;
  const ftiers = normTiers(FL.from);
  const got = snap.leadersByFormat?.[FORMAT];
  if (!got) console.warn(`${FORMAT}: the ${date} snapshot has no leadersByFormat.${FORMAT} (pulled before 2026-10-06) — run node scripts/review/pull.mjs --rebuild --as-of=${date}; no review scene`);
  const ownFilters = (t) => [...new Set(t.flatMap((k) => sceneSpec(k)?.filters ?? []))];
  const picked = got?.picks ?? [];
  const pool = got?.members ?? [];
  return {
    from: ftiers,
    order: FL.order ?? null,
    perTier: FL.perTier ?? null,
    filters: ownFilters(ftiers.flat()),
    tiers: ftiers.map((t, i) => ({scenes: t, filters: ownFilters(t), names: pool.filter((s) => got?.poolTierOf?.[s] === i + 1)})),
    count: pool.length,
    top: picked.map((s, i) => ({...leaderDetail(s, i + 1), review: reviewOf(s), tier: got.tierOf?.[s] ?? null, tierScene: got.tierScene?.[s] ?? null, tierFilters: ownFilters(ftiers[(got.tierOf?.[s] ?? 1) - 1])})),
    alsoSpiking: [],
  };
})() : null;
// The names the user asked for on the review page (user 2026-10-05: "… i can choose and fill the symbol on the artifact
// to review beside existed symbol on 3 filter"; lib/requested.mjs): each one reviewed like a leader, in a `pick` scene
// after the leader scenes. The row comes from the snapshot when it kept one, else from the session's universe cache; the
// chart from content/review/analyze/<date>/<SYM>.json (pull.mjs --symbols=… --analyze-only).
// --requests=<file>: another requests file (a staging copy) in place of content/review/requests/<date>.json.
// A non-daily format reads its own requests (content/review/requests/<date>-<format>.json): the daily of the same
// session keys its file by the bare date, and the first weekly test (5/10) built the daily's VIC pick (2026-10-06).
const REQ = readRequests(date, R, opt('requests') ?? requestsPath(requestKey(FORMAT, date)));
const requested = (() => {
  if (!REQ) return [];
  const uni = tryJson(`${PATHS.cache}/${date}-universe.json`)?.stocks ?? [];
  const leaderSyms = new Set((weeklyLeaders ?? leaders).top.map((x) => x.symbol));
  if (REQ.dropped.length) console.warn(`requests: ${REQ.dropped.join(', ')} past rules.screener.requested.max (${R.screener?.requested?.max ?? 3}) — not reviewed`);
  if (REQ.invalid.length) console.warn(`requests: ${REQ.invalid.join(', ')} are not tickers — ignored`);
  return REQ.symbols.flatMap((sym) => {
    if (leaderSyms.has(sym)) { console.warn(`requests: ${sym} is already a leader of ${date} — it has its scene`); return []; }
    const u = uni.find((x) => x.symbol === sym);
    const row = snap.rows?.[sym] ? rowOf(sym) : u ? {symbol: sym, ...compactRow(u)} : null;
    if (!row) { console.warn(`requests: ${sym} is not in the ${date} universe (${PATHS.cache}/${date}-universe.json) — skipped`); return []; }
    const rel = `${PATHS.analyze}/${date}/${sym}.json`;
    if (!exists(rel)) console.warn(`requests: no ${rel} — run node scripts/review/pull.mjs --symbols=${sym} --analyze-only`);
    return [{...leaderDetail(sym, 0, row, exists(rel) ? rel : null), review: reviewOf(sym), requested: true}];
  }).map((x, i) => ({...x, rank: i + 1}));
})();
// What each table board highlights (user 2026-10-01 evening: "If the symbol have both on RS strong and Uptrend
// highlight it"), counted on the rows the board shows: `both` = in every filter of the last tier (RS Strong and
// Uptrend), `all3` = in every filter of the first tier (also Volume spike), `only` = shown but not in both. The
// boards' plates print these ("7 mã cũng ở Uptrend").
{
  const inAll = (x, fs) => fs.length > 0 && fs.every((f) => (x.filters ?? []).includes(f));
  // The board rows' own counts: on the global tiers, whatever tiers this format reviews (2026-10-06).
  const first = allTiers.length > 1 ? filtersOfTier(allTiers[0]) : null;
  const lastFilters = filtersOfTier(allTiers[allTiers.length - 1]);
  for (const t of Object.values(tables)) {
    const both = t.top.filter((x) => inAll(x, lastFilters)).length;
    t.overlap = {shown: t.top.length, both, only: t.top.length - both, ...(first ? {all3: t.top.filter((x) => inAll(x, first)).length} : {})};
  }
}

// ------------------------------------------------------------------ breadth (the SMA200 line) — weekly

/**
 * How many stocks stand above their averages, and how many rose or fell — the weekly's breadth scene (the old "Độ rộng
 * thị trường", user 2026-10-05: "Daily; old chart → weekly"). Only for a format whose roles list `breadth`. Recomputed
 * from the session's cached universe when it is still on disk (a snapshot written before 2026-09-29 lacks the
 * with-average counts); the LINE comes from scripts/review/breadth.mjs (content/review/breadth.json).
 */
const breadth = fmt.roles.includes('breadth') && snap.breadth
  ? (() => {
    const b = {...snap.breadth};
    const uni = tryJson(`${PATHS.cache}/${date}-universe.json`)?.stocks;
    if (uni?.length) {
      const withSma = uni.filter((s) => s.sma_200 > 0);
      const withEma = uni.filter((s) => s.ema_50 > 0);
      b.universe = uni.length;
      b.withSma200 = withSma.length;
      b.aboveSma200 = withSma.filter((s) => s.current_price > s.sma_200).length;
      b.withEma50 = withEma.length;
      b.aboveEma50 = withEma.filter((s) => s.current_price > s.ema_50).length;
      b.up = uni.filter((s) => s.price_change_pct > 0).length;
      b.down = uni.filter((s) => s.price_change_pct < 0).length;
    }
    b.aboveSma200Percent = round((100 * b.aboveSma200) / (b.withSma200 ?? b.universe), 1);
    b.aboveEma50Percent = round((100 * b.aboveEma50) / (b.withEma50 ?? b.universe), 1);
    b.upPercent = round((100 * b.up) / b.universe, 1);
    b.downPercent = round((100 * b.down) / b.universe, 1);
    // The COUNT the scene says (user 2026-10-06: "amount of stock have price better than its SMA200"): the terminal's
    // own — stocks with an SMA200 whose price closes above it, what the user gets filtering price > SMA200 — on the
    // whole set, or only on stocks with volume_sma20 ≥ rules.formats.<format>.breadth.minVolumeSma20 when that floor is
    // set (the line is then recomputed on the same liquid set; the scene says "mã có thanh khoản").
    const floor = Number(fmt.breadth?.minVolumeSma20 ?? 0);
    const liquid = floor > 0 && uni?.length ? uni.filter((s) => s.sma_200 > 0 && s.volume_sma20 >= floor) : null;
    b.count = liquid
      ? {above: liquid.filter((s) => s.current_price > s.sma_200).length, with: liquid.length, floor, rule: `volume_sma20 ≥ ${floor}`}
      : {above: b.aboveSma200, with: b.withSma200 ?? b.universe, floor: 0, rule: 'every stock the terminal gives an SMA200'};
    b.count.percent = round((100 * b.count.above) / b.count.with, 1);
    // The breadth LINE (scripts/review/breadth.mjs): how many stocks close above their 200-session average per session,
    // recomputed from SSI closes on the same set (the screener keeps no history), with the index close of the session.
    const hist = tryJson('content/review/breadth.json');
    if (hist?.rows?.length && hist.asOf <= date) {
      const closeOf = new Map(bars.map((x) => [x.t, x.c]));
      const rows = hist.rows.filter((r) => r.t <= date && closeOf.has(r.t)).slice(-60)
        .map((r) => ({t: r.t, dm: dm(r.t), percent: r.percent, above: r.above, with: r.with, indexClose: round(closeOf.get(r.t), 2)}));
      if ((hist.set?.floor ?? 0) !== floor) console.warn(`content/review/breadth.json was built with floor ${hist.set?.floor ?? 0}, rules say ${floor} — run node scripts/review/breadth.mjs --date=${date}`);
      if (rows.length >= 10) {
        const first = rows[0], last = rows[rows.length - 1];
        const hiRow = rows.reduce((m, r) => (r.percent > m.percent ? r : m), rows[0]);
        const hiCount = rows.reduce((m, r) => (r.above > m.above ? r : m), rows[0]);
        const residual = last.t === date ? last.above - b.count.above : null;
        b.history = rows;
        b.line = {
          from: first.t, fromDm: first.dm, to: last.t, sessions: rows.length,
          first: first.percent, last: last.percent, changePoints: round(last.percent - first.percent, 1),
          peak: hiRow.percent, peakDm: hiRow.dm,
          countFirst: first.above, countLast: last.above, countChange: last.above - first.above, countPeak: hiCount.above, countPeakDm: hiCount.dm,
          indexFirst: first.indexClose, indexLast: last.indexClose, indexChangePercent: round(pct(last.indexClose, first.indexClose), 1),
          source: hist.source, method: hist.method ?? null, set: hist.set ?? null, symbols: hist.fetched,
          vsScreener: round(last.percent - b.aboveSma200Percent, 1),
          // The line's last point against the headline count (same set): carried-forward SSI closes do not reproduce the
          // terminal's SMA200 of a few near-untradable names (5/10: 237 vs 247 of 901).
          residual, residualSharePercent: residual == null ? null : round((100 * residual) / b.count.with, 2),
        };
        // The week: the count at the last session before the week started against the edition's — the line's (same
        // basis all week) and, on the whole set, the terminal's own from that session's snapshot when it was pulled.
        const ws = weekStart(date);
        const prior = [...rows].reverse().find((r) => r.t < ws);
        if (prior) {
          const ps = floor === 0 ? tryJson(`${PATHS.snapshots}/${prior.t}.json`)?.breadth : null;
          b.week = {
            from: prior.t, fromDm: prior.dm,
            lineFrom: prior.above, lineTo: last.above, lineChange: last.above - prior.above,
            percentFrom: prior.percent, percentTo: last.percent, changePoints: round(last.percent - prior.percent, 1),
            ...(ps?.aboveSma200 != null ? {screenerFrom: ps.aboveSma200, screenerWithFrom: ps.withSma200 ?? null, screenerChange: b.count.above - ps.aboveSma200} : {}),
          };
        }
      }
    }
    return b;
  })()
  : null;

// ------------------------------------------------------------------ money flow (FireAnt "Biến động thị trường") — daily

/**
 * The flow scene's numbers (user 2026-10-05: "the chart of symbol increase and decrease and flow of the money …
 * of FireAnt" — built for the weekly first, moved to the DAILY the same afternoon: "Daily; old chart → weekly"):
 * HOSE stocks up / down / unchanged and the session's money in each group, read off FireAnt's own charts by
 * shots.mjs --only=flow. Only for a format whose roles list `flow`; `{ok: false, why}` when the photo is missing or
 * shows another session.
 */
const flow = fmt.roles.includes('flow')
  ? (() => {
    const photo = `${PATHS.shots}/${date}/${FLOW_PHOTO}.png`;
    const side = tryJson(`public/${photo.replace(/\.png$/, '')}.json`);
    if (!side) return {ok: false, why: `no photo public/${photo} — run node scripts/review/shots.mjs --format=${FORMAT} --only=flow, then facts.mjs again`};
    return flowFacts(side, {date, close: round(last.c, 2), freshAfter: R.screener.freshAfter, tolerance: R.shots.fireantFlow?.matchTolerance, photo});
  })()
  : null;

// ------------------------------------------------------------------ scenario (VN-Index) — the closing scene

/**
 * "Kịch bản VN-Index" (user 2026-10-05: "also include the scene relate to the scenario of the market VN-Index", then
 * "Upgrade the closing scene"): the index's own map for the payoff. Price action of the last 142 sessions (the FireAnt
 * photo's window — swings and clustered horizontal levels of lib/symbol-review.mjs, the same reading the leader reviews
 * use) plus FireAnt's own MA50/MA200 read off the index photo, merged into zones within 0.5% (5/10: MA50 1774,79 and the
 * 14/9 level 1776,85 are one zone). The nearest two zones above the close are the bull path, the nearest two below it the
 * bear path; the FTD rally low is on the bear path whenever it is below the close. The rule branches (FTD fails, one more
 * distribution day) stay in `watch[]`.
 */
const scenario = (() => {
  const win = bars.slice(-142);
  const close = last.c;
  const {above, below} = levelsOf(win, swingsOf(win), close);
  const maf = tryJson(`public/${PATHS.shots}/${date}/vnindex-daily.ma.json`)?.ma ?? {};
  const mas = [['ma50', 'MA50'], ['ma200', 'MA200']].map(([k, name]) => ({kind: 'ma', name, price: maf[k]?.value})).filter((m) => Number.isFinite(m.price));
  const rally = st.rallyLow ?? null;
  const near = (a, b) => Math.abs(a / b - 1) < 0.002;
  const pts = [
    ...mas.map((m) => ({...m, price: round(m.price, 2)})),
    ...above.slice(0, 4).map((l) => ({kind: 'level', name: 'kháng cự', price: round(l.price, 2), dm: dm(l.t), touches: l.touches})),
    ...below.slice(0, 4).map((l) => ({kind: rally != null && near(l.price, rally) ? 'rally' : 'level', name: rally != null && near(l.price, rally) ? 'đáy nhịp hồi' : 'hỗ trợ', price: round(l.price, 2), dm: dm(l.t), touches: l.touches})),
  ];
  if (rally != null && rally < close && !pts.some((p) => p.kind === 'rally')) pts.push({kind: 'rally', name: 'đáy nhịp hồi', price: round(rally, 2)});
  const zones = (list, up) => {
    const sorted = list.sort((a, b) => (up ? a.price - b.price : b.price - a.price));
    const out = [];
    for (const p of sorted) {
      const z = out.at(-1);
      if (z && Math.abs(p.price / (up ? z.low : z.high) - 1) <= 0.005) { z.members.push(p); z.low = Math.min(z.low, p.price); z.high = Math.max(z.high, p.price); }
      else out.push({low: p.price, high: p.price, members: [p]});
    }
    // The line a path meets first: the bottom of a zone overhead, the top of a zone underneath.
    return out.slice(0, 2).map((z) => ({...z, at: up ? z.low : z.high, rally: z.members.some((m) => m.kind === 'rally')}));
  };
  const up = zones(pts.filter((p) => p.price > close), true);
  const down = zones(pts.filter((p) => p.price < close), false);
  return {close: round(close, 2), up, down, rallyLow: rally == null ? null : round(rally, 2), window: win.length, ma: Object.fromEntries(mas.map((m) => [m.name, round(m.price, 2)])),
    source: 'price action of the last 142 sessions (SSI daily, lib/symbol-review.mjs swings/levels) + FireAnt MA50/MA200 off the index photo'};
})();

// ------------------------------------------------------------------ weekly

let weekly = null;
if (FORMAT === 'weekly') {
  const from = weekStart(date);
  const wk = bars.filter((b) => b.t >= from);
  const before = bars.filter((b) => b.t < from);
  const pw = before.filter((b) => b.t >= weekStart(before[before.length - 1].t));
  const vol = (a) => a.reduce((x, b) => x + b.v, 0);
  const weekDd = st.distributionLog.filter((d) => d.t >= from).map((d) => ({date: d.t, dm: dm(d.t), changePercent: round(d.changePercent, 2), volumeRatio: round(d.volumeRatio, 2)}));
  const snaps = wk.map((b) => tryJson(`${PATHS.snapshots}/${b.t}.json`)).filter(Boolean);
  const prevSnap = before.slice(-5).reverse().map((b) => tryJson(`${PATHS.snapshots}/${b.t}.json`)).find(Boolean) ?? null;
  const spikeWeek = [...new Set(snaps.flatMap((s) => s.members.spike))];
  weekly = {
    from, to: date, fromDm: dm(from), sessions: wk.length,
    open: round(wk[0].o, 2), high: round(Math.max(...wk.map((b) => b.h)), 2), low: round(Math.min(...wk.map((b) => b.l)), 2), close: round(last.c, 2),
    prevClose: round(before[before.length - 1].c, 2),
    changePercent: round(pct(last.c, before[before.length - 1].c), 2),
    volumeVsPriorWeek: pw.length ? round(vol(wk) / wk.length / (vol(pw) / pw.length), 2) : null,
    distributionDays: weekDd,
    transitions: st.transitions.filter((x) => x.t >= from).map((x) => ({date: x.t, dm: dm(x.t), from: label(x.from).vi, to: label(x.to).vi})),
    snapshots: snaps.map((s) => s.date),
    spikeNamesThisWeek: snaps.length ? spikeWeek.length : null,
    newLeaders: prevSnap ? snap.members.leaders.filter((s) => !prevSnap.members.leaders.includes(s)) : null,
    droppedLeaders: prevSnap ? prevSnap.members.leaders.filter((s) => !snap.members.leaders.includes(s)) : null,
    comparedWith: prevSnap?.date ?? null,
  };
}

// ------------------------------------------------------------------ weekly edition blocks (2026-10-06)

// The user's 6/10 weekly (rules.formats.weekly._why): VN-Index on the daily and the weekly timeframe, the ICB industry
// groups ranked by RS. Each block is null when the format does not list its role. Pack keys: indexDaily (role daily),
// indexWeekly (role week, its evaluation beat), sectors (role sectors).
/** The photo folder the scenes are built on (scaffold's --dir); the timeframe blocks read FireAnt's MA sidecars there. */
const SHOTS_DIR = opt('dir') ?? `${PATHS.shots}/${date}`;
/**
 * FireAnt's MA50/MA200 off one of its VNINDEX photos (vnindex-daily / vnindex-weekly .ma.json — fireant_ma.py reads the
 * chart's legend, nothing is computed here, the same rule as the leaders). Kept only when the legend was read on the
 * edition's own candle (the sidecar's hover check read this close): a photo of a later session or week prints ITS
 * averages — the 28/9–2/10 test week's weekly photo, shot on 5/10, reads the week of 5/10.
 */
const fireantMa = (name, close) => {
  const f = tryJson(`public/${SHOTS_DIR}/${name}.ma.json`);
  if (!f) return {ma: {}, why: `no public/${SHOTS_DIR}/${name}.ma.json (shots.mjs --format=${FORMAT})`};
  const read = f.hoverCheck?.readClose;
  if (f.hoverCheck?.ok === false || (read != null && Math.abs(read - close) > 0.005)) {
    return {ma: {}, why: `the legend of ${name}.png was read on another candle (close ${read} ≠ ${round(close, 2)}) — its averages are not this edition's`};
  }
  const ma = {};
  for (const [k, label] of [['ma50', 'MA50'], ['ma200', 'MA200']]) {
    const value = f.ma?.[k]?.value;
    if (Number.isFinite(value)) ma[label] = {value: round(value, 2), closeVsPercent: round(pct(close, value), 2)};
  }
  return {ma, why: Object.keys(ma).length ? null : `${name}.ma.json holds no MA50/MA200 value`};
};
/** Where the close sits against the two averages, in the words a trader says. */
const maPositionOf = (ma) => {
  const a50 = ma.MA50 ? ma.MA50.closeVsPercent > 0 : null;
  const a200 = ma.MA200 ? ma.MA200.closeVsPercent > 0 : null;
  if (a50 == null && a200 == null) return null;
  if (a50 === true && a200 === true) return 'trên cả MA50 và MA200';
  if (a50 === false && a200 === false) return 'dưới cả MA50 và MA200';
  if (a50 === false && a200 === true) return 'dưới MA50, trên MA200';
  if (a50 === true && a200 === false) return 'trên MA50, dưới MA200';
  return a50 != null ? (a50 ? 'trên MA50' : 'dưới MA50') : a200 ? 'trên MA200' : 'dưới MA200';
};
/**
 * Price action of one timeframe (lib/symbol-review.mjs, the reading the leader reviews use): fractal swings, the
 * structure of the last two highs and lows (two within 0,5% are equal — a range), and the horizontal levels each side.
 * `word` is decided by the structure alone: up → tăng, down → giảm, else đi ngang; `broke` says when the last bar closed
 * through the last swing low (high) — a range that has lost its floor is weaker than its two swings say.
 */
const priceActionOf = (list, close) => {
  const sw = swingsOf(list);
  const st = structureOf(list, sw);
  const {above, below} = levelsOf(list, sw, close);
  const pt = (p) => ({t: p.t, dm: dm(p.t), price: round(p.price, 2)});
  const lastLow = st.lows.at(-1);
  const lastHigh = st.highs.at(-1);
  return {
    above, below,
    structure: {
      kind: st.kind, hh: st.hh, hl: st.hl, text: st.text, highs: st.highs.map(pt), lows: st.lows.map(pt),
      word: st.kind === 'up' ? 'tăng' : st.kind === 'down' ? 'giảm' : 'đi ngang',
      broke: st.closedBelowLastLow && lastLow ? {side: 'low', ...pt(lastLow)} : st.closedAboveLastHigh && lastHigh ? {side: 'high', ...pt(lastHigh)} : null,
    },
  };
};
/** Price points within 0,5% of each other are one zone (as `scenario` merges them); the nearest `n` each side of the close. */
const zonesOf = (pts, close, n = 2) => {
  const side = (up) => {
    const out = [];
    for (const p of pts.filter((q) => (up ? q.price > close : q.price < close)).sort((a, b) => (up ? a.price - b.price : b.price - a.price))) {
      const z = out.at(-1);
      if (z && Math.abs(p.price / (up ? z.low : z.high) - 1) <= 0.005) { z.members.push(p); z.low = Math.min(z.low, p.price); z.high = Math.max(z.high, p.price); }
      else out.push({low: p.price, high: p.price, members: [p]});
    }
    // The line the price meets first: a zone's bottom overhead, its top underneath.
    return out.slice(0, n).map((z) => ({...z, at: up ? z.low : z.high}));
  };
  return {up: side(true), down: side(false)};
};
/** The edition's weekday when it is not the week's last trading day: the week is still open ("tuần này tới thứ Ba"). */
const openWeekday = (() => {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 4 ? WEEKDAYS[dow] : null;
})();

// VN-Index · Khung ngày (role daily; user 2026-10-06: "eval the VNIndex as daily and weekly of this week"): STRUCTURE and
// TREND on the daily chart — the last two swing highs and lows of the 142 sessions the FireAnt photo shows, FireAnt's
// MA50/MA200 and where the close sits against them, the week's sessions. The if-then levels stay with `scenario` (watch).
const indexDaily = fmt.roles.includes('daily')
  ? (() => {
    const win = bars.slice(-142);
    const pa = priceActionOf(win, last.c);
    const {ma, why} = fireantMa('vnindex-daily', last.c);
    // SSI's same-day volume is provisional (SKILL.md market-review §9): the last session's ratio waits for the next day.
    const meta = tryJson(PATHS.daily.replace(/\.json$/, '.meta.json'));
    const provisional = meta?.fetchedAt ? ict(new Date(meta.fetchedAt)).date === date : true;
    const from = weekStart(date);
    const weekSessions = bars.map((b, i) => [b, bars[i - 1]]).filter(([b, p]) => b.t >= from && p).map(([b, p]) => ({
      t: b.t, dm: dm(b.t), weekday: WEEKDAYS[new Date(`${b.t}T00:00:00Z`).getUTCDay()], close: round(b.c, 2), changePercent: round(pct(b.c, p.c), 2),
      volumeVsPrior: round(b.v / p.v, 2), ...(b.t === date && provisional ? {volumeProvisional: true} : {}),
    }));
    return {
      timeframe: 'D', window: win.length, from: win[0].t, close: round(last.c, 2),
      structure: pa.structure,
      ma, ...(why ? {maWhy: why} : {}), maPosition: maPositionOf(ma),
      ...(ma.MA50 && ma.MA200 ? {ma50AboveMa200: ma.MA50.value > ma.MA200.value} : {}),
      weekSessions,
      source: 'SSI daily bars, last 142 sessions (lib/symbol-review.mjs swings/structure) + FireAnt MA50/MA200 off vnindex-daily.png',
    };
  })()
  : null;

// VN-Index · Khung tuần (role week, its evaluation beat): the same reading on Monday-keyed weekly bars (FireAnt's W
// interval — lib/week-fireant.mjs weeklyBars), the last 142 weeks; FireAnt's WEEKLY MA50/MA200 off vnindex-weekly.png;
// the nearest weekly zones each side (MA and swing levels within 0,5% merged, like `scenario`).
const indexWeekly = fmt.roles.includes('week') && weekly
  ? (() => {
    const win = weeklyBars(bars).slice(-142);
    const pa = priceActionOf(win, last.c);
    const {ma, why} = fireantMa('vnindex-weekly', last.c);
    const pts = [
      ...Object.entries(ma).map(([name, m]) => ({kind: 'ma', name: `${name} tuần`, price: m.value})),
      ...pa.above.slice(0, 4).map((l) => ({kind: 'level', name: 'kháng cự', price: round(l.price, 2), t: l.t, dm: dm(l.t), touches: l.touches})),
      ...pa.below.slice(0, 4).map((l) => ({kind: 'level', name: 'hỗ trợ', price: round(l.price, 2), t: l.t, dm: dm(l.t), touches: l.touches})),
    ];
    const {up, down} = zonesOf(pts, last.c);
    return {
      timeframe: 'W', window: win.length, from: win[0].t, close: round(last.c, 2),
      ...(openWeekday ? {openThrough: openWeekday} : {}),
      structure: pa.structure,
      ma, ...(why ? {maWhy: why} : {}), maPosition: maPositionOf(ma),
      ...(ma.MA50 && ma.MA200 ? {ma50AboveMa200: ma.MA50.value > ma.MA200.value} : {}),
      up, down,
      source: 'SSI daily bars summed into Monday weeks, last 142 weeks (lib/symbol-review.mjs swings/structure/levels) + FireAnt weekly MA50/MA200 off vnindex-weekly.png',
    };
  })()
  : null;
// ICB industry groups ranked by the median RS 1M of their liquid stocks (lib/sectors.mjs, rules.sectors; user
// 2026-10-06: "Also include major ranking", picked "ICB groups by RS"). {ok: false, why} when the session's universe
// cache or content/review/industries.json is missing — scaffold then drops the scene and prints why.
const sectors = fmt.roles.includes('sectors') ? sectorFacts({date, R}) : null;

// ------------------------------------------------------------------ backtest and anchors

const bt = backtest(bars, P, {thresholds: R.followThrough.backtestThresholds, forward: R.followThrough.backtestForwardSessions});
const cached = ict(new Date(snap.cachedAt));
const pack = {
  format: FORMAT,
  asOf: date,
  source: {
    label: `${R.market.sourceLabel} · zionle.io.vn`,
    reconstructed: false,
    indexFetchedAt: readJson(PATHS.daily.replace(/\.json$/, '.meta.json')).fetchedAt,
    screenerCachedAt: snap.cachedAt,
    screenerCachedIct: `${cached.date} ${cached.hm}`,
  },
  rules: {
    ddMaxChangePercent: Math.abs(R.distribution.maxChangePercent),
    windowSessions: R.distribution.windowSessions,
    expireRallyPercent: R.distribution.expireRallyPercent,
    underPressureAt: R.distribution.underPressureAt,
    correctionAt: R.distribution.correctionAt,
    dangerAt: R.distribution.dangerAt ?? null,
    ftdMinDay: R.followThrough.minDay,
    ftdMinChangePercent: R.followThrough.minChangePercent,
    topN: LR.top ?? 3,
  },
  session,
  distribution,
  state,
  watch,
  screener: {
    cachedAt: snap.cachedAt,
    universe: snap.universe,
    volumeVsSmaUnit: snap.volumeVsSmaUnit,
    spike,
    ...tables,
    ...ownTables,
    leaders: weeklyLeaders ?? leaders,
    ...(REQ ? {requested} : {}),
    ...(breadth ? {breadth} : {}),
  },
  ...(weekly ? {weekly} : {}),
  ...(indexDaily ? {indexDaily} : {}),
  ...(indexWeekly ? {indexWeekly} : {}),
  ...(sectors ? {sectors} : {}),
  scenario,
  ...(flow ? {flow} : {}),
  backtest: {from: bars[0].t, sessions: bars.length, forward: R.followThrough.backtestForwardSessions, rows: bt.map(({threshold, ftds, evaluated, higherPercent, medianReturnPercent}) => ({threshold, ftds, evaluated, higherPercent, medianReturnPercent}))},
};

// Rows for the review page's data table (scripts/review-page.mjs reads `anchors` when present).
const v = (n, dp = 2) => (n == null ? '—' : String(round(n, dp)).replace('.', ','));
pack.anchors = [
  {label: `Phiên ${session.dmy}`, value: `${v(session.close)} (${session.changePercent >= 0 ? '+' : ''}${v(session.changePercent)}%) · KL ×${v(session.volumeRatio)} phiên trước · ×${v(session.volumeVsAvg20)} TB20`, path: 'session'},
  {label: 'Trạng thái theo quy tắc', value: `${state.label} từ ${state.sinceDm}${state.rallyDay ? ` · ngày ${state.rallyDay}` : ''}`, path: 'state'},
  {label: `Phân phối / ${distribution.window} phiên`, value: `${distribution.count}: ${dd.map((d) => `${d.dm} ${v(d.changePercent)}% ×${v(d.volumeRatio)} (còn ${d.sessionsLeft})`).join(' · ') || '—'}${distribution.dangerAt != null ? ` · mức nguy hiểm từ ${distribution.dangerAt}${distribution.danger ? ' — ĐANG Ở MỨC NGUY HIỂM' : ` (còn ${distribution.toDanger})`}` : ''}`, path: 'distribution.active'},
  ...(state.lastFtd ? [{label: 'FTD gần nhất', value: `${state.lastFtd.dmy} · ngày ${state.lastFtd.day} · +${v(state.lastFtd.changePercent)}% · KL ×${v(state.lastFtd.volumeRatio)} · đáy nhịp hồi ${v(state.lastFtd.rallyLow)}${state.lastFtd.ended ? ` · kết thúc ${state.lastFtd.ended.dm} (${state.lastFtd.ended.why})` : ''}`, path: 'state.lastFtd'}] : []),
  {label: `Volume spike (${spike.count} mã · ${spike.up} tăng · ${spike.down} giảm)`, value: `${spike.sortedBy === 'changePercent' ? 'xếp theo % thay đổi (tăng mạnh nhất / giảm sâu nhất trước) · ' : 'xếp theo RS 1M · '}tăng: ${spike.gainers.map((s) => `${s.symbol} +${v(s.changePercent)}%${s.volumeVsSma20Percent != null ? ` KL +${s.volumeVsSma20Percent}%` : ''}`).join(' · ')} — giảm: ${spike.losers.map((s) => `${s.symbol} ${v(s.changePercent)}%${s.volumeVsSma20Percent != null ? ` KL +${s.volumeVsSma20Percent}%` : ''}`).join(' · ')}`, path: 'screener.spike.gainers / losers'},
  ...Object.entries(tables).map(([k, t]) => ({label: `${t.filter} (${t.count} mã · ${t.up} tăng · ${t.down} giảm)`, value: t.top.map((s) => `${s.symbol} RS1M ${s.rs1m} · ${s.changePercent >= 0 ? '+' : ''}${v(s.changePercent)}%`).join(' · ') || '—', path: `screener.${k}.top`})),
  // The weekly's own reviews (one per Momentum filter, 2026-10-06) when the format has them, else the shared leaders.
  ...[weeklyLeaders ?? leaders].map((LD) => ({label: `${weeklyLeaders ? 'Soi mã mỗi bộ lọc' : 'Dẫn dắt'} · ${LD.from.map((t) => [].concat(t).map((k) => sceneSpec(k)?.photo ?? k).join(' ∩ ')).join(' → ')} (${LD.count} mã)`, value: LD.top.map((s) => `${s.symbol} RS1M ${s.rs1m} · ${s.changePercent >= 0 ? '+' : ''}${v(s.changePercent)}%${s.tierScene ? ` (${sceneSpec(s.tierScene)?.photo ?? s.tierScene})` : s.filters?.length ? ` (${s.filters.join(', ')})` : ''}`).join(' · ') || '—', path: 'screener.leaders.top'})),
  ...requested.map((s) => ({label: `Soi thêm · ${s.symbol} (người dùng chọn)`, value: `${s.price} · ${s.changePercent >= 0 ? '+' : ''}${v(s.changePercent)}% · RS1M ${s.rs1m ?? '—'}${s.filters.length ? ` · ${s.filters.join(', ')}` : ' · ngoài ba bộ lọc'} — ${s.review ? `${s.review.setup} — ${s.review.detail}` : 'chưa có bản soi của symbol-reviewer'}`, path: `screener.requested[${s.rank - 1}]`})),
  ...leaders.top.map((s, i) => ({label: `Soi mã · ${s.symbol}`, value: s.review ? `${s.review.setup} — ${s.review.detail}${s.review.pending.length ? ` (chờ: ${s.review.pending.join(', ')})` : ''}` : 'chưa có bản soi của symbol-reviewer', path: `screener.leaders.top[${i}].review`})),
  ...(breadth ? [{label: 'Độ rộng', value: `${breadth.count.above}/${breadth.count.with} mã${breadth.count.floor ? ' có thanh khoản' : ''} trên SMA200 (${v(breadth.count.percent, 1)}%, terminal)${breadth.week?.screenerChange != null ? ` · tuần ${breadth.week.screenerChange >= 0 ? '+' : ''}${breadth.week.screenerChange} từ ${breadth.week.fromDm}` : breadth.week ? ` · đường tuần ${breadth.week.lineChange >= 0 ? '+' : ''}${breadth.week.lineChange} từ ${breadth.week.fromDm}` : ''} · ${breadth.up} tăng · ${breadth.down} giảm${breadth.line ? ` · đường SSI ${breadth.line.sessions} phiên: ${breadth.line.countFirst} (${breadth.line.fromDm}) → ${breadth.line.countLast} mã (lệch ${breadth.line.residual ?? '—'} so với terminal) trong khi chỉ số ${breadth.line.indexChangePercent >= 0 ? '+' : ''}${v(breadth.line.indexChangePercent, 1)}%` : ''}`, path: 'screener.breadth'}] : []),
  ...(flow ? [{label: `Biến động thị trường (FireAnt, ${flow.ok ? `HOSE ${flow.dm}` : 'không dùng được'})`, value: flow.ok ? `${flow.up} tăng · ${flow.down} giảm · ${flow.flat} đứng giá (${flow.countWord}) · tiền ${v(flow.money.up, 1)} / ${v(flow.money.down, 1)} / ${v(flow.money.flat, 1)} tỷ (${flow.moneyWord}, ×${v(flow.moneyLeadRatio)}${flow.agree ? `, ${flow.agree === 'same' ? 'cùng chiều' : 'NGƯỢC chiều'} số mã` : ''}) · ảnh ${flow.fetchedIct} ICT` : flow.why, path: 'flow'}] : []),
  {label: 'Kịch bản VN-Index', value: `đóng ${v(scenario.close)} · lên: ${scenario.up.map((z) => z.members.map((m) => `${m.name} ${v(m.price)}`).join(' + ')).join(' → ') || '—'} · xuống: ${scenario.down.map((z) => z.members.map((m) => `${m.name} ${v(m.price)}`).join(' + ')).join(' → ') || '—'}`, path: 'scenario'},
  {label: 'Bộ lọc terminal', value: `cache ${pack.source.screenerCachedIct} ICT · ${snap.universe} mã · volume_vs_sma đọc là ${snap.volumeVsSmaUnit === 'percent' ? '% trên TB20' : 'bội số TB20'}`, path: 'screener'},
  {label: `Backtest FTD (${bars.length} phiên)`, value: bt.map((r) => `+${String(r.threshold).replace('.', ',')}%: ${r.ftds} FTD, ${r.higherPercent}% cao hơn sau ${R.followThrough.backtestForwardSessions} phiên`).join(' · '), path: 'backtest.rows'},
  ...(weekly ? [{label: `Tuần ${weekly.fromDm} → ${session.dm}`, value: `${weekly.changePercent >= 0 ? '+' : ''}${v(weekly.changePercent)}% · KL/phiên ×${v(weekly.volumeVsPriorWeek)} tuần trước · ${weekly.distributionDays.length} phiên phân phối`, path: 'weekly'}] : []),
  ...(sectors?.ok && sectors.groups.length ? [{label: `Nhóm ngành ICB (RS 1M trung vị, ${sectors.groups.length} nhóm xếp hạng)`, value: `${sectors.groups.slice(0, 3).map((g) => `#${g.rank} ${g.short} ${g.rs1m}`).join(' · ')} … #${sectors.groups.length} ${sectors.groups.at(-1).short} ${sectors.groups.at(-1).rs1m}${sectors.unranked.length ? ` · không xếp: ${sectors.unranked.map((g) => `${g.short} (${g.members} mã)`).join(', ')}` : ''}`, path: 'sectors'}] : []),
];

// --out=<file>: write the pack elsewhere and leave the live one alone (rebuilding a past session's archived pack).
const out = opt('out') ?? fmt.content.replace(/\.json$/, '.facts.json');
// The pack of the previous edition goes to the archive HERE, before it is replaced: scaffold archives the edition's
// content later, by which time this file already holds the new session (every archived *.facts.json up to 5/10 was
// the next edition's pack). Symbol reviews of that session are validated against it (symbol-review.mjs packOf).
const previous = opt('out') ? null : tryJson(out);
if (previous?.asOf && previous.asOf !== date) {
  const to = `${PATHS.archive}/${previous.asOf}-${FORMAT}.facts.json`;
  if (!exists(to)) { writeJson(to, previous); console.log(`archived the ${previous.asOf} pack -> ${to}`); }
}
writeJson(out, pack);
console.log(`${out}  ·  ${date}  ·  ${state.label}${state.rallyDay ? ` (ngày ${state.rallyDay})` : ''}  ·  ${distribution.count}/${distribution.window} phân phối  ·  FTD ${state.lastFtd?.dm ?? '—'}`);
if (flag('print')) for (const a of pack.anchors) console.log(`  ${a.label.padEnd(28)} ${a.value}`);
