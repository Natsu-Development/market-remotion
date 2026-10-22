#!/usr/bin/env node
/**
 * The scene skeleton of one market-review edition, built from its fact pack and its photos.
 *
 *   node scripts/review/scaffold.mjs --format=daily            -> content/review-daily.json + brief/review-daily.md
 *   node scripts/review/scaffold.mjs --format=daily --force    overwrite an edition the writer already filled
 *   node scripts/review/scaffold.mjs --format=daily --out=<f>  write the skeleton elsewhere (no brief, no archive) — to
 *                                                              rebuild one scene's visual of an edition already written
 *
 * Scenes follow rules.formats[format].roles. Every image scene gets its photo, crop and marks
 * placed from data: a vline on each active distribution day and a circle on the FTD candle from
 * the photo's calibration (x = last_x − d·(N−1−i), y = a + b·price), boxes on the screener rows
 * the fact pack picked (row rectangles recorded by js/screener.js), an EMA50 line on each
 * leader's chart. Labels carry only numbers from the fact pack. The director still looks at the
 * draft stills (review-page --out=<draft>) and moves labels that collide.
 *
 * Narration and headlines are TODO for the one writer (writer.md). Scene ids carry the session
 * date (rd-260929-hook) so each edition has its own voice files. A previous edition of the same
 * format is copied to content/review/archive/ before it is replaced.
 */
import {copyFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {roleSpec, targetWords} from '../lib/roles.mjs';
import {PATHS, RULES_PATH, abs, cli, die, dm, exists, pngSize, readJson, round, rules, signed, tryJson, vi, writeJson, yymmdd} from './lib/common.mjs';
import {plateRoom} from './lib/plate-room.mjs';
import {fireantLeaderVisual} from './lib/leader-fireant.mjs';
import {BOARD_VIEW_ROWS, boardOf, stateOf} from './lib/board.mjs';
import {readRequests, requestKey, requestsPath} from './lib/requested.mjs';
import {FLOW_PHOTO} from './lib/fireant-flow.mjs';
import {weekVisual, weeklyBars} from './lib/week-fireant.mjs';
import {sectorBoard} from './lib/sectors.mjs';

const {opt, flag} = cli();
const R = rules();
const FORMAT = opt('format', 'daily');
const fmt = R.formats[FORMAT] ?? die(`--format=${FORMAT}: one of ${Object.keys(R.formats).join(', ')}`);
// --facts=<file>: build from another pack (a staging copy) — the content and brief are written only with --out then.
const FACTS = opt('facts') ?? fmt.content.replace(/\.json$/, '.facts.json');
const F = tryJson(FACTS) ?? die(`no ${FACTS} — run node scripts/review/facts.mjs --format=${FORMAT}`);
const date = F.asOf;
// --dir=<path under public/>: read the photos from elsewhere (a staging folder; only with --out).
const DIR = opt('dir') ?? `${PATHS.shots}/${date}`;
// The user's own sentence for this edition and the names it calls (user 2026-10-21: "Also include the sentence and enrich
// its meaning on this video: …"): `say` / `spotlight` of content/review/requests/<date>.json (lib/requested.mjs).
const REQ = readRequests(date, R, requestsPath(requestKey(FORMAT, date)));
const sayOf = (scene) => REQ?.say?.find((x) => x.scene === scene) ?? null;
const spotOf = (scene) => REQ?.spotlight?.find((x) => x.scene === scene)?.symbols ?? [];

// ------------------------------------------------------------------ the previous edition

const OUT = opt('out');
if (opt('facts') && !OUT) die('--facts=<file> builds from another pack: write it elsewhere with --out=<file> (the live content stays the live pack\'s)');
const prior = OUT ? null : tryJson(fmt.content);
if (prior) {
  if (prior.edition === date && prior.status !== 'scaffolded' && !flag('force')) {
    die(`${fmt.content} is the ${date} edition and already "${prior.status}" — the writer's work would be lost. --force to rebuild it.`);
  }
  if (prior.edition === date && prior.status !== 'scaffolded' && flag('force')) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const to = `${PATHS.archive}/${date}-${FORMAT}-${stamp}.json`;
    mkdirSync(dirname(abs(to)), {recursive: true});
    copyFileSync(abs(fmt.content), abs(to));
    console.log(`archived the written ${date} edition -> ${to}`);
  }
  if (prior.edition && prior.edition !== date) {
    const to = `${PATHS.archive}/${prior.edition}-${FORMAT}.json`;
    mkdirSync(dirname(abs(to)), {recursive: true});
    copyFileSync(abs(fmt.content), abs(to));
    // facts.mjs has already rebuilt FACTS for the new session by now and archived the old pack itself; a copy here
    // filed the NEW pack under the old date (every archived pack up to 5/10 was one edition late).
    if (tryJson(FACTS)?.asOf === prior.edition) copyFileSync(abs(FACTS), abs(to.replace(/\.json$/, '.facts.json')));
    console.log(`archived the ${prior.edition} edition -> ${to}`);
  }
}

// ------------------------------------------------------------------ photos

const clamp = (n) => Math.min(1, Math.max(0, round(n, 4)));
const photo = (name) => {
  const rel = `${DIR}/${name}.png`;
  if (!exists(`public/${rel}`)) return null;
  const [W, H] = pngSize(`public/${rel}`);
  return {name, rel, W, H, side: tryJson(`public/${DIR}/${name}.json`), calib: tryJson(`public/${DIR}/${name}.calib.json`)};
};
const need = (p, what) => p ?? die(`missing photo public/${DIR}/${what}.png — run node scripts/review/shots.mjs --format=${FORMAT}`);

// The index chart: FireAnt in the user's Chrome, or the terminal's VNINDEX chart when the FireAnt
// capture could not run (the review page says which one the reel uses).
const daily = readJson(PATHS.daily).filter((b) => b.t <= date);
let index = photo('vnindex-daily');
let indexSource = 'fireant.vn';
let indexUnit = 1;
let indexCrop = R.shots.fireantDaily.crop === 'full' ? R.shots.fireantDaily.cropRect ?? null : null;
let indexMasks = R.shots.fireantDaily.masks ?? [];
if (!index) {
  index = photo('vnindex-terminal');
  indexSource = 'zionle.io.vn';
  indexUnit = 1 / 1000;              // the terminal quotes the index in thousands
  indexCrop = R.shots.terminalAnalyze.crop;
  indexMasks = [];
}
need(index, 'vnindex-daily (FireAnt) or vnindex-terminal');
// FireAnt's legend stack grows with the indicators on the user's VNINDEX tab (MA 50/MA 200 as "MA Cross" since
// 2026-10-03): when shots.mjs measured it on THIS photo (vnindex-daily.ma.json), mask those rows and the collapse button
// under them, plus the fixed MACD legend / logo / gear; otherwise the recipe's measured stack.
const indexRead = indexSource === 'fireant.vn' ? tryJson(`public/${DIR}/vnindex-daily.ma.json`) : null;
if (indexRead?.legendRows?.length && R.shots.fireantDaily.fixedMasks) {
  const rows = indexRead.legendRows;
  indexMasks = [
    ...rows.map((r) => ({x: clamp(Math.max(0.0574, r.x0 - 0.004)), y: clamp(r.y0 - 0.004), w: clamp(r.x1 - Math.max(0.0574, r.x0 - 0.004) + 0.008), h: clamp(r.y1 - r.y0 + 0.008)})),
    {x: 0.0594, y: clamp(rows.at(-1).y1 + 0.004), w: 0.04, h: 0.038},
    ...R.shots.fireantDaily.fixedMasks,
  ];
}
if (!index.calib) die(`public/${index.rel} has no calibration — run node scripts/review/shots.mjs --format=${FORMAT} --calib-only`);
// The weekly's index photo ends at the bottom of FireAnt's price + volume pane (rules.formats.<format>.indexPhoto.bottom,
// 2026-10-09 director's review: FireAnt's MACD pane showed in every wide shot of hook / market / watch): the calibrated
// pane's bottom edge (+2 px), LAYOUT.imagePanel's 1.42 kept from the right edge so the chart still fills the panel.
if (indexSource === 'fireant.vn' && indexCrop && fmt.indexPhoto?.bottom === 'volumePane') {
  const PH = index.calib.size?.[1] ?? index.H;
  const floor = index.calib.pane ? (index.calib.pane[3] + 2) / PH : (R.shots.fireantDaily.volumeFloor ?? 0.657) + 0.005;
  const h = Math.min(indexCrop.h, floor - indexCrop.y);
  const w = Math.min(indexCrop.w, (h * index.H * 1.42) / index.W);
  indexCrop = {x: round(indexCrop.x + indexCrop.w - w, 4), y: indexCrop.y, w: round(w, 4), h: round(h, 4)};
}
// Label plates on the index chart go where the photo has room (lib/plate-room.mjs): off the candles (from the
// calibration and the bars it was fitted on), off FireAnt's volume overlay, off every other mark, inside the frame
// of their beat's shot — a fixed offset from today's candle put "Đóng cửa …" on the September rally (1/10).
const room = plateRoom({
  photo: index,
  bars: daily.filter((b) => b.t <= (index.calib.last_bar ?? date)),
  unit: indexUnit,
  crop: indexCrop,
  volumeBand: indexSource === 'fireant.vn' ? R.shots.fireantDaily.volumeBand ?? 0 : 0,
});

/** A point given as fractions of the visible (cropped) area, in whole-photo fractions. */
const C = indexCrop ?? {x: 0, y: 0, w: 1, h: 1};
const inC = (fx, fy) => [C.x + fx * C.w, C.y + fy * C.h];

const barX = (p, bars, t) => {
  const vis = bars.slice(-p.calib.n);
  const i = vis.findIndex((b) => b.t === t);
  return i < 0 ? null : (p.calib.last_x - p.calib.d * (p.calib.n - 1 - i)) / p.W;
};
const priceY = (p, price, unit = 1) => (p.calib.a + p.calib.b * price * unit) / p.H;

/** The screener photo's crop and row boxes, from the rectangles js/screener.js recorded. */
const table = (p) => {
  const js = p.side?.js ?? die(`public/${p.rel} has no row rectangles in its sidecar — re-shoot it with shots.mjs`);
  const {w: PW, h: PH} = js.page;
  const left = js.table.x - 12;
  const width = js.table.w + 24;
  const top = Math.max(0, js.chip.y - 18);
  const height = width / 1.42;                          // LAYOUT.imagePanel's ratio, in page pixels
  const f = (r) => ({x: clamp(r.x / PW), y: clamp(r.y / PH), w: clamp(r.w / PW), h: clamp(r.h / PH)});
  return {
    crop: {x: clamp(left / PW), y: clamp(top / PH), w: clamp(width / PW), h: clamp(Math.min(height, PH - top) / PH)},
    rows: js.rows.map((r) => ({symbol: r.symbol, ...f(r.rect), cells: Object.fromEntries((r.cells ?? []).map((c) => [c.col, f(c.rect)]))})),
    chip: f(js.chip),
    count: js.countLine ? f(js.countLine) : null,
    ui: (js.ui ?? []).map(f),
    results: js.results,
    header: f(js.header),
    table: f(js.table),
    px: (n) => n / PW,
    py: (n) => n / PH,
    PW, PH,
  };
};

/**
 * Ticker-first framing of a screener photo (user 2026-10-01: "list the symbol, not the company name").
 * The terminal's SYMBOL cell is a small badge followed by the company name, so the crop starts to the
 * right of that block and ends past the last column; the name tail of every row inside the crop is
 * masked in the table's own colours (rules.shots.screener.rowColor / headerColor, measured on the 30/9
 * photos) and a plate with the row's ticker — read back from the sidecar, i.e. the photo's own rows —
 * stands at the left of each row at the table's type size. The crop keeps the panel's 1.42 ratio and is
 * as tall as it must be to show the results line, the header, three rows and every picked row (a tie can
 * push a pick to row 4-5), so on a tall table its left edge moves further left. The close-up for beat 2
 * starts at the crop's left edge, so the tickers and the sorted column share the frame.
 */
const tickerView = (t, picked, focus) => {
  const C = R.shots.screener;
  const first = t.rows[0];
  const numLeft = Math.min(...Object.entries(first.cells).filter(([k]) => k && k !== 'SYMBOL').map(([, c]) => c.x));
  const right = t.table.x + t.table.w + t.px(12);
  const top = Math.max(0, (t.count ? t.count.y : t.header.y) - t.py(12));
  const third = t.rows[Math.min(2, t.rows.length - 1)];
  const need = Math.max(third.y + third.h, ...picked.map((r) => r.y + r.h)) + t.py(10);
  const h = need - top;
  const w = (h * t.PH * 1.42) / t.PW;
  const left = Math.max(0, right - w);
  const bottom = top + h;
  const crop = {x: clamp(left), y: clamp(top), w: clamp(w), h: clamp(h)};
  // Up to the first numeric column's own edge: a long name ends 4 px short of it (AAS, 30/9) and a 6 px gap
  // left the last letter's stem showing.
  const maskW = numLeft - t.px(1) - left;
  const masks = [{x: clamp(left), y: clamp(t.header.y + t.py(1)), w: clamp(maskW), h: clamp(t.header.h - t.py(2)), color: C.headerColor}];
  if (t.count && t.count.x + t.count.w > left) masks.push({x: clamp(left), y: clamp(t.count.y - t.py(4)), w: clamp(maskW), h: clamp(t.count.h + t.py(8)), color: C.rowColor});
  if (t.ui.length) {
    // The table's own Columns / Export buttons: hidden under the card colour; the summary plate sits there.
    const x0 = Math.min(...t.ui.map((u) => u.x)) - t.px(6), x1 = Math.max(...t.ui.map((u) => u.x + u.w)) + t.px(6);
    const y0 = Math.min(...t.ui.map((u) => u.y)) - t.py(4), y1 = Math.max(...t.ui.map((u) => u.y + u.h)) + t.py(4);
    masks.push({x: clamp(x0), y: clamp(y0), w: clamp(x1 - x0), h: clamp(y1 - y0), color: C.rowColor});
  }
  const labels = [];
  for (const r of t.rows) {
    if (r.y >= bottom) continue;
    masks.push({x: clamp(left), y: clamp(r.y + t.py(1)), w: clamp(maskW), h: clamp(r.h - t.py(2)), color: C.rowColor});
    if (r.symbol && r.y + r.h <= bottom + t.py(2)) labels.push({kind: 'label', x: clamp(left + t.px(14)), y: clamp(r.y + r.h / 2 + 0.004), text: r.symbol, accent: 'white', beat: 0, size: C.tickerLabelSize ?? 1.6});
  }
  const closeUp = (midY) => {
    const z = 1.5;
    const halfW = w / (2 * z), halfH = h / (2 * z);
    return {beat: 1, x: clamp(left + halfW), y: clamp(Math.min(Math.max(midY, top + halfH), bottom - halfH)), zoom: z, move: 'pull_out'};
  };
  return {crop, masks, labels, numLeft, focus, closeUp};
};

// ------------------------------------------------------------------ scenes

const tag = yymmdd(date);
// A format's own word budget for a role (rules.formats.<format>.<role>.words — the weekly's market scene opens on the daily
// frame since 2026-10-09 and gets ~70 words; verify reads maxWords / warnWords / maxSentences of the same block), else the
// role's pace (lib/roles.mjs targetWords).
const wordsOf = (role) => fmt[role]?.words ?? targetWords(R, role);
const est = (role) => round(wordsOf(role) / R.narration.wordsPerSecond + R.audio.leadIn + R.audio.tail, 1);
// Placeholder timing until the voice lands (voiceover.mjs writes the real `at`): beats 3,5 s apart — closer when the scene's
// estimate `dur` would leave the last beat under 3 s, so the review page's still of that beat shows its marks drawn (a review
// scene's third beat, "Hành động", 2026-10-07: at 7,25 s of 8,4 s its role plates were not drawn yet on the still).
const todoBeats = (n, dur = null) => {
  const step = dur && n > 1 ? Math.min(3.5, (dur - 3 - R.audio.leadIn) / (n - 1)) : 3.5;
  return Array.from({length: n}, (_, k) => ({atSentence: k === 0 ? 0 : k + 1, at: round(R.audio.leadIn + k * step, 2), line1: 'TODO', line2: 'TODO', accent: 'gold'}));
};
const status = F.state.status;
// The terminal down (facts.mjs --no-screener, 2026-10-09: its API answered 502 from 15:03 into the evening): no saved
// filter, so no board, no stock review, no pick — the reel goes hook → flow → market → watch → outro, each dropped role
// prints why and the review page names the gap. A real pull + facts.mjs + scaffold --force brings them back.
const SCREENER_DOWN = F.screener?.unavailable ?? null;
const screenerRoles = new Set([...Object.keys(R.screener.scenes), ...Object.keys(fmt.screener?.scenes ?? {}), 'leader', 'pick']);
const warnAct = status === 'CORRECTION' || status === 'UNDER_PRESSURE' || status === 'RALLY_ATTEMPT' ? 'maroon' : null;
const scenes = [];
const briefs = [];
let leaderN = 0;
let pickN = 0;
// `words`: a scene's own budget when it is not its role's (an EMPTY Momentum board, 2026-10-09).
const push = (role, {eyebrow = 'TODO', visual, beats, brief, act, words}) => {
  const n = role === 'leader' ? ++leaderN : role === 'pick' ? ++pickN : 0;
  const id = `${fmt.idPrefix}-${tag}-${role}${n ? `-${n}` : ''}`;
  scenes.push({
    id, role, eyebrow, act: act ?? roleSpec(R, role).act, duration: words ? round(words / R.narration.wordsPerSecond + R.audio.leadIn + R.audio.tail, 1) : est(role),
    narration: 'TODO', beats, visual,
    ...(role === 'outro' ? {headline: {line1Baseline: 1338, line2Baseline: 1418, maxFontSize: 60, footnoteY: 1484}} : {}),
    _brief: brief.join(' '), _words: words ?? wordsOf(role),
  });
  briefs.push({head: `${role} · ${visual.type}`, lines: brief});
};

const imageOf = (p, source, extra) => ({type: 'image', src: p.rel, source, fit: 'contain', ...extra});
const dd = F.distribution.active;
/**
 * The market scene's count, in the user's mould (2026-10-01: "Hôm qua thì tính, hiện tại đang có <n> phiên phân
 * phối" replaced "đếm lại còn <n> phiên"). Three cases: today is a DD; today is not but the previous session is (the
 * 1/10 case — SSI's revised volume turned 30/9 into the fourth DD); neither. The writer spells the number out.
 */
const prevSession = daily.at(-1)?.t === date ? daily.at(-2)?.t : daily.at(-1)?.t;
// "Hôm qua thì tính" is news only when the previous edition did not already call that session a DD (1/10: SSI's revised
// volume turned 30/9 into one after its reel). Its archived pack says what that reel told (9/10: 8/10 was its own DD).
const prevPack = tryJson(`${PATHS.archive}/${prevSession}-${FORMAT}.facts.json`);
const prevIsDd = dd.some((d) => d.date === prevSession) && !(prevPack?.asOf === prevSession && prevPack.session?.isDistribution);
const countSentence = (() => {
  const n = F.distribution.count;
  const have = n > 0 ? `hiện tại đang có ${n} phiên phân phối` : 'hiện tại chưa có phiên phân phối nào';
  if (F.session.isDistribution) return `Hôm nay là phiên phân phối, ${have}.`;
  if (prevIsDd) return `Hôm nay không phải phiên phân phối. Hôm qua thì tính, ${have}.`;
  return `Hôm nay không phải phiên phân phối, ${have}.`;
})();
const ddXs = dd.map((d) => ({...d, x: barX(index, daily, d.date)})).filter((d) => d.x != null && d.x > 0 && d.x < 1);
const lastX = barX(index, daily, date);
const lastY = priceY(index, F.session.close, indexUnit);
/**
 * Distribution days and the FTD are ARROWS whose tip touches the candle (user, 2026-09-29): red
 * pointing DOWN onto each distribution day's high, blue pointing UP at the FTD's low. The tip sits
 * GAP above the wick (below for the FTD) so it never covers it; the shaft is ARROW long. Positions
 * come from the photo's calibration: x of the session, y of its high/low.
 */
const ARROW = 0.025;                   // short: mostly head, a stub of stem (user, 2026-09-29, twice)
const GAP = 0.0045;                    // ~4 px: the tip points right onto the wick without covering it
const barOf = (t) => daily.find((b) => b.t === t);
/**
 * Solid block arrows (style: 'block'; user 2026-09-29: the line arrows were "so hard to see", then
 * "shorter, point direction on the candle"). Straight down onto a distribution day's high, straight up
 * at the FTD's low — never at an angle. Adjacent distribution days stay apart by their highs: each tip
 * sits on its own candle, so the heads land at different heights.
 */
const ddArrow = (d, beat) => {
  const tip = priceY(index, barOf(d.date).h, indexUnit) - GAP;
  return {kind: 'arrow', style: 'block', from: [clamp(d.x), clamp(tip - ARROW)], to: [clamp(d.x), clamp(tip)], accent: 'down', beat};
};
const ftdArrow = (f, x, beat) => {
  const tip = priceY(index, barOf(f.date).l, indexUnit) + GAP;
  return {kind: 'arrow', style: 'block', from: [clamp(x), clamp(tip + ARROW)], to: [clamp(x), clamp(tip)], accent: 'up', beat};
};
const ftdBase = (f) => priceY(index, barOf(f.date).l, indexUnit) + GAP + ARROW;
const idxMarks = (beat) => ddXs.map((d) => ddArrow(d, beat));
const ddTop = () => Math.min(...ddXs.map((d) => priceY(index, barOf(d.date).h, indexUnit))) - GAP - ARROW;
const fmtPct = (n, dp = 2) => `${signed(n, dp)}%`;
const lab = (x, y, text, accent, beat, anchor) => ({kind: 'label', x: clamp(x), y: clamp(y), text, accent, beat, ...(anchor ? {anchor} : {})});
const cropOf = (c) => (c ? {crop: c} : {});
const maskOf = (m) => (m?.length ? {masks: m, maskColor: R.shots.maskColor} : {});

// ------------------------------------------------------------------ scenes
//
// Story (vox-director hook_payoff + a listicle countdown; user 2026-09-29, "optimize all the scenes"):
//   hook     the session's close and its advancers/decliners (the weekly: the week's close and change), the
//            question and the invitation — no system words yet (user 2026-09-30)
//   week     weekly only: the week's candle on FireAnt's weekly chart
//   market   context: the count, the rally low, the clock (when the oldest DD drops out); it hands over to
//            whatever follows it in the format's roles
//   flow     daily, scene 02 right after the hook (user 2026-10-05: "Daily; old chart → weekly", then "move it into
//            the scene 02"): FireAnt's "Biến động thị trường" — the session's advancers/decliners and money-flow charts,
//            a headless photo of "Thống kê sàn"; it carries the counts the daily hook no longer reads
//   breadth  weekly only: the old "Độ rộng thị trường" — the share of stocks above SMA200 drawn under the index line
//   spike    the volume board — gainers by the biggest gain, losers by the deepest fall; it talks about itself only
//   rs       the RS Strong table on its own — one saved filter per scene (user 2026-09-30: "separate
//            the filter: Uptrend and RS Strong, not union it first"); beat 2 lights the names reviewed next
//   uptrend  the Uptrend board on its own, the same behaviour as rs (user 2026-10-05: "behavior like the RS strong");
//            it closes on the invitation naming the names reviewed next ("Let's review …", user 2026-10-01)
//   leader   the symbol reviews — the names of rules.screener.leaders.from (the daily keeps only the names in all
//            three filters since 2026-10-06, formats.daily.leaders: 0–2 scenes), the weaker RS 1M first and the
//            highest RS 1M last; one distinct detail each
// No scene says a name of one filter is also in another (user 2026-10-05: "Not need mentioned the stock on specific
// filter existed on other filter") — that was the open loop 2 (spike → leader) until then.
//   watch    the payoff, static camera: the levels and the count that change the state tomorrow (the weekly: next week)
//   outro    the button
// The order is rules.formats.<format>.roles; camera moves alternate between neighbouring shots.

const ftd = F.state.ftd ?? F.state.lastFtd;
const ftdX = ftd ? barX(index, daily, ftd.date) : null;
const ftdVisible = !!ftd && ftdX != null && ftdX > C.x && ftdX < C.x + C.w;
const ftdY = ftdVisible ? priceY(index, ftd.close, indexUnit) : null;
const holdLow = F.state.rallyLow ?? F.state.correctionLow;
const holdY = holdLow != null ? priceY(index, holdLow, indexUnit) : null;
const holdVisible = holdY != null && holdY > C.y + 0.02 && holdY < C.y + C.h - 0.02;
// In a rally attempt the low to hold is the attempt's own — the user's "đáy phiên nỗ lực phục hồi" (2026-10-08, their
// word order); after an FTD the same low is the rally low the uptrend holds.
const inRally = F.state.status === 'RALLY_ATTEMPT';
const holdName = inRally ? 'Đáy nỗ lực phục hồi' : F.state.rallyLow != null ? 'Đáy nhịp hồi' : 'Đáy điều chỉnh';
const recentTop = Math.min(...daily.slice(-15).map((b) => priceY(index, b.h, indexUnit)));
const ddLeft = ddXs.length ? Math.min(...ddXs.map((d) => d.x)) : null;
const ddCentre = ddLeft != null ? (ddLeft + (lastX ?? 0.9)) / 2 : inC(0.75, 0)[0];
const biggest = [...ddXs].sort((a, b) => a.changePercent - b.changePercent)[0];
// A correction (six DDs, or an undercut FTD) is left only by a rally attempt and its FTD: the DD clock and the countdown
// no longer move the state there (2026-10-08, the first correction on this scaffold), so the market and watch scenes say
// the attempt's rule instead. A rally attempt (2026-10-09, the first on this scaffold: a new correction low that closed in
// the upper half of its range) is still out of the uptrend: no clock, no countdown, and the FTD it would follow stays failed.
const inCorrection = F.state.status === 'CORRECTION';
// A rally attempt undercut TODAY (12/10, the first on this scaffold: 9/10's day 1 lost its low 1724,17): the market scene's
// news is the failed attempt, not the six DDs or the FTD lost on 8/10.
const AF = inCorrection ? F.state.attemptFailed ?? null : null;
// The session that SET the attempt's low — the day 1 itself on 12/10 and 14/10, but 19/10's attempt had day 1 16/10 on top
// of 15/10's low 1694,77: "Giá thủng đáy hôm <weekday>" names the low's session (rules attemptFailed._say).
const afLowBar = AF ? [...daily].reverse().find((b) => b.t <= AF.day1.date && Math.abs(b.l - AF.rallyLow) < 0.005) ?? null : null;
const afLowDate = afLowBar?.t ?? AF?.day1.date;
const afLowOnDay1 = afLowDate === AF?.day1.date;
// The user's words for that session (rules.status.CORRECTION.attemptFailed, 2026-10-12: "… đang tiến về đáy nỗ lực phục
// hồi ngày 28/7. Nguy cơ thủng đáy này rất cao."): the market heads for the low of the attempt behind the last FTD (3/8's:
// day 1 28/7, low 1651,20), drawn on beat 3 and named by its headline.
const AFS = AF ? R.status.CORRECTION.attemptFailed ?? null : null;
const behind = AFS && F.state.lastFtd?.day1 && F.state.lastFtd.rallyLow != null
  ? {dm: F.state.lastFtd.day1.dm, date: F.state.lastFtd.day1.date, low: F.state.lastFtd.rallyLow}
  : null;
const priorY = behind ? priceY(index, behind.low, indexUnit) : null;
const priorX = behind ? barX(index, daily, behind.date) : null;
const priorVisible = priorY != null && priorY > C.y + 0.02 && priorY < C.y + C.h - 0.02;
const afLine = (t) => t.replaceAll('{dm}', behind?.dm ?? '').replaceAll('{low}', behind ? vi(behind.low) : '');
const outOfUptrend = inCorrection || inRally;
const ftdRule = `FTD từ ngày ${F.rules.ftdMinDay}, +${vi(F.rules.ftdMinChangePercent)}%`;
// The user's correction line (rules.status.CORRECTION.say, 2026-10-08) is about the first rally attempt's low; once that
// attempt has started its low is on the chart and the line names it (a state's own `say` wins — the daily's 9/10 patch).
const attemptSay = R.status.RALLY_ATTEMPT?.say ?? R.status.CORRECTION.say ?? '';
// Under the rally low an attempt fails (a rally attempt — no FTD yet, so never "FTD thất bại", daily 9/10), the FTD does
// (an uptrend); a correction only makes a new low.
const rallyOutcome = inRally ? 'nỗ lực thất bại' : F.state.ftd ? 'FTD thất bại' : 'đáy mới';
// A scenario zone that merged the rally low with a level just above it (within 0.5%) meets the path at that level, but
// the state changes only under the rally low itself: its line and plate sit on the rally low (9/10: 1724,17 under 1731,03).
const rallyAt = (z) => z?.members?.find((m) => m.kind === 'rally')?.price ?? z?.at;
// The FTD failed (the correction ended its uptrend): its plate says so (user 2026-10-08: "Emphasize the failure FTD"). On the
// session it is lost, the daily hook opens with the user's line on the FTD candle (rules.followThrough.lost: "Start with
// hook: Thị trường đã mất phiên FTD 3/8 & đang trong trạng thái nguy hiểm - append with existed content") and the market
// scene adds that the market is very dangerous ("mention the market is so dangerous right now on scene 1 and 3").
const ftdFailed = outOfUptrend && !!ftd?.ended;
const FL = R.followThrough.lost ?? null;
const ftdLostToday = FORMAT === 'daily' && !!FL && ftdFailed && ftd.ended.date === F.session.date;
const lostLine = (t) => t.replaceAll('{dm}', ftd?.dm ?? '');
// The weekly applies the same opener when the FTD was lost INSIDE the edition's week (2026-10-09, the director's and the
// trader-viewer's reviews merged: "the user's 8/10 exception for the daily … apply it to the weekly when the loss date falls
// inside the edition's week") — the 8/10 loss (sixth distribution day) for the week of 5/10.
const ftdLostInWeek = FORMAT === 'weekly' && !!FL && ftdFailed && !!F.weekly && ftd.ended.date >= F.weekly.from && ftd.ended.date <= (F.weekly.to ?? date);
const WEEKDAY_VI = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const weekdayOf = (t) => WEEKDAY_VI[new Date(`${t}T00:00:00Z`).getUTCDay()];
/** "Thứ Năm" → "thứ Năm" inside a sentence. */
const wdIn = (w) => String(w ?? '').replace(/^T/, 't');
/** "5/10" → "5 tháng 10", for a date the writer spells out. */
const dmSpoken = (dm) => String(dm ?? '').replace('/', ' tháng ');
/** A rally attempt's earliest FTD session: day ftdMinDay, counted on weekdays after the last session (no holiday calendar —
 *  a holiday pushes it a session later, hence "sớm nhất"). `now`: the attempt is already past it. */
const ftdEarliest = (() => {
  if (!inRally) return null;
  let left = Math.max(0, F.rules.ftdMinDay - (F.state.rallyDay ?? 1));
  let t = new Date(`${date}T00:00:00Z`);
  while (left > 0) { t = new Date(t.getTime() + 864e5); if (t.getUTCDay() % 6) left--; }
  const iso = t.toISOString().slice(0, 10);
  const monday = (s) => { const d = new Date(`${s}T00:00:00Z`); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); };
  return {date: iso, dm: `${t.getUTCDate()}/${t.getUTCMonth() + 1}`, weekday: WEEKDAY_VI[t.getUTCDay()], now: iso === date, nextWeek: monday(iso) > monday(date)};
})();
/** "thứ Tư tuần tới" — the rally attempt's earliest FTD in words (none past it). */
const ftdEarliestSay = ftdEarliest && !ftdEarliest.now ? `${wdIn(ftdEarliest.weekday)}${ftdEarliest.nextWeek ? ' tuần tới' : ''}` : null;
/** The watch plate of a correction / rally attempt: what the way out needs — the rule, as the daily prints it (its 9/10
 *  patch: "Chờ FTD từ ngày 4, +1,25%"; one channel, one plate). The weekly says the earliest DATE in the market's beat-4
 *  headline and the plan's s2 instead. */
const ftdWaitPlate = `Chờ ${ftdRule}`;
const nextExp = inCorrection || inRally ? null : F.distribution.nextExpiry;
const nextExpDd = nextExp ? ddXs.find((d) => d.date === nextExp.date) : null;
// The user's danger level (rules.distribution.dangerAt, 2026-10-01: five DDs "is dangerous and must warning and
// re-check the symbol and risk"): a warning tier while the uptrend stands, not a state of the machine. Below it,
// it is a threshold on the ladder; at it, the market scene warns, the watch scene keeps it, the leaders get a caution.
const DG = R.distribution.danger ?? {short: 'Nguy hiểm', vi: 'Mức nguy hiểm', action: 'rà lại từng mã và rủi ro'};
const dangerNow = !!F.distribution.danger;
const inUptrend = F.state.status === 'CONFIRMED_UPTREND' || F.state.status === 'UNDER_PRESSURE';
const ladder = [
  ...(F.distribution.toUnderPressure > 0 ? [{n: F.distribution.toUnderPressure, at: R.distribution.underPressureAt, name: R.status.UNDER_PRESSURE.short}] : []),
  ...(inUptrend && F.distribution.toDanger > 0 ? [{n: F.distribution.toDanger, at: F.distribution.dangerAt, name: DG.short, danger: true}] : []),
  ...(F.distribution.toCorrection > 0 ? [{n: F.distribution.toCorrection, at: R.distribution.correctionAt, name: R.status.CORRECTION.short}] : []),
];
const nextState = ladder[0] ?? {n: F.distribution.toCorrection, name: R.status.CORRECTION.short};
// The market scene's beat-3 plate: the thresholds still ahead ("5 phiên → nguy hiểm · 6 phiên → điều chỉnh" at four DDs),
// or the warning itself once the danger level is reached.
const ladderText = inCorrection
  ? `Phiên tăng → ngày 1 · ${ftdRule}`
  : dangerNow
  ? `${DG.short}: ${DG.action.split(' và ')[0]} · ${R.distribution.correctionAt} phiên → ${R.status.CORRECTION.short.toLowerCase()}`
  : ladder.length
    ? ladder.map((s, i) => `${s.at}${i === 0 || ladder.length < 3 ? ' phiên' : ''} → ${s.name.toLowerCase()}`).join(' · ')
    : `${R.distribution.underPressureAt} phiên → ${R.status.UNDER_PRESSURE.short.toLowerCase()} · ${R.distribution.correctionAt} phiên → ${R.status.CORRECTION.short.toLowerCase()}`;
const todayRing = (beat) => ({kind: 'circle', x: clamp(lastX), y: clamp(lastY), r: 0.022, accent: 'gold', beat});
const indexPhoto = (extra) => imageOf(index, indexSource, {...cropOf(indexCrop), ...maskOf(indexMasks), ...extra});
const ddLabel = (beat) => (ddLeft != null
  ? [lab(ddLeft - 0.012, clamp(Math.min(ddTop(), recentTop - GAP - ARROW) + 0.01), `${F.distribution.count} phiên phân phối`, 'red', beat, 'end')]
  : []);
const ftdMarks = (beat) => (ftdVisible
  ? [ftdArrow(ftd, ftdX, beat), lab(ftdX, clamp(ftdBase(ftd) + 0.03), `FTD ${ftd.dm} ${fmtPct(ftd.changePercent)}${ftdFailed ? ' · thất bại' : ''}`, ftdFailed ? 'red' : 'green', beat, 'middle')]
  : []);

/** The role built right after market: flow only when its photo is this session's (the same test as buildFlow), breadth
 *  only when the pack carries its counts (the same test as buildBreadth). */
