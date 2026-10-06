/**
 * FireAnt's "Thống kê sàn" photo (https://fireant.vn/thi-truong/thong-ke-san, section "Biến động theo sàn"): how many
 * stocks of the exchange rose, fell or stood still (a pie) and where the session's money went (bars, tỷ đồng), and
 * below it "Top cổ phiếu tác động" — the points each stock added to or took from the index (user 2026-10-05: beat 2 of
 * scene 02). The user picked it on 2026-10-05; it is the daily edition's flow scene (scene 02, right after the hook).
 *
 * shots.mjs photographs it headless (js/fireant-flow.js reads both ECharts options into the sidecar's `js`); this
 * module turns that sidecar into the fact pack's `flow` block — or into the reason there is none. The page always
 * shows its LATEST session, live during trading hours, so the photo counts only when its exchange tile equals the
 * edition's close and it was taken after that session's close and before the next session opened.
 */
import {dm, ict, round} from './common.mjs';

export const FLOW_PHOTO = 'fireant-flow';

/** The ICT wall clock of an instant is after `date`'s close and before a later session opens. */
const inSession = (iso, date, close) => {
  if (!iso) return false;
  const c = ict(new Date(iso));
  if (c.date < date || (c.date === date && c.hm < close)) return false;
  const dow = new Date(`${c.date}T00:00:00Z`).getUTCDay();
  return !(c.date > date && dow >= 1 && dow <= 5 && c.hm >= '09:00');
};

/** "nhiều hơn" needs one side 15% ahead; "phần lớn" one side at 60% of the exchange (the hook's thresholds). */
const lean = (a, b, total) => {
  if (a >= total * 0.6) return 'a-most';
  if (b >= total * 0.6) return 'b-most';
  if (b && a / b >= 1.15) return 'a';
  if (a && b / a >= 1.15) return 'b';
  return 'even';
};

/**
 * @param side   the photo's sidecar (shoot.mjs meta with `js` from js/fireant-flow.js)
 * @param opts   {date, close, freshAfter: 'HH:MM', tolerance, photo: the photo's public path}
 * @returns {{ok: true, ...numbers} | {ok: false, why: string}}
 */
export const flowFacts = (side, {date, close, freshAfter = '15:00', tolerance = 0.02, photo}) => {
  const js = side?.js;
  if (!js?.counts || !js?.money || !js?.tile) return {ok: false, why: `no FireAnt numbers in the sidecar of ${photo} — shoot it with shots.mjs --only=flow`};
  if (Math.abs(js.tile.index - close) > tolerance) {
    return {ok: false, why: `FireAnt showed HSX ${js.tile.index} when ${photo} was taken, the ${date} session closed at ${close} — another session (the page shows only its latest)`};
  }
  if (!inSession(side.capturedAt, date, freshAfter)) {
    const c = side.capturedAt ? ict(new Date(side.capturedAt)) : null;
    return {ok: false, why: `${photo} was taken ${c ? `${c.date} ${c.hm} ICT` : 'at an unknown time'}, not between the ${date} close and the next session`};
  }
  const {up, down, flat} = js.counts;
  const total = up + down + flat;
  const m = js.money;
  const mt = m.up + m.down + m.flat;
  const pc = (n, of) => round((100 * n) / of, 1);
  const moneyLead = m.up >= m.down ? 'up' : 'down';
  const counts = lean(up, down, total);
  const money = lean(m.up, m.down, mt);
  const side1 = (l) => (l.startsWith('a') ? 'up' : l.startsWith('b') ? 'down' : null);
  const c = ict(new Date(side.capturedAt));
  return {
    ok: true,
    exchange: 'HOSE',            // FireAnt says HSX; the screen says HOSE (verify's ticker scan knows HOSE, not HSX)
    session: date, dm: dm(date),
    index: round(js.tile.index, 2),
    up, down, flat, total,
    upPercent: pc(up, total), downPercent: pc(down, total), flatPercent: pc(flat, total),
    money: {up: round(m.up, 1), down: round(m.down, 1), flat: round(m.flat, 1), total: round(mt, 1)},
    moneyPercent: {up: pc(m.up, mt), down: pc(m.down, mt), flat: pc(m.flat, mt)},
    moneyLead,
    /** The leading side's money over the other side's: "tiền vào mã tăng gấp 1,46 lần mã giảm". */
    moneyLeadRatio: round(Math.max(m.up, m.down) / Math.max(1e-9, Math.min(m.up, m.down)), 2),
    unit: 'tỷ đồng',
    /** Words decided by the numbers, never by mood (the same thresholds as the hook's breadthToday). */
    countWord: {'a-most': 'phần lớn mã tăng', 'b-most': 'phần lớn mã giảm', a: 'mã tăng nhiều hơn mã giảm', b: 'mã giảm nhiều hơn mã tăng', even: 'mã tăng giảm gần cân bằng'}[counts],
    moneyWord: {'a-most': 'phần lớn tiền vào mã tăng', 'b-most': 'phần lớn tiền vào mã giảm', a: 'tiền nghiêng về mã tăng', b: 'tiền nghiêng về mã giảm', even: 'tiền chia gần đều hai phía'}[money],
    /** Which way each chart leans ('up' / 'down'), null when it is even. */
    countLean: side1(counts),
    moneyLean: side1(money),
    /** 'same' / 'opposite' when both lean, null when either side is even — "opposite" is the story (few big names carry the money). */
    agree: side1(counts) && side1(money) ? (side1(counts) === side1(money) ? 'same' : 'opposite') : null,
    photo,
    fetchedAt: side.capturedAt,
    fetchedIct: `${c.date} ${c.hm}`,
    source: `${js.url ?? 'fireant.vn/thi-truong/thong-ke-san'} · Biến động theo sàn (${js.exchange ?? 'HSX'})`,
    /** "Top cổ phiếu tác động": points each name added to (up) or took from (down) the index, FireAnt's own figures,
     *  rounded as its chart labels them (12.80). `lead` is the biggest mover by size; `leadShare` its share of the index's
     *  own change (12,80 of +15,49 points = 82,6%) — the session's story when one name carries the index. */
    ...(js.impact?.up?.length ? (() => {
      const r2 = (n) => round(n, 2);
      const up = js.impact.up.map((x) => ({symbol: x.symbol, points: r2(x.points)}));
      const dn = js.impact.down.map((x) => ({symbol: x.symbol, points: r2(x.points)}));
      const lead = [...up, ...dn].reduce((a, b) => (Math.abs(b.points) > Math.abs(a.points) ? b : a));
      const change = r2(js.tile.change);
      return {impact: {
        up, down: dn, lead,
        indexChange: change,
        leadShare: change ? round((100 * lead.points) / change, 1) : null,
        upSum: r2(up.reduce((a, x) => a + x.points, 0)), downSum: r2(dn.reduce((a, x) => a + x.points, 0)),
        unit: 'điểm',
        source: 'FireAnt "Top cổ phiếu tác động" (contribute-to-index, top 5 each way)',
      }};
    })() : {}),
  };
};
