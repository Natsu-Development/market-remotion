/**
 * Distribution days, follow-through days and the market status, from daily index bars.
 *
 * Pure: bars in, facts out — no clock, no network, no files. Every threshold comes from
 * the `distribution` and `followThrough` blocks of .claude/skills/market-review/rules.json.
 *
 * The rules are William O'Neil's (IBD), as Minervini uses them for market timing:
 *
 *   distribution day   close ≤ D.maxChangePercent vs the prior close, on volume above the
 *                      prior session. It counts for D.windowSessions sessions (itself
 *                      included) and drops out early once a later intraday high reaches
 *                      its close × (1 + D.expireRallyPercent%).
 *   status             in an uptrend, D.underPressureAt active DDs = under pressure,
 *                      D.correctionAt = correction.
 *   rally attempt      in a correction, Day 1 is the first up close — or, with
 *                      F.day1UpperHalfClose, a new-low session that closes in the upper
 *                      half of its range. An intraday low under the rally low resets it.
 *   follow-through     day F.minDay or later of the attempt, close ≥ F.minChangePercent
 *                      on volume above the prior session. It confirms the uptrend and,
 *                      with D.resetOnFtd, clears the distribution count. An intraday low
 *                      under the rally low afterwards fails it.
 *
 * The machine starts in CORRECTION at the first bar and settles after its first FTD, so
 * feed it years of history, not weeks. It is a mechanical version of calls IBD makes
 * partly by judgment; the reels say "theo quy tắc".
 */

export const STATUSES = ['CONFIRMED_UPTREND', 'UNDER_PRESSURE', 'CORRECTION', 'RALLY_ATTEMPT'];
const UPTREND = new Set(['CONFIRMED_UPTREND', 'UNDER_PRESSURE']);

/**
 * @param bars   [{t: 'YYYY-MM-DD', o, h, l, c, v}], oldest first, finished sessions only
 * @param params {distribution, followThrough} from rules.json
 */
