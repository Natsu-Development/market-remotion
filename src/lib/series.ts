import raw from '../../content/vnindex-monthly.json';
import meta from '../../content/vnindex-monthly.meta.json';
import rules from '../shared/content-rules.json';
import type {Candle} from '../types';

/**
 * Where the series came from. Written next to the series by scripts/fetch-market.mjs
 * (real data) or scripts/make-series.mjs (reconstruction). The footer names the source
 * only when it is real; a reconstruction is never presented as a data source.
 */
export const SERIES_META = meta as {
  source: string;
  sourceLabel: string;
  reconstructed: boolean;
  fetchedAt?: string;
  from: string;
  to: string;
  bars: number;
  volumeUnit?: string;
};

export type Bar = Candle & {up: boolean; i: number};

/** Month index used everywhere as the x coordinate: year * 12 + (month - 1). */
export const monthIndex = (t: string): number => {
  const [y, m] = t.split('-').map(Number);
  return y * 12 + (m - 1);
};

export const CANDLES: Bar[] = (raw as Candle[]).map((c) => ({
  ...c,
  up: c.c >= c.o,
  i: monthIndex(c.t),
}));

export const FIRST = CANDLES[0].i;
export const LAST = CANDLES[CANDLES.length - 1].i;

/**
 * A log-linear rail fitted through named anchor points — the same thing a
 * chartist does by eye when they draw a channel across successive peaks.
 */
type Rail = {slope: number; intercept: number};

const fit = (points: {i: number; p: number}[]): Rail => {
  const xs = points.map((q) => q.i);
  const ys = points.map((q) => Math.log(q.p));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let k = 0; k < xs.length; k++) {
    num += (xs[k] - mx) * (ys[k] - my);
    den += (xs[k] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return {slope, intercept: my - slope * mx};
};

const railAt = (r: Rail, i: number) => Math.exp(r.intercept + r.slope * i);

/**
 * The swing highs the channel runs through, and the lows that anchor the floor. Declared
 * ONCE in src/shared/content-rules.json (verify reads the same list); a month missing from
 * the series throws below, at module scope, and kills every composition.
 */
export const PEAK_MONTHS: string[] = rules.series.peakMonths;
const TROUGH_MONTHS: string[] = rules.series.troughMonths;

const priceAt = (t: string) => {
  const bar = CANDLES.find((c) => c.t === t);
  if (!bar) throw new Error(`No candle for ${t}`);
  return bar;
};

/**
 * The upper rail runs through the swing highs, the lower through the swing
 * lows, and both are forced to share the upper rail's slope so the channel is
 * a true parallelogram rather than a wedge.
 */
const upperFit = fit(PEAK_MONTHS.map((t) => ({i: monthIndex(t), p: priceAt(t).h})));
const lowerRaw = TROUGH_MONTHS.map((t) => ({i: monthIndex(t), p: priceAt(t).l}));
const lowerIntercept =
  lowerRaw.reduce((acc, q) => acc + (Math.log(q.p) - upperFit.slope * q.i), 0) / lowerRaw.length;

export const CHANNEL = {
  upper: (i: number) => railAt(upperFit, i),
  lower: (i: number) => railAt({slope: upperFit.slope, intercept: lowerIntercept}, i),
};

/** Where each peak sits, for the marker dots. */
export const PEAKS = PEAK_MONTHS.map((t) => {
  const bar = priceAt(t);
  return {t, i: bar.i, price: bar.h, close: bar.c, year: t.slice(0, 4)};
});

/** Domain of the whole drawing, padded so the channel rails stay inside. */
export const DOMAIN = (() => {
  const highs = CANDLES.map((c) => c.h).concat(CANDLES.map((c) => CHANNEL.upper(c.i)));
  const lows = CANDLES.map((c) => c.l).concat(CANDLES.map((c) => CHANNEL.lower(c.i)));
  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  // Log padding, because the chart itself is log-scaled.
  const pad = (Math.log(hi) - Math.log(lo)) * 0.06;
  return {hi: Math.exp(Math.log(hi) + pad), lo: Math.exp(Math.log(lo) - pad)};
})();

export const MAX_VOLUME = Math.max(...CANDLES.map((c) => c.v));

/** Year ticks shown on the axis. */
export const YEAR_TICKS = Array.from(
  new Set(CANDLES.map((c) => c.t.slice(0, 4))),
).filter((y) => Number(y) % 2 === 0);
