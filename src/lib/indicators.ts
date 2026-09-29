/** Exponential moving average over a value series. */
export const ema = (values: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
};

export type Macd = {
  macd: number[];
  signal: number[];
  histogram: number[];
};

/** Standard MACD(12, 26, 9). */
export const macd = (closes: number[], fast = 12, slow = 26, smoothing = 9): Macd => {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = f.map((v, i) => v - s[i]);
  const signal = ema(line, smoothing);
  return {
    macd: line,
    signal,
    histogram: line.map((v, i) => v - signal[i]),
  };
};

/**
 * Wilder's RSI. The first `period` entries have no reading and come back null,
 * so callers draw from index `period` onward rather than from zero.
 */
export const rsi = (closes: number[], period = 14): (number | null)[] => {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const value = () => 100 - 100 / (1 + gain / (loss || 1e-9));
  out[period] = value();

  // Wilder smoothing: each step folds one new bar into the running averages.
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
};
