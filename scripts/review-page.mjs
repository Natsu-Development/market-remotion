#!/usr/bin/env node
/**
 * Builds the review page a person reads before a reel is approved: one card per
 * scene with a rendered still, the headlines, the narration, the panel text and
 * on-image marks, the brief's intent, the writer's `unsupported` note and the
 * verify result — as a folder the agent publishes as an Artifact.
 *
 *   npm run review-page -- Channel                         → out/review/channel/index.html + stills/*.jpg
 *   npm run review-page -- Channel --before=<content.json> before/after narration columns
 *   npm run review-page -- Channel --notes=<file.json>     director verdicts (default: <out>/notes.json)
 *   npm run review-page -- Channel --no-stills             reuse the stills already in the folder
 *   npm run review-page -- Channel --out=<dir>
 *
 * Stills come from `npx remotion still <Id>` for every beat — the last one 1.5s in (later when its marks
 * need longer to finish drawing) as
 * <scene>.jpg, earlier ones just before the next beat as <scene>-b<N>.jpg — marks drawn,
 * the camera settled on that beat's shot — at 50% scale. About ten seconds per still; `--no-stills` when
 * only the words changed.
 *
 * Notes file, all optional:
 *   {"_summary": "one paragraph for the top of the page",
 *    "_conclusion": [{"tag": "Năm", "level": "pass|warn|fail", "text": "…"}],
 *    "<sceneId>": {"level": "pass|warn|fail", "title": "…", "notes": ["…"]}}
 *
 * The page grades nothing itself — verify does that (`--json`). It lays the
 * reel out so the reviewer never opens the JSON, and it says out loud what the
 * fact pack could not support.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reels} from './lib/reels.mjs';
import {roleOf as roleIn, roleSpec} from './lib/roles.mjs';
import {loadRules} from './lib/rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};
const arg = argv.find((a) => !a.startsWith('--'));
const REG = reels(ROOT);
if (!arg) {
  console.error(`Usage: npm run review-page -- <Id | content/<name>.json> [--before=content.json] [--notes=file.json] [--out=dir] [--no-stills]   (${[...REG.keys()].join(' | ')})`);
  process.exit(2);
}
const path = arg.endsWith('.json') ? arg : REG.get(arg);
if (!path) {
  console.error(`No reel "${arg}". Registered: ${[...REG.keys()].join(', ')}`);
  process.exit(2);
}
const id = arg.endsWith('.json') ? [...REG].find(([, p]) => p === arg)?.[0] : arg;
if (!id) {
  console.error(`${arg} is not registered in src/Root.tsx — stills need a composition id (add it to REELS first)`);
  process.exit(2);
}
const name = basename(path, '.json');
const reel = JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
/** The rules grading this reel: its own `rules` file, or content-rules.json (scripts/lib/rules.mjs). */
const R = loadRules(ROOT, {reel});
const OUT = resolve(ROOT, opt('out') ?? `out/review/${name}`);
const STILLS = resolve(OUT, 'stills');
mkdirSync(STILLS, {recursive: true});

