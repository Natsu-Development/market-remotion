/**
 * node --test scripts/review/lib/
 *
 * Rule edges on synthetic bars, then a golden test on the real VNINDEX history
 * (content/review/vnindex.daily.json, written by scripts/review/pull.mjs) that pins the
 * state reported to the user on 2026-09-29. Thresholds come from rules.json, so a change
 * there shows up here as a failing edge, not as a silent shift in a reel.
 */
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {test} from 'node:test';
import {PATHS, abs, rules} from './common.mjs';
import {analyze, backtest} from './market-state.mjs';

const R = rules();
const P = {distribution: R.distribution, followThrough: R.followThrough};
const D = R.distribution;
const F = R.followThrough;

const r2 = (n) => Math.round(n * 100) / 100;
const date = (k) => new Date(Date.UTC(2020, 0, 1) + k * 86400e3).toISOString().slice(0, 10);

/**
 * Bars from steps. A step is {pct, v} (close moves pct% from the prior close, opens at the
 * prior close, wicks 0.1% past the body) or overrides any of {o, h, l, c}.
 */
const build = (steps, start = 1000) => {
  const bars = [{t: date(0), o: start, h: start * 1.001, l: start * 0.999, c: start, v: 100}];
  steps.forEach((s, k) => {
    const p = bars[bars.length - 1];
    const c = s.c ?? r2(p.c * (1 + (s.pct ?? 0) / 100));
    const o = s.o ?? p.c;
    bars.push({t: date(k + 1), o, h: s.h ?? r2(Math.max(o, c) * 1.001), l: s.l ?? r2(Math.min(o, c) * 0.999), c, v: s.v ?? p.v});
  });
  return bars;
};
const quiet = (n, pct = 0.05) => Array.from({length: n}, () => ({pct, v: 100}));
/** Three -2% sessions, Day 1, two quiet days, then a +1.6% day on heavier volume: the FTD on day 4. */
const INTO_UPTREND = [
  {pct: -2, v: 100}, {pct: -2, v: 100}, {pct: -2, v: 100},
  {pct: 0.5, v: 90}, {pct: 0.3, v: 90}, {pct: 0.3, v: 90},
  {pct: 1.6, v: 150},
];
/**
 * A distribution day after a quiet one: down just past the threshold on more volume. Mild on
 * purpose — six of them must not undercut the rally low, or the correction would come from
 * the FTD failing instead of from the count.
 */
const DIST = [{pct: 0.45, v: 100}, {pct: D.maxChangePercent - 0.1, v: 180}];

test('starts in correction and confirms on an FTD on exactly day 4', () => {
  const r = analyze(build(INTO_UPTREND), P);
  assert.equal(r.status, 'CONFIRMED_UPTREND');
  assert.equal(r.lastFtd.day, F.minDay);
  assert.equal(r.today.isFtd, true);
});

test('no FTD before day 4, however big the gain', () => {
  const steps = [...INTO_UPTREND.slice(0, 5), {pct: 3, v: 200}];
  const r = analyze(build(steps), P);
  assert.equal(r.status, 'RALLY_ATTEMPT');
  assert.equal(r.rallyDay, 3);
});

test('no FTD on lower volume, or below the threshold', () => {
  const lowVol = [...INTO_UPTREND.slice(0, 6), {pct: 1.6, v: 80}];
  assert.equal(analyze(build(lowVol), P).status, 'RALLY_ATTEMPT');
  const small = [...INTO_UPTREND.slice(0, 6), {pct: F.minChangePercent - 0.1, v: 150}];
  assert.equal(analyze(build(small), P).status, 'RALLY_ATTEMPT');
});

test('an undercut of the rally low resets the attempt', () => {
  const steps = [...INTO_UPTREND.slice(0, 5), {pct: -3, v: 100}];
  const r = analyze(build(steps), P);
  assert.equal(r.status, 'CORRECTION');
  assert.ok(r.transitions.some((x) => x.why === 'undercut the rally low'));
});

test('a new-low session that closes in the upper half of its range is Day 1', () => {
  const bars = build([{pct: -2, v: 100}, {pct: -2, v: 100}]);
  const p = bars[bars.length - 1];
  // Opens at the prior close, trades 3% lower, closes only 0.4% down: a reversal.
  bars.push({t: date(3), o: p.c, h: r2(p.c * 1.002), l: r2(p.c * 0.97), c: r2(p.c * 0.996), v: 100});
  const r = analyze(bars, P);
  assert.equal(r.status, 'RALLY_ATTEMPT');
  assert.equal(r.rallyDay, 1);
  assert.equal(r.rallyLow, bars[bars.length - 1].l);
});

