/**
 * market-review's own verify checks. .claude/skills/market-review/rules.json lists this module
 * in `extraChecks`; scripts/verify.mjs imports it for every reel graded by that file and adds
 * what it returns to the reel's report. It reads the reel's fact pack and the photo sidecars.
 *
 *   review-fresh   the screener cache and every photo belong to the edition's finished session
 *   review-state   what the screen says about the market matches the rule engine's state; at the user's danger
 *                  level (rules.distribution.dangerAt, five DDs) the market scene must warn, and should say the
 *                  user's line (rules.distribution.danger.say, 2026-10-05) instead of a countdown to the correction
 *   review-picks   every ticker on screen is one the fact pack picked (or a row of that scene's photographed
 *                  table — the ticker plates of 2026-10-01); each leader scene shows its own chart
 *   review-overlap no filter scene (spike, rs, uptrend) and no symbol review (leader, pick) says that a name is also in
 *                  another filter (user 2026-10-05: "Not need mentioned the stock on specific filter existed on other
 *                  filter"); a filter board lights only the names reviewed next (focus rows)
 *   review-outro   the sign-off carries no figures (carried over from market-video's outro rule)
 *   review-index   says out loud when the index chart is the terminal's fallback, not FireAnt
 *   review-symbols each leader on a FireAnt chart has a valid symbol-reviewer review in the pack (screener.leaders.top[i]
 *                  .review) — WARN only: without one the scene renders scaffold's default marks; skipped while the
 *                  leaders still sit on terminal photos
 *   review-payoff  the watch scene (the hook's promise) shows the level and the count that change the state, and
 *                  names the danger level when it is the next threshold (or keeps the warning once reached)
 *
 * Each check returns {id, level: pass|warn|fail|skip, message, fix?}.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {topMatches} from './lib/screener-rows.mjs';

const read = (root, rel) => {
  try { return JSON.parse(readFileSync(resolve(root, rel), 'utf8')); } catch { return null; }
};
/** The ICT wall clock of an instant: {date, hm, dow}. */
const ict = (iso) => {
  const t = new Date(new Date(iso).getTime() + 7 * 3600e3);
  return {date: t.toISOString().slice(0, 10), hm: t.toISOString().slice(11, 16), dow: t.getUTCDay()};
};
/** True when an instant falls after the session's close and before a later session opens. */
const ofSession = (iso, session, close) => {
  if (!iso) return false;
  const c = ict(iso);
  if (c.date < session || (c.date === session && c.hm < close)) return false;
  const laterSession = c.date > session && c.dow >= 1 && c.dow <= 5 && c.hm >= '09:00';
  return !laterSession;
};
const onScreen = (scene) => [
  ...scene.beats.flatMap((b) => [b.line1 ?? '', b.line2 ?? '']),
  ...(scene.visual?.annotations ?? []).map((a) => a.label ?? a.text ?? ''),
  scene.visual?.caption ?? '',
  // A filter board (FilterBoard.tsx) prints its rows' tickers, its legend and its emphasis plates.
  ...(scene.visual?.type === 'board' ? [
    ...(scene.visual.rows ?? []).map((r) => r.symbol),
    ...Object.values(scene.visual.legend ?? {}),
    ...(scene.visual.emphasis ?? []).map((e) => e.label ?? ''),
  ] : []),
].filter(Boolean);
const NOT_TICKERS = new Set(['FTD', 'EMA', 'SMA', 'RSI', 'KL', 'RS', 'TB', 'HOSE', 'HNX', 'UPCOM', 'VN', 'VNINDEX', 'MACD', 'TODO', 'ICT']);

