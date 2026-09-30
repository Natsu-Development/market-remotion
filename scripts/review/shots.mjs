#!/usr/bin/env node
/**
 * Photographs one market-review edition. Every file is dated, under public/shots/review/<date>/,
 * so Channel's calibrated photos in public/shots/ are never touched.
 *
 *   node scripts/review/shots.mjs --format=daily                       all photos of the edition
 *   node scripts/review/shots.mjs --format=daily --only=screener,leaders   a subset: fireant | screener | leaders
 *
 * fireant   VNINDEX daily (weekly edition: also weekly) in the user's REAL Chrome through
 *           scripts/shoot.mjs --site=fireant — hands off the mouse for ~25 s per photo — then
 *           calibrated against the SSI bars (scripts/review/calib_auto.py) so marks sit on candles.
 * screener  the terminal's Screener with a saved filter applied and sorted (js/screener.js),
 *           headless, behind shoot.mjs's request guard with only /api/stocks/filter allowed.
 * leaders   the terminal's /analyze chart of each top-3 leader, headless (its own read-only
 *           filter POST is blocked; the chart renders without it), calibrated against that
 *           symbol's /analyze bars.
 * index-terminal  VNINDEX on the terminal's /analyze, headless: the index chart the reel falls
 *           back to when the FireAnt capture cannot run (the terminal quotes it in thousands).
 *
 * Reads content/review-<format>.facts.json (run facts.mjs first). A photo whose guard blocked a
 * request to the terminal's /api/ fails: the page tried to write, and the photo is not used.
 */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {PATHS, ROOT, abs, cli, die, readJson, rules, tryJson, writeJson, writeRows} from './lib/common.mjs';
import {topMatches} from './lib/screener-rows.mjs';

const {opt} = cli();
const R = rules();
const FORMAT = opt('format', 'daily');
const fmt = R.formats[FORMAT] ?? die(`--format=${FORMAT}: one of ${Object.keys(R.formats).join(', ')}`);
const facts = tryJson(fmt.content.replace(/\.json$/, '.facts.json')) ?? die(`no fact pack for ${FORMAT} — run node scripts/review/facts.mjs --format=${FORMAT}`);
const date = facts.asOf;
const ONLY = new Set((opt('only') ?? 'fireant,index-terminal,screener,leaders').split(',').map((s) => s.trim()));
/** --calib-only: keep the photos on disk, redo only their calibration (after a rules.shots change). */
const CALIB_ONLY = cli().flag('calib-only');
const DIR = `${PATHS.shots}/${date}`;
const PY = process.env.TTS_PYTHON ?? resolve(ROOT, '../video-factory/.venv/bin/python');

