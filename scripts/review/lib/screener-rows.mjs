/**
 * Reads the rows js/screener.js recorded in a Screener photo's sidecar (`js.rows`, each with a
 * `symbol` and `cells: [{col, text, rect}]`).
 *
 * topMatches(rows, sortColumn, want): are the fact pack's picks the photo's top rows? The photo is
 * sorted descending by one column and the picks are pull.mjs's top N by the same field, so the two
 * agree unless the terminal broke a tie differently: three names at RS 1M 94 came back in another
 * order on 2026-09-29, and once a tie straddles the cut (rows 3, 4 and 5 all at 94) a different name
 * can sit in row 3. So the rule is: every pick is in the photo, and every non-pick row above the
 * deepest pick ties with the weakest pick on the sort column. Anything else means the screener
 * moved since pull.mjs, or the page was sorted on another column.
 */
const num = (text) => {
  const m = String(text ?? '').replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

/** The sort column's value in one recorded row, or NaN when the sidecar has no such cell. */
export const sortValue = (row, sortColumn) => num(row?.cells?.find((c) => c.col === sortColumn)?.text);

/** {ok, why} — `want` are the picked symbols, in any order. */
export const topMatches = (rows, sortColumn, want) => {
  const at = want.map((s) => rows.findIndex((r) => r.symbol === s));
  const missing = want.filter((s, k) => at[k] < 0);
  if (missing.length) {
    return {ok: false, why: `${missing.join(', ')} not among the photo's ${rows.length} rows (${rows.map((r) => r.symbol).join(', ') || 'none'})`};
  }
  const vals = at.map((i) => sortValue(rows[i], sortColumn));
  if (!vals.length) return {ok: true, why: 'nothing to pick'};
  if (vals.some((v) => !Number.isFinite(v))) {
    // An older sidecar without cell texts: membership is all that can be checked.
    const got = rows.slice(0, want.length).map((r) => r.symbol);
    const same = [...got].sort().join() === [...want].sort().join();
    return {ok: same, why: same ? `the picks are the top ${want.length} rows (no "${sortColumn}" cell to read ties from)` : `the photo's top ${want.length} are ${got.join(', ')}, the picks ${want.join(', ')}`};
  }
  const weakest = Math.min(...vals);
  const deepest = Math.max(...at);
  const intruders = rows.slice(0, deepest).filter((r) => !want.includes(r.symbol) && Math.abs(sortValue(r, sortColumn) - weakest) > 1e-9);
  if (intruders.length) {
    return {ok: false, why: `${intruders.map((r) => `${r.symbol} (${sortColumn} ${sortValue(r, sortColumn)})`).join(', ')} sit above the weakest pick (${sortColumn} ${weakest}) without tying it`};
  }
  const positions = [...at].sort((a, b) => a - b).map((i) => i + 1);
  return {ok: true, why: deepest >= want.length ? `tie at ${sortColumn} ${weakest}: the picks sit in rows ${positions.join(', ')}` : `the picks are the top ${want.length} rows`};
};