const flowBuilt = !!(F.flow?.ok && photo(FLOW_PHOTO)?.side?.js?.pie?.geo);
const breadthBuilt = F.screener.breadth?.aboveSma200Percent != null;
const afterMarket = fmt.roles.slice(fmt.roles.indexOf('market') + 1).find((r) => (r !== 'flow' || flowBuilt) && (r !== 'breadth' || breadthBuilt) && !(SCREENER_DOWN && screenerRoles.has(r)));
// The daily hook drops its advancers/decliners sentence when FireAnt's flow scene follows it (user 2026-10-05: "move it
// into the scene 02, optimize scene 1 by removing 'Chỉ số tăng: … mã giảm' since it be mentioned on the updated scene 02").
const flowAfterHook = flowBuilt && fmt.roles[fmt.roles.indexOf('hook') + 1] === 'flow';

/**
 * The weekly hook's brief (2026-10-09, the director's and the trader-viewer's reviews merged by the orchestrator): the
 * NUMBER first, the week's dates inside the question (rules.formats.weekly.hook.question — "Tiền đang chảy vào đâu?" is
 * gone from the weekly: it has no flow scene and never answered it; the market scene answers this one in every state),
 * then the user's invitation. With the FTD lost inside the week the daily's 8/10 opener comes first, on its own beat.
 */
const weeklyHookBrief = ({W, S, HK, weekOpen, lost}) => {
  const up = W.changePercent >= 0;
  const word = Math.abs(W.changePercent) < 0.3 ? 'đi ngang' : W.changePercent > 1 ? 'tăng mạnh' : up ? 'tăng' : W.changePercent < -1 ? 'giảm mạnh' : 'giảm';
  const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const n = lost ? 1 : 0;
  // "so với (cuối) tuần trước" is part of the number (F4, 2026-10-09): without it a week's +0,07% reads as the session's change.
  const versus = weekOpen ? 'so với cuối tuần trước' : 'so với tuần trước';
  // The close is said in full, both decimals (user 2026-10-18 on the week of 16/10: "nghìn bảy trăm linh sáu not correctly
  // … get the correctly number: 1705.91 not round up/down this number").
  const numberSay = `VN-Index ${weekOpen ? 'đang ở' : 'đóng tuần ở'} <${vi(W.close)}> điểm, ${up ? 'tăng' : 'giảm'} <${vi(Math.abs(W.changePercent))}> phần trăm ${versus}.`;
  // The lost-FTD hook (16 words of the user's opener first) drops the question's date — the eyebrow and the beat-1
  // headline carry it — or it runs past formats.weekly.hook.maxWords (8/10 rehearsal: 69 words). An open week keeps
  // "tính tới thứ <T>" without "Tuần này": with "Tuần này" the template was 65 words on 8/10's numbers, past the cap 64.
  // No date in the question (user 2026-10-18: "Remove: Tuần từ mười hai đến mười sáu tháng mười on the intro") — the eyebrow
  // carries the week's dates; an open week keeps only "tính tới thứ <T>", which says the week is not closed yet.
  const question = weekOpen ? `Tính tới ${wdIn(S.weekday)}, ${lc(HK.question)}` : HK.question;
  const head1 = [`${weekOpen ? 'Tuần này' : 'Đóng tuần'} ${vi(W.close)} · ${fmtPct(W.changePercent)}`, `${weekOpen ? 'Từ đầu tuần' : 'Cả tuần'} ${word}`];
  return [
    ...(lost ? [`MỞ BẰNG CÂU CỦA NGƯỜI DÙNG — ngoại lệ 8/10 của bản phiên (rules.followThrough.lost; người dùng 2026-10-08: "On scene 1: Start with hook: Thị trường đã mất phiên FTD 3/8 & đang trong trạng thái nguy hiểm - append with existed content for me"), áp cho bản tuần vì phiên FTD ${ftd.dm} mất TRONG tuần này (${wdIn(weekdayOf(ftd.ended.date))} ${ftd.ended.dm}): "${lostLine(FL.say)}" — ngày FTD đọc thành chữ ("${dmSpoken(ftd.dm)}"), "và" thay "&". Beat 1 ghim vào câu này (atSentence 0): headline "${lostLine(FL.headline[0])}" / "${lostLine(FL.headline[1])}" (đỏ); máy mở rộng trên nến FTD ${ftd.dm} (mũi tên, nhãn "FTD ${ftd.dm} thất bại") rồi mới vào khung các phiên của tuần.`] : []),
    `THỨ TỰ (2026-10-09, đạo diễn + người xem trader, orchestrator gộp): SỐ trước, rồi câu hỏi KHÔNG có ngày (người dùng 2026-10-18: "Remove: Tuần từ mười hai đến mười sáu tháng mười on the intro" — eyebrow mang ngày của tuần), rồi lời mời. ${lost ? 'Sau câu mở là' : 'Hook là'} ba câu, đúng khuôn: "${numberSay}" → "${question}" → "${weekOpen ? HK.inviteOpen : HK.invite}". <…> đọc thành chữ: ${weekOpen ? 'điểm của phiên cuối' : 'điểm đóng tuần'} ${vi(W.close)} đọc ĐỦ, cả hai số lẻ, KHÔNG làm tròn (người dùng 2026-10-18: "1705.91 not round up/down this number"), % của TUẦN${weekOpen ? ' tới nay' : ''} so với đóng cửa tuần trước ${vi(W.prevClose)} (${fmtPct(W.changePercent)})${weekOpen ? ' — KHÔNG "đóng tuần" (tuần còn giao dịch)' : ''}; ngày đọc thành chữ. "${versus}" là BẮT BUỘC trong câu số (F4 2026-10-09): thiếu nó, ${fmtPct(W.changePercent)} của tuần nghe như % của phiên${S.changePercent != null ? ` (phiên ${S.dm} ${fmtPct(S.changePercent)})` : ''} — không thay bằng "tuần này". Lời mời đúng chữ người dùng (2026-10-09: "With weekly the intro must have the sentence like: cung minh review va ke hoach giao dich cho tuan toi nhe.") — "điểm lại" thay "review" (TTS đọc tiếng Anh thất thường), giữ nguyên "lên kế hoạch giao dịch cho tuần tới" (verify review-plan); scene watch trả lời hứa đó. Khoảng ${wordsOf('hook')} chữ${fmt.hook?.maxWords ? `, trần ${fmt.hook.maxWords} (verify narration FAIL trên trần)` : ''}${lost ? ' — câu mở, câu số và lời mời giữ nguyên chữ; chỉ câu hỏi được ngắn lại' : ''}.`,
    `Beat ${n + 1} ghim vào câu số (atSentence ${n}): headline "${head1[0]}" / "${head1[1]}" (dòng 2 do số quyết định: |Δ| < 0,3% đi ngang, quá 1% là mạnh) — ảnh KHÔNG có nhãn "+x%" (headline mang nó). Beat ${n + 2} ghim vào câu hỏi (atSentence ${n + 1}): headline "${HK.question}" / "${HK.headline}" — headline beat 1 của watch mang lại "${HK.headline}". KHÔNG câu "Tiền đang chảy vào đâu?" ở bản tuần (không scene nào của bản tuần trả lời nó); scene market trả lời "${HK.question}" ở mọi trạng thái.`,
    `${lost ? 'Ngoài câu mở của người dùng, ' : ''}KHÔNG nhắc phiên phân phối, FTD, "theo quy tắc" hay trạng thái (người dùng chốt 30/9) — chuyện hệ thống bắt đầu từ scene market. Hai số đọc ra lời là hai số của câu số${lost ? ' (ngày của câu mở là ngày, không tính)' : ''}; khối lượng tuần để scene week nói, số mã trên MA200 để scene breadth nói.`,
  ];
};

// hook — today's close first, then the day's words, the question and the promise (user, 2026-09-30).
// No system words: distribution days, FTD, the rules and the state wait for the market scene.
// Beat 1: today's candle ringed, the close and the HOSE advance/decline on plates; beat 2: the promise.
// The weekly edition opens on the week instead (its own skill since 2026-10-05): the week's close and change on the
// plate; the last session's advancers/decliners belong to its breadth scene. It closes on the user's invitation to review
// the week and plan the next (2026-10-09, rules.formats.weekly.hook), a promise the watch scene pays off.
const buildHook = () => {
  const T = F.session.breadthToday;
  const S = F.session;
  const W = FORMAT === 'weekly' ? F.weekly : null;
  const HK = W ? (fmt.hook ?? die(`rules.formats.${FORMAT}.hook is missing — the weekly hook's invitation (user 2026-10-09)`)) : null;
  // A weekly built before Friday (user 2026-10-06: "… of this week", run on Tue 6/10) speaks of the week SO FAR: no
  // "đóng tuần" while the week is still trading.
  const weekOpen = !!W && new Date(`${date}T00:00:00Z`).getUTCDay() < 5;
  // The weekly hook speaks of the WEEK: its sessions boxed on the daily chart (high to low), not Friday's candle alone.
  const weekBox = (beat = 0) => {
    const xs = daily.filter((b) => b.t >= W.from).map((b) => barX(index, daily, b.t)).filter((x) => x != null);
    if (!xs.length) return todayRing(beat);
    const half = (index.calib.d * 0.7) / index.W;
    const top = priceY(index, W.high, indexUnit);
    const bottom = priceY(index, W.low, indexUnit);
    return {kind: 'box', x: clamp(Math.min(...xs) - half), y: clamp(top - 0.012), w: clamp(Math.max(...xs) - Math.min(...xs) + 2 * half), h: clamp(bottom - top + 0.024), accent: W.changePercent >= 0 ? 'up' : 'down', beat};
  };
  // The session the FTD is lost (rules.followThrough.lost, user 2026-10-08): the daily hook opens WIDE on the FTD candle
  // with the user's line, then today's candle and the question as always — one beat more. The weekly does the same when
  // the FTD was lost inside its week (ftdLostInWeek, 2026-10-09).
  const lost = ((!W && ftdLostToday) || (!!W && ftdLostInWeek)) && ftdVisible;
  const b0 = lost ? 1 : 0;
  const marks = [
    // The weekly's lost-FTD plate leaves with its beat (the close-up of beat 2 caught it at the frame's edge — 8/10 test).
    ...(lost ? [ftdArrow(ftd, ftdX, 0), lab(ftdX, clamp(ftdBase(ftd) + 0.03), `FTD ${ftd.dm} thất bại`, 'red', 0, 'middle')].map((m) => (W ? {...m, until: 0} : m)) : []),
    W ? weekBox(b0) : todayRing(b0),
    // The weekly's close and % ride in the beat's headline: no "+x%" plate repeating it (2026-10-09, director's review).
    ...(W ? [] : [lab(clamp(lastX - 0.03), clamp(lastY - 0.11), `Đóng cửa ${vi(S.close)} · ${fmtPct(S.changePercent)}`, S.changePercent >= 0 ? 'green' : 'red', b0, 'end')]),
    ...(!W && !flowAfterHook && T?.up != null ? [lab(clamp(lastX - 0.03), clamp(lastY - 0.07), `${T.exchange}: ${T.up} tăng · ${T.down} giảm`, 'white', b0, 'end')] : []),
  ];
  const shots = [
    ...(lost ? [{beat: 0, x: clamp((ftdX + (lastX ?? 0.85)) / 2), y: clamp(((ftdY ?? lastY) + lastY) / 2 + 0.03), zoom: 1.3, move: 'pan'}] : []),
    {beat: b0, x: clamp((lastX ?? 0.85) - 0.07), y: clamp(lastY), zoom: 2.0, move: 'push_in'},
    {beat: b0 + 1, x: clamp((lastX ?? 0.85) - 0.1), y: clamp(lastY + 0.02), zoom: 1.6, move: 'pull_out'},
  ];
  push('hook', {
    // The weekly pins one beat per sentence: [the lost line], the number, the question (2026-10-09).
    beats: (lost ? todoBeats(3, est('hook')) : todoBeats(2)).map((b, k) => (W ? {...b, atSentence: k} : b)),
    visual: indexPhoto(room.settle(marks, shots)),
    brief: W ? weeklyHookBrief({W, S, HK, weekOpen, lost}) : [
      ...(lost ? [`MỞ BẰNG CÂU CỦA NGƯỜI DÙNG (2026-10-08: "On scene 1: Start with hook: Thị trường đã mất phiên FTD 3/8 & đang trong trạng thái nguy hiểm - append with existed content for me"): "${lostLine(FL.say)}" — ngày của phiên FTD đọc thành chữ ("${ftd.dm.replace('/', ' tháng ')}"), "và" thay "&". Beat 1 ghim vào câu này: headline "${lostLine(FL.headline[0])}" / "${lostLine(FL.headline[1])}" (đỏ); máy mở rộng trên nến FTD ${ftd.dm} (mũi tên, nhãn "FTD ${ftd.dm} thất bại") rồi mới vào nến hôm nay. Sau câu mở là phần cũ của hook, GIỮ NGUYÊN khuôn dưới đây — mỗi câu lùi một: beat 2 ghim vào câu ngày (headline điểm số và %), beat 3 vào câu hỏi.`] : []),
      `Câu đầu là NGÀY của phiên: "${S.weekday}, ngày ${S.dm.replace('/', ' tháng ')}" đọc thành chữ (có chữ "ngày" sau thứ — người dùng 2026-10-01). Câu hai gọi tên chỉ số rồi ĐIỂM SỐ và % của phiên: "VN-Index đóng cửa" ${vi(S.close)} — đọc ĐỦ, cả hai số lẻ, KHÔNG làm tròn (người dùng 2026-10-22: "get exactly the point of the vnindex for me", như bản tuần 18/10), ${fmtPct(S.changePercent)}. ${flowAfterHook
        ? `KHÔNG đọc số mã tăng/giảm ở hook (người dùng 2026-10-05: bỏ câu "Chỉ số tăng: … mã tăng, … mã giảm" vì scene 02 — ảnh FireAnt "Biến động thị trường" — đọc chúng); headline beat 1 cũng không in số mã. Chữ do số quyết định của chỉ số: "${T?.indexWord ?? '—'}" (|Δ| < 0,3% = đi ngang).`
        : `Câu hai là hai chữ mà SỐ quyết định: chỉ số "${T?.indexWord ?? '—'}" (|Δ| < 0,3% = đi ngang), ${T?.breadthWord ?? '—'} (HOSE ${T?.up ?? '?'} tăng · ${T?.down ?? '?'} giảm · ${T?.flat ?? '?'} đứng giá; "phần lớn" chỉ khi một phía ≥ 60%).`}`,
      // A hundred mark crossed and a long run of same-side closes are the session's news in the trader's words (2026-10-15:
      // first close under 1700 since 28/7, seventh down close running) — the pack holds both, so a headline may print them.
      ...(S.crossed ? [`TIN CỦA PHIÊN: đóng cửa ${S.crossed.direction === 'down' ? 'dưới' : 'trên'} mốc ${S.crossed.level} lần đầu từ ${S.crossed.lastSide?.dm ?? 'đầu dữ liệu'} (session.crossed) — trader nói "${S.crossed.direction === 'down' ? 'mất' : 'lấy lại'} mốc ${vi(S.crossed.level, 0)}". Đặt vào lời của hook (đọc thành chữ, câu đó vẫn tối đa hai số) hoặc dòng 2 headline beat ${b0 + 1}: "${S.crossed.direction === 'down' ? 'Mất' : 'Lấy lại'} mốc ${S.crossed.level}".`] : []),
      ...(Math.abs(S.streak ?? 0) >= 5 ? [`Phiên ${S.streak < 0 ? 'giảm' : 'tăng'} thứ ${Math.abs(S.streak)} liên tiếp (session.streak, tính trên giá đóng cửa) — dùng được ở hook hoặc market, nói bằng chữ.`] : []),
      `Rồi LỜI MỜI (người dùng chốt 30/9, thay lời hứa "cuối video"): "Cùng mình điểm lại thị trường và những mã đáng chú ý nhé." — "điểm lại" thay "review" (TTS đọc tiếng Anh thất thường), "và" thay "&". KHÔNG câu hỏi "Tiền đang chảy vào đâu?" (người dùng 2026-10-19: \"Remove: Tiền đang chảy vào đâu from the intro\"). Beat ${lost ? 3 : 2} ghim vào lời mời: headline "Cùng điểm lại thị trường" / "Và những mã đáng chú ý" (vàng).`,
      lost
        ? 'Ngoài câu mở của người dùng, KHÔNG nhắc phiên phân phối, FTD, "theo quy tắc" hay trạng thái ở scene này (người dùng chốt 30/9) — chuyện hệ thống kể ở scene market. Hai số đọc ra lời là hai số của câu điểm số (ngày FTD trong câu mở là ngày, không tính).'
        : `KHÔNG nhắc phiên phân phối, FTD, "theo quy tắc" hay trạng thái ở scene này (người dùng chốt 30/9) — chuyện hệ thống bắt đầu từ scene market. Hai số đọc ra lời là hai số của câu đầu.`,
    ],
  });
};

// market — the count, the anchor, the clock. No condition here: that is the payoff's job.
// The rule's three beats, as the daily has them (and the weekly when its market scene has no daily frame). The weekly's
// merged scene — the daily frame, then the rule, one verdict per beat — is buildMergedMarket (2026-10-09).
const buildMarket = () => {
  // The rule's beats: 0 count, 1 anchor, 2 clock.
  const at = (k) => k;
  const marks = [
    ...idxMarks(at(0)),
    {...lab(...inC(0.5, 0.06), `${F.distribution.count}/${F.distribution.window} phiên phân phối`, 'red', at(0)), until: at(1)},
  ];
  // The heaviest distribution day's plate: the speech never says it ("Không kể phiên nặng nhất", user 30/9).
  if (biggest) marks.push(lab(biggest.x - 0.012, clamp(priceY(index, barOf(biggest.date).h, indexUnit) - GAP - ARROW / 2), `${biggest.dm} ${fmtPct(biggest.changePercent)} · KL ×${vi(biggest.volumeRatio)}`, 'red', 0, 'end'));
  // When beat 3 turns to the prior attempt's low (a failed attempt, 2026-10-12) the FTD plate is old news: it leaves with
  // beat 2, and its spot under the lows is where that low's line runs.
  marks.push(...ftdMarks(1).map((m) => (behind && priorVisible ? {...m, until: 1} : m)));
  if (holdVisible) marks.push({kind: 'hline', y: clamp(holdY), accent: 'gold', beat: 1, label: `${holdName} ${vi(holdLow)}`, labelSide: 'left'});
  // A rally attempt adds no mark of its own: the gold line is the attempt's low and the beat-2 headline carries its day
  // (frame-audit 9/10: a "Ngày 1" plate collided with the beat-1 plates while the camera moved, and a ring on the last
  // candle sat in the path of the gold line's label as beat 3 pushed in).
  if (nextExpDd) marks.push(lab(nextExpDd.x - 0.012, clamp(priceY(index, barOf(nextExpDd.date).h, indexUnit) - GAP - ARROW - 0.04), `${nextExp.dm} hết hạn sau ${nextExp.sessionsLeft} phiên`, 'white', 2, 'end'));
  // A correction shows no rule plate (user 2026-10-08: "Not need mention the rule of FTD"): beat 3 keeps the correction low,
  // the low the first rally attempt has to hold (rules.status.CORRECTION.say).
  if (!outOfUptrend) marks.push(lab(...inC(0.5, 0.06), ladderText, dangerNow ? 'red' : 'gold', 2));
  // A failed attempt (user 2026-10-12): beat 3 draws where the market is heading, the low of the attempt behind the last FTD.
  if (behind && priorVisible) marks.push({kind: 'hline', y: clamp(priorY), accent: 'red', beat: 2, label: `Đáy nỗ lực phục hồi ${behind.dm} · ${vi(behind.low)}`, labelSide: 'left'});
  // The user's own sentence for the session (requests `say` on "market", 2026-10-22: "thanh khoản cao nhưng hiện tại đang có
  // gap khoảng giá … place this sentence on the scene 03"): a beat of its own before the rule's last one, which moves to
  // beat 4. The gap the session left open (facts session.gap) is boxed on it, between yesterday's candle and today's.
  const said = sayOf('market');
  const G = said ? F.session.gap : null;
  if (said) for (const m of marks) if (m.beat >= 2) { m.beat += 1; if (m.until != null && m.until >= 2) m.until += 1; }
  const prevT = daily.at(-2)?.t ?? null;
  const prevX = prevT ? barX(index, daily, prevT) : null;
  if (G && prevX != null && lastX != null) {
    const yTop = priceY(index, G.to, indexUnit);
    const yBot = priceY(index, G.from, indexUnit);
    const half = Math.max(0.006, (lastX - prevX) * 0.55);
    marks.push({kind: 'box', x: clamp(prevX - half), y: clamp(Math.min(yTop, yBot)), w: clamp(lastX - prevX + 2 * half), h: clamp(Math.max(0.004, Math.abs(yBot - yTop))), accent: 'gold', beat: 2, until: 2});
    marks.push({...lab(prevX - half - 0.012, clamp((yTop + yBot) / 2), `Gap ${vi(G.from)} → ${vi(G.to)}`, 'gold', 2, 'end'), until: 2});
  }
  const thresholdBrief = inRally
    ? `trạng thái ${F.state.since === F.session.date ? 'ĐỔI HÔM NAY' : 'đã là'}: "${F.state.label}" từ ${F.state.sinceDm} theo quy tắc, hôm nay là NGÀY ${F.state.rallyDay} của nỗ lực${F.state.day1?.date === F.session.date ? ` (phiên ${F.session.dm} lập đáy mới ${vi(F.session.low)} dưới đáy điều chỉnh cũ rồi rút chân, đóng cửa ở nửa trên biên độ — nói như trader: thủng đáy cũ rồi rút chân; KHÔNG đọc luật ngày 1)` : ''}. Số phiên phân phối KHÔNG còn đổi trạng thái: KHÔNG đồng hồ hết hạn, KHÔNG đếm tới ngưỡng nào, KHÔNG câu "${DG.say ?? 'mức nguy hiểm'}". Điều kiện kế: một phiên FTD MỚI (từ ${ftd?.dm ?? '—'} tới nay không có phiên FTD nào khác) — KHÔNG đọc luật của nó (FTD từ ngày ${F.rules.ftdMinDay}, +${vi(F.rules.ftdMinChangePercent)}% — người dùng 2026-10-08: "Not need mention the rule of FTD … Replace it with something meaningful"; nhãn scene watch mang luật). Câu người dùng chốt cho trạng thái điều chỉnh giờ có ĐÁY của nó trên chart: "${attemptSay}" — giữ nguyên chữ của người dùng (cả "phục hồi"); "đáy phiên nỗ lực phục hồi đầu tiên" là ${vi(holdLow)}, đáy của nỗ lực hôm nay (đường vàng). Gọi trạng thái bằng chữ của người dùng, "nỗ lực phục hồi", cả lời lẫn headline — không xen "hồi phục". Headline beat ${said ? 4 : 3} mang hai ý: chờ phiên FTD, ${R.status.RALLY_ATTEMPT?.say ? `giá không được thủng đáy ${vi(holdLow)}` : `nguy cơ thủng đáy ${vi(holdLow)} rất cao`}. Thủng ${vi(holdLow)} là nỗ lực thất bại (để scene watch nói)`
    : inCorrection && AF && AFS && behind
    ? `trạng thái ĐỔI HÔM NAY: nỗ lực phục hồi bắt đầu ${AF.day1.dm} THẤT BẠI (thủng đáy ${vi(AF.rallyLow)}, đáy mới ${vi(F.state.correctionLow)}), thị trường vẫn "${F.state.label}" theo quy tắc. LỜI NGƯỜI DÙNG CHỐT 2026-10-12 cho phiên này (rules.status.CORRECTION.attemptFailed — "Edit the sentence on the scene 03: …"; hỏi lại thì người dùng chọn ngày 1 của nỗ lực, ${behind.dm}, và rút câu cuối để scene giữ trần ${R.narration.maxWordsPerScene} chữ): scene là câu đếm, rồi "Giá thủng đáy hôm ${wdIn(weekdayOf(afLowDate))}, nỗ lực phục hồi thất bại."${afLowOnDay1 ? '' : ` (thứ của phiên lập đáy ${vi(AF.rallyLow)}, ${dm(afLowDate)} — không phải ngày 1 ${AF.day1.dm})`}, rồi "${afLine(AFS.say)}" — GIỮ NGUYÊN chữ, ngày đọc thành chữ ("ngày ${behind.dm.replace('/', ' tháng ')}" viết bằng chữ). KHÔNG thêm "Phải tìm phiên FTD mới", KHÔNG câu "${R.status.CORRECTION.say ?? ''}", KHÔNG đồng hồ, KHÔNG đếm ngưỡng. Đáy nỗ lực phục hồi ${behind.dm} là ${vi(behind.low)} (đường đỏ beat 3, nhãn "Đáy nỗ lực phục hồi ${behind.dm} · ${vi(behind.low)}"); đáy điều chỉnh mới ${vi(F.state.correctionLow)} vẫn là đường vàng. Beat 3 ghim vào câu "Theo quy tắc, …"; headline beat 3: "${afLine(AFS.headline[0])}" / "${afLine(AFS.headline[1])}" (đỏ)`
    : inCorrection && AF
    ? `trạng thái ĐỔI HÔM NAY: nỗ lực phục hồi bắt đầu ${AF.day1.dm} THẤT BẠI — phiên ${F.session.dm} thủng đáy ${vi(AF.rallyLow)} của nó, lập đáy mới ${vi(F.state.correctionLow)}, nên thị trường quay lại "${F.state.label}" theo quy tắc — nói rõ bằng lời người ("nỗ lực phục hồi thất bại", chữ của người dùng; không xen "hồi phục"). KHÔNG đồng hồ hết hạn, KHÔNG đếm tới ngưỡng nào, KHÔNG câu "${DG.say ?? 'mức nguy hiểm'}". Điều kiện kế: chờ một nỗ lực phục hồi MỚI rồi phải TÌM MỘT PHIÊN FTD MỚI (người dùng 2026-10-08: "find the another FTD"), KHÔNG đọc luật của nó (ngày 1, FTD từ ngày ${F.rules.ftdMinDay}). Câu người dùng chốt cho trạng thái điều chỉnh: "${R.status.CORRECTION.say ?? ''}" — hôm nay nó vừa xảy ra với nỗ lực ${AF.day1.dm}; giữ nguyên chữ của người dùng, đặt nó cho nỗ lực KẾ TIẾP (ví dụ mở bằng "Và với nỗ lực kế tiếp, …" hay "Lần sau cũng vậy: …" — người viết chọn), "đáy" giờ là đáy điều chỉnh mới ${vi(F.state.correctionLow)} (đường vàng, đáy của chính phiên hôm nay). Headline beat 3 mang hai ý: tìm phiên FTD mới, nguy cơ thủng đáy rất cao. Thủng ${vi(F.state.correctionLow)} là đáy điều chỉnh mới (để scene watch nói)`
    : inCorrection
    ? `trạng thái ${F.state.since === F.session.date ? 'ĐỔI HÔM NAY' : 'đã là'}: "${F.state.label}" từ ${F.state.sinceDm} theo quy tắc (${F.distribution.count} ≥ ${R.distribution.correctionAt} phiên phân phối${F.state.lastFtd?.ended ? `; phiên FTD ${F.state.lastFtd.dm} thất bại, kết thúc ${F.state.lastFtd.ended.dm}` : ''}) — nói rõ bằng lời người. Ở trạng thái điều chỉnh số phiên phân phối KHÔNG còn đổi trạng thái: KHÔNG đồng hồ hết hạn, KHÔNG đếm tới ngưỡng nào, KHÔNG câu "${DG.say ?? 'mức nguy hiểm'}" (đó là câu của mức nguy hiểm khi xu hướng tăng còn đứng). Điều kiện kế: phải TÌM MỘT PHIÊN FTD MỚI (người dùng 2026-10-08: "find the another FTD" — nói thành lời, như "Giờ phải tìm một phiên FTD mới."; từ ${ftd?.dm ?? '—'} tới nay không có phiên FTD nào khác), nhưng KHÔNG đọc luật của nó (ngày 1, FTD từ ngày ${F.rules.ftdMinDay} — người dùng 2026-10-08: "Not need mention the rule of FTD … Replace it with something meaningful"); thay vào đó là câu người dùng chốt: "${R.status.CORRECTION.say ?? ''}" — chữ của người dùng, "đáy" là đáy mà nỗ lực phục hồi đầu tiên phải giữ: đáy điều chỉnh ${vi(F.state.correctionLow)} (đường vàng beat 3). Headline beat 3 mang hai ý: tìm phiên FTD mới, nguy cơ thủng đáy rất cao. Thủng ${vi(F.state.correctionLow)} là đáy điều chỉnh mới (để scene watch nói)`
    : F.distribution.toUnderPressure > 0
    ? `"chỉ cần thêm ${F.distribution.toUnderPressure} phiên phân phối nữa là xu hướng bắt đầu ${R.status.UNDER_PRESSURE.short.toLowerCase()}"${inUptrend && F.distribution.toDanger > 0 ? `; mức nguy hiểm của hệ thống người dùng (${F.distribution.dangerAt} phiên) để nhãn nói` : ''}`
    : dangerNow
      ? `ĐANG Ở MỨC NGUY HIỂM của hệ thống người dùng (${F.distribution.count} ≥ ${F.distribution.dangerAt} phiên phân phối, người dùng 2026-10-01) — scene PHẢI CẢNH BÁO: nói "mức nguy hiểm" và "${DG.action}" như một bước quản trị rủi ro của hệ thống ("theo hệ thống của mình"), không gọi mua bán; verify FAIL nếu market không có chữ "nguy hiểm". Trạng thái vẫn là "${F.state.label}" từ ${F.state.sinceDm}; ${DG.say
        // The user's line for the danger level (rules.distribution.danger.say, 2026-10-05) replaces the countdown to the
        // correction ("Thêm một phiên nữa là điều chỉnh." on 2/10); the threshold itself stays on the beat-3 plate and in watch.
        ? `rồi câu người dùng chốt 2026-10-05, THAY câu đếm tới điều chỉnh (KHÔNG "thêm ${F.distribution.toCorrection} phiên phân phối nữa là thị trường điều chỉnh" — bản 2/10 "Thêm một phiên nữa là điều chỉnh."): "${DG.say}" — giữ hai ý (xác suất biến động hoặc điều chỉnh lớn; thị trường không còn khỏe), chữ của người dùng, viết "khỏe"; ngưỡng điều chỉnh (${R.distribution.correctionAt} phiên) để nhãn beat ${at(2) + 1} và scene watch nói. Câu này ${DG.say.split(/\s+/).length} chữ, dài hơn câu cũ; market vẫn trần ${fmt.market?.maxWords ?? R.narration.maxWordsPerScene} chữ (bản 2/10 đã ${R.narration.maxWordsPerScene}): gọn câu khác, không cắt câu của người dùng`
        : `ngưỡng kế là điều chỉnh: "thêm ${F.distribution.toCorrection} phiên phân phối nữa là thị trường điều chỉnh"`}`
      : inUptrend && F.distribution.toDanger > 0
        ? `trạng thái ĐÃ là "${F.state.label}" từ ${F.state.sinceDm} (đếm ${F.distribution.count} ≥ ${F.rules.underPressureAt}) — nói rõ xu hướng đã chuyển sang chịu áp lực và từ phiên nào; ngưỡng kế là MỨC NGUY HIỂM của hệ thống người dùng (${F.distribution.dangerAt} phiên phân phối, người dùng 2026-10-01): "chỉ cần thêm ${F.distribution.toDanger} phiên nữa là mức nguy hiểm, phải ${DG.action}" — bước quản trị rủi ro của hệ thống, không gọi mua bán; điều chỉnh (${R.distribution.correctionAt} phiên) để nhãn và scene watch nói`
        : `trạng thái ĐÃ là "${F.state.label}" từ ${F.state.sinceDm} (đếm ${F.distribution.count} ≥ ${F.rules.underPressureAt}) — nói rõ xu hướng đã chuyển sang chịu áp lực và từ phiên nào; ngưỡng kế là điều chỉnh: "thêm ${F.distribution.toCorrection} phiên phân phối nữa là thị trường điều chỉnh"`;
  const shots = [
    {beat: 0, x: clamp(ddCentre), y: inC(0, 0.42)[1], zoom: 1.5, move: 'pan'},
    {beat: 1, x: clamp(ftdVisible ? (ftdX + (lastX ?? 0.9)) / 2 : inC(0.5, 0)[0]), y: clamp(holdVisible ? (holdY + lastY) / 2 : inC(0, 0.5)[1]), zoom: 1.15, move: 'tilt'},
    behind && priorVisible
      // "đang tiến về đáy … 28/7": the frame holds today's close and the prior attempt's low together.
      ? {beat: 2, x: clamp(((priorX ?? inC(0.5, 0)[0]) + (lastX ?? 0.9)) / 2), y: clamp((priorY + lastY) / 2), zoom: 1.3, move: 'push_in'}
      : {beat: 2, x: clamp((nextExpDd?.x ?? lastX ?? 0.85) - 0.02), y: clamp(recentTop + 0.1), zoom: 2.1, move: 'push_in'},
  ];
  if (said) {
    const last = shots.pop();
    const gy = G ? (priceY(index, G.to, indexUnit) + priceY(index, G.from, indexUnit)) / 2 : lastY;
    shots.push({beat: 2, x: clamp((lastX ?? 0.85) - 0.05), y: clamp(gy), zoom: 2.4, move: 'push_in'}, {...last, beat: 3, move: 'pull_out'});
  }
  push('market', {
    act: warnAct,
    beats: todoBeats(said ? 4 : 3),
    visual: indexPhoto(room.settle(marks, shots)),
    brief: [
      `Beat 1 — mở bằng HÔM NAY: ${F.session.isDistribution ? 'LÀ phiên phân phối' : 'KHÔNG phải phiên phân phối'} (${fmtPct(F.session.changePercent)}, KL ×${vi(F.session.volumeRatio)}), rồi ĐẾM theo khuôn người dùng chốt 1/10: "${countSentence}" (số đọc thành chữ; KHÔNG "đếm lại còn …") — ${F.distribution.count}/${F.distribution.window} phiên: ${dd.map((d) => `${d.dm} ${fmtPct(d.changePercent)} KL ×${vi(d.volumeRatio)}`).join('; ') || 'không có'}. Không kể phiên nặng nhất (người dùng chốt 30/9). Phân phối = giảm từ ${F.rules.ddMaxChangePercent}% với KL cao hơn phiên trước.`,
      inRally
        ? `Beat 2 — HÔM NAY là ngày ${F.state.rallyDay} của nỗ lực phục hồi theo quy tắc${F.state.day1?.date !== F.session.date ? ` (ngày 1 là ${F.state.day1?.dm ?? '—'}; đáy của nỗ lực vẫn giữ)` : F.session.changePercent < 0 ? ` — phiên giảm nhưng lập đáy mới của nhịp điều chỉnh (${vi(F.session.low)}) rồi rút chân, đóng ${vi(F.session.close)} ở nửa trên biên độ: nói như trader ("thủng đáy … rồi rút chân"), không đọc luật` : ' — phiên đóng cửa tăng đầu tiên của nhịp điều chỉnh'}. ${ftdVisible && ftd.ended ? `Nhãn FTD ${ftd.dm} trên chart giữ "· thất bại" (thất bại hôm ${ftd.ended.dm}); lời không cần kể lại. ` : ''}${holdName} ${holdLow != null ? vi(holdLow) : '—'} là đường vàng${holdLow === F.session.low ? ' — đáy của chính phiên hôm nay' : ''}; trên chart không có nhãn "ngày 1" — headline beat 2 mang nó. Headline beat 2 gọi tên trạng thái bằng chữ của người dùng: "Nỗ lực phục hồi" và ngày ${F.state.rallyDay}.`
        : inCorrection && AF
        ? `Beat 2 — TIN CỦA HÔM NAY: nỗ lực phục hồi bắt đầu ${AF.day1.dm} (${afLowOnDay1 ? 'ngày 1 hôm đó — thủng đáy cũ rồi rút chân' : `đáy ${vi(AF.rallyLow)} của nỗ lực là phiên ${dm(afLowDate)}, ngày 1 là phiên tăng ${AF.day1.dm} ngay sau`}) đã THẤT BẠI sau ${AF.days} phiên: phiên ${F.session.dm} thủng đáy ${vi(AF.rallyLow)} của nỗ lực, lập đáy mới ${vi(F.session.low)} và đóng ${vi(F.session.close)} ở nửa dưới biên độ${afLowOnDay1 ? ` (không rút chân như ${AF.day1.dm})` : ''}. Nói như trader: "thủng đáy ${vi(AF.rallyLow)}, nỗ lực phục hồi thất bại". ${ftdVisible && ftd.ended ? `Nhãn FTD ${ftd.dm} trên chart giữ "· thất bại" (thất bại hôm ${ftd.ended.dm}); lời KHÔNG kể lại chuyện FTD ${ftd.dm} — đó là tin của ${ftd.ended.dm}. ` : ''}Đáy điều chỉnh ${vi(F.state.correctionLow)} là đường vàng — đáy của chính phiên hôm nay. Headline beat 2: "Nỗ lực phục hồi thất bại" / "Thủng đáy ${vi(AF.rallyLow)}" (đỏ).`
        : inCorrection
        ? `Beat 2 — ${ftdVisible ? `phiên FTD ${ftd.dmy} (ngày ${ftd.day}, ${fmtPct(ftd.changePercent)}) ${ftd.ended ? `ĐÃ THẤT BẠI — kết thúc ${ftd.ended.dm}${ftd.ended.why === 'distribution' ? ' vì phiên phân phối thứ ' + F.distribution.count : ' vì thủng đáy nhịp hồi'}; nói đúng chữ "phiên FTD … đã thất bại" (người dùng 2026-10-08: "Emphasize the failure FTD"), nhãn trên chart "FTD ${ftd.dm} ${fmtPct(ftd.changePercent)} · thất bại"` : ''}; ` : ''}${ftdLostToday ? 'rồi MỘT câu ngắn, không số: thị trường đang RẤT NGUY HIỂM (người dùng 2026-10-08: "mention the market is so dangerous right now on scene 1 and 3"); headline beat 2 mang cả hai ý (FTD thất bại, nguy hiểm); ' : ''}${holdName.toLowerCase()} ${holdLow != null ? vi(holdLow) : '—'} (đường vàng${holdLow === F.session.low ? ' — đáy của chính phiên hôm nay' : ''}).`
        : ftdVisible
        ? `Beat ${at(1) + 1} — neo của xu hướng: FTD ${ftd.dmy} (ngày ${ftd.day}, ${fmtPct(ftd.changePercent)}, KL ×${vi(ftd.volumeRatio)}) và đáy nhịp hồi ${vi(ftd.rallyLow)} (đường vàng).`
        : `Beat ${at(1) + 1} — ${holdName.toLowerCase()} ${holdLow != null ? vi(holdLow) : '—'}.`,
      // A state's on-screen headline (rules.status.<state>.headline, user 2026-10-05) replaces the state's name in
      // beat 2's headline; the narration still names the state "theo quy tắc".
      ...(R.status[F.state.status]?.headline ? [`Headline beat 2 (line2): "${R.status[F.state.status].headline}" — người dùng 2026-10-05 thay tên trạng thái "${R.status[F.state.status].vi}" trên màn hình bằng câu này ("something like": được chỉnh chữ, giữ ý sức khỏe thị trường đang yếu, viết "khỏe"); KHÔNG in "${R.status[F.state.status].vi}" làm headline nữa. Lời vẫn gọi trạng thái theo quy tắc.`] : []),
      ...(said ? [`BEAT 3 — CÂU CỦA NGƯỜI DÙNG cho phiên này (content/review/requests/${date}.json \`say\` — ${REQ.source ?? 'người dùng'}): "${said.text}" — GIỮ ĐÚNG CHỮ (chỉ thêm dấu câu; "gap" giữ nguyên, lexicon đọc "gáp"), beat 3 ghim vào nó: máy đẩy vào ${G ? `khoảng giá ${vi(G.from)} → ${vi(G.to)} mà phiên ${F.session.dm} bỏ trống (hộp vàng giữa nến ${dm(prevT)} và nến hôm nay, nhãn "Gap ${vi(G.from)} → ${vi(G.to)}"; facts session.gap: ${vi(G.points)} điểm, đáy hôm nay ${vi(G.to)} cao hơn đỉnh hôm trước ${vi(G.from)})` : 'các nến cuối'}. ${G ? `Làm giàu nghĩa bằng MỘT câu ngắn ngay sau, không số, đúng như số (ví dụ "Gap đó chưa được lấp."); headline beat 3: dòng 1 "Gap ${vi(G.from)} → ${vi(G.to)}", dòng 2 nghĩa của nó ("Khoảng giá chưa được lấp") — headline không dùng "hiện tại", "đang" (check claims).` : ''} Cả scene vẫn trần ${R.narration.maxWordsPerScene} chữ: gọn câu ngày nỗ lực (gộp "chờ phiên FTD" vào đó được), không cắt câu người dùng.`] : []),
      outOfUptrend
        ? `Beat ${said ? 4 : 3} — điều kiện kế: ${thresholdBrief}. Gọi "phiên FTD" (lexicon đọc "ép tê đi").`
        : `Beat 3 — đồng hồ: ${nextExp ? `phiên ${nextExp.dm} hết hạn sau ${nextExp.sessionsLeft} phiên` : 'không phiên nào sắp hết hạn'}; ngưỡng kế nói bằng lời người — ${thresholdBrief} — KHÔNG kiểu "thêm một là…, thêm ba là…" (người dùng bác 30/9); ngưỡng còn lại để nhãn và scene watch nói. Gọi "phiên FTD" (lexicon đọc "ép tê đi").`,
      // The bridge follows the scene that really comes next: the daily hands over to FireAnt's "Biến động thị trường"
      // (flow), the weekly to the breadth line — and to the filter boards when that scene is dropped (no photo of this
      // session / no breadth counts), where "Nhìn rộng ra thì sao?" would dangle.
      `Đây là BỐI CẢNH, chưa phải điều kiện (câu nếu … thì để dành cho watch). ${AFS && behind
        ? `Scene KẾT bằng câu của người dùng ("${afLine(AFS.say).split('. ').pop()}"); câu hỏi trao lời "Bộ lọc hôm nay bắt được gì?" là câu ĐẦU của scene ${afterMarket === 'spike' ? 'Volume spike' : afterMarket}.`
        : afterMarket === 'breadth' || afterMarket === 'flow'
        ? 'Kết bằng câu dẫn sang độ rộng thị trường, dạng câu hỏi: "Nhìn rộng ra thì sao?".'
        : afterMarket === 'watch'
        ? `Scene sau là THẲNG kịch bản VN-Index (bản này không có bảng bộ lọc hay scene soi mã: ${SCREENER_DOWN ?? 'không có mã nào'}). Kết bằng MỘT câu hỏi ngắn dẫn sang kịch bản cho phiên tới, như "Vậy phiên tới có những kịch bản nào?"; KHÔNG nhắc bộ lọc, KHÔNG lặp câu "Tiền chảy vào đâu?" của hook.`
        : `Kết bằng MỘT câu hỏi ngắn trao lời cho các bộ lọc (scene sau là ${afterMarket === 'spike' ? 'bảng Volume spike' : afterMarket}; ${fmt.roles.includes('flow') ? (flowBuilt ? 'scene Biến động thị trường đã đứng ngay sau hook' : 'scene Biến động thị trường bị bỏ ở bản này vì ảnh FireAnt không phải của phiên này') : fmt.roles.includes('breadth') ? 'scene độ rộng bị bỏ ở bản này vì pack không có số độ rộng' : 'không có scene độ rộng'}), như "${FORMAT === 'weekly' ? 'Bộ lọc cuối tuần bắt được gì?' : 'Bộ lọc hôm nay bắt được gì?'}"; KHÔNG lặp câu "Tiền chảy vào đâu?" của hook.`}`,
      ...(FORMAT === 'weekly' && F.weekly ? [`Bản tuần: kể chuyện của TUẦN — phiên phân phối mới trong tuần: ${F.weekly.distributionDays.map((d) => `${d.dm} ${fmtPct(d.changePercent)}`).join('; ') || 'không có'}; đổi trạng thái trong tuần: ${F.weekly.transitions.map((x) => `${x.dm} ${x.from} → ${x.to}`).join('; ') || 'không'}. "Hôm nay" của beat ${at(0) + 1} là phiên cuối tuần (${F.session.dm}).`] : []),
    ],
  });
};