export default function reviewChecks(reel, {root, rules: R}) {
  const out = [];
  const add = (id, level, message, fix) => out.push({id, level, message, ...(fix ? {fix} : {})});
  const F = reel.facts ? read(root, reel.facts) : null;
  if (!F) {
    for (const id of ['review-fresh', 'review-state', 'review-picks']) add(id, 'fail', `no fact pack at ${reel.facts}`, 'run node scripts/review/facts.mjs --format=<daily|weekly>');
    return out;
  }
  const session = F.asOf;
  const close = R.screener.freshAfter;

  // ---------------------------------------------------------------- review-fresh
  {
    const bad = [];
    if (!ofSession(F.source?.screenerCachedAt, session, close)) bad.push(`screener cache ${F.source?.screenerCachedIct ?? '?'} ICT is not from after the ${session} close`);
    if (reel.edition && reel.edition !== session) bad.push(`the reel is the ${reel.edition} edition but its fact pack is ${session}`);
    for (const s of reel.scenes) {
      if (s.visual?.type !== 'image') continue;
      const side = read(root, `public/${s.visual.src.replace(/\.png$/, '')}.json`);
      const at = side?.capturedAt;
      if (!ofSession(at, session, close)) bad.push(`${s.id}: ${s.visual.src} was taken ${at ? `${ict(at).date} ${ict(at).hm} ICT` : 'at an unknown time'}, not after the ${session} close`);
      // FireAnt's "Thống kê sàn" (the daily's flow scene, 2026-10-05) always shows its LATEST session: its HSX tile
      // has to read this edition's close, or the counts and the money on it belong to another day.
      const tile = side?.js?.tile;
      if (tile?.index != null && Math.abs(tile.index - F.session.close) > (R.shots?.fireantFlow?.matchTolerance ?? 0.02)) {
        bad.push(`${s.id}: ${s.visual.src} shows FireAnt's HSX at ${tile.index}, but the ${session} close is ${F.session.close} — another session`);
      }
    }
    if (bad.length) add('review-fresh', 'fail', `${bad.length} item(s) not from the ${session} session`, bad.join('; ') + '; pull, shoot and scaffold again after the post-close refresh');
    else add('review-fresh', 'pass', `screener cache and every photo are from after the ${session} close`);
  }

  // ---------------------------------------------------------------- review-state
  {
    const bad = [];
    const warn = [];
    const labels = Object.entries(R.status).filter(([k]) => !k.startsWith('_'));
    const current = R.status[F.state.status];
    const low = (t) => t.toLowerCase();
    for (const s of reel.scenes) {
      for (const text of onScreen(s)) {
        for (const [key, l] of labels) {
          if (key === F.state.status) continue;
          // A conditional ("thêm 3 phiên: điều chỉnh") may name another state; the reviewer reads it.
          if (low(text).includes(low(l.vi))) warn.push(`${s.id}: "${text}" names "${l.vi}" but the state is "${current.vi}" — only as a condition`);
        }
        if (/\bFTD\b/.test(text) && !F.state.lastFtd) bad.push(`${s.id}: "${text}" mentions an FTD but the history holds none`);
        for (const m of text.matchAll(/(?<!thêm\s)(?<!Thêm\s)(\d+)\s*(?:\/\s*(\d+)\s*)?phiên phân phối/g)) {
          if (Number(m[1]) !== F.distribution.count) bad.push(`${s.id}: "${text}" counts ${m[1]} distribution days, the engine counts ${F.distribution.count}`);
          if (m[2] && Number(m[2]) !== F.distribution.window) bad.push(`${s.id}: "${text}" uses a ${m[2]}-session window, the rules use ${F.distribution.window}`);
        }
      }
    }
    // The hook stays free of system words (user, 2026-09-30), so the state must be named by the
    // end of the market scene.
    const early = reel.scenes.filter((s) => s.role === 'hook' || s.role === 'market');
    const said = early.some((s) => [s.narration ?? '', ...onScreen(s)].some((t) => low(t).includes(low(current.vi)) || low(t).includes(low(current.short))));
    if (early.length && !early.some((s) => String(s.narration).includes('TODO')) && !said) warn.push(`${early.map((s) => s.id).join('/')}: neither the hook nor the market scene names the state ("${current.vi}" / "${current.short}")`);
    // A state's on-screen headline (rules.status.<state>.headline, user 2026-10-05: "Xu hướng tăng chịu áp lực" → "Sức
    // khỏe thị trường đang yếu" on the market's beat 2). WARN only — "something like", so the words may be fitted.
    {
      const m = reel.scenes.find((s) => s.role === 'market');
      const heads = (m?.beats ?? []).flatMap((b) => [b.line1 ?? '', b.line2 ?? '']).join(' · ').normalize('NFC');
      if (m && current.headline && !heads.includes('TODO')) {
        if (!/sức kh(?:ỏe|oẻ)/i.test(heads)) warn.push(`${m.id}: the market headlines should carry "${current.headline}" in place of the state's name (user 2026-10-05)`);
        else if (low(heads).includes(low(current.vi))) warn.push(`${m.id}: a market headline still shows "${current.vi}" — the user replaced it on screen with "${current.headline}" (2026-10-05)`);
      }
    }
    // The user's danger level (rules.distribution.dangerAt, 2026-10-01: five DDs "is dangerous and must warning and
    // re-check the symbol and risk"): the market scene says "nguy hiểm" and that every name and the risk get re-checked.
    if (F.distribution?.danger) {
      const m = reel.scenes.find((s) => s.role === 'market');
      const where = m ? [m] : reel.scenes;
      const texts = where.flatMap((s) => [s.narration ?? '', ...onScreen(s)]);
      if (!where.some((s) => String(s.narration).includes('TODO'))) {
        if (!texts.some((x) => /nguy hiểm/i.test(x))) bad.push(`${m?.id ?? 'reel'}: ${F.distribution.count} distribution days is the danger level of the user's system (≥ ${F.distribution.dangerAt}) — the market scene must warn ("mức nguy hiểm") and say every name and the risk get re-checked`);
        else if (!texts.some((x) => /rà lại|soát lại|kiểm tra lại/i.test(x))) warn.push(`${m?.id ?? 'reel'}: at the danger level the scene should also say every name and the risk get re-checked ("rà lại từng mã và rủi ro")`);
        // The user's line for the danger level (rules.distribution.danger.say, 2026-10-05) replaces the countdown to the
        // correction. WARN only — the user asked for "something like" it, so the writer may fit the words to the scene.
        const say = R.distribution?.danger?.say;
        const spoken = String(m?.narration ?? '').normalize('NFC');
        if (m && say) {
          if (/thêm\s[^.!?…]*?nữa\s+là\s[^.!?…]*điều chỉnh/i.test(spoken)) warn.push(`${m.id}: at the danger level the market scene still counts down to the correction ("thêm … nữa là điều chỉnh") — the user replaced that sentence on 2026-10-05 with "${say}"`);
          else if (!/không còn kh(?:ỏe|oẻ)/i.test(spoken)) warn.push(`${m.id}: at the danger level the market scene should carry the user's line (2026-10-05): "${say}"`);
        }
      }
    }
    if (bad.length) add('review-state', 'fail', `${bad.length} statement(s) disagree with the engine`, bad.join('; '));
    else if (warn.length) add('review-state', 'warn', `${warn.length} note(s)`, warn.join('; '));
    else add('review-state', 'pass', `screen agrees with the engine: ${current.vi}, ${F.distribution.count}/${F.distribution.window} distribution days${F.state.lastFtd ? `, FTD ${F.state.lastFtd.dm}` : ''}`);
  }

  // ---------------------------------------------------------------- review-picks
  {
    const bad = [];
    // Every table scene of the screener (spike, rs, uptrend — one saved filter each since 2026-09-30),
    // the movers board's two columns and the chart countdown.
    const tableScenes = Object.keys(R.screener?.scenes ?? {});
    const picked = new Set([
      ...tableScenes.flatMap((k) => F.screener[k]?.top ?? []),
      ...(F.screener.leaders?.top ?? []),
      // The names the user asked for on the review page (user 2026-10-05) are the pack's own picks too.
      ...(F.screener.requested ?? []),
      ...(F.screener.spike?.gainers ?? []), ...(F.screener.spike?.losers ?? []),
    ].map((x) => x.symbol));
    for (const s of reel.scenes) {
      // A table scene lists the tickers of the rows its photo shows (plates over the company names, user
      // 2026-10-01); they come from the photo's own sidecar, so they are allowed on that scene only.
      const own = new Set();
      if (tableScenes.includes(s.role) && s.visual?.type === 'image') for (const r of read(root, `public/${s.visual.src.replace(/\.png$/, '')}.json`)?.js?.rows ?? []) if (r.symbol) own.add(r.symbol);
      // The flow scene's beat 2 is FireAnt's "Top cổ phiếu tác động" (user 2026-10-05): the names that moved the index
      // are the fact pack's own (flow.impact), allowed on that scene only.
      if (s.role === 'flow') for (const r of [...(F.flow?.impact?.up ?? []), ...(F.flow?.impact?.down ?? [])]) own.add(r.symbol);
      for (const text of onScreen(s)) {
        for (const [tk] of text.matchAll(/\b[A-Z]{3}\b/g)) {
          if (!NOT_TICKERS.has(tk) && !picked.has(tk) && !own.has(tk)) bad.push(`${s.id}: "${text}" names ${tk}, which is not one of the picks (${[...picked].join(', ')})${own.size ? ' nor a row of its photo' : ''}`);
        }
      }
    }
    const leaders = reel.scenes.filter((s) => s.role === 'leader');
    // The countdown shows the weakest of the picks first and #1 (top[0], the highest RS 1M) last.
    for (const [k, s] of leaders.entries()) {
      const want = F.screener.leaders?.top?.[leaders.length - 1 - k]?.symbol;
      // The pick's own chart: its FireAnt photo (user 2026-10-01), or the terminal's as the fallback.
      if (want && !new RegExp(`/${want.toLowerCase()}-(fireant|terminal)\\.png$`).test(String(s.visual?.src))) bad.push(`${s.id}: leader ${k + 1} is ${want} but the photo is ${s.visual?.src}`);
    }
    // Each pick scene (a name the user asked for, user 2026-10-05) shows its own chart, in the pack's requested order —
    // scaffold drops a name without a photo, so the scenes follow the requested names that have one.
    {
      const picks = reel.scenes.filter((s) => s.role === 'pick');
      const shot = (F.screener.requested ?? []).map((x) => x.symbol).filter((sym) => picks.some((s) => new RegExp(`/${sym.toLowerCase()}-(fireant|terminal)\\.png$`).test(String(s.visual?.src))));
      for (const [k, s] of picks.entries()) {
        const want = shot[k];
        if (!want) bad.push(`${s.id}: a pick scene but ${String(s.visual?.src)} is none of the requested names' charts (${(F.screener.requested ?? []).map((x) => x.symbol).join(', ') || 'none in the pack'})`);
        else if (!new RegExp(`/${want.toLowerCase()}-(fireant|terminal)\\.png$`).test(String(s.visual?.src))) bad.push(`${s.id}: pick ${k + 1} is ${want} but the photo is ${s.visual?.src}`);
      }
    }
    // The drawn spike board shows the pack's columns in the pack's order (since 2026-10-01 evening: gainers by
    // the biggest gain, losers by the deepest fall) and, when the pack prints volume as % of the 20-session
    // average, the same % on every row — and no spike or leader text still says "KL ×" (user: "the volume must
    // be the percent with its volume avg 20"). A board copied from an older skeleton fails here.
    {
      const SP = F.screener.spike ?? {};
      const board = reel.scenes.find((x) => x.role === 'spike' && x.visual?.type === 'movers');
      if (board && SP.gainers) {
        for (const [side, list] of [['left', SP.gainers], ['right', SP.losers ?? []]]) {
          const shown = (board.visual[side]?.rows ?? []).map((r) => r.symbol).join(' ');
          const want = list.map((r) => r.symbol).join(' ');
          if (shown !== want) bad.push(`${board.id}: the board's ${side} column is ${shown || '—'}, the fact pack's (${SP.sortedBy}) is ${want || '—'}`);
          if (SP.volumeUnit === 'percentVsSma20') {
            const off = (board.visual[side]?.rows ?? []).filter((r) => r.volumeVsSma20Percent !== list.find((x) => x.symbol === r.symbol)?.volumeVsSma20Percent);
            if (off.length) bad.push(`${board.id}: ${off.map((r) => r.symbol).join(', ')} on the ${side} column print a volume that is not the pack's volumeVsSma20Percent`);
          }
        }
      }
      if (SP.volumeUnit === 'percentVsSma20') {
        for (const s of reel.scenes.filter((x) => x.role === 'spike' || x.role === 'leader')) {
          for (const text of onScreen(s)) if (/KL\s*×/.test(text)) bad.push(`${s.id}: "${text}" shows volume as ×; the board's unit is % of the 20-session average ("KL +92%")`);
        }
      }
    }
    // A drawn filter board (rs, uptrend — FilterBoard.tsx, user 2026-10-01 evening) shows the pack's rows in the
    // pack's RS 1M order and the pack's figures, and lights exactly the names the reel reviews next that it shows (user
    // 2026-10-05: "decoration and animation with the symbol need focused", "uptrend … behavior like the RS strong"):
    // the leaders in the order their scenes play (top[] reversed), then the requested names. Nothing marks a name as
    // shared with another filter any more ("Not need mentioned the stock on specific filter existed on other filter").
    const order = [...(F.screener.leaders?.top ?? [])].reverse().map((x) => x.symbol).concat((F.screener.requested ?? []).map((x) => x.symbol));
    for (const scene of tableScenes) {
      const s = reel.scenes.find((x) => x.role === scene && x.visual?.type === 'board');
      if (!s) continue;
      const top = F.screener[scene]?.top ?? [];
      const rows = s.visual.rows ?? [];
      const shown = rows.map((r) => r.symbol).join(' ');
      const want = top.slice(0, rows.length).map((r) => r.symbol).join(' ');
      if (shown !== want) bad.push(`${s.id}: the board's rows are ${shown || '—'}, the fact pack's (RS 1M) are ${want || '—'}`);
      const legacy = rows.filter((r) => r.both || r.all3 || r.pick).map((r) => r.symbol);
      if (legacy.length || s.visual.legend) bad.push(`${s.id}: the board still marks names shared with another filter (${legacy.length ? `both/all3/pick on ${legacy.join(', ')}` : 'a legend'}) — re-run scaffold.mjs (user 2026-10-05: no shared-filter marks; the focus rows replace them)`);
      const focus = order.filter((sym, i) => order.indexOf(sym) === i && rows.some((r) => r.symbol === sym));
      const lit = rows.filter((r) => r.focus).map((r) => r.symbol);
      if ([...lit].sort().join(' ') !== [...focus].sort().join(' ')) bad.push(`${s.id}: the board lights ${lit.join(', ') || 'no row'}, but the names reviewed next that it shows are ${focus.join(', ') || 'none'}`);
      const em = (s.visual.emphasis ?? []).filter((e) => e.set === 'focus');
      if (focus.length && !em.length) bad.push(`${s.id}: ${focus.join(', ')} are reviewed next but no beat brings them forward (emphasis set "focus")`);
      for (const e of em) if (e.label && !String(e.label).endsWith(focus.join(' · '))) bad.push(`${s.id}: the plate "${e.label}" should name ${focus.join(' · ')}, in the order their scenes play`);
      const FIG = ['price', 'changePercent', 'rs1m', 'rs52w', 'volumeVsSma20Percent', 'aboveEma50Percent', 'aboveSma200Percent'];
      for (const r of rows) {
        const x = top.find((y) => y.symbol === r.symbol);
        if (!x) continue;
        const off = FIG.filter((k) => r[k] != null && r[k] !== x[k]);
        if (off.length) bad.push(`${s.id}: ${r.symbol} prints ${off.map((k) => `${k} ${r[k]} (pack ${x[k]})`).join(', ')}`);
      }
    }
    for (const scene of tableScenes) {
      const s = reel.scenes.find((x) => x.role === scene);
      if (!s || s.visual?.type !== 'image') continue;
      const side = read(root, `public/${s.visual.src.replace(/\.png$/, '')}.json`);
      const top = (F.screener[scene]?.top ?? []).map((x) => x.symbol);
      const sortColumn = R.shots?.screener?.sortColumn?.[R.screener.scenes[scene].sortBy] ?? side?.js?.sortedBy;
      if (side?.js?.filter && side.js.filter !== R.screener.scenes[scene].photo) bad.push(`${s.id}: the photo shows the "${side.js.filter}" filter, the scene is "${R.screener.scenes[scene].photo}"`);
      const m = topMatches(side?.js?.rows ?? [], sortColumn, top);
      if (!m.ok) bad.push(`${s.id}: the photo's rows are not the fact pack's picks (${top.join(', ')}) — ${m.why}`);
    }
    if (bad.length) add('review-picks', 'fail', `${bad.length} pick problem(s)`, bad.join('; '));
    else add('review-picks', 'pass', `tickers on screen are the fact pack's picks; photos show the same rows`);
  }

  // ---------------------------------------------------------------- review-overlap
  {
    // The filter scenes and the symbol reviews never say that a name of one filter is also in another (user 2026-10-05:
    // "Not need mentioned the stock on specific filter existed on other filter"). Read on what is SAID and shown as
    // text: the narration sentence by sentence, the headlines and the eyebrow. A bridge sentence without a ticker may
    // still name the next filter ("Còn bộ lọc Uptrend thì sao?").
    const scope = ['spike', 'rs', 'uptrend', 'leader', 'pick', 'impact'];
    const scenes = reel.scenes.filter((s) => scope.includes(s.role));
    const ownOf = (role) => {
      const sc = R.screener?.scenes?.[role];
      return sc ? [sc.photo, ...(sc.filters ?? [])].filter(Boolean) : [];
    };
    const names = [...new Set(Object.keys(R.screener?.scenes ?? {}).flatMap(ownOf))];
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe = (n) => new RegExp(`(^|[^\\p{L}])${esc(n)}(?![\\p{L}])`, 'iu');
    const words = names.map(esc).join('|');
    const MEMBERSHIP = [
      [/cũng\s+(?:có mặt|lọt|thuộc|nằm trong)/iu, 'says a name is also in another list'],
      [new RegExp(`cũng\\s+(?:ở|nằm|qua)(?![\\p{L}])[^.!?…]{0,40}?(?:bộ lọc|bảng|nhóm|danh sách${words ? `|${words}` : ''})`, 'iu'), 'says a name is also in another filter'],
      [/cả\s+(?:hai|ba|3|2)\s+bộ\s+lọc/iu, 'counts the filters a name is in'],
      [/dải vàng|tia sét/iu, 'points at the old shared-filter marks'],
    ];
    const tickers = (t) => [...t.matchAll(/\b[A-Z]{3}\b/g)].map((m) => m[0]).filter((tk) => !NOT_TICKERS.has(tk));
    const sentences = (t) => String(t ?? '').normalize('NFC').split(/(?<=[.!?…])\s+/).filter(Boolean);
    const hits = [];
    let written = 0;
    for (const s of scenes) {
      if (String(s.narration ?? '').includes('TODO')) continue;
      written += 1;
      const own = ownOf(s.role).map((n) => n.toLowerCase());
      const others = names.filter((n) => !own.includes(n.toLowerCase()));
      const said = sentences(s.narration).map((t) => ({t, where: 'lời'}));
      const shown = [...(s.beats ?? []).flatMap((b) => [b.line1, b.line2]), s.eyebrow].filter(Boolean).map((t) => ({t: String(t).normalize('NFC'), where: 'chữ trên màn hình', screen: true}));
      for (const {t, where, screen} of [...said, ...shown]) {
        const why = MEMBERSHIP.filter(([re]) => re.test(t)).map(([, w]) => w);
        // The old loop 2: the volume board hinting that one of its names is a leader, "kept for the end".
        if (s.role === 'spike' && /dẫn dắt|để cuối/iu.test(t)) why.push('ties the volume board to the leaders');
        const named = (s.role === 'leader' || s.role === 'pick' || s.role === 'impact' ? names : others).filter((n) => nameRe(n).test(t));
        if (named.length && (screen || tickers(t).length)) why.push(`puts ${tickers(t).join(', ') || 'the headline'} next to ${named.join(', ')}`);
        if (why.length) hits.push(`${s.id} (${where}): "${t}" ${why.join(', ')}`);
      }
    }
    if (!written) add('review-overlap', 'skip', 'no written filter or symbol-review scene yet');
    else if (hits.length) add('review-overlap', 'fail', `${hits.length} sentence(s) say a name is also in another filter`, `${hits.join('; ')} — talk about this scene's own board only (user 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter"); a bridge with no ticker may name the next filter`);
    else add('review-overlap', 'pass', `no filter or symbol-review scene says a name is also in another filter (${written} scene(s))`);
  }

  // ---------------------------------------------------------------- review-symbols
  {
    // Leaders on FireAnt charts (user 2026-10-01) are written from a symbol review (.claude/agents/symbol-reviewer.md);
    // facts.mjs carries only reviews that pass lib/symbol-review.mjs. Terminal-photo leaders predate both: skip.
    const onFireant = reel.scenes.filter((s) => (s.role === 'leader' || s.role === 'pick') && /-fireant\.png$/.test(String(s.visual?.src)));
    // The requested names' pick scenes are written from a review too (user 2026-10-05).
    const top = [...(F.screener?.leaders?.top ?? []), ...(F.screener?.requested ?? [])];
    if (!onFireant.length) add('review-symbols', 'skip', 'leaders are on terminal photos — no symbol review expected');
    else {
      const missing = top.filter((L) => !L.review).map((L) => L.symbol);
      const pending = top.filter((L) => L.review?.pending?.length).map((L) => `${L.symbol} (${L.review.pending.join(', ')})`);
      if (missing.length) add('review-symbols', 'warn', `no valid symbol review in the pack for ${missing.join(', ')}`, 'run one symbol-reviewer agent per leader (SKILL.md §3), check it with node scripts/review/lib/symbol-review.mjs <date> <SYM>, then facts.mjs and scaffold again');
      else if (pending.length) add('review-symbols', 'warn', `symbol reviews with checks still pending: ${pending.join('; ')}`, "the MA checks wait for FireAnt's MA50/MA200 (<sym>-fireant.ma.json); re-run the reviewer once the photo carries them");
      else add('review-symbols', 'pass', `every leader${(F.screener?.requested ?? []).length ? ' and requested name' : ''} has a symbol review`);
    }
  }

  // ---------------------------------------------------------------- review-outro
  {
    const o = reel.scenes.find((s) => s.role === 'outro');
    const words = R.style?.spokenNumberWords ?? [];
    const figures = o && !String(o.narration).includes('TODO')
      ? [...onScreen(o).filter((t) => /\d/.test(t)), ...words.filter((w) => String(o.narration).toLowerCase().includes(w))]
      : [];
    if (figures.length) add('review-outro', 'warn', 'the sign-off carries figures', `${figures.join(', ')} — the outro is thả tim · chia sẻ · theo dõi and a promise to update, nothing else`);
    else add('review-outro', 'pass', o ? 'sign-off without figures' : 'no outro scene');
  }

  // ---------------------------------------------------------------- review-payoff
  {
    const w = reel.scenes.find((s) => s.role === 'watch');
    if (!w) {
      add('review-payoff', 'warn', 'no watch scene — the hook promises a payoff the reel never gives', 'rules.formats.<format>.roles should end with watch, outro');
    } else {
      const text = onScreen(w).join(' ');
      const bad = [];
      const level = F.state.rallyLow ?? F.state.correctionLow;
      if (level != null && !text.includes(Number(level).toFixed(2).replace('.', ','))) bad.push(`the level ${Number(level).toFixed(2)} that changes the state is not on screen`);
      if (!/phân phối/i.test(text)) bad.push('the distribution-day tripwire is not on screen');
      // The user's danger level: the payoff names it while it is the next threshold, and keeps the warning once reached.
      const notes = [];
      const said = /nguy hiểm/i.test(`${w.narration ?? ''} ${text}`);
      const uptrend = F.state.status === 'CONFIRMED_UPTREND' || F.state.status === 'UNDER_PRESSURE';
      if (uptrend && F.distribution?.toDanger > 0 && F.distribution?.toUnderPressure === 0 && !said) notes.push(`the next threshold is the danger level of the user's system (${F.distribution.dangerAt} distribution days, ${F.distribution.toDanger} away) — the watch scene should name it`);
      if (F.distribution?.danger && !said) notes.push(`the reel is at the danger level (${F.distribution.count} ≥ ${F.distribution.dangerAt} distribution days) — the watch scene should keep the warning`);
      if (bad.length) add('review-payoff', 'fail', `${bad.length} payoff problem(s)`, bad.join('; '));
      else if (notes.length) add('review-payoff', 'warn', `${notes.length} payoff note(s)`, notes.join('; '));
      else add('review-payoff', 'pass', `the watch scene shows the level and the count that change the state${said ? ', and the danger level' : ''}`);
    }
  }

  // ---------------------------------------------------------------- review-index
  {
    const scenes = reel.scenes.filter((s) => s.visual?.type === 'image' && /vnindex-/.test(s.visual.src));
    const fallback = scenes.filter((s) => s.visual.src.includes('vnindex-terminal'));
    if (fallback.length) add('review-index', 'warn', `the index chart is the terminal's (FireAnt capture unavailable) in ${fallback.length} scene(s)`, 'the user chose FireAnt photos; re-run node scripts/review/shots.mjs --only=fireant when Chrome is free, then scaffold again');
    else add('review-index', 'pass', scenes.length ? 'index chart photographed on FireAnt' : 'no index chart');
  }
  return out;
}
