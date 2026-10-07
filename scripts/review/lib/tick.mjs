#!/usr/bin/env node
/**
 * The price step (bước giá) of a stock-review scene. User 2026-10-06: "Round the number with its price increment on the
 * scene review the stock, with any price must be considered, also include the trendline with this price", then "i mean
 * the cross line with any price must be considered on the scene stock review": every price a review prints or speaks is a
 * price the market can trade, and every price a branch asks the viewer to watch is a horizontal line on the chart.
 *
 * Prices are the terminal's thousands of VND. HOSE: below 10 → 0,01 (10 đ); 10 to 49,95 → 0,05 (50 đ); 50 and up → 0,1
 * (100 đ). HNX and UPCOM: 0,1 (100 đ).
 *
 *   node scripts/review/lib/tick.mjs apply <date> <SYM> [<SYM> …]   rewrite content/review/symbols/<date>/<SYM>.{json,md}:
 *                                                                   prices onto the step, a cross line per branch price
 */
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const tickOf = (price, exchange = 'HOSE') => {
  const ex = String(exchange ?? 'HOSE').toUpperCase();
  if (ex !== 'HOSE' && ex !== 'HSX') return 0.1;
  return price < 10 ? 0.01 : price < 50 ? 0.05 : 0.1;
};
/** The nearest price on the step, to two decimals. */
export const toTick = (price, exchange = 'HOSE') => {
  if (!Number.isFinite(price)) return price;
  const t = tickOf(price, exchange);
  return Math.round(Math.round(price / t) * t * 100) / 100;
};
export const onTick = (price, exchange = 'HOSE') => Number.isFinite(price) && Math.abs(toTick(price, exchange) - price) < 1e-6;

/** "27,42" → 27.42 for the prices a review writes (two decimals, comma); a percentage ("40,7%", "0,70%") is not a price. */
export const PRICE_RE = /(?<![\d,.])(\d{1,3}),(\d{2})(?![\d%]|\s*%)/g;
export const pricesIn = (text) => [...String(text ?? '').matchAll(PRICE_RE)].map((m) => Number(`${m[1]}.${m[2]}`));
const fmt = (v) => v.toFixed(2).replace('.', ',');
/**
 * The indicator values a review prints — FireAnt's MA50/MA200, the terminal's EMA50/SMA200, a trendline's value at the last
 * bar — are NOT prices to round (user 2026-10-06: "I mean with the price, not with indicator MA50/MA200 and drawed trendline"):
 * they print as measured. Keys of a review's `numbers`.
 */
export const INDICATOR_KEY = /^(ma\d+|ema\d+\w*|sma\d+\w*|trendline(Support|Resistance)(Broken)?)$/;
/** The indicator values of a review, as "27.42" strings: its indicator numbers, its trendline marks, its MA plates. */
export const indicatorValues = (r) => new Set([
  ...Object.values(r?.numbers ?? {}).filter((n) => INDICATOR_KEY.test(n?.key ?? '') && Number.isFinite(n?.value)).map((n) => n.value),
  ...(r?.marks ?? []).filter((m) => m?.kind === 'trendline' && Number.isFinite(m.price)).map((m) => m.price),
  ...(r?.marks ?? []).filter((m) => m?.kind === 'ma').flatMap((m) => pricesIn(m.label)),
].map((v) => v.toFixed(2)));
/** Every printed PRICE of `text` onto the step; the values in `keep` (indicators) stay as measured. */
export const tickText = (text, exchange = 'HOSE', keep = new Set()) =>
  String(text ?? '').replace(PRICE_RE, (all, a, b) => { const v = Number(`${a}.${b}`); return onTick(v, exchange) || keep.has(v.toFixed(2)) ? all : fmt(toTick(v, exchange)); });

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ROLE_VI = {support: 'Hỗ trợ', resistance: 'Kháng cự'};

/**
 * One review onto the price step, with a cross line per branch price: marks' prices and every printed price (labels,
 * detail, branches, verdict, price-action read) rounded; each price a branch names that lies inside the photo's window
 * and has no line yet (a level, the trendline's value, a candle read, FireAnt's MA curve) gets a `level` mark on beat 1 —
 * named from the measured swing at that price when there is one ("đáy 29/9"). The measured `numbers` keep their raw
 * values (they are the provenance).
 */
