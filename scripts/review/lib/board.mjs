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
const FIELD = {rs52w: 'rs52w', rs3m: 'rs3m', volume: 'volumeVsSma20Percent', aboveEma50: 'aboveEma50Percent', aboveSma200: 'aboveSma200Percent', weekChange: 'weekChangePercent', signal: 'signal'};

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

/**
 * @param {object} o
 * @param {string} o.scene     the scene key (rs, uptrend)
 * @param {object} o.F         the fact pack
 * @param {object} o.R         the market-review rules
 * @param {string[]} [o.roles] rules.formats.<format>.roles — the board right before the leader scenes closes on the invitation
 * @returns {{visual: object, rowLines: string[], beatLine: string, beats: number, focus: string[]}}
 */
export function boardOf({scene, F, R, roles = []}) {
  const S = F.screener[scene];
  const spec = sceneSpecOf(R, F.format, scene);
  const columns = spec.board?.columns ?? BOARD_COLUMNS[scene] ?? ['price', 'change', 'rs1m'];
  const top = S.top.slice(0, Math.min(spec.top ?? 10, 10));
  const onBoard = new Set(top.map((x) => x.symbol));
  // Picks that came from one board (the weekly's one review per Momentum filter carries `tierScene`, 2026-10-06) light
  // only on that board; the daily's picks carry none and light wherever they are shown, as before.
  const fromBoard = new Map((F.screener?.leaders?.top ?? []).filter((x) => x.tierScene !== undefined).map((x) => [x.symbol, x.tierScene]));
  const focus = reviewOrderOf(F).filter((s) => onBoard.has(s) && (!fromBoard.has(s) || fromBoard.get(s) === scene));
  const signalKind = spec.board?.signal ?? S.signalKind ?? null;

  const rows = top.map((x) => ({
    symbol: x.symbol,
    ...(columns.includes('price') && x.price != null ? {price: x.price} : {}),
    changePercent: x.changePercent,
    rs1m: x.rs1m,
    ...Object.fromEntries(columns.filter((c) => FIELD[c] && x[FIELD[c]] != null).map((c) => [FIELD[c], x[FIELD[c]]])),
    ...(focus.includes(x.symbol) ? {focus: true} : {}),
  }));

  // Beat 2 lights the focus rows, in the order their scenes play; a board without any has one beat.
  const label = `${R.screener.board?.picksLabel ?? 'Xem kỹ'}: ${focus.join(' · ')}`;
  const emphasis = focus.length ? [{beat: 1, set: 'focus', dim: true, label}] : [];

  const visual = {
    type: 'board',
    caption: `${S.filter.toUpperCase()} · ${S.count} MÃ · XẾP THEO RS 1M`,
    columns,
    rows,
    ...(emphasis.length ? {emphasis} : {}),
    ...(signalKind ? {signalKind} : {}),
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
  };
  const rowLines = top.map((x, i) => {
    const cells = ['rs1m', ...columns.filter((c) => c !== 'rs1m')].map((c) => cell[c]?.(x)).filter(Boolean);
    return `#${i + 1} ${x.symbol}: ${cells.join(' · ')}${rows[i].focus ? ' (soi kỹ ở scene sau)' : ''}`;
  });
  const names = focus.join(' và ');
  // The board that hands over to the reviews (uptrend) pins beat 2 on the invitation that names them (scaffold's countdownBrief).
  const feeds = roles[roles.indexOf(scene) + 1] === 'leader';
  const beatLine = focus.length
    ? [
        `Beat 1 = bảng ${rows.length} mã hiện dần từ trên xuống (RS 1M thành thanh); bảng xong thì ${focus.length > 1 ? `các mã sẽ soi kỹ ở scene sau (${names})` : `mã sẽ soi kỹ ở scene sau (${names})`} có vạch vàng ở mép trái.`,
        `Beat 2 = ${names} sáng lên lần lượt từ trên xuống (nền vàng quét ngang dòng, viền vàng, mã phóng to và đổi vàng, biểu tượng kính lúp), các dòng khác mờ đi, nhãn "${label}" thay caption — ${feeds ? 'câu ghim beat 2 là LỜI MỜI ở cuối scene — đúng câu ở dòng "Bảng này MỞ PHẦN SOI MÃ" của brief (scaffold countdownBrief: ' + (fromBoard.size ? 'nó gọi đúng mã soi của CHÍNH bảng này)' : 'nó gọi mọi mã sẽ soi, cả mã không có trên bảng này)') :`câu ghim beat 2 nói về ${focus.length > 1 ? 'các mã đó' : 'mã đó'} trên CHÍNH bảng này (thứ hạng RS 1M, ${columns.includes('weekChange') ? '% tuần' : '% hôm nay'}, cột riêng của bộ lọc), gọi MÃ, tách bằng chữ`}.`,
        'Lời không tả hiệu ứng (không "dòng sáng", "kính lúp", "viền vàng") và không nói mã có ở bộ lọc nào khác (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter").',
      ].join(' ')
    : `Beat 1 = bảng ${rows.length} mã hiện dần từ trên xuống (RS 1M thành thanh). Không có beat nhấn mạnh: không mã nào sẽ soi kỹ nằm trong ${rows.length} dòng của bảng này. Lời không nói mã có ở bộ lọc nào khác (người dùng 2026-10-05).`;
  return {visual, rowLines, beatLine, beats: emphasis.length ? 2 : 1, focus};
}
