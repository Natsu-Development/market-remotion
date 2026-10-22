/**
 * The drawn board of a screener table scene — rs and uptrend, `rules.screener.scenes.<key>.visual: "board"`
 * (src/scenes/FilterBoard.tsx). User 2026-10-01 evening: "Make the RS strong scene more attractive, must have the
 * RS1M column, price change & more info", and the Uptrend scene "must have more info and attractive like … RS strong".
 * User 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter. … RS strong (sort by
 * RS1M - with 1 column - decoration and animation with the symbol need focused), uptrend (sort by RS1M - 1 column -
 * behavior like the RS strong)."
 *
 * One full-width table of up to ten names ranked by RS 1M: price, the day's change, RS 1M with its bar, and two
 * columns that say what the filter is about — RS 52W and volume vs the 20-session average for RS Strong; how far
 * price sits above EMA50 and SMA200 for Uptrend (the filter is price > EMA50 > SMA200). The board never says which
 * other filter a name is in. The names the reel reviews next — the leader scenes in their order, then the names the
 * user asked for on the review page — are the board's FOCUS when they are among its rows: marked once the rows have
 * landed, lit on beat 2 (the others dimmed, plate '<picksLabel>: MSR · DGW'), the same on every board.
 *
 * Every figure comes from the fact pack row as it is (facts.mjs rounds it the way the board prints it), so verify's
 * facts check traces each one.
 */
import {signed, vi} from './common.mjs';

/** Default columns per scene key; `rules.screener.scenes.<key>.board.columns` (or the format's own scene spec) overrides. */
export const BOARD_COLUMNS = {
  rs: ['price', 'change', 'rs1m', 'rs52w', 'volume'],
  uptrend: ['price', 'change', 'rs1m', 'aboveEma50', 'aboveSma200'],
  // The weekly's Momentum boards (2026-10-06): the WEEK's change, the terminal's trendline signal, RS 52W.
  breakout: ['price', 'weekChange', 'rs1m', 'signal', 'rs52w'],
  breakdown: ['price', 'weekChange', 'rs1m', 'signal', 'rs52w'],
};
/** The fact-pack field behind each optional column. */
const FIELD = {rs52w: 'rs52w', rs3m: 'rs3m', volume: 'volumeVsSma20Percent', aboveEma50: 'aboveEma50Percent', aboveSma200: 'aboveSma200Percent', weekChange: 'weekChangePercent', signal: 'signal', filters: 'filters', watchUp: 'watchUp', watchDown: 'watchDown'};

/**
 * The state plate of a format's own board (2026-10-09, director + trader-viewer review: a 2-name breakout board with no
 * review "reads as a tip list — I would screenshot MSB/PVS and buy Monday"): the market's state by the rule — the danger
 * tier when it is reached (rules.distribution.danger), else rules.status.<state>.short — and the list's nature
 * (`board.list` of the scene spec: "danh sách cảnh báo" / "danh sách theo dõi").
 */
const lower1 = (s) => String(s ?? '').charAt(0).toLowerCase() + String(s ?? '').slice(1);
export const stateOf = (F, R) => {
  const st = F.state?.status;
  if (st !== 'CORRECTION' && st !== 'RALLY_ATTEMPT' && F.distribution?.danger) return {value: lower1(R.distribution?.danger?.vi ?? 'Mức nguy hiểm'), accent: 'red'};
  const accent = st === 'CORRECTION' ? 'red' : st === 'CONFIRMED_UPTREND' ? 'green' : 'gold';
  // A rally attempt reads in full, in the user's word order (2026-10-08 "nỗ lực phục hồi"; the daily's 9/10 headlines and
  // narration say it so): status.RALLY_ATTEMPT.short "Hồi phục" alone would read as a recovery that has happened.
  if (st === 'RALLY_ATTEMPT') return {value: 'nỗ lực phục hồi', accent};
  return {value: lower1(R.status?.[st]?.short ?? F.state?.label ?? '—'), accent};
};
/** How a signal group of the saved filter reads on the definition plate. */
const SIGNAL_LINE = {
  breakout: {confirmed: 'đã vượt', potential: 'áp sát', line: 'trendline giảm'},
  breakdown: {confirmed: 'đã thủng', potential: 'áp sát', line: 'trendline tăng'},
};
const FIELD_SHORT = {rs_1m: 'RS 1M', rs_3m: 'RS 3M', rs_52w: 'RS 52W', volume_sma20: 'KL TB20', volume_vs_sma: 'KL so TB20', current_price: 'giá'};
const OP_SHORT = {'>=': '≥', '<=': '≤', '>': '>', '<': '<', '=': '='};
const whole = (x) => vi(x, Number.isInteger(x) ? 0 : 1);
const amount = (x) => (typeof x !== 'number' ? String(x) : x >= 1e6 ? `${whole(x / 1e6)} triệu` : x >= 1e4 ? `${whole(x / 1e3)} nghìn` : whole(x));
/**
 * The definition plate's items, built from the terminal's saved filter (content/review/filters.json, what pull.mjs
 * fetched from the user's config) so it never goes stale: conditions with the same test share an item ("RS 3M, RS 52W
 * ≥ 70"), volume in words ("KL TB20 ≥ 1 triệu"), the trendline signal group in words ("đã vượt hoặc áp sát trendline
 * giảm"). Empty when the filter is not on disk.
 */
