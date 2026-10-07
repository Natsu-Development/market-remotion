#!/usr/bin/env node
/**
 * The ICB industry map behind the weekly's sector ranking (user 2026-10-06: "Also include major ranking" — 'major' =
 * ngành — and picked "ICB groups by RS"): VNDirect finfo's public ICB classification at level 2, the 19 groups
 * (Ngân hàng, Dịch vụ tài chính, Dầu khí, …) with the tickers each one holds. The terminal has no industry field, so
 * this is the one outside map; GET only, no auth.
 *
 *   node scripts/review/industries.mjs            fetch when the map on disk is older than rules.sectors.maxAgeDays
 *   node scripts/review/industries.mjs --refresh  always fetch
 *
 * Writes content/review/industries.json: {fetchedAt, source, url, groups: [{code, name, nameEn, symbols[]}]}.
 * facts.mjs --format=weekly ranks the groups from it and the session's terminal universe (rules.sectors).
 * Exit codes: 0 written or still fresh, 2 the source failed and no map is on disk.
 */
import {cli, die, readJson, rules, tryJson, writeJson} from './lib/common.mjs';

const {flag} = cli();
const S = rules().sectors ?? die('rules.json has no `sectors` block');
const MAP = S.map ?? 'content/review/industries.json';
const maxAgeDays = S.maxAgeDays ?? 7;

const onDisk = tryJson(MAP);
const ageDays = onDisk?.fetchedAt ? (Date.now() - new Date(onDisk.fetchedAt).getTime()) / 86400e3 : Infinity;
if (!flag('refresh') && ageDays < maxAgeDays) {
  console.log(`${MAP}: ${onDisk.groups.length} groups, fetched ${onDisk.fetchedAt} (${ageDays.toFixed(1)} days, fresh under ${maxAgeDays}) — kept; --refresh to fetch again`);
  process.exit(0);
}

let body;
try {
  const res = await fetch(S.url, {headers: {'User-Agent': 'Mozilla/5.0', Accept: 'application/json'}, signal: AbortSignal.timeout(30000)});
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  body = await res.json();
} catch (e) {
  if (onDisk?.groups?.length) {
    console.warn(`${S.url} failed (${e.message}) — keeping ${MAP} of ${onDisk.fetchedAt}`);
    process.exit(0);
  }
  die(`${S.url} failed: ${e.message} — and there is no ${MAP} to fall back on`);
}

const groups = (body?.data ?? [])
  .filter((g) => String(g.industryLevel) === '2' && g.codeList)
  .map((g) => ({
    code: String(g.industryCode),
    name: String(g.vietnameseName ?? '').trim(),
    nameEn: String(g.englishName ?? '').trim(),
    symbols: [...new Set(String(g.codeList).split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{3}$/.test(s)))].sort(),
  }))
  .sort((a, b) => a.code.localeCompare(b.code));
if (groups.length < 10) die(`${S.url} returned ${groups.length} level-2 groups — expected about 19; ${MAP} left as it was`);

// A ticker listed in two groups would count twice in the ranking: report it (none on 2026-10-06).
const seen = new Map();
for (const g of groups) for (const s of g.symbols) seen.set(s, [...(seen.get(s) ?? []), g.code]);
const twice = [...seen].filter(([, codes]) => codes.length > 1);

writeJson(MAP, {
  fetchedAt: new Date().toISOString(),
  source: S.source,
  url: S.url,
  _note: 'ICB level 2 (VNDirect finfo industry_classification); one ticker belongs to one group. Read by facts.mjs --format=weekly (pack key `sectors`).',
  groups,
});
const total = groups.reduce((a, g) => a + g.symbols.length, 0);
console.log(`${MAP}: ${groups.length} groups, ${total} tickers${twice.length ? ` — ${twice.length} in more than one group: ${twice.slice(0, 5).map(([s, c]) => `${s} (${c.join(', ')})`).join('; ')}` : ''}`);
for (const g of groups) console.log(`  ${g.code} ${g.name.padEnd(32)} ${String(g.symbols.length).padStart(4)}`);
if (readJson(MAP).groups.length !== groups.length) die(`${MAP} did not round-trip`);
