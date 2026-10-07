/**
 * The weekly's industry ranking (user 2026-10-06: "Also include major ranking" — 'major' = ngành — then picked "ICB
 * groups by RS" over HOSE's ten sector indices): the ICB level-2 groups of content/review/industries.json
 * (scripts/review/industries.mjs, VNDirect's public classification — the terminal has no industry field) ranked on the
 * session's terminal universe by the MEDIAN RS 1M of their liquid stocks: O'Neil's industry-group ranking, read on the
 * terminal's own RS.
 *
 * Per group, the members are the stocks with volume_sma20 ≥ rules.sectors.minVolumeSma20 and an RS 1M. The group shows
 * their count, their median RS 1M (whole), the median % change of the week (SSI closes cached by breadth.mjs through
 * lib/stock-bars.mjs — null when fewer than half the members have bars; nothing here goes to the network), the share of
 * members with an SMA200 whose price is above it (whole %), and its strongest member by RS 1M (brief only). Groups with
 * fewer than rules.sectors.minMembers members are listed under `unranked`, never ranked (5/10: Bảo hiểm had one liquid
 * stock at RS 92 and would have topped the table). Order: median RS 1M, then more members, then the ICB code.
 *
 *   sectorFacts({date, R})   the pack block `sectors`, or {ok: false, why} when the universe cache or the map is missing
 *   sectorBoard({S, R})      the board visual (mode 'sector', src/scenes/FilterBoard.tsx) and the brief's row lines
 */
import {readdirSync} from 'node:fs';
import {PATHS, abs, round, signed, tryJson, vi} from './common.mjs';
import {readBars, weekChangePercent} from './stock-bars.mjs';

