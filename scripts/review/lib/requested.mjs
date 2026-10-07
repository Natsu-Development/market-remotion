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
 * The key of an edition's requests — the artifact db doc `requests/<key>` and content/review/requests/<key>.json: the
 * session date for the daily, `<date>-<format>` for any other format. A weekly edition can close on a daily's session
 * (6/10: both), and the two reels must never read each other's names (weekly session 6e, 2026-10-06). Use it as
 * readRequests(date, R, requestsPath(requestKey(format, date))).
 */
export const requestKey = (format, date) => (!format || format === 'daily' ? date : `${date}-${format}`);

/**
 * What the review page's "Soi thêm mã" box lists (user 2026-10-05: "Option 2, listing it existed on what filter for me"):
 * every stock in at least `min` of the reel's saved-filter scenes, each with the filters it is in, most filters first, then
 * RS 1M. The scenes are the format's own when it has them (rules.formats.<format>.screener.scenes — the weekly's Momentum
 * breakout/breakdown, min = its screener.requested.listMinFilters, else 1) or the shared rules.screener.scenes (the daily's
 * three, min = rules.screener.requested.listMinFilters, else 2). `members` = the session snapshot's members (the pack keeps
 * only top rows), `rows` = symbol → universe row, `taken` = the names the reel reviews itself (tagged).
 */
export const requestPool = ({R, format, members = {}, rows = new Map(), taken = []}) => {
  const own = R.formats?.[format]?.screener?.scenes ? R.formats[format].screener : null;
  const specs = own ? own.scenes : R.screener?.scenes ?? {};
  const scenes = Object.keys(specs).filter((k) => Array.isArray(members[k])).map((k) => ({key: k, label: specs[k].photo ?? k}));
  const min = own ? own.requested?.listMinFilters ?? 1 : R.screener?.requested?.listMinFilters ?? 2;
  const pool = [...new Set(scenes.flatMap((s) => members[s.key]))]
    .map((sym) => {
      const u = rows.get(sym) ?? {};
      const filters = scenes.filter((s) => members[s.key].includes(sym)).map((s) => s.label);
      return {sym, filters, rs1m: u.rs_1m ?? null, change: u.price_change_pct ?? null, reviewed: taken.includes(sym)};
    })
    .filter((r) => r.filters.length >= min)
    .sort((a, b) => b.filters.length - a.filters.length || (b.rs1m ?? -1) - (a.rs1m ?? -1) || a.sym.localeCompare(b.sym));
  return {own: !!own, scenes, min, pool};
};

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