// breadth — weekly only (user 2026-10-05: "Daily; old chart → weekly"): the old "Độ rộng thị trường" — the paradox on
// the share of stocks above SMA200 (scripts/review/breadth.mjs) under the index line.
/** "2026-08-21" → "từ cuối tháng tám": a date in words for a direction sentence (no number spoken). */
const MONTH_VI = ['', 'một', 'hai', 'ba', 'tư', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười', 'mười một', 'mười hai'];
const monthPhrase = (t) => {
  const [, m, d] = String(t).split('-').map(Number);
  return m ? `từ ${d <= 10 ? 'đầu' : d <= 20 ? 'giữa' : 'cuối'} tháng ${MONTH_VI[m]}` : '';
};
const buildBreadth = () => {
  const B = F.screener.breadth;
  if (B?.aboveSma200Percent == null) {
    console.log(`  breadth: dropped — ${FACTS} has no screener.breadth (facts.mjs builds it for a format whose roles list breadth)`);
    return;
  }
  // With a breadth history (scripts/review/breadth.mjs) the scene is a two-pane line chart — index
  // above, share above SMA200 below (user, 2026-09-30: "better visual with chart line graph"). Without the history
  // the scene is dropped: the dot-grid fallback went with the drawn panels (user 2026-10-06).
  if (B.line && B.history?.length >= 10) {
    const L = B.line;
    // The NUMBER (user 2026-10-06: "amount of stock have price better than its SMA200"): the terminal's own count on the
    // caption and in the beat-2 headline; the bottom pane draws the same count per session, recomputed from SSI closes
    // (scripts/review/breadth.mjs — the screener keeps no history), so its tip can sit a few names off (line.residual).
    const K = B.count ?? {above: B.aboveSma200, with: B.withSma200 ?? B.universe, percent: B.aboveSma200Percent, floor: 0};
    const liquidWord = K.floor > 0 ? ' CÓ THANH KHOẢN' : '';
    const W = B.week;
    const events = ftd && B.history.some((h) => h.t === ftd.date) ? [{t: ftd.date, label: `FTD ${ftd.dm}`, accent: 'green'}] : [];
    // The line is read from its LAST major turn — its latest extreme in the window, when the move since is real (≥ 10 names
    // and ≥ 5%) — not from the window's first point (2026-10-17: 223 → 239 over 60 sessions read "tăng dần từ cuối tháng
    // bảy" while the line had fallen from 282 on 27/8 to 239; the index fell over that leg too). Without such a turn: first → last.
    const H = B.history;
    const lastH = H[H.length - 1];
    const peakH = H.reduce((m, h) => (h.above >= m.above ? h : m), H[0]);
    const troughH = H.reduce((m, h) => (h.above <= m.above ? h : m), H[0]);
    const turnH = peakH.t > troughH.t ? peakH : troughH;
    const leg = lastH.above - turnH.above;
    const legReal = turnH !== lastH && Math.abs(leg) >= 10 && Math.abs(leg) >= 0.05 * turnH.above;
    const from = legReal ? turnH : H[0];
    const countDown = legReal ? leg < 0 : L.countChange < 0;
    const indexMove = from.indexClose ? (lastH.indexClose / from.indexClose - 1) * 100 : L.indexChangePercent;
    const indexDown = indexMove < 0;
    const span = legReal ? `từ ${dm(from.t)}` : `${L.sessions} phiên`;
    const story = indexDown === countDown
      ? (countDown
        ? `CÙNG CHIỀU (${span}): chỉ số giảm ${vi(Math.abs(indexMove), 1)}% và số mã trên MA200 cũng giảm (${from.above} → ${lastH.above} trên đường) — điểm yếu lan rộng, không chỉ vài mã trụ`
        : `CÙNG CHIỀU (${span}): chỉ số tăng ${vi(Math.abs(indexMove), 1)}% và số mã trên MA200 cũng tăng (${from.above} → ${lastH.above} trên đường) — đà tăng có độ rộng`)
      : (countDown
        ? `NGHỊCH LÝ (${span}): chỉ số tăng ${vi(Math.abs(indexMove), 1)}% mà số mã trên MA200 lại giảm (${from.above} → ${lastH.above} trên đường) — chỉ số được vài mã kéo, phần lớn cổ phiếu yếu đi`
        : `NGHỊCH LÝ (${span}): chỉ số giảm ${vi(Math.abs(indexMove), 1)}% mà số mã trên MA200 lại tăng (${from.above} → ${lastH.above} trên đường) — cổ phiếu khỏe hơn chỉ số`);
    const next = fmt.roles[fmt.roles.indexOf('breadth') + 1];
    // ONE direction phrase (F4, 2026-10-09 — the brief said both "từ đầu tháng bảy" and "từ cuối tháng tám"): from the
    // line's turn in screener.breadth.history — its last peak when the count fell, its last trough when it rose.
    const turnAt = countDown ? Math.max(...B.history.map((h) => h.above)) : Math.min(...B.history.map((h) => h.above));
    const turnT = legReal ? turnH.t : B.history.filter((h) => h.above === turnAt).pop()?.t ?? L.from;
    const direction = `${countDown ? 'giảm' : 'tăng'} dần ${monthPhrase(turnT)}`;
    push('breadth', {
      // Three sentences (count, direction, hand-off): beat 2 — the count line drawn — rides the middle one (F4 2026-10-09).
      beats: todoBeats(2).map((b, k) => ({...b, atSentence: k})),
      visual: {
        type: 'lines',
        caption: `TERMINAL: ${K.above}/${K.with} MÃ${liquidWord} TRÊN SMA200 · ${vi(K.percent, 1)}%`,
        top: {label: 'VN-INDEX · ĐÓNG CỬA', points: B.history.map((h) => [h.t, h.indexClose]), unit: 'points'},
        // axis: false (2026-10-09) — the recomputed line's scale printed 288/255/221 beside the caption's 244/898: two
        // numbers for one fact. The caption keeps the terminal's count; the pane keeps its gridlines, not their values.
        bottom: {label: `SỐ MÃ${liquidWord} TRÊN SMA200 · GIÁ SSI`, points: B.history.map((h) => [h.t, h.above]), accent: countDown ? 'red' : 'green', unit: 'points', tag: false, axis: false},
        events,
      },
      brief: [
        `CON SỐ người dùng hỏi (2026-10-06: "amount of stock have price better than its SMA200"): terminal đếm ${K.above} trên ${K.with} mã${K.floor > 0 ? ` có thanh khoản (KL TB20 ≥ ${K.floor.toLocaleString('vi-VN')} cp)` : ' có SMA200'} đóng cửa trên MA200 = ${vi(K.percent, 1)}% (screener.breadth.count) — ĐỌC con số này bằng chữ ("… trên chín trăm linh … mã": viết "linh", lexicon đọc "lẻ"), hoặc phần trăm nói tròn theo đúng ${vi(K.percent, 1)}%. Headline beat 2 ghi đúng "${K.above}/${K.with} mã${K.floor > 0 ? ' có thanh khoản' : ''} trên SMA200" — caption đã in số này; gọi chỉ báo là MA200 trong lời (người dùng 2026-10-01).`,
        `${story}. Hai đường cùng trục thời gian (${L.sessions} phiên, ${L.fromDm} → ${F.session.dm}): VN-Index ${vi(L.indexFirst)} → ${vi(L.indexLast)}; số mã trên MA200 đỉnh ${L.countPeak} ngày ${L.countPeakDm}. Beat 1 (atSentence 0, câu đếm) = đường chỉ số vẽ ra; beat 2 (atSentence 1, câu chiều của đường) = đường số mã vẽ ra. Đường dưới TÍNH LẠI từ giá đóng cửa SSI (terminal không giữ lịch sử) nên điểm cuối ${L.countLast} lệch ${L.residual != null ? `${L.residual > 0 ? '+' : ''}${L.residual}` : '?'} mã so với số của terminal: KHÔNG đọc số của đường, KHÔNG ghép số của đường (${L.countFirst}) với số terminal (${K.above}) trong một câu — chiều của đường nói bằng chữ, đúng MỘT cụm: "${direction}" (${countDown ? 'đỉnh' : 'đáy'} ${turnAt} mã ngày ${Number(turnT.slice(8, 10))}/${Number(turnT.slice(5, 7))} trên đường).`,
        W ? `Tuần này: ${W.screenerFrom != null ? `terminal ${W.screenerFrom} mã ngày ${W.fromDm} → ${K.above} hôm nay (${W.screenerChange > 0 ? '+' : ''}${W.screenerChange})` : `đường ${W.lineFrom} → ${W.lineTo} mã (${W.lineChange > 0 ? '+' : ''}${W.lineChange})`} — nói bằng chữ (gần như không đổi / thêm / bớt), không thêm số thứ ba.` : 'Không có phiên của tuần trước trên đường — không nói thay đổi trong tuần.',
        `LỜI — ${wordsOf('breadth')} chữ, ba câu (2026-10-09, cắt gọn — người xem: một sự thật một con số): (1) câu đếm của terminal ở trên; (2) chiều của đường tính lại, BẰNG CHỮ, không số ("${direction}"${indexDown === countDown ? ', cùng chiều chỉ số' : ', ngược chiều chỉ số'}) — beat 2 ghim vào câu này (atSentence 1); (3) câu trao lời${next === 'sectors' ? ' sang xếp hạng nhóm ngành: "Nhóm ngành nào còn khỏe?"' : `, dạng câu hỏi ngắn ("Bộ lọc tuần này bắt được gì?")`}. Không đọc số tuần, không đọc số của đường. Trục số của khung dưới đã ẩn (axis: false) — chỉ caption in số, số của terminal.`,
      ],
    });
    return;
  }
  console.log(`  breadth: dropped — no breadth history (node scripts/review/breadth.mjs --date=${date}, then facts.mjs)`);
};

// flow — FireAnt's "Thống kê sàn" for the edition's session (user 2026-10-05: "the chart of symbol increase and
// decrease and flow of the money … of FireAnt"; first built for the weekly, then moved to the DAILY the same afternoon —
// "Daily; old chart → weekly" — while the weekly keeps the drawn share-above-SMA200 line). One photo, two beats: the pie of HOSE stocks up / down / unchanged, then the bars of where the session's money
// went, the leading bar boxed. FireAnt shows only its latest session, so without a photo of THIS session (facts.mjs
// `flow.ok`) the scene is dropped, with the reason printed, and the reel stays valid.
const buildFlow = () => {
  const FL = F.flow;
  const p = photo(FLOW_PHOTO);
  if (!FL?.ok || !p?.side?.js?.pie?.geo) {
    console.log(`  flow: dropped — ${FL?.ok === false ? FL.why
      : !p ? `no photo public/${DIR}/${FLOW_PHOTO}.png (node scripts/review/shots.mjs --format=${FORMAT} --only=flow, then facts.mjs)`
        : !FL ? `${FACTS} has no flow block — run facts.mjs again after the photo` : `public/${p.rel} has no chart boxes in its sidecar — re-shoot it`}`);
    return;
  }
  const js = p.side.js;
  // Two cards stacked (user 2026-10-05 evening: "add the image of 'Tác động đến Index' on scene 02 - on beat 2, beat 1
  // include the flow money circle and phân bổ dòng tiền"): the money card (pie + bars) on top, FireAnt's "Top cổ phiếu
  // tác động" below, each at the panel's ratio. Fitted whole (contain) the photo is one card wide and two tall, so at
  // zoom 2 it fills the panel's width and exactly one card shows; the camera may travel the photo's whole height
  // (with `cover` it is clamped to what shows at zoom 1 and never reaches the lower card — 5/10 stills): beat 1 holds on
  // the money card, beat 2 tilts down to the impact card.
  const IM = FL.impact && js.impact?.bars?.length ? js.impact : null;
  const k = p.W / p.H / 1.42;
  const crop = IM ? undefined : k > 1 ? {x: clamp((1 - 1 / k) / 2), y: 0, w: clamp(1 / k), h: 1} : {x: 0, y: clamp((1 - k) / 2), w: 1, h: clamp(k)};
  const G = js.pie.geo;
  const lead = js.bars.items?.find((b) => b.key === FL.moneyLead)?.box;
  // Beat 1 is a close-up on the pie card alone (zoom 1.75 shows ~57% of the photo's width, and the pie card is ~54%):
  // both plates sit inside that frame, in the card's empty top-right corner and under the pie.
  const marks = [
    lab(clamp(js.pie.x + js.pie.w - 0.02), clamp(G.cy - G.ry - 0.05), `${FL.exchange} · phiên ${FL.dm}`, 'gold', 0, 'end'),
    lab(G.cx, clamp(G.cy + G.ry + 0.05), `${FL.up} tăng · ${FL.down} giảm · ${FL.flat} đứng giá`, 'white', 0, 'middle'),
  ];
  // The leading bar and its own value label above it (FireAnt prints "5801.5 tỷ" there) — no text of ours on the bars.
  if (lead) {
    const w = Math.max(lead.w + 0.03, 0.085);
    // On the stacked photo a card is half the height, so the box's padding above the bar's own label halves too.
    const pad = IM ? 0.029 : 0.058;
    marks.push({kind: 'box', x: clamp(lead.x + lead.w / 2 - w / 2), y: clamp(lead.y - pad), w: clamp(w), h: clamp(lead.h + pad + (IM ? 0.004 : 0.008)), accent: FL.moneyLead === 'up' ? 'up' : 'down', beat: IM ? 0 : 1});
  }
  // Beat 2 on the stacked photo: the index's biggest mover boxed on FireAnt's impact chart, its points on a plate beside it.
  const imLead = IM ? IM.bars.find((b) => b.symbol === FL.impact.lead.symbol && b.box) : null;
  if (imLead) {
    const b = imLead.box;
    const w = Math.max(b.w + 0.03, 0.07);
    marks.push({kind: 'box', x: clamp(b.x + b.w / 2 - w / 2), y: clamp(b.y - 0.022), w: clamp(w), h: clamp(b.h + 0.026), accent: FL.impact.lead.points >= 0 ? 'up' : 'down', beat: 1});
    // The impact card carries no title of its own (FireAnt's "Top cổ phiếu tác động" heading sits above the card).
    marks.push(lab(clamp(js.card.impact.x + 0.05), clamp(js.card.impact.y + 0.035), 'Tác động đến VN-Index (điểm)', 'gold', 1, 'start'));
    marks.push(lab(clamp(b.x + b.w / 2 + w / 2 + 0.02), clamp(b.y + 0.03), `${FL.impact.lead.symbol} ${fmtPct(FL.impact.lead.points).replace('%', '')} điểm · chỉ số ${fmtPct(FL.impact.indexChange).replace('%', '')}`, FL.impact.lead.points >= 0 ? 'green' : 'red', 1, 'start'));
  }
  // Close on the pie, then pull back to the whole card: the bars need ~82% of the photo's height, so a close-up on them
  // alone cuts the card titles or the pie's labels in half (seen on the 5/10 test stills); the reveal is the move.
  // The user's own sentence for the session (requests `say`, 2026-10-21) closes the scene on a beat of its own: the camera
  // backs out to the whole photo while the headline carries the number behind it (flow.gainersBelowMa200).
  const said = sayOf('flow');
  const shots = [
    ...(IM
      ? [
        {beat: 0, x: 0.5, y: clamp(js.card.money.y + js.card.money.h / 2), zoom: 2, move: 'push_in'},
        {beat: 1, x: 0.5, y: clamp(js.card.impact.y + js.card.impact.h / 2), zoom: 2, move: 'tilt'},
      ]
      : [
        {beat: 0, x: clamp(G.cx), y: clamp(G.cy), zoom: 1.75, move: 'push_in'},
        {beat: 1, x: 0.5, y: 0.5, zoom: 1, move: 'pull_out'},
      ]),
    ...(said ? [{beat: 2, x: 0.5, y: 0.5, zoom: 1, move: IM ? 'pull_out' : 'static'}] : []),
  ];
  const BM = FL.gainersBelowMa200;
  const leadWord = FL.moneyLead === 'up' ? 'tăng' : 'giảm';
  push('flow', {
    eyebrow: 'Biến động thị trường',
    beats: todoBeats(said ? 3 : 2),
    visual: imageOf(p, 'fireant.vn', {...(crop ? {crop} : {}), annotations: marks, shots}),
    brief: [
      `ẢNH FIREANT "Thống kê sàn", sàn ${FL.exchange}, phiên ${FL.dm} — ${FORMAT === 'weekly' ? 'PHIÊN CUỐI TUẦN: FireAnt chỉ hiện phiên mới nhất, nên đây là MỘT phiên, không gán cho cả tuần' : 'PHIÊN HÔM NAY (FireAnt chỉ hiện phiên mới nhất; ảnh được nhận vì chỉ số trên trang bằng giá đóng cửa của phiên)'}. Trái: ${FL.up} mã tăng, ${FL.down} mã giảm, ${FL.flat} mã đứng giá (${FL.countWord}). Phải, phân bổ dòng tiền: ${vi(FL.money.up, 1)} tỷ vào mã tăng, ${vi(FL.money.down, 1)} tỷ vào mã giảm, ${vi(FL.money.flat, 1)} tỷ mã đứng giá — ${FL.moneyWord}, tiền vào mã ${leadWord} gấp ${vi(FL.moneyLeadRatio)} lần phía kia (${vi(FL.moneyPercent[FL.moneyLead], 1)}% tổng ${vi(FL.money.total, 1)} tỷ).`,
      ...(flowAfterHook ? [`SCENE 02, ngay sau hook (người dùng 2026-10-05: "move it into the scene 02"): phiên của dòng tiền trên ảnh này, ngay sau lời mời của hook (hook không còn câu hỏi "Tiền chảy vào đâu?" từ 2026-10-19 — đừng trả lời một câu không ai hỏi); hook KHÔNG còn đọc số mã nên scene này ĐỌC số mã tăng và giảm thành chữ (${FL.up} mã tăng, ${FL.down} mã giảm), rồi dòng tiền. ${said ? 'Câu CUỐI là câu của người dùng (dòng dưới) — không thêm câu dẫn sang market sau nó.' : 'Kết bằng câu dẫn sang scene market (chuyện hệ thống: phiên phân phối, trạng thái theo quy tắc), không phải sang bộ lọc.'}`] : []),
      ...(said ? [`CÂU CỦA NGƯỜI DÙNG cho phiên này (content/review/requests/${date}.json \`say\` — ${REQ.source ?? 'người dùng'}): "${said.text}" — câu CUỐI của scene, BEAT 3 ghim vào nó (máy lùi ra cả ảnh). GIỮ ĐÚNG CHỮ: chỉ được thêm dấu phẩy chỗ ngắt hơi và đọc phần trong ngoặc như một cụm chen giữa, hai mã tách bằng "và" (mẫu: "…, VPB và HDB, vẫn đang đứng im."); không thêm, bớt, đổi chữ nào khác. Câu này ~${said.text.split(/\s+/).length} chữ mà scene vẫn trần ${R.narration.maxWordsPerScene}: hai câu trước gọn lại — câu số mã (beat 1) và câu mã tác động có số điểm (beat 2); dòng tiền và tỉ lệ ×${vi(FL.moneyLeadRatio)} để headline beat 1 mang. Headline beat 3 là NGHĨA của câu, bằng số: dòng 1 ${BM ? `"${Math.round(BM.percent)}% mã tăng còn dưới MA200" (flow.gainersBelowMa200: ${BM.below}/${BM.up} mã ${BM.exchange} tăng hôm nay có MA200 vẫn đóng cửa dưới đường đó — MA200 của terminal)` : '— pack thiếu flow.gainersBelowMa200 (chạy lại facts.mjs) — dòng 1 nói bằng chữ'}, dòng 2 gọi đúng các mã của câu ("VPB, HDB vẫn đứng im"); màu vàng. Lời KHÔNG đọc thêm con số đó (một số mỗi câu, câu người dùng giữ nguyên).`] : []),
      ...(IM ? [`HAI THẺ, HAI BEAT (người dùng 2026-10-05: "add the image of 'Tác động đến Index' on scene 02 - on beat 2, beat 1 include the flow money circle and phân bổ dòng tiền"): beat 1 = thẻ dòng tiền — biểu đồ tròn số mã VÀ cột phân bổ dòng tiền cùng lúc (khung quanh cột mã ${leadWord}); beat 2 = máy lia xuống thẻ "Top cổ phiếu tác động" của FireAnt — mã kéo / đẩy chỉ số bao nhiêu điểm. Chỉ số ${fmtPct(FL.impact.indexChange).replace('%', '')} điểm; ${FL.impact.lead.symbol} ${fmtPct(FL.impact.lead.points).replace('%', '')} điểm = ${vi(FL.impact.leadShare, 1)}% mức thay đổi của chỉ số${Math.abs(FL.impact.leadShare) >= 50 ? ' — MỘT MÃ GÁNH PHẦN LỚN nhịp của chỉ số: đó là chuyện của beat 2, nói đúng như số' : ''}. Kéo lên: ${FL.impact.up.map((x) => `${x.symbol} ${fmtPct(x.points).replace('%', '')}`).join(', ')}; kéo xuống: ${FL.impact.down.map((x) => `${x.symbol} ${fmtPct(x.points).replace('%', '')}`).join(', ')}. Gọi MÃ (voice.letters đánh vần), số điểm đọc thành chữ ("mười hai phẩy tám điểm"); headline giữ số của pack (flow.impact.*). Câu ghim beat 2 là câu về mã tác động.`] : []),
      `Beat 1 = biểu đồ tròn (câu về số mã); ${IM ? 'cùng beat 1 là' : 'beat 2 ='} cột dòng tiền, khung quanh cột mã ${leadWord} (câu "tiền vào …"). ${FL.agree === 'opposite'
        ? `CHUYỆN CỦA PHIÊN: số mã và dòng tiền NGƯỢC chiều (${FL.countWord}, mà ${FL.moneyWord}) — tiền dồn vào một nhóm mã; nói đúng như số, không đoán nhóm nào.`
        : FL.agree === 'same' ? 'Số mã và dòng tiền cùng chiều — nói gọn, không thổi phồng.'
          : !FL.countLean && FL.moneyLean ? `CHUYỆN CỦA PHIÊN: số mã gần cân bằng (${FL.up} / ${FL.down}) mà ${FL.moneyWord} (×${vi(FL.moneyLeadRatio)}) — tiền đã chọn phía, số mã thì chưa; nói đúng như số.`
            : FL.countLean && !FL.moneyLean ? `${FL.countWord}, mà tiền chia gần đều hai phía — nói đúng như số, không gọi tiền là nghiêng.`
              : 'Cả số mã lẫn dòng tiền đều gần cân bằng — phiên giằng co; nói đúng như số, không gọi là nghiêng.'}`,
      `Từ của trader: độ rộng, dòng tiền, mã tăng / mã giảm, tỷ đồng. Số trong lời viết bằng chữ, số tiền đọc tới hàng tỷ (${vi(FL.money.up, 1)} → "${Math.round(FL.money.up)} tỷ" bằng chữ), không "khoảng", không "gần"; nhãn và headline giữ số của pack (flow.*): ${FL.up} / ${FL.down} / ${FL.flat}, ${vi(FL.money.up, 1)} tỷ, ${vi(FL.money.down, 1)} tỷ, ×${vi(FL.moneyLeadRatio)}, ${vi(FL.moneyPercent[FL.moneyLead], 1)}% — viết "5801,5" không có dấu chấm nghìn (verify đọc dấu chấm là thập phân).${flowAfterHook ? '' : ' Kết bằng câu dẫn sang bộ lọc: tiền đó nằm ở những mã nào?'}`,
    ],
  });
};

/**
 * The filter scenes and the symbol reviews never say that a name of one filter is also in another (user 2026-10-05:
 * "Not need mentioned the stock on specific filter existed on other filter") — checks.mjs `review-overlap` FAILs it.
 * Until then the boards banded the names in both RS Strong and Uptrend, the spike scene seeded "a leader is on this
 * board" and the leader scenes opened with "ở cả ba bộ lọc".
 */
const NO_OVERLAP = 'KHÔNG nói mã nào của bảng này có mặt ở bộ lọc khác (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter") — không "cũng ở / cũng nằm trong …", không "cả hai / cả ba bộ lọc", không "dải vàng", không gọi tên bộ lọc khác trong câu có mã (verify `review-overlap` FAIL).';

// spike — the whole filter on one board: its gainers in the left column, its losers in the right, up to
// movers.gainers / movers.losers each (user 2026-09-30: a two-column board; 2026-10-01: "each column have
// 10 symbols"; that evening: "sort by the price change percent: DESC and ASC for both column. The volume
// must be the percent with its volume avg 20" — biggest gain first, deepest fall first, volume as VOL/SMA %).
const boardRow = (x) => ({
  symbol: x.symbol, changePercent: x.changePercent,
  ...(x.volumeVsSma20Percent != null ? {volumeVsSma20Percent: x.volumeVsSma20Percent} : x.volumeRatio != null ? {volumeRatio: x.volumeRatio} : {}),
  ...(x.rs1m != null ? {rs1m: x.rs1m} : {}),
});
/** A name's volume against its 20-session average, as the board prints it: "+92%" (VOL/SMA), else "×1,92". */
const volVs20 = (x) => (x.volumeVsSma20Percent != null ? fmtPct(x.volumeVsSma20Percent, 0) : `×${vi(x.volumeRatio)}`);
const buildMovers = () => {
  const S = F.screener.spike;
  const byRs = S.sortedBy === 'rs_1m';
  const order = byRs
    ? 'xếp theo RS 1M giảm dần'
    : 'cột tăng xếp theo % tăng (mạnh nhất trước), cột giảm theo % giảm (sâu nhất trước) — người dùng 2026-10-01 tối';
  const line = (x) => `${x.symbol} ${fmtPct(x.changePercent)} KL ${volVs20(x)}${x.rs1m != null ? ` (RS 1M ${x.rs1m})` : ''}`;
  // The names the reel reviews next that this board shows light up on a third beat, as on the RS Strong and Uptrend
  // boards (user 2026-10-06: "With the volumn spike also have the animation with this scene for me highlight the symbol
  // must noted"): a gold mark when the row lands, then band, outline, gold ticker and magnifier (src/scenes/Movers.tsx).
  const shown = [...S.gainers, ...S.losers];
  const focus = reviewOrder().filter((sym, i, all) => all.indexOf(sym) === i && shown.some((x) => x.symbol === sym));
  const lit = focus.map((sym) => shown.find((x) => x.symbol === sym));
  const label = `${R.screener.board?.picksLabel ?? 'Xem kỹ'}: ${focus.join(' · ')}`;
  const row = (x) => ({...boardRow(x), ...(focus.includes(x.symbol) ? {focus: true} : {})});
  push('spike', {
    beats: todoBeats(focus.length ? 3 : 2),
    visual: {
      type: 'movers',
      caption: `KHỐI LƯỢNG ĐỘT BIẾN · ${S.count} MÃ · ${byRs ? 'XẾP THEO RS 1M' : 'XẾP THEO % THAY ĐỔI'}${S.volumeUnit === 'percentVsSma20' ? ' · KL SO SMA20' : ''}`,
      left: {title: 'TĂNG', accent: 'green', rows: S.gainers.map(row)},
      right: {title: 'GIẢM', accent: 'red', rows: S.losers.map(row)},
      ...(focus.length ? {emphasis: [{beat: 2, set: 'focus', dim: true, label}]} : {}),
    },
    brief: [
      `Bộ lọc "${S.filter}": ${S.count} mã (${S.up} tăng, ${S.down} giảm${S.flat ? `, ${S.flat} đứng giá — không lên bảng` : ''}), cả bộ lọc lên bảng, mỗi cột tối đa ${R.screener.scenes.spike.movers?.gainers ?? 10} mã, ${order}. Beat 1 = cột TĂNG (${S.gainers.length} mã): ${S.gainers.map(line).join('; ')}.`,
      `Beat 2 = cột GIẢM (${S.losers.length} mã): ${S.losers.map(line).join('; ')}. Khối lượng lớn khi giảm là bán ra.${S.volumeUnit === 'percentVsSma20' ? ' "KL +x%" là khối lượng phiên so với trung bình 20 phiên (VOL/SMA của terminal); headline in cùng đơn vị đó, không "×".' : ''}`,
      ...(focus.length ? [`Beat 3 = MÃ CẦN CHÚ Ý trên bảng này (sẽ soi ở scene sau): ${lit.map((x) => `${x.symbol} — ${fmtPct(x.changePercent)} hôm nay, KL ${volVs20(x)} so TB20`).join('; ')}. ${lit.length > 1 ? 'Các dòng đó' : 'Dòng đó'} sáng lên (nền vàng quét ngang dòng, viền vàng, mã phóng to và đổi vàng, kính lúp), các dòng khác mờ đi, nhãn "${label}" thay caption — câu ghim beat 3 nói về ${lit.length > 1 ? 'các mã' : 'mã'} đó TRÊN BẢNG NÀY: % thay đổi và khối lượng so trung bình 20 phiên, gọi MÃ, hai mã tách bằng chữ. Không mời "xem kỹ" (lời mời là câu cuối của bảng Uptrend), không "mã dẫn dắt", không nói mã có ở bộ lọc khác.`] : []),
      `Lời đọc gọi MÃ ba chữ cái (voice.letters đánh vần lúc thu), không đọc tên công ty (người dùng 2026-10-01); hai mã liền nhau tách bằng chữ ("GEE và POW"). Không đọc hết bảng: nói số mã mỗi cột và một hai mã đáng chú ý — bảng gánh phần còn lại; tối đa hai số đọc ra lời.`,
      `${NO_OVERLAP} Chỉ kể bảng NÀY: không gợi mã nào là "mã dẫn dắt", không "để cuối", không nói mã nào cũng có ở RS Strong hay Uptrend.`,
      // The board after it words its own lead-in (the daily's shortlist, user 2026-10-19 — "Mã cần chú ý trong các phiên tới").
      ...(fmt.screener?.scenes?.[fmt.roles[fmt.roles.indexOf('spike') + 1]]?.bridge
        ? [`Câu CUỐI là câu dẫn sang bảng "${fmt.screener.scenes[fmt.roles[fmt.roles.indexOf('spike') + 1]].photo}", đúng chữ: "${fmt.screener.scenes[fmt.roles[fmt.roles.indexOf('spike') + 1]].bridge}" — không mang mã, không gọi tên bộ lọc nào.`]
        : []),
    ],
  });
};

/**
 * The brief line of the scene that opens the symbol reviews (the board right before the leader scenes).
 * The picks are tiered (rules.screener.leaders, user 2026-10-01): names in all three filters first,
 * then names in RS Strong ∩ Uptrend, ranked by RS 1M inside a tier, at most `top` of them (the daily keeps only the
 * first tier since 2026-10-06 — formats.daily.leaders — so its board may open no review at all). Since the
 * user's 2026-10-01 night note ("Remove 'Đếm ngược từ hai' => 'Let's review …'") the scene closes on an
 * invitation to review them, not on a countdown; the board's beat 2 lights them under
 * rules.screener.board.picksLabel ("Xem kỹ"), the word the invitation uses. Since 2026-10-05 the speech never says
 * why they were picked (which filters they share — "Not need mentioned the stock on specific filter existed on other
 * filter"): the invitation names them, and the focus rows on both boards carry the rest.
 */
const NUM_VI = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
/** The hand-off into the scenario / plan scene, said by the scene right before it: the last pick, or the last board when
 * no pick follows it. The weekly's is rules.formats.weekly.watch.bridge ("Vậy tuần tới canh gì?", 2026-10-09 — the watch
 * scene is next week's plan); the daily keeps "Còn VN-Index thì sao?". */
const WATCH_BRIDGE = fmt.watch?.bridge ?? 'Còn VN-Index thì sao?';
/** The names the reel reviews after the boards, in the order their scenes play: the leaders (weaker RS 1M first, top[0]
 * last), then the names the user asked for on the review page. A board lights the ones it shows (lib/board.mjs). */
const reviewOrder = () => [...(F.screener.leaders?.top ?? [])].reverse().map((x) => x.symbol).concat((F.screener.requested ?? []).map((x) => x.symbol));
/** Tickers in speech, separated by WORDS so their spelled letters never run together ("MSR và DGW", "A, rồi B và C"). */
const sayTickers = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', rồi ')} và ${list[list.length - 1]}`);
/** A requested name gets its pick scene only with a photo (buildPicks drops it otherwise). */
const pickHasPhoto = (L) => !!(photo(`${L.symbol.toLowerCase()}-fireant`)?.calib || photo(`${L.symbol.toLowerCase()}-terminal`));
/**
 * The weekly's sector leader (facts.mjs screener.sectorLeader, rules.formats.<format>.sectors.leader — user 2026-10-10: "Get
 * one of stock on this marjor best ranking to review 1-5 ranking, on the scene 05, mentiond the major raking from 1 to 3 and
 * mention its stock on this major"): the strongest stock of the #1 ICB group, reviewed in a `pick` scene built like a
 * requested name's (FireAnt chart, symbol-reviewer marks, the holder / not-holder beat), right AFTER the sectors scene and
 * BEFORE the user's picks. Only with its calibrated FireAnt photo AND a valid symbol review: otherwise dropped, the reason
 * printed where its scene would go (never a die). It is pick 1 when built, so the user's picks number on from 2.
 */
const SECTOR_LEADER = F.screener?.sectorLeader ?? null;
const sectorLeaderWhy = !SECTOR_LEADER ? null
  : !fmt.roles.includes('sectors') ? `rules.formats.${FORMAT}.roles has no sectors scene`
  : !(F.sectors?.ok && F.sectors.groups?.length) ? 'no sectors scene in this edition'
  : !photo(`${SECTOR_LEADER.symbol.toLowerCase()}-fireant`)?.calib ? `no calibrated FireAnt photo public/${DIR}/${SECTOR_LEADER.symbol.toLowerCase()}-fireant.png (node scripts/review/shots.mjs --format=${FORMAT} --only=requested --symbols=${SECTOR_LEADER.symbol}, then facts.mjs)`
  : !SECTOR_LEADER.review ? `no valid symbol review of ${SECTOR_LEADER.symbol} in ${FACTS} (one symbol-reviewer agent → content/review/symbols/${date}/${SECTOR_LEADER.symbol}.json, node scripts/review/lib/symbol-review.mjs ${date} ${SECTOR_LEADER.symbol}, then facts.mjs)`
  : null;
const sectorPick = SECTOR_LEADER && !sectorLeaderWhy ? SECTOR_LEADER : null;
const sectorTotal = sectorPick ? 1 : 0;
/**
 * `beats`: the board's beat count (a drawn board with no focus row has one). The invitation names the leader scenes that
 * are built (leaderTotal), in the order they play; with none — the daily reviews only the names in all three filters since
 * 2026-10-06 — it names the picks that get a scene, and with neither the board bridges to the VN-Index scenario.
 */
// pinLast false (a weekly board whose beat 2 rides its middle sentence — the picks it invites are not on it, F4): the
// invitation stays the last sentence but no longer claims beat 2.
const countdownBrief = (beats = 2, scene = null, pinLast = true) => {
  // Tier order (the weekly, 2026-10-06): the board that feeds a review invites ONLY its own pick (tierScene = the board).
  const own = tierOrder && scene ? tierPicks.filter((x) => x.tierScene === scene) : null;
  const leaders = own ?? [...(F.screener.leaders?.top ?? [])].slice(0, leaderTotal).reverse();
  const order = own ?? (leaders.length ? leaders : (F.screener.requested ?? []).filter(pickHasPhoto));
  const n = order.length;
  const pin = beats > 1 && pinLast ? 'Câu ghim beat 2 — câu CUỐI —' : beats > 1 ? 'Câu CUỐI (beat 2 ghim vào câu giữa)' : 'Câu CUỐI (bảng này chỉ một beat)';
  if (!n) return `Hôm nay KHÔNG có scene soi mã sau bảng này: KHÔNG mời "xem kỹ" mã nào. ${pin} là câu dẫn sang ${fmt.watch?.bridge ? `kế hoạch tuần tới, đúng chữ: "${WATCH_BRIDGE}"` : `kịch bản VN-Index ("${WATCH_BRIDGE}" là được)`}, không mang mã. KHÔNG nói vì sao không soi mã, không "không mã nào có mặt ở cả ba bộ lọc" — luật chọn mã (rules.formats.${FORMAT}.leaders) là việc của đạo diễn, không lên lời (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter").`;
  const invite = `Cùng mình xem kỹ ${sayTickers(order.map((x) => x.symbol))}.`;
  return `Bảng này MỞ PHẦN SOI MÃ: ${NUM_VI[n] ?? n} mã được soi, mỗi mã một scene chart riêng ngay sau, theo thứ tự ${order.map((x) => `${x.symbol}${x.rs1m != null ? ` (RS 1M ${x.rs1m})` : ''}`).join(' rồi ')} — vì sao chọn chúng là việc của đạo diễn, KHÔNG lên lời (không tầng, không "cả ba bộ lọc", không "có mặt ở cả …"; người dùng 2026-10-05). ${pin} là LỜI MỜI gọi đúng tên các mã đó, tách bằng chữ: "${invite}" (người dùng 2026-10-01: "Remove 'Đếm ngược từ hai' => 'Let's review …'"; "xem kỹ", không "soi kỹ": giọng đọc "soi" thành "xoay", đo 2026-10-04) — KHÔNG "đếm ngược", KHÔNG chữ "review" (TTS đọc tiếng Anh thất thường), KHÔNG "dẫn đầu" (chúng không phải hàng đầu của bảng này), không lặp "điểm lại" của hook. Ngoài lời mời, không kể lại điều scene trước đã nói về các mã đó.`;
};

