#!/usr/bin/env node
/**
 * Photographs one market-review edition. Every file is dated, under public/shots/review/<date>/,
 * so Channel's calibrated photos in public/shots/ are never touched.
 *
 *   node scripts/review/shots.mjs --format=daily                       all photos of the edition
 *   node scripts/review/shots.mjs --format=daily --only=screener,leaders   a subset: fireant | fireant-weekly | index-terminal | screener | leaders | leaders-terminal | requested | requested-terminal | flow
 *   node scripts/review/shots.mjs --format=weekly --reshoot            also re-take the photos the daily of that session took
 *
 * fireant   VNINDEX daily (weekly edition: also weekly) in the user's REAL Chrome through
 *           scripts/shoot.mjs --site=fireant — hands off the mouse for ~25 s per photo — then
 *           calibrated against the SSI bars (scripts/review/calib_auto.py) so marks sit on candles.
 * fireant-weekly  the weekly chart alone (weekly edition), the same tab at interval W.
 *
 * A non-daily format (the weekly) keeps the photos the daily edition of the same session already took — VNINDEX daily,
 * the terminal's VNINDEX, the screener tables, the leaders' charts: that daily's reel is marked on them — and takes
 * only its own (vnindex-weekly), unless --reshoot.
 * screener  the terminal's Screener with a saved filter applied and sorted (js/screener.js),
 *           headless, behind shoot.mjs's request guard with only /api/stocks/filter allowed.
 * leaders   each leader's FireAnt DAILY chart in the user's real Chrome, on their stock tab (the one
 *           with MA 50 and MA 200; its own symbol is pasted back afterwards), calibrated against that
 *           symbol's /analyze bars, with FireAnt's MA values read off the photo (fireant_ma.py)
 *           (user 2026-10-01: the terminal chart's trendline-break arrows "so confused and annoy").
 * leaders-terminal  the old leader photo: the terminal's /analyze chart, headless (its own read-only
 *           filter POST is blocked; the chart renders without it) — a fallback, not in the default run.
 * index-terminal  VNINDEX on the terminal's /analyze, headless: the index chart the reel falls
 *           back to when the FireAnt capture cannot run (the terminal quotes it in thousands).
 * flow      FireAnt's public "Thống kê sàn" page, HEADLESS (no sign-in, never the user's Chrome): the pie of HOSE
 *           stocks up / down / unchanged and the bars of where the session's money went (js/fireant-flow.js reads
 *           both charts' own numbers into the sidecar) — the flow scene ("Biến động thị trường"), in the formats whose
 *           roles list it (the daily edition since 2026-10-05). Kept only when FireAnt's HSX tile equals the edition's close.
 *
 * Reads content/review-<format>.facts.json (run facts.mjs first). A photo whose guard blocked a
 * request to the terminal's /api/ fails: the page tried to write, and the photo is not used.
 */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {PATHS, ROOT, abs, cli, die, finishedBars, readJson, round, rules, ssiDaily, tryJson, writeJson, writeRows} from './lib/common.mjs';
import {topMatches} from './lib/screener-rows.mjs';
import {FLOW_PHOTO, flowFacts} from './lib/fireant-flow.mjs';
import {weeklyBars} from './lib/week-fireant.mjs';

const {opt, flag} = cli();
const R = rules();
const FORMAT = opt('format', 'daily');
const fmt = R.formats[FORMAT] ?? die(`--format=${FORMAT}: one of ${Object.keys(R.formats).join(', ')}`);
// --facts=<file>: shoot for another pack (a staging copy); --dir=<path under public/>: write the photos there (tests).
const facts = tryJson(opt('facts') ?? fmt.content.replace(/\.json$/, '.facts.json')) ?? die(`no fact pack for ${FORMAT} — run node scripts/review/facts.mjs --format=${FORMAT}`);
const date = facts.asOf;
const ONLY = new Set((opt('only') ?? `fireant,index-terminal,screener,leaders${fmt.roles.includes('flow') ? ',flow' : ''}`).split(',').map((s) => s.trim()));
/** --calib-only: keep the photos on disk, redo only their calibration (after a rules.shots change). */
const CALIB_ONLY = flag('calib-only');
/**
 * A Friday's weekly edition shares its folder with that session's daily, which shot first: a photo the DAILY format
 * also takes (VNINDEX daily, the terminal's VNINDEX, the leaders' charts) is kept as it is — the daily's reel is marked
 * on it — unless --reshoot. Only the weekly's own photo (vnindex-weekly) is taken again.
 */