export function analyze(bars, {distribution: D, followThrough: F}) {
  if (!Array.isArray(bars) || bars.length < 2) throw new Error('analyze: need at least two bars');
  const pct = (i) => (bars[i].c / bars[i - 1].c - 1) * 100;

  let status = 'CORRECTION';
  let since = bars[0].t;
  let low = Infinity;        // lowest low of the current correction
  let rallyLow = null;       // low the current attempt (or the confirmed uptrend) must hold
  let rallyDay = 0;
  let day1 = null;
  let ftd = null;            // the FTD that confirmed the current uptrend
  let active = [];           // distribution days still counting
  const ftds = [];
  const transitions = [];
  const log = [];

  const move = (i, to, why) => {
    if (to === status) return;
    transitions.push({t: bars[i].t, from: status, to, why});
    status = to;
    since = bars[i].t;
  };
  const isDay1 = (i) => {
    const x = bars[i];
    if (x.c > bars[i - 1].c) return true;
    if (!F.day1UpperHalfClose) return false;
    const range = x.h - x.l;
    return range > 0 && x.l <= low && (x.c - x.l) / range >= 0.5;
  };
  const startAttempt = (i) => {
    rallyLow = low;
    rallyDay = 1;
    day1 = bars[i].t;
    move(i, 'RALLY_ATTEMPT', 'day 1 of a rally attempt');
  };

  for (let i = 1; i < bars.length; i++) {
    const x = bars[i];
    const p = bars[i - 1];
    const change = pct(i);
    const volumeUp = x.v > p.v;

    // 1. Age the distribution days, then record today's.
    for (const d of active) d.maxHigh = Math.max(d.maxHigh, x.h);
    active = active.filter((d) => i - d.i < D.windowSessions && d.maxHigh < d.close * (1 + D.expireRallyPercent / 100));
    const isDist = change <= D.maxChangePercent && (!D.volumeAbovePrior || volumeUp);
    const range = x.h - x.l;
    const isStall = !isDist && D.stalling?.enabled && change > 0 && change <= D.stalling.maxChangePercent
      && x.v >= p.v * D.stalling.minVolumeVsPrior && range > 0 && (x.c - x.l) / range < 0.5;
    if (isDist || isStall) {
      const rec = {i, t: x.t, kind: isDist ? 'distribution' : 'stalling', changePercent: change, volumeRatio: x.v / p.v, close: x.c, maxHigh: -Infinity};
      active.push(rec);
      log.push(rec);
    }

    // 2. Move the status.
    if (status === 'CORRECTION') {
      low = Math.min(low, x.l);
      if (isDay1(i)) startAttempt(i);
      continue;
    }
    if (status === 'RALLY_ATTEMPT') {
      if (x.l < rallyLow) {
        low = x.l;
        rallyDay = 0;
        move(i, 'CORRECTION', 'undercut the rally low');
        if (isDay1(i)) startAttempt(i);   // a reversal session can open the next attempt
        continue;
      }
      rallyDay++;
      if (rallyDay >= F.minDay && change >= F.minChangePercent && (!F.volumeAbovePrior || volumeUp)) {
        ftd = {i, t: x.t, day: rallyDay, changePercent: change, volumeRatio: x.v / p.v, close: x.c, low: x.l, rallyLow, day1};
        ftds.push(ftd);
        if (D.resetOnFtd) active = [];
        move(i, 'CONFIRMED_UPTREND', 'follow-through day');
      }
      continue;
    }
    // CONFIRMED_UPTREND or UNDER_PRESSURE
    if (x.l < ftd.rallyLow) {
      ftd.ended = {t: x.t, why: 'failed'};
      low = x.l;
      rallyDay = 0;
      move(i, 'CORRECTION', 'the FTD failed: undercut the rally low');
      continue;
    }
    if (active.length >= D.correctionAt) {
      ftd.ended = {t: x.t, why: 'distribution'};
      low = x.l;
      rallyDay = 0;
      move(i, 'CORRECTION', `${active.length} distribution days`);
      continue;
    }
    move(i, active.length >= D.underPressureAt ? 'UNDER_PRESSURE' : 'CONFIRMED_UPTREND', `${active.length} distribution days`);
  }

  const T = bars.length - 1;
  const last = bars[T];
  const clean = ({i, maxHigh, ...rest}) => rest;
  return {
    asOf: last.t,
    status,
    since,
    rallyDay: status === 'RALLY_ATTEMPT' ? rallyDay : null,
    day1: status === 'RALLY_ATTEMPT' ? day1 : null,
    /** The low that must hold: the attempt's while it runs, the FTD's rally low in an uptrend. */
    rallyLow: status === 'RALLY_ATTEMPT' ? rallyLow : UPTREND.has(status) ? ftd.rallyLow : null,
    correctionLow: status === 'CORRECTION' ? low : null,
    ftd: UPTREND.has(status) ? clean(ftd) : null,
    lastFtd: ftds.length ? clean(ftds[ftds.length - 1]) : null,
    distribution: {
      count: active.length,
      active: active.map((d) => ({
        t: d.t,
        kind: d.kind,
        changePercent: d.changePercent,
        volumeRatio: d.volumeRatio,
        close: d.close,
        sessionsAgo: T - d.i,
        /** Sessions after today in which it still counts, unless the +5% rule retires it first. */
        sessionsLeft: D.windowSessions - 1 - (T - d.i),
        expireLevel: d.close * (1 + D.expireRallyPercent / 100),
      })),
    },
    today: {
      t: last.t,
      changePercent: pct(T),
      volumeRatio: last.v / bars[T - 1].v,
      isDistribution: log.length > 0 && log[log.length - 1].i === T,
      isFtd: ftds.length > 0 && ftds[ftds.length - 1].i === T,
    },
    transitions,
    ftds: ftds.map((f) => ({...clean(f), index: f.i})),
    distributionLog: log.map(clean),
  };
}

/** Median of a numeric array (upper median for an even count). */
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

/**
 * How often an FTD led to a higher close `forward` sessions later, per FTD threshold.
 * A rough test: windows overlap and there are no stops. It is there so the threshold in
 * rules.json is a choice made with numbers, not a default taken on faith.
 */
export function backtest(bars, params, {thresholds, forward = 25}) {
  return thresholds.map((threshold) => {
    const r = analyze(bars, {...params, followThrough: {...params.followThrough, minChangePercent: threshold}});
    const rows = r.ftds.map((f) => {
      const j = Math.min(f.index + forward, bars.length - 1);
      return {...f, forwardReturn: bars[j].c / f.close - 1, complete: f.index + forward < bars.length};
    });
    const done = rows.filter((x) => x.complete);
    const higher = done.filter((x) => x.forwardReturn > 0).length;
    return {
      threshold,
      ftds: rows.length,
      evaluated: done.length,
      higher,
      higherPercent: done.length ? Math.round((100 * higher) / done.length) : null,
      medianReturnPercent: done.length ? Math.round(1000 * median(done.map((x) => x.forwardReturn))) / 10 : null,
      afterDay7: rows.filter((x) => x.day > 7).length,
      failed: rows.filter((x) => x.ended?.why === 'failed').length,
    };
  });
}
