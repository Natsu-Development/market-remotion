#!/usr/bin/env node
/**
 * The last gate before a reel goes to the Chứng Vịt Page as a DRAFT (skill publish-video).
 *
 *   node scripts/publish/prep.mjs <Id>                    Channel | DailyReview | …
 *   node scripts/publish/prep.mjs <Id> --file=out/x.mp4 --caption=out/x.caption.txt
 *
 * A gate, not an uploader. It checks what can only be wrong once — a post that went out has been
 * seen, and a reel with yesterday's numbers stays in someone's feed after it is taken down — then
 * prints the ONE file to upload, the Page and the caption. It never copies the video and never
 * touches Chrome: the upload is SKILL.md driving scripts/publish/fb.py, which also owns the Chrome
 * profile check. Ported from video-factory's steps/publish_prep.py.
 *
 * Blocks (exit 1):
 *   - the reel is not "reviewed" (npm run approve), or verify reports errors — this is the first
 *     verify after the voice exists; approve ran before it, with the audio checks skipped
 *   - the reel's video missing (out/<id>.mp4; a dated market-review edition out/review/<format>-<edition>.mp4,
 *     scripts/lib/outputs.mjs — the file render.mjs wrote), or older than anything it was rendered from: content/<reel>.json and
 *     every asset the reel names (voice, screenshots, logo) — a stale render shows old numbers
 *   - a scene with no voice track, no video/audio stream, shorter than the Reels floor
 *   - the name on screen (footer, outro brand, channel.name) is not the Page's name
 *   - no caption, a caption older than the reel, a caption with a call word (page.json)
 * Warns: caption numbers the reel neither shows nor cites; not one body line; hashtag count, tail
 *   or diacritics; codec not h264/aac; frame not 1080×1920.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {dirname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {videoOut} from '../lib/outputs.mjs';
import {reels} from '../lib/reels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const PAGE = readJson('.claude/skills/publish-video/page.json');
const CHANNEL = readJson('src/shared/content-rules.json').channel?.name;
const ASSET = /\.(png|jpe?g|webp|svg|wav|mp3|m4a)$/i;   // paths under public/ that end up in the render
const NUM = /\d+(?:[.,]\d+)*/g;

const argv = process.argv.slice(2);
const opt = (n, d) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const CONTENT = Object.fromEntries(reels(ROOT));
const id = argv.find((a) => !a.startsWith('--'));
if (!id || !CONTENT[id]) {
  console.error(`Usage: node scripts/publish/prep.mjs <Id>   (${Object.keys(CONTENT).join(' | ')})`);
  process.exit(2);
}

const rel = (p) => relative(ROOT, p);
const mtime = (p) => statSync(p).mtimeMs;
const nfc = (s) => String(s ?? '').normalize('NFC');
const walk = (x, visit) => (x && typeof x === 'object' ? Object.values(x).forEach((v) => walk(v, visit)) : visit(x));

const contentPath = resolve(ROOT, CONTENT[id]);
const reel = readJson(CONTENT[id]);
// The file render.mjs wrote: out/<id>.mp4, or out/review/<format>-<edition>.mp4 for a dated edition (one video per daily
// edition, user 2026-10-06 — out/dailyreview.mp4 no longer exists).
const mp4 = resolve(ROOT, opt('file', videoOut({id, reel}).out));
const captionPath = resolve(ROOT, opt('caption', `out/${id.toLowerCase()}.caption.txt`));
const bad = [];
const warn = [];

// Vietnamese writes 1.780,68: '.' groups thousands and ',' is the decimal mark, while the fact
// pack stores floats. A caption number is read both ways and passes when a value the reel USES —
// on screen, or a fact a scene cites (`citedFacts`) — rounds to it at the caption's own precision.
// Not the whole fact pack: the daily one holds every stock's numbers, so any figure would be in it.
const readings = (tok) => [...new Set([tok.replace(/\./g, '').replace(',', '.'), tok.replace(/,/g, '')])]
  .map((s) => ({n: Number(s), dp: (s.split('.')[1] ?? '').length}))
  .filter(({n}) => Number.isFinite(n));