const KEEP = FORMAT !== 'daily' && !flag('reshoot') && !CALIB_ONLY;
const kept = (rel) => {
  if (!KEEP || !existsSync(abs(`public/${rel}`))) return false;
  console.log(`\n▸ kept public/${rel} (already shot for ${date}, shared with the daily edition — --reshoot to take it again)`);
  made.push(rel);
  return true;
};
const DIR = opt('dir') ?? `${PATHS.shots}/${date}`;
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
  writeRows(barsRel, bars.map((b) => ({t: b.t, h: b.h, l: b.l, ...(b.c != null ? {c: b.c} : {})})));
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

const FA_STOCK = {
  size: '1080x900', interval: 'D', resetView: true, crop: 'full',
  tab: 'VNINDEX', restoreSymbol: 'VNINDEX', restoreTab: null,
  calib: {paneFrac: [0.058, 0.18, 0.896, 0.655]}, volumeFloor: 0.657, periods: [50, 200],
  ...(R.shots.fireantStock ?? {}),
};
const fireantMa = (rel, extra) => {
  const spec = {img: abs(`public/${rel}`), out: abs(`public/${rel.replace(/\.png$/, '')}.ma.json`), periods: FA_STOCK.periods, ...extra};
  const r = spawnSync(PY, ['scripts/review/fireant_ma.py', JSON.stringify(spec)], {cwd: ROOT, encoding: 'utf8'});
  if (r.status !== 0) {
    console.warn(`  fireant_ma FAILED for ${rel}:\n${(r.stderr || r.stdout).trim().split('\n').slice(-6).join('\n')}`);
    return null;
  }
  return JSON.parse(r.stdout.trim().split('\n').pop());
};

// ------------------------------------------------------------------ FireAnt (real Chrome)

// `fireant` = the edition's FireAnt index photos (the weekly edition: the daily AND the weekly chart); `fireant-weekly`
// = the weekly chart alone. The weekly chart is the same VNINDEX tab at interval W, so it is calibrated like a leader
// photo of that tab: the pane above the volume floor, FireAnt's legend rows blanked (they print values in the candle
// colours). FireAnt draws up to the LATEST session, so its weeks come from every finished session pulled — a week
// shot after its own (a test run on a past week) is calibrated on the weeks since, and scaffold masks them.
if (ONLY.has('fireant') || ONLY.has('fireant-weekly')) {
  const jobs = ONLY.has('fireant') ? [['vnindex-daily', R.shots.fireantDaily, index]] : [];
  if (FORMAT === 'weekly') jobs.push(['vnindex-weekly', R.shots.fireantWeekly, weeklyBars(readJson(PATHS.daily))]);
  const keeps = (name) => name === 'vnindex-daily' && KEEP && existsSync(abs(`public/${DIR}/${name}.png`));
  if (!CALIB_ONLY && existsSync(PY) && jobs.some(([name]) => !keeps(name))) wake();
  for (const [name, spec, bars] of jobs) {
    const rel = `${DIR}/${name}.png`;
    if (name === 'vnindex-daily' && kept(rel)) continue;
    if (!CALIB_ONLY) console.log('\nFireAnt opens in your real Chrome: do not touch the mouse or keyboard for ~25 seconds.');
    shoot(`FireAnt ${name}`, ['--site=fireant', '--symbol=VNINDEX', `--size=${spec.size}`, ...(spec.range ? [`--range=${spec.range}`] : []), ...(spec.interval ? [`--interval=${spec.interval}`] : []), ...(spec.resetView ? ['--reset-view'] : []), `--crop=${spec.crop}`, `--out=public/${rel}`]);
    let blank = [];
    if (spec.blankLegend) {
      const legend = fireantMa(rel, {legendOnly: true});
      const inPane = (legend?.legendRows ?? []).filter((r) => r.y1 > spec.calib.paneFrac[1]);
      blank = inPane.map((r) => [round(r.x0 - 0.006, 4), round(r.y0 - 0.005, 4), round(r.x1 + 0.006, 4), round(r.y1 + 0.005, 4)]);
      if (inPane.length) blank.push([0.0596, round(inPane.at(-1).y1, 4), 0.1, round(inPane.at(-1).y1 + 0.04, 4)]);
    }
    const cal = calibrate(rel, bars.slice(-300), {colors: R.shots.fireantColors, ...(spec.calib ?? {}), ...(blank.length ? {blank} : {})});
    if (cal && bars.at(-1).t > (name === 'vnindex-weekly' ? weeklyBars(index).at(-1).t : date)) console.log(`  the chart ends after the edition (${bars.at(-1).t}); scaffold masks what follows ${date}`);
    // The user's VNINDEX tab carries MA 50/MA 200 ("MA Cross", 2026-10-03): read FireAnt's values and the legend rows,
    // which scaffold masks (their number grows with the indicators on the tab).
    if (existsSync(abs(`public/${rel.replace(/\.png$/, '')}.calib.json`))) {
      const read = fireantMa(rel, {calib: abs(`public/${rel.replace(/\.png$/, '')}.calib.json`), symbol: 'VNINDEX', date, expectClose: bars.at(-1)?.c, volumeFloor: spec.volumeFloor ?? FA_STOCK.volumeFloor});
      if (read) console.log(`  FireAnt MA50 ${read.ma?.ma50?.value ?? '—'} · MA200 ${read.ma?.ma200?.value ?? '—'} · legend rows ${read.legendRows?.length ?? 0}`);
    }
    made.push(rel);
  }
}