const shoot = (label, args) => {
  console.log(`\n▸ ${label}`);
  if (CALIB_ONLY) return;
  const r = spawnSync('node', ['scripts/shoot.mjs', ...args], {cwd: ROOT, stdio: 'inherit'});
  if (r.status !== 0) die(`${label}: scripts/shoot.mjs exited ${r.status}`, 1);
};
const guardOk = (rel) => {
  const side = tryJson(`public/${rel.replace(/\.png$/, '')}.json`);
  const blocked = side?.network?.blocked ?? [];
  // The page's own read-only filter query is harmless when blocked (the /analyze chart renders
  // without it, measured 2026-09-29); any OTHER terminal API call it tried means it wanted to write.
  const api = blocked.filter((b) => / \/api\//.test(b) && !b.endsWith(` ${R.screener.endpoint}`));
  if (api.length) die(`${rel}: the page tried ${api.join(', ')} — blocked, and the photo is discarded. Check the page before re-running.`, 1);
  if (blocked.length) console.log(`  guard: blocked ${blocked.join(', ')} (no write reached the terminal — photo kept)`);
  return side;
};
const calibrate = (rel, bars, spec) => {
  if (!existsSync(PY)) {
    console.warn(`  calibration skipped: no python at ${PY} (video-factory venv)`);
    return null;
  }
  const barsRel = `public/${rel.replace(/\.png$/, '')}.bars.json`;
  writeRows(barsRel, bars.map((b) => ({t: b.t, h: b.h, l: b.l})));
  const job = {img: abs(`public/${rel}`), bars: abs(barsRel), out: abs(`public/${rel.replace(/\.png$/, '')}.calib.json`), ...spec};
  const r = spawnSync(PY, ['scripts/review/calib_auto.py', JSON.stringify(job)], {cwd: ROOT, encoding: 'utf8'});
  if (r.status !== 0) {
    console.warn(`  calibration FAILED for ${rel}:\n${(r.stderr || r.stdout).trim().split('\n').slice(-6).join('\n')}`);
    return null;
  }
  const c = JSON.parse(r.stdout.trim().split('\n').pop());
  console.log(`  calibrated ${c.n} candles · median ${c.res_med.toFixed(2)} px · p90 ${c.res_p90.toFixed(2)} px`);
  return c;
};

/**
 * video-factory's wake step (its CLAUDE.md, "Đăng Facebook"): on this Mac "locked" usually means the
 * display went to sleep behind the screen saver — there is no password (sysadminctl: screenLock is
 * off). Space wakes it; moving the mouse and caffeinate -u do not. Space is only sent WHILE locked,
 * when the lock screen takes it, never an app. Still locked afterwards = a real lock: stop, and
 * never type a password for anyone.
 */
const wake = () => {
  const code = [
    'import time, Quartz',
    'def locked():',
    '    d = Quartz.CGSessionCopyCurrentDictionary()',
    "    return bool(d and d.get('CGSSessionScreenIsLocked'))",
    'if locked():',
    '    for down in (True, False):',
    '        Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateKeyboardEvent(None, 49, down)); time.sleep(0.06)',
    '    for i in range(8):',
    '        time.sleep(1)',
    '        if not locked(): break',
    "print('locked' if locked() else 'awake')",
  ].join('\n');
  const r = spawnSync(PY, ['-c', code], {encoding: 'utf8'});
  if ((r.stdout ?? '').trim() !== 'awake') {
    die('The Mac is locked for real (still locked after Space). Unlock it yourself and run again — this script never types a password.', 2);
  }
};

const index = readJson(PATHS.daily).filter((b) => b.t <= date);
const made = [];

// ------------------------------------------------------------------ FireAnt (real Chrome)

if (ONLY.has('fireant')) {
  const jobs = [['vnindex-daily', R.shots.fireantDaily, index]];
  if (FORMAT === 'weekly') jobs.push(['vnindex-weekly', R.shots.fireantWeekly, weeklyBars(index)]);
  if (!CALIB_ONLY && existsSync(PY)) wake();
  for (const [name, spec, bars] of jobs) {
    const rel = `${DIR}/${name}.png`;
    console.log('\nFireAnt opens in your real Chrome: do not touch the mouse or keyboard for ~25 seconds.');
    shoot(`FireAnt ${name}`, ['--site=fireant', '--symbol=VNINDEX', `--size=${spec.size}`, ...(spec.range ? [`--range=${spec.range}`] : []), ...(spec.interval ? [`--interval=${spec.interval}`] : []), ...(spec.resetView ? ['--reset-view'] : []), `--crop=${spec.crop}`, `--out=public/${rel}`]);
    calibrate(rel, bars.slice(-300), {colors: R.shots.fireantColors, ...(spec.calib ?? {})});
    made.push(rel);
  }
}

// ------------------------------------------------------------------ VNINDEX on the terminal (fallback)

if (ONLY.has('index-terminal')) {
  const ta = R.shots.terminalAnalyze;
  const rel = `${DIR}/vnindex-terminal.png`;
  shoot('terminal /analyze VNINDEX (fallback index chart)', ['--site=zionle', '--page=analyze', '--symbol=VNINDEX', `--viewport=${ta.viewport}`, `--clip=${ta.clip}`, `--out=public/${rel}`]);
  guardOk(rel);
  calibrate(rel, index.slice(-300).map((b) => ({t: b.t, h: b.h / 1000, l: b.l / 1000})), {colors: ta.colors, ...(ta.calib ?? {})});
  made.push(rel);
}

// ------------------------------------------------------------------ Screener (headless, guarded)

if (ONLY.has('screener')) {
  const sc = R.shots.screener;
  for (const [scene, spec] of Object.entries(R.screener.scenes)) {
    if (spec.visual === 'movers') { console.log(`\n▸ Screener · ${spec.photo}: drawn as a movers board, no photo`); continue; }
    const rel = `${DIR}/${scene}.png`;
    const keep = sc.keep[scene] ?? die(`rules.shots.screener.keep has no column list for the "${scene}" scene`);
    const args = {filter: spec.photo, sort: sc.sortColumn[spec.sortBy], keep, rows: sc.rows, zoom: sc.zoom};
    shoot(`Screener · ${spec.photo} by ${args.sort}`, [
      '--site=zionle', '--page=screener', `--allow-post=${R.screener.endpoint}`,
      `--viewport=${sc.viewport}`, `--scale=${sc.scale}`, '--wait=5000',
      '--js=scripts/review/js/screener.js', `--js-args=${JSON.stringify(args)}`, `--out=public/${rel}`,
    ]);
    const side = guardOk(rel);
    const want = (facts.screener[scene]?.top ?? []).map((x) => x.symbol);
    // Ties on the sort column (three names at RS 1M 94 on 29/9) may come back in another order, or
    // push a pick below row 3 — allowed as long as nothing untied sits above it (lib/screener-rows.mjs).
    const m = topMatches(side?.js?.rows ?? [], args.sort, want);
    if (!m.ok) die(`${rel}: the photo's rows are not the fact pack's picks (${want.join(', ')}) — ${m.why}. The screener moved since pull.mjs; pull again`, 1);
    console.log(`  rows: ${m.why}`);
    made.push(rel);
  }
}

// ------------------------------------------------------------------ leaders' charts (headless)

if (ONLY.has('leaders')) {
  const ta = R.shots.terminalAnalyze;
  for (const l of facts.screener.leaders.top) {
    const rel = `${DIR}/${l.symbol.toLowerCase()}-terminal.png`;
    shoot(`terminal /analyze ${l.symbol}`, ['--site=zionle', '--page=analyze', `--symbol=${l.symbol}`, `--viewport=${ta.viewport}`, `--clip=${ta.clip}`, `--out=public/${rel}`]);
    guardOk(rel);
    const a = tryJson(`${PATHS.analyze}/${date}/${l.symbol}.json`);
    if (a?.price_history?.length) calibrate(rel, a.price_history, {colors: ta.colors, ...(ta.calib ?? {})});
    made.push(rel);
  }
}

writeJson(`${PATHS.cache}/${date}-${FORMAT}-shots.json`, {date, format: FORMAT, made});
console.log(`\n${made.length} photo(s) in public/${DIR}/ — next: node scripts/review/scaffold.mjs --format=${FORMAT}`);

/** Weekly bars (Monday-start weeks) from daily ones, for the weekly photo's calibration. */
function weeklyBars(daily) {
  const out = [];
  for (const b of daily) {
    const d = new Date(`${b.t}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
    const w = out[out.length - 1];
    if (w && w.t === monday) { w.h = Math.max(w.h, b.h); w.l = Math.min(w.l, b.l); w.c = b.c; w.v += b.v; }
    else out.push({t: monday, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v});
  }
  return out;
}