/**
 * Beat 2 of a board (rs and uptrend alike — user 2026-10-05: "uptrend … behavior like the RS strong") lights the
 * names the reel reviews next that this board shows ("decoration and animation with the symbol need focused";
 * lib/board.mjs marks them `focus`, FilterBoard.tsx animates them). The speech stays on THIS board: no other filter,
 * no shared names (user 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter").
 * `focus` = the board's focus rows in review order (boardOf's own list when it gives one).
 */
const focusBrief = (S, rows, focus, feeds, columns = []) => {
  const label = R.screener.board?.picksLabel ?? 'Xem kỹ';
  // Only what the board prints next to the name (its columns), so the sentence points at figures on screen.
  const own = {rs52w: (x) => (x.rs52w != null ? `RS 52W ${x.rs52w}` : ''), volume: (x) => (x.volumeVsSma20Percent != null ? `KL ${fmtPct(x.volumeVsSma20Percent, 0)} so TB20` : ''), aboveEma50: (x) => (x.aboveEma50Percent != null ? `${fmtPct(x.aboveEma50Percent, 1)} trên EMA50` : ''), aboveSma200: (x) => (x.aboveSma200Percent != null ? `${fmtPct(x.aboveSma200Percent, 1)} trên SMA200` : '')};
  const cols = (x) => [`hạng #${rows.indexOf(x) + 1} theo RS 1M (${x.rs1m})`, `${fmtPct(x.changePercent)} hôm nay`, ...columns.map((c) => own[c]?.(x) ?? '')].filter(Boolean).join(', ');
  const lit = focus.map((sym) => rows.find((x) => x.symbol === sym)).filter(Boolean);
  // The filter's conditions stay off the narration and the headlines (user 2026-10-12: "Not need explain the Uptrend value
  // filter on scene 06: giữ những mã có giá trên EMA50, còn đường này nằm trên MA200. Remove it for me.").
  const meaning = feeds ? ` Điều riêng của ${S.filter}: số mã và nhận xét từ cột % — KHÔNG giải thích điều kiện của bộ lọc (${describeFilter(savedFilter(S.filter)) || 'điều kiện đã lưu'} là cho đạo diễn; người dùng 2026-10-12: "Not need explain the Uptrend value filter … Remove it"), cả lời lẫn headline (không "giá trên EMA50", không "trên cả hai đường MA").` : '';
  if (!lit.length) return `${NO_OVERLAP}${meaning} Bảng này không có mã nào sẽ soi ở scene sau — không có beat nhấn mạnh.`;
  return `${NO_OVERLAP}${meaning} MÃ CẦN CHÚ Ý trên bảng này (sẽ soi ở scene sau): ${lit.map((x) => `${x.symbol} — ${cols(x)}`).join('; ')}. Beat 2 tô và tạo hiệu ứng cho ${lit.length > 1 ? 'các dòng' : 'dòng'} đó (các dòng khác mờ đi, nhãn "${label}: ${lit.map((x) => x.symbol).join(' · ')}")${feeds ? ' — Ở BẢNG NÀY câu ghim beat 2 là LỜI MỜI ở cuối, đúng câu của dòng "Bảng này MỞ PHẦN SOI MÃ" bên dưới (nó có thể gọi cả mã không có trên bảng này); nó thay cho câu tả hạng của các mã trên bảng' : ` — câu ghim beat 2 nói về ${lit.length > 1 ? 'các mã' : 'mã'} đó TRÊN BẢNG NÀY: hạng, % hôm nay, cột riêng của bảng; gọi MÃ, hai mã tách bằng chữ. Kết bằng một câu mở đường sang bảng sau, không mang mã ("Còn bộ lọc Uptrend thì sao?" là được)`}.`;
};

// rs and uptrend — one saved filter each, ranked by RS 1M (user 2026-10-01: "listing 10 symbols with RS strong …
// maximum 10 with Uptrend filter, sort with RS1M desc"). `visual: "board"` draws one full-width table
// (lib/board.mjs → src/scenes/FilterBoard.tsx; user 2026-10-01 evening: "must have the RS1M column, price change &
// more info"; since 2026-10-05 the names reviewed next light up on beat 2, no shared-filter band); `visual: "columns"` keeps the two-column movers
// board of that afternoon (rows 1–5 left, 6–10 right, RS 1M big, the day's change under it).
/** How the brief names a board column (the board's own header says GIÁ · % NGÀY · RS 1M · …). */
const BOARD_COLUMN_VI = {price: 'giá', change: '% hôm nay', rs1m: 'RS 1M (số + thanh)', rs52w: 'RS 52W', volume: 'KL so TB20', aboveEma50: '% trên EMA50', aboveSma200: '% trên SMA200'};
const buildBoard = (scene) => {
  const S = F.screener[scene] ?? die(`${FACTS} has no screener.${scene} — run node scripts/review/facts.mjs --format=${FORMAT} again`);
  const spec = R.screener.scenes[scene];
  const rows = S.top.slice(0, Math.min(spec.top ?? 10, 10));
  if (!rows.length) die(`${FACTS}: screener.${scene}.top is empty — pull.mjs ranked no rows for "${S.filter}"`);
  const half = rows.length > 5 ? 5 : rows.length;
  const left = rows.slice(0, half);
  const right = rows.slice(half);
  const line = (x) => `${x.symbol} RS 1M ${x.rs1m} ${fmtPct(x.changePercent)}`;
  const feeds = fmt.roles[fmt.roles.indexOf(scene) + 1] === 'leader';
  const others = Object.entries(R.screener.scenes).filter(([k]) => k !== scene && k !== 'spike').map(([, s]) => s.photo);
  const table = spec.visual === 'columns' ? null : boardOf({scene, F, R, roles: fmt.roles});
  // The rows lit on beat 2: the names the reel reviews next, in their order, that this board shows (lib/board.mjs).
  const focus = table?.focus ?? reviewOrder().filter((sym) => rows.some((x) => x.symbol === sym));
  push(scene, {
    beats: todoBeats(table ? table.beats : right.length ? 2 : 1),
    visual: table ? table.visual : {
      type: 'movers',
      caption: `${S.filter.toUpperCase()} · ${S.count} MÃ · XẾP THEO RS 1M`,
      left: {title: `#1–${left.length}`, accent: 'gold', metric: 'rs', rows: left.map(boardRow)},
      ...(right.length ? {right: {title: `#${half + 1}–${half + right.length}`, accent: 'gold', metric: 'rs', startRank: half + 1, rows: right.map(boardRow)}} : {}),
    },
    brief: [
      table
        ? `Bộ lọc "${S.filter}" của terminal (${describeFilter(savedFilter(S.filter)) || 'điều kiện đã lưu'}): ${S.count} mã, hôm nay ${S.up} tăng, ${S.down} giảm${S.ranked != null && S.ranked !== S.count ? `; ${S.count - S.ranked} mã chưa đủ đường trung bình nên không xếp hạng` : ''}. Bảng vẽ ${rows.length} mã xếp theo RS 1M giảm dần, mỗi dòng: ${table.visual.columns.map((c) => BOARD_COLUMN_VI[c] ?? c).join(' · ')} — ${table.rowLines.join('; ')}. ${table.beatLine}`
        : `Bộ lọc "${S.filter}" của terminal (${describeFilter(savedFilter(S.filter)) || 'điều kiện đã lưu'}): ${S.count} mã, hôm nay ${S.up} tăng, ${S.down} giảm${S.ranked != null && S.ranked !== S.count ? `; ${S.count - S.ranked} mã chưa đủ đường trung bình nên không xếp hạng` : ''}. Bảng vẽ ${rows.length} mã xếp theo RS 1M giảm dần — beat 1 = cột trái (${left.map(line).join('; ')})${right.length ? `; beat 2 = cột phải (${right.map(line).join('; ')})` : ''}.`,
      `Lời không đọc hết bảng: số mã của bộ lọc, một hai mã đứng đầu (gọi MÃ, tách bằng chữ), và một nhận xét từ cột % (bao nhiêu mã giảm hôm nay dù RS cao). Tối đa hai số đọc ra lời. Gọi đúng tên bộ lọc: "bộ lọc ${S.filter}" (người dùng 2026-10-01: "keep the RS strong verb" — không "RS mạnh", không "bộ lọc xu hướng tăng").`,
      focusBrief(S, rows, focus, feeds, table?.visual?.columns ?? spec.board?.columns ?? []),
      feeds
        ? `${countdownBrief(table ? table.beats : right.length ? 2 : 1)} KHÔNG gộp hai bộ lọc thành một bảng trong lời: bảng này vẫn là ${S.filter} một mình.`
        : `Một lát cắt riêng, KHÔNG gộp với ${others.join(' / ') || 'bộ lọc khác'} (người dùng tách mỗi bộ lọc một scene, 2026-09-30): kể bộ lọc này đếm gì và mã nào đứng đầu. Chưa soi mã ở đây.`,
    ],
  });
};

// The format's own boards (rules.formats.<format>.screener.scenes — the weekly's Momentum breakout / breakdown, user
// 2026-10-06: "eval the filter: Momentum breakout, Momentum breakdown"; picked "Replace" and "Top of each filter"): the
// drawn board of rs/uptrend (lib/board.mjs → FilterBoard.tsx) with the WEEK's change and the terminal's trendline signal
// as columns. Beat 2 lights the board's OWN review pick (its leaders row carries tierScene = this scene) and closes on the
// invitation to it — the leader scene comes right after. A builder of its own, so the daily boards' briefs stay as they were.
const SIGNAL_VI = {has_breakout_confirmed: 'breakout xác nhận', has_breakout_potential: 'breakout tiềm năng', has_breakdown_confirmed: 'breakdown xác nhận', has_breakdown_potential: 'breakdown tiềm năng', has_bullish_rsi: 'RSI tăng', has_bearish_rsi: 'RSI giảm'};
/** "(breakout xác nhận hoặc breakout tiềm năng)" — the saved filter's condition groups, for the brief only. */
const describeGroups = (f) => (f?.groups ?? []).map((g) => `(${(g.conditions ?? []).map((c) => SIGNAL_VI[c.field] ?? `${c.field} ${c.op} ${c.value}`).join(g.match === 'or' ? ' hoặc ' : ' và ')})`).join(' và ');
const OWN_MEANING = {
  breakout: 'breakout = giá vượt trendline giảm (kháng cự xiên) mà terminal tự vẽ trên chart ngày; "xác nhận" = đã vượt, "tiềm năng" = đang áp sát trendline (terminal ghi "đang theo dõi"), chưa vượt',
  breakdown: 'breakdown = giá thủng trendline tăng (hỗ trợ xiên) mà terminal tự vẽ trên chart ngày; "xác nhận" = đã thủng, "tiềm năng" = đang áp sát trendline, chưa thủng',
};
/**
 * A saved filter no stock passed (orchestrator 2026-10-09, the first live weekly: both Momentum filters read 0): a REAL
 * empty filter — count 0 on a cache whose universe carries the terminal's signal flags — is drawn as an EMPTY board (one
 * beat, the state plate and the definition card, ~minWordsPerScene words). A cache with no signal flag on ANY row
 * (facts.mjs `universeSignals` 0 — the 9/10 cache after the terminal's outage: the flags were not computed) is missing
 * data, not an empty filter: the board is dropped with the reason, and the scene before it hands over to what follows.
 */