const untracedNumbers = (text) => {
  const pool = [];
  const add = (v, numbersToo) => {
    if (typeof v === 'number' && numbersToo) pool.push(Math.abs(v), Math.abs(v * 100));
    else if (typeof v === 'string') for (const t of v.match(NUM) ?? []) pool.push(...readings(t).map((r) => r.n));
  };
  if (reel.facts && existsSync(resolve(ROOT, reel.facts))) {
    const facts = readJson(reel.facts);
    const at = (path) => path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce((o, k) => o?.[k], facts);
    for (const s of reel.scenes ?? []) for (const p of s.citedFacts ?? []) walk(at(p), (v) => add(v, true));
  }
  // strings only: headlines, labels, ticker — a scene's `at` or `duration` is not a claim
  walk([reel.title, reel.edition, reel.ticker, (reel.scenes ?? []).map((s) => [s.eyebrow, s.beats, s.visual])], (v) => add(v, false));
  const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;
  return (text.match(NUM) ?? []).filter((tok) =>
    !readings(tok).some(({n, dp}) => pool.some((x) => Math.abs(round(x, dp) - n) < 1e-9)));
};

// ── 1. the review gate ──────────────────────────────────────────────────────────────────────
if (reel.status !== 'reviewed') {
  bad.push(`${CONTENT[id]} is "${reel.status ?? '(none)'}", not "reviewed" — the user approves on the review page, then npm run approve -- ${id} and a fresh npm run build -- --id=${id}`);
}
const v = spawnSync('node', [resolve(ROOT, 'scripts/verify.mjs'), id, '--json'], {cwd: ROOT, encoding: 'utf8'});
if (v.status === 2 || !v.stdout) {
  bad.push(`verify broke (exit ${v.status}) — run npm run verify -- ${id} and read it`);
} else {
  const report = JSON.parse(v.stdout);
  const fails = [...(report.reels ?? []).flatMap((r) => r.checks ?? []), ...(Array.isArray(report.repoChecks) ? report.repoChecks : [])]
    .filter((c) => c.severity === 'FAIL');
  if (report.errors || fails.length) {
    bad.push(`verify reports ${report.errors || fails.length} error(s):\n      ` + fails.map((c) => `${c.id}: ${c.message}`).join('\n      '));
  }
}

// ── 2. the file, and everything it was rendered from ────────────────────────────────────────
const info = {};
if (!existsSync(mp4) || statSync(mp4).size === 0) {
  bad.push(`no ${rel(mp4)} — npm run build -- --id=${id}`);
} else {
  const assets = new Set();
  walk(reel, (x) => typeof x === 'string' && ASSET.test(x) && assets.add(resolve(ROOT, 'public', x)));
  const deps = [contentPath, ...assets];
  const silent = (reel.scenes ?? []).filter((s) => !s.audio).map((s) => s.id);
  if (silent.length) bad.push(`${silent.length} scene(s) have no voice track, so the render is silent there: ${silent.join(', ')} — npm run build -- --id=${id}`);
  const missing = deps.filter((p) => !existsSync(p));
  if (missing.length) bad.push(`the reel points at files that are gone: ${missing.map(rel).join(', ')}`);
  const newer = deps.filter((p) => existsSync(p) && mtime(p) > mtime(mp4) + 1000);
  if (newer.length) {
    bad.push(`${rel(mp4)} is older than what it shows — changed after the render: ${newer.map(rel).join(', ')}. ` +
      `Re-render (npm run build -- --id=${id}); even an approve counts, since the render cannot prove it was made from the approved words`);
  }

  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp4], {encoding: 'utf8'});
  if (probe.status !== 0) {
    bad.push(`ffprobe cannot read ${rel(mp4)}${probe.error ? ` (${probe.error.message})` : ''}`);
  } else {
    const p = JSON.parse(probe.stdout);
    const vs = p.streams?.find((s) => s.codec_type === 'video');
    const as = p.streams?.find((s) => s.codec_type === 'audio');
    Object.assign(info, {duration: Number(p.format?.duration ?? 0), mb: statSync(mp4).size / 1048576,
      w: vs?.width, h: vs?.height, vcodec: vs?.codec_name, acodec: as?.codec_name});
    if (!vs) bad.push('the file has no video stream');
    if (!as) bad.push('the file has no audio stream');
    if (info.duration < PAGE.minSeconds) bad.push(`${info.duration.toFixed(1)} s — Facebook Reels needs at least ${PAGE.minSeconds} s`);
    if (vs && vs.codec_name !== 'h264') warn.push(`video codec ${vs.codec_name}, not h264 — Facebook will transcode it`);
    if (as && as.codec_name !== 'aac') warn.push(`audio codec ${as.codec_name}, not aac — Facebook will transcode it`);
    if (vs && (vs.width !== 1080 || vs.height !== 1920)) warn.push(`frame ${vs.width}×${vs.height}, not the 1080×1920 canvas`);
  }
}

