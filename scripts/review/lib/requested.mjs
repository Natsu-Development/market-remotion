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
export const requestPool = ({R, format, members = {}, picks = {}, filters = {}, rows = new Map(), taken = []}) => {
  const own = R.formats?.[format]?.screener?.scenes ? R.formats[format].screener : null;
  const specs = own ? own.scenes : R.screener?.scenes ?? {};
  // A union scene the format shows (the weekly's watchlist, user 2026-10-18: "The table be using for select the stock to
  // review"): the box lists ITS rows — the table's top N, in its order — each tagged with every saved filter that found the
  // name (the server's own lists, as the table's chips are).
  const unionKey = Object.keys(specs).find((k) => ['any', 'base'].includes(specs[k].match) && (R.formats?.[format]?.roles ?? []).includes(k) && Array.isArray(members[k]));
  if (unionKey) {
    const spec = specs[unionKey];
    const top = Array.isArray(picks[unionKey]) ? picks[unionKey] : members[unionKey].slice(0, spec.top ?? 10);
    // (a base scene — RS Strong since 2026-10-18 evening — lists every name of its base filter, in the table's order)
    const scenes = spec.filters.map((n) => ({key: n, label: n}));
    const pool = top.map((sym) => {
      const u = rows.get(sym) ?? {};
      return {sym, filters: spec.filters.filter((n) => (filters[n]?.symbols ?? []).includes(sym)), rs1m: u.rs_1m ?? null, change: u.price_change_pct ?? null, reviewed: taken.includes(sym)};
    });
    return {own: true, scenes, min: 1, pool, union: unionKey};
  }
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
 * How many names a reel's "Soi thêm mã" box takes and its requests file keeps: the format's own
 * rules.formats.<format>.screener.requested.max (the weekly reviews only the names the user picks — user 2026-10-09:
 * "i will select the symbol to review with weekly not follow by the filter value and rule"), else the shared
 * rules.screener.requested.max, else 3.
 */
export const requestMax = (R, format) => R.formats?.[format]?.screener?.requested?.max ?? R.screener?.requested?.max ?? 3;

/**
 * The edition's requested names: uppercase three-character tickers, de-duplicated, at most requestMax(R, format) (the
 * rest come back in `dropped`). `format` defaults to the one the file's key names (`<date>-weekly.json` → weekly; the
 * daily's bare `<date>.json` → none), so facts.mjs's readRequests(date, R, requestsPath(requestKey(FORMAT, date)))
 * caps the weekly at its own max. null when the edition has no requests file.
 */
export const readRequests = (date, R, path = requestsPath(date), format = /-([a-z]+)\.json$/.exec(path)?.[1]) => {
  const j = tryJson(path);
  if (!j) return null;
  const max = requestMax(R, format);
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
  // `review` (user 2026-10-18: "just review the HDB, VPB, GMD and DCL not need review all my picked stock"): the names, in
  // order, that get a chart scene; the rest of `symbols` are listed only (the weekly's "Mã đáng chú ý tuần sau" board).
  // Absent = every name is reviewed, as before. `symbols` here is the reviewed list (every reader before 18/10 meant that);
  // `listed` is every pick.
  const listed = symbols.slice(0, max);
  const review = Array.isArray(j.review)
    ? [...new Set(j.review.map((x) => String(x ?? '').trim().toUpperCase()))].filter((t) => listed.includes(t))
    : null;
  // `skip` (user 2026-10-20: "Remove the ORS review, also review for me the VPB and DGW"): names the rule picked as leaders
  // that this edition does NOT review — one edition's choice, the rule (rules.formats.daily.leaders) unchanged.
  const skip = [...new Set([].concat(j.skip ?? []).map((x) => String(x ?? '').trim().toUpperCase()))].filter((t) => /^[A-Z0-9]{3}$/.test(t));
  // `say` (user 2026-10-21: "Also include the sentence and enrich its meaning on this video: …"): the user's own sentence
  // for this edition and the scene that speaks it ({scene: "flow", text}) — scaffold gives it a beat of its own and the
  // writer keeps the words. `spotlight` ({scene: "shortlist", symbols}): the names that sentence calls, lit on a board.
  const say = [].concat(j.say ?? []).filter((x) => typeof x?.text === 'string' && x.text.trim() && x.scene).map((x) => ({scene: String(x.scene), text: x.text.trim()}));
  const spotlight = [].concat(j.spotlight ?? []).filter((x) => x?.scene && Array.isArray(x.symbols)).map((x) => ({
    scene: String(x.scene),
    symbols: [...new Set(x.symbols.map((t) => String(t ?? '').trim().toUpperCase()))].filter((t) => /^[A-Z0-9]{3}$/.test(t)),
  })).filter((x) => x.symbols.length);
  return {edition: j.edition ?? date, symbols: review ?? listed, listed, reviewOnly: !!review, dropped: symbols.slice(max), invalid, skip, say, spotlight, source: j.source ?? null, readAt: j.readAt ?? null, path};
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