const ownBoardEmpty = (S) => !!S && !S.top?.length && S.count === 0 && S.universeSignals !== 0;
const ownBoardBuilt = (scene) => !!(F.screener[scene]?.top?.length || ownBoardEmpty(F.screener[scene]));
const EMPTY_BOARD_WORDS = R.narration.minWordsPerScene ?? 18;
const buildEmptyBoard = (scene, S) => {
  const opensPicks = scene === picksAfter;
  const f = savedFilter(S.filter);
  const table = boardOf({scene, F, R, roles: fmt.roles, saved: f, ...(opensPicks ? {feeds: pickTotal() > 0} : {})});
  const kind = S.signalKind;
  const invites = opensPicks && pickTotal() > 0;
  const at = fmt.roles.indexOf(scene);
  const prevEmpty = fmt.roles.slice(0, at).some((r) => fmt.screener?.scenes?.[r] && ownBoardEmpty(F.screener[r]));
  const nextBoard = fmt.roles.slice(at + 1).find((r) => fmt.screener?.scenes?.[r] && ownBoardBuilt(r));
  const say = kind === 'breakdown'
    ? `Chốt tuần, không mã mạnh nào đang gãy trendline tăng: bộ lọc ${S.filter} trống.`
    : `Bộ lọc ${S.filter} ${prevEmpty ? 'cũng ' : ''}trống: chưa mã nào vượt trendline giảm.`;
  const closer = invites ? 'Cùng mình xem kỹ …' : nextBoard ? 'Còn chiều ngược lại?' : (fmt.watch?.bridge ?? 'Vậy tuần tới canh gì?');
  push(scene, {
    beats: todoBeats(1),
    visual: table.visual,
    words: EMPTY_BOARD_WORDS,
    brief: [
      `Bộ lọc "${S.filter}" của terminal (${[describeFilter(f), describeGroups(f)].filter(Boolean).join(' · ') || 'điều kiện đã lưu'}): 0 mã ở phiên ${F.session.dm} — bảng TRỐNG (orchestrator 2026-10-09: giữ scene, không bỏ). Terminal không giữ lịch sử: đây là bộ lọc của PHIÊN CUỐI TUẦN, không phải của cả tuần — KHÔNG nói "cả tuần / tuần này không có mã nào". ${table.beatLine}`,
      `Nghĩa của bộ lọc, nói như trader: cổ phiếu đang có sức mạnh giá và ${OWN_MEANING[kind] ?? 'tín hiệu đã lưu'}.`,
      `LỜI — ~${EMPTY_BOARD_WORDS} chữ (sàn của verify), hai câu, MỘT beat: "${say} ${closer}" — bảng trống là thông tin (không mã mạnh nào đang ${kind === 'breakdown' ? 'gãy' : 'vượt'} trendline), KHÔNG gọi tên mã nào, KHÔNG "mua"/"bán", không giải thích vì sao trống. Gọi đúng tên bộ lọc (tên trader của terminal, lexicon đọc). Số đếm đọc bằng chữ.`,
      NO_OVERLAP,
      invites ? countdownBrief(1, scene, false) : `Câu CUỐI trao lời, không mang mã: "${closer}"${nextBoard ? '' : ' — câu dẫn sang kế hoạch tuần tới (scene watch)'}.`,
    ],
  });
};
const buildOwnBoard = (scene) => {
  const S = F.screener[scene];
  if (ownBoardEmpty(S)) return buildEmptyBoard(scene, S);
  if (!S?.top?.length) {
    console.log(`  ${scene}: dropped — ${!S ? `${FACTS} has no screener.${scene} (pull.mjs pulls rules.formats.${FORMAT}.screener.scenes since 2026-10-06, then facts.mjs)` : S.universeSignals === 0 ? `"${S.filter}" reads 0, but the terminal's ${date} cache carries no signal flag on ANY of its rows (has_breakout_* / has_breakdown_* / RSI all false) — the flags were not computed, this is missing data, not an empty filter. pull.mjs again once the terminal recomputes, then facts.mjs and scaffold.mjs` : `no stock passed "${S.filter}" this session`}`);
    return;
  }
  // The board the requested picks follow (no leader role — the weekly since 2026-10-09) closes on the invitation to them.
  const opensPicks = scene === picksAfter;
  const f = savedFilter(S.filter);
  const table = boardOf({scene, F, R, roles: fmt.roles, saved: f, ...(opensPicks ? {feeds: pickTotal() > 0} : {})});
  const kind = S.signalKind;
  const rs1mMin = (f?.conditions ?? []).find((c) => c.field === 'rs_1m')?.value;
  const others = Object.keys(fmt.screener?.scenes ?? {}).filter((k) => k !== scene).map((k) => F.screener[k]?.filter).filter(Boolean);
  const shared = S.top.filter((x) => (x.filters ?? []).some((n) => others.includes(n))).map((x) => x.symbol);
  // The board opens a review when a leader role follows it and its own pick gets that scene (the leader loop's test).
  const feeds = opensPicks ? pickTotal() > 0 : fmt.roles[fmt.roles.indexOf(scene) + 1] === 'leader' && (tierOrder ? tierPicks.some((x) => x.tierScene === scene) : table.focus.length > 0);
  // Beat 2 rides the middle sentence (what the list is for — the plate's beat) of the three (F4, 2026-10-09); only the
  // invitation to picks lit on this board pins it to the last sentence (lib/board.mjs beatLine, ownVoice).
  const pinsInvite = opensPicks && feeds && table.focus.length > 0;
  push(scene, {
    beats: todoBeats(table.beats).map((b, k) => (k === 1 && !pinsInvite ? {...b, atSentence: 1} : b)),
    visual: table.visual,
    brief: [
      `Bộ lọc "${S.filter}" của terminal (${[describeFilter(f), describeGroups(f)].filter(Boolean).join(' · ') || 'điều kiện đã lưu'}): ${S.count} mã — ${S.confirmed} ${kind ?? ''} xác nhận, ${S.potential} tiềm năng; tuần này (từ thứ Hai ${S.weekOf ? S.weekOf.slice(8, 10).replace(/^0/, '') + '/' + Number(S.weekOf.slice(5, 7)) : '—'}) ${S.weekUp} mã tăng, ${S.weekDown} mã giảm. Bảng vẽ ${table.visual.rows.length} mã xếp theo RS 1M giảm dần, mỗi dòng: ${table.visual.columns.map((c) => ({...BOARD_COLUMN_VI, weekChange: '% tuần', signal: 'tín hiệu (xác nhận / tiềm năng)', rs3m: 'RS 3M'})[c] ?? c).join(' · ')} — ${table.rowLines.join('; ')}. ${table.beatLine}`,
      `Nghĩa của bộ lọc, nói như trader: cổ phiếu đang có sức mạnh giá (RS 1M từ ${rs1mMin ?? '—'}, RS 3M và RS 52W từ 70, thanh khoản trung bình hai mươi phiên từ một triệu cổ phiếu) và ${OWN_MEANING[kind] ?? 'tín hiệu đã lưu'}.${kind === 'breakdown' ? ' Đây là danh sách CẢNH BÁO: mã đang mạnh mà gãy hoặc sắp gãy hỗ trợ — nói là phải canh rủi ro, KHÔNG phải lời khuyên bán.' : ' Đây là danh sách để THEO DÕI, không phải lời khuyên mua.'}`,
      ownVoice(scene, S, kind, opensPicks && pickTotal() > 0 && table.focus.length > 0),
      `${NO_OVERLAP}${shared.length ? ` (Chỉ cho đạo diễn, KHÔNG lên lời: ${shared.join(', ')} cũng qua bộ lọc ${others.join(' / ')} — không nói ra, không gọi tên bộ lọc kia trong câu có mã.)` : ''}`,
      opensPicks && !feeds
        // No pick (2026-10-09): the last board bridges to next week's plan with the watch scene's own question.
        ? `Bản này KHÔNG có scene soi mã sau bảng này: KHÔNG mời "xem kỹ" mã nào. Câu CUỐI là câu dẫn sang kế hoạch tuần tới (scene watch "Kịch bản VN-Index"), không mang mã: "${fmt.watch?.bridge ?? 'Vậy tuần tới canh gì?'}" — không nói vì sao không soi mã.`
        : opensPicks
        // The user's own picks (2026-10-09: "i will select the symbol to review with weekly not follow by the filter value
        // and rule"): the invitation names them all, on this board or not.
        ? `${countdownBrief(table.beats, scene, pinsInvite)}${feeds ? ' Bản tuần: mã soi là mã NGƯỜI DÙNG chọn trên trang duyệt (người dùng 2026-10-09: "i will select the symbol to review with weekly not follow by the filter value and rule"), không theo bộ lọc hay luật — lời mời gọi đúng các mã đó, cả mã không có trên bảng này; KHÔNG nói vì sao chọn, không "bạn chọn" / "theo yêu cầu".' : ''}`
        : feeds
        ? `${countdownBrief(table.beats, scene)} Bản tuần: mỗi bộ lọc MỘT mã soi (người dùng chọn "Top of each filter") — lời mời CHỈ gọi mã của bảng này, KHÔNG gọi mã soi của bảng Momentum kia.`
        : `Bảng này không mở scene soi mã: KHÔNG mời "xem kỹ" mã nào. Câu cuối trao lời sang scene sau (${fmt.roles[fmt.roles.indexOf(scene) + 1] ?? '—'}), không mang mã${F.screener[fmt.roles[fmt.roles.indexOf(scene) + 1]]?.signalKind === 'breakout' ? ': "Còn chiều ngược lại?"' : ''}.`,
    ],
  });
};
/**
 * The weekly's watchlist (user 2026-10-18: "Also include the RS strong to this video, combine it with the moment
 * breakout/breakdown, Uptrend filter, and give me 10 of symbol raking by the RS1M sorting DESC … If the symbol have many fiter
 * listing it on the table for me. The table be using for select the stock to review and need notice and monitor for the next
 * week scene without each filter scene (reduce annoy from all filter scene)"): ONE board in place of the two Momentum boards —
 * the top ten by RS 1M (ties RS 3M) of every name RS Strong, Uptrend, Momentum breakout or Momentum breakdown found, a chip
 * per filter that found it. The picks the user types on the review page play right after it, and it invites them; with none
 * it bridges to next week's plan.
 */
const buildWatchlist = (scene) => {
  const S = F.screener[scene];
  const spec = fmt.screener.scenes[scene];
  if (!S?.top?.length) {
    console.log(`  ${scene}: dropped — ${FACTS} has no screener.${scene} rows (pull.mjs — or pull.mjs --rebuild for a session already pulled — then facts.mjs)`);
    return;
  }
  const opensPicks = scene === picksAfter;
  const feeds = opensPicks && pickTotal() > 0;
  // The picks list right after it (2026-10-18 evening) shows the picks: this table lights none and ends on the user's
  // sentence (rules.formats.<format>.watchlist.invite).
  const toList = fmt.roles[fmt.roles.indexOf(scene) + 1] === 'picklist' && (F.screener?.picklist?.rows?.length ?? 0) > 0;
  const listInvite = toList ? fmt.watchlist?.invite ?? die(`rules.formats.${FORMAT}.watchlist.invite is not set — the sentence the table ends on before the picks list (user 2026-10-18)`) : null;
  const table = boardOf({scene, F, R, roles: fmt.roles, saved: null, noFocus: toList, ...(opensPicks ? {feeds} : {})});
  const pinsInvite = feeds && table.focus.length > 0;
  const rows = table.visual.rows;
  const base = spec.base ?? null;
  const also = rows.filter((x) => (x.filters ?? []).length > 1);
  const many = also.map((x) => `${x.symbol} (${x.filters.join(' + ')})`);
  const warn = rows.filter((x) => (x.filters ?? []).includes('Momentum breakdown')).map((x) => x.symbol);
  const st = stateOf(F, R);
  const words = wordsOf(scene);
  const n = S.count;
  // A scrolling board turns a page per beat (lib/board.mjs pagesOf), each page on its own sentence so it stays ~3 s on
  // screen: (0) what the table is · the middle sentences — the breakdown chips' warning, then the base filter's own names,
  // then any sentence a long list still needs · "Cứ theo dõi, chưa phải lúc hành động." on the last page · the bridge or
  // the invitation (the picks' beat). 19 rows = 2 pages: sentences 0 and 2, the warning between them unpinned, as before.
  const pages = table.pages?.length ?? 1;
  const mids = table.scrolls ? Math.max(pages - 2, warn.length ? 1 : 0) : 0;
  const midSay = [
    ...(warn.length ? ['"Mã có chip breakdown đang gãy hoặc sắp gãy trendline tăng, cần canh rủi ro."'] : []),
    `các mã chỉ có ${base ?? 'một bộ lọc'}, KHÔNG gọi mã, không số (mẫu: "Phần còn lại chỉ có ${base ?? 'một bộ lọc'}, cũng xếp từ mạnh đến yếu.")`,
    ...Array.from({length: Math.max(0, mids - 2)}, () => 'một câu nữa về danh sách, không mã, không số, đủ ~3 giây cho trang của nó'),
  ].slice(0, mids);
  const pagePins = table.scrolls ? [0, ...Array.from({length: pages - 2}, (_, k) => k + 1), mids + 1] : [];
  if (S.count > rows.length) console.log(`  ${scene}: ${S.count} names, the board holds ${rows.length} (rules.formats.${FORMAT}.screener.scenes.${scene}.top / lib/board.mjs BOARD_SCROLL_ROWS) — the caption counts ${S.count}`);
  push(scene, {
    eyebrow: 'Bảng theo dõi tuần tới',
    beats: table.scrolls
      ? todoBeats(table.beats).map((b, k) => ({...b, atSentence: k < pages ? pagePins[k] : mids + 2}))
      : todoBeats(table.beats).map((b, k) => (k === 1 && !pinsInvite ? {...b, atSentence: 1} : b)),
    visual: table.visual,
    brief: [
      base
        ? `BẢNG THEO DÕI TUẦN TỚI — THAY hai bảng Momentum. Người dùng 2026-10-18 tối: "setting the RS1M strong of the RS strong filter to base and expand the list of symbol? Not limit to 10 symbol on the stock list to monitor? Just piority the stock have RS strong and another filter also find it at first?" — GỐC là bộ lọc ${base}: CẢ ${n} mã của nó, không cắt ở mười; mã được bộ lọc khác (${spec.filters.filter((f) => f !== base).join(', ')}) cùng tìm ra xếp TRƯỚC (${also.length} mã), rồi các mã chỉ có ${base}; mỗi nhóm xếp RS 1M giảm dần (bằng RS 1M thì RS 3M). Mỗi dòng: % tuần · RS 1M (số + thanh) · MỘT CHIP cho mỗi bộ lọc đã tìm ra mã (RS STRONG, UPTREND, BREAKOUT xanh, BREAKDOWN đỏ). Mười dòng một trang${table.scrolls ? `, ${pages} trang, mỗi beat một trang` : ''}. ${table.rowLines.join('; ')}.`
        : `BẢNG THEO DÕI TUẦN TỚI — THAY hai bảng Momentum (người dùng 2026-10-18): ${n} mã qua ít nhất một trong bốn bộ lọc; bảng in mười mã RS 1M cao nhất, mỗi dòng một chip cho mỗi bộ lọc đã tìm ra mã. ${table.rowLines.join('; ')}.`,
      `Mã có thêm bộ lọc (bảng TỰ in chip — lời không đọc lại): ${many.join('; ') || 'không'}. Chip BREAKDOWN: ${warn.join(', ') || 'không mã nào'} — mã mạnh đang gãy hoặc sắp gãy trendline tăng, phải canh rủi ro, KHÔNG phải lời khuyên bán.`,
      table.beatLine,
      table.scrolls
        ? `LỜI — khoảng ${words} chữ (trần ${fmt.watchlist?.maxWords ?? R.narration.maxWordsPerScene}), ${mids + 3} câu, MỖI TRANG MỘT CÂU (bảng ${pages} trang), tối đa MỘT số đọc ra lời (số mã): (1) trang 1 — bảng là gì: "<${n}> mã của bộ lọc ${base}, mã có thêm bộ lọc khác xếp trước." (<…> đọc thành chữ)${midSay.map((x, k) => `; (${k + 2}) ${k < pages - 2 ? `trang ${k + 2} — ` : 'không ghim trang — '}${x}`).join('')}; (${mids + 2}) trang ${pages} — "Cứ theo dõi, chưa phải lúc hành động." (thị trường đang ${st.value}); (${mids + 3}) ${toList ? `câu trao sang bảng "Mã đáng chú ý tuần sau", ĐÚNG TỪNG CHỮ người dùng chốt (2026-10-18: "Edit … to Cung minh review nhung ma dang chu y cho tuan sau nhe"; rules.formats.${FORMAT}.watchlist.invite): "${listInvite}" — không gọi mã nào, không ghim beat; "review" giữ nguyên (lexicon đọc "ri viu")` : feeds ? `LỜI MỜI — ${countdownBrief(table.beats, scene, pinsInvite)}` : `câu dẫn sang kế hoạch tuần tới, đúng chữ: "${WATCH_BRIDGE}" — không mời "xem kỹ" mã nào, không nói vì sao không soi mã`}. Ghim: ${pagePins.map((x, k) => `beat ${k + 1} → câu ${x + 1}`).join(', ')}${feeds && table.focus.length ? `, beat ${pages + 1} → câu ${mids + 3}` : ''}.`
        : `LỜI — khoảng ${words} chữ (trần ${fmt.watchlist?.maxWords ?? R.narration.maxWordsPerScene}), BỐN câu, tối đa MỘT số đọc ra lời (số mã): (1) beat 1 — bảng là gì: ${base ? `${n} mã của bộ lọc ${base}, mã có thêm bộ lọc khác xếp trước` : 'mười mã RS một tháng cao nhất của bốn bộ lọc'} (mẫu: "${base ? `<${n}> mã của bộ lọc ${base}, mã có thêm bộ lọc khác xếp trước.` : 'Mười mã RS một tháng cao nhất của bốn bộ lọc, đứng đầu là MSR.'}" — <…> đọc thành chữ); (2) ${warn.length ? '"Mã có chip breakdown đang gãy hoặc sắp gãy trendline tăng, cần canh rủi ro."' : 'chip cho biết bộ lọc nào đã tìm ra mã'}; (3) ${table.scrolls ? 'beat 2 ghim vào câu này, khi bảng cuộn tới phần còn lại — ' : 'beat 2 ghim vào câu này (atSentence 1 nếu chỉ còn ba câu) — '}"Cứ theo dõi, chưa phải lúc hành động." (thị trường đang ${st.value}); (4) ${feeds ? `LỜI MỜI — ${countdownBrief(table.beats, scene, pinsInvite)}` : `câu dẫn sang kế hoạch tuần tới, đúng chữ: "${WATCH_BRIDGE}" — không mời "xem kỹ" mã nào, không nói vì sao không soi mã`}.`,
      `${NO_OVERLAP} Riêng bảng này: tên bộ lọc chỉ đọc trong câu không mang mã nào (câu 1${table.scrolls && mids >= 2 ? `, câu về các mã chỉ có ${base}` : ''}); câu có mã không gọi bộ lọc của chính mã đó (bảng đã in chip) — không "MSB có ba chip", không "vừa RS Strong vừa breakdown". Không "mua", "bán", "cơ hội", không giá mục tiêu. Bản TUẦN: "tuần này", "tuần tới", không "hôm nay".`,
    ],
  });
};

/**
 * The daily's "Mã cần chú ý trong các phiên tới" (role shortlist — user 2026-10-19: "Only keep the volume spike screen, with
 * 2 scressn of RS strong and Uptend, combine it to one scene piority the RS strong 1M sort DESC and both existed on 2 filter.
 * And naming this screen like Ma can chu y trong các phien toi", then "Remove 2 old screen about the RS strong and Uptrend"):
 * ONE board in place of the RS Strong and Uptrend boards — every name either filter found, the names both found first, RS 1M
 * descending inside each group, a chip per filter, a page of ten per beat. It opens the symbol reviews: the names reviewed
 * next light on the last beat, and the scene closes on the invitation (or, none, the bridge to the VN-Index scenario).
 */
const buildShortlist = (scene) => {
  const S = F.screener[scene];
  const spec = fmt.screener.scenes[scene];
  if (!S?.top?.length) {
    console.log(`  ${scene}: dropped — ${FACTS} has no screener.${scene} rows (pull.mjs — or pull.mjs --rebuild for a session already pulled — then facts.mjs)`);
    return;
  }
  const table = boardOf({scene, F, R, roles: fmt.roles, saved: null});
  const rows = table.visual.rows;
  const both = rows.filter((x) => (x.filters ?? []).length > 1);
  const one = rows.filter((x) => (x.filters ?? []).length <= 1);
  const st = stateOf(F, R);
  const pages = table.pages?.length ?? 1;
  const focusBeat = table.focus.length > 0;
  // The names the user's own sentence calls (requests `spotlight`, user 2026-10-21: "… các cổ phiếu mạnh đầu ngành đã phân
  // tích (VPB, HDB) vẫn đang đứng im"): lit on a beat of their own on the first page, right after the table is introduced
  // (`set: 'spot'` until the next beat, FilterBoard.tsx); from the next page on the board reads as before.
  const spotWant = spotOf(scene);
  const spot = spotWant.filter((sym) => { const i = rows.findIndex((x) => x.symbol === sym); return i >= 0 && i < BOARD_VIEW_ROWS; });
  if (spotWant.length > spot.length) console.log(`  ${scene}: spotlight ${spotWant.filter((x) => !spot.includes(x)).join(', ')} not on the board's first page — not lit`);
  const extra = spot.length ? 1 : 0;
  if (extra) {
    const spotRows = rows.filter((x) => spot.includes(x.symbol));
    const flat = spotRows.every((x) => x.changePercent === 0);
    table.visual.rows = rows.map((x) => (spot.includes(x.symbol) ? {...x, spot: true} : x));
    table.visual.emphasis = [
      {beat: 1, set: 'spot', until: 2, dim: true, label: `${flat ? 'Đứng giá' : 'Mã mạnh'}: ${spot.join(' · ')}`},
      ...(table.visual.emphasis ?? []).map((e) => ({...e, beat: e.beat + 1})),
    ];
    if (table.visual.scroll) table.visual.scroll = table.visual.scroll.map((x) => ({...x, beat: x.beat + 1}));
  }
  // A sentence per page (each page ~3 s on screen), then the invitation on the focus beat: (1) what the table is · the middle
  // pages · "Cứ theo dõi, chưa phải lúc hành động." on the last page · the invitation (or the bridge). A spotlight adds its
  // sentence right after (1), on the first page.
  const n0 = table.scrolls ? pages + 1 : 3;
  const n = n0 + extra;
  const pins0 = table.scrolls
    ? [...Array.from({length: pages}, (_, k) => k), ...(focusBeat ? [pages] : [])]
    : [0, ...(table.beats > 1 ? [n0 - 1] : [])];
  const pins = extra ? [0, 1, ...pins0.slice(1).map((x) => x + 1)] : pins0;
  const mids = table.scrolls ? pages - 2 : 0;
  // How the board's own % column reads against the index (the user's sentence says the strong names stand still).
  const idx = F.session.changePercent;
  const lag = rows.filter((x) => x.changePercent < idx).length;
  const midSay = Array.from({length: mids}, (_, k) => (k === 0
    ? `các mã chỉ MỘT bộ lọc tìm ra, KHÔNG gọi mã, không số (mẫu: "Phần còn lại chỉ có một bộ lọc, cũng xếp từ mạnh đến yếu.")`
    : `một câu nữa về danh sách, không mã, không số, đủ ~3 giây cho trang của nó (ví dụ một nhận xét từ cột % hôm nay${extra ? ` — khớp câu của người dùng: ${lag}/${rows.length} mã trên bảng tăng ít hơn chỉ số (${fmtPct(idx)}) hoặc giảm` : ''})`));
  const spotSay = extra
    ? `trang 1, beat 2 — ${spot.join(' và ')} sáng lên, các dòng khác mờ: MỘT câu ngắn gọi đúng ${spot.length > 1 ? 'các mã đó, tách bằng "và"' : 'mã đó'} và điều bảng in cạnh chúng (${rows.filter((x) => spot.includes(x.symbol)).map((x) => `${x.symbol} ${fmtPct(x.changePercent)}`).join(', ')}${rows.filter((x) => spot.includes(x.symbol)).every((x) => x.changePercent === 0) ? ' → "đứng giá"' : ''}), nối ý với câu của người dùng${sayOf('flow') ? ' ở scene 02' : ''} — mã mạnh đầu ngành đứng im trong phiên chỉ số tăng — KHÔNG lặp nguyên câu đó, không số; headline beat 2 mang số % của hai dòng (pack)`
    : null;
  const feeds = fmt.roles[fmt.roles.indexOf(scene) + 1] === 'leader';
  if (S.count > rows.length) console.log(`  ${scene}: ${S.count} names, the board holds ${rows.length} (rules.formats.${FORMAT}.screener.scenes.${scene}.top / lib/board.mjs BOARD_SCROLL_ROWS) — the caption counts ${S.count}`);
  push(scene, {
    eyebrow: spec.photo,
    beats: todoBeats(table.beats + extra).map((b, k) => ({...b, atSentence: pins[k] ?? n - 1})),
    visual: table.visual,
    brief: [
      `${spec.photo.toUpperCase()} — THAY hai bảng RS Strong và Uptrend (người dùng 2026-10-19: "combine it to one scene piority the RS strong 1M sort DESC and both existed on 2 filter", rồi "Remove 2 old screen about the RS strong and Uptrend"): ${S.count} mã mà bộ lọc ${spec.filters.join(' hoặc ')} tìm ra (${(S.sources ?? []).map((x) => `${x.filter} ${x.count ?? '?'}`).join(', ')}); ${both.length} mã CẢ HAI bộ lọc cùng tìm ra xếp TRƯỚC, rồi ${one.length} mã chỉ một bộ lọc; mỗi nhóm xếp RS 1M giảm dần (bằng RS 1M thì RS 3M). Mỗi dòng: % hôm nay · RS 1M (số + thanh) · MỘT CHIP cho mỗi bộ lọc đã tìm ra mã (RS STRONG, UPTREND). Mười dòng một trang${table.scrolls ? `, ${pages} trang, mỗi beat một trang` : ''}. ${table.rowLines.join('; ')}.`,
      extra ? `${table.beatLine} SPOTLIGHT (requests \`spotlight\`, 2026-10-21): beat 2 ở lại trang 1, ${spot.join(' và ')} sáng lên (băng vàng, viền, kính lúp), các dòng khác mờ, plate "${table.visual.emphasis[0].label}" thay caption; beat 3 bảng cuộn sang trang 2 và hai dòng đó tắt — các beat sau lùi một.` : table.beatLine,
      `LỜI — khoảng ${wordsOf(scene)} chữ (trần ${fmt[scene]?.maxWords ?? R.narration.maxWordsPerScene}), ${n} câu, ${table.scrolls ? 'MỖI TRANG MỘT CÂU, ' : ''}tối đa MỘT số đọc ra lời (số mã): (1) ${table.scrolls ? 'trang 1 — ' : ''}bảng là gì: "<${S.count}> mã cần chú ý trong các phiên tới, mã có ở hai bộ lọc xếp trước." (<…> đọc thành chữ; câu KHÔNG mang mã)${spotSay ? `; (2) ${spotSay}` : ''}${midSay.map((x, k) => `; (${k + 2 + extra}) trang ${k + 2} — ${x}`).join('')}; (${n - 1}) ${table.scrolls ? `trang ${pages} — ` : ''}"Cứ theo dõi, chưa phải lúc hành động." (thị trường đang ${st.value}); (${n}) ${feeds ? 'LỜI MỜI (dòng "Bảng này MỞ PHẦN SOI MÃ" dưới đây)' : `câu dẫn sang kịch bản VN-Index: "${WATCH_BRIDGE}"`}. Ghim: ${pins.map((x, k) => `beat ${k + 1} → câu ${x + 1}`).join(', ')}.${extra ? ` Câu nhiều hơn khuôn sáu câu (verify chỉ WARN), trần chữ vẫn ${fmt[scene]?.maxWords ?? R.narration.maxWordsPerScene}: câu nào cũng ngắn.` : ''}`,
      feeds ? countdownBrief(table.beats, scene) : `Không scene soi mã nào theo sau bảng này: KHÔNG mời "xem kỹ" mã nào; câu cuối dẫn sang kịch bản VN-Index ("${WATCH_BRIDGE}").`,
      `${NO_OVERLAP} Riêng bảng này: tên bộ lọc chỉ đọc trong câu KHÔNG mang mã nào (câu 1, câu về các mã chỉ có một bộ lọc) và KHÔNG "cả hai bộ lọc" (nói "mã có ở hai bộ lọc"); câu có mã không gọi bộ lọc của chính mã đó (bảng đã in chip). KHÔNG giải thích điều kiện của bộ lọc (người dùng 2026-10-12). Không "mua", "bán", "cơ hội", không giá mục tiêu. Gọi đúng tên "RS Strong", "Uptrend" (người dùng 2026-10-01: "keep the RS strong verb").`,
    ],
  });
};

/**
 * The weekly's "Mã đáng chú ý tuần sau" (role picklist — user 2026-10-18 evening: "Also have scene for all my picked stock and
 * its filter, also include the price must be monitor and notice"): ONE board of every pick (facts screener.picklist) — price,
 * the filter chips, the price to watch above (VƯỢT) and the one to watch below (THỦNG), both from the name's symbol review;
 * beat 2 lights the names whose chart reviews play right after it.
 */
const buildPicklist = () => {
  const P = F.screener?.picklist;
  if (!P?.rows?.length) {
    console.log(`  picklist: dropped — ${FACTS} has no screener.picklist (content/review/requests/${date}-${FORMAT}.json lists no pick; facts.mjs)`);
    return;
  }
  const spec = fmt.picklist ?? {};
  const reviewed = (F.screener.requested ?? []).filter(pickHasPhoto).map((x) => x.symbol);
  const lit = P.rows.filter((x) => reviewed.includes(x.symbol)).map((x) => x.symbol);
  const label = `${R.screener.board?.picksLabel ?? 'Xem kỹ'}: ${lit.join(' · ')}`;
  const st = stateOf(F, R);
  const rows = P.rows.map((x) => ({
    symbol: x.symbol, price: x.price, changePercent: x.changePercent, rs1m: x.rs1m, filters: x.filters ?? [],
    ...(x.watchUp != null ? {watchUp: x.watchUp} : {}), ...(x.watchDown != null ? {watchDown: x.watchDown} : {}),
    ...(lit.includes(x.symbol) ? {focus: true} : {}),
  }));
  const n = rows.length;
  const say = (k) => NUM_VI[k] ? NUM_VI[k].charAt(0).toUpperCase() + NUM_VI[k].slice(1) : String(k);
  const noPrice = P.rows.filter((x) => x.watchUp == null || x.watchDown == null).map((x) => x.symbol);
  push('picklist', {
    eyebrow: 'Mã đáng chú ý tuần sau',
    beats: todoBeats(lit.length ? 2 : 1).map((b, i) => (i === 1 ? {...b, atSentence: 2} : b)),
    visual: {
      type: 'board',
      caption: (spec.caption ?? 'MÃ ĐÁNG CHÚ Ý · {n} MÃ').replaceAll('{n}', String(n)),
      columns: ['price', 'filters', 'watchUp', 'watchDown'],
      rows,
      ...(lit.length ? {emphasis: [{beat: 1, set: 'focus', dim: true, label}]} : {}),
      notes: {state: {label: 'Thị trường', value: st.value, list: spec.list ?? 'mã đáng chú ý tuần sau', accent: st.accent}, beat: 0},
    },
    brief: [
      `MÃ ĐÁNG CHÚ Ý TUẦN SAU (người dùng 2026-10-18 tối: "Also have scene for all my picked stock and its filter, also include the price must be monitor and notice"): bảng ${n} mã người dùng chọn — mỗi dòng: giá đóng cửa ${F.session?.dm ?? date} · chip bộ lọc đã tìm ra mã · VƯỢT (giá cần theo dõi: nhánh "nếu đóng cửa vượt …" đầu tiên của bản soi) · THỦNG (giá cần lưu ý: nhánh "nếu đóng cửa dưới …" đầu tiên). ${P.rows.map((x) => `${x.symbol}: giá ${vi(x.price)}, ${(x.filters ?? []).join(' + ') || 'không bộ lọc'}, vượt ${x.watchUp != null ? vi(x.watchUp) : '—'}, thủng ${x.watchDown != null ? vi(x.watchDown) : '—'}${x.reviewed ? ' (soi chart ngay sau)' : ' (chỉ trong danh sách)'}`).join('; ')}.${noPrice.length ? ` ${noPrice.join(', ')} chưa có bản soi hợp lệ — dòng không có giá.` : ''}`,
      `Beat 1 = bảng hiện dần từ trên xuống, plate "Thị trường: ${st.value} · ${spec.list ?? 'mã đáng chú ý tuần sau'}" dưới các dòng.${lit.length ? ` Beat 2 = ${lit.join(', ')} sáng lên (nền vàng, viền, kính lúp), các dòng khác mờ, nhãn "${label}" thay caption — đó là các mã soi chart ngay sau, theo đúng thứ tự đó.` : ''}`,
      `LỜI — khoảng ${wordsOf('picklist')} chữ (trần ${spec.maxWords ?? R.narration.maxWordsPerScene}), BA câu, tối đa ${spec.maxSpokenNumbers ?? 2} số đọc ra lời: (1) beat 1 — danh sách là gì: "<${n}> mã đáng chú ý cho tuần sau, mỗi mã kèm bộ lọc đã tìm ra nó." (<…> đọc thành chữ: "${say(n)}"); (2) hai cột giá nghĩa là gì, nói như trader, không đọc giá nào (bảng đã in): "Đóng cửa vượt giá theo dõi là mạnh lên, thủng giá lưu ý thì phải canh rủi ro."; (3) ${lit.length ? `beat 2 — trao sang các scene soi chart: "<${lit.length}> mã đầu bảng, mình xem kỹ trên chart." (đọc "${say(lit.length)}") — scene soi đầu tiên tự mở "Mã đầu tiên là ${lit[0]}."` : `câu dẫn sang kế hoạch tuần tới, đúng chữ: "${WATCH_BRIDGE}"`}.`,
      `${NO_OVERLAP} Không đọc từng giá, không gọi tên mã (bảng in đủ); KHÔNG "bạn chọn" / "theo yêu cầu"; không "mua", "bán", "cơ hội", không giá mục tiêu. Bản TUẦN: "tuần sau", "tuần tới", không "hôm nay".`,
    ],
  });
};

/**
 * What a Momentum board says (2026-10-09, director + trader-viewer review — the viewer "lost a lot of money" and read a
 * 2-name breakout board as a tip list): breakdown first, one sentence on what the list is and the viewer's safe line in
 * general terms (the system's "rà lại từng mã và rủi ro"); breakout second, how few names and the one that broke out, "theo
 * dõi … chưa phải lúc hành động". The budgets are rules.formats.<format>.<role>.words (wordsOf).
 */
const ownVoice = (scene, S, kind, invites) => {
  const n = S.count;
  const words = wordsOf(scene);
  const common = `Gọi đúng tên bộ lọc: "bộ lọc ${S.filter}" (tên trader của terminal, lexicon đọc — không dịch thành "đà tăng", "động lượng phá vỡ"). Bản TUẦN: "tuần này", không "hôm nay". Số đếm đọc bằng chữ.`;
  if (kind === 'breakdown') {
    return `LỜI — ${words} chữ, hai câu rồi câu trao lời (người xem 2026-10-09 — trader "mất nhiều tiền": bảng là danh sách cảnh báo, không phải danh sách bán): câu 1 nói danh sách này là gì — "${n} mã mạnh đang gãy hoặc sắp gãy trendline tăng"; câu 2 là đường an toàn của NGƯỜI ĐANG CẦM, nói chung, theo chữ của hệ thống ("${R.distribution?.danger?.action ?? 'rà lại từng mã và rủi ro'}"): "Đang cầm mã nào ở đây thì rà lại điểm cắt lỗ." — beat 2 ghim vào câu này (atSentence 1; plate trạng thái + định nghĩa hiện ra); câu 3 "Còn chiều ngược lại?". Cả khuôn ≈ ${words} chữ: "${NUM_VI[n] ? NUM_VI[n].charAt(0).toUpperCase() + NUM_VI[n].slice(1) : n} mã mạnh đang gãy hoặc sắp gãy trendline tăng. Đang cầm mã nào ở đây thì rà lại điểm cắt lỗ. Còn chiều ngược lại?" KHÔNG gọi tên mã nào (bảng đã in mã), KHÔNG chữ "bán", không giá mục tiêu. Câu mẫu dài hơn ngân sách: cắt chữ, không cắt đường an toàn. ${common}`;
  }
  const lead = S.top.find((x) => x.signal === 'confirmed') ?? S.top[0];
  const verb = lead?.signal === 'confirmed' ? 'đã vượt trendline giảm' : 'đang áp sát trendline giảm';
  return `LỜI — ${words} chữ (người xem 2026-10-09: "tôi sẽ chụp màn hình MSB/PVS và mua sáng thứ Hai" — bảng breakout ngắn đọc như danh sách mã để mua): câu 1 "Bộ lọc ${S.filter} ${n <= 5 ? 'chỉ ' : ''}có ${n} mã, ${lead?.symbol ?? '<MÃ>'} ${verb}." (mã ${lead?.signal === 'confirmed' ? 'xác nhận' : 'tiềm năng'} có RS 1M cao nhất, gọi MÃ); câu 2 "Cứ theo dõi, chưa phải lúc hành động."${invites ? ' — rồi lời mời (beat 2 ghim vào lời mời, câu cuối — xem dòng cuối)' : ' — beat 2 ghim vào câu này (atSentence 1; plate trạng thái + định nghĩa hiện ra)'}; câu 3 ${invites ? 'là lời mời' : `"${fmt.watch?.bridge ?? 'Vậy tuần tới canh gì?'}" khi không có mã soi`}. Cả khuôn ≈ ${words} chữ: "Bộ lọc ${S.filter} ${n <= 5 ? 'chỉ ' : ''}có ${NUM_VI[n] ?? n} mã, ${lead?.symbol ?? '<MÃ>'} ${verb}. Cứ theo dõi, chưa phải lúc hành động. ${invites ? 'Cùng mình xem kỹ …' : (fmt.watch?.bridge ?? 'Vậy tuần tới canh gì?')}" KHÔNG "mua", không "cơ hội", không giá mục tiêu; mã nào khác chỉ có trên bảng. Câu mẫu dài hơn ngân sách: cắt chữ, không cắt "chưa phải lúc hành động". ${common}`;
};

// spike (photo fallback), rs and uptrend — the terminal's own tables, ONE saved filter per scene
// (user, 2026-09-30: "separate the filter: Uptrend and RS Strong, not union it first").
const savedFilter = (name) => (tryJson(PATHS.filters)?.filters ?? []).find((f) => f.name === name) ?? null;
const FIELD_VI = {rs_1m: 'RS 1M', rs_3m: 'RS 3M', rs_52w: 'RS 52W', volume_sma20: 'KL TB20', volume_vs_sma: 'KL so TB20', current_price: 'giá', ema_9: 'EMA9', ema_21: 'EMA21', ema_50: 'EMA50', sma_200: 'SMA200'};
const OP_VI = {'>=': '≥', '<=': '≤'};
const valVi = (x) => (typeof x === 'number' && Math.abs(x) >= 1e6 ? `${vi(x / 1e6, 1)}M` : String(x));
/** "RS 1M ≥ 60 · KL TB20 ≥ 1,0M" — the saved filter's conditions, for the brief only (no on-screen number). */
const describeFilter = (f) => (f?.conditions ?? []).map((c) => `${FIELD_VI[c.field] ?? c.field} ${OP_VI[c.op] ?? c.op} ${c.rhs_field ? FIELD_VI[c.rhs_field] ?? c.rhs_field : valVi(c.value)}`).join(' · ');
const buildTable = (scene) => {
  const p = need(photo(scene), scene);
  const t = table(p);
  const S = F.screener[scene] ?? die(`${FACTS} has no screener.${scene} — run node scripts/review/facts.mjs --format=${FORMAT} again`);
  const picks = S.top;
  if (!picks.length) die(`${FACTS}: screener.${scene}.top is empty — pull.mjs ranked no rows for "${S.filter}"`);
  const rows = picks.map((x) => t.rows.find((r) => r.symbol === x.symbol)).filter(Boolean);
  if (rows.length !== picks.length) die(`public/${p.rel}: rows for ${picks.map((x) => x.symbol).join(', ')} not all in the photo — re-shoot`);
  const top = Math.min(...rows.map((r) => r.y));
  const bottom = Math.max(...rows.map((r) => r.y + r.h));
  // Beat 1: the picked rows (a tie on the sort column may put one of them below row 3). Beat 2: the
  // column the scene is about, boxed cell by cell — the numbers stay the terminal's own; one summary
  // plate lies over the table's Columns/Export buttons.
  const spec = R.screener.scenes[scene];
  const focus = R.shots.screener.sortColumn[spec.sortBy];
  const view = tickerView(t, rows, focus);
  const marks = [{kind: 'box', x: clamp(view.crop.x + 0.004), y: clamp(top), w: clamp(view.crop.w - 0.008), h: clamp(bottom - top), accent: 'gold', beat: 0, until: 0}];
  for (const r of rows) {
    const c = r.cells[focus];
    if (c) marks.push({kind: 'box', x: clamp(c.x - 0.004), y: clamp(c.y + 0.002), w: clamp(c.w + 0.008), h: clamp(c.h - 0.004), accent: 'gold', beat: 1});
  }
  const uiRight = t.ui.length ? Math.max(...t.ui.map((u) => u.x + u.w)) : view.crop.x + view.crop.w - 0.02;
  const uiMid = t.ui.length ? t.ui[0].y + t.ui[0].h / 2 : (t.count ? t.count.y + t.count.h / 2 : view.crop.y + 0.05);
  const summary = scene === 'spike'
    ? `Top ${picks.length}: KL ${picks.map(volVs20).join(' · ')}`
    : `${S.count} mã ${S.filter}`;
  marks.push(lab(clamp(uiRight), clamp(uiMid), summary, 'gold', 0, 'end'));
  const cellsMid = rows.map((r) => r.cells[focus]).filter(Boolean);
  const mid = (top + bottom) / 2;
  marks.push(...view.labels);
  const focusVal = (x) => (spec.sortBy === 'volumeRatio' ? `KL ${volVs20(x)}` : `${focus} ${x.rs1m}`);
  // The table right before the leader scenes opens them (countdownBrief).
  const feeds = fmt.roles[fmt.roles.indexOf(scene) + 1] === 'leader';
  const others = Object.entries(R.screener.scenes).filter(([k]) => k !== scene && k !== 'spike').map(([, s]) => s.photo);
  push(scene, {
    beats: todoBeats(2),
    visual: imageOf(p, 'zionle.io.vn', {
      crop: view.crop, masks: view.masks, annotations: marks,
      shots: [{beat: 0, x: clamp(view.crop.x + view.crop.w / 2), y: clamp(view.crop.y + view.crop.h / 2), zoom: 1.0, move: 'push_in'}, view.closeUp(mid)],
    }),
    brief: scene === 'spike'
      ? [
          `Bộ lọc "${S.filter}" của terminal: ${S.count} mã (${S.up} tăng, ${S.down} giảm). Ba mã khối lượng đột biến nhất so với trung bình 20 phiên: ${S.top.map((x) => `${x.symbol} KL ${volVs20(x)} ${fmtPct(x.changePercent)}`).join('; ')}.`,
          'Nói rõ mã nào tăng, mã nào giảm — khối lượng lớn khi giảm là bán ra, không phải mua vào.',
          NO_OVERLAP,
        ]
      : [
          `Bộ lọc "${S.filter}" của terminal (${describeFilter(savedFilter(S.filter)) || 'điều kiện đã lưu'}): ${S.count} mã, hôm nay ${S.up} tăng, ${S.down} giảm${S.ranked != null && S.ranked !== S.count ? `; ${S.count - S.ranked} mã chưa đủ đường trung bình nên không xếp hạng` : ''}. Ba mã đứng đầu theo ${focus}: ${picks.map((x) => `${x.symbol} ${focusVal(x)} ${fmtPct(x.changePercent)}`).join('; ')}. ${NO_OVERLAP}`,
          feeds
            ? `${countdownBrief()} KHÔNG gộp hai bộ lọc thành một bảng trong lời: bảng này vẫn là ${S.filter} một mình.`
            : `Một lát cắt riêng, KHÔNG gộp với ${others.join(' / ') || 'bộ lọc khác'} (người dùng tách mỗi bộ lọc một scene, 2026-09-30): kể bộ lọc này đếm gì và ba mã đầu là MÃ nào — gọi mã, không tên công ty, tách các mã bằng chữ ("AAS và HID, rồi tới DRI"). Chưa soi mã ở đây.`,
          'Ảnh: crop bỏ cột tên công ty; mỗi dòng gắn nhãn MÃ (nhãn của máy, cỡ chữ của bảng), phần tên còn lại che bằng màu nền bảng — người xem thấy mã, không thấy tên (người dùng 2026-10-01).',
        ],
  });
};

// leader — the symbol reviews (no countdown words since the user's 2026-10-01 night note, "Remove 'Đếm ngược từ
// hai' => 'Let's review …'"): eyebrow "Soi mã · <MÃ>", the scene opens "Mã đầu tiên là …" / "Mã thứ hai là …",
// the order unchanged (the weaker RS 1M first, top[0] last). One template, one distinct detail per name. The chart is the pick's own FireAnt DAILY photo
// (user 2026-10-01: the terminal chart's trendline-break arrows "so confused and annoy"; lib/leader-fireant.mjs), its
// marks referring to the MA50/MA200 FireAnt draws ("refer it not need self-calculation" — values read off the photo by
// fireant_ma.py, carried in the pack as leaders.top[i].fireant). The terminal photo is the fallback when FireAnt could
// not be shot. A symbol review (.claude/agents/symbol-reviewer.md → content/review/symbols/<date>/<SYM>.json) decides
// the marks and the detail when there is one.
// Up to four leader scenes since 2026-10-06 (user: "… the number i want is 4").
const ORD_VI = ['', 'Mã đầu tiên', 'Mã thứ hai', 'Mã thứ ba', 'Mã thứ tư'];
/** Opens the leader brief's template line when the reel has ONE leader scene (no sibling to match); asPick drops it. */
const LONE_LEADER = 'Scene soi mã duy nhất từ bộ lọc hôm nay';
/** The opener when the whole reel has ONE symbol review (one leader and no pick, or one pick and no leader): "Mã đầu
 * tiên" would promise a second name that never comes. */
const LONE_REVIEW = FORMAT === 'weekly' ? 'Mã đáng chú ý tuần này' : 'Mã đáng chú ý hôm nay';
/** The requested names that get a pick scene (a photo); with the leader scenes they are the reel's symbol reviews. */
const pickTotal = () => (F.screener.requested ?? []).filter(pickHasPhoto).length;
/** The opener of leader scene `rank` (rank 1 = top[0], played last): "Mã đầu tiên" / "Mã thứ hai", or LONE_REVIEW. */
const ordOf = (rank) => (leaderTotal + sectorTotal + pickTotal() === 1 ? LONE_REVIEW : ORD_VI[leaderTotal - rank + 1] ?? 'Mã tiếp theo');
/** Why the name was picked (its filters, its tier) is the director's, never the speech's (user 2026-10-05: "Not need
 * mentioned the stock on specific filter existed on other filter"): the brief keeps it as context only. */
const leaderNoFilters = (L, ord = ORD_VI[1]) => `(Chỉ cho đạo diễn, KHÔNG lên lời: qua bộ lọc hôm nay ${(L.filters ?? []).join(' · ') || '—'}${L.tier != null ? `, tầng ${L.tier} của phần soi mã` : ''}.) Scene KHÔNG nói mã này có ở bộ lọc nào, không "cả ba / cả hai bộ lọc", không "cũng ở …", không nhắc bảng của scene trước (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter"; verify \`review-overlap\` FAIL) — câu đầu gọi thứ tự và mã ("${ord} là ${L.symbol}.") rồi vào price action.`;
/** A volume detail written for leaders still says "vừa đột biến khối lượng vừa dẫn dắt" (lib/leader-fireant.mjs) — filter talk. */
const noLeaderTag = (detail) => String(detail ?? '').replace(/ — mã vừa đột biến khối lượng vừa dẫn dắt/g, '');
// A name the user asked for on the review page (user 2026-10-05: "… i can choose and fill the symbol on the artifact to
// review beside existed symbol on 3 filter"; screener.requested) is built like a leader and pushed as a `pick` scene:
// the leader brief's ordinal line gives way to the pick's own (built with rank 0).
const asPick = (brief, L, n) => [
  L.sectorLeader ? sectorLeaderLine(L) : `SOI THÊM — mã thứ ${n - sectorTotal} người dùng chọn trên trang duyệt, ${sectorTotal ? 'sau scene soi mã ngành (mã mạnh nhất của nhóm ngành dẫn đầu)' : leaderTotal ? 'sau các mã của bộ lọc' : leaderRoles ? 'hôm nay không có scene soi mã từ bộ lọc nên mã chọn đầu tiên mở phần soi mã' : 'bản này không chọn mã soi theo bộ lọc hay luật (người dùng 2026-10-09: "i will select the symbol to review with weekly not follow by the filter value and rule") nên mã chọn đầu tiên mở phần soi mã, ngay sau bảng cuối'}: ${L.symbol} (${L.name ?? '—'}, ${L.exchange ?? '—'}): giá ${vi(L.price)} nghìn đồng, ${fmtPct(L.changePercent)} hôm nay, RS 1M ${L.rs1m ?? '—'}, RS 52W ${L.rs52w ?? '—'}${L.volumeVsSma20Percent != null ? `, KL ${fmtPct(L.volumeVsSma20Percent, 0)} so TB20` : ''}. (Chỉ cho đạo diễn: ${L.filters?.length ? `có mặt ở bộ lọc ${L.filters.join(', ')}` : FORMAT === 'daily' ? 'không nằm trong ba bộ lọc hôm nay' : 'không nằm trong bộ lọc nào của bản này'}.) Lời KHÔNG nói mã này có hay không có ở bộ lọc nào (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter"; verify \`review-overlap\` FAIL), KHÔNG nói "bạn chọn" / "theo yêu cầu".`,
  // A pick is not a leader: the brief's first line (the leader's ordinal and context) gives way to the line above.
  ...brief.slice(1).filter((l) => !String(l).startsWith('Cùng khuôn câu') && !String(l).startsWith(LONE_LEADER)).map(noLeaderTag),
  // No leader scene before it (the daily reviews only the names in all three filters since 2026-10-06): the first pick
  // opens the reviews like a first leader would.
  `Câu đầu: "${!leaderTotal && n === 1 ? `${sectorTotal + pickTotal() === 1 ? LONE_REVIEW : 'Mã đầu tiên'} là ${L.symbol}.` : `Thêm một mã đáng chú ý là ${L.symbol}, …`}" — chữ "là" tách cụm khỏi chữ cái đầu (voice.letters đánh vần); eyebrow "Soi mã · ${L.symbol}"; cùng phương pháp với scene soi mã của bộ lọc: price action trước, MA50/MA200 của FireAnt, một thế giá, nhánh nếu … thì không gọi giá.`,
  // The last pick hands over to the weekly's plan (rules.formats.weekly.watch.bridge, 2026-10-09).
  // The sector leader hands over to what follows it (another pick, a Momentum board, or the plan): sectorPickHandOff.
  ...(L.sectorLeader ? sectorPickHandOff() : fmt.watch?.bridge && n === sectorTotal + pickTotal() && fmt.roles[fmt.roles.indexOf('watch') - 1] === picksAfter ? [`Mã cuối, ngay trước kế hoạch tuần tới: sau hai câu vai, câu CUỐI CÙNG của scene là câu dẫn, đúng chữ: "${WATCH_BRIDGE}" (thay "Còn VN-Index thì sao?").`] : []),
];
const pushLeader = (pick, L, spec) => push(pick ? 'pick' : 'leader', pick ? {...spec, brief: asPick(spec.brief, L, pick)} : spec);
/** The pick scenes, right after the last leader scene; a name with no photo is dropped with the reason printed. */
// `n` counts the picks that get a scene, so the first BUILT pick is pick 1 even when an earlier request had no photo.
const buildPicks = () => {
  let n = sectorTotal;
  for (const L of F.screener.requested ?? []) {
    const sym = L.symbol.toLowerCase();
    if (!pickHasPhoto(L)) {
      console.log(`  pick ${L.symbol}: dropped — no photo public/${DIR}/${sym}-fireant.png (calibrated) or ${sym}-terminal.png (node scripts/review/shots.mjs --format=${FORMAT} --only=requested, or --only=requested-terminal)`);
      continue;
    }
    buildLeader(L, 0, ++n);
  }
};
/** The sector leader's pick scene, right after the sectors scene; dropped with the reason when it has no photo or review. */
const buildSectorPick = () => {
  if (!SECTOR_LEADER) return;
  if (sectorLeaderWhy) {
    console.log(`  pick ${SECTOR_LEADER.symbol} (sector leader, #${SECTOR_LEADER.groupRank} ${SECTOR_LEADER.group}): dropped — ${sectorLeaderWhy}`);
    return;
  }
  buildLeader(SECTOR_LEADER, 0, 1);
};
/** The brief's first line of the sector leader's scene (in place of the requested pick's "SOI THÊM" line). */
const sectorLeaderLine = (L) => `SOI MÃ NGÀNH (người dùng 2026-10-10: "Get one of stock on this marjor best ranking to review 1-5 ranking"; rules.formats.${FORMAT}.sectors.leader): ${L.symbol} (${L.name ?? '—'}, ${L.exchange ?? '—'}) — mã mạnh nhất theo RS 1M (${L.rs1m ?? '—'}) của ${L.group}, nhóm hạng #${L.groupRank} của bảng xếp hạng ngành${F.sectors?.review?.reason && L.groupRank !== 1 ? ` (${F.sectors.review.reason})` : ''}; giá ${vi(L.price)} nghìn đồng, ${fmtPct(L.changePercent)} phiên cuối, RS 52W ${L.rs52w ?? '—'}${L.volumeVsSma20Percent != null ? `, KL ${fmtPct(L.volumeVsSma20Percent, 0)} so TB20` : ''}. Scene này ngay sau bảng xếp hạng ngành, scene đó vừa gọi tên ${L.symbol} trong lời mời. Câu đầu được nói mã thuộc nhóm nào, MỘT lần, không số ("… là ${L.symbol}, mã mạnh nhất nhóm ${L.group}."); KHÔNG nói mã có ở bộ lọc nào (người dùng 2026-10-05; verify \`review-overlap\` FAIL), KHÔNG "bạn chọn" / "theo yêu cầu".`;
/** What follows the sector leader's scene: the user's picks (no board between), a Momentum board, or the plan. */
const sectorPickHandOff = () => {
  const rest = fmt.roles.slice(fmt.roles.indexOf('sectors') + 1);
  const board = rest.find((r) => fmt.screener?.scenes?.[r] && ownBoardBuilt(r));
  if (board) return [`Mã này mở phần soi mã nhưng bảng ${F.screener[board]?.filter ?? board} đến ngay sau nó: sau hai câu vai, câu CUỐI CÙNG của scene là câu dẫn, không mang mã: "${fmt.screener.scenes[board]?.bridge ?? (board === 'breakdown' ? 'Mã nào đang gãy?' : 'Bộ lọc tuần này bắt được gì?')}".`];
  if (pickTotal() > 0 && picksAfter && rest.includes(picksAfter)) return [];
  return fmt.watch?.bridge ? [`Mã cuối, ngay trước kế hoạch tuần tới: sau hai câu vai, câu CUỐI CÙNG của scene là câu dẫn, đúng chữ: "${WATCH_BRIDGE}".`] : [];
};
const buildLeader = (L, rank, pick = 0) => {
  const sym = L.symbol.toLowerCase();
  const fa = photo(`${sym}-fireant`);
  if (fa?.calib) return buildLeaderFireant(L, rank, fa, pick);
  const p = need(photo(`${sym}-terminal`), `${sym}-terminal`);
  const crop = R.shots.terminalAnalyze.crop;
  // The volume detail belongs to a name the viewer SAW on the spike board: since 2026-10-01 the board
  // lists the whole filter (two columns of up to ten), so any gainer or loser on it counts; with the
  // photographed table only its top rows do.
  const SP = F.screener.spike;
  const onBoard = [...(SP.gainers ?? []), ...(SP.losers ?? [])];
  // On the spike board AND a real spike: a name that is only 3% above its 20-session average (PVT ×1,03, 1/10) gets
  // the 52-week-high line as its detail instead of a volume box that highlights nothing.
  const spiking = ((onBoard.length ? onBoard : SP.top).some((x) => x.symbol === L.symbol)) && (L.volumeRatio ?? 0) >= 1.2;
  const marks = [lab(crop.x + 0.02, 0.06, `${L.symbol} · RS 1M ${L.rs1m} · ${fmtPct(L.changePercent)}`, 'gold', 0)];
  let closeX = crop.x + crop.w * 0.9;
  let closeY = 0.3;
  let detail = '';
  if (p.calib) {
    const bars = tryJson(`${PATHS.analyze}/${date}/${L.symbol}.json`)?.price_history ?? [];
    closeX = barX(p, bars, date) ?? closeX;
    closeY = priceY(p, L.price);
    const emaY = priceY(p, L.ema50);
    if (emaY > 0.02 && emaY < crop.y + crop.h - 0.02) marks.push({kind: 'hline', y: clamp(emaY), accent: 'green', beat: 0, label: `EMA50 ${vi(L.ema50)}`, labelSide: 'left'});
    if (spiking && L.volumeRatio != null) {
      // The terminal's volume pane sits under the price pane (y 0.553..0.697 of the photo).
      marks.push({kind: 'box', x: clamp(closeX - 0.007), y: 0.556, w: 0.014, h: clamp(crop.y + crop.h - 0.556 - 0.006), accent: 'gold', beat: 0, label: `KL ${volVs20(L)}`});
      detail = `khối lượng hôm nay ${volVs20(L)} so với trung bình 20 phiên (hộp vàng trên cột khối lượng; headline in cùng đơn vị "KL ${volVs20(L)}")`;
    } else if (L.high52w != null) {
      const hy = priceY(p, L.high52w);
      if (hy > 0.03 && hy < crop.y + crop.h - 0.03) marks.push({kind: 'hline', y: clamp(hy), accent: 'gold', beat: 0, label: `Đỉnh 52T ${vi(L.high52w)} · ${fmtPct(L.fromHigh52wPercent, 1)}`, labelSide: 'left'});
      detail = `đỉnh 52 tuần ${vi(L.high52w)}, giá đang ${fmtPct(L.fromHigh52wPercent, 1)} so với đỉnh (đường vàng)`;
    }
    marks.push({kind: 'arrow', from: [clamp(closeX - 0.1), clamp(closeY + 0.1)], to: [clamp(closeX - 0.012), clamp(closeY + 0.012)], accent: 'green', beat: 1, label: `${fmtPct(L.aboveEma50Percent, 1)} trên EMA50`});
  }
  pushLeader(pick, L, {
    eyebrow: `Soi mã · ${L.symbol}`,
    beats: todoBeats(2),
    visual: imageOf(p, 'zionle.io.vn', {
      crop,
      annotations: marks,
      shots: [{beat: 0, x: clamp(crop.x + crop.w / 2), y: clamp(crop.y + crop.h / 2), zoom: 1.0, move: 'push_in'}, {beat: 1, x: clamp(closeX - 0.05), y: clamp(closeY), zoom: 1.8, move: 'pull_out'}],
    }),
    brief: [
      `${ordOf(rank)} (RS 1M xếp #${rank} trong ${leaderTotal} mã được soi; # chỉ cho đạo diễn, không lên màn hình) — ${L.symbol} (${L.name}, ${L.exchange}): giá ${vi(L.price)} nghìn đồng, ${fmtPct(L.changePercent)} hôm nay, RS 1M ${L.rs1m}, RS 52W ${L.rs52w}; trên EMA50 ${vi(L.ema50)} ${fmtPct(L.aboveEma50Percent, 1)}, trên SMA200 ${vi(L.sma200)} ${fmtPct(L.aboveSma200Percent, 1)}. ${leaderNoFilters(L, ordOf(rank))}`,
      `Chi tiết riêng của mã này: ${noLeaderTag(detail) || 'không có'}.`,
      ...(dangerNow ? [`Thị trường đang ở MỨC NGUY HIỂM của hệ thống người dùng (${F.distribution.count} phiên phân phối ≥ ${F.distribution.dangerAt}): thêm MỘT câu nhắc rủi ro của chính mã này — mức nó đang giữ (EMA50 ${vi(L.ema50)}) — như bước "${DG.action}", không gọi mua bán.`] : []),
      L.signal ? `Tín hiệu mới nhất trên terminal: ${L.signal.type} ở ${vi(L.signal.price)} ngày ${L.signal.dm} — chỉ nhắc nếu khớp với chart đang chiếu.` : 'Terminal chưa có tín hiệu cho mã này.',
      `${leaderTotal > 2 ? 'Cùng khuôn câu với các scene leader khác' : leaderTotal > 1 ? 'Cùng khuôn câu với scene leader kia' : LONE_LEADER}; câu đầu "${ordOf(rank)} là ${L.symbol}, …" — chữ "là" tách thứ tự khỏi chữ cái đầu (voice.letters đánh vần); KHÔNG "Số ${['', 'một', 'hai', 'ba'][rank] ?? rank} là", KHÔNG "đếm ngược", eyebrow "Soi mã · ${L.symbol}" (người dùng 2026-10-01: "Let's review …"); không đọc tên công ty; mã giữ trên màn hình.`,
    ],
  });
};

/** The volume detail belongs to a name the viewer SAW on the spike board AND a real spike (≥ ×1.2): see buildLeader. */
const spikingOf = (L) => {
  const SP = F.screener.spike;
  const onBoard = [...(SP.gainers ?? []), ...(SP.losers ?? [])];
  return ((onBoard.length ? onBoard : SP.top).some((x) => x.symbol === L.symbol)) && (L.volumeRatio ?? 0) >= 1.2;
};

/** The name carrying today's index move (flow.impact.lead, ≥ rules.screener.impact.minShare % of it) when the reel reviews it:
 * its own review warns to watch it (user 2026-10-05: "combine into the VIC symbol review scene … warning the trader monitor the
 * behavior of VIC, not compare it with the market VNIndex"). */
const carrier = (L) => !!F.flow?.impact?.lead && F.flow.impact.lead.symbol === L.symbol && Math.abs(F.flow.impact.leadShare ?? 0) >= (R.screener.impact?.minShare ?? 50);
const buildLeaderFireant = (L, rank, p, pick = 0) => {
  const sym = L.symbol.toLowerCase();
  const spiking = spikingOf(L);
  const ma = tryJson(`public/${DIR}/${sym}-fireant.ma.json`);
  // The review's marks are used only when facts.mjs validated it and carried its cited numbers (leaders.top[i].review) —
  // otherwise its labels would print figures verify cannot trace. A file the pack does not carry is said out loud.
  const reviewFile = `content/review/symbols/${date}/${L.symbol}.json`;
  const review = L.review ? tryJson(reviewFile) : null;
  if (!L.review && exists(reviewFile)) console.warn(`${reviewFile}: not in ${FACTS} (invalid, or facts.mjs not re-run after the review) — default marks for ${L.symbol}`);
  // The photo's own calibration bars: they run past the edition when FireAnt was shot later (the 1/10 reel on 3/10).
  const analyzed = tryJson(`${PATHS.analyze}/${date}/${L.symbol}.json`)?.price_history ?? [];
  const openOf = new Map(analyzed.map((b) => [b.t, b.o]));
  // The calibration bars carry h/l/c; a candle read (a wick's box) also needs the open, from the same /analyze bars.
  const bars = (tryJson(`public/${DIR}/${sym}-fireant.bars.json`) ?? analyzed).map((b) => (b.o == null && openOf.has(b.t) ? {...b, o: openOf.get(b.t)} : b));
  const FA = L.fireant ?? {};
  const out = fireantLeaderVisual({L, p, ma, review, bars, date, spec: R.shots.fireantStock, spiking, volLabel: volVs20(L), maskColor: R.shots.maskColor});
  const maLine = FA.ma50 != null || FA.ma200 != null
    ? `MA của FireAnt (đọc trên ảnh ngày ${F.session.dm}, không tự tính): ${FA.ma50 != null ? `MA50 ${vi(FA.ma50)} (giá ${fmtPct(FA.aboveMa50Percent, 1)})` : 'MA50 —'}${FA.ma200 != null ? `, MA200 ${vi(FA.ma200)} (giá ${fmtPct(FA.aboveMa200Percent, 1)})` : ', MA200 —'} — hai đường trên chart là của FireAnt; lời nói "trên MA50", "MA50 trên MA200"`
    : `Ảnh FireAnt chưa có MA50/MA200 (cần thêm chỉ báo trên tab ${R.shots.fireantStock?.tab ?? 'VNM'}): không nhắc MA50/MA200 trên chart; EMA50 của terminal ${vi(L.ema50)} chỉ là bối cảnh, không lên màn hình`;
  const level = FA.ma50 != null ? `MA50 ${vi(FA.ma50)} của FireAnt` : `EMA50 ${vi(L.ema50)} của terminal`;
  const cond = (t) => String(t).replace(/^\s*nếu\s+/i, '');
  const then = (t) => String(t).replace(/^\s*thì\s+/i, '');
  // The two roles (symbol-reviewer.md §6b/§6c, user 2026-10-07: "add the role of holder and not holder with action and
  // behavior"): a third beat "Hành động" with the role plates on their lines; the two role sentences close the scene and take
  // the place of the "nếu … thì" branch and of the danger level's risk sentence.
  const roles = out.visual.shots.length > 2 && review?.roles?.holder && review?.roles?.notHolder ? review.roles : null;
  const roleSay = (r, who) => r.say ?? `${who}: ${r.if ? `${cond(r.if)}, ` : ''}${then(r.then)}.`;
  pushLeader(pick, L, {
    eyebrow: `Soi mã · ${L.symbol}`,
    beats: todoBeats(roles ? 3 : 2, est('leader')),
    visual: out.visual,
    brief: [
      `${ordOf(rank)} (RS 1M xếp #${rank} trong ${leaderTotal} mã được soi; # chỉ cho đạo diễn, không lên màn hình) — ${L.symbol} (${L.name}, ${L.exchange}): giá ${vi(L.price)} nghìn đồng, ${fmtPct(L.changePercent)} hôm nay, RS 1M ${L.rs1m}, RS 52W ${L.rs52w}. ${leaderNoFilters(L, ordOf(rank))}`,
      `Chart: ảnh FireAnt nến ngày của ${L.symbol} (không còn ảnh terminal có trendline)${(ma?.asOf?.back ?? 0) > 0 ? `; ảnh chụp sau phiên ${F.session.dm} nên các phiên sau đó được che — chart dừng ở nến ${F.session.dm}` : ''}. ${maLine}.`,
      ...(L.review ? [`Bản soi của symbol-reviewer (${L.review.path}, bản đọc .md cùng tên): thế giá ${L.review.setup} — ${L.review.verdict}${L.review.priceAction?.read ? ` Price action (${L.review.priceAction.structure}): ${L.review.priceAction.read} — nói bằng động từ của trader (vượt đỉnh, bị bán từ đỉnh, rút chân, kiểm định, giữ hỗ trợ, thủng trendline, chạm kháng cự), giá đọc ra lời tối đa hai mức, nhãn trên chart mang phần còn lại.` : ''}${(review?.branches ?? []).length ? ` Nhánh: ${review.branches.map((b) => `nếu ${cond(b.if)} thì ${then(b.then)}`).join('; ')}.` : ''} Lời mọc từ bản soi: price action → chi tiết của bản soi → ${roles ? 'HAI VAI (beat 3)' : 'mức của một nhánh'} (câu về bộ lọc trong verdict là cho đạo diễn, KHÔNG lên lời — người dùng 2026-10-05); số đọc ra lời lấy từ leaders.top[].review.numbers${L.review.pending.length ? `; ô còn chờ (${L.review.pending.join(', ')}) thì không nói tới` : ''}.`] : exists(reviewFile) ? [`Có ${reviewFile} nhưng pack không mang nó (lỗi soát, hoặc facts.mjs chưa chạy lại sau bản soi): scene dùng mark và chi tiết mặc định.`] : []),
      `Chi tiết riêng của mã này: ${noLeaderTag(out.detail) || 'không có'}.`,
      ...(roles ? [`HAI VAI — BEAT 3 "Hành động" (người dùng 2026-10-07: "add the role of holder and not holder with action and behavior like 'Không mua đuổi' with not holder when it exhausted run, and … with holder: 'nếu dưới giá …' thì hạ tỷ trọng & chốt lời một nửa"; bản soi §6b/§6c): máy lùi về nến cuối và đường giá của từng vai; plate đỏ "${roles.holder.plate}"${Number.isFinite(roles.holder.price) ? ` trên đường ${vi(roles.holder.price)}` : ' cạnh nến cuối'}, plate trắng "${roles.notHolder.plate}"${Number.isFinite(roles.notHolder.price) ? ` trên đường ${vi(roles.notHolder.price)}` : ' cạnh nến cuối'}. Vai đang giữ — case ${roles.holder.case}: ${roles.holder.if ? `${roles.holder.if} → ` : ''}${roles.holder.then}; vai chưa có hàng — case ${roles.notHolder.case}: ${roles.notHolder.if ? `${roles.notHolder.if} → ` : ''}${roles.notHolder.then}. Lời: HAI CÂU CUỐI của scene, theo thứ tự — "${roleSay(roles.holder, 'Đang giữ')}" rồi "${roleSay(roles.notHolder, 'Chưa có hàng')}" (đọc số thành chữ; nắn chữ cho tự nhiên được, giữ giá và hành động của bản soi; mỗi câu tối đa MỘT số; tên chỉ báo không đứng sát số). Câu ghim beat 3 là câu của người đang giữ. Headline beat 3: "${roles.holder.headline ?? 'Đang giữ: …'}" / "${roles.notHolder.headline ?? 'Chưa mua: …'}" (mỗi dòng ≤ 26 ký tự, số có trong pack). Hai câu này THAY nhánh "nếu … thì" và câu rủi ro${dangerNow ? ' của mức nguy hiểm (bảng của bản soi đã tính mức nguy hiểm vào hai vai)' : ''}.`] : dangerNow ? [`Thị trường đang ở MỨC NGUY HIỂM của hệ thống người dùng (${F.distribution.count} phiên phân phối ≥ ${F.distribution.dangerAt}): thêm MỘT câu nhắc rủi ro của chính mã này — mức nó đang giữ (${level}) — như bước "${DG.action}", không gọi mua bán.`] : []),
      ...(carrier(L) ? [`MÃ GÁNH CHỈ SỐ hôm nay: ${L.symbol} ${fmtPct(F.flow.impact.lead.points).replace('%', '')} điểm trong ${fmtPct(F.flow.impact.indexChange).replace('%', '')} điểm của VN-Index (${vi(F.flow.impact.leadShare, 1)}%). Người dùng 2026-10-05: "combine into the ${L.symbol} symbol review scene not separate scene, the purpose is warning the trader monitor the behavior of ${L.symbol}, not compare it with the market VNIndex" — thêm MỘT câu cảnh báo, câu CUỐI của scene: theo dõi sát hành động giá của mã này vì nó đang gánh chỉ số ("${L.symbol} gánh chỉ số, cần theo dõi sát."), không so sánh với VN-Index, không gọi mua bán; headline beat 1 mang số điểm (flow.impact.lead.points): "${L.symbol} ${fmtPct(L.changePercent)} · ${fmtPct(F.flow.impact.lead.points).replace('%', '')} điểm" / "Trụ đang gánh VN-Index".`] : []),
      L.signal ? `Tín hiệu mới nhất trên terminal: ${L.signal.type} ở ${vi(L.signal.price)} ngày ${L.signal.dm} — chart FireAnt không vẽ tín hiệu này; chỉ nhắc nếu khớp với nến đang chiếu.` : 'Terminal chưa có tín hiệu cho mã này.',
      `${leaderTotal > 2 ? 'Cùng khuôn câu với các scene leader khác' : leaderTotal > 1 ? 'Cùng khuôn câu với scene leader kia' : LONE_LEADER}; câu đầu "${ordOf(rank)} là ${L.symbol}, …" — chữ "là" tách thứ tự khỏi chữ cái đầu (voice.letters đánh vần); KHÔNG "Số ${['', 'một', 'hai', 'ba'][rank] ?? rank} là", KHÔNG "đếm ngược", eyebrow "Soi mã · ${L.symbol}" (người dùng 2026-10-01: "Let's review …"); không đọc tên công ty; mã giữ trên màn hình.`,
    ],
  });
};

/**
 * The weekly's watch = next week's PLAN (rules.formats.weekly.watch, 2026-10-09 — the director's and the trader-viewer's
 * reviews merged by the orchestrator; it pays off the hook's "lên kế hoạch giao dịch cho tuần tới"): five sentences in
 * this order — the level up, the level down, what changes the state, the holder line, the not-holder line. General terms,
 * no price call, no order. The holder / not-holder lines mirror the symbol reviews' two roles (7/10); a correction's holder
 * line is the user's own 8/10 words ("hạ tỷ trọng và tuân thủ cắt lỗ").
 */
const weeklyPlanBrief = ({SC, PW, zoneText}) => {
  const NUMW = [...NUM_VI, 'sáu', 'bảy', 'tám', 'chín', 'mười'];
  const [u0, u1] = SC?.up ?? [];
  const [d0, d1] = SC?.down ?? [];
  const nameOf = (z) => z?.members?.find((m) => m.kind === 'ma')?.name ?? null;
  const say = (z) => (z ? `<${vi(Math.round(z.at), 0)}>` : '<—>');
  const nextUp = u1 ? (nameOf(u1) ?? say(u1)) : null;
  // The trimmed template (F4, 2026-10-09 — the five sentences were 86 words against the cap): no "Kế hoạch cho …
  // kịch bản tích cực / Tiêu cực:" labels (the headlines carry them), "tuần tới" opens s0 (verify review-plan).
  const s0 = u0 ? `"Tuần tới, nếu vượt lại vùng ${say(u0)} thì ${nextUp ?? 'kháng cự kế'} là mốc kế."` : '"Tuần tới, …" (pack không có mốc phía trên)';
  // A rally attempt's bear branch (the daily's 9/10 template "nếu thủng <đáy nỗ lực> thì nỗ lực phục hồi thất bại, chỉ số về
  // <mốc kế>"), trimmed to the plan's budget: said at the rally low itself (rallyAt), never "FTD thất bại" — there is no FTD
  // yet. The market scene has named the gold line "đáy nỗ lực phục hồi" and the plate here says "→ nỗ lực thất bại"; with the
  // daily's full wording the sim plan was 85 words against the cap 76 (F6 2026-10-09).
  const sayLow = (z) => (z ? `<${vi(Math.round(rallyAt(z)), 0)}>` : '<—>');
  const s1 = !d0 ? '"Nếu thủng …" (pack không có mốc phía dưới)'
    : inRally && d0.rally ? `"Nếu thủng ${sayLow(d0)} thì nỗ lực thất bại, về ${d1 ? say(d1) : 'hỗ trợ kế'}."`
    : `"Nếu thủng ${say(d0)} thì về ${d1 ? (d1.rally ? `đáy nhịp hồi ${say(d1)}` : say(d1)) : 'hỗ trợ kế'}."`;
  // A rally attempt (9/10) waits for its FTD like a correction, with the earliest session as a day of next week.
  const outOfUptrend = inCorrection || inRally;
  // The earliest FTD day is the market scene's (s3 + beat-4 headline); the plan only waits for it, as the daily says it
  // ("lời chỉ 'chờ phiên FTD'") — repeating the day cost four words over the cap.
  const s2 = inRally ? `"Trạng thái chỉ đổi khi có phiên FTD mới." (FTD sớm nhất ${wdIn(ftdEarliest.weekday)} ${ftdEarliest.dm} — scene market đã nói ngày, KHÔNG lặp; nhãn "${ftdWaitPlate}" mang luật)`
    : inCorrection ? '"Trạng thái chỉ đổi khi có phiên FTD mới."'
    : `"Thêm ${NUMW[nextState.n] ?? nextState.n} phiên phân phối nữa là ${nextState.name.toLowerCase()}."`;
  const s3 = outOfUptrend ? '"Có hàng thì hạ tỷ trọng và tuân thủ cắt lỗ."' : '"Có hàng thì rà lại điểm cắt lỗ của từng mã."';
  const s4 = outOfUptrend ? '"Chưa có hàng thì đứng ngoài, không mua đuổi nhịp hồi, chờ phiên FTD mới."' : '"Chưa có hàng thì không mua đuổi."';
  const head = [
    [u0 ? `Vượt ${vi(u0.at)} → ${nextUp ? nextUp.replace(/^<|>$/g, '') : 'kháng cự kế'}` : 'Kịch bản tích cực', PW.headline],
    [d0 ? `Thủng ${vi(d0.rally ? rallyAt(d0) : d0.at)} → ${d1 ? vi(d1.at) : 'hỗ trợ kế'}` : 'Kịch bản tiêu cực', outOfUptrend ? 'Chờ phiên FTD mới' : (dangerNow ? 'Rà lại từng mã và rủi ro' : 'Giữ kỷ luật cắt lỗ')],
  ];
  return [
    `KẾ HOẠCH CHO TUẦN TỚI — payoff của hook (người dùng 2026-10-09: "With weekly the intro must have the sentence like: cung minh review va ke hoach giao dich cho tuan toi nhe."; vox-director loop_close). 2026-10-09 (đạo diễn + người xem trader, orchestrator gộp): NĂM câu, khoảng ${PW.words} chữ (trần ${PW.maxWords ?? R.narration.maxWordsPerScene}), ~18 giây, theo thứ tự mốc trên → mốc dưới → điều gì đổi trạng thái → người đang có hàng → người chưa có hàng. Chữ chung của hệ thống, KHÔNG gọi giá, KHÔNG lệnh mua bán, không mã nào. Lời phải có "${PW.mustSay.join('" hoặc "')}" (verify review-plan).`,
    `Khuôn năm câu (s0–s2 nắn chữ cho tự nhiên được, giữ ý và thứ tự; <…> đọc thành chữ, điểm đọc tròn): s0 ${s0} · s1 ${s1} · s2 ${s2} · s3 ${s3}${outOfUptrend ? ' (câu của chính người dùng 8/10)' : ''} · s4 ${s4} (hai câu vai, như vai đang giữ / chưa có hàng của scene soi mã từ 7/10). HAI CÂU VAI GIỮ NGUYÊN CHỮ — không cắt ${outOfUptrend ? '"đứng ngoài", "chờ phiên FTD mới"' : 'chữ nào'} (F4 2026-10-09: bản tập dượt 8/10 cắt chúng cho vừa trần cũ); câu dài thì nắn s0–s2.`,
    `Beat 1 ← s0 (atSentence 0): đường xanh các mốc phía trên — ${(SC?.up ?? []).map(zoneText).join(' → ') || '—'}; headline "${head[0][0]}" / "${head[0][1]}" (dòng 2 đúng chữ headline beat 2 của hook). Beat 2 ← s1 (atSentence 1), máy đứng yên: các mốc phía dưới — ${(SC?.down ?? []).map((z) => (z.rally ? `${zoneText(z)} (${inRally ? 'đáy nỗ lực phục hồi' : 'đáy nhịp hồi'}; đường vàng, nhãn "Thủng ${vi(rallyAt(z))} → ${rallyOutcome}")` : zoneText(z))).join(' → ') || '—'}${holdLow != null && inCorrection ? `; đáy điều chỉnh ${vi(holdLow)} (đường vàng)` : ''}; nhãn "${outOfUptrend ? ftdWaitPlate : `Thêm ${nextState.n} phiên phân phối → ${nextState.name.toLowerCase()}`}" (đỏ)${inCorrection ? ' như bản phiên 8/10' : ''}; headline "${head[1][0]}" / "${head[1][1]}".`,
    `${inRally ? `Nỗ lực phục hồi (ngày ${F.state.rallyDay}, từ ${F.state.sinceDm}; chữ của người dùng, cả lời lẫn headline — không xen "hồi phục", như bản phiên 9/10): KHÔNG đếm phiên phân phối, KHÔNG đồng hồ hết hạn; thủng ${holdName.toLowerCase()} ${holdLow != null ? vi(holdLow) : '—'} là nỗ lực phục hồi thất bại — chưa có FTD nên KHÔNG "FTD thất bại" (phiên FTD ${ftd?.dm ?? ''} đã thất bại${ftd?.ended ? ` hôm ${ftd.ended.dm}` : ''} — scene market nói); KHÔNG đọc luật FTD (ngày 1, ngày ${F.rules.ftdMinDay}) — nhãn "${ftdWaitPlate}" mang nó.` : inCorrection ? `Trạng thái điều chỉnh: KHÔNG đếm phiên phân phối, KHÔNG đồng hồ hết hạn, KHÔNG "thủng … là FTD thất bại" (phiên FTD ${ftd?.dm ?? ''} đã thất bại${ftd?.ended ? ` hôm ${ftd.ended.dm}` : ''} — scene market nói); KHÔNG đọc luật FTD (ngày 1, ngày ${F.rules.ftdMinDay}) — nhãn mang nó.` : `${dangerNow ? `Đang ở mức nguy hiểm (${F.distribution.count} ≥ ${F.distribution.dangerAt}): câu người có hàng là bước "${DG.action}" của hệ thống. ` : ''}Không đồng hồ hết hạn.`} Tối đa ba số đọc ra lời (mốc trên, mốc dưới, mốc kế dưới); số lấy từ scenario.up / scenario.down; nhãn giữ số lẻ của pack.`,
  ];
};

// watch — the payoff: what changes the state, said as if-then. Static camera on beat 2.
const buildWatch = () => {
  // "Kịch bản VN-Index" (user 2026-10-05: "also include the scene relate to the scenario of the market VN-Index", then
  // "Upgrade the closing scene"): the payoff draws the index's two paths from the pack's `scenario` — beat 1 the bull path
  // (the zones overhead: FireAnt's MA and the price-action resistance merged), beat 2 the bear path (the supports under it,
  // the FTD rally low among them) with the rule plates kept (one more distribution day, the danger level). Without a
  // scenario block it falls back to the rule levels alone. The weekly's is next week's plan (rules.formats.weekly.watch,
  // user 2026-10-09): it pays off the hook's "lên kế hoạch giao dịch cho tuần tới"; the daily has no such block.
  const SC = F.scenario;
  const PW = fmt.watch;
  const marks = [];
  // facts.mjs names the rally member "đáy nhịp hồi" in every state; in a rally attempt it is the attempt's own low.
  const memberName = (m) => (m.kind === 'rally' && inRally ? holdName.toLowerCase() : m.name);
  const zoneText = (z) => z.members.map((m) => `${m.kind === 'ma' ? m.name : memberName(m).charAt(0).toUpperCase() + memberName(m).slice(1)} ${vi(m.price)}`).join(' · ');
  const yOf = (price) => priceY(index, price, indexUnit);
  const inPane = (y) => y != null && y > C.y + 0.015 && y < C.y + C.h - 0.015;
  const ups = (SC?.up ?? []).map((z) => ({z, y: yOf(z.at)})).filter(({y}) => inPane(y));
  const downs = (SC?.down ?? []).map((z) => ({z, y: yOf(z.at)})).filter(({y}) => inPane(y));
  // until: 0 — the bull lines leave when beat 2 widens to the bear path: frame-audit caught the "MA200 1795,82" plate
  // jumping for a frame as the camera zoomed out (remotion-market-43 at integration, 2026-10-05); beat 2 is the bear path.
  for (const {z, y} of ups) marks.push({kind: 'hline', y: clamp(y), accent: 'green', beat: 0, until: 0, label: zoneText(z), labelSide: 'left'});
  marks.push(todayRing(0));
  // Under the rally low an attempt fails (a rally attempt) or the FTD does (an uptrend); a correction only makes a new low.
  const rallyOutcome = inRally ? 'nỗ lực thất bại' : F.state.rallyLow != null ? 'FTD thất bại' : 'đáy mới';
  // A zone that merged the rally low with a level just above it (within 0.5%) meets the path at that level, but the state
  // changes only under the rally low itself: its line and plate sit on the rally low (9/10: 1724,17 under 1731,03).
  const rallyAt = (z) => z.members.find((m) => m.kind === 'rally')?.price ?? z.at;
  for (const {z, y} of downs) {
    marks.push({kind: 'hline', y: clamp(z.rally ? yOf(rallyAt(z)) : y), accent: z.rally ? 'gold' : 'red', beat: 1,
      label: z.rally ? `Thủng ${vi(rallyAt(z))} → ${rallyOutcome}` : zoneText(z), labelSide: 'left'});
  }
  // The rally low when the scenario block did not carry it (an older pack), as the scene always did.
  if (!downs.some(({z}) => z.rally) && holdVisible) marks.push({kind: 'hline', y: clamp(holdY), accent: 'gold', beat: 1, label: `Thủng ${vi(holdLow)} → ${rallyOutcome}`, labelSide: 'left'});
  marks.push(lab(clamp(lastX - 0.03), clamp(lastY - 0.1), inCorrection || inRally ? ftdWaitPlate : `Thêm ${nextState.n} phiên phân phối → ${nextState.name.toLowerCase()}`, 'red', 1, 'end'));
  // The weekly's plan says the action in beat 2's headline ("Rà lại từng mã và rủi ro"): its plate names the level only.
  if (dangerNow) marks.push(lab(clamp(lastX - 0.03), clamp(lastY - 0.14), PW?.words ? DG.vi : `${DG.vi}: ${DG.action}`, 'red', 1, 'end'));
  // Beat 1 frames the last candle and the bull path's lines; beat 2 (static: the payoff) widens to reach the bear path.
  const topY = ups.length ? Math.min(...ups.map(({y}) => y)) : lastY - 0.1;
  const botY = downs.length ? Math.max(...downs.map(({y}) => y)) : (holdVisible ? holdY : lastY + 0.1);
  const shots = [
    {beat: 0, x: clamp((lastX ?? 0.85) - 0.12), y: clamp((topY + lastY) / 2), zoom: 1.7, move: 'tilt'},
    {beat: 1, x: inC(0.6, 0)[0], y: clamp((topY + botY) / 2), zoom: 1.05, move: 'static'},
  ];
  const upText = (SC?.up ?? []).map(zoneText).join(' → ') || '—';
  const downText = (SC?.down ?? []).map((z) => (z.rally ? `${zoneText(z)} (thủng ${vi(rallyAt(z))} = ${rallyOutcome})` : zoneText(z))).join(' → ') || '—';
  push('watch', {
    eyebrow: 'Kịch bản VN-Index',
    // The weekly's plan pins beat 1 to its first sentence (the bull path) and beat 2 to its second (the bear path).
    beats: todoBeats(2).map((b, k) => (PW?.words ? {...b, atSentence: k} : b)),
    visual: indexPhoto(room.settle(marks, shots)),
    brief: PW?.words ? weeklyPlanBrief({SC, PW, zoneText}) : [
      `KỊCH BẢN VN-INDEX — payoff (người dùng 2026-10-05: "also include the scene relate to the scenario of the market VN-Index", chọn nâng cấp scene cuối): hai nhánh NẾU … THÌ theo price action của chính chỉ số (đóng cửa ${vi(F.session.close)}), không gọi giá, không lời khuyên.`,
      `Beat 1 — kịch bản tích cực: các mốc phía trên, gần trước: ${upText}. Khuôn: "Kịch bản tích cực: nếu VN-Index vượt <mốc 1> thì <mốc 2> là mốc kế." Gọi tên MA50 / MA200 (của FireAnt) và "kháng cự" như trader.`,
      inRally
        ? `Beat 2 — kịch bản tiêu cực: các mốc phía dưới, gần trước: ${downText}. Mốc đầu là ĐÁY NỖ LỰC PHỤC HỒI ${vi(holdLow)} (đường vàng, nhãn "Thủng ${vi(holdLow)} → ${rallyOutcome}"): khuôn "Kịch bản tiêu cực: nếu thủng <đáy nỗ lực> thì nỗ lực phục hồi thất bại, chỉ số về <mốc kế>." — KHÔNG "FTD thất bại" (chưa có FTD mới; phiên FTD ${ftd?.dm ?? ''} đã thất bại${ftd?.ended ? ` hôm ${ftd.ended.dm}` : ''}). Rồi ĐIỀU KIỆN của nhánh tích cực theo quy tắc, MỘT câu ngắn: chờ phiên FTD — nhãn "${ftdWaitPlate}" mang luật (người dùng 2026-10-08 không muốn đọc luật FTD ở market; ở watch nhãn nói, lời chỉ "chờ phiên FTD"). KHÔNG đếm phiên phân phối, KHÔNG đồng hồ hết hạn.`
        : inCorrection
        ? `Beat 2 — kịch bản tiêu cực: các mốc phía dưới, gần trước: ${downText}${holdLow != null ? `; đáy điều chỉnh ${vi(holdLow)} (thủng là đáy mới — đường vàng)` : ''}. Khuôn: "Kịch bản tiêu cực: nếu thủng <mốc 1> thì chỉ số về <mốc 2>." — KHÔNG "thủng … là FTD thất bại" (phiên FTD ${ftd?.dm ?? ''} đã thất bại${ftd?.ended ? ` hôm ${ftd.ended.dm}` : ''}; scene market nói điều đó). Rồi luật của trạng thái điều chỉnh (theo quy tắc): một phiên đóng cửa tăng là ngày 1 của nỗ lực hồi phục, phiên FTD từ ngày ${F.rules.ftdMinDay}, tăng từ ${vi(F.rules.ftdMinChangePercent)}% với khối lượng cao hơn — nhãn "Chờ ${ftdRule}". KHÔNG đếm phiên phân phối, KHÔNG đồng hồ hết hạn.`
        : `Beat 2 — kịch bản tiêu cực: các mốc phía dưới, gần trước: ${downText}. Khuôn: "Kịch bản tiêu cực: nếu thủng <mốc 1> thì chỉ số về <mốc 2>; thủng đáy nhịp hồi là phiên FTD thất bại." Rồi luật: thêm ${nextState.n} phiên phân phối là ${nextState.name.toLowerCase()}${nextState.danger ? ' (MỨC NGUY HIỂM của hệ thống người dùng)' : ''}${nextExp ? `; phiên ${nextExp.dm} hết hạn sau ${nextExp.sessionsLeft} phiên (để nhãn nói hoặc bỏ nếu chật)` : ''}.`,
      ...(dangerNow ? [`ĐANG Ở MỨC NGUY HIỂM (${F.distribution.count} phiên phân phối ≥ ${F.distribution.dangerAt}, hệ thống người dùng 2026-10-01): giữ lời cảnh báo — một câu "${DG.action}", không gọi mua bán.`] : []),
      'Máy đứng yên ở beat 2. Câu ngắn, chậm. Số đọc thành chữ (điểm tròn: "một nghìn bảy trăm bảy mươi lăm"); nhãn giữ số lẻ của pack (scenario.*).',
      `Số lấy từ scenario.up / scenario.down và watch[] của fact pack (${F.watch.map((w) => `nếu ${w.if} → ${w.then}`).join('; ')}).`,
    ],
  });
};

// week — the weekly edition's candle on FireAnt's weekly chart of the VNINDEX tab (lib/week-fireant.mjs: price + volume
// crop, legend masked, the week boxed, the weeks after a past edition masked; its plates settle like the index chart's).
const buildWeek = () => {
  const W = F.weekly;
  const wk = photo('vnindex-weekly');
  if (!W || !wk?.calib) {
    console.log(`  week: dropped — ${!W ? 'the pack has no weekly block (facts.mjs --format=weekly)' : 'no calibrated vnindex-weekly photo (shots.mjs --format=weekly --only=fireant-weekly, the real Chrome)'}`);
    return;
  }
  const weeks = weeklyBars(readJson(PATHS.daily)).filter((b) => b.t <= (wk.calib.last_bar ?? W.from));
  // The weekly timeframe's evaluation (F.indexWeekly, user 2026-10-06: "eval the VNIndex as daily and weekly"): beat 1
  // the candle in close-up, beat 2 the wide with the structure, the nearest zones and FireAnt's weekly averages.
  // plan (2026-10-09, rules.formats.weekly.week): ~28 words, the nearest zone spoken once, the hand-off to the daily frame.
  const out = weekVisual({W, toDm: F.session.dm, p: wk, ma: tryJson(`public/${DIR}/vnindex-weekly.ma.json`), weeks, spec: {...R.shots.fireantStock, ...R.shots.fireantWeekly}, maskColor: R.shots.maskColor,
    plan: {words: wordsOf('week'), bridge: fmt.week?.bridge ?? null},
    E: F.indexWeekly ?? null, provisional: !!F.indexDaily?.weekSessions?.at(-1)?.volumeProvisional});
  if (out.why) { console.log(`  week: dropped — ${out.why}`); return; }
  const wroom = plateRoom({photo: wk, bars: weeks, unit: 1, crop: out.visual.crop, volumeBand: R.shots.fireantDaily.volumeBand ?? 0});
  const {annotations, shots} = wroom.settle(out.visual.annotations, out.visual.shots);
  for (const line of wroom.report) console.log(`  plate (week): ${line}`);
  push('week', {
    ...(F.indexWeekly ? {eyebrow: 'VN-Index · Khung tuần'} : {}),
    // beat 1 ← the candle's verdict, beat 2 ← the structure and the nearest zone (2026-10-09); the bridge closes beat 2.
    beats: todoBeats(2).map((b, k) => ({...b, atSentence: k})),
    visual: imageOf(wk, 'fireant.vn', {...out.visual, annotations, shots}),
    brief: out.brief,
  });
};

// ------------------------------------------------------------------ weekly edition scenes (2026-10-06)
// daily — VN-Index · Khung ngày; sectors — the ICB industry groups ranked by RS (rules.formats.weekly._why). Each
// builder prints why when its material is missing, like the others.
// daily — VN-Index · Khung ngày (user 2026-10-06: "eval the VNIndex as daily and weekly of this week"), on the FireAnt
// daily photo the market scene uses: STRUCTURE on beat 1 — the last two swing highs joined and the last two swing lows
// joined (a dashed line per pair, red when the second swing is lower, green when higher), each swing priced, the week's
// sessions boxed — and TREND on beat 2: FireAnt's MA50 / MA200 priced at their lines by the last candle, how far the close
// sits from each, the last candle ringed. No distribution day or FTD (market comes next), no if-then (watch's job).
// dailyFrame builds those two beats; buildDaily speaks them as a scene of their own (a format listing the `daily` role),
// and since 2026-10-09 the weekly's market scene opens on them (`merged`: user "Combine the scene 03 and 04 to one scene but
// still keep it meaningful"; rules.formats.weekly.market.daily) — there every frame mark clears after beat 2 (`until: 1`)
// so the rule's beats get the chart and the camera opens wider; buildMergedMarket writes the scene's brief. {why} when the material
// is missing.
const dailyFrame = ({merged = false} = {}) => {
  const D = F.indexDaily;
  if (!D) return {why: `${FACTS} has no indexDaily block (facts.mjs --format=${FORMAT})`};
  if (indexSource !== 'fireant.vn') return {why: 'the index photo is the terminal fallback, not FireAnt (no MA50/MA200 legend)'};
  const mas = Object.entries(D.ma ?? {});
  if (!mas.length) return {why: `no FireAnt MA50/MA200 of this session (${D.maWhy ?? 'vnindex-daily.ma.json'})`};
  const keep = merged ? {until: 1} : {};
  const S = D.structure;
  const inView = (x) => x != null && x > C.x + 0.01 && x < C.x + C.w - 0.01;
  const pts = [...S.highs.map((p) => ({...p, side: 'high'})), ...S.lows.map((p) => ({...p, side: 'low'}))]
    .map((p) => ({...p, x: barX(index, daily, p.t), y: priceY(index, p.price, indexUnit)}))
    .filter((p) => inView(p.x));
  const marks = [];
  // One plate per pair, by its line (a plate per swing point landed 170 px from its candle in the dense September
  // swings — 5/10 test): the highs' plate over the highs line, the lows' under the lows line. Merged, the two plates are a
  // two-line header in the colour of their lines instead — the header slot every beat of that scene uses (structure, the
  // averages, the count, the threshold): its wide opening shot sizes a plate too large to sit under the lows line between
  // the candles and the volume bars (6/10 draft: pushed 349 px off its line).
  let row = 0;
  for (const side of ['high', 'low']) {
    const [a, b] = pts.filter((p) => p.side === side);
    if (!a || !b) continue;
    marks.push({kind: 'line', from: [clamp(a.x), clamp(a.y)], to: [clamp(b.x), clamp(b.y)], dashed: true, accent: b.price > a.price ? 'up' : 'down', beat: 0, ...keep});
    const y = side === 'high' ? Math.min(a.y, b.y) - 0.04 : Math.max(a.y, b.y) + 0.045;
    const text = `${side === 'high' ? 'Đỉnh' : 'Đáy'} ${a.dm} ${vi(a.price)} → ${b.dm} ${vi(b.price)}`;
    marks.push({...(merged ? lab(...inC(0.5, 0.06 + 0.04 * row++), text, b.price > a.price ? 'green' : 'red', 0, 'middle') : lab((a.x + b.x) / 2, clamp(y), text, b.price > a.price ? 'green' : 'red', 0, 'middle')), until: 0});
  }
  // The week's sessions, high to low (the weekly hook boxes the same sessions; here they stand against the swings).
  const wk = D.weekSessions.map((s) => ({x: barX(index, daily, s.t), b: barOf(s.t)})).filter((s) => s.x != null && s.b);
  if (wk.length) {
    const half = (index.calib.d * 0.7) / index.W;
    const top = priceY(index, Math.max(...wk.map((s) => s.b.h)), indexUnit);
    const bottom = priceY(index, Math.min(...wk.map((s) => s.b.l)), indexUnit);
    const x0 = Math.min(...wk.map((s) => s.x)) - half;
    marks.push({kind: 'box', x: clamp(x0), y: clamp(top - 0.012), w: clamp(Math.max(...wk.map((s) => s.x)) + half - x0), h: clamp(bottom - top + 0.024), accent: 'gold', beat: 0, until: 0});
  }
  // Beat 2: the last candle ringed and the averages as a two-line header (FireAnt draws the lines and prints their
  // values in coloured tags on its price scale; plates by the lines were pushed off them by the candles around the
  // close, which sits between the two averages — 5/10 test).
  const MA_ACCENT = {MA50: 'green', MA200: 'gold'};
  marks.push({...todayRing(1), ...keep});
  mas.forEach(([name, m], k) => marks.push({...lab(...inC(0.5, 0.06 + 0.04 * k), `${m.closeVsPercent < 0 ? 'Dưới' : 'Trên'} ${name} ${vi(m.value)} (${fmtPct(m.closeVsPercent)})`, MA_ACCENT[name] ?? 'white', 1, 'middle'), ...keep}));
  const xs = pts.map((p) => p.x);
  const first = xs.length ? Math.min(...xs) : (lastX ?? 0.85) - 0.25;
  const ys = [...pts.map((p) => p.y), lastY];
  const maYs = mas.map(([, m]) => priceY(index, m.value, indexUnit));
  const shots = [
    // Merged: the scene's opening shot, wider than the daily scene's — the rule beats come back to the same chart.
    {beat: 0, x: clamp((first + (lastX ?? 0.85)) / 2), y: clamp((Math.min(...ys) + Math.max(...ys)) / 2), zoom: merged ? 1.25 : 1.45, move: 'pan'},
    {beat: 1, x: clamp((lastX ?? 0.85) - 0.07), y: clamp((Math.min(lastY, ...maYs) + Math.max(lastY, ...maYs)) / 2), zoom: 2.0, move: 'push_in'},
  ];
  // The verdict the numbers allow (the writer may phrase it): a structure that is not up, under both averages, is weak.
  const below = D.maPosition === 'dưới cả MA50 và MA200';
  const verdict = S.kind === 'up' && D.maPosition === 'trên cả MA50 và MA200' ? 'khung ngày khỏe: đỉnh, đáy cao dần và giá trên cả hai đường trung bình'
    : S.kind === 'down' && below ? 'khung ngày yếu: đỉnh, đáy thấp dần và giá dưới cả hai đường trung bình'
      : below ? `khung ngày đang yếu: ${S.broke?.side === 'low' ? `cấu trúc ${S.word} nhưng đã thủng đáy ${S.broke.dm}` : `cấu trúc ${S.word}`}, giá dưới cả MA50 và MA200`
        : `khung ngày giằng co: cấu trúc ${S.word}, giá ${D.maPosition}`;
  const sessionText = D.weekSessions.map((s) => `${s.weekday} ${s.dm} ${fmtPct(s.changePercent)}${s.volumeProvisional ? ' (KL của SSI còn là số tạm — không đọc tỉ lệ KL)' : `, KL ×${vi(s.volumeVsPrior)} phiên trước`}`).join('; ');
  const H = S.highs, L = S.lows;
  return {
    D, marks, shots, verdict,
    lines: {
      structure: `Beat 1 — cấu trúc (hai đường đứt nối hai đỉnh, hai đáy): đỉnh ${H.map((p) => `${p.dm} ${vi(p.price)}`).join(' → ') || '—'}, đáy ${L.map((p) => `${p.dm} ${vi(p.price)}`).join(' → ') || '—'}: ${S.text}.${S.broke ? ` Giá đóng ${vi(D.close)} đã ${S.broke.side === 'low' ? 'ở DƯỚI đáy' : 'ở TRÊN đỉnh'} ${S.broke.dm} (${vi(S.broke.price)}) — ${S.broke.side === 'low' ? 'đáy cao dần đã bị phá' : 'đỉnh gần nhất đã bị vượt'}.` : ''} Khung vàng = các phiên của tuần: ${sessionText || '—'}.`,
      trend: `Beat 2 — xu hướng: giá ${D.maPosition ?? '—'} của FireAnt (${mas.map(([name, m]) => `${name} ${vi(m.value)}, giá ${fmtPct(m.closeVsPercent)}`).join('; ')})${D.ma50AboveMa200 != null ? `; MA50 ${D.ma50AboveMa200 ? 'trên' : 'dưới'} MA200` : ''}. Kết luận do số quyết định: "${verdict}" — viết bằng chữ của trader (cấu trúc, đỉnh, đáy, MA50, MA200), không ví von.`,
    },
  };
};
const buildDaily = () => {
  const fr = dailyFrame();
  if (fr.why) { console.log(`  daily: dropped — ${fr.why}`); return; }
  push('daily', {
    eyebrow: 'VN-Index · Khung ngày',
    beats: todoBeats(2),
    visual: indexPhoto(room.settle(fr.marks, fr.shots)),
    brief: [
      `VN-INDEX · KHUNG NGÀY (người dùng 2026-10-06: "eval the VNIndex as daily and weekly of this week") — đánh giá CẤU TRÚC và XU HƯỚNG trên chart ngày của FireAnt (${fr.D.window} phiên). KHÔNG nói phiên phân phối hay FTD (scene market ngay sau), KHÔNG nhánh nếu … thì (scene watch "Kịch bản VN-Index" cuối video).`,
      fr.lines.structure,
      fr.lines.trend,
      'Tối đa hai số đọc ra lời; số đọc thành chữ, mức điểm đọc tròn. Gọi MA50 / MA200 như trader (lexicon đọc). Nhãn giữ số lẻ của pack (indexDaily.*). Câu cuối trao lời cho scene market — trạng thái theo quy tắc của hệ thống — dạng câu hỏi ngắn, không lặp câu hỏi của hook.',
    ],
  });
};
// sectors — the ICB industry groups ranked by the median RS 1M of their liquid stocks (lib/sectors.mjs; user 2026-10-06:
// "Also include major ranking", picked "ICB groups by RS"). A drawn board in FilterBoard's sector mode: up to ten groups,
// the strongest three lit on beat 2; each row lists the group's three strongest tickers by RS 1M (user 2026-10-09: "With
// the scene 05 also listing 2-3 stock with this major ranking?"). Dropped with the reason when facts.mjs could not rank
// (no universe cache for the session, no content/review/industries.json).
/** The review scenes that play RIGHT AFTER the sectors scene, in order (2026-10-10): the sector leader, then — when no
 * Momentum board is built between them (9/10: the terminal's signal flags missing) — the user's picks. The sectors scene's
 * last sentence invites exactly these (verify review-sectors FAIL otherwise); with a board between, the last board invites
 * the user's picks as before. */
const reviewsAfterSectors = () => {
  const rest = fmt.roles.slice(fmt.roles.indexOf('sectors') + 1);
  const upTo = picksAfter && rest.includes(picksAfter) ? rest.slice(0, rest.indexOf(picksAfter) + 1) : [];
  const boardBetween = upTo.some((r) => fmt.screener?.scenes?.[r] && ownBoardBuilt(r));
  return [...(sectorPick ? [sectorPick] : []), ...(upTo.length && !boardBetween ? (F.screener.requested ?? []).filter(pickHasPhoto) : [])];
};
/** The sectors scene's last sentence: the FIXED invitation (rules.formats.<format>.sectors.invite, user 2026-10-11) when
 * review scenes follow it — it names no ticker, they say their own — else the hand-off to the breakdown board, else —
 * nothing follows but the plan — the plan's bridge ("Vậy tuần tới canh gì?"). */
const sectorsInvite = () => fmt.sectors?.invite ?? die(`rules.formats.${FORMAT}.sectors.invite is not set — the fixed sentence the sectors scene ends on when review scenes follow it (user 2026-10-11)`);
const sectorsHandOff = () => {
  const rest = fmt.roles.slice(fmt.roles.indexOf('sectors') + 1);
  const next = rest.find((r) => !fmt.screener?.scenes?.[r] || ownBoardBuilt(r));
  const anyBoard = rest.some((r) => fmt.screener?.scenes?.[r] && ownBoardBuilt(r));
  const run = reviewsAfterSectors();
  if (run.length) return ` — câu CUỐI là LỜI MỜI CỐ ĐỊNH, đúng từng chữ, KHÔNG gọi mã nào (người dùng 2026-10-11: "Edit the sentence: Cùng mình xem kỹ PVP, rồi VPB và HDB => something like: Cung minh xem ky cac ma nam trong cac nhom nganh tren & dang manh nhat (leader) cua thi truong nhe"; rules.formats.${FORMAT}.sectors.invite): "${sectorsInvite()}" — ${run.length > 1 ? `${NUM_VI[run.length] ?? run.length} scene soi mã chiếu ngay sau` : 'scene soi mã chiếu ngay sau'} (${run.map((x) => `${x.symbol} — ${x.sectorLeader ? `mã mạnh nhất của ${x.group}, scene soi mã ngành` : 'mã người dùng chọn'}`).join('; ')}) tự gọi tên mã của ${run.length > 1 ? 'chúng' : 'nó'} ("Mã đầu tiên là ${run[0].symbol}."). Không thêm, không bớt, không đổi chữ nào; KHÔNG chữ "review", KHÔNG nói vì sao chọn, KHÔNG "bạn chọn"; verify review-sectors FAIL khi câu cuối khác lời mời này${anyBoard ? '' : ' (KHÔNG có bảng Momentum nào trong bản này — không nói vì sao)'}`;
  if (next === 'breakdown') return ' sang bảng Momentum breakdown: "Mã nào đang gãy?"';
  // A board with its own lead-in (the weekly's watchlist right after the ranking since 2026-10-18 — user: "Bang theo doi co
  // phieu must be after the xep hang nganh scene"): the scene ends on that board's question, word for word.
  if (fmt.screener?.scenes?.[next]?.bridge) return ` sang "${fmt.screener.scenes[next].board?.list ?? next}", đúng chữ: "${fmt.screener.scenes[next].bridge}" — không mang mã, không mời "xem kỹ" mã nào (các scene soi mã đến SAU bảng đó)`;
  if (next === 'watch') return ` sang kế hoạch tuần tới, đúng chữ: "${fmt.watch?.bridge ?? 'Vậy tuần tới canh gì?'}" (không scene soi mã nào theo sau, KHÔNG có bảng Momentum nào trong bản này — không nói vì sao, không "Mã nào đang gãy?")`;
  return ' sang scene sau, dạng câu hỏi ngắn';
};
const buildSectors = () => {
  const S = F.sectors;
  if (!S?.ok || !S.groups?.length) {
    console.log(`  sectors: dropped — ${S?.why ?? (S ? `no ICB group has ${S.minMembers} stocks with KL TB20 ≥ ${S.minVolumeSma20}` : `${FACTS} has no sectors block (facts.mjs --format=${FORMAT})`)}`);
    return;
  }
  const {visual, rowLines, top, focus, label} = sectorBoard({S, R});
  const tickers = visual.columns.includes('topSymbols') && visual.rows.some((r) => r.topSymbols?.length);
  const last = top[top.length - 1];
  const tail = S.groups.slice(top.length);
  const shares = top.filter((g) => g.aboveSma200Share != null);
  const lowShare = [...shares].sort((a, b) => a.aboveSma200Share - b.aboveSma200Share)[0];
  // The contrast of the % above SMA200 column, among the groups on the board: the most (past #1, which sentence 1
  // already names) and the fewest above it.
  const hiShare = [...shares].filter((g) => g !== top[0] || shares.length < 3).sort((a, b) => b.aboveSma200Share - a.aboveSma200Share || a.rank - b.rank)[0];
  const loShare = lowShare;
  const W = F.weekly;
  const weekNote = W && W.sessions < 5 ? ` Cột % TUẦN là tuần tới phiên ${F.session.dm} (${W.sessions} phiên), chưa trọn tuần.` : '';
  const moves = S.comparedWith
    ? top.filter((g) => g.prevRank != null && Math.abs(g.prevRank - g.rank) >= 2).map((g) => `${g.name} ${g.prevRank} → ${g.rank}`).join('; ') || 'không nhóm nào trong bảng đổi từ hai hạng trở lên'
    : null;
  // s1 (2026-10-10, user: "mentiond the major raking from 1 to 3 and mention its stock on this major"): the lit groups in
  // rank order, full names, each with its strongest ticker; and the words s0 + s1 + the last sentence take (a figure read
  // out is ~3 words), so the brief says whether the % above SMA200 observation still fits under maxWords.
  const threeSay = `Dẫn đầu là ${focus.map((g, i) => `${i === 1 ? 'rồi ' : ''}${g.name}${g.top?.[0]?.symbol ?? g.strongest?.symbol ? ` với ${g.top?.[0]?.symbol ?? g.strongest.symbol}` : ''}`).join(', ')}.`;
  const run = reviewsAfterSectors();
  const lastSay = run.length ? sectorsInvite() : (fmt.watch?.bridge ?? 'Vậy tuần tới canh gì?');
  const planWords = [`Bảng ngành tuần này, nhóm đứng đầu có RS một tháng`, threeSay, lastSay].join(' ').split(/\s+/).filter(Boolean).length + 3;
  push('sectors', {
    eyebrow: 'Xếp hạng ngành',
    // Beat 1 on s0 (the board, the leading group's median), beat 2 — the top three rows lit — on s1, the sentence naming
    // the three groups with one stock each (2026-10-10); the fixed invitation (2026-10-11) closes the scene.
    beats: todoBeats(2).map((b, k) => ({...b, atSentence: k})),
    visual,
    brief: [
      `XẾP HẠNG NHÓM NGÀNH (người dùng 2026-10-06: "Also include major ranking", chọn "ICB groups by RS"): ${S.groups.length} nhóm ngành ICB cấp 2 (bản đồ ngành công khai của VNDirect — terminal không có trường ngành) có từ ${S.minMembers} mã thanh khoản (KL TB20 ≥ ${vi(S.minVolumeSma20 / 1000, 0)} nghìn cổ phiếu) trở lên, xếp theo RS 1M TRUNG VỊ của các mã đó trên terminal — cách xếp hạng nhóm ngành của O'Neil. Bảng in ${top.length} nhóm đầu${S.unranked.length ? `; ${S.unranked.length} nhóm quá ít mã thanh khoản nên không xếp (${S.unranked.map((g) => `${g.name}: ${g.members} mã`).join(', ')})` : ''}.`,
      `Các dòng (SỐ MÃ · RS 1M trung vị · % TUẦN trung vị · % mã trên SMA200 · mã mạnh nhất): ${rowLines.join('; ')}.`,
      ...(tickers ? [`MÃ TRÊN BẢNG (người dùng 2026-10-09: "With the scene 05 also listing 2-3 stock with this major ranking?"): mỗi dòng in ${S.topPerGroup ?? 3} mã mạnh nhất của nhóm theo RS 1M (mã thanh khoản, mạnh nhất trước), cột MÃ MẠNH NHẤT; số mã của nhóm in nhỏ, xám, dưới tên ngành. ${top.map((g) => `${g.short}: ${(g.top ?? []).map((t) => t.symbol).join(' · ') || '—'}`).join('; ')}. Người xem ĐỌC được các mã này trên màn hình — lời chỉ gọi mã mạnh nhất của ${Math.min(3, top.length)} nhóm đầu (câu s1), không đọc lại cả danh sách.`] : []),
      `Beat 1 = bảng hiện dần từ trên xuống (RS 1M trung vị thành thanh); beat 2 = ${focus.map((g) => g.name).join(', ')} sáng lên${tickers ? ' cùng các mã mạnh nhất của chúng' : ''}, các dòng khác mờ, nhãn "${label}" thay caption — câu ghim beat 2 (atSentence 1) là câu s1 bên dưới: ${focus.length} nhóm đang sáng, mỗi nhóm một mã.`,
      // 2026-10-09 (trader-viewer: "I do not trade 'Hàng & DV công nghiệp' (23 names); the useful column is % above
      // MA200"): one number for the leader, the contrast from the share-above-SMA200 column, then the hand-off to breakdown.
      `LỜI — khoảng ${wordsOf('sectors')} chữ (trần ${fmt.sectors?.maxWords ?? R.narration.maxWordsPerScene}), BA câu theo thứ tự, BỐN khi còn chữ cho s2 (người dùng 2026-10-10: "on the scene 05, mentiond the major raking from 1 to 3 and mention its stock on this major"): (s0, beat 1, atSentence 0) bảng và RS 1M trung vị của nhóm dẫn đầu, MỘT số — "Bảng ngành tuần này, nhóm đứng đầu có RS một tháng ${top[0].rs1m}." (headline beat 1 mang tên gọn "${top[0].short}"; lời viết "RS một tháng": voice.letters đọc "RS", không đọc "1M" — check narration FAIL với chữ số); (s1, beat 2, atSentence 1 — ${focus.length} dòng đầu sáng lên) ${focus.length} nhóm hạng 1 → ${focus.length} theo thứ tự, TÊN ĐẦY ĐỦ, mỗi nhóm MỘT mã — mã mạnh nhất của nó (top[0], RS 1M cao nhất), viết in hoa: "${threeSay}" — tên nhóm dẫn đầu nói MỘT lần trong cả scene (s0 không lặp nó); (s2, tùy ngân sách) MỘT nhận xét từ cột % MÃ TRÊN SMA200, số của pack (${focus.map((g) => `${g.name} ${g.aboveSma200Share ?? '—'}%`).join(', ')}${hiShare && loShare && hiShare !== loShare ? `; tương phản trên bảng: ${hiShare.name} ${hiShare.aboveSma200Share}%, ${loShare.name} ${loShare.aboveSma200Share === 0 ? 'không còn mã nào' : `${loShare.aboveSma200Share}%`}` : ''}) — ${planWords + 10 <= (fmt.sectors?.maxWords ?? R.narration.maxWordsPerScene) ? `vừa ngân sách (s0 + s1 + câu cuối ≈ ${planWords} chữ): giữ MỘT câu ngắn, ví dụ ${top[0].aboveSma200Share != null ? `"Nhưng chỉ ${top[0].aboveSma200Share} phần trăm mã của nhóm đầu trên MA200."` : 'nói bằng chữ'}` : `KHÔNG đủ chữ (s0 + s1 + câu cuối ≈ ${planWords} chữ): bỏ câu này`}; (câu CUỐI)${run.length ? '' : ' câu trao lời'}${sectorsHandOff()}. Tối đa ba số đọc ra lời; không đọc cột % TUẦN.${weekNote}`,
      `MÃ TRONG LỜI: CHỈ ${focus.length} mã của câu s1 (mỗi nhóm hạng 1–${focus.length} một mã: ${focus.map((g) => `${g.top?.[0]?.symbol ?? g.strongest?.symbol ?? '—'} của ${g.short}`).join(', ')}) — câu cuối không mang mã (lời mời cố định từ 2026-10-11), không mã nào khác của bảng (verify review-sectors cảnh báo; rules.formats.${FORMAT}.sectors.maxTickers = ${fmt.sectors?.maxTickers ?? 3}). Viết mã in hoa, voice.letters đánh vần — không viết cách đọc; hai mã cạnh nhau luôn tách bằng chữ ("với", "rồi", "và"). KHÔNG nói mã nào có ở bộ lọc nào (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter"). Không khuyên mua bán nhóm ngành hay mã nào.`,
      `${tail.length ? `Cuối bảng xếp hạng (không lên bảng — chỉ nói tên nếu cần, không đọc số): ${tail.slice(-3).map((g) => `#${g.rank} ${g.name}`).join(', ')}. ` : ''}${moves != null ? `So bảng tuần trước (${S.comparedWith}): ${moves}.` : 'Chưa có bảng xếp hạng tuần trước để so (bản đầu tiên): không nói "tăng hạng / tụt hạng".'}`,
    ],
  });
};

// outro — the carried-over sign-off. The daily's promise names the next session's weekday (user 2026-10-12: "Change the
// text on scene 13: Mỗi phiên đóng cửa, hẹn bạn ở đây. to something like human: Hen gap cac ban vao phien giao dich cua
// ngay thu ... nhe"). The next weekday stands in for the next session: a holiday has to be fixed by hand.
const nextSession = (() => {
  const d = new Date(`${date}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  const t = d.toISOString().slice(0, 10);
  return {date: t, dm: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, weekday: wdIn(weekdayOf(t))};
})();
const buildOutro = () => push('outro', {
  eyebrow: 'Theo dõi tiếp',
  beats: [{atSentence: 0, at: R.audio.leadIn, line1: 'TODO', line2: 'TODO', accent: 'gold'}],
  // rules.logo (a path under public/) replaces the generated monogram inside the ring; the name stays.
  visual: {type: 'outro', ...(R.logo ? {logo: R.logo} : {}), brand: R.brand, kicker: 'Chứng khoán', pill: 'Thả tim · Chia sẻ · Theo dõi', line: FORMAT === 'daily' ? 'Cập nhật sau mỗi phiên' : 'Cập nhật mỗi cuối tuần'},
  brief: [
    'Thả tim · chia sẻ · theo dõi bằng giọng người, một câu hứa cập nhật. Không số, không thuật ngữ, không "khuyến nghị".',
    ...(FORMAT === 'daily' ? [`Câu hứa của bản phiên (người dùng 2026-10-12, thay "Mỗi phiên đóng cửa, hẹn bạn ở đây."): "Hẹn gặp các bạn vào phiên giao dịch ngày ${nextSession.weekday} nhé." — ${nextSession.weekday} ${nextSession.dm} là phiên kế tiếp (thứ trong tuần, không đọc ngày tháng); phiên đó nghỉ lễ thì đạo diễn sửa thứ.`] : []),
  ],
});

// The weekly's market scene opens on the daily frame (rules.formats.<format>.market.daily, user 2026-10-09: "Combine the
// scene 03 and 04 to one scene but still keep it meaningful") unless the format still lists a daily scene of its own; with
// no frame material (no indexDaily, the terminal photo, no FireAnt MA) it is the rule's three beats, and says why.
const buildMarketScene = () => {
  if (!fmt.market?.daily || fmt.roles.includes('daily')) return buildMarket();
  const fr = dailyFrame({merged: true});
  if (fr.why) console.log(`  market: no daily frame — ${fr.why}; the rule's three beats only`);
  return fr.why ? buildMarket() : buildMergedMarket(fr);
};

/**
 * The weekly's merged market scene (rules.formats.weekly.market: user 2026-10-09 "Combine the scene 03 and 04 to one scene
 * but still keep it meaningful"; the director's and the trader-viewer's reviews of that day, merged by the orchestrator):
 * ONE verdict per beat, six sentences, no price level spoken (the plates carry them).
 *   beat 1 ← s0  the structure verdict (dailyFrame's dashed swing lines, the week boxed, the swings in the header)
 *   beat 2 ← s1  the MA verdict (the MA50 / MA200 header, the last candle ringed)
 *   beat 3 ← s2  the WEEK's rule event with its week-over-week change: the distribution-day arrows and ONE count plate that
 *                pays the term debt with no words ("6/25 phiên phân phối" + "Giảm ≥ 0,5%, KL cao hơn phiên trước"); in an
 *                uptrend also the FTD anchor and its rally low
 *   beat 4 ← s3  a correction: the FTD failed, find a new one (the failed FTD's plate, the correction low it now has to hold)
 *                / the danger level's warning / the next threshold in words; then s4 the user's locked line of the state
 *                and s5 the bridge to breadth.
 * Every plate ends with its beat (`until`): beat 4 shows only its own. No clock ("11/9 hết hạn sau 7 phiên"), no threshold
 * ladder ("6 phiên → điều chỉnh") in any state, no "Nguy hiểm" plate in a correction — three session counts on one chart
 * were more than the viewer could parse.
 */
const buildMergedMarket = (frame) => {
  const M = fmt.market ?? {};
  const NUMW = [...NUM_VI, 'sáu', 'bảy', 'tám', 'chín', 'mười'];
  const MH = M.headlines ?? {};
  const D = frame.D;
  const S = D.structure;
  const count = F.distribution.count;
  const added = (F.weekly?.distributionDays ?? []).length;
  const turned = (F.weekly?.transitions ?? []).filter((x) => x.to === F.state.label).at(-1) ?? null;
  // The rally attempts the week undercut (the week of 12/10: 9/10's low 1724,17 on 12/10, 13/10's low 1710,95 on 14/10) are
  // the week's rule story when there are any — the state turned on them, not on a distribution day (none that week): beat 3
  // draws each lost low instead of the distribution arrows and count, and s2 tells it (2026-10-17: the 9/10 template said
  // "thứ Tư là phiên phân phối thứ sáu" for an undercut attempt).
  const failedWeek = inRally || inCorrection ? (F.weekly?.transitions ?? []).filter((x) => x.attempt) : [];
  const failedYs = failedWeek.map((x) => priceY(index, x.attempt.rallyLow, indexUnit)).filter((y) => y > C.y + 0.02 && y < C.y + C.h - 0.02);
  const marks = [...frame.marks];
  // beat 3: the week's rule event
  if (failedWeek.length) {
    for (const x of failedWeek) {
      const y = priceY(index, x.attempt.rallyLow, indexUnit);
      if (y > C.y + 0.02 && y < C.y + C.h - 0.02) marks.push({kind: 'hline', y: clamp(y), accent: 'red', beat: 2, until: 2, label: `Đáy nỗ lực ${x.attempt.day1Dm} · ${vi(x.attempt.rallyLow)} · thủng ${x.dm}`, labelSide: 'left'});
    }
    marks.push({...lab(...inC(0.5, 0.06), 'Thủng đáy nỗ lực = nỗ lực thất bại', 'white', 2, 'middle'), until: 2});
  } else {
    marks.push(...ddXs.map((d) => ({...ddArrow(d, 2), until: 2})));
    marks.push({...lab(...inC(0.5, 0.06), `${count}/${F.distribution.window} phiên phân phối`, 'red', 2, 'middle'), until: 2});
    marks.push({...lab(...inC(0.5, 0.1), `Giảm ≥ ${vi(Math.abs(F.rules.ddMaxChangePercent), 1)}%, KL cao hơn phiên trước`, 'white', 2, 'middle'), until: 2});
  }
  // The FTD: the uptrend's anchor on beat 3; in a correction the failed FTD is beat 4's ("find a new FTD"); in a rally
  // attempt it fails with the week's rule story on beat 3 and beat 4 is the attempt's.
  const ftdBeat = inCorrection ? 3 : 2;
  if (ftdVisible && !(failedWeek.length && ftdBeat === 2)) {
    marks.push({...ftdArrow(ftd, ftdX, ftdBeat), until: ftdBeat});
    marks.push({...lab(ftdX, clamp(ftdBase(ftd) + 0.03), ftdFailed ? `FTD ${ftd.dm} · thất bại` : `FTD ${ftd.dm} ${fmtPct(ftd.changePercent)}`, ftdFailed ? 'red' : 'green', ftdBeat, 'middle'), until: ftdBeat});
  }
  // The low that matters: the rally low under the uptrend (beat 3), the correction low the first attempt has to hold (beat 4),
  // the attempt's own low in a rally attempt (beat 4).
  const holdBeat = inRally ? 3 : ftdBeat;
  if (holdVisible) marks.push({kind: 'hline', y: clamp(holdY), accent: 'gold', beat: holdBeat, until: holdBeat, label: `${holdName} ${vi(holdLow)}`, labelSide: 'left'});
  // beat 4: the last candle; its own plates only. A rally attempt has no ring and no "Ngày 1" plate (the daily's 9/10
  // patch, frame-audit: the plate collided while the camera moved, the ring sat in the gold line label's path): the gold
  // line is the attempt's low and the beat-4 headline carries its day.
  if (!inRally) marks.push(todayRing(3));
  const shots = [
    ...frame.shots,
    failedWeek.length
      // the lost lows and the week's candles together
      ? {beat: 2, x: clamp((lastX ?? 0.9) - 0.12), y: clamp(failedYs.length ? (Math.min(...failedYs) + Math.max(...failedYs, lastY)) / 2 : lastY), zoom: 1.5, move: 'pull_out'}
      : {beat: 2, x: clamp(ftdVisible && !inCorrection ? (ftdX + (lastX ?? 0.9)) / 2 : ddLeft != null ? ddCentre : inC(0.5, 0)[0]), y: clamp(holdVisible && !inCorrection && !inRally ? (holdY + lastY) / 2 : inC(0, 0.45)[1]), zoom: 1.15, move: 'pull_out'},
    inCorrection && ftdVisible
      ? {beat: 3, x: clamp((ftdX + (lastX ?? 0.9)) / 2), y: clamp(((ftdY ?? lastY) + (holdVisible ? holdY : lastY)) / 2), zoom: 1.2, move: 'pan'}
      : {beat: 3, x: clamp((lastX ?? 0.85) - 0.06), y: clamp(holdVisible && (inCorrection || inRally) ? (holdY + lastY) / 2 : lastY), zoom: 2.0, move: 'push_in'},
  ];
  // The sentence plan (the writer phrases it; numbers spelled, no price level).
  const s0 = S.broke?.side === 'low' ? `"Khung ngày ${S.word}, nhưng giá đã thủng đáy gần nhất."`
    : S.broke?.side === 'high' ? `"Khung ngày ${S.word}, nhưng giá đã vượt đỉnh gần nhất."`
      : S.kind === 'down' ? '"Khung ngày đã thành xu hướng giảm: đỉnh, đáy thấp dần."'
        : S.kind === 'up' ? '"Khung ngày vẫn tăng: đỉnh, đáy cao dần."' : `"Khung ngày ${S.word}."`;
  const below = D.maPosition === 'dưới cả MA50 và MA200';
  const above = D.maPosition === 'trên cả MA50 và MA200';
  const s1 = below ? '"Giá dưới cả MA50 lẫn MA200, khung ngày đang yếu."' : above ? '"Giá trên cả MA50 lẫn MA200, khung ngày đang khỏe."' : `"Giá ${D.maPosition}, khung ngày giằng co."`;
  const ddDay = turned ? wdIn(weekdayOf(turned.date)) : null;
  // A rally attempt: the week's turn INTO the correction is the rule story (8/10 sixth DD), the attempt is beat 4's. The DD
  // that turns an uptrend into a correction is always the correctionAt-th (one DD a session), whatever expired since.
  const corrTurn = inRally ? (F.weekly?.transitions ?? []).filter((x) => x.to === R.status.CORRECTION.vi).at(-1) ?? null : null;
  const firstAttempt = !!corrTurn && (F.weekly?.transitions ?? []).filter((x) => x.date > corrTurn.date && x.to === F.state.label).length === 1;
  const day1Wd = inRally && F.state.day1 ? weekdayOf(F.state.day1.date) : null;
  // Day 1 that closed DOWN: it set the correction's new low and closed in the upper half (9/10: −0,22%, low 1724,17) — the
  // daily's 9/10 brief has the trader's words for it, "thủng đáy … rồi rút chân".
  const undercutDay1 = inRally && F.state.day1?.date === F.session.date && F.session.changePercent < 0;
  const failedSay = failedWeek.length
    ? `"Theo quy tắc, tuần này ${failedWeek.length === 1 ? 'nỗ lực phục hồi đã thất bại' : `cả ${NUMW[failedWeek.length] ?? failedWeek.length} nỗ lực phục hồi đều thất bại`}: ${failedWeek.map((x) => wdIn(weekdayOf(x.date))).join(' rồi ')}, giá thủng đáy của nỗ lực." (${failedWeek.map((x) => `${x.dm}: thủng đáy ${vi(x.attempt.rallyLow)} của nỗ lực bắt đầu ${x.attempt.day1Dm}`).join('; ')} — mỗi đáy là một đường đỏ có nhãn ở beat 3, KHÔNG đọc mức giá; KHÔNG "phiên phân phối thứ …": tuần này ${added ? `có ${added} phiên phân phối mới nhưng` : 'không có phiên phân phối mới,'} trạng thái đổi vì thủng đáy nỗ lực; gọi "nỗ lực phục hồi" như người dùng, không xen "hồi phục")`
    : null;
  const s2 = failedSay ?? (inRally
    ? (corrTurn
      ? `"Theo quy tắc, tuần này thị trường chuyển sang điều chỉnh: ${wdIn(weekdayOf(corrTurn.date))} là phiên phân phối thứ ${NUMW[R.distribution.correctionAt] ?? R.distribution.correctionAt}." (${corrTurn.dm}: ${corrTurn.from} → ${corrTurn.to}${ftd?.ended?.date === corrTurn.date && ftd.ended.why !== 'distribution' ? ' — đổi vì thủng đáy nhịp hồi, nói đúng lý do đó thay "phiên phân phối thứ …"' : ''}; nhãn "FTD ${ftd?.dm ?? '—'} · thất bại" hiện ở beat này, không đọc thêm)`
      : `"Theo quy tắc, thị trường vẫn đang điều chỉnh${added ? `, tuần này thêm ${NUMW[added] ?? added} phiên phân phối` : ''}." (nỗ lực phục hồi từ ${F.state.sinceDm})`)
    : inCorrection
    ? (turned
      ? `"Theo quy tắc, tuần này thị trường chuyển sang điều chỉnh: ${ddDay} là phiên phân phối thứ ${NUMW[count] ?? count}." (${turned.dm}: ${turned.from} → ${turned.to}${ftd?.ended?.why === 'distribution' ? '' : ' — đổi vì thủng đáy nhịp hồi, nói đúng lý do đó thay "phiên phân phối thứ …"'})`
      : `"Theo quy tắc, thị trường vẫn đang điều chỉnh${added ? `, tuần này thêm ${NUMW[added] ?? added} phiên phân phối` : ''}." (điều chỉnh từ ${F.state.sinceDm})`)
    : `"Theo quy tắc, ${turned ? `tuần này xu hướng tăng chuyển sang ${R.status[F.state.status]?.short?.toLowerCase() ?? F.state.label}` : F.state.status === 'UNDER_PRESSURE' ? 'xu hướng tăng vẫn chịu áp lực' : F.state.status === 'CONFIRMED_UPTREND' ? 'xu hướng tăng vẫn được xác nhận' : `thị trường ở trạng thái ${F.state.label.toLowerCase()}`}, hiện tại đang có ${NUMW[count] ?? count} phiên phân phối${added ? `, thêm ${NUMW[added] ?? added} so với tuần trước` : ''}." (khuôn câu đếm người dùng chốt 1/10: "… hiện tại đang có <n> phiên phân phối"; tuần này ${added ? `có ${added} phiên phân phối mới: ${F.weekly.distributionDays.map((d) => `${d.dm} ${fmtPct(d.changePercent)}`).join('; ')}` : 'không có phiên phân phối mới — KHÔNG nói "thêm … so với tuần trước"'})`);
  const s3 = inRally
    ? `"Phiên ${day1Wd ? wdIn(day1Wd) : F.state.day1?.dm ?? '—'} ${undercutDay1 ? 'thủng đáy rồi rút chân, là' : 'là'} ngày đầu tiên của nỗ lực phục hồi, ${ftdEarliestSay ? `phiên FTD sớm nhất là ${ftdEarliestSay}` : 'từ giờ chỉ còn chờ phiên FTD'}." (ngày 1 ${F.state.day1?.dm ?? '—'}, hôm nay ngày ${F.state.rallyDay}${undercutDay1 ? `; phiên ${F.session.dm} ${fmtPct(F.session.changePercent)} lập đáy mới ${vi(F.session.low)} rồi đóng ${vi(F.session.close)} ở nửa trên biên độ — nói như trader, "thủng đáy rồi rút chân" (bản phiên 9/10), KHÔNG đọc luật ngày 1` : ''}; FTD sớm nhất ${wdIn(ftdEarliest.weekday)} ${ftdEarliest.dm} = ngày ${F.rules.ftdMinDay} — nói NGÀY, KHÔNG đọc luật FTD "từ ngày bốn, tăng từ một phẩy hai lăm phần trăm", người dùng 2026-10-08: "Not need mention the rule of FTD"; gọi trạng thái bằng chữ của người dùng, "nỗ lực phục hồi", cả lời lẫn headline — không xen "hồi phục", như bản phiên 9/10)`
    : inCorrection
    ? (ftdFailed ? `"Phiên FTD ${dmSpoken(ftd.dm)} đã thất bại, giờ phải tìm một phiên FTD mới." (người dùng 2026-10-08: "Emphasize the failure FTD … find the another FTD")` : '"Giờ phải chờ một phiên FTD mới."')
    : dangerNow ? `"Hệ thống mình báo nguy hiểm, ${DG.action}." (mức nguy hiểm của hệ thống người dùng, ${count} ≥ ${F.distribution.dangerAt} phiên — verify FAIL nếu market thiếu "nguy hiểm")`
      : F.distribution.toDanger > 0 && inUptrend ? `"Chỉ cần thêm ${NUMW[F.distribution.toDanger] ?? F.distribution.toDanger} phiên phân phối nữa là mức nguy hiểm."`
        : `"Chỉ cần thêm ${NUMW[nextState.n] ?? nextState.n} phiên phân phối nữa là ${nextState.name.toLowerCase()}."`;
  // A rally attempt keeps the correction's line while it is the FIRST attempt since the correction began: its low is the
  // "đáy" of the user's words (the 2026 June–July correction undercut six attempts before the 3/8 FTD).
  const s4 = inCorrection ? R.status.CORRECTION.say : inRally && firstAttempt ? attemptSay : dangerNow ? DG.say : null;
  const bridge = afterMarket === 'breadth' || afterMarket === 'flow' ? (M.bridge ?? 'Nhìn rộng ra thì sao?') : 'Bộ lọc cuối tuần bắt được gì?';
  const plan = [s0, s1, s2, s3, ...(s4 ? [`"${s4}" (câu người dùng chốt — ${inCorrection ? 'status.CORRECTION.say, 2026-10-08' : inRally ? `${R.status.RALLY_ATTEMPT?.say ? 'status.RALLY_ATTEMPT.say' : 'status.CORRECTION.say, 2026-10-08'} — nỗ lực đang chạy là nỗ lực ĐẦU TIÊN từ phiên điều chỉnh ${corrTurn.dm}; "đáy" là ${holdName.toLowerCase()} ${holdLow != null ? vi(holdLow) : '—'}, đường vàng beat 4; giữ cả chữ "phục hồi" của người dùng` : 'distribution.danger.say, 2026-10-05; THAY câu đếm tới điều chỉnh'}; giữ chữ)`] : []), `"${bridge}"`];
  // Headlines, by the numbers (≤ 26 characters a line).
  const L2 = S.lows?.at(-1);
  const head = [
    S.broke?.side === 'low' ? [`Thủng đáy ${S.broke.dm} · ${vi(S.broke.price)}`, 'Đáy cao dần đã bị phá']
      : S.broke?.side === 'high' ? [`Vượt đỉnh ${S.broke.dm} · ${vi(S.broke.price)}`, 'Đỉnh gần nhất đã bị vượt']
        : S.kind === 'down' ? [`Đáy thấp dần · ${L2 ? vi(L2.price) : '—'}`, 'Khung ngày xu hướng giảm']
          : S.kind === 'up' ? [`Đáy cao dần · ${L2 ? vi(L2.price) : '—'}`, 'Khung ngày xu hướng tăng']
            : [`Đáy ${L2?.dm ?? '—'} · ${L2 ? vi(L2.price) : '—'}`, 'Khung ngày đi ngang'],
    below ? ['Dưới cả MA50 lẫn MA200', 'Khung ngày đang yếu'] : above ? ['Trên cả MA50 lẫn MA200', 'Khung ngày đang khỏe'] : [D.maPosition.charAt(0).toUpperCase() + D.maPosition.slice(1), 'Khung ngày giằng co'],
    // A rally attempt's beat 3 is the week's turn into the correction, worded without the state's name (review-state WARNs
    // on another state's name on screen); beat 4 names the attempt — the state is named by the end of the market scene.
    failedWeek.length ? [`${failedWeek.length} nỗ lực phục hồi thất bại`, `Thủng đáy ${failedWeek.map((x) => x.dm).join(' và ')}`] : [`${count}/${F.distribution.window} phiên phân phối`, inRally ? (corrTurn ? `Điều chỉnh từ ${corrTurn.dm}` : 'Vẫn trong điều chỉnh') : inCorrection ? R.status.CORRECTION.vi : F.state.status === 'UNDER_PRESSURE' ? (MH.UNDER_PRESSURE ?? R.status.UNDER_PRESSURE.headline) : R.status[F.state.status]?.vi ?? F.state.label],
    inRally ? (MH.RALLY_ATTEMPT ?? [ftdEarliest.now ? 'Chờ phiên FTD' : `FTD sớm nhất ${wdIn(ftdEarliest.weekday)} ${ftdEarliest.dm}`, `Nỗ lực phục hồi · ngày ${F.state.rallyDay}`])
      : inCorrection ? (MH.CORRECTION ?? ['Tìm phiên FTD mới', 'Nguy cơ thủng đáy rất cao'])
      : dangerNow ? (MH.danger ?? ['Mức nguy hiểm · {n} phiên', 'Rà lại từng mã và rủi ro']).map((t) => t.replaceAll('{n}', String(count)))
        : [`Thêm ${nextState.n} phiên → ${nextState.name.toLowerCase()}`, 'Ngưỡng kế theo quy tắc'],
  ];
  push('market', {
    act: warnAct,
    eyebrow: 'VN-Index · Khung ngày',
    beats: todoBeats(4, est('market')).map((b, k) => ({...b, atSentence: k})),
    visual: indexPhoto(room.settle(marks, shots)),
    brief: [
      `VN-INDEX · KHUNG NGÀY VÀ TRẠNG THÁI THEO QUY TẮC — MỘT scene (người dùng 2026-10-09: "Combine the scene 03 and 04 to one scene but still keep it meaningful"), trả lời câu hỏi của hook "${fmt.hook?.question ?? 'Thị trường còn khỏe không?'}". MỘT KẾT LUẬN MỖI BEAT (2026-10-09, đạo diễn + người xem trader, orchestrator gộp): ${plan.length} câu, khoảng ${M.words ?? wordsOf('market')} chữ (trần ${M.maxWords ?? R.narration.maxWordsPerScene}, tối đa ${M.maxSentences ?? R.narration.maxSentencesPerScene} câu, tối đa ${M.maxSpokenNumbers ?? 2} số đọc ra lời). KHÔNG đọc mức giá nào ở scene này — nhãn mang ${[S.broke ? vi(S.broke.price) : null, ...Object.entries(D.ma ?? {}).map(([k, m]) => `${k} ${vi(m.value)}`)].filter(Boolean).join(', ')}; scene week đọc vùng tuần gần nhất, scene watch đọc các mốc của kế hoạch. Số phiên đọc thành chữ ("sáu"). Eyebrow "VN-Index · Khung ngày". Gọi MA50 / MA200, "phiên FTD" như trader (lexicon đọc). Không nhánh nếu … thì (scene watch).${ftdLostInWeek ? ' Phiên FTD mất trong tuần: KHÔNG thêm câu "Thị trường đang rất nguy hiểm." của bản phiên — câu mở của hook đã nói "nguy hiểm" (F4 2026-10-09).' : ''}`,
      `Khuôn ${plan.length} câu, theo thứ tự (nắn chữ cho tự nhiên được, giữ ý và thứ tự): ${plan.map((x, i) => `s${i} ${x}`).join(' · ')}.`,
      `Beat 1 ← s0 (atSentence 0) — cấu trúc: đỉnh ${(S.highs ?? []).map((p) => `${p.dm} ${vi(p.price)}`).join(' → ') || '—'}, đáy ${(S.lows ?? []).map((p) => `${p.dm} ${vi(p.price)}`).join(' → ') || '—'}: ${S.text}${S.broke ? `; giá đóng ${vi(D.close)} đã ${S.broke.side === 'low' ? 'ở DƯỚI đáy' : 'ở TRÊN đỉnh'} ${S.broke.dm} (${vi(S.broke.price)})` : ''}. Headline "${head[0][0]}" / "${head[0][1]}".`,
      `Beat 2 ← s1 (atSentence 1) — giá ${D.maPosition ?? '—'} của FireAnt (${Object.entries(D.ma ?? {}).map(([k, m]) => `${k} ${vi(m.value)}, giá ${fmtPct(m.closeVsPercent)}`).join('; ')}). Headline "${head[1][0]}" / "${head[1][1]}".`,
      failedWeek.length ? `Beat 3 ← s2 (atSentence 2) — chuyện QUY TẮC của TUẦN: ${failedWeek.length} nỗ lực phục hồi thất bại — ${failedWeek.map((x) => `nỗ lực bắt đầu ${x.attempt.day1Dm} (${x.attempt.days} phiên) bị thủng đáy ${vi(x.attempt.rallyLow)} ngày ${x.dm} (${wdIn(weekdayOf(x.date))})`).join('; ')}; đổi trạng thái trong tuần: ${(F.weekly?.transitions ?? []).map((x) => `${x.dm} ${x.from} → ${x.to}`).join('; ')}. Mỗi đáy đã thủng là một đường đỏ có nhãn (ngày bắt đầu · giá · ngày thủng); nhãn trắng "Thủng đáy nỗ lực = nỗ lực thất bại" trả nợ thuật ngữ thay lời — lời KHÔNG giảng luật. KHÔNG mũi tên phân phối, KHÔNG nhãn đếm phiên phân phối ở beat này: tuần này ${added ? `có ${added} phiên phân phối mới, nhưng` : 'không có phiên phân phối mới;'} ra khỏi xu hướng tăng thì số phiên phân phối không đổi trạng thái (${count}/${F.distribution.window} vẫn còn — không đọc). Headline "${head[2][0]}" / "${head[2][1]}".` : `Beat 3 ← s2 (atSentence 2) — chuyện QUY TẮC của TUẦN: ${count}/${F.distribution.window} phiên phân phối (${dd.map((d) => `${d.dm} ${fmtPct(d.changePercent)}`).join('; ') || 'không có'}); đổi trạng thái trong tuần: ${(F.weekly?.transitions ?? []).map((x) => `${x.dm} ${x.from} → ${x.to}`).join('; ') || 'không'}. Nhãn đếm trả nợ thuật ngữ thay lời: "${count}/${F.distribution.window} phiên phân phối" + "Giảm ≥ ${vi(Math.abs(F.rules.ddMaxChangePercent), 1)}%, KL cao hơn phiên trước" — lời KHÔNG giảng định nghĩa phiên phân phối. Headline "${head[2][0]}" / "${head[2][1]}"${F.state.status === 'UNDER_PRESSURE' ? ` (dòng 2 thay "${R.status.UNDER_PRESSURE.vi}" — status.UNDER_PRESSURE.headline rút còn ≤ 26 ký tự, người dùng nói "something like")` : ''}.${inCorrection ? '' : inRally ? (ftdVisible && ftdFailed ? ` Nhãn "FTD ${ftd.dm} · thất bại" (đỏ, mũi tên dưới nến FTD) hiện ở beat này — nhãn, không đọc thêm${ftdLostInWeek ? ' (câu mở của hook đã nói phiên FTD mất)' : ''}.` : '') : ` Neo của xu hướng trên chart (nhãn, không đọc): FTD ${ftd?.dm ?? '—'} ${ftd ? fmtPct(ftd.changePercent) : ''}, ${holdName.toLowerCase()} ${holdLow != null ? vi(holdLow) : '—'}.`}`,
      `Beat 4 ← s3 (atSentence 3) — ${inRally ? `nỗ lực phục hồi: ngày 1 là ${day1Wd ? wdIn(day1Wd) : ''} ${F.state.day1?.dm ?? '—'}, hôm nay ngày ${F.state.rallyDay}; ${holdName.toLowerCase()} ${holdLow != null ? vi(holdLow) : '—'} là đường vàng${holdLow === F.session.low ? ' — đáy của chính phiên hôm nay' : ''} — thủng nó thì nỗ lực phục hồi thất bại (chưa có FTD nên KHÔNG "FTD thất bại"); trên chart KHÔNG nhãn "ngày 1", KHÔNG vòng nến cuối — headline mang nó (như bản phiên 9/10); phiên FTD sớm nhất ${wdIn(ftdEarliest.weekday)} ${ftdEarliest.dm} — nói NGÀY ("${ftdEarliestSay ?? 'từ giờ'}"), KHÔNG đọc luật FTD (ngày 1, từ ngày ${F.rules.ftdMinDay}, +${vi(F.rules.ftdMinChangePercent)}% — người dùng 2026-10-08: "Not need mention the rule of FTD"); không gọi mua bán` : inCorrection ? `điều kiện kế: tìm phiên FTD mới${ftdFailed ? ` (FTD ${ftd.dm} thất bại hôm ${ftd.ended.dm}; mũi tên và nhãn "FTD ${ftd.dm} · thất bại" hiện ở beat này)` : ''}; ${holdName.toLowerCase()} ${holdLow != null ? vi(holdLow) : '—'} là đường vàng — "đáy" trong câu của người dùng; KHÔNG đọc luật FTD (ngày 1, từ ngày ${F.rules.ftdMinDay} — người dùng 2026-10-08: "Not need mention the rule of FTD")` : dangerNow ? `mức nguy hiểm của hệ thống người dùng — cảnh báo, ${DG.action}; không gọi mua bán` : 'ngưỡng kế, nói bằng chữ'}. Rồi ${s4 ? 's4 (câu người dùng) và ' : ''}s5 câu dẫn. Headline "${head[3][0]}" / "${head[3][1]}". KHÔNG đồng hồ hết hạn, KHÔNG thang ngưỡng ("${R.distribution.correctionAt} phiên → điều chỉnh")${inCorrection || inRally ? ', KHÔNG nhãn "Nguy hiểm"' : ''} — người xem không đọc nổi ba con số phiên trên một chart.`,
    ],
  });
};
const builders = {picklist: buildPicklist, hook: buildHook, market: buildMarketScene, breadth: buildBreadth, flow: buildFlow, spike: () => (R.screener.scenes.spike.visual === 'movers' && F.screener.spike.gainers?.length ? buildMovers() : buildTable('spike')), watch: buildWatch, week: buildWeek, daily: buildDaily, sectors: buildSectors, outro: buildOutro};
// Every other scene of the screener (rs, uptrend — one saved filter each): a drawn board of its top rows
// when rules say `visual: "board"`, else the Screener photographed with those rows boxed.
for (const [k, spec] of Object.entries(R.screener.scenes)) builders[k] ??= () => (spec.visual === 'board' || spec.visual === 'columns' ? buildBoard(k) : buildTable(k));
// The format's own screener scenes (rules.formats.<format>.screener.scenes — the weekly's Momentum boards, 2026-10-06).
// The daily's shortlist (2026-10-19) — its own builder, not the weekly's watchlist.
if (FORMAT === 'daily') for (const k of Object.keys(fmt.screener?.scenes ?? {})) builders[k] ??= () => buildShortlist(k);
for (const k of Object.keys(fmt.screener?.scenes ?? {})) builders[k] ??= () => (['any', 'base'].includes(fmt.screener.scenes[k].match) ? buildWatchlist(k) : buildOwnBoard(k));
const leaderRoles = fmt.roles.filter((r) => r === 'leader').length;
// The leader scenes actually built. A day can have fewer names than leader roles — the daily reviews only the names in
// all three filters since 2026-10-06 (formats.daily.leaders) — and the ranks, ordinals and the board's invitation count
// these: one name is "Mã đầu tiên", never "Mã thứ hai".
// Tier order (the weekly's one review per Momentum filter, 2026-10-06, "Top of each filter"): each pick is reviewed in the
// leader role right after ITS OWN board (top[].tierScene), so a pick counts only when that board is built (it has rows —
// buildOwnBoard's own test) and a leader role follows it.
// A pack with no tier picks (the weekly reviews only the names the user picks since 2026-10-09) is not tier-ordered: its
// boards then invite the requested names (countdownBrief) like any format without leader scenes.
const tierOrder = F.screener.leaders?.order === 'tier' && (F.screener.leaders?.top?.length ?? 0) > 0;
const tierPicks = tierOrder ? (F.screener.leaders?.top ?? []).filter((x) => x.tierScene && F.screener[x.tierScene]?.top?.length && fmt.roles[fmt.roles.indexOf(x.tierScene) + 1] === 'leader') : null;
const leaderTotal = Math.min(leaderRoles, tierPicks ? tierPicks.length : F.screener.leaders?.top?.length ?? 0);
// A format with no leader role (the weekly since 2026-10-09 — user: "Remove the soi ma first, i will select the symbol to
// review with weekly not follow by the filter value and rule") plays the requested names right after its LAST board (the
// Momentum breakout board since breakdown plays first, rules.formats.weekly._order, 2026-10-09), which invites them
// (buildOwnBoard → countdownBrief); with no board at all, before watch.
// The weekly's picks list (role picklist, 2026-10-18) shows every pick right before their chart reviews: they follow it.
const picksAfter = leaderRoles ? null
  : fmt.roles.includes('picklist') && F.screener?.picklist?.rows?.length ? 'picklist'
  : [...fmt.roles].reverse().find((r) => fmt.screener?.scenes?.[r] || R.screener.scenes[r]) ?? null;
let leaderIdx = 0;
let tierBuilt = 0;
const downSaid = new Set();
for (const [ri, role] of fmt.roles.entries()) {
  if (SCREENER_DOWN && screenerRoles.has(role)) {
    if (!downSaid.has(role)) console.log(`  ${role}: dropped — no screener for ${date} (${SCREENER_DOWN})`);
    downSaid.add(role);
    continue;
  }
  if (role === 'leader') {
    if (tierOrder) {
      // The leader role right after a board reviews that board's pick — scene k is top[k], in tier order — or nothing;
      // ordinals by position (ordOf: rank leaderTotal - k → "Mã đầu tiên", "Mã thứ hai").
      const L = tierPicks.find((x) => x.tierScene === fmt.roles[ri - 1]);
      if (L && tierBuilt < leaderTotal) buildLeader(L, leaderTotal - tierBuilt++);
    } else if (leaderIdx < leaderTotal) {
      // top[] is ranked by RS 1M, strongest first. The reviews show the weakest first and the strongest
      // last, so scene k takes top[total - 1 - k] and wears rank total - k.
      buildLeader(F.screener.leaders.top[leaderTotal - 1 - leaderIdx], leaderTotal - leaderIdx);
    }
    leaderIdx++;
    if (leaderIdx === leaderRoles) buildPicks();
    continue;
  }
  if (!builders[role]) die(`rules.formats.${FORMAT}.roles names "${role}", which scaffold.mjs cannot build`);
  if (!leaderRoles && !picksAfter && role === 'watch') buildPicks();
  builders[role]();
  // The weekly's sector leader (2026-10-10) is reviewed right after the industry ranking that named it.
  if (role === 'sectors') buildSectorPick();
  if (picksAfter && ri === fmt.roles.lastIndexOf(picksAfter)) buildPicks();
}
// A role whose material is missing adds no scene (each builder prints why). Count them here so a short reel never
// passes unnoticed — the first weekly edition has roles that have never been built for real.
{
  const left = [...fmt.roles];
  for (const s of scenes) { const i = left.indexOf(s.role); if (i >= 0) left.splice(i, 1); }
  if (left.length) console.log(`  roles: ${scenes.length} of ${fmt.roles.length} built — no scene for ${left.join(', ')}`);
}

for (const line of room.report) console.log(`  plate: ${line}`);

// ------------------------------------------------------------------ write

const reel = {
  title: `VNINDEX · ${FORMAT === 'daily' ? `tổng kết phiên ${F.session.dmy}` : `tổng kết tuần ${F.weekly.fromDm} → ${F.session.dmy}`}`,
  edition: date,
  format: FORMAT,
  status: 'scaffolded',
  rules: RULES_PATH,
  brief: fmt.brief,
  facts: FACTS,
  disclaimer: R.disclaimer,
  footer: R.footer,
  // rules.logo also rides at reel level: SceneShell hands it to the footer badge of every scene (without it
  // the ring shows the gold-dot fallback — seen on the 30/9 stills, 2026-10-01).
  ...(R.logo ? {logo: R.logo} : {}),
  ticker: FORMAT === 'daily'
    ? {symbol: R.market.tickerSymbol, timeframe: '1D', last: F.session.close, prev: F.session.prevClose, asOf: date}
    : {symbol: R.market.tickerSymbol, timeframe: '1W', last: F.weekly.close, prev: F.weekly.prevClose, asOf: date},
  ...(indexSource !== 'fireant.vn' ? {_indexPhoto: 'terminal (FireAnt capture unavailable)'} : {}),
  scenes,
};
if (OUT) {
  writeJson(OUT, reel);
  console.log(`${OUT}: ${scenes.length} scenes (skeleton only — ${fmt.content} and ${fmt.brief} untouched)`);
  process.exit(0);
}
writeJson(fmt.content, reel);

const brief = [
  `title: ${reel.title}`,
  `name: ${fmt.content.replace(/^content\/|\.json$/g, '')}`,
  'symbol: VNINDEX',
  `footer: ${R.footer}`,
  '',
  `# Sinh bởi scripts/review/scaffold.mjs từ ${FACTS} (${date}) — không sửa tay; sửa rules.json hoặc scaffold.mjs.`,
  `# Trạng thái: ${F.state.label} từ ${F.state.sinceDm} · ${F.distribution.count}/${F.distribution.window} phân phối · FTD ${ftd?.dmy ?? '—'} · ảnh chỉ số: ${indexSource}.`,
  '',
  ...briefs.flatMap((b) => [`## ${b.head}`, ...b.lines, '']),
].join('\n');
writeFileSync(abs(fmt.brief), brief);

console.log(`${fmt.content}: ${scenes.length} scenes · ~${round(scenes.reduce((a, s) => a + s.duration, 0), 0)} s · status scaffolded`);
for (const s of scenes) console.log(`  ${s.id.padEnd(22)} ${s.role.padEnd(8)} ${s.visual.type.padEnd(6)} ${String(s._words).padStart(3)} words  ${(s.visual.annotations ?? []).length} marks  ${s.visual.src ?? ''}`);
console.log(`\nNext: register ${fmt.composition} in src/Root.tsx (once), then npm run review-page -- ${fmt.composition} --out=out/review/draft-${FORMAT}`);