// ── 3. the name on screen is the name of the Page ───────────────────────────────────────────
const outro = (reel.scenes ?? []).find((s) => s.visual?.type === 'outro');
const names = {
  'content-rules channel.name': CHANNEL,
  ...(reel.footer === false ? {} : {'reel footer': reel.footer}),
  ...(outro ? {'outro brand': outro.visual.brand} : {}),
};
const off = Object.entries(names).filter(([, n]) => nfc(n) !== nfc(PAGE.name));
if (off.length) {
  bad.push(`the reel does not carry the Page's name "${PAGE.name}": ${off.map(([k, n]) => `${k} = ${JSON.stringify(n)}`).join(', ')} — one of them is declared wrong; STOP`);
}

// ── 4. the caption ──────────────────────────────────────────────────────────────────────────
const cap = {};
if (!existsSync(captionPath) || !readFileSync(captionPath, 'utf8').trim()) {
  bad.push(`no caption at ${rel(captionPath)} — write it from the reel's narration (SKILL.md §1)`);
} else {
  const text = nfc(readFileSync(captionPath, 'utf8')).trim();
  const body = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.split(/\s+/).every((w) => w.startsWith('#')));
  const tags = text.match(/#[^\s#]+/g) ?? [];
  const tail = PAGE.caption.tailTags.split(/\s+/);
  Object.assign(cap, {text, bodyText: body.join(' '), tags});

  if (mtime(captionPath) + 1000 < mtime(contentPath)) {
    bad.push(`${rel(captionPath)} is older than ${CONTENT[id]} — written for an earlier version or edition; rewrite it from this one`);
  }
  const lower = cap.bodyText.toLowerCase();
  const calls = PAGE.caption.callWords.filter((w) => lower.includes(nfc(w).toLowerCase()));
  if (calls.length) bad.push(`caption reads as an investment call: ${calls.map((w) => `"${w}"`).join(', ')} — say what the chart shows, not what to do`);

  if (body.length !== 1) warn.push(`caption has ${body.length} body lines — the Page's shape is ONE line, then the hashtags`);
  if (cap.bodyText.length > PAGE.caption.maxBodyChars) warn.push(`caption body is ${cap.bodyText.length} characters — the Reels player cuts it near 50`);
  const want = PAGE.caption.topicTags + tail.length;
  if (tags.length !== want) warn.push(`${tags.length} hashtags — the shape is ${PAGE.caption.topicTags} topic tags + the tail (${want})`);
  if (tags.slice(-tail.length).join(' ') !== tail.join(' ')) warn.push(`hashtags must end with the Page's tail \`${PAGE.caption.tailTags}\`, not \`${tags.slice(-tail.length).join(' ')}\``);
  const accented = tags.filter((t) => /[^\x00-\x7F]/.test(t));
  if (accented.length) warn.push(`hashtags with diacritics: ${accented.join(' ')} — write them without, CamelCase (#PhienPhanPhoi)`);
  const unmatched = untracedNumbers(cap.bodyText);
  if (unmatched.length) warn.push(`caption numbers the reel neither shows nor cites (citedFacts in ${reel.facts ?? 'the fact pack'}): ${unmatched.join(', ')}`);
}

// ── report ──────────────────────────────────────────────────────────────────────────────────
for (const w of warn) console.log(`WARN  ${w}`);
if (bad.length) {
  for (const b of bad) console.log(`FAIL  ${b}`);
  console.log(`\nNOT ready for ${PAGE.name}. Fix the FAIL lines and run again.`);
  process.exit(1);
}

console.log(`\nReady to save as a draft: ${rel(mp4)}\n`);
console.log(`  PAGE     ${PAGE.name}  https://www.facebook.com/profile.php?id=${PAGE.pageId}`);
console.log(`  render   ${info.w}x${info.h}  ${info.duration.toFixed(0)} s  ${info.mb.toFixed(0)} MB  ${info.vcodec}/${info.acodec}`);
console.log(`  caption  ${cap.bodyText.length} characters + ${cap.tags.length} hashtags; the first 50: "${[...cap.bodyText].slice(0, 50).join('')}"`);
console.log('\n  ---- caption ----');
for (const l of cap.text.split('\n')) console.log(`  ${l}`);
console.log('  -----------------\n');
console.log(`  upload   ${mp4}`);
console.log(`  caption  ${captionPath}`);
console.log('\nThis only checks. Next, SKILL.md §3: ../video-factory/.venv/bin/python scripts/publish/fb.py whoami');