export const applyTick = (r, {exchange = 'HOSE', close = null} = {}) => {
  const out = structuredClone(r);
  const keep = indicatorValues(r);
  const T = (s) => tickText(s, exchange, keep);
  for (const m of out.marks ?? []) {
    if (m.kind === 'trendline' || m.kind === 'ma') continue;           // indicators print as measured
    if (Number.isFinite(m.price)) m.price = toTick(m.price, exchange);
    if (m.label) m.label = T(m.label);
  }
  if (out.detail?.text) out.detail.text = T(out.detail.text);
  for (const b of out.branches ?? []) { b.if = T(b.if); b.then = T(b.then); }
  if (typeof out.verdict === 'string') out.verdict = T(out.verdict);
  if (out.priceAction?.read) out.priceAction.read = T(out.priceAction.read);
  // The cross lines.
  const lo = out.window?.low, hi = out.window?.high;
  const c = close ?? (out.numbers ? Object.values(out.numbers).find((n) => n?.key === 'price')?.value : null);
  // Already lined: the marks' prices, and the indicators (each has its own line: FireAnt's MA curve, the drawn trendline).
  const lined = new Set([...(out.marks ?? []).map((m) => m.price).filter(Number.isFinite).map((v) => v.toFixed(2)), ...keep]);
  const added = [];
  for (const b of out.branches ?? []) {
    for (const p of pricesIn(`${b.if} ${b.then}`)) {
      if (!(p >= (lo ?? -Infinity) && p <= (hi ?? Infinity)) || lined.has(p.toFixed(2)) || keep.has(p.toFixed(2))) continue;
      // Named from what was measured at that price: one swing ("đáy 29/9", "đỉnh 21/9") before a zone of several swings
      // ("vùng đỉnh cũ" — MSB 13,58, 31 touches), else the role alone.
      const at = Object.values(out.numbers ?? {}).filter((n) => Number.isFinite(n?.value) && toTick(n.value, exchange).toFixed(2) === p.toFixed(2));
      const swing = at.find((n) => n.date && /^(swing(Low|High)\d*|pullbackLow|pullbackHigh)$/.test(n.key ?? ''));
      const zone = at.find((n) => /^swing-(high|low)$/.test(n.kind ?? ''));
      const role = Number.isFinite(c) && p > c ? 'resistance' : 'support';
      const dmOf = (d) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
      const what = swing ? `${/high/i.test(swing.key) ? 'đỉnh' : 'đáy'} ${dmOf(swing.date)} ` : zone ? `vùng ${zone.kind === 'swing-high' ? 'đỉnh' : 'đáy'} cũ ` : '';
      const mark = {kind: 'level', role, ref: `branch${added.length + 1}`, price: p, label: `${ROLE_VI[role]} · ${what}${fmt(p)}`, accent: role === 'support' ? 'green' : 'gold', beat: 1};
      out.marks.push(mark);
      lined.add(p.toFixed(2));
      added.push(mark.label);
    }
  }
  return {review: out, added};
};

// ---------------------------------------------------------------- CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, date, ...syms] = process.argv.slice(2);
  if (cmd !== 'apply' || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !syms.length) {
    console.error('Usage: node scripts/review/lib/tick.mjs apply <YYYY-MM-DD> <SYM> [<SYM> …]');
    process.exit(2);
  }
  const pack = (() => { try { return JSON.parse(readFileSync(resolve(ROOT, 'content/review-daily.facts.json'), 'utf8')); } catch { return null; } })();
  const rowOf = (sym) => [...(pack?.screener?.leaders?.top ?? []), ...(pack?.screener?.requested ?? [])].find((x) => x.symbol === sym) ?? null;
  for (const sym of syms.map((s) => s.toUpperCase())) {
    const p = resolve(ROOT, `content/review/symbols/${date}/${sym}.json`);
    if (!existsSync(p)) { console.error(`${sym}: no ${p}`); continue; }
    const row = rowOf(sym);
    const r = JSON.parse(readFileSync(p, 'utf8'));
    const {review, added} = applyTick(r, {exchange: row?.exchange ?? 'HOSE', close: row?.price ?? null});
    writeFileSync(p, JSON.stringify(review, null, 2) + '\n');
    const md = p.replace(/\.json$/, '.md');
    if (existsSync(md)) writeFileSync(md, tickText(readFileSync(md, 'utf8'), row?.exchange ?? 'HOSE', indicatorValues(r)));
    console.log(`${sym}: prices on the step${added.length ? `; cross lines added: ${added.join(' | ')}` : ''}`);
  }
}
