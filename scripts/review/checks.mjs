/**
 * market-review's own verify checks. .claude/skills/market-review/rules.json lists this module
 * in `extraChecks`; scripts/verify.mjs imports it for every reel graded by that file and adds
 * what it returns to the reel's report. It reads the reel's fact pack and the photo sidecars.
 *
 *   review-fresh   the screener cache and every photo belong to the edition's finished session
 *   review-state   what the screen says about the market matches the rule engine's state
 *   review-picks   every ticker on screen is one the fact pack picked; each leader scene shows its own chart
 *   review-outro   the sign-off carries no figures (carried over from market-video's outro rule)
 *   review-index   says out loud when the index chart is the terminal's fallback, not FireAnt
 *
 * Each check returns {id, level: pass|warn|fail|skip, message, fix?}.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

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
    const hook = reel.scenes.find((s) => s.role === 'hook');
    const said = hook && [hook.narration ?? '', ...onScreen(hook)].some((t) => low(t).includes(low(current.vi)) || low(t).includes(low(current.short)));
    if (hook && !String(hook.narration).includes('TODO') && !said) warn.push(`${hook.id}: the hook never names the state ("${current.vi}" / "${current.short}")`);
    if (bad.length) add('review-state', 'fail', `${bad.length} statement(s) disagree with the engine`, bad.join('; '));
    else if (warn.length) add('review-state', 'warn', `${warn.length} note(s)`, warn.join('; '));
    else add('review-state', 'pass', `screen agrees with the engine: ${current.vi}, ${F.distribution.count}/${F.distribution.window} distribution days${F.state.lastFtd ? `, FTD ${F.state.lastFtd.dm}` : ''}`);
  }

  // ---------------------------------------------------------------- review-picks
  {
    const bad = [];
    const picked = new Set([...F.screener.spike.top, ...F.screener.leaders.top].map((x) => x.symbol));
    for (const s of reel.scenes) {
      for (const text of onScreen(s)) {
        for (const [tk] of text.matchAll(/\b[A-Z]{3}\b/g)) {
          if (!NOT_TICKERS.has(tk) && !picked.has(tk)) bad.push(`${s.id}: "${text}" names ${tk}, which is not one of the picks (${[...picked].join(', ')})`);
        }
      }
    }
    const leaders = reel.scenes.filter((s) => s.role === 'leader');
    for (const [k, s] of leaders.entries()) {
      const want = F.screener.leaders.top[k]?.symbol;
      if (want && !String(s.visual?.src).includes(`/${want.toLowerCase()}-terminal.png`)) bad.push(`${s.id}: leader ${k + 1} is ${want} but the photo is ${s.visual?.src}`);
    }
    for (const scene of ['spike', 'leaders']) {
      const s = reel.scenes.find((x) => x.role === scene);
      if (!s) continue;
      const rows = read(root, `public/${s.visual.src.replace(/\.png$/, '')}.json`)?.js?.rows ?? [];
      const top = F.screener[scene].top.map((x) => x.symbol);
      const got = rows.slice(0, top.length).map((r) => r.symbol);
      if ([...got].sort().join() !== [...top].sort().join()) bad.push(`${s.id}: the photo's top rows are ${got.join(', ') || '?'}, the fact pack's picks ${top.join(', ')}`);
    }
    if (bad.length) add('review-picks', 'fail', `${bad.length} pick problem(s)`, bad.join('; '));
    else add('review-picks', 'pass', `tickers on screen are the fact pack's picks; photos show the same rows`);
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

  // ---------------------------------------------------------------- review-index
  {
    const scenes = reel.scenes.filter((s) => s.visual?.type === 'image' && /vnindex-/.test(s.visual.src));
    const fallback = scenes.filter((s) => s.visual.src.includes('vnindex-terminal'));
    if (fallback.length) add('review-index', 'warn', `the index chart is the terminal's (FireAnt capture unavailable) in ${fallback.length} scene(s)`, 'the user chose FireAnt photos; re-run node scripts/review/shots.mjs --only=fireant when Chrome is free, then scaffold again');
    else add('review-index', 'pass', scenes.length ? 'index chart photographed on FireAnt' : 'no index chart');
  }
  return out;
}
