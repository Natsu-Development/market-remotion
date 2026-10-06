/**
 * Names the user asks the reel to review on top of the filters' leaders (user 2026-10-05: "With this skill, edit for me
 * i can choosen and fill the symbol on the artifact to review beside existed symbol on 3 filter"). The review page saves
 * them in its artifact's db (doc `requests/<edition>`); the director reads that doc (ArtifactData get) and writes
 * content/review/requests/<date>.json — the only thing the scripts read:
 *
 *   {edition: "<date>", symbols: ["FPT", …], source: "artifact db requests/<date>", readAt: "<iso>"}
 *
 * Each name becomes a `pick` scene after the leader scenes (scaffold.mjs), photographed and reviewed like a leader.
 */
import {round, tryJson} from './common.mjs';

export const requestsPath = (date) => `content/review/requests/${date}.json`;

/**
 * The edition's requested names: uppercase three-character tickers, de-duplicated, at most rules.screener.requested.max
 * (the rest come back in `dropped`). null when the edition has no requests file.
 */
export const readRequests = (date, R, path = requestsPath(date)) => {
  const j = tryJson(path);
  if (!j) return null;
  const max = R.screener?.requested?.max ?? 3;
  const seen = new Set();
  const symbols = [];
  const invalid = [];
  for (const s of [].concat(j.symbols ?? [])) {
    const t = String(s ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3}$/.test(t)) { if (t) invalid.push(t); continue; }
    if (seen.has(t)) continue;
    seen.add(t);
    symbols.push(t);
  }
  return {edition: j.edition ?? date, symbols: symbols.slice(0, max), dropped: symbols.slice(max), invalid, source: j.source ?? null, readAt: j.readAt ?? null, path};
};

const volumeRatio = (s) => (s.volume_sma20 > 0 ? s.current_volume / s.volume_sma20 : null);

/** A universe row (the terminal's /stocks/filter fields) in the snapshot's compact shape — pull.mjs writes rows this way. */
export const compactRow = (s) => ({
  name: s.name ?? null, exchange: s.exchange ?? null,
  price: s.current_price, changePercent: s.price_change_pct,
  volume: s.current_volume, volumeSma20: s.volume_sma20, volumeRatio: volumeRatio(s) == null ? null : round(volumeRatio(s), 4),
  rs_1m: s.rs_1m, rs_3m: s.rs_3m, rs_6m: s.rs_6m, rs_9m: s.rs_9m, rs_52w: s.rs_52w,
  ema_9: s.ema_9, ema_21: s.ema_21, ema_50: s.ema_50, sma_200: s.sma_200,
  signals: Object.fromEntries(Object.entries(s).filter(([k, v]) => k.startsWith('has_') && v)),
});