export const definitionOf = (saved, kind) => {
  if (!saved) return [];
  const items = [];
  for (const c of saved.conditions ?? []) {
    const test = `${OP_SHORT[c.op] ?? c.op} ${c.rhs_field ? FIELD_SHORT[c.rhs_field] ?? c.rhs_field : amount(c.value)}`;
    const name = FIELD_SHORT[c.field] ?? c.field;
    const same = items.find((x) => x.test === test && !x.field.startsWith('KL'));
    if (same && !name.startsWith('KL')) same.names.push(name);
    else items.push({field: name, names: [name], test});
  }
  // The RS tests read as one line ("RS 1M ≥ 80 · RS 3M, RS 52W ≥ 70"), so the card has three lines, not four.
  const said = items.map((x) => ({rs: x.field.startsWith('RS'), text: `${x.names.join(', ')} ${x.test}`}));
  const rs = said.filter((x) => x.rs).map((x) => x.text);
  const out = [...(rs.length ? [rs.join(' · ')] : []), ...said.filter((x) => !x.rs).map((x) => x.text)];
  const S = SIGNAL_LINE[kind];
  for (const g of saved.groups ?? []) {
    const f = (g.conditions ?? []).map((c) => c.field);
    if (!S || !f.some((x) => x.startsWith(`has_${kind}_`))) continue;
    const verbs = [f.includes(`has_${kind}_confirmed`) ? S.confirmed : null, f.includes(`has_${kind}_potential`) ? S.potential : null].filter(Boolean);
    out.push(`${verbs.join(' hoặc ')} ${S.line}`);
  }
  return out;
};

/** A scene's spec: the format's own screener scenes first (rules.formats.<format>.screener.scenes, the weekly's
 *  Momentum boards), then the shared ones (rules.screener.scenes). */
export const sceneSpecOf = (R, format, scene) => R.formats?.[format]?.screener?.scenes?.[scene] ?? R.screener?.scenes?.[scene] ?? {};

/**
 * The names the reel reviews after the boards, in the order their scenes play: the leader scenes show the weaker
 * pick first and top[0] last (scaffold's order), then the requested picks (screener.requested, user 2026-10-05).
 * A format whose leaders say `order: "tier"` (the weekly's one review per Momentum filter, 2026-10-06) plays them in
 * tier order, top[0] first.
 */
export const reviewOrderOf = (F) => {
  const L = F.screener?.leaders;
  const top = [...(L?.top ?? [])];
  return [...new Set([...(L?.order === 'tier' ? top : top.reverse()), ...(F.screener?.requested ?? [])].map((x) => x.symbol))];
};

/** A scrolling board (the weekly's watchlist) shows this many rows at a time … */
export const BOARD_VIEW_ROWS = 10;
/** … and holds at most this many (src/scenes/FilterBoard.tsx MAX_SCROLL_ROWS, verify.mjs and checks.mjs say the same). */
export const BOARD_SCROLL_ROWS = 40;
/** A page turn moves at most this many rows, so the last row of the page before stays in view. */
const PAGE_STEP = 9;
/**
 * The first row of each page of a scrolling board of `n` rows: ten rows a page, pages evenly spaced from the top to the last
 * ten, no turn longer than PAGE_STEP — 19 rows: [0, 9]; 33 rows: [0, 8, 15, 23].
 */
export const pagesOf = (n) => {
  if (n <= BOARD_VIEW_ROWS) return [0];
  const last = n - BOARD_VIEW_ROWS;
  const count = Math.ceil(last / PAGE_STEP) + 1;
  return Array.from({length: count}, (_, k) => Math.round((k * last) / (count - 1)));
};

