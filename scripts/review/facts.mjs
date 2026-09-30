#!/usr/bin/env node
/**
 * The fact pack of one market-review edition: every number that may reach the screen.
 *
 *   node scripts/review/facts.mjs --format=daily            latest pulled session
 *   node scripts/review/facts.mjs --format=weekly --date=2026-10-02
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
const winFrom = tryJson('content/review/breadth.json')?.rows?.[0]?.t;
const win = bars.filter((b) => (winFrom ? b.t >= winFrom : true)).slice(-60);
const winBars = win.length >= 10 ? win : bars.slice(-50);
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
    const h = fa ? {exchange: 'HSX', up: fa.up, down: fa.down, flat: fa.flat, total: fa.total, source: 'fireant.vn/thi-truong'} : term;
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
  watch.push({if: `thêm ${distribution.toUnderPressure || 0} phiên phân phối`, then: label('UNDER_PRESSURE').vi, count: distribution.toUnderPressure});
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
  rs1m: r.rs_1m, rs52w: r.rs_52w,
  filters: filtersOf(r.symbol),
});
const mv = R.screener.scenes.spike.movers ?? {gainers: 5, losers: 5};
const spikeRows = snap.members.spike.map(rowOf);
const spike = {
  filter: R.screener.scenes.spike.photo,
  count: snap.filters[R.screener.scenes.spike.photo].count,
  top: snap.picks.spike.map((s, i) => show(rowOf(s), i + 1)),
  up: spikeRows.filter((r) => r.changePercent > 0).length,
  down: spikeRows.filter((r) => r.changePercent < 0).length,
  flat: spikeRows.filter((r) => r.changePercent === 0).length,
  /** The filter's biggest gainers (descending) and losers (ascending), for the movers board. */
  gainers: spikeRows.filter((r) => r.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, mv.gainers).map((r, i) => show(r, i + 1)),
  losers: spikeRows.filter((r) => r.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, mv.losers).map((r, i) => show(r, i + 1)),
};

const leaderDetail = (sym, rank) => {
  const r = rowOf(sym);
  const a = snap.analyze?.[sym] ? tryJson(snap.analyze[sym]) : null;
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
  };
};
/**
 * One table scene of the screener (rules.screener.scenes.<key>, spike aside): its saved filter, the
 * server's count, and the rows pull.mjs ranked by the scene's own column. The user split RS Strong
 * and Uptrend into two such scenes on 2026-09-30 — no intersection is shown as a filter of its own.
 */
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
    top: (snap.picks[key] ?? []).map((s, i) => show(rowOf(s), i + 1)),
  };
};
const tables = Object.fromEntries(Object.keys(R.screener.scenes).filter((k) => k !== 'spike').map((k) => [k, tableScene(k)]));
// The chart countdown: rules.screener.leaders names the scene(s) it draws from; pull.mjs ranked them.
const LR = R.screener.leaders ?? {from: ['rs', 'uptrend'], top: 3};
const leaderFrom = [].concat(LR.from);
const leaders = {
  from: leaderFrom,
  filters: [...new Set(leaderFrom.flatMap((k) => R.screener.scenes[k]?.filters ?? []))],
  count: (snap.members.leaders ?? []).length,
  top: (snap.picks.leaders ?? []).map((s, i) => leaderDetail(s, i + 1)),
  alsoSpiking: (snap.picks.leaders ?? []).filter((s) => snap.members.spike.includes(s)),
};
if (snap.leaders && [].concat(snap.leaders.from).join() !== leaderFrom.join()) {
  die(`the ${date} snapshot ranked its leaders from ${[].concat(snap.leaders.from).join(' ∩ ')}, rules.screener.leaders.from now says ${leaderFrom.join(' ∩ ')} — run node scripts/review/pull.mjs --rebuild first`);
}

// ------------------------------------------------------------------ breadth

/**
 * How many stocks stand above their averages, and how many rose or fell — the breadth scene's
 * paradox against the index's state. Recomputed from the session's cached universe when it is
 * still on disk (a snapshot written before 2026-09-29 lacks the with-average counts).
 */
const breadth = (() => {
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
    breadth,
    spike,
    ...tables,
    leaders,
  },
  ...(weekly ? {weekly} : {}),
  backtest: {from: bars[0].t, sessions: bars.length, forward: R.followThrough.backtestForwardSessions, rows: bt.map(({threshold, ftds, evaluated, higherPercent, medianReturnPercent}) => ({threshold, ftds, evaluated, higherPercent, medianReturnPercent}))},
};

