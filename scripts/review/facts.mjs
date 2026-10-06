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
import {compactRow, readRequests} from './lib/requested.mjs';

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
/** The saved filters a symbol passes today, from the server's own lists — so a scene may say "ở cả ba bộ lọc". */
const filtersOf = (sym) => Object.entries(snap.filters ?? {}).filter(([, f]) => (f.symbols ?? []).includes(sym)).map(([n]) => n);
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
  const spec = R.screener.scenes[key];
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
// The chart countdown: rules.screener.leaders.from is a list of TIERS of scene keys — the names in all
// three filters first, then RS Strong ∩ Uptrend (user 2026-10-01) — and pull.mjs ranked the pool tier
// by tier, RS 1M inside a tier. The pool the reel calls "có mặt ở cả hai bộ lọc" is the LAST tier.
const LR = R.screener.leaders ?? {from: [['rs', 'uptrend']], top: 2};
const tiers = Array.isArray(LR.from) && LR.from.some(Array.isArray) ? LR.from.map((t) => [].concat(t)) : [[].concat(LR.from)];
const filtersOfTier = (t) => [...new Set(t.flatMap((k) => R.screener.scenes[k]?.filters ?? []))];
const tierOf = snap.leaders?.tierOf ?? {};
const pool = snap.members.leaders ?? [];
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
  top: (snap.picks.leaders ?? []).map((s, i) => ({...leaderDetail(s, i + 1), review: reviewOf(s), tier: tierOf[s] ?? null, tierFilters: filtersOfTier(tiers[Math.min(tierOf[s] ?? tiers.length, tiers.length) - 1])})),
  // Every name of the pool (not only the picks) that is also in the spike filter — the material of
  // loop 2 (spike → leader #1); scaffold's hookTwo picks the branch the day supports.
  alsoSpiking: pool.filter((s) => snap.members.spike.includes(s)),
};
if (snap.leaders && JSON.stringify([].concat(snap.leaders.from).some(Array.isArray) ? snap.leaders.from : [[].concat(snap.leaders.from)]) !== JSON.stringify(tiers)) {
  die(`the ${date} snapshot ranked its leaders from ${JSON.stringify(snap.leaders.from)}, rules.screener.leaders.from now says ${JSON.stringify(tiers)} — run node scripts/review/pull.mjs --rebuild first`);
}
// The names the user asked for on the review page (user 2026-10-05: "… i can choose and fill the symbol on the artifact
// to review beside existed symbol on 3 filter"; lib/requested.mjs): each one reviewed like a leader, in a `pick` scene
// after the leader scenes. The row comes from the snapshot when it kept one, else from the session's universe cache; the
// chart from content/review/analyze/<date>/<SYM>.json (pull.mjs --symbols=… --analyze-only).
// --requests=<file>: another requests file (a staging copy) in place of content/review/requests/<date>.json.
const REQ = readRequests(date, R, opt('requests') ?? undefined);
const requested = (() => {
  if (!REQ) return [];
  const uni = tryJson(`${PATHS.cache}/${date}-universe.json`)?.stocks ?? [];
  const leaderSyms = new Set(leaders.top.map((x) => x.symbol));
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
  const first = tiers.length > 1 ? leaders.tiers[0].filters : null;
  for (const t of Object.values(tables)) {
    const both = t.top.filter((x) => inAll(x, leaders.filters)).length;
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
    // The breadth LINE (scripts/review/breadth.mjs): the share above the 200-session average per
    // session, recomputed from each stock's closes, with the index close of the same session.
    const hist = tryJson('content/review/breadth.json');
    if (hist?.rows?.length && hist.asOf <= date) {
      const closeOf = new Map(bars.map((x) => [x.t, x.c]));
      const rows = hist.rows.filter((r) => r.t <= date && closeOf.has(r.t)).slice(-60)
        .map((r) => ({t: r.t, dm: dm(r.t), percent: r.percent, above: r.above, with: r.with, indexClose: round(closeOf.get(r.t), 2)}));
      if (rows.length >= 10) {
        const first = rows[0], last = rows[rows.length - 1];
        const hiRow = rows.reduce((m, r) => (r.percent > m.percent ? r : m), rows[0]);
        b.history = rows;
        b.line = {
          from: first.t, fromDm: first.dm, to: last.t, sessions: rows.length,
          first: first.percent, last: last.percent, changePoints: round(last.percent - first.percent, 1),
          peak: hiRow.percent, peakDm: hiRow.dm,
          indexFirst: first.indexClose, indexLast: last.indexClose, indexChangePercent: round(pct(last.indexClose, first.indexClose), 1),
          source: hist.source, symbols: hist.fetched,
          vsScreener: round(last.percent - b.aboveSma200Percent, 1),
        };
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
    leaders,
    ...(REQ ? {requested} : {}),
    ...(breadth ? {breadth} : {}),
  },
  ...(weekly ? {weekly} : {}),
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
  {label: `Dẫn dắt · ${leaders.from.map((k) => R.screener.scenes[k]?.photo ?? k).join(' ∩ ')} (${leaders.count} mã)`, value: leaders.top.map((s) => `${s.symbol} RS1M ${s.rs1m} · ${s.changePercent >= 0 ? '+' : ''}${v(s.changePercent)}%${s.filters?.length ? ` (${s.filters.join(', ')})` : ''}`).join(' · ') || '—', path: 'screener.leaders.top'},
  ...requested.map((s) => ({label: `Soi thêm · ${s.symbol} (người dùng chọn)`, value: `${s.price} · ${s.changePercent >= 0 ? '+' : ''}${v(s.changePercent)}% · RS1M ${s.rs1m ?? '—'}${s.filters.length ? ` · ${s.filters.join(', ')}` : ' · ngoài ba bộ lọc'} — ${s.review ? `${s.review.setup} — ${s.review.detail}` : 'chưa có bản soi của symbol-reviewer'}`, path: `screener.requested[${s.rank - 1}]`})),
  ...leaders.top.map((s, i) => ({label: `Soi mã · ${s.symbol}`, value: s.review ? `${s.review.setup} — ${s.review.detail}${s.review.pending.length ? ` (chờ: ${s.review.pending.join(', ')})` : ''}` : 'chưa có bản soi của symbol-reviewer', path: `screener.leaders.top[${i}].review`})),
  ...(breadth ? [{label: 'Độ rộng', value: `${breadth.aboveSma200}/${breadth.withSma200 ?? breadth.universe} mã trên SMA200 (${v(breadth.aboveSma200Percent, 1)}%) · ${breadth.up} tăng · ${breadth.down} giảm${breadth.line ? ` · đường ${breadth.line.sessions} phiên: ${v(breadth.line.first, 1)}% (${breadth.line.fromDm}) → ${v(breadth.line.last, 1)}% trong khi chỉ số ${breadth.line.indexChangePercent >= 0 ? '+' : ''}${v(breadth.line.indexChangePercent, 1)}%` : ''}`, path: 'screener.breadth'}] : []),
  ...(flow ? [{label: `Biến động thị trường (FireAnt, ${flow.ok ? `HOSE ${flow.dm}` : 'không dùng được'})`, value: flow.ok ? `${flow.up} tăng · ${flow.down} giảm · ${flow.flat} đứng giá (${flow.countWord}) · tiền ${v(flow.money.up, 1)} / ${v(flow.money.down, 1)} / ${v(flow.money.flat, 1)} tỷ (${flow.moneyWord}, ×${v(flow.moneyLeadRatio)}${flow.agree ? `, ${flow.agree === 'same' ? 'cùng chiều' : 'NGƯỢC chiều'} số mã` : ''}) · ảnh ${flow.fetchedIct} ICT` : flow.why, path: 'flow'}] : []),
  {label: 'Kịch bản VN-Index', value: `đóng ${v(scenario.close)} · lên: ${scenario.up.map((z) => z.members.map((m) => `${m.name} ${v(m.price)}`).join(' + ')).join(' → ') || '—'} · xuống: ${scenario.down.map((z) => z.members.map((m) => `${m.name} ${v(m.price)}`).join(' + ')).join(' → ') || '—'}`, path: 'scenario'},
  {label: 'Bộ lọc terminal', value: `cache ${pack.source.screenerCachedIct} ICT · ${snap.universe} mã · volume_vs_sma đọc là ${snap.volumeVsSmaUnit === 'percent' ? '% trên TB20' : 'bội số TB20'}`, path: 'screener'},
  {label: `Backtest FTD (${bars.length} phiên)`, value: bt.map((r) => `+${String(r.threshold).replace('.', ',')}%: ${r.ftds} FTD, ${r.higherPercent}% cao hơn sau ${R.followThrough.backtestForwardSessions} phiên`).join(' · '), path: 'backtest.rows'},
  ...(weekly ? [{label: `Tuần ${weekly.fromDm} → ${session.dm}`, value: `${weekly.changePercent >= 0 ? '+' : ''}${v(weekly.changePercent)}% · KL/phiên ×${v(weekly.volumeVsPriorWeek)} tuần trước · ${weekly.distributionDays.length} phiên phân phối`, path: 'weekly'}] : []),
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
