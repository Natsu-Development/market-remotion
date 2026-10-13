#!/usr/bin/env node
/**
 * Re-post a published reel into every group of the Chứng Vịt Page through Business Suite, three groups a post
 * (skill share-groups; the Page itself is publish-video/page.json).
 *
 *   node scripts/publish/share.mjs fanout --video=<mp4> --text=<file> [--original=<link of the published post>]
 *                                         [--joined=<groups.json>] [--dry] [--retry]
 *
 * User 2026-10-12: "i give it a text for re-post the newest content on all group"; then, after a first look at sharing
 * the post group by group: "i see another page better: <Business Suite composer> using it to repost to another group";
 * then "Please ask when not provide and when the people confirm publish it to all page when the original video already
 * published, choose 3 group each once and re-post it". So the text is the user's (the agent asks for it and never
 * writes one) and every group gets the reel once, up to share.maxGroupsPerPost groups a post. User 2026-10-13: "Not need
 * to check the video already existed or not since when user using this skill, they ensure the video already published.
 * Just store the info of all group join as once and remove the step listing all group" — so nothing here checks the
 * original post (--original is only recorded in the log), and the groups come from the stored share-groups/groups.json.
 *
 * fanout  takes every group the Page joined from the stored .claude/skills/share-groups/groups.json (kept as it is;
 *         --joined= another list) — the target — then posts again
 *         and again with `fb.py bspost` given what is still missing: each post chooses ≤ share.maxGroupsPerPost groups
 *         in Business Suite's dialog as it is at that moment (it shows at most seven and rotates them), and the next
 *         post starts right after «Đăng» (share.spacingSeconds is 0 since the user's word of 12/10) — until every joined
 *         group has the reel or the run has opened Business Suite share.json maxPerRun times — 2, so at most 6 groups — and
 *         then it is done: no loop, no further run, no browser after the two posts (user 13/10: "I want this skill just
 *         open the browse twice for the twice post on business suite for 6 groups, after this action don't open browser
 *         any-time"). An opening that shows none of the missing groups counts too.
 *         log.json gets one line per group after every post, so a second run goes on where the first stopped. Stops
 *         on an UNSURE post («Đăng» clicked, no sign of the post: check those groups by hand; --retry posts them
 *         again), on two failed posts in a row, and when fb.py aborts (focus lost). --dry prints what is missing and
 *         posts nothing.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PAGE = JSON.parse(readFileSync(resolve(ROOT, '.claude/skills/publish-video/page.json'), 'utf8'));
const SHARE = JSON.parse(readFileSync(resolve(ROOT, '.claude/skills/share-groups/share.json'), 'utf8'));
const PY = process.env.PUBLISH_PYTHON || resolve(ROOT, '../video-factory/.venv/bin/python');
const FB = resolve(ROOT, 'scripts/publish/fb.py');

const argv = process.argv.slice(2);
const opt = (n, d) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const flag = (n) => argv.includes(`--${n}`);
const [cmd] = argv.filter((a) => !a.startsWith('--'));
if (cmd !== 'fanout' || !opt('video') || !opt('text')) {
  console.error('Usage: node scripts/publish/share.mjs fanout --video=<mp4> --text=<file> [--original=<link of the published post>]\n' +
    '                                             [--joined=<groups.json>] [--dry] [--retry]');
  process.exit(2);
}

const rel = (p) => relative(ROOT, p) || '.';
const die = (msg) => { console.error(`share: ${msg}`); process.exit(1); };
const nfc = (s) => String(s ?? '').normalize('NFC');
// A group is its exact name + member count: Business Suite's rows carry no link, and two groups are both "CHỨNG KHOÁN
// VIỆT" (512083 and 128365 members). Same rule as fb.py same_group: counts drift by a few between two reads.
const gname = (s) => nfc(s).replace(/[​‌‍⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
const same = (a, b) => gname(a.name) === gname(b.name) && (a.members == null || b.members == null ||
  Math.abs(a.members - b.members) <= Math.max(50, 0.02 * Math.max(a.members, b.members)));
const tag = (g) => `${gname(g.name)} · ${g.members ?? '?'}`;
const mins = (sec) => (sec % 60 ? `${Math.floor(sec / 60)} phút ${sec % 60} giây` : `${sec / 60} phút`);
const spacing = () => {
  const s = Array.isArray(SHARE.spacingSeconds) && SHARE.spacingSeconds.length === 2 ? SHARE.spacingSeconds.map(Number) : [180, 420];
  return s.every((n) => Number.isFinite(n) && n >= 0) && s[0] <= s[1] ? s : [180, 420];
};
const PER = Number.isInteger(SHARE.maxGroupsPerPost) && SHARE.maxGroupsPerPost > 0 ? SHARE.maxGroupsPerPost : 3;
// Dialog openings a run (user 2026-10-12: "I see the limit Facebook just display 7 groups, so maximum update to 6 group with
// 2 times open the dialog for the group not post"): ≤ MAX_RUN × PER groups a run; the next run goes on from log.json.
const MAX_RUN = Number.isInteger(SHARE.maxPerRun) && SHARE.maxPerRun > 0 ? SHARE.maxPerRun : 2;

const video = resolve(ROOT, opt('video'));
const textPath = resolve(ROOT, opt('text'));
const original = opt('original') ?? null;   // recorded only: the user vouches the reel is published (13/10)
const dry = flag('dry');
if (!/\.mp4$/i.test(video) || !existsSync(video)) die(`no mp4 at ${video} — pass the file prep.mjs printed`);
const text = existsSync(textPath) ? nfc(readFileSync(textPath, 'utf8')).replace(/\r\n/g, '\n').trim() : '';
if (!text) die(`${rel(textPath)} is empty or missing — the text is the user's: ask them for it, never write one`);

const KEY = basename(video).replace(/\.mp4$/i, '');
const DIR = resolve(ROOT, `out/publish/share-${KEY}`);
const LOG = resolve(DIR, 'log.json');
mkdirSync(DIR, {recursive: true});

// ── the target: every group the Page joined, stored once (user 13/10), counted by exact name ──
const readJsonList = (file, what) => {
  let v;
  try { v = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { die(`${rel(file)}: ${e.message}`); }
  if (!Array.isArray(v) || !v.length || !v.every((g) => g && g.name)) die(`${rel(file)} is not a list of ${what}`);
  return v;
};
const runFb = (args, minutes) => {
  const r = spawnSync(PY, [FB, ...args], {cwd: ROOT, encoding: 'utf8', timeout: minutes * 60 * 1000});
  return {r, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()};
};
const joinedFile = resolve(ROOT, opt('joined') ?? '.claude/skills/share-groups/groups.json');
if (!existsSync(joinedFile)) die(`no stored group list at ${rel(joinedFile)}`);
const joined = readJsonList(joinedFile, 'groups [{id, name}]');

let log = [];
if (existsSync(LOG)) {
  try { log = JSON.parse(readFileSync(LOG, 'utf8')); } catch { die(`${rel(LOG)} is not JSON — fix or move it; it is what keeps a group from getting the reel twice`); }
}
const save = () => writeFileSync(LOG, JSON.stringify(log, null, 2) + '\n');
const postedGroups = () => {
  const out = [];
  for (const e of log) if (e.status === 'posted' && !out.some((g) => same(g, e))) out.push(e);
  return out;
};
/** Joined names not yet covered: "CHỨNG KHOÁN VIỆT" joined twice needs two different posted groups of that name. */
const missing = () => {
  const need = new Map();
  for (const j of joined) need.set(gname(j.name), (need.get(gname(j.name)) ?? 0) + 1);
  const have = new Map();
  for (const g of postedGroups()) have.set(gname(g.name), (have.get(gname(g.name)) ?? 0) + 1);
  return [...need].filter(([n, c]) => (have.get(n) ?? 0) < c).map(([n, c]) => ({name: n, count: c - (have.get(n) ?? 0)}));
};
/** Groups whose post came back UNSURE («Đăng» clicked, no sign of the post): never chosen again unless --retry. */
const unsureGroups = () => (flag('retry') ? [] : log.filter((e) => e.status === 'unsure' && e.name && !postedGroups().some((p) => same(p, e))));