const readJson = (p) => { try { return JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')); } catch { return null; } };
const readText = (p) => { try { return readFileSync(resolve(ROOT, p), 'utf8'); } catch { return null; } };
const facts = readJson(`content/${name}.facts.json`);
const brief = readText(`brief/${name}.md`);
const seriesMeta = readJson(R.series.path.replace(/\.json$/, '.meta.json'));
const notesPath = opt('notes') ?? resolve(OUT, 'notes.json');
const notes = readJson(notesPath) ?? {};
const before = opt('before') ? readJson(opt('before')) : null;
// Row-by-row narration only reads right when the scenes line up; a restructured reel gets a
// side-by-side of the two scene lists instead.
const sameScenes = !!before && before.scenes.length === reel.scenes.length && reel.scenes.every((sc, i) => before.scenes[i]?.id === sc.id);

// ------------------------------------------------------------------ verify

const v = spawnSync('node', [resolve(ROOT, 'scripts/verify.mjs'), id, '--json'], {cwd: ROOT, encoding: 'utf8'});
let verify = null;
try { verify = JSON.parse(v.stdout); } catch { console.error(`verify did not return JSON (exit ${v.status}):\n${v.stderr || v.stdout}`); }
const checks = verify ? [...(verify.reels.find((r) => r.reel === id)?.checks ?? []), ...(verify.repoChecks ?? [])] : [];
const sev = (c) => String(c?.severity ?? '').toLowerCase();
const check = (cid) => checks.find((c) => c.id === cid);
const nFail = checks.filter((c) => sev(c) === 'fail').length;
const nWarn = checks.filter((c) => sev(c) === 'warn').length;

// ------------------------------------------------------------------ stills

const fps = R.layout.fps;
const frames = [];
let cursor = 0;
for (const s of reel.scenes) {
  const n = Math.round((s.duration ?? 4) * fps);
  const lastAt = Math.max(0, ...s.beats.map((b) => b.at ?? 0));
  // The last beat's still waits for its marks: ImagePanel draws a later beat's marks 4 frames in and 5 frames
  // apart, each settling in ~15 frames, so nine marks take about two seconds — at +1.5s the last one was
  // still half drawn (scene 10's 1586 circle, 2026-09-29).
  const lastBeat = s.beats.length - 1;
  const marks = s.visual?.type === 'image' ? (s.visual.annotations ?? []).filter((a) => (a.beat ?? 0) === lastBeat).length : 0;
  const settle = lastBeat > 0 && marks ? (4 + (marks - 1) * 5 + 15) / fps : 0;
  const inScene = Math.max(0, Math.min(n - 15, Math.round((lastAt + Math.max(1.5, settle)) * fps)));
  // One still per beat: a photo scene with a shot list reframes on every beat, and the last
  // frame alone hides the wide that opened it. Earlier beats: just before the next beat, when
  // that beat's marks have all drawn and its shot has settled.
  const beatStills = s.beats.slice(0, -1).map((b, k) => {
    const next = Math.round((s.beats[k + 1].at ?? 0) * fps) - 8;
    const at = Math.max(0, Math.min(next, n - 15));
    return {file: `${s.id}-b${k + 1}.jpg`, frame: cursor + at, beat: k};
  });
  const last = {file: `${s.id}.jpg`, frame: cursor + inScene, beat: s.beats.length - 1};
  frames.push({id: s.id, frame: cursor + inScene, start: cursor, n, stills: [...beatStills, last]});
  cursor += n;
}
if (!flag('no-stills')) {
  for (const f of frames.flatMap((x) => x.stills.map((st) => ({...st, id: x.id})))) {
    const file = resolve(STILLS, f.file);
    process.stdout.write(`still ${f.file.padEnd(30)} frame ${String(f.frame).padStart(5)} … `);
    const r = spawnSync('npx', ['remotion', 'still', id, file, `--frame=${f.frame}`, '--scale=0.5', '--image-format=jpeg', '--jpeg-quality=82', '--log=error'], {cwd: ROOT, encoding: 'utf8'});
    if (r.status !== 0) {
      console.log('FAIL');
      console.error(r.stderr || r.stdout);
      process.exit(1);
    }
    console.log('ok');
  }
}
const missingStills = frames.filter((f) => !existsSync(resolve(STILLS, `${f.id}.jpg`))).map((f) => f.id);
if (missingStills.length) console.warn(`no still for: ${missingStills.join(', ')} (run without --no-stills)`);

// ------------------------------------------------------------------ helpers

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const words = (t) => String(t ?? '').trim().split(/\s+/).filter(Boolean).length;
const num = (n) => (typeof n === 'number' ? String(Math.round(n * 100) / 100).replace('.', ',') : esc(n));
const mmss = (fr) => { const s = Math.round(fr / fps); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const roleOf = (scene) => roleIn(R, scene);
const headline = (b) => [b.line1, b.line2].filter(Boolean).join(' / ');
/** vox-director shot sizes, from how far the camera has zoomed into the photo. */
const shotSize = (z) => (z < 1.15 ? 'EST_WIDE' : z < 1.6 ? 'WIDE' : z < 2.2 ? 'MEDIUM' : z < 3 ? 'CLOSE' : 'DETAIL');
const ACCENT = {gold: 'var(--gold)', red: 'var(--fail)', green: 'var(--pass)', white: 'var(--ink)'};
const LEVEL = {pass: ['Đạt', 'pass'], warn: ['Cần sửa', 'warn'], fail: ['Hỏng', 'fail']};
const sevClass = (c) => ({fail: 'fail', warn: 'warn', pass: 'pass', skip: 'warn'}[sev(c)] ?? 'warn');
const sevText = (c) => ({fail: 'FAIL', warn: 'WARN', pass: 'PASS', skip: 'SKIP'}[sev(c)] ?? '?');

/**
 * Director intent per scene, in brief order (H2 sections, minus the visual key lines). The
 * section runs to the next H2 or the end of the file — `(?![\s\S])`, because under the `m` flag
 * a bare `$` ends it at the first line break and kept only a section's first line.
 */
const intents = brief
  ? [...brief.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=\n## |\s*(?![\s\S]))/gm)].map((m) => ({
      head: m[1].trim(),
      lines: m[2].split('\n').map((l) => l.trim()).filter((l) => l && !/^(src|source|fit|focus|caption|zoom|sourceCorner|act):/.test(l)),
    }))
  : [];

const panelText = (vis) => {
  const p = [];
  if (vis.caption) p.push(`Caption: ${esc(vis.caption)}`);
  switch (vis.type) {
    case 'image':
      p.push(`Ảnh: <code>${esc(vis.src)}</code> · nguồn ${esc(vis.source ?? '—')} · fit ${esc(vis.fit ?? 'cover')}${vis.zoom ? ` · zoom ${num(vis.zoom)}` : ''}`);
      break;
    case 'list': for (const it of vis.items ?? []) p.push(`[${esc(it.icon)}] ${esc(it.text)}`); break;
    case 'cards': for (const c of vis.cards ?? []) p.push(`<b>${esc(c.title)}</b> — ${esc(c.body)}`); break;
    case 'bars': for (const b of vis.bars ?? []) p.push(`${esc(b.label)}: ${num(b.percent)}%`); break;
    case 'pictogram': p.push(`${num(vis.filledPercent)}% của lưới ${vis.rows}×${vis.columns}`); break;
    case 'zigzag': p.push(`${esc(vis.topLabel)} → ${esc(vis.endLabel)} (${esc(vis.upLabel)} / ${esc(vis.downLabel)}, ${vis.steps} bước)`); break;
    case 'riskReward': p.push(`${esc(vis.left?.label)} = ${num(vis.left?.value)} · ${esc(vis.right?.label)} = ${num(vis.right?.value)}`); break;
    case 'outro': p.push(`${esc(vis.brand)} · ${esc(vis.pill)} · ${esc(vis.line)}`); break;
    case 'movers': {
      for (const side of ['left', 'right']) {
        const col = vis[side];
        if (col) p.push(`${esc(col.title)}: ${(col.rows ?? []).map((r) => `${esc(r.symbol)} ${r.changePercent >= 0 ? '+' : ''}${num(r.changePercent)}%${r.volumeRatio != null ? ` (KL ×${num(r.volumeRatio)})` : ''}`).join(' · ')}`);
      }
      break;
    }
    case 'lines': {
      const last = (pane) => pane?.points?.[pane.points.length - 1];
      const first = (pane) => pane?.points?.[0];
      for (const pane of [vis.top, vis.bottom]) {
        if (!pane) continue;
        p.push(`${esc(pane.label)}: ${pane.points.length} phiên, ${esc(first(pane)?.[0])} ${num(first(pane)?.[1])} → ${esc(last(pane)?.[0])} ${num(last(pane)?.[1])}${pane.unit === 'percent' ? '%' : ''}`);
      }
      for (const e of vis.events ?? []) p.push(`mốc ${esc(e.t)}: ${esc(e.label ?? '')}`);
      break;
    }
    case 'candles':
      for (const b of vis.bands ?? []) p.push(`band ${esc(b.year)}: ${esc(b.label)}${b.drop ? ' ↓' : ''}`);
      if (vis.touches?.length) p.push(`touches ${vis.touches.map(esc).join(', ')}`);
      break;
    case 'macd': if (vis.peakLabel) p.push(`peak: ${esc(vis.peakLabel)}`); if (vis.note) p.push(`note: ${esc(vis.note)}`); break;
    case 'rsi':
      if (vis.note) p.push(esc(vis.note));
      for (const m of vis.marks ?? []) p.push(`mark ${esc(m.month)}: ${esc(m.label)}`);
      if (vis.divergence) p.push(`divergence ${esc(vis.divergence.from)} → ${esc(vis.divergence.to)}: ${esc(vis.divergence.label)}`);
      break;
    default: break;
  }
  return p;
};

// ------------------------------------------------------------------ scenes

const sceneHtml = reel.scenes.map((s, i) => {
  const vis = s.visual ?? {};
  const note = notes[s.id];
  const [lvlText, lvlClass] = LEVEL[note?.level] ?? [null, null];
  const intent = intents[i]?.lines ?? [];
  const panel = panelText(vis);
  const ann = (vis.annotations ?? []).map((a) => `${esc(a.kind)} · beat ${(a.beat ?? 0) + 1}${a.label || a.text ? ` · ${esc(a.label ?? a.text)}` : ''}`);
  const unsup = (reel.unsupported ?? []).find((u) => u.id === s.id);
  const f = frames[i];
  const shown = f.stills.filter((st) => existsSync(resolve(STILLS, st.file)));
  const cam = (vis.type === 'image' && Array.isArray(vis.shots) ? vis.shots : []).map((sh) => `beat ${(sh.beat ?? 0) + 1} · ${shotSize(sh.zoom)} ×${num(sh.zoom)} quanh (${num(sh.x)}; ${num(sh.y)}) · ${esc(sh.move ?? 'push_in')}${sh.cut ? ' · cắt thẳng' : ''}`);
  return `
<article class="scene" id="${esc(s.id)}">
  <figure class="still">${shown.length
    ? shown.map((st) => `<div class="shot">${shown.length > 1 ? `<span class="shot-k">beat ${st.beat + 1}</span>` : ''}<img src="stills/${esc(st.file)}" alt="Khung hình scene ${i + 1}, beat ${st.beat + 1}: ${esc(s.eyebrow)}" width="540" height="960" loading="lazy"></div>`).join('')
    : `<div class="nostill">chưa có khung hình</div>`}</figure>
  <div class="body">
    <header class="scene-head">
      <span class="idx">${String(i + 1).padStart(2, '0')}</span>
      <h2>${esc(s.eyebrow || s.id)}</h2>
      ${lvlText ? `<span class="verdict ${lvlClass}">${lvlText}</span>` : ''}
    </header>
    <p class="meta"><code>${esc(s.id)}</code> · ${esc(roleOf(s))} · panel <b>${esc(vis.type)}</b> · act ${esc(s.act)} · từ ${mmss(f.start)} · ~${num(s.duration)}s · ${words(s.narration)} từ${s.audio ? '' : ' · <b>chưa có giọng</b>'}</p>
    <div class="beats">
      ${s.beats.map((b, k) => `<div class="beat"><span class="beat-k">beat ${k + 1}${b.atSentence != null ? ` · câu ${b.atSentence + 1}` : ''}</span><div class="l1">${esc(b.line1)}</div>${b.line2 ? `<div class="l2" style="color:${ACCENT[b.accent ?? 'gold'] ?? ACCENT.gold}">${esc(b.line2)}</div>` : ''}</div>`).join('')}
    </div>
    <blockquote class="narration">${esc(s.narration)}</blockquote>
    ${roleSpec(R, roleOf(s)) ? `<div class="kv"><span class="k">Vai · ${esc(roleOf(s))}</span><p class="intent">${esc(roleSpec(R, roleOf(s)).job)}</p></div>` : ''}
    ${panel.length ? `<div class="kv"><span class="k">Panel</span><ul>${panel.map((p) => `<li>${p}</li>`).join('')}</ul></div>` : ''}
    ${cam.length ? `<div class="kv"><span class="k">Máy quay (shot)</span><ul>${cam.map((p) => `<li>${p}</li>`).join('')}</ul></div>` : ''}
    ${ann.length ? `<div class="kv"><span class="k">Mark trên ảnh</span><ul>${ann.map((p) => `<li>${p}</li>`).join('')}</ul></div>` : ''}
    ${intent.length ? `<div class="kv"><span class="k">Ý đồ trong brief</span><p class="intent">${esc(intent.join(' '))}</p></div>` : ''}
    ${unsup ? `<div class="note warn"><span class="k">Người viết báo: fact pack không đỡ được</span><p>${esc(unsup.why)}</p></div>` : ''}
    ${note ? `<div class="review ${lvlClass ?? 'pass'}"><p class="review-title">${esc(note.title ?? '')}</p><ul>${(note.notes ?? []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
  </div>
</article>`;
}).join('\n');

// ------------------------------------------------------------------ data anchors

const anchors = [];
if (facts) {
  const d = facts.daily;
  if (d?.latest) anchors.push(['Phiên cuối trong feed ngày', `${esc(d.latest.date)} · ${num(d.latest.closeExact ?? d.latest.close)} (${d.latest.changePercent >= 0 ? '+' : ''}${num(d.latest.changePercent)}%)`, `daily.latest${d.droppedIntraday ? ' · phiên đang chạy bị loại' : ''}`]);
  if (d?.ytd) anchors.push([`Biên ${d.ytd.year}`, `${num(d.ytd.low?.value)} (${esc(d.ytd.low?.date)}) – ${num(d.ytd.high?.value)} (${esc(d.ytd.high?.date)}) · rộng ${num(d.ytd.widthPercent)}% · vị trí ${num(d.ytd.positionPercent)}%`, 'daily.ytd']);
  for (const [i, p] of (facts.peaks ?? []).entries()) {
    const hl = p.drawdown?.highToLow;
    anchors.push([`Đỉnh tháng ${esc(p.month)}`, `cao ${num(hl?.highExact ?? p.high)} · đóng cửa tháng ${num(p.close)}${hl ? ` · rơi về ${num(hl.lowExact ?? hl.low)} (${esc(hl.lowMonth)}, ${num(hl.percentExact ?? hl.percent)}%)` : ''}`, `peaks[${i}]`]);
  }
  for (const [i, t] of (facts.troughs ?? []).entries()) anchors.push([`Đáy tháng ${esc(t.month)}`, `thấp ${num(t.low)} · đóng cửa tháng ${num(t.close)}`, `troughs[${i}]`]);
  const yrs = Array.isArray(facts.years) ? facts.years.slice(-4) : [];
  if (yrs.length) anchors.push([yrs.map((y) => esc(y.year)).join(' · '), `cao ${yrs.map((y) => num(y.high)).join(' · ')}`, 'years[]']);
  const vol = d?.volume;
  if (vol?.maxMonth) anchors.push(['Khối lượng tháng (tr cp/phiên)', `${esc(vol.maxMonth.month)} ${num(vol.maxMonth.avgM)} · ${esc(vol.minMonth?.month)} ${num(vol.minMonth?.avgM)} · ${esc(vol.latestMonth?.month)} ${num(vol.latestMonth?.avgM)}${vol.latestMonth?.sessions ? ` (${vol.latestMonth.sessions} phiên)` : ''}`, 'daily.volume']);
  // A fact pack may carry its own rows for this table (market-review's does): [{label, value, path}].
  for (const a of Array.isArray(facts.anchors) ? facts.anchors : []) anchors.push([esc(a.label), esc(a.value), esc(a.path)]);
  const sig = facts.terminal?.signals?.latest;
  if (sig && typeof sig === 'object') anchors.push(['Tín hiệu terminal mới nhất', Object.entries(sig).filter(([, x]) => ['string', 'number', 'boolean'].includes(typeof x)).map(([k, x]) => `${esc(k)} ${num(x)}`).join(' · '), 'terminal.signals.latest']);
}

// ------------------------------------------------------------------ page

const total = reel.scenes.reduce((a, s) => a + (s.duration ?? 0), 0);
const totalWords = reel.scenes.reduce((a, s) => a + words(s.narration), 0);
const imgSources = [...new Set(reel.scenes.filter((s) => s.visual?.type === 'image').map((s) => s.visual.source ?? '?'))];
const drawn = reel.scenes.filter((s) => ['candles', 'macd', 'rsi'].includes(s.visual?.type)).map((s) => s.id);
const srcLabel = facts?.source?.label ?? seriesMeta?.source ?? (seriesMeta?.reconstructed ? 'chuỗi DỰNG LẠI' : '—');
const reconstructed = facts?.source?.reconstructed ?? seriesMeta?.reconstructed ?? false;
const voiced = reel.scenes.filter((s) => s.audio).length;
// Framing cadence (vox-director: change the picture every 3–5s): a photo counts its camera shots
// (one scene-long push-in without them); any other panel counts its beats, which rebuild it.
const framings = reel.scenes.reduce((a, s) => a + (s.visual?.type === 'image'
  ? (Array.isArray(s.visual.shots) && s.visual.shots.length ? s.visual.shots.length : 1)
  : s.beats.length), 0);
const cadence = framings ? total / framings : 0;
const verifyTile = !verify ? ['fail', 'không chạy được'] : nFail ? ['fail', `${nFail} lỗi · ${nWarn} cảnh báo`] : nWarn ? ['warn', `0 lỗi · ${nWarn} cảnh báo`] : ['pass', '0 lỗi · 0 cảnh báo'];
const factsC = check('facts'), styleC = check('style');
const nextStep = nFail ? 'Sửa lỗi verify trước — chưa duyệt được' : reel.status === 'reviewed' ? 'Đã duyệt: lồng tiếng và render' : voiced === reel.scenes.length ? 'Duyệt → npm run approve → render' : voiced ? `Duyệt → thu ${reel.scenes.length - voiced} scene chưa có giọng (--force --only) → render` : 'Duyệt → npm run approve → lồng tiếng → render';
const conclusion = Array.isArray(notes._conclusion) ? notes._conclusion : [];
const summary = notes._summary
  ?? 'Đây là điểm dừng duy nhất trước khi lồng tiếng và render. Đọc lời từng scene thành tiếng như người xem sẽ nghe, nhìn khung hình, đọc phần "fact pack không đỡ được", rồi trả lời: duyệt · sửa scene nào, đổi gì · bỏ.';
const now = new Date();

const html = `<title>Duyệt reel ${esc(id)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;800&family=JetBrains+Mono:wght@400;700&display=swap">
<style>
:root{
  --paper:#F2F4F7; --surface:#FFFFFF; --ink:#101A2B; --ink-2:#4B5868; --ink-3:#7A8797; --rule:#D8DEE7;
  --gold:#A8780A; --gold-soft:#F6EBC6; --pass:#177A47; --pass-soft:#DDF3E6; --warn:#A35F00; --warn-soft:#FBEACB; --fail:#B4312B; --fail-soft:#F9DEDB;
  --chip:#E9EDF3; --shadow:0 1px 2px rgba(16,26,43,.06),0 8px 24px rgba(16,26,43,.06);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#0B1220; --surface:#121B2C; --ink:#EAF0F7; --ink-2:#A6B2C2; --ink-3:#7F8B9B; --rule:#243049;
    --gold:#F3C019; --gold-soft:#3A3010; --pass:#3BD37E; --pass-soft:#123322; --warn:#F0B429; --warn-soft:#3A2B0C; --fail:#F0655C; --fail-soft:#3D1715;
    --chip:#1B2638; --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35);
  }
}
:root[data-theme="dark"]{
  --paper:#0B1220; --surface:#121B2C; --ink:#EAF0F7; --ink-2:#A6B2C2; --ink-3:#7F8B9B; --rule:#243049;
  --gold:#F3C019; --gold-soft:#3A3010; --pass:#3BD37E; --pass-soft:#123322; --warn:#F0B429; --warn-soft:#3A2B0C; --fail:#F0655C; --fail-soft:#3D1715;
  --chip:#1B2638; --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35);
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:"Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.55;margin:0}
.wrap{max-width:1080px;margin:0 auto;padding-inline:20px;padding-block:32px 64px}
code,.mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}
h1{font-size:clamp(28px,4vw,40px);font-weight:800;letter-spacing:-.01em;line-height:1.1;margin:0 0 6px;text-wrap:balance}
h2{font-size:20px;font-weight:600;margin:0;text-wrap:balance}
h3{font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin:0 0 12px}
.sub{color:var(--ink-2);margin:0 0 20px;max-width:65ch}
.rule{width:54px;height:4px;background:var(--gold);margin:0 0 18px}
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 28px}
.tile{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:14px 16px}
.tile .k{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px}
.tile .v{font-size:22px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}
.tile .v.small{font-size:15px;font-weight:600;line-height:1.35}
.tile.fail .v{color:var(--fail)} .tile.warn .v{color:var(--warn)} .tile.pass .v{color:var(--pass)}
section{margin:0 0 36px}
.card{background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:20px 22px}
.fixes{margin:0;padding-left:0;list-style:none;display:grid;gap:10px}
.fixes li{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start}
.sev{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px;white-space:nowrap;margin-top:3px}
.sev.fail{background:var(--fail-soft);color:var(--fail)} .sev.warn{background:var(--warn-soft);color:var(--warn)} .sev.pass{background:var(--pass-soft);color:var(--pass)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
td.num{font-family:"JetBrains Mono",monospace;white-space:nowrap}
td.fix{color:var(--ink-2);font-size:13px}
.tbl{overflow-x:auto}
.scene{display:grid;grid-template-columns:200px 1fr;gap:24px;background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:20px;margin:0 0 18px;box-shadow:var(--shadow)}
.still{margin:0}
.still img{display:block;width:100%;height:auto;max-width:100%;border-radius:8px;border:1px solid var(--rule);background:#000}
.shot{position:relative}.shot+.shot{margin-top:10px}
.shot-k{position:absolute;top:6px;left:6px;font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.6);padding:2px 6px;border-radius:4px}
.nostill{aspect-ratio:9/16;max-width:100%;border-radius:8px;border:1px dashed var(--rule);display:grid;place-items:center;color:var(--ink-3);font-size:13px;text-align:center;padding:12px}
.scene-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px}
.idx{font-family:"JetBrains Mono",monospace;font-size:13px;color:var(--gold);font-weight:700}
.verdict{margin-left:auto;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px}
.verdict.pass{background:var(--pass-soft);color:var(--pass)} .verdict.warn{background:var(--warn-soft);color:var(--warn)} .verdict.fail{background:var(--fail-soft);color:var(--fail)}
.meta{color:var(--ink-3);font-size:13px;margin:0 0 14px}
.beats{display:flex;gap:16px;flex-wrap:wrap;margin:0 0 14px}
.beat{flex:1 1 200px;border-left:3px solid var(--rule);padding-left:12px}
.beat-k{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:4px}
.l1,.l2{font-weight:800;text-transform:uppercase;font-size:17px;line-height:1.2;letter-spacing:-.01em}
.l2{margin-top:2px}
.narration{margin:0 0 14px;padding:12px 16px;border-left:3px solid var(--gold);background:var(--gold-soft);border-radius:0 8px 8px 0;font-size:15px;max-width:70ch}
.kv{margin:0 0 12px}
.kv .k,.note .k{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:4px}
.kv ul{margin:0;padding-left:18px;color:var(--ink-2)}
.kv .intent{margin:0;color:var(--ink-2);font-size:14px;max-width:72ch}
.note{border-radius:8px;padding:10px 14px;margin:0 0 12px;font-size:14px}
.note p{margin:0}
.note.warn{background:var(--warn-soft);color:var(--ink)}
.review{border-radius:8px;padding:12px 16px;font-size:14px}
.review.pass{background:var(--pass-soft)} .review.warn{background:var(--warn-soft)} .review.fail{background:var(--fail-soft)}
.review-title{margin:0 0 6px;font-weight:600}
.review ul{margin:0;padding-left:18px}
.review li+li{margin-top:4px}
.unsup{margin:0;padding-left:0;list-style:none;display:grid;gap:10px}
.unsup li{padding:10px 14px;border-radius:8px;background:var(--warn-soft)}
.unsup code{display:block;margin-bottom:4px;color:var(--ink-2)}
.foot{color:var(--ink-3);font-size:13px;border-top:1px solid var(--rule);padding-top:16px}
.cmp-head{display:grid;grid-template-columns:1fr 1fr;gap:0;background:var(--chip);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.cmp-head span{padding:10px 16px}
.cmp-row{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--rule)}
.cmp-cell{padding:14px 16px;font-size:14px;color:var(--ink-2)}
.cmp-cell.after{color:var(--ink);background:var(--gold-soft)}
.cmp-cell p{margin:6px 0 0;max-width:60ch}
.cmp-k{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--ink-3)}
.cmp-hl{font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.02em;color:var(--ink-3)}
.cmp-cell.after .cmp-hl{color:var(--ink)}
details summary{cursor:pointer;font-size:14px;font-weight:600;color:var(--ink-2)}
@media (max-width:720px){.scene{grid-template-columns:1fr}.still{max-width:260px}.verdict{margin-left:0}.cmp-row,.cmp-head{grid-template-columns:1fr}}
a:focus-visible,summary:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
</style>
<div class="wrap">
  <div class="rule"></div>
  <h1>Duyệt reel ${esc(id)}</h1>
  <p class="sub">${esc(reel.title)}. Bản <b>${esc(reel.status ?? 'hand-authored')}</b> · ${reel.scenes.length} scene · ~${Math.round(total)}s · ${totalWords} chữ đọc${voiced ? ` · ${voiced}/${reel.scenes.length} scene đã có giọng` : ' · chưa có giọng'}. ${esc(summary)}</p>

  <div class="strip">
    <div class="tile ${verifyTile[0]}"><span class="k">npm run verify</span><span class="v">${esc(verifyTile[1])}</span></div>
    <div class="tile ${factsC ? sevClass(factsC) : 'warn'}"><span class="k">Số truy về pack</span><span class="v">${factsC ? (sev(factsC) === 'pass' ? '100%' : sevText(factsC)) : '—'}</span></div>
    <div class="tile ${styleC ? sevClass(styleC) : 'warn'}"><span class="k">Giọng người (style)</span><span class="v">${styleC ? sevText(styleC) : '—'}</span></div>
    <div class="tile ${cadence && cadence <= 5 ? 'pass' : 'warn'}"><span class="k">Nhịp đổi khung</span><span class="v">~${num(Math.round(cadence * 10) / 10)}s</span></div>
    <div class="tile"><span class="k">Chữ đọc</span><span class="v">${totalWords}${before ? ` <span style="font-size:14px;color:var(--ink-3);font-weight:500">(trước ${before.scenes.reduce((a, x) => a + words(x.narration), 0)})</span>` : ''}</span></div>
    <div class="tile ${nFail ? 'fail' : 'warn'}"><span class="k">Bước kế</span><span class="v small">${esc(nextStep)}</span></div>
    <div class="tile"><span class="k">Nguồn</span><span class="v small">Số: ${esc(srcLabel)}${reconstructed ? ' · <b>CHUỖI DỰNG LẠI</b>' : ''}${facts?.daily ? ' · zionle.io.vn (ngày)' : ''}${imgSources.length ? ` · ảnh: ${imgSources.map(esc).join(', ')}` : ''}${drawn.length ? ` · chart VẼ: ${drawn.map(esc).join(', ')}` : ''}</span></div>
  </div>

  ${conclusion.length ? `<section class="card">
    <h3>Kết luận của đạo diễn</h3>
    <ul class="fixes">${conclusion.map((c) => `<li><span class="sev ${LEVEL[c.level]?.[1] ?? 'pass'}">${esc(c.tag ?? '')}</span><span>${esc(c.text ?? '')}</span></li>`).join('')}</ul>
  </section>` : ''}

  ${reel.unsupported?.length ? `<section>
    <h3>Ý đồ mà fact pack không đỡ được — đọc trước khi duyệt</h3>
    <ul class="unsup">${reel.unsupported.map((u) => `<li><code>${esc(u.id)}</code>${esc(u.why)}</li>`).join('')}</ul>
  </section>` : ''}

  ${before && !sameScenes ? `<section>
    <h3>Cấu trúc: trước → sau</h3>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="cmp-head"><span>Trước · ${before.scenes.length} scene · ~${Math.round(before.scenes.reduce((a, x) => a + (x.duration ?? 0), 0))}s · ${before.scenes.reduce((a, x) => a + words(x.narration), 0)} chữ</span><span>Sau · ${reel.scenes.length} scene · ~${Math.round(total)}s · ${totalWords} chữ</span></div>
      <div class="cmp-row">
        <div class="cmp-cell">${before.scenes.map((x, k) => `<p><span class="cmp-k">${String(k + 1).padStart(2, '0')} · ${esc(roleOf(x))} · ${esc(x.visual?.type)} · ${num(x.duration)}s</span><br>${esc(x.eyebrow)}<br><span class="cmp-hl">${(x.beats ?? []).map((b) => esc(headline(b))).join(' → ')}</span></p>`).join('')}</div>
        <div class="cmp-cell after">${reel.scenes.map((x, k) => `<p><span class="cmp-k">${String(k + 1).padStart(2, '0')} · ${esc(roleOf(x))} · ${esc(x.visual?.type)}${Array.isArray(x.visual?.shots) ? ` · ${x.visual.shots.length} shot` : ''} · ${num(x.duration)}s</span><br>${esc(x.eyebrow)}<br><span class="cmp-hl">${x.beats.map((b) => esc(headline(b))).join(' → ')}</span></p>`).join('')}</div>
      </div>
    </div>
    <details style="margin-top:12px"><summary>Lời đọc bản trước (${before.scenes.length} scene)</summary><div class="card" style="margin-top:10px">${before.scenes.map((x, k) => `<p><span class="cmp-k">${String(k + 1).padStart(2, '0')} · ${esc(x.id)}</span><br>${esc(x.narration)}</p>`).join('')}</div></details>
  </section>` : ''}

  ${before && sameScenes ? `<section>
    <h3>Lời đọc: trước → sau</h3>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="cmp-head"><span>Trước · ${before.scenes.reduce((a, x) => a + words(x.narration), 0)} chữ</span><span>Sau · ${totalWords} chữ</span></div>
      ${reel.scenes.map((sc, i) => { const b = before.scenes.find((x) => x.id === sc.id) ?? before.scenes[i]; return `
      <div class="cmp-row">
        <div class="cmp-cell"><span class="cmp-k">${String(i + 1).padStart(2, '0')} · ${words(b?.narration)} chữ</span><p>${esc(b?.narration)}</p><p class="cmp-hl">${(b?.beats ?? []).map((x) => esc(headline(x))).join(' → ')}</p></div>
        <div class="cmp-cell after"><span class="cmp-k">${String(i + 1).padStart(2, '0')} · ${words(sc.narration)} chữ</span><p>${esc(sc.narration)}</p><p class="cmp-hl">${sc.beats.map((x) => esc(headline(x))).join(' → ')}</p></div>
      </div>`; }).join('')}
    </div>
  </section>` : ''}

  <section>
    <h3>Từng scene</h3>
    ${sceneHtml}
  </section>

  ${checks.length ? `<section>
    <h3>Kết quả verify</h3>
    <div class="card tbl"><table>
      <thead><tr><th></th><th>Check</th><th>Kết quả</th><th>Sửa</th></tr></thead>
      <tbody>${checks.map((c) => `<tr><td><span class="sev ${sevClass(c)}">${sevText(c)}</span></td><td class="num">${esc(c.id)}</td><td>${esc(c.message)}</td><td class="fix">${esc(c.fix ?? '')}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>` : ''}

  ${anchors.length ? `<section>
    <h3>Mốc dữ liệu trong fact pack</h3>
    <div class="card tbl"><table>
      <thead><tr><th>Mốc</th><th>Giá trị</th><th>Đường dẫn trong pack</th></tr></thead>
      <tbody>${anchors.map(([a, b, c]) => `<tr><td>${a}</td><td class="num">${b}</td><td class="fix">${c}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>` : ''}

  <p class="foot">Sinh ${esc(now.toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'}))} từ <code>${esc(path)}</code>${facts ? `, <code>content/${esc(name)}.facts.json</code> (${esc(srcLabel)}${facts.source?.fetchedAt ? `, tải ${esc(facts.source.fetchedAt.slice(0, 16).replace('T', ' '))} UTC` : ''})` : ''}${brief ? ` và <code>brief/${esc(name)}.md</code>` : ''}. Khung hình: <code>npx remotion still ${esc(id)}</code> cuối mỗi beat (beat cuối: +1,5s, hoặc tới khi mark cuối vẽ xong), thu nhỏ 50%. Không phải khuyến nghị đầu tư.</p>
</div>
`;

writeFileSync(resolve(OUT, 'index.html'), html);
const files = Object.fromEntries(frames.flatMap((f) => f.stills).filter((st) => existsSync(resolve(STILLS, st.file))).map((st) => [`stills/${st.file}`, `stills/${st.file}`]));
writeFileSync(resolve(OUT, 'files.json'), JSON.stringify(files, null, 1));
console.log(`wrote ${resolve(OUT, 'index.html').replace(ROOT + '/', '')} (${html.length} chars) · ${Object.keys(files).length} still(s)`);
console.log(`publish: Artifact file_path=${OUT.replace(ROOT + '/', '')}/index.html root=${OUT.replace(ROOT + '/', '')} files=<files.json>`);
if (verify) console.log(`verify: ${nFail} error(s) · ${nWarn} warning(s)${nFail ? ' — the page shows them; do not present as reviewable' : ''}`);