// ------------------------------------------------------------------ VNINDEX on the terminal (fallback)

if (ONLY.has('index-terminal') && !kept(`${DIR}/vnindex-terminal.png`)) {
  const ta = R.shots.terminalAnalyze;
  const rel = `${DIR}/vnindex-terminal.png`;
  shoot('terminal /analyze VNINDEX (fallback index chart)', ['--site=zionle', '--page=analyze', '--symbol=VNINDEX', `--viewport=${ta.viewport}`, `--clip=${ta.clip}`, `--out=public/${rel}`]);
  guardOk(rel);
  calibrate(rel, index.slice(-300).map((b) => ({t: b.t, h: b.h / 1000, l: b.l / 1000})), {colors: ta.colors, ...(ta.calib ?? {})});
  made.push(rel);
}

// ------------------------------------------------------------------ FireAnt "Thống kê sàn" (headless, public)
//
// User 2026-10-05: the flow scene is "the chart of symbol increase and decrease and flow of the money … of FireAnt",
// in the daily edition ("Daily; old chart → weekly"). The page shows its latest session, so a photo of another session is reported here,
// left on disk as evidence, and refused by facts.mjs (no `flow`, no scene) — it never reaches the reel.

if (ONLY.has('flow')) {
  const spec = R.shots.fireantFlow ?? die('rules.shots.fireantFlow is missing');
  const rel = `${DIR}/${FLOW_PHOTO}.png`;
  shoot(`FireAnt Thống kê sàn · ${spec.exchange} (headless)`, [
    `--url=${spec.url}`, '--profile=none', '--dark', `--viewport=${spec.viewport}`, `--scale=${spec.scale}`, `--wait=${spec.wait}`,
    '--js=scripts/review/js/fireant-flow.js', `--js-args=${JSON.stringify({exchange: spec.exchange, aspect: spec.aspect, pieShare: spec.pieShare})}`,
    '--clip=#fireant-flow-card', `--out=public/${rel}`,
  ]);
  const side = tryJson(`public/${rel.replace(/\.png$/, '')}.json`);
  const fl = flowFacts(side, {date, close: facts.session.close, freshAfter: R.screener.freshAfter, tolerance: spec.matchTolerance, photo: rel});
  if (fl.ok) console.log(`  HOSE ${fl.up} tăng · ${fl.down} giảm · ${fl.flat} đứng giá · tiền ${fl.money.up} / ${fl.money.down} / ${fl.money.flat} tỷ (${fl.moneyWord})`);
  else console.warn(`  NOT this edition's session — ${fl.why}. The flow scene (Biến động thị trường) will be dropped; re-shoot after the ${date} close, before the next session opens.`);
  made.push(rel);
}

// ------------------------------------------------------------------ Screener (headless, guarded)