// ── Business Suite's dialog shows at most seven groups and rotates them, so each post chooses its ≤ PER groups in the
//    dialog itself (fb.py bspost with what is still missing) — and right after «Đăng» the next post starts: the user
//    2026-10-12, "Not need for waiting, after press the button Đăng continue to another page group … since the post is
//    waiting for approving" (share.spacingSeconds 0) ──
const [lo, hi] = spacing();
console.log(`\n${dry ? 'DRY RUN — nothing is posted' : 'FAN-OUT'} · ${KEY} · ${joined.length} group(s) joined, ${postedGroups().length} already have the reel`);
console.log(`${original ? `original ${original}\n` : ''}video    ${rel(video)}\ntext     ${rel(textPath)}\ngroups   ${rel(joinedFile)}`);
for (const l of text.split('\n')) console.log(`  | ${l}`);
console.log(`≤ ${PER} groups a post · ${hi ? `wait ${lo}–${hi} s between posts` : 'next post right after «Đăng»'} · at most ${MAX_RUN} dialog opening(s) this run (≤ ${MAX_RUN * PER} groups) · as Page ${PAGE.name}\n`);

const at = () => new Date().toISOString();
const lastJson = (out, key) => {
  const line = out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith(`${key} `)).pop();
  try { return line ? JSON.parse(line.slice(key.length + 1)) : null; } catch { return null; }
};
let done = 0, failed = 0, inARow = 0, stop = null, n = 0, opens = 0;
while (missing().length) {
  if (opens >= MAX_RUN) break;   // done: the skill opens Business Suite exactly MAX_RUN times (user 13/10), no further run
  const want = missing();
  console.log(`still without the reel: ${want.map((m) => `${m.name}${m.count > 1 ? ` ×${m.count}` : ''}`).join(', ')}`);
  if (dry) { console.log(`(dry: each post chooses up to ${PER} of these from what Business Suite's dialog shows at that moment)`); break; }
  for (const u of unsureGroups()) console.log(`UNSURE before · ${tag(u)} · ${u.at} — check the group by hand; --retry posts it again`);
  const spec = {missing: want, posted: [...postedGroups(), ...unsureGroups()].map(({name, members}) => ({name, members}))};
  const file = resolve(DIR, `post-${String(n + 1).padStart(2, '0')}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
  opens++;   // every opening counts, also one that shows none of the missing groups
  const {r, out} = runFb(['bspost', `--video=${video}`, `--file=${textPath}`, `--groups=${file}`], 25);
  const res = lastJson(out, 'RESULT');
  const chosen = res?.groups?.length ? res.groups : lastJson(out, 'CHOSEN') ?? [];
  for (const l of out.split('\n').filter(Boolean)) if (!/^(window |url |title |→ |crosshair|Read the label|RESULT |CHOSEN )/.test(l)) console.log(`      ${l}`);
  if (r.status === 5 && res?.status === 'absent') {
    console.log(`      → none of the missing groups in the dialog this time (opening ${opens}/${MAX_RUN})`);
    continue;
  }
  n++;
  // fb.py posts only after it printed CHOSEN: a run that died before that cannot have posted anything.
  const died = r.error || r.status === null;
  const status = died ? (chosen.length ? 'unsure' : 'failed')
    : r.status === 0 && res?.status === 'posted' ? 'posted'
    : r.status === 4 || res?.status === 'unsure' ? 'unsure' : 'failed';
  const why = died ? `fb.py did not finish (${r.error?.message ?? r.signal})${chosen.length ? ' — it may have posted' : ' before choosing any group — nothing posted'}`
    : res?.why ?? `fb.py exit ${r.status}`;
  console.log(`[post ${n}] ${chosen.map(tag).join('  |  ') || '(no group chosen)'}`);
  for (const g of chosen) {
    log.push({name: gname(g.name), members: g.members ?? null, status, at: at(), post: n, video: rel(video), ...(original ? {original} : {}),
      ...(status === 'posted' ? {} : {error: why})});
  }
  save();
  if (status === 'posted') { done++; inARow = 0; console.log(`      → posted to ${chosen.length} group(s)`); }
  else { failed++; inARow++; console.log(`      → ${status.toUpperCase()}: ${why}`); }
  if (status === 'unsure') stop = `UNSURE on post ${n}: «Đăng» was clicked without a sign of the post — check ${chosen.map(tag).join(', ') || 'the groups'} by hand`;
  else if (r.status === 3) stop = `fb.py stopped the run: ${why}`;
  else if (inARow >= 2) stop = 'two posts in a row failed — read out/publish/shot.png and the lines above before running again';
  if (stop) break;
  if (hi > 0 && missing().length) {
    const wait = lo + Math.floor(Math.random() * (hi - lo + 1));
    console.log(`      waiting ${mins(wait)} before the next post …`);
    await new Promise((res2) => setTimeout(res2, wait * 1000));
  }
}
if (dry) process.exit(0);
const still = missing();
console.log(`\nrun: posted ${done} post(s), failed ${failed} · groups with the reel ${postedGroups().length}/${joined.length}` +
  (still.length ? ` · still without: ${still.map((m) => `${m.name}${m.count > 1 ? ` ×${m.count}` : ''}`).join(', ')}` : ' · every joined group has it'));
if (stop) console.log(`stopped: ${stop}`);
console.log(`log: ${rel(LOG)}`);
if (stop) process.exit(/UNSURE|stopped the run/.test(stop) ? 3 : /in a row/.test(stop) ? 1 : 0);