test('a distribution day needs the threshold AND more volume', () => {
  const base = [...INTO_UPTREND, ...quiet(2)];
  assert.equal(analyze(build([...base, ...DIST]), P).distribution.count, 1);
  const sameVolume = [...base, {pct: 0.2, v: 100}, {pct: D.maxChangePercent - 0.3, v: 100}];
  assert.equal(analyze(build(sameVolume), P).distribution.count, 0);
  const tooSmall = [...base, {pct: 0.2, v: 100}, {pct: D.maxChangePercent + 0.1, v: 180}];
  assert.equal(analyze(build(tooSmall), P).distribution.count, 0);
});

test(`a distribution day counts for ${D.windowSessions} sessions, itself included`, () => {
  const lastDay = [...INTO_UPTREND, ...DIST, ...quiet(D.windowSessions - 1)];
  const r = analyze(build(lastDay), P);
  assert.equal(r.distribution.count, 1);
  assert.equal(r.distribution.active[0].sessionsLeft, 0);
  assert.equal(analyze(build([...lastDay, ...quiet(1)]), P).distribution.count, 0);
});

test(`a distribution day retires once the index trades ${D.expireRallyPercent}% above its close`, () => {
  const steps = [...INTO_UPTREND, ...DIST, ...Array.from({length: 5}, () => ({pct: 1.1, v: 90}))];
  const r = analyze(build(steps), P);
  assert.equal(r.distribution.count, 0);
  assert.equal(r.distributionLog.length, 1);
});

test(`${D.underPressureAt} distribution days = under pressure, ${D.correctionAt} = correction`, () => {
  const dd = (n) => Array.from({length: n}, () => DIST).flat();
  assert.equal(analyze(build([...INTO_UPTREND, ...dd(D.underPressureAt - 1)]), P).status, 'CONFIRMED_UPTREND');
  assert.equal(analyze(build([...INTO_UPTREND, ...dd(D.underPressureAt)]), P).status, 'UNDER_PRESSURE');
  const r = analyze(build([...INTO_UPTREND, ...dd(D.correctionAt)]), P);
  assert.equal(r.status, 'CORRECTION');
  assert.equal(r.lastFtd.ended.why, 'distribution');
});

test('an FTD clears the distribution count', () => {
  // Heavy-volume declines during the correction, then the attempt and its FTD.
  const steps = [{pct: -2, v: 150}, {pct: -2, v: 200}, {pct: -2, v: 250}, ...INTO_UPTREND.slice(3).map((s) => ({...s, v: s.v * 3}))];
  const r = analyze(build(steps), P);
  assert.equal(r.status, 'CONFIRMED_UPTREND');
  assert.equal(r.distribution.count, 0);
  assert.ok(r.distributionLog.length >= 2);
});

test('an undercut of the rally low after the FTD fails it', () => {
  const r = analyze(build([...INTO_UPTREND, ...quiet(3), {pct: -9, v: 120}]), P);
  assert.equal(r.status, 'CORRECTION');
  assert.equal(r.lastFtd.ended.why, 'failed');
});

// ------------------------------------------------------------------ golden, real data

const HISTORY = abs(PATHS.daily);
const golden = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')).filter((b) => b.t <= '2026-09-29') : null;

test('VNINDEX on 29/9/2026: 3 distribution days, confirmed uptrend since the FTD of 3/8', {skip: !golden && 'run scripts/review/pull.mjs first'}, () => {
  const r = analyze(golden, P);
  assert.equal(r.asOf, '2026-09-29');
  assert.equal(r.status, 'CONFIRMED_UPTREND');
  assert.deepEqual(r.distribution.active.map((d) => d.t), ['2026-09-11', '2026-09-23', '2026-09-24']);
  assert.deepEqual(r.distribution.active.map((d) => d.sessionsLeft), [12, 20, 21]);
  assert.equal(r.ftd.t, '2026-08-03');
  assert.equal(r.ftd.day, 5);
  assert.equal(r2(r.ftd.changePercent), 1.56);
  assert.equal(r2(r.ftd.rallyLow), 1651.2);
  assert.equal(r.since, '2026-08-03');
  assert.equal(r.today.isDistribution, false);
});

test('backtest by FTD threshold matches the plan (31 / 28 / 26 FTDs since 2013)', {skip: !golden && 'run scripts/review/pull.mjs first'}, () => {
  const rows = backtest(golden, P, {thresholds: F.backtestThresholds, forward: F.backtestForwardSessions});
  assert.deepEqual(rows.map((x) => x.ftds), [31, 28, 26]);
  // The +1.7% run's last FTD (21/8/2026) has 24 sessions behind it, not 25, so 25 of its 26 are graded.
  assert.deepEqual(rows.map((x) => x.evaluated), [31, 28, 25]);
  assert.deepEqual(rows.map((x) => x.higherPercent), [65, 75, 72]);
  assert.deepEqual(rows.map((x) => x.medianReturnPercent), [2.6, 3.7, 3.7]);
});