// Rows for the review page's data table (scripts/review-page.mjs reads `anchors` when present).
const v = (n, dp = 2) => (n == null ? '—' : String(round(n, dp)).replace('.', ','));
pack.anchors = [
  {label: `Phiên ${session.dmy}`, value: `${v(session.close)} (${session.changePercent >= 0 ? '+' : ''}${v(session.changePercent)}%) · KL ×${v(session.volumeRatio)} phiên trước · ×${v(session.volumeVsAvg20)} TB20`, path: 'session'},
  {label: 'Trạng thái theo quy tắc', value: `${state.label} từ ${state.sinceDm}${state.rallyDay ? ` · ngày ${state.rallyDay}` : ''}`, path: 'state'},
  {label: `Phân phối / ${distribution.window} phiên`, value: `${distribution.count}: ${dd.map((d) => `${d.dm} ${v(d.changePercent)}% ×${v(d.volumeRatio)} (còn ${d.sessionsLeft})`).join(' · ') || '—'}`, path: 'distribution.active'},
  ...(state.lastFtd ? [{label: 'FTD gần nhất', value: `${state.lastFtd.dmy} · ngày ${state.lastFtd.day} · +${v(state.lastFtd.changePercent)}% · KL ×${v(state.lastFtd.volumeRatio)} · đáy nhịp hồi ${v(state.lastFtd.rallyLow)}${state.lastFtd.ended ? ` · kết thúc ${state.lastFtd.ended.dm} (${state.lastFtd.ended.why})` : ''}`, path: 'state.lastFtd'}] : []),
  {label: `Volume spike (${spike.count} mã · ${spike.up} tăng · ${spike.down} giảm)`, value: `tăng: ${spike.gainers.map((s) => `${s.symbol} +${v(s.changePercent)}%`).join(' · ')} — giảm: ${spike.losers.map((s) => `${s.symbol} ${v(s.changePercent)}%`).join(' · ')}`, path: 'screener.spike.gainers / losers'},
  ...Object.entries(tables).map(([k, t]) => ({label: `${t.filter} (${t.count} mã · ${t.up} tăng · ${t.down} giảm)`, value: t.top.map((s) => `${s.symbol} RS1M ${s.rs1m} · ${s.changePercent >= 0 ? '+' : ''}${v(s.changePercent)}%`).join(' · ') || '—', path: `screener.${k}.top`})),
  {label: `Dẫn dắt · ${leaders.from.map((k) => R.screener.scenes[k]?.photo ?? k).join(' ∩ ')} (${leaders.count} mã)`, value: leaders.top.map((s) => `${s.symbol} RS1M ${s.rs1m} · ${s.changePercent >= 0 ? '+' : ''}${v(s.changePercent)}%${s.filters?.length ? ` (${s.filters.join(', ')})` : ''}`).join(' · ') || '—', path: 'screener.leaders.top'},
  {label: 'Độ rộng', value: `${breadth.aboveSma200}/${breadth.withSma200 ?? breadth.universe} mã trên SMA200 (${v(breadth.aboveSma200Percent, 1)}%) · ${breadth.up} tăng · ${breadth.down} giảm${breadth.line ? ` · đường ${breadth.line.sessions} phiên: ${v(breadth.line.first, 1)}% (${breadth.line.fromDm}) → ${v(breadth.line.last, 1)}% trong khi chỉ số ${breadth.line.indexChangePercent >= 0 ? '+' : ''}${v(breadth.line.indexChangePercent, 1)}%` : ''}`, path: 'screener.breadth'},
  {label: 'Bộ lọc terminal', value: `cache ${pack.source.screenerCachedIct} ICT · ${snap.universe} mã · volume_vs_sma đọc là ${snap.volumeVsSmaUnit === 'percent' ? '% trên TB20' : 'bội số TB20'}`, path: 'screener'},
  {label: `Backtest FTD (${bars.length} phiên)`, value: bt.map((r) => `+${String(r.threshold).replace('.', ',')}%: ${r.ftds} FTD, ${r.higherPercent}% cao hơn sau ${R.followThrough.backtestForwardSessions} phiên`).join(' · '), path: 'backtest.rows'},
  ...(weekly ? [{label: `Tuần ${weekly.fromDm} → ${session.dm}`, value: `${weekly.changePercent >= 0 ? '+' : ''}${v(weekly.changePercent)}% · KL/phiên ×${v(weekly.volumeVsPriorWeek)} tuần trước · ${weekly.distributionDays.length} phiên phân phối`, path: 'weekly'}] : []),
];

const out = fmt.content.replace(/\.json$/, '.facts.json');
writeJson(out, pack);
console.log(`${out}  ·  ${date}  ·  ${state.label}${state.rallyDay ? ` (ngày ${state.rallyDay})` : ''}  ·  ${distribution.count}/${distribution.window} phân phối  ·  FTD ${state.lastFtd?.dm ?? '—'}`);
if (flag('print')) for (const a of pack.anchors) console.log(`  ${a.label.padEnd(28)} ${a.value}`);