if (ONLY.has('screener')) {
  const sc = R.shots.screener;
  for (const [scene, spec] of Object.entries(R.screener.scenes)) {
    if (spec.visual && spec.visual !== 'photo') { console.log(`\n▸ Screener · ${spec.photo}: drawn as a ${spec.visual} board, no photo`); continue; }
    const rel = `${DIR}/${scene}.png`;
    if (kept(rel)) continue;
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

// ------------------------------------------------------------------ leaders' charts on FireAnt (real Chrome)
//
// User 2026-10-01: "With each symbol review let's get its chart from FireAnt and draw on it since the chart on the
// terminal also include the trendline break and its so confused and annoy" — and "The FireAnt also have the MA50 and
// MA200 for this symbol refer it not need self-calculation". Each pick is photographed on the user's stock tab
// (rules.shots.fireantStock.tab, the tab where they keep MA 50 and MA 200): the pick is pasted into it, the tab's own
// symbol pasted back afterwards and the tab that was active re-activated (shoot_real.py --tab/--restore-*, every step
// read back by OCR). The photo is calibrated against the pick's /analyze bars with FireAnt's legend rows blanked —
// they sit inside the price pane and print values in the candle colours — and fireant_ma.py reads FireAnt's own MA
// values off it into <sym>-fireant.ma.json (legend + price-scale tag, checked against the line's pixels).

// The names the user asked for on the review page (facts.screener.requested, user 2026-10-05: "… i can choose and fill
// the symbol on the artifact to review beside existed symbol on 3 filter") are photographed the same way: `leaders` shoots
// the leaders and them, `requested` only them.
const REQUESTED = facts.screener.requested ?? [];
async function fireantStocks(list) {
  if (!CALIB_ONLY && existsSync(PY)) wake();
  // The tab is found by its own symbol only: other tabs of the user's may carry a pick's ticker (their 2nd tab read
  // "MSR (1D)" on 2026-10-03), and a fallback candidate could click one of those. A tab left on a pick by a failed
  // restore makes the next run stop at "no chart tab labelled …" — put it back by hand.
  const tabNames = FA_STOCK.tab;
  for (const l of list) {
    const rel = `${DIR}/${l.symbol.toLowerCase()}-fireant.png`;
    if (kept(rel)) continue;
    const a = tryJson(`${PATHS.analyze}/${date}/${l.symbol}.json`);
    // FireAnt always draws up to the LATEST session. An edition shot after its own day (the 1/10 reel shot on 3/10 ends
    // at 2/10) is calibrated on its /analyze bars plus SSI's bars of the sessions since (GET, no auth), and its legend
    // is read with the pointer on the edition's candle (--hover-back), so the MA values are FireAnt's as of that day.
    let bars = a?.price_history ?? [];
    if (bars.length) {
      try {
        const later = finishedBars((await ssiDaily(l.symbol, date)).bars).bars.filter((b) => b.t > date);
        bars = [...bars.filter((b) => b.t <= date), ...later];
      } catch (e) {
        console.warn(`  SSI bars after ${date} for ${l.symbol} unavailable (${e.message}) — calibrating on /analyze only`);
      }
    }
    const back = bars.filter((b) => b.t > date).length;
    if (!CALIB_ONLY) console.log(`\nFireAnt opens in your real Chrome (${l.symbol}): do not touch the mouse or keyboard for ~40 seconds.`);
    shoot(`FireAnt ${l.symbol} on tab ${FA_STOCK.tab}`, [
      '--site=fireant', `--symbol=${l.symbol}`, `--tab=${tabNames}`,
      `--restore-symbol=${FA_STOCK.restoreSymbol}`, ...(FA_STOCK.restoreTab && FA_STOCK.restoreTab !== FA_STOCK.tab ? [`--restore-tab=${FA_STOCK.restoreTab}`] : []),
      `--size=${FA_STOCK.size}`, ...(FA_STOCK.interval ? [`--interval=${FA_STOCK.interval}`] : []), ...(FA_STOCK.resetView ? ['--reset-view'] : []),
      ...(back ? [`--hover-back=${back}`] : []),
      `--crop=${FA_STOCK.crop}`, `--out=public/${rel}`,
    ]);
    if (!existsSync(abs(`public/${rel}`))) { console.warn(`  no photo public/${rel} — shoot it first (drop --calib-only)`); continue; }
    made.push(rel);
    if (!bars.length) { console.warn(`  no /analyze bars for ${l.symbol}: not calibrated, no MA reading`); continue; }
    if (back) console.log(`  the chart ends ${back} session(s) after the edition (${bars.at(-1).t}); the reel's candle is ${date}`);
    // Legend rows below the OHLC header sit inside the pane: blank them (and the collapse button under the last one).
    const legend = fireantMa(rel, {legendOnly: true});
    const inPane = (legend?.legendRows ?? []).filter((r) => r.y1 > FA_STOCK.calib.paneFrac[1]);
    const blank = inPane.map((r) => [round(r.x0 - 0.006, 4), round(r.y0 - 0.005, 4), round(r.x1 + 0.006, 4), round(r.y1 + 0.005, 4)]);
    if (inPane.length) blank.push([0.0596, round(inPane.at(-1).y1, 4), 0.1, round(inPane.at(-1).y1 + 0.04, 4)]);
    const cal = calibrate(rel, bars, {colors: R.shots.fireantColors, ...FA_STOCK.calib, ...(blank.length ? {blank} : {})});
    if (!cal) continue;
    const hover = abs(`public/${rel.replace(/\.png$/, '')}.hover.png`);
    const read = fireantMa(rel, {
      calib: abs(`public/${rel.replace(/\.png$/, '')}.calib.json`), symbol: l.symbol, date, asOfBack: back, expectClose: l.price, volumeFloor: FA_STOCK.volumeFloor,
      ...(back && existsSync(hover) ? {legendImg: hover} : {}),
      terminal: {ema50: l.ema50, sma200: l.sma200},
    });
    if (read?.hoverCheck && !read.hoverCheck.ok) console.warn(`  the hovered candle's close reads ${read.hoverCheck.readClose}, not ${l.price} — the MA values are not ${date}'s; re-shoot`);
    for (const p of FA_STOCK.periods) {
      const m = read?.ma?.[`ma${p}`];
      console.log(`  FireAnt MA${p}: ${m?.value ?? '—'}${m?.lineVsValuePx != null ? ` (line ${m.lineVsValuePx} px from the value)` : ''}${m?.why ? ` — ${m.why}` : ''}`);
    }
  }
}
// --symbols=HDB,…: shoot only these of the leaders/requested names — a name another edition of the same date already
// photographed (the weekly's pick, 2026-10-06) keeps its photo and the marks calibrated on it.
const SYMBOLS = opt('symbols') ? new Set(opt('symbols').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) : null;
const onlySymbols = (list) => (SYMBOLS ? list.filter((l) => SYMBOLS.has(l.symbol)) : list);
const stockList = onlySymbols(ONLY.has('leaders') ? [...facts.screener.leaders.top, ...REQUESTED] : ONLY.has('requested') ? REQUESTED : []);
if (stockList.length) await fireantStocks(stockList);
else if (ONLY.has('requested')) console.log(`\nno requested names in the pack (content/review/requests/${date}.json, then facts.mjs)`);

// ------------------------------------------------------------------ leaders' charts on the terminal (headless fallback)

const terminalList = [...(ONLY.has('leaders-terminal') ? facts.screener.leaders.top : []), ...(ONLY.has('requested-terminal') ? REQUESTED : [])];
if (terminalList.length) {
  const ta = R.shots.terminalAnalyze;
  for (const l of terminalList) {
    const rel = `${DIR}/${l.symbol.toLowerCase()}-terminal.png`;
    if (kept(rel)) continue;
    shoot(`terminal /analyze ${l.symbol}`, ['--site=zionle', '--page=analyze', `--symbol=${l.symbol}`, `--viewport=${ta.viewport}`, `--clip=${ta.clip}`, `--out=public/${rel}`]);
    guardOk(rel);
    const a = tryJson(`${PATHS.analyze}/${date}/${l.symbol}.json`);
    if (a?.price_history?.length) calibrate(rel, a.price_history, {colors: ta.colors, ...(ta.calib ?? {})});
    made.push(rel);
  }
}

// A --dir run (tests) keeps its manifest beside its photos; the edition's own stays as the last real run left it.
writeJson(opt('dir') ? `public/${DIR}/shots.json` : `${PATHS.cache}/${date}-${FORMAT}-shots.json`, {date, format: FORMAT, made});
console.log(`\n${made.length} photo(s) in public/${DIR}/ — next: node scripts/review/scaffold.mjs --format=${FORMAT}`);