/**
 * @param {object} o
 * @param {string} o.scene     the scene key (rs, uptrend)
 * @param {object} o.F         the fact pack
 * @param {object} o.R         the market-review rules
 * @param {string[]} [o.roles] rules.formats.<format>.roles — the board right before the leader scenes closes on the invitation
 * @param {object} [o.saved] the terminal's saved filter of the scene (content/review/filters.json) — the definition plate
 *                            of a board whose spec says `board.list` (the weekly's Momentum boards, 2026-10-09)
 * @param {boolean} [o.feeds] the board closes on the invitation (default: a leader role follows it) — the weekly's last
 *                            board invites the names the user picked, with no leader role after it (2026-10-09)
 * @returns {{visual: object, rowLines: string[], beatLine: string, beats: number, focus: string[]}}
 */
export function boardOf({scene, F, R, roles = [], feeds: feedsIn, saved = null, noFocus = false}) {
  const S = F.screener[scene];
  const spec = sceneSpecOf(R, F.format, scene);
  const columns = spec.board?.columns ?? BOARD_COLUMNS[scene] ?? ['price', 'change', 'rs1m'];
  // A scrolling board (`board.scroll`, the weekly's watchlist since 2026-10-18 evening — user: "Not limit to 10 symbol on the
  // stock list to monitor") keeps up to BOARD_SCROLL_ROWS rows, ten in view at a time, a page per beat (pagesOf).
  const scrollable = !!spec.board?.scroll;
  const top = S.top.slice(0, Math.min(spec.top ?? 10, scrollable ? BOARD_SCROLL_ROWS : 10));
  const onBoard = new Set(top.map((x) => x.symbol));
  // Picks that came from one board (the weekly's one review per Momentum filter carries `tierScene`, 2026-10-06) light
  // only on that board; the daily's picks carry none and light wherever they are shown, as before.
  const fromBoard = new Map((F.screener?.leaders?.top ?? []).filter((x) => x.tierScene !== undefined).map((x) => [x.symbol, x.tierScene]));
  // noFocus: the scene after this board shows the picks itself (the weekly's "Mã đáng chú ý tuần sau", 2026-10-18).
  const focus = noFocus ? [] : reviewOrderOf(F).filter((s) => onBoard.has(s) && (!fromBoard.has(s) || fromBoard.get(s) === scene));
  const signalKind = spec.board?.signal ?? S.signalKind ?? null;
  // No stock passed the saved filter this session (both Momentum filters on 9/10, the first live weekly): the board is
  // drawn EMPTY — one beat, no rows, the caption "<FILTER> · 0 MÃ", the state plate and the definition card from the start.
  const empty = !top.length;

  const rows = top.map((x) => ({
    symbol: x.symbol,
    ...(columns.includes('price') && x.price != null ? {price: x.price} : {}),
    changePercent: x.changePercent,
    rs1m: x.rs1m,
    ...Object.fromEntries(columns.filter((c) => FIELD[c] && x[FIELD[c]] != null).map((c) => [FIELD[c], x[FIELD[c]]])),
    ...(focus.includes(x.symbol) ? {focus: true} : {}),
    // A name the user picked that the board's own filter did not list (the weekly's watchlist, `board.addRequested`).
    ...(x.added ? {added: true} : {}),
  }));

  // Beat 2 lights the focus rows, in the order their scenes play; a board without any has one beat. A board of more than ten
  // rows turns a page of ten on each beat (the 33 names of RS Strong on 16/10 after the user lowered its volume floor: four
  // pages, rows 1–10, 9–18, 16–25, 24–33) and lights its focus rows on the beat after the last page, scrolled so the first of
  // them is in view.
  const scrolls = scrollable && top.length > BOARD_VIEW_ROWS;
  const pages = scrolls ? pagesOf(top.length) : [0];
  const label = `${R.screener.board?.picksLabel ?? 'Xem kỹ'}: ${focus.join(' · ')}`;
  // A scrolling board's focus rows may lie pages apart (the user's six picks of 16/10 on rows 3–15): on its focus beat the
  // table clears and only they come back, top-down in the order their scenes play (`collapse`, FilterBoard.tsx).
  const emphasis = focus.length ? [{beat: scrolls ? pages.length : 1, set: 'focus', dim: true, label, ...(scrolls ? {collapse: focus} : {})}] : [];
  const scroll = scrolls ? pages.slice(1).map((offset, k) => ({beat: k + 1, offset})) : [];

  // The weekly's Momentum boards (spec `board.list`, 2026-10-09): rows top-anchored and, under them, the state plate
  // (market state · the list's nature) and the saved filter's definition (FilterBoard.tsx `notes`) — 2–6 rows had left
  // ~60% of the panel empty ("looks broken") and a short breakout list read as a tip list. With no focus row the plates
  // are beat 2 (no empty focus beat); with one they land with the rows and beat 2 stays the focus.
  const list = spec.board?.list ?? null;
  const st = list ? stateOf(F, R) : null;
  const definition = list ? definitionOf(saved, signalKind) : [];
  const notes = list
    ? {state: {label: 'Thị trường', value: st.value, list, accent: st.accent}, ...(definition.length ? {definition: {title: `Bộ lọc ${S.filter}`, items: definition}} : {}), beat: scrolls || focus.length || empty ? 0 : 1}
    : null;

  // A board may word its own caption (`board.caption`, {n} = the count — the watchlist of 2026-10-18 counts the names of
  // four filters, not one filter's).
  const caption = spec.board?.caption ? spec.board.caption.replaceAll('{n}', String(S.count)) : null;
  const visual = {
    type: 'board',
    caption: caption ?? (empty ? `${S.filter.toUpperCase()} · ${S.count} MÃ` : `${S.filter.toUpperCase()} · ${S.count} MÃ · XẾP THEO RS 1M`),
    columns,
    rows,
    ...(emphasis.length ? {emphasis} : {}),
    ...(signalKind ? {signalKind} : {}),
    ...(notes ? {notes} : {}),
    ...(scroll.length ? {scroll} : {}),
  };

  const cell = {
    price: (x) => `giá ${vi(x.price)}`,
    change: (x) => `${signed(x.changePercent, 2)}%`,
    rs1m: (x) => `RS 1M ${x.rs1m}`,
    rs52w: (x) => (x.rs52w == null ? null : `RS 52W ${x.rs52w}`),
    volume: (x) => (x.volumeVsSma20Percent == null ? null : `KL ${signed(x.volumeVsSma20Percent, 0)}% so TB20`),
    aboveEma50: (x) => (x.aboveEma50Percent == null ? null : `${signed(x.aboveEma50Percent, 1)}% trên EMA50`),
    aboveSma200: (x) => (x.aboveSma200Percent == null ? null : `${signed(x.aboveSma200Percent, 1)}% trên SMA200`),
    rs3m: (x) => (x.rs3m == null ? null : `RS 3M ${x.rs3m}`),
    weekChange: (x) => (x.weekChangePercent == null ? null : `${signed(x.weekChangePercent, 2)}% tuần`),
    signal: (x) => (x.signal == null ? null : `${signalKind ?? 'tín hiệu'} ${x.signal === 'confirmed' ? 'xác nhận' : 'tiềm năng'}`),
    filters: (x) => (x.filters?.length ? `bộ lọc: ${x.filters.join(' + ')}` : null),
    watchUp: (x) => (x.watchUp == null ? null : `theo dõi vượt ${vi(x.watchUp)}`),
    watchDown: (x) => (x.watchDown == null ? null : `lưu ý thủng ${vi(x.watchDown)}`),
  };
  const rowLines = top.map((x, i) => {
    const cells = ['rs1m', ...columns.filter((c) => c !== 'rs1m')].map((c) => cell[c]?.(x)).filter(Boolean);
    return `#${i + 1} ${x.symbol}: ${cells.join(' · ')}${x.added ? ' (người dùng THÊM vào bảng — chip THÊM)' : ''}${rows[i].focus ? ' (soi kỹ ở scene sau)' : ''}`;
  });
  const names = focus.join(' và ');
  // The board that hands over to the reviews (uptrend) pins beat 2 on the invitation that names them (scaffold's countdownBrief).
  const feeds = feedsIn ?? roles[roles.indexOf(scene) + 1] === 'leader';
  const pageRows = (offset) => `dòng ${offset + 1}–${Math.min(offset + BOARD_VIEW_ROWS, top.length)}`;
  const beatLine = scrolls
    ? [
        `${pages.length} TRANG, mười dòng một trang, mỗi trang một beat. Beat 1 = mười dòng đầu hiện dần từ trên xuống (RS 1M thành thanh), plate trạng thái dưới bảng hiện khi các dòng đã vào.`,
        ...pages.slice(1).map((offset, k) => `Beat ${k + 2} = bảng CUỘN tới ${pageRows(offset)} (${top.slice(offset, offset + BOARD_VIEW_ROWS).map((x) => x.symbol).join(', ')}).`),
        'Câu ghim mỗi beat là câu đang nói khi trang đó hiện ra; mỗi trang cần ~3 giây trở lên để đọc kịp mười dòng, nên câu ghim một trang không quá ngắn.',
        ...(focus.length ? [`Beat ${pages.length + 1} = bảng xoá trắng rồi CHỈ còn ${focus.length > 1 ? `các mã sẽ soi kỹ (${names}), xếp từ trên xuống theo thứ tự scene soi,` : `mã sẽ soi kỹ (${names})`} sáng lên (nền vàng, viền, kính lúp), nhãn "${label}" thay caption — câu ghim beat này là LỜI MỜI ở cuối scene.`] : []),
        'Lời không tả hiệu ứng (không "bảng cuộn", "lật trang", "dòng sáng").',
      ].join(' ')
    : empty
    ? `MỘT beat: bảng TRỐNG — không mã nào qua bộ lọc phiên này; không dòng, không tiêu đề cột, không beat nhấn mạnh; caption "${S.filter.toUpperCase()} · ${S.count} MÃ".`
    : focus.length
    ? [
        `Beat 1 = bảng ${rows.length} mã hiện dần từ trên xuống (RS 1M thành thanh); bảng xong thì ${focus.length > 1 ? `các mã sẽ soi kỹ ở scene sau (${names})` : `mã sẽ soi kỹ ở scene sau (${names})`} có vạch vàng ở mép trái.`,
        `Beat 2 = ${names} sáng lên lần lượt từ trên xuống (nền vàng quét ngang dòng, viền vàng, mã phóng to và đổi vàng, biểu tượng kính lúp), các dòng khác mờ đi, nhãn "${label}" thay caption — ${feeds ? 'câu ghim beat 2 là LỜI MỜI ở cuối scene — đúng câu ở dòng "Bảng này MỞ PHẦN SOI MÃ" của brief (scaffold countdownBrief: ' + (fromBoard.size ? 'nó gọi đúng mã soi của CHÍNH bảng này)' : 'nó gọi mọi mã sẽ soi, cả mã không có trên bảng này)') :`câu ghim beat 2 nói về ${focus.length > 1 ? 'các mã đó' : 'mã đó'} trên CHÍNH bảng này (thứ hạng RS 1M, ${columns.includes('weekChange') ? '% tuần' : '% hôm nay'}, cột riêng của bộ lọc), gọi MÃ, tách bằng chữ`}.`,
        'Lời không tả hiệu ứng (không "dòng sáng", "kính lúp", "viền vàng") và không nói mã có ở bộ lọc nào khác (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter").',
      ].join(' ')
    : `Beat 1 = bảng ${rows.length} mã hiện dần từ trên xuống (RS 1M thành thanh). Không có beat nhấn mạnh: không mã nào sẽ soi kỹ nằm trong ${rows.length} dòng của bảng này. Lời không nói mã có ở bộ lọc nào khác (người dùng 2026-10-05).`;
  const notesLine = notes && empty
    ? ` Panel: plate trạng thái "${notes.state.label}: ${notes.state.value} · ${list}" ở đầu panel${notes.definition ? ` và thẻ định nghĩa "${notes.definition.title}: ${definition.join(' · ')}" lấp phần còn lại (lấy từ bộ lọc đã lưu, không gõ lại)` : ''} — hiện ngay từ đầu scene.`
    : notes
    ? ` Dưới bảng (dòng neo ở đầu panel): plate trạng thái "${notes.state.label}: ${notes.state.value} · ${list}"${notes.definition ? ` và thẻ định nghĩa "${notes.definition.title}: ${definition.join(' · ')}" (khi bảng ≤ 6 dòng; lấy từ bộ lọc đã lưu, không gõ lại)` : ''} — ${notes.beat ? 'hiện ra ở BEAT 2 (bảng không có mã sẽ soi: beat 2 là plate, không phải beat nhấn mạnh trống); câu ghim beat 2 là câu nói danh sách này để làm gì (cảnh báo / theo dõi)' : 'hiện ngay khi các dòng đã vào, trước beat 2'}.`
    : '';
  return {visual, rowLines, beatLine: beatLine + notesLine, beats: empty ? 1 : scrolls ? pages.length + (focus.length ? 1 : 0) : emphasis.length || notes ? 2 : 1, focus, notes, empty, scrolls, pages};
}
