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
 *   review-roles   a review scene whose symbol review carries the two roles (symbol-reviewer/3, user 2026-10-07) ends on
 *                  the action beat and says both — the one holding the name ("Đang giữ: …") and the one without it
 *                  ("Chưa có hàng: …"); WARN from 2026-10-07 when a review has no roles
 *   review-payoff  the watch scene (the hook's promise) shows the level and the count that change the state, and
 *                  names the danger level when it is the next threshold (or keeps the warning once reached)
 *   review-plan    the weekly only (rules.formats.weekly.hook / watch, user 2026-10-09): the hook says "kế hoạch giao dịch
 *                  cho tuần tới" and the watch scene speaks of next week — WARN, no row for the daily
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
const NOT_TICKERS = new Set(['FTD', 'EMA', 'SMA', 'RSI', 'KL', 'RS', 'TB', 'HOSE', 'HNX', 'UPCOM', 'VN', 'VNINDEX', 'MACD', 'TODO', 'ICT', 'ICB']);

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
  // The weekly's sector leader (facts screener.sectorLeader — user 2026-10-10: "Get one of stock on this marjor best ranking
  // to review"): its review scene is a pick scene on its own chart, checked like a requested pick's.
  const SECTOR_LEADER = F.screener?.sectorLeader ?? null;
  const isSectorLeaderScene = (s) => !!SECTOR_LEADER && (s.role === 'pick' || s.role === 'leader') && new RegExp(`/${SECTOR_LEADER.symbol.toLowerCase()}-(fireant|terminal)\\.png$`).test(String(s.visual?.src));

  // ---------------------------------------------------------------- review-fresh
  {
    const bad = [];
    // No screener this edition (facts.mjs --no-screener: the terminal did not answer, 2026-10-09) — there is no cache to
    // date; review-screener says what the reel is missing.
    if (!F.screener?.unavailable && !ofSession(F.source?.screenerCachedAt, session, close)) bad.push(`screener cache ${F.source?.screenerCachedIct ?? '?'} ICT is not from after the ${session} close`);
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
    else add('review-fresh', 'pass', `${F.screener?.unavailable ? 'every photo is' : 'screener cache and every photo are'} from after the ${session} close`);
    if (F.screener?.unavailable) {
      add('review-screener', 'warn', 'no screener in this edition — no filter board, no stock review',
        `${F.screener.unavailable}; once the terminal answers: node scripts/review/pull.mjs, facts.mjs, shots.mjs --only=leaders, the symbol reviews, scaffold.mjs --force, then the writer for the new scenes`);
    }
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
    // "nỗ lực phục hồi" is the user's word order (2026-10-08) for the label's "nỗ lực hồi phục": either names the state
    // (the daily builder's 9/10 patch, verbatim).
    const words = (t) => low(t).replaceAll('phục hồi', 'hồi phục');
    const said = early.some((s) => [s.narration ?? '', ...onScreen(s)].some((t) => words(t).includes(words(current.vi)) || words(t).includes(words(current.short))));
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
    // Every table scene of the screener (spike, rs, uptrend — one saved filter each since 2026-09-30; the format's own
    // boards — the weekly's Momentum breakout / breakdown, 2026-10-06), the movers board's two columns and the reviews.
    const tableScenes = [...Object.keys(R.screener?.scenes ?? {}), ...Object.keys(R.formats?.[reel.format ?? F.format]?.screener?.scenes ?? {})];
    const picked = new Set([
      ...tableScenes.flatMap((k) => F.screener[k]?.top ?? []),
      ...(F.screener.leaders?.top ?? []),
      // The names the user asked for on the review page (user 2026-10-05) are the pack's own picks too, and so is the
      // weekly's sector leader (screener.sectorLeader, user 2026-10-10).
      ...(F.screener.requested ?? []),
      ...(F.screener.sectorLeader ? [F.screener.sectorLeader] : []),
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
    // The countdown shows the weakest of the picks first and #1 (top[0], the highest RS 1M) last. Tier order (the weekly's
    // one review per Momentum filter, 2026-10-06) plays top[k] after its own board — review-momentum checks that order.
    for (const [k, s] of F.screener.leaders?.order === 'tier' ? [] : leaders.entries()) {
      const want = F.screener.leaders?.top?.[leaders.length - 1 - k]?.symbol;
      // The pick's own chart: its FireAnt photo (user 2026-10-01), or the terminal's as the fallback.
      if (want && !new RegExp(`/${want.toLowerCase()}-(fireant|terminal)\\.png$`).test(String(s.visual?.src))) bad.push(`${s.id}: leader ${k + 1} is ${want} but the photo is ${s.visual?.src}`);
    }
    // One leader scene per pick of the pack, no more: a day can have fewer picks than leader roles (the daily keeps only
    // the names in all three filters since 2026-10-06), and a scene left from an older skeleton would review a dropped name.
    const nTop = F.screener.leaders?.top?.length ?? 0;
    if (leaders.length > nTop) bad.push(`${leaders.slice(0, leaders.length - nTop).map((s) => s.id).join(', ')}: ${leaders.length} leader scene(s) but the fact pack reviews ${nTop} — re-run node scripts/review/scaffold.mjs --format=${reel.format ?? F.format ?? 'daily'}`);
    // The tiers a format keeps (rules.formats.<fmt>.leaders, from its `since` edition on — user 2026-10-06, the daily: "All
    // 3 filters only"): a pack ranked before the rule still carries an RS Strong ∩ Uptrend name.
    {
      const fk = reel.format ?? F.format;
      const rule = R.formats?.[fk]?.leaders;
      if (rule?.from && !(rule.since && session < rule.since)) {
        const keep = Array.isArray(rule.from) && rule.from.some(Array.isArray) ? rule.from.length : 1;
        for (const x of F.screener.leaders?.top ?? []) {
          if (!(x.tier >= 1 && x.tier <= keep)) bad.push(`${x.symbol}: a leader from tier ${x.tier ?? '?'} (${(x.tierFilters ?? []).join(' ∩ ') || '?'}), but rules.formats.${fk}.leaders keeps tier ≤ ${keep} from ${rule.since ?? 'every edition'} on — re-run node scripts/review/facts.mjs --format=${fk}, then scaffold`);
        }
      }
    }
    // Each pick scene (a name the user asked for, user 2026-10-05) shows its own chart, in the pack's requested order —
    // scaffold drops a name without a photo, so the scenes follow the requested names that have one.
    {
      // The weekly's sector leader (screener.sectorLeader, user 2026-10-10) is a pick scene of its own, right after the
      // sectors scene; the user's picks are checked without it.
      const picks = reel.scenes.filter((s) => s.role === 'pick' && !isSectorLeaderScene(s));
      for (const s of reel.scenes.filter(isSectorLeaderScene)) {
        const at = reel.scenes.indexOf(s);
        if (reel.scenes[at - 1]?.role !== 'sectors') bad.push(`${s.id}: the sector leader ${F.screener.sectorLeader.symbol}'s review should come right after the sectors scene, it follows ${reel.scenes[at - 1]?.role ?? 'nothing'}`);
        if (s.role !== 'pick') bad.push(`${s.id}: the sector leader ${F.screener.sectorLeader.symbol} is reviewed in a ${s.role} scene, not a pick scene`);
      }
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
      // A board followed by the picks list (2026-10-18) lights none: the list shows and lights the picks itself.
      const listNext = reel.scenes[reel.scenes.indexOf(s) + 1]?.role === 'picklist';
      const focus = listNext ? [] : order.filter((sym, i) => order.indexOf(sym) === i && rows.some((r) => r.symbol === sym));
      const lit = rows.filter((r) => r.focus).map((r) => r.symbol);
      if ([...lit].sort().join(' ') !== [...focus].sort().join(' ')) bad.push(`${s.id}: the board lights ${lit.join(', ') || 'no row'}, but the names reviewed next that it shows are ${focus.join(', ') || 'none'}${listNext ? ' (the picks list after it lights them)' : ''}`);
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
    // The Volume spike board lights the same way (user 2026-10-06: "With the volumn spike also have the animation with
    // this scene for me highlight the symbol must noted"): exactly the names reviewed next that its two columns show,
    // brought forward by an emphasis beat whose plate names them in play order — graded from rules
    // screener.scenes.spike.movers.focusSince on, so an earlier edition is not failed for a beat it never had.
    {
      const s = reel.scenes.find((x) => x.role === 'spike' && x.visual?.type === 'movers');
      const since = R.screener?.scenes?.spike?.movers?.focusSince;
      const edition = reel.edition ?? F.asOf ?? '';
      if (s && (!since || edition >= since)) {
        const rows = [...(s.visual.left?.rows ?? []), ...(s.visual.right?.rows ?? [])];
        const focus = order.filter((sym, i) => order.indexOf(sym) === i && rows.some((r) => r.symbol === sym));
        const lit = rows.filter((r) => r.focus).map((r) => r.symbol);
        if ([...lit].sort().join(' ') !== [...focus].sort().join(' ')) bad.push(`${s.id}: the spike board lights ${lit.join(', ') || 'no row'}, but the names reviewed next that it shows are ${focus.join(', ') || 'none'}`);
        const em = (s.visual.emphasis ?? []).filter((e) => e.set === 'focus');
        if (focus.length && !em.length) bad.push(`${s.id}: ${focus.join(', ')} are reviewed next but no beat brings them forward on the spike board (emphasis set "focus")`);
        for (const e of em) if (e.label && !String(e.label).endsWith(focus.join(' · '))) bad.push(`${s.id}: the plate "${e.label}" should name ${focus.join(' · ')}, in the order their scenes play`);
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
    // The format's own boards count too (the weekly's Momentum breakout / breakdown, 2026-10-06: PVS and ABB were in both).
    const fmtScenes = R.formats?.[reel.format ?? F.format]?.screener?.scenes ?? {};
    const scope = ['spike', 'rs', 'uptrend', 'leader', 'pick', ...Object.keys(fmtScenes)];
    const scenes = reel.scenes.filter((s) => scope.includes(s.role));
    const ownOf = (role) => {
      const sc = R.screener?.scenes?.[role] ?? fmtScenes[role];
      return sc ? [sc.photo, ...(sc.filters ?? [])].filter(Boolean) : [];
    };
    const names = [...new Set([...Object.keys(R.screener?.scenes ?? {}), ...Object.keys(fmtScenes)].flatMap(ownOf))];
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
        const named = (s.role === 'leader' || s.role === 'pick' ? names : others).filter((n) => nameRe(n).test(t));
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
    // The requested names' pick scenes are written from a review too (user 2026-10-05), and so is the sector leader's (2026-10-10).
    const top = [...(F.screener?.leaders?.top ?? []), ...(F.screener?.requested ?? []), ...(SECTOR_LEADER ? [SECTOR_LEADER] : [])];
    // A daily with no name in all three filters and no requested name has no review scene at all (since 2026-10-06).
    const reviews = reel.scenes.filter((s) => s.role === 'leader' || s.role === 'pick').length;
    if (!reviews) add('review-symbols', 'skip', 'no symbol review scene in this edition — no symbol review expected');
    else if (!onFireant.length) add('review-symbols', 'skip', 'leaders are on terminal photos — no symbol review expected');
    else {
      const missing = top.filter((L) => !L.review).map((L) => L.symbol);
      const pending = top.filter((L) => L.review?.pending?.length).map((L) => `${L.symbol} (${L.review.pending.join(', ')})`);
      if (missing.length) add('review-symbols', 'warn', `no valid symbol review in the pack for ${missing.join(', ')}`, 'run one symbol-reviewer agent per leader (SKILL.md §3), check it with node scripts/review/lib/symbol-review.mjs <date> <SYM>, then facts.mjs and scaffold again');
      else if (pending.length) add('review-symbols', 'warn', `symbol reviews with checks still pending: ${pending.join('; ')}`, "the MA checks wait for FireAnt's MA50/MA200 (<sym>-fireant.ma.json); re-run the reviewer once the photo carries them");
      else add('review-symbols', 'pass', `every leader${(F.screener?.requested ?? []).length ? ' and requested name' : ''}${SECTOR_LEADER ? ' and the sector leader' : ''} has a symbol review`);
    }
  }

  // ---------------------------------------------------------------- review-roles
  {
    // User 2026-10-07: "With the scene review symbol, also add the role of holder and not holder with action and behavior
    // like 'Không mua đuổi' with not holder when it exhausted run, and … with holder: 'nếu dưới giá …' thì hạ tỷ trọng & chốt
    // lời một nửa". A review scene whose symbol review carries `roles` (symbol-reviewer/3, §6b/§6c) ends on a third beat
    // "Hành động" (the role plates on their lines) and says both roles.
    const ROLES_SINCE = '2026-10-07';
    const bySym = new Map([...(F.screener?.leaders?.top ?? []), ...(F.screener?.requested ?? []), ...(SECTOR_LEADER ? [SECTOR_LEADER] : [])].map((L) => [L.symbol, L]));
    const scenes = reel.scenes.filter((s) => (s.role === 'leader' || s.role === 'pick') && /-fireant\.png$/.test(String(s.visual?.src)));
    const bad = [];
    const noRoles = [];
    let said = 0;
    for (const s of scenes) {
      const sym = String(s.visual.src).match(/([a-z0-9]{3})-fireant\.png$/i)?.[1]?.toUpperCase();
      if (!bySym.get(sym)?.review?.roles) { noRoles.push(sym); continue; }
      if ((s.visual.shots ?? []).length < 3 || (s.beats ?? []).length < 3) { bad.push(`${s.id}: ${sym}'s review has the two roles but the scene has no action beat (beat 3) — scaffold again and re-write the scene`); continue; }
      const text = String(s.narration ?? '').normalize('NFC').toLowerCase();
      if (!text || text.includes('todo')) continue;
      said++;
      if (!/đang giữ|đang có hàng/.test(text)) bad.push(`${s.id}: no sentence for the one holding ${sym} ("Đang giữ: …")`);
      if (!/chưa có hàng|chưa có cổ phiếu|chưa cầm/.test(text)) bad.push(`${s.id}: no sentence for the one without ${sym} ("Chưa có hàng: …")`);
    }
    if (!scenes.length) add('review-roles', 'skip', 'no symbol review scene on a FireAnt chart');
    else if (bad.length) add('review-roles', 'fail', `${bad.length} problem(s) with the holder / not-holder roles`, bad.join('; '));
    else if (noRoles.length && String(F.session?.date ?? '') >= ROLES_SINCE) add('review-roles', 'warn', `no holder / not-holder roles in the review of ${noRoles.join(', ')}`, 're-run the symbol-reviewer agent (method symbol-reviewer/3, §6b/§6c), then facts.mjs, scaffold and the writer');
    else if (noRoles.length) add('review-roles', 'skip', `edition before ${ROLES_SINCE}: reviews without roles`);
    else add('review-roles', 'pass', `${scenes.length} review scene(s) end on the action beat${said ? `, ${said} say both roles` : ''}`);
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
      // Out of an uptrend the count no longer moves the state: a correction (or an attempt) ends on an FTD (2026-10-08).
      const outOfUptrend = F.state.status === 'CORRECTION' || F.state.status === 'RALLY_ATTEMPT';
      if (outOfUptrend ? !/FTD/.test(text) : !/phân phối/i.test(text)) bad.push(outOfUptrend ? 'the FTD rule — the way out of the correction — is not on screen' : 'the distribution-day tripwire is not on screen');
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

  // ---------------------------------------------------------------- review-plan (the weekly, user 2026-10-09)
  // "With weekly the intro must have the sentence like: cung minh review va ke hoach giao dich cho tuan toi nhe.": the
  // hook promises next week's trading plan (rules.formats.<format>.hook.mustSay) and the watch scene pays it off by
  // speaking of next week (watch.mustSay). WARN only — the user said "like". A format without those blocks (the daily)
  // gets no row at all.
  {
    const fk = reel.format ?? F.format;
    const P = R.formats?.[fk] ?? {};
    const norm = (t) => String(t ?? '').normalize('NFC').toLowerCase();
    const graded = [];
    const notes = [];
    for (const [role, want, why] of [
      ['hook', P.hook?.mustSay, `the hook does not promise next week's plan; it closes on the user's invitation (rules.formats.${fk}.hook.invite / inviteOpen)`],
      ['watch', P.watch?.mustSay, `the watch scene does not speak of next week; it is the plan the hook promised ("Kế hoạch cho tuần tới: nếu … thì …")`],
    ]) {
      const s = reel.scenes.find((x) => x.role === role);
      if (!want || !s || String(s.narration ?? 'TODO').includes('TODO')) continue;
      graded.push(role);
      const words = [want].flat();
      if (!words.some((w) => norm(s.narration).includes(norm(w)))) notes.push(`${s.id}: no ${words.map((w) => `"${w}"`).join(' or ')} — ${why}`);
    }
    if (notes.length) add('review-plan', 'warn', `${notes.length} plan note(s)`, notes.join('; '));
    else if (graded.length) add('review-plan', 'pass', graded.length === 2 ? "the hook promises next week's trading plan and the watch scene speaks of next week" : `${graded[0]} checked (the other narration is not written yet)`);
    else if (P.hook?.mustSay || P.watch?.mustSay) add('review-plan', 'skip', 'the hook and the watch narration are not written yet');
  }

  // ---------------------------------------------------------------- review-index
  {
    const scenes = reel.scenes.filter((s) => s.visual?.type === 'image' && /vnindex-/.test(s.visual.src));
    const fallback = scenes.filter((s) => s.visual.src.includes('vnindex-terminal'));
    if (fallback.length) add('review-index', 'warn', `the index chart is the terminal's (FireAnt capture unavailable) in ${fallback.length} scene(s)`, 'the user chose FireAnt photos; re-run node scripts/review/shots.mjs --only=fireant when Chrome is free, then scaffold again');
    else add('review-index', 'pass', scenes.length ? 'index chart photographed on FireAnt' : 'no index chart');
  }

  // ---------------------------------------------------------------- weekly 2026-10-06: VN-Index daily + weekly timeframes
  // review-timeframes (WARN only): the daily scene ("VN-Index · Khung ngày") and the week scene ("Khung tuần") print the
  // FireAnt averages the pack read for them (indexDaily.ma / indexWeekly.ma), and the daily scene evaluates — structure
  // and trend — without the watch scene's if-then branches (user 2026-10-06: "eval the VNIndex as daily and weekly").
  // A format whose market scene opens on the daily frame (rules.formats.<format>.market.daily — the weekly since 2026-10-09,
  // user: "Combine the scene 03 and 04 to one scene but still keep it meaningful") has no daily scene: its market scene is
  // the daily timeframe's, and it carries the rule's distribution days and FTD by design — graded on the averages it prints
  // and on no if-then branch (the market's own rule too), nothing else.
  if (F.indexDaily || F.indexWeekly) {
    const notes = [];
    const printed = (s) => (s?.visual?.annotations ?? []).map((a) => `${a.text ?? ''} ${a.label ?? ''}`).join(' ');
    const has = (text, v) => text.includes(Number(v).toFixed(2).replace('.', ','));
    const merged = !!R.formats?.[reel.format ?? F.format]?.market?.daily;
    const dScene = reel.scenes.find((s) => s.role === 'daily') ?? (merged ? reel.scenes.find((s) => s.role === 'market') : undefined);
    const wScene = reel.scenes.find((s) => s.role === 'week');
    if (F.indexDaily && reel.scenes.some((s) => s.role !== 'daily') && !dScene) notes.push(merged ? 'the pack has indexDaily but the reel has no market scene to carry the daily frame' : 'the pack has indexDaily but the reel has no daily scene (scaffold printed why it dropped it)');
    if (dScene) {
      for (const [name, m] of Object.entries(F.indexDaily?.ma ?? {})) if (!has(printed(dScene), m.value)) notes.push(`${dScene.id} does not print ${name} ${m.value}`);
      if (/\bnếu\b[^.?!…]*\bthì\b/i.test(dScene.narration ?? '')) notes.push(`${dScene.id} says a "nếu … thì" branch — the daily timeframe evaluates; the branches are the watch scene's`);
    }
    if (wScene && F.indexWeekly) {
      for (const [name, m] of Object.entries(F.indexWeekly.ma ?? {})) if (!has(printed(wScene), m.value)) notes.push(`${wScene.id} does not print ${name} tuần ${m.value}`);
      if (!Object.keys(F.indexWeekly.ma ?? {}).length) notes.push(`${wScene.id}: no weekly MA50/MA200 of this week (${F.indexWeekly.maWhy ?? 'vnindex-weekly.ma.json'})`);
    }
    if (notes.length) add('review-timeframes', 'warn', `${notes.length} timeframe note(s)`, notes.join('; '));
    else add('review-timeframes', 'pass', `${[dScene && (dScene.role === 'daily' ? 'daily' : `${dScene.role} (khung ngày)`), wScene && 'week'].filter(Boolean).join(' and ') || 'no timeframe scene'} print FireAnt's averages${dScene ? `; the ${dScene.role} scene has no if-then branch` : ''}`);
  }

  // ---------------------------------------------------------------- weekly 2026-10-06: Momentum breakout / breakdown boards
  // review-momentum: the format's own boards (rules.formats.<format>.screener.scenes — the weekly's Momentum breakout /
  // breakdown, user 2026-10-06 "eval the filter: Momentum breakout, Momentum breakdown") show the pack's rows in the pack's
  // order (RS 1M descending, ten at most) with the pack's signal and week, and light only their OWN review pick ("Top of
  // each filter": the leaders row whose tierScene is the board); with `order: "tier"` review scene k shows top[k]'s chart
  // and comes after its board. A format without own boards (the daily) = no check.
  // Since 2026-10-09 the weekly picks no name by rule (user: "i will select the symbol to review with weekly not follow by
  // the filter value and rule"): a board lights the names the user requested that it shows (lib/board.mjs: a tier pick
  // only on its own board, a requested name wherever it is shown), and with no leader role in the format the pick scenes
  // come right after the last board, which invites them.
  {
    const fk = reel.format ?? F.format;
    const own = R.formats?.[fk]?.screener?.scenes ?? {};
    if (Object.keys(own).length) {
      const bad = [];
      const boards = reel.scenes.filter((s) => own[s.role]);
      for (const s of boards) {
        const S = F.screener?.[s.role];
        if (!S) { bad.push(`${s.id}: the fact pack has no screener.${s.role} — run node scripts/review/facts.mjs --format=${fk}`); continue; }
        const rows = s.visual?.type === 'board' ? s.visual.rows ?? [] : [];
        const want = (S.top ?? []).slice(0, Math.min(own[s.role].top ?? 10, own[s.role].board?.scroll ? 40 : 10));
        if (rows.map((r) => r.symbol).join() !== want.map((x) => x.symbol).join()) bad.push(`${s.id}: rows ${rows.map((r) => r.symbol).join(', ') || '—'} are not the pack's ${want.map((x) => x.symbol).join(', ') || '—'}`);
        // `order: overlapFirst` (the watchlist since 2026-10-18 evening): the names another filter also found first, then the
        // base filter's own — RS 1M descending inside each group.
        const group = (x) => (own[s.role].order === 'overlapFirst' && (x.filters ?? []).length > 1 ? 1 : 0);
        // The names the user added to the table (`added`, 2026-10-18) follow its own rows in the order picked — no rank order.
        const ranked = want.filter((x) => !x.added);
        if (want.findIndex((x) => x.added) >= 0 && want.slice(want.findIndex((x) => x.added)).some((x) => !x.added)) bad.push(`${s.id}: a name the user added sits before one of the table's own rows — added names come last`);
        for (let i = 1; i < ranked.length; i++) {
          const g0 = group(ranked[i - 1]);
          const g1 = group(ranked[i]);
          if (g0 < g1) { bad.push(`${s.id}: #${i + 1} ${ranked[i].symbol} has more filters than #${i} — the names another filter found come first`); break; }
          if (g0 === g1 && (ranked[i - 1].rs1m ?? -1) < (ranked[i].rs1m ?? -1)) { bad.push(`${s.id}: the pack's rows are not in RS 1M order at #${i + 1}`); break; }
        }
        const notPicked = want.filter((x) => x.added && !(F.screener?.requested ?? []).some((q) => q.symbol === x.symbol)).map((x) => x.symbol);
        if (notPicked.length) bad.push(`${s.id}: ${notPicked.join(', ')} added to the table but not among the requested names`);
        for (const r of rows) {
          const x = want.find((w) => w.symbol === r.symbol);
          if (!x) continue;
          if ((r.signal ?? null) !== (x.signal ?? null)) bad.push(`${s.id}: ${r.symbol} shows signal ${r.signal ?? '—'}, the pack says ${x.signal ?? '—'}`);
          if (r.weekChangePercent != null && r.weekChangePercent !== x.weekChangePercent) bad.push(`${s.id}: ${r.symbol} shows ${r.weekChangePercent}% for the week, the pack says ${x.weekChangePercent}`);
          // The watchlist (a union scene, 2026-10-18): every filter that found the name is a chip on its row — the pack's
          // filters, no more, no less (user: "If the symbol have many fiter listing it on the table for me").
          if (['any', 'base'].includes(own[s.role]?.match)) {
            const shown = [...(r.filters ?? [])].sort().join(' + ');
            const said = [...(x.filters ?? [])].sort().join(' + ');
            if (shown !== said) bad.push(`${s.id}: ${r.symbol} shows the filters ${shown || '—'}, the pack says ${said || '—'}`);
          }
        }
        const lit = rows.filter((r) => r.focus).map((r) => r.symbol);
        const tierOf = new Map((F.screener?.leaders?.top ?? []).filter((x) => x.tierScene !== undefined).map((x) => [x.symbol, x.tierScene]));
        // Followed by the picks list (2026-10-18): the list lights the picks, this board none.
        const listNext = reel.scenes[reel.scenes.indexOf(s) + 1]?.role === 'picklist';
        const mine = listNext ? [] : [...(F.screener?.leaders?.top ?? []), ...(F.screener?.requested ?? [])].map((x) => x.symbol)
          .filter((sym, i, all) => all.indexOf(sym) === i && rows.some((r) => r.symbol === sym) && (!tierOf.has(sym) || tierOf.get(sym) === s.role));
        if ([...lit].sort().join() !== [...mine].sort().join()) bad.push(`${s.id}: lights ${lit.join(', ') || 'no row'} — the names it shows that the reel reviews next (its own tier pick, the requested names) are ${mine.join(', ') || 'none'}`);
      }
      // No leader role (the weekly since 2026-10-09): the requested names' scenes follow the last board directly.
      if (!(R.formats?.[fk]?.roles ?? []).includes('leader') && boards.length) {
        // The picks list (role picklist, 2026-10-18) sits between the last board and the picks when it is built.
        const listAt = reel.scenes.findIndex((x) => x.role === 'picklist');
        const last = listAt >= 0 ? listAt : Math.max(...boards.map((b) => reel.scenes.indexOf(b)));
        // The sector leader's pick (2026-10-10) plays right after the sectors scene, not after the boards (review-picks).
        for (const [k, s] of reel.scenes.filter((x) => x.role === 'pick' && !isSectorLeaderScene(x)).entries()) {
          if (reel.scenes.indexOf(s) !== last + 1 + k) bad.push(`${s.id}: pick ${k + 1} should come right after the ${reel.scenes[last].role} scene (scene ${last + 2 + k}), it is scene ${reel.scenes.indexOf(s) + 1}`);
        }
      }
      // Tier order: review scene k is top[k] and sits after the board it came from.
      const L = F.screener?.leaders;
      if (L?.order === 'tier') {
        const reviews = reel.scenes.filter((s) => s.role === 'leader');
        for (const [k, s] of reviews.entries()) {
          const x = L.top?.[k];
          if (!x) continue;
          if (!new RegExp(`/${x.symbol.toLowerCase()}-(fireant|terminal)\\.png$`).test(String(s.visual?.src))) bad.push(`${s.id}: review ${k + 1} should be ${x.symbol} (tier ${x.tier}, ${x.tierScene}) but shows ${s.visual?.src}`);
          const i = reel.scenes.indexOf(s);
          const board = x.tierScene ? reel.scenes.findIndex((b) => b.role === x.tierScene) : -1;
          if (board >= 0 && board !== i - 1) bad.push(`${s.id}: the review of ${x.symbol} should come right after the ${x.tierScene} board`);
        }
      }
      if (bad.length) add('review-momentum', 'fail', `${bad.length} Momentum board problem(s)`, bad.join('; '));
      // No board because the terminal's cache carries no signal flag at all (facts.mjs universeSignals 0 — 9/10/2026, after
      // its outage): missing data, not an empty filter — said here so the review page does not read it as a quiet week.
      else if (!boards.length && Object.keys(own).some((k) => F.screener?.[k]?.universeSignals === 0)) add('review-momentum', 'warn', `no Momentum board built — the terminal's ${F.asOf} cache carries no signal flag on any row`, 'the trendline flags were not computed (an outage), so 0 names is missing data, not an empty filter: pull.mjs again once the terminal recomputes, then facts.mjs and scaffold.mjs --force');
      else add('review-momentum', 'pass', boards.length ? `${boards.map((s) => s.role).join(' and ')} show the pack's rows in RS 1M order and light the names reviewed next` : 'no Momentum board built');
      // The picks list (user 2026-10-18 evening: "Also have scene for all my picked stock and its filter, also include the
      // price must be monitor and notice"): the pack's picks in its order, each row's filters and the two watch prices as the
      // pack has them (from the symbol reviews), the lit rows = the names whose chart reviews follow, in that order.
      const list = reel.scenes.find((x) => x.role === 'picklist');
      const PL = F.screener?.picklist;
      if (list || PL?.rows?.length) {
        const pb = [];
        if (!list) pb.push(`the pack lists ${PL.rows.length} pick(s) (screener.picklist) but the reel has no picklist scene — scaffold.mjs --format=${fk} --force`);
        else if (!PL?.rows?.length) pb.push(`${list.id}: the pack has no screener.picklist — facts.mjs --format=${fk}`);
        else {
          const rows = list.visual?.rows ?? [];
          if (rows.map((r) => r.symbol).join() !== PL.rows.map((x) => x.symbol).join()) pb.push(`${list.id}: rows ${rows.map((r) => r.symbol).join(', ')} are not the pack's picks ${PL.rows.map((x) => x.symbol).join(', ')}`);
          for (const r of rows) {
            const x = PL.rows.find((y) => y.symbol === r.symbol);
            if (!x) continue;
            for (const k of ['watchUp', 'watchDown', 'price']) if ((r[k] ?? null) !== (x[k] ?? null)) pb.push(`${list.id}: ${r.symbol} shows ${k} ${r[k] ?? '—'}, the pack says ${x[k] ?? '—'}`);
            if ([...(r.filters ?? [])].sort().join() !== [...(x.filters ?? [])].sort().join()) pb.push(`${list.id}: ${r.symbol} shows the filters ${(r.filters ?? []).join(' + ') || '—'}, the pack says ${(x.filters ?? []).join(' + ') || '—'}`);
          }
          const picks = reel.scenes.filter((x) => x.role === 'pick' && !isSectorLeaderScene(x));
          const reviewed = picks.map((x) => /([A-Z0-9]{3})\s*$/.exec(x.eyebrow ?? '')?.[1]).filter(Boolean);
          const lit = rows.filter((r) => r.focus).map((r) => r.symbol);
          if (lit.join() !== reviewed.join()) pb.push(`${list.id}: lights ${lit.join(', ') || 'no row'} — the chart reviews after it are ${reviewed.join(', ') || 'none'}, in that order`);
          const at = reel.scenes.indexOf(list);
          if (picks.length && reel.scenes.indexOf(picks[0]) !== at + 1) pb.push(`${picks[0].id}: the first chart review should come right after ${list.id}`);
        }
        if (pb.length) add('review-picklist', 'fail', `${pb.length} picks-list problem(s)`, pb.join('; '));
        else add('review-picklist', 'pass', `${PL.rows.length} picks with their filters and watch prices (${PL.rows.map((x) => `${x.symbol} ▲${x.watchUp ?? '—'} ▼${x.watchDown ?? '—'}`).join(' · ')}); lit = the chart reviews that follow`);
      }
    }
  }

  // ---------------------------------------------------------------- weekly 2026-10-06: ICB industry groups by RS
  // review-sectors: the industry board (role sectors, lib/sectors.mjs) shows the pack's ranking as it is — the groups
  // in rank order from #1, at most ten, each row's label, stock count, median RS 1M, week and share above SMA200 those of
  // its group, the lit rows at the top. No sectors scene (the daily) = no check.
  {
    const s = reel.scenes.find((x) => x.role === 'sectors');
    if (s) {
      const G = F.sectors?.groups ?? [];
      const rows = s.visual?.type === 'board' ? s.visual.rows ?? [] : null;
      const bad = [];
      let lit = [];
      if (!rows) bad.push(`${s.id} is not a board (visual.type ${s.visual?.type})`);
      else {
        if (s.visual.mode !== 'sector') bad.push(`${s.id}: board mode is ${s.visual.mode ?? 'ticker'}, not sector`);
        if (!G.length) bad.push(`the fact pack ranks no ICB group (${F.sectors?.why ?? 'run node scripts/review/facts.mjs --format=weekly'})`);
        if (rows.length > 10) bad.push(`${s.id}: ${rows.length} rows; the board fits ten`);
        const FIELDS = ['members', 'rs1m', 'weekChangePercent', 'aboveSma200Share'];
        rows.forEach((r, i) => {
          const g = G[i];
          if (!g) { if (G.length) bad.push(`${s.id}: row ${i + 1} "${r.name}" is past the pack's ${G.length} ranked groups`); return; }
          if (r.name !== g.short) bad.push(`${s.id}: row ${i + 1} is "${r.name}" but the pack's #${g.rank} is "${g.short}"`);
          for (const k of FIELDS) if (r[k] != null && r[k] !== g[k]) bad.push(`${s.id}: row ${i + 1} ${g.short} ${k} ${r[k]} ≠ pack ${g[k]}`);
        });
        // The tickers on each row (column topSymbols, 2026-10-09 — user: "With the scene 05 also listing 2-3 stock with
        // this major ranking?") are the pack's top[] of that group, in order.
        if ((s.visual.columns ?? []).includes('topSymbols')) {
          rows.forEach((r, i) => {
            const g = G[i];
            if (!g) return;
            const want = (g.top ?? []).map((t) => t.symbol);
            const got = Array.isArray(r.topSymbols) ? r.topSymbols : [];
            if (got.join(',') !== want.join(',')) bad.push(`${s.id}: row ${i + 1} ${g.short} lists ${got.join(' · ') || 'no ticker'} but the pack's strongest are ${want.join(' · ') || 'none'} (facts.mjs sectors.groups[].top)`);
          });
        }
        lit = rows.map((r, i) => (r.focus ? i : -1)).filter((i) => i >= 0);
        if (lit.some((i, k) => i !== k)) bad.push(`${s.id}: the lit rows (${lit.map((i) => i + 1).join(', ')}) are not the top of the board`);
      }
      // The speech (2026-10-10 — user: "on the scene 05, mentiond the major raking from 1 to 3 and mention its stock on this
      // major"; 2026-10-11 — user: "Edit the sentence: Cùng mình xem kỹ PVP, rồi VPB và HDB => something like: Cung minh xem
      // ky cac ma nam trong cac nhom nganh tren & dang manh nhat (leader) cua thi truong nhe"): the narration names the
      // strongest ticker (top[0]) of each of the top three groups and no other (rules.formats.<format>.sectors.maxTickers 3 —
      // another ticker or a missing one = WARN); when review scenes (leader / pick) follow it, its LAST sentence is the fixed
      // invitation rules.formats.<format>.sectors.invite, word for word (whitespace and letter case aside), naming no ticker —
      // FAIL otherwise, and FAIL on an invitation with no review after it.
      const notes = [];
      const three = G.slice(0, 3).map((g) => g.top?.[0]?.symbol ?? g.strongest?.symbol).filter(Boolean);
      const follow = [];
      for (const x of reel.scenes.slice(reel.scenes.indexOf(s) + 1)) {
        if (x.role !== 'leader' && x.role !== 'pick') break;
        const sym = String(x.visual?.src ?? '').match(/\/([a-z0-9]{3})-(?:fireant|terminal)\.png$/i)?.[1]?.toUpperCase();
        if (sym) follow.push(sym);
      }
      const fmtKey = reel.format ?? F.format;
      const own = R.formats?.[fmtKey]?.sectors ?? {};
      const norm = (t) => String(t).normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
      const spoken = String(s.narration ?? '').normalize('NFC');
      if (spoken && !spoken.includes('TODO')) {
        const tick = (t) => [...t.matchAll(/\b[A-Z][A-Z0-9]{2}\b/g)].map((m) => m[0]).filter((tk) => !NOT_TICKERS.has(tk));
        const lastSentence = spoken.split(/(?<=[.!?…])\s+/).filter(Boolean).at(-1) ?? '';
        const isInvite = own.invite != null && norm(lastSentence) === norm(own.invite);
        const invites = isInvite || /xem kỹ|soi kỹ/iu.test(lastSentence);
        if (follow.length && own.invite == null) bad.push(`rules.formats.${fmtKey}.sectors.invite is not set — the fixed sentence the sectors scene ends on when review scenes follow it (user 2026-10-11)`);
        else if (follow.length && !isInvite) bad.push(`${s.id}: the last sentence is "${lastSentence}" — with review scenes after it (${follow.join(', ')}) the scene ends on the fixed invitation, word for word: "${own.invite}" (rules.formats.${fmtKey}.sectors.invite, user 2026-10-11)`);
        if (!follow.length && invites) bad.push(`${s.id}: the last sentence is an invitation ("${lastSentence}"), but no review scene follows the sectors scene — hand over to the next scene instead`);
        const said = [...new Set(tick(spoken))];
        const extra = said.filter((tk) => !three.includes(tk));
        const missing = three.filter((tk) => !said.includes(tk));
        if (extra.length) notes.push(`${s.id} says ${extra.join(', ')} — the voice names only the strongest ticker of each of the top three groups (${three.join(', ')}; rules.formats.${fmtKey}.sectors.maxTickers ${own.maxTickers ?? 3}); the invitation names none, the review scenes say their own and the rest are on the board`);
        if (missing.length) notes.push(`${s.id} does not say ${missing.join(', ')} — each of the top three groups is said with its strongest stock (user 2026-10-10)`);
      }
      if (bad.length) add('review-sectors', 'fail', `${bad.length} industry board problem(s)`, bad.slice(0, 6).join('; '));
      else if (notes.length) add('review-sectors', 'warn', `${notes.length} sectors narration note(s)`, `${notes.join('; ')} — writer.md Bản tuần, sectors`);
      else add('review-sectors', 'pass', `industry board = the pack's top ${rows.length} of ${G.length} ICB groups by median RS 1M${lit.length ? `, top ${lit.length} lit` : ''}${rows.some((r) => r.topSymbols?.length) ? ', tickers = the pack\'s top 3 of each' : ''}${follow.length ? `; ends on the fixed invitation (${follow.join(', ')} follow)` : ''}`);
    }
  }

  // ---------------------------------------------------------------- weekly 2026-10-06: stocks above their SMA200
  // review-breadth: the user asked for the NUMBER (2026-10-06: "amount of stock have price better than its SMA200"). Every
  // count the breadth scene prints (caption, headlines) is the terminal's (screener.breadth.count); the line under it is
  // recomputed from SSI closes (scripts/review/breadth.mjs) and may sit a few names off — WARN past
  // rules.formats.<format>.breadth.maxResidualPercent of the set, or when breadth.json was built on another set. A reel
  // without a breadth scene (the daily) gets no entry, so its report reads as before.
  {
    const s = reel.scenes.find((x) => x.role === 'breadth');
    const B = F.screener?.breadth;
    if (!s) { /* no breadth scene: nothing to grade */ }
    else if (!B) add('review-breadth', 'fail', 'the breadth scene has no screener.breadth in its fact pack', 'node scripts/review/breadth.mjs, then node scripts/review/facts.mjs --format=weekly');
    else {
      const K = B.count ?? {above: B.aboveSma200, with: B.withSma200 ?? B.universe, floor: 0};
      const text = onScreen(s).join(' · ');
      const bad = [];
      const notes = [];
      const shown = [];
      for (const m of text.matchAll(/(\d+)\s*\/\s*(\d+)\s*(?:mã|MÃ)/gu)) {
        shown.push(`${m[1]}/${m[2]}`);
        if (Number(m[1]) !== K.above || Number(m[2]) !== K.with) bad.push(`"${m[0]}" is not the terminal's count ${K.above}/${K.with}`);
      }
      for (const m of text.matchAll(/(?<![\d/])(\d+)\s+(?:mã|MÃ)(?:\s+(?:có thanh khoản|CÓ THANH KHOẢN))?\s+(?:trên|TRÊN)\s+S?MA\s?200/gu)) {
        shown.push(m[1]);
        if (Number(m[1]) !== K.above) bad.push(`"${m[0]}" is not the terminal's count ${K.above}`);
      }
      if (!shown.length) notes.push(`the count the user asked for (${K.above}/${K.with} above SMA200) is not on screen — the caption or the beat-2 headline should print it`);
      const L = B.line;
      const maxRes = R.formats?.[reel.format]?.breadth?.maxResidualPercent ?? 2;
      if (L?.residualSharePercent != null && Math.abs(L.residualSharePercent) > maxRes) notes.push(`the line ends at ${L.countLast}, ${L.residual > 0 ? '+' : ''}${L.residual} names (${L.residualSharePercent}% of the set) off the terminal's ${K.above} — raise rules.formats.${reel.format}.breadth.minVolumeSma20 (5/10: 10 000 shares put them 1 apart), then breadth.mjs, facts.mjs, scaffold`);
      if (L?.set && (L.set.floor ?? 0) !== (K.floor ?? 0)) notes.push(`content/review/breadth.json was built on another set (${L.set.rule}) than the count (floor ${K.floor ?? 0}) — run node scripts/review/breadth.mjs --date=${session}, then facts.mjs`);
      if (bad.length) add('review-breadth', 'fail', `${bad.length} count(s) on the breadth scene are not the terminal's`, bad.join('; '));
      else if (notes.length) add('review-breadth', 'warn', `${notes.length} breadth note(s)`, notes.join('; '));
      else add('review-breadth', 'pass', `the breadth scene prints the terminal's count ${K.above}/${K.with} (${K.percent ?? B.aboveSma200Percent}%)${L?.residual != null ? `; the line ends ${L.residual > 0 ? '+' : ''}${L.residual} off it` : ''}`);
    }
  }

  return out;
}