const median = (xs) => {
  const a = xs.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** The ranking of the newest weekly pack archived before `date`: {date, ranks: Map(code -> rank)}, or null. */
const previousRanking = (date) => {
  let files;
  try {
    files = readdirSync(abs(PATHS.archive)).filter((f) => /^\d{4}-\d{2}-\d{2}-weekly\.facts\.json$/.test(f) && f.slice(0, 10) < date).sort().reverse();
  } catch {
    return null;
  }
  for (const f of files) {
    const groups = tryJson(`${PATHS.archive}/${f}`)?.sectors?.groups;
    if (groups?.length) return {date: f.slice(0, 10), ranks: new Map(groups.map((g) => [g.code, g.rank]))};
  }
  return null;
};

/** The pack block `sectors` of the edition `date`. */
export function sectorFacts({date, R}) {
  const SR = R.sectors ?? {};
  const mapPath = SR.map ?? 'content/review/industries.json';
  const uniPath = `${PATHS.cache}/${date}-universe.json`;
  const uni = tryJson(uniPath)?.stocks;
  if (!uni?.length) return {ok: false, why: `no ${uniPath} — pull.mjs writes the session's universe there (git-ignored; a wiped cache cannot be rebuilt for a past session)`};
  const map = tryJson(mapPath);
  if (!map?.groups?.length) return {ok: false, why: `no ${mapPath} — run node scripts/review/industries.mjs`};
  const floor = SR.minVolumeSma20 ?? 100000;
  const minMembers = SR.minMembers ?? 5;
  const bySym = new Map(uni.map((s) => [s.symbol, s]));

  const rows = map.groups.map((g) => {
    const members = g.symbols.map((s) => bySym.get(s)).filter((s) => s && s.volume_sma20 >= floor && Number.isFinite(s.rs_1m));
    const weeks = members.map((s) => weekChangePercent(readBars(date, s.symbol), date));
    const priced = weeks.filter((x) => x != null).length;
    const withSma = members.filter((s) => s.sma_200 > 0);
    const best = [...members].sort((a, b) => b.rs_1m - a.rs_1m || b.volume_sma20 - a.volume_sma20 || a.symbol.localeCompare(b.symbol))[0];
    const rs = median(members.map((s) => s.rs_1m));
    const wk = members.length && priced * 2 >= members.length ? median(weeks) : null;
    return {
      code: g.code,
      name: g.name,
      short: SR.short?.[g.code] ?? g.name,
      members: members.length,
      rs1m: rs == null ? null : Math.round(rs),
      weekChangePercent: wk == null ? null : round(wk, 2),
      aboveSma200Share: withSma.length ? Math.round((100 * withSma.filter((s) => s.current_price > s.sma_200).length) / withSma.length) : null,
      strongest: best ? {symbol: best.symbol, rs1m: best.rs_1m} : null,
      _rs: rs,
    };
  });

  const ranked = rows
    .filter((r) => r.members >= minMembers && r._rs != null)
    .sort((a, b) => b._rs - a._rs || b.members - a.members || a.code.localeCompare(b.code));
  const prev = previousRanking(date);
  const strip = ({_rs, ...r}) => r;
  return {
    ok: true,
    source: map.source ?? SR.source,
    mapFetchedAt: map.fetchedAt,
    minVolumeSma20: floor,
    minMembers,
    sortBy: 'medianRs1m',
    comparedWith: prev?.date ?? null,
    groups: ranked.map((r, i) => ({rank: i + 1, ...strip(r), prevRank: prev?.ranks.get(r.code) ?? null})),
    unranked: rows.filter((r) => !ranked.includes(r)).sort((a, b) => b.members - a.members || a.code.localeCompare(b.code))
      .map(({code, name, short, members}) => ({code, name, short, members})),
  };
}

const FOCUS_LABEL = ['', 'Nhóm ngành dẫn đầu', 'Hai nhóm ngành dẫn đầu', 'Ba nhóm ngành dẫn đầu'];

/**
 * The drawn ranking: one row per ranked group, at most rules.sectors.top (≤ 10), the strongest three lit on beat 2.
 * Rows carry the figures as the board prints them (members and the shares whole, the week's change 2dp), so verify's
 * facts check traces each one to the pack.
 */
export function sectorBoard({S, R}) {
  const SR = R.sectors ?? {};
  const columns = SR.columns ?? ['members', 'rs1m', 'weekChange', 'aboveSma200Share'];
  const top = S.groups.slice(0, Math.min(SR.top ?? 10, 10));
  const nFocus = Math.min(SR.focus ?? 3, top.length, 3);
  const rows = top.map((g, i) => ({
    name: g.short,
    members: g.members,
    rs1m: g.rs1m,
    ...(columns.includes('weekChange') && g.weekChangePercent != null ? {weekChangePercent: g.weekChangePercent} : {}),
    ...(columns.includes('aboveSma200Share') && g.aboveSma200Share != null ? {aboveSma200Share: g.aboveSma200Share} : {}),
    ...(i < nFocus ? {focus: true} : {}),
  }));
  const label = FOCUS_LABEL[nFocus];
  const visual = {
    type: 'board',
    mode: 'sector',
    caption: 'NHÓM NGÀNH ICB · XẾP THEO RS 1M TRUNG VỊ',
    columns,
    rows,
    ...(nFocus ? {emphasis: [{beat: 1, set: 'focus', dim: true, label}]} : {}),
  };
  const rowLines = top.map((g) => [
    `#${g.rank} ${g.name}${g.short !== g.name ? ` (bảng in "${g.short}")` : ''}: ${g.members} mã`,
    `RS 1M trung vị ${g.rs1m}`,
    g.weekChangePercent != null ? `tuần ${signed(g.weekChangePercent)}%` : 'tuần —',
    g.aboveSma200Share != null ? `${g.aboveSma200Share}% trên SMA200` : null,
    g.strongest ? `mạnh nhất ${g.strongest.symbol} (RS 1M ${g.strongest.rs1m})` : null,
    g.prevRank != null ? `tuần trước hạng ${g.prevRank}` : null,
  ].filter(Boolean).join(' · '));
  return {visual, rowLines, top, focus: top.slice(0, nFocus), label, floorText: vi(S.minVolumeSma20 / 1000, 0)};
}
