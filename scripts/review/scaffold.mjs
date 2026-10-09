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
import {PATHS, RULES_PATH, abs, cli, die, exists, pngSize, readJson, round, rules, signed, tryJson, vi, writeJson, yymmdd} from './lib/common.mjs';
import {plateRoom} from './lib/plate-room.mjs';
import {fireantLeaderVisual} from './lib/leader-fireant.mjs';
import {boardOf} from './lib/board.mjs';
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
const est = (role) => round(targetWords(R, role) / R.narration.wordsPerSecond + R.audio.leadIn + R.audio.tail, 1);
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
const push = (role, {eyebrow = 'TODO', visual, beats, brief, act}) => {
  const n = role === 'leader' ? ++leaderN : role === 'pick' ? ++pickN : 0;
  const id = `${fmt.idPrefix}-${tag}-${role}${n ? `-${n}` : ''}`;
  scenes.push({
    id, role, eyebrow, act: act ?? roleSpec(R, role).act, duration: est(role),
    narration: 'TODO', beats, visual,
    ...(role === 'outro' ? {headline: {line1Baseline: 1338, line2Baseline: 1418, maxFontSize: 60, footnoteY: 1484}} : {}),
    _brief: brief.join(' '), _words: targetWords(R, role),
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
const outOfUptrend = inCorrection || inRally;
// The user's correction line (rules.status.CORRECTION.say, 2026-10-08) is about the first rally attempt's low; once that
// attempt has started, its low is on the chart and the line names it (a state's own `say` wins).
const attemptSay = R.status.RALLY_ATTEMPT?.say ?? R.status.CORRECTION.say ?? '';
const ftdRule = `FTD từ ngày ${F.rules.ftdMinDay}, +${vi(F.rules.ftdMinChangePercent)}%`;
// The FTD failed (the correction ended its uptrend): its plate says so (user 2026-10-08: "Emphasize the failure FTD"). On the
// session it is lost, the daily hook opens with the user's line on the FTD candle (rules.followThrough.lost: "Start with
// hook: Thị trường đã mất phiên FTD 3/8 & đang trong trạng thái nguy hiểm - append with existed content") and the market
// scene adds that the market is very dangerous ("mention the market is so dangerous right now on scene 1 and 3").
const ftdFailed = outOfUptrend && !!ftd?.ended;
const FL = R.followThrough.lost ?? null;
const ftdLostToday = FORMAT === 'daily' && !!FL && ftdFailed && ftd.ended.date === F.session.date;
const lostLine = (t) => t.replaceAll('{dm}', ftd?.dm ?? '');
const nextExp = outOfUptrend ? null : F.distribution.nextExpiry;
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

// hook — today's close first, then the day's words, the question and the promise (user, 2026-09-30).
// No system words: distribution days, FTD, the rules and the state wait for the market scene.
// Beat 1: today's candle ringed, the close and the HOSE advance/decline on plates; beat 2: the promise.
// The weekly edition opens on the week instead (its own skill since 2026-10-05): the week's close and change on the
// plate; the last session's advancers/decliners belong to its breadth scene.
const buildHook = () => {
  const T = F.session.breadthToday;
  const S = F.session;
  const W = FORMAT === 'weekly' ? F.weekly : null;
  // A weekly built before Friday (user 2026-10-06: "… of this week", run on Tue 6/10) speaks of the week SO FAR: no
  // "đóng tuần" while the week is still trading.
  const weekOpen = !!W && new Date(`${date}T00:00:00Z`).getUTCDay() < 5;
  // The weekly hook speaks of the WEEK: its sessions boxed on the daily chart (high to low), not Friday's candle alone.
  const weekBox = () => {
    const xs = daily.filter((b) => b.t >= W.from).map((b) => barX(index, daily, b.t)).filter((x) => x != null);
    if (!xs.length) return todayRing(0);
    const half = (index.calib.d * 0.7) / index.W;
    const top = priceY(index, W.high, indexUnit);
    const bottom = priceY(index, W.low, indexUnit);
    return {kind: 'box', x: clamp(Math.min(...xs) - half), y: clamp(top - 0.012), w: clamp(Math.max(...xs) - Math.min(...xs) + 2 * half), h: clamp(bottom - top + 0.024), accent: W.changePercent >= 0 ? 'up' : 'down', beat: 0};
  };
  // The session the FTD is lost (rules.followThrough.lost, user 2026-10-08): the daily hook opens WIDE on the FTD candle
  // with the user's line, then today's candle and the question as always — one beat more.
  const lost = !W && ftdLostToday && ftdVisible;
  const b0 = lost ? 1 : 0;
  const marks = [
    ...(lost ? [ftdArrow(ftd, ftdX, 0), lab(ftdX, clamp(ftdBase(ftd) + 0.03), `FTD ${ftd.dm} thất bại`, 'red', 0, 'middle')] : []),
    W ? weekBox() : todayRing(b0),
    W
      ? lab(clamp(lastX - 0.03), clamp(lastY - 0.11), `${weekOpen ? 'Tuần này' : 'Đóng tuần'} ${vi(W.close)} · ${fmtPct(W.changePercent)}`, W.changePercent >= 0 ? 'green' : 'red', 0, 'end')
      : lab(clamp(lastX - 0.03), clamp(lastY - 0.11), `Đóng cửa ${vi(S.close)} · ${fmtPct(S.changePercent)}`, S.changePercent >= 0 ? 'green' : 'red', b0, 'end'),
    ...(!W && !flowAfterHook && T?.up != null ? [lab(clamp(lastX - 0.03), clamp(lastY - 0.07), `${T.exchange}: ${T.up} tăng · ${T.down} giảm`, 'white', b0, 'end')] : []),
  ];
  const shots = [
    ...(lost ? [{beat: 0, x: clamp((ftdX + (lastX ?? 0.85)) / 2), y: clamp(((ftdY ?? lastY) + lastY) / 2 + 0.03), zoom: 1.3, move: 'pan'}] : []),
    {beat: b0, x: clamp((lastX ?? 0.85) - 0.07), y: clamp(lastY), zoom: 2.0, move: 'push_in'},
    {beat: b0 + 1, x: clamp((lastX ?? 0.85) - 0.1), y: clamp(lastY + 0.02), zoom: 1.6, move: 'pull_out'},
  ];
  push('hook', {
    beats: lost ? todoBeats(3, est('hook')) : todoBeats(2),
    visual: indexPhoto(room.settle(marks, shots)),
    brief: W ? [
      weekOpen
        ? `Câu đầu là TUẦN NÀY, CHƯA KHÉP LẠI (bản tuần chạy ${S.weekday} — người dùng 2026-10-06: "eval the VNIndex … of this week"): "Tuần này, tính tới ${S.weekday.toLowerCase()} ngày ${S.dm.replace('/', ' tháng ')}" đọc thành chữ (${W.sessions} phiên, từ ${W.fromDm}). Câu hai gọi tên chỉ số rồi ĐIỂM của phiên cuối và % của TUẦN TỚI NAY (so với đóng cửa tuần trước ${vi(W.prevClose)}): "VN-Index đang ở" ${vi(W.close)} (đọc tròn ${vi(Math.round(W.close), 0)}), ${fmtPct(W.changePercent)} so với cuối tuần trước — KHÔNG "đóng tuần" (tuần còn giao dịch).${W.volumeVsPriorWeek != null ? ` Khối lượng mỗi phiên ×${vi(W.volumeVsPriorWeek)} tuần trước để scene week nói.` : ''}`
        : `Câu đầu là TUẦN (bản tuần, skill weekly-review — người dùng tách 2026-10-05): "Tuần từ ${W.fromDm.replace('/', ' tháng ')} đến ${S.dm.replace('/', ' tháng ')}" đọc thành chữ. Câu hai gọi tên chỉ số rồi ĐIỂM ĐÓNG TUẦN và % của TUẦN (so với đóng cửa tuần trước ${vi(W.prevClose)}): "VN-Index đóng tuần ở" ${vi(W.close)} (đọc tròn ${vi(Math.round(W.close), 0)}), ${fmtPct(W.changePercent)}.${W.volumeVsPriorWeek != null ? ` Khối lượng mỗi phiên ×${vi(W.volumeVsPriorWeek)} tuần trước để scene week nói.` : ''}`,
      `Rồi câu hỏi "Tiền đang chảy vào đâu?" và LỜI MỜI: "Cùng mình điểm lại ${weekOpen ? 'tuần này' : 'tuần qua'} và những mã đáng chú ý nhé." — "điểm lại" thay "review" (TTS đọc tiếng Anh thất thường), "và" thay "&". Beat 2 ghim vào câu hỏi.`,
      `KHÔNG nhắc phiên phân phối, FTD, "theo quy tắc" hay trạng thái ở scene này (người dùng chốt 30/9) — chuyện hệ thống bắt đầu từ scene market. Hai số đọc ra lời là hai số của câu hai; số mã trên MA200 để scene breadth nói.`,
    ] : [
      ...(lost ? [`MỞ BẰNG CÂU CỦA NGƯỜI DÙNG (2026-10-08: "On scene 1: Start with hook: Thị trường đã mất phiên FTD 3/8 & đang trong trạng thái nguy hiểm - append with existed content for me"): "${lostLine(FL.say)}" — ngày của phiên FTD đọc thành chữ ("${ftd.dm.replace('/', ' tháng ')}"), "và" thay "&". Beat 1 ghim vào câu này: headline "${lostLine(FL.headline[0])}" / "${lostLine(FL.headline[1])}" (đỏ); máy mở rộng trên nến FTD ${ftd.dm} (mũi tên, nhãn "FTD ${ftd.dm} thất bại") rồi mới vào nến hôm nay. Sau câu mở là phần cũ của hook, GIỮ NGUYÊN khuôn dưới đây — mỗi câu lùi một: beat 2 ghim vào câu ngày (headline điểm số và %), beat 3 vào câu hỏi.`] : []),
      `Câu đầu là NGÀY của phiên: "${S.weekday}, ngày ${S.dm.replace('/', ' tháng ')}" đọc thành chữ (có chữ "ngày" sau thứ — người dùng 2026-10-01). Câu hai gọi tên chỉ số rồi ĐIỂM SỐ và % của phiên: "VN-Index đóng cửa" ${vi(S.close)} (đọc tròn ${vi(Math.round(S.close), 0)}), ${fmtPct(S.changePercent)}. ${flowAfterHook
        ? `KHÔNG đọc số mã tăng/giảm ở hook (người dùng 2026-10-05: bỏ câu "Chỉ số tăng: … mã tăng, … mã giảm" vì scene 02 — ảnh FireAnt "Biến động thị trường" — đọc chúng); headline beat 1 cũng không in số mã. Chữ do số quyết định của chỉ số: "${T?.indexWord ?? '—'}" (|Δ| < 0,3% = đi ngang).`
        : `Câu hai là hai chữ mà SỐ quyết định: chỉ số "${T?.indexWord ?? '—'}" (|Δ| < 0,3% = đi ngang), ${T?.breadthWord ?? '—'} (HOSE ${T?.up ?? '?'} tăng · ${T?.down ?? '?'} giảm · ${T?.flat ?? '?'} đứng giá; "phần lớn" chỉ khi một phía ≥ 60%).`}`,
      `Rồi câu hỏi "Tiền đang chảy vào đâu?" và LỜI MỜI (người dùng chốt 30/9, thay lời hứa "cuối video"): "Cùng mình điểm lại thị trường và những mã đáng chú ý nhé." — "điểm lại" thay "review" (TTS đọc tiếng Anh thất thường), "và" thay "&". Beat ${lost ? 3 : 2} ghim vào câu hỏi.`,
      lost
        ? 'Ngoài câu mở của người dùng, KHÔNG nhắc phiên phân phối, FTD, "theo quy tắc" hay trạng thái ở scene này (người dùng chốt 30/9) — chuyện hệ thống kể ở scene market. Hai số đọc ra lời là hai số của câu điểm số (ngày FTD trong câu mở là ngày, không tính).'
        : `KHÔNG nhắc phiên phân phối, FTD, "theo quy tắc" hay trạng thái ở scene này (người dùng chốt 30/9) — chuyện hệ thống bắt đầu từ scene market. Hai số đọc ra lời là hai số của câu đầu.`,
    ],
  });
};

// market — the count, the anchor, the clock. No condition here: that is the payoff's job.
const buildMarket = () => {
  const marks = [
    ...idxMarks(0),
    {...lab(...inC(0.5, 0.06), `${F.distribution.count}/${F.distribution.window} phiên phân phối`, 'red', 0), until: 1},
  ];
  if (biggest) marks.push(lab(biggest.x - 0.012, clamp(priceY(index, barOf(biggest.date).h, indexUnit) - GAP - ARROW / 2), `${biggest.dm} ${fmtPct(biggest.changePercent)} · KL ×${vi(biggest.volumeRatio)}`, 'red', 0, 'end'));
  marks.push(...ftdMarks(1));
  if (holdVisible) marks.push({kind: 'hline', y: clamp(holdY), accent: 'gold', beat: 1, label: `${holdName} ${vi(holdLow)}`, labelSide: 'left'});
  // A rally attempt adds no mark of its own: the gold line is the attempt's low and the beat-2 headline carries its day
  // (frame-audit 9/10: a "Ngày 1" plate collided with the beat-1 plates while the camera moved, and a ring on the last
  // candle sat in the path of the gold line's label as beat 3 pushed in).
  if (nextExpDd) marks.push(lab(nextExpDd.x - 0.012, clamp(priceY(index, barOf(nextExpDd.date).h, indexUnit) - GAP - ARROW - 0.04), `${nextExp.dm} hết hạn sau ${nextExp.sessionsLeft} phiên`, 'white', 2, 'end'));
  // A correction shows no rule plate (user 2026-10-08: "Not need mention the rule of FTD"): beat 3 keeps the correction low,
  // the low the first rally attempt has to hold (rules.status.CORRECTION.say).
  if (!outOfUptrend) marks.push(lab(...inC(0.5, 0.06), ladderText, dangerNow ? 'red' : 'gold', 2));
  const thresholdBrief = inRally
    ? `trạng thái ${F.state.since === F.session.date ? 'ĐỔI HÔM NAY' : 'đã là'}: "${F.state.label}" từ ${F.state.sinceDm} theo quy tắc, hôm nay là NGÀY ${F.state.rallyDay} của nỗ lực${F.state.day1?.date === F.session.date ? ` (phiên ${F.session.dm} lập đáy mới ${vi(F.session.low)} dưới đáy điều chỉnh cũ rồi rút chân, đóng cửa ở nửa trên biên độ — nói như trader: thủng đáy cũ rồi rút chân; KHÔNG đọc luật ngày 1)` : ''}. Số phiên phân phối KHÔNG còn đổi trạng thái: KHÔNG đồng hồ hết hạn, KHÔNG đếm tới ngưỡng nào, KHÔNG câu "${DG.say ?? 'mức nguy hiểm'}". Điều kiện kế: một phiên FTD MỚI (từ ${ftd?.dm ?? '—'} tới nay không có phiên FTD nào khác) — KHÔNG đọc luật của nó (FTD từ ngày ${F.rules.ftdMinDay}, +${vi(F.rules.ftdMinChangePercent)}% — người dùng 2026-10-08: "Not need mention the rule of FTD … Replace it with something meaningful"; nhãn scene watch mang luật). Câu người dùng chốt cho trạng thái điều chỉnh giờ có ĐÁY của nó trên chart: "${attemptSay}" — giữ nguyên chữ của người dùng (cả "phục hồi"); "đáy phiên nỗ lực phục hồi đầu tiên" là ${vi(holdLow)}, đáy của nỗ lực hôm nay (đường vàng). Gọi trạng thái bằng chữ của người dùng, "nỗ lực phục hồi", cả lời lẫn headline — không xen "hồi phục". Headline beat 3 mang hai ý: chờ phiên FTD, nguy cơ thủng đáy ${vi(holdLow)} rất cao. Thủng ${vi(holdLow)} là nỗ lực thất bại (để scene watch nói)`
    : inCorrection
    ? `trạng thái ${F.state.since === F.session.date ? 'ĐỔI HÔM NAY' : 'đã là'}: "${F.state.label}" từ ${F.state.sinceDm} theo quy tắc (${F.distribution.count} ≥ ${R.distribution.correctionAt} phiên phân phối${F.state.lastFtd?.ended ? `; phiên FTD ${F.state.lastFtd.dm} thất bại, kết thúc ${F.state.lastFtd.ended.dm}` : ''}) — nói rõ bằng lời người. Ở trạng thái điều chỉnh số phiên phân phối KHÔNG còn đổi trạng thái: KHÔNG đồng hồ hết hạn, KHÔNG đếm tới ngưỡng nào, KHÔNG câu "${DG.say ?? 'mức nguy hiểm'}" (đó là câu của mức nguy hiểm khi xu hướng tăng còn đứng). Điều kiện kế: phải TÌM MỘT PHIÊN FTD MỚI (người dùng 2026-10-08: "find the another FTD" — nói thành lời, như "Giờ phải tìm một phiên FTD mới."; từ ${ftd?.dm ?? '—'} tới nay không có phiên FTD nào khác), nhưng KHÔNG đọc luật của nó (ngày 1, FTD từ ngày ${F.rules.ftdMinDay} — người dùng 2026-10-08: "Not need mention the rule of FTD … Replace it with something meaningful"); thay vào đó là câu người dùng chốt: "${R.status.CORRECTION.say ?? ''}" — chữ của người dùng, "đáy" là đáy mà nỗ lực phục hồi đầu tiên phải giữ: đáy điều chỉnh ${vi(F.state.correctionLow)} (đường vàng beat 3). Headline beat 3 mang hai ý: tìm phiên FTD mới, nguy cơ thủng đáy rất cao. Thủng ${vi(F.state.correctionLow)} là đáy điều chỉnh mới (để scene watch nói)`
    : F.distribution.toUnderPressure > 0
    ? `"chỉ cần thêm ${F.distribution.toUnderPressure} phiên phân phối nữa là xu hướng bắt đầu ${R.status.UNDER_PRESSURE.short.toLowerCase()}"${inUptrend && F.distribution.toDanger > 0 ? `; mức nguy hiểm của hệ thống người dùng (${F.distribution.dangerAt} phiên) để nhãn nói` : ''}`
    : dangerNow
      ? `ĐANG Ở MỨC NGUY HIỂM của hệ thống người dùng (${F.distribution.count} ≥ ${F.distribution.dangerAt} phiên phân phối, người dùng 2026-10-01) — scene PHẢI CẢNH BÁO: nói "mức nguy hiểm" và "${DG.action}" như một bước quản trị rủi ro của hệ thống ("theo hệ thống của mình"), không gọi mua bán; verify FAIL nếu market không có chữ "nguy hiểm". Trạng thái vẫn là "${F.state.label}" từ ${F.state.sinceDm}; ${DG.say
        // The user's line for the danger level (rules.distribution.danger.say, 2026-10-05) replaces the countdown to the
        // correction ("Thêm một phiên nữa là điều chỉnh." on 2/10); the threshold itself stays on the beat-3 plate and in watch.
        ? `rồi câu người dùng chốt 2026-10-05, THAY câu đếm tới điều chỉnh (KHÔNG "thêm ${F.distribution.toCorrection} phiên phân phối nữa là thị trường điều chỉnh" — bản 2/10 "Thêm một phiên nữa là điều chỉnh."): "${DG.say}" — giữ hai ý (xác suất biến động hoặc điều chỉnh lớn; thị trường không còn khỏe), chữ của người dùng, viết "khỏe"; ngưỡng điều chỉnh (${R.distribution.correctionAt} phiên) để nhãn beat 3 và scene watch nói. Câu này ${DG.say.split(/\s+/).length} chữ, dài hơn câu cũ; market vẫn trần ${R.narration.maxWordsPerScene} chữ (bản 2/10 đã ${R.narration.maxWordsPerScene}): gọn câu khác, không cắt câu của người dùng`
        : `ngưỡng kế là điều chỉnh: "thêm ${F.distribution.toCorrection} phiên phân phối nữa là thị trường điều chỉnh"`}`
      : inUptrend && F.distribution.toDanger > 0
        ? `trạng thái ĐÃ là "${F.state.label}" từ ${F.state.sinceDm} (đếm ${F.distribution.count} ≥ ${F.rules.underPressureAt}) — nói rõ xu hướng đã chuyển sang chịu áp lực và từ phiên nào; ngưỡng kế là MỨC NGUY HIỂM của hệ thống người dùng (${F.distribution.dangerAt} phiên phân phối, người dùng 2026-10-01): "chỉ cần thêm ${F.distribution.toDanger} phiên nữa là mức nguy hiểm, phải ${DG.action}" — bước quản trị rủi ro của hệ thống, không gọi mua bán; điều chỉnh (${R.distribution.correctionAt} phiên) để nhãn và scene watch nói`
        : `trạng thái ĐÃ là "${F.state.label}" từ ${F.state.sinceDm} (đếm ${F.distribution.count} ≥ ${F.rules.underPressureAt}) — nói rõ xu hướng đã chuyển sang chịu áp lực và từ phiên nào; ngưỡng kế là điều chỉnh: "thêm ${F.distribution.toCorrection} phiên phân phối nữa là thị trường điều chỉnh"`;
  const shots = [
    {beat: 0, x: clamp(ddCentre), y: inC(0, 0.42)[1], zoom: 1.5, move: 'pan'},
    {beat: 1, x: clamp(ftdVisible ? (ftdX + (lastX ?? 0.9)) / 2 : inC(0.5, 0)[0]), y: clamp(holdVisible ? (holdY + lastY) / 2 : inC(0, 0.5)[1]), zoom: 1.15, move: 'tilt'},
    {beat: 2, x: clamp((nextExpDd?.x ?? lastX ?? 0.85) - 0.02), y: clamp(recentTop + 0.1), zoom: 2.1, move: 'push_in'},
  ];
  push('market', {
    act: warnAct,
    beats: todoBeats(3),
    visual: indexPhoto(room.settle(marks, shots)),
    brief: [
      `Beat 1 — mở bằng HÔM NAY: ${F.session.isDistribution ? 'LÀ phiên phân phối' : 'KHÔNG phải phiên phân phối'} (${fmtPct(F.session.changePercent)}, KL ×${vi(F.session.volumeRatio)}), rồi ĐẾM theo khuôn người dùng chốt 1/10: "${countSentence}" (số đọc thành chữ; KHÔNG "đếm lại còn …") — ${F.distribution.count}/${F.distribution.window} phiên: ${dd.map((d) => `${d.dm} ${fmtPct(d.changePercent)} KL ×${vi(d.volumeRatio)}`).join('; ') || 'không có'}. Không kể phiên nặng nhất (người dùng chốt 30/9). Phân phối = giảm từ ${F.rules.ddMaxChangePercent}% với KL cao hơn phiên trước.`,
      inRally
        ? `Beat 2 — HÔM NAY là ngày ${F.state.rallyDay} của nỗ lực phục hồi theo quy tắc${F.state.day1?.date !== F.session.date ? ` (ngày 1 là ${F.state.day1?.dm ?? '—'}; đáy của nỗ lực vẫn giữ)` : F.session.changePercent < 0 ? ` — phiên giảm nhưng lập đáy mới của nhịp điều chỉnh (${vi(F.session.low)}) rồi rút chân, đóng ${vi(F.session.close)} ở nửa trên biên độ: nói như trader ("thủng đáy … rồi rút chân"), không đọc luật` : ' — phiên đóng cửa tăng đầu tiên của nhịp điều chỉnh'}. ${ftdVisible && ftd.ended ? `Nhãn FTD ${ftd.dm} trên chart giữ "· thất bại" (thất bại hôm ${ftd.ended.dm}); lời không cần kể lại. ` : ''}${holdName} ${holdLow != null ? vi(holdLow) : '—'} là đường vàng${holdLow === F.session.low ? ' — đáy của chính phiên hôm nay' : ''}; trên chart không có nhãn "ngày 1" — headline beat 2 mang nó. Headline beat 2 gọi tên trạng thái bằng chữ của người dùng: "Nỗ lực phục hồi" và ngày ${F.state.rallyDay}.`
        : inCorrection
        ? `Beat 2 — ${ftdVisible ? `phiên FTD ${ftd.dmy} (ngày ${ftd.day}, ${fmtPct(ftd.changePercent)}) ${ftd.ended ? `ĐÃ THẤT BẠI — kết thúc ${ftd.ended.dm}${ftd.ended.why === 'distribution' ? ' vì phiên phân phối thứ ' + F.distribution.count : ' vì thủng đáy nhịp hồi'}; nói đúng chữ "phiên FTD … đã thất bại" (người dùng 2026-10-08: "Emphasize the failure FTD"), nhãn trên chart "FTD ${ftd.dm} ${fmtPct(ftd.changePercent)} · thất bại"` : ''}; ` : ''}${ftdLostToday ? 'rồi MỘT câu ngắn, không số: thị trường đang RẤT NGUY HIỂM (người dùng 2026-10-08: "mention the market is so dangerous right now on scene 1 and 3"); headline beat 2 mang cả hai ý (FTD thất bại, nguy hiểm); ' : ''}${holdName.toLowerCase()} ${holdLow != null ? vi(holdLow) : '—'} (đường vàng${holdLow === F.session.low ? ' — đáy của chính phiên hôm nay' : ''}).`
        : ftdVisible
        ? `Beat 2 — neo của xu hướng: FTD ${ftd.dmy} (ngày ${ftd.day}, ${fmtPct(ftd.changePercent)}, KL ×${vi(ftd.volumeRatio)}) và đáy nhịp hồi ${vi(ftd.rallyLow)} (đường vàng).`
        : `Beat 2 — ${holdName.toLowerCase()} ${holdLow != null ? vi(holdLow) : '—'}.`,
      // A state's on-screen headline (rules.status.<state>.headline, user 2026-10-05) replaces the state's name in
      // beat 2's headline; the narration still names the state "theo quy tắc".
      ...(R.status[F.state.status]?.headline ? [`Headline beat 2 (line2): "${R.status[F.state.status].headline}" — người dùng 2026-10-05 thay tên trạng thái "${R.status[F.state.status].vi}" trên màn hình bằng câu này ("something like": được chỉnh chữ, giữ ý sức khỏe thị trường đang yếu, viết "khỏe"); KHÔNG in "${R.status[F.state.status].vi}" làm headline nữa. Lời vẫn gọi trạng thái theo quy tắc.`] : []),
      outOfUptrend
        ? `Beat 3 — điều kiện kế: ${thresholdBrief}. Gọi "phiên FTD" (lexicon đọc "ép tê đi").`
        : `Beat 3 — đồng hồ: ${nextExp ? `phiên ${nextExp.dm} hết hạn sau ${nextExp.sessionsLeft} phiên` : 'không phiên nào sắp hết hạn'}; ngưỡng kế nói bằng lời người — ${thresholdBrief} — KHÔNG kiểu "thêm một là…, thêm ba là…" (người dùng bác 30/9); ngưỡng còn lại để nhãn và scene watch nói. Gọi "phiên FTD" (lexicon đọc "ép tê đi").`,
      // The bridge follows the scene that really comes next: the daily hands over to FireAnt's "Biến động thị trường"
      // (flow), the weekly to the breadth line — and to the filter boards when that scene is dropped (no photo of this
      // session / no breadth counts), where "Nhìn rộng ra thì sao?" would dangle.
      `Đây là BỐI CẢNH, chưa phải điều kiện (câu nếu … thì để dành cho watch). ${afterMarket === 'breadth' || afterMarket === 'flow'
        ? 'Kết bằng câu dẫn sang độ rộng thị trường, dạng câu hỏi: "Nhìn rộng ra thì sao?".'
        : afterMarket === 'watch'
        ? `Scene sau là THẲNG kịch bản VN-Index (bản này không có bảng bộ lọc hay scene soi mã: ${SCREENER_DOWN ?? 'không có mã nào'}). Kết bằng MỘT câu hỏi ngắn dẫn sang kịch bản cho phiên tới, như "Vậy phiên tới có những kịch bản nào?"; KHÔNG nhắc bộ lọc, KHÔNG lặp câu "Tiền chảy vào đâu?" của hook.`
        : `Kết bằng MỘT câu hỏi ngắn trao lời cho các bộ lọc (scene sau là ${afterMarket === 'spike' ? 'bảng Volume spike' : afterMarket}; ${fmt.roles.includes('flow') ? (flowBuilt ? 'scene Biến động thị trường đã đứng ngay sau hook' : 'scene Biến động thị trường bị bỏ ở bản này vì ảnh FireAnt không phải của phiên này') : fmt.roles.includes('breadth') ? 'scene độ rộng bị bỏ ở bản này vì pack không có số độ rộng' : 'không có scene độ rộng'}), như "${FORMAT === 'weekly' ? 'Bộ lọc cuối tuần bắt được gì?' : 'Bộ lọc hôm nay bắt được gì?'}"; KHÔNG lặp câu "Tiền chảy vào đâu?" của hook.`}`,
      ...(FORMAT === 'weekly' && F.weekly ? [`Bản tuần: kể chuyện của TUẦN — phiên phân phối mới trong tuần: ${F.weekly.distributionDays.map((d) => `${d.dm} ${fmtPct(d.changePercent)}`).join('; ') || 'không có'}; đổi trạng thái trong tuần: ${F.weekly.transitions.map((x) => `${x.dm} ${x.from} → ${x.to}`).join('; ') || 'không'}. "Hôm nay" của beat 1 là phiên cuối tuần (${F.session.dm}).`] : []),
    ],
  });
};

// breadth — weekly only (user 2026-10-05: "Daily; old chart → weekly"): the old "Độ rộng thị trường" — the paradox on
// the share of stocks above SMA200 (scripts/review/breadth.mjs) under the index line.
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
    const countDown = L.countChange < 0;
    const indexDown = L.indexChangePercent < 0;
    const story = indexDown === countDown
      ? (countDown
        ? `CÙNG CHIỀU: chỉ số giảm ${vi(Math.abs(L.indexChangePercent), 1)}% và số mã trên MA200 cũng giảm (${L.countFirst} → ${L.countLast} trên đường) — điểm yếu lan rộng, không chỉ vài mã trụ`
        : `CÙNG CHIỀU: chỉ số tăng ${vi(Math.abs(L.indexChangePercent), 1)}% và số mã trên MA200 cũng tăng (${L.countFirst} → ${L.countLast} trên đường) — đà tăng có độ rộng`)
      : (countDown
        ? `NGHỊCH LÝ: chỉ số tăng ${vi(Math.abs(L.indexChangePercent), 1)}% mà số mã trên MA200 lại giảm (${L.countFirst} → ${L.countLast} trên đường) — chỉ số được vài mã kéo, phần lớn cổ phiếu yếu đi`
        : `NGHỊCH LÝ: chỉ số giảm ${vi(Math.abs(L.indexChangePercent), 1)}% mà số mã trên MA200 lại tăng (${L.countFirst} → ${L.countLast} trên đường) — cổ phiếu khỏe hơn chỉ số`);
    const next = fmt.roles[fmt.roles.indexOf('breadth') + 1];
    push('breadth', {
      beats: todoBeats(2),
      visual: {
        type: 'lines',
        caption: `TERMINAL: ${K.above}/${K.with} MÃ${liquidWord} TRÊN SMA200 · ${vi(K.percent, 1)}%`,
        top: {label: 'VN-INDEX · ĐÓNG CỬA', points: B.history.map((h) => [h.t, h.indexClose]), unit: 'points'},
        bottom: {label: `SỐ MÃ${liquidWord} TRÊN SMA200 · GIÁ SSI`, points: B.history.map((h) => [h.t, h.above]), accent: countDown ? 'red' : 'green', unit: 'points', tag: false},
        events,
      },
      brief: [
        `CON SỐ người dùng hỏi (2026-10-06: "amount of stock have price better than its SMA200"): terminal đếm ${K.above} trên ${K.with} mã${K.floor > 0 ? ` có thanh khoản (KL TB20 ≥ ${K.floor.toLocaleString('vi-VN')} cp)` : ' có SMA200'} đóng cửa trên MA200 = ${vi(K.percent, 1)}% (screener.breadth.count) — ĐỌC con số này ("hai trăm bốn mươi bảy trên chín trăm lẻ một mã" — viết "linh", lexicon đọc "lẻ"; hoặc "chưa tới ba mươi phần trăm"). Headline beat 2 ghi đúng "${K.above}/${K.with} mã${K.floor > 0 ? ' có thanh khoản' : ''} trên SMA200" — caption đã in số này; gọi chỉ báo là MA200 trong lời (người dùng 2026-10-01).`,
        `${story}. Hai đường cùng trục thời gian (${L.sessions} phiên, ${L.fromDm} → ${F.session.dm}): VN-Index ${vi(L.indexFirst)} → ${vi(L.indexLast)}; số mã trên MA200 đỉnh ${L.countPeak} ngày ${L.countPeakDm}. Beat 1 = đường chỉ số vẽ ra; beat 2 = đường số mã vẽ ra (câu "còn số mã …"). Đường dưới TÍNH LẠI từ giá đóng cửa SSI (terminal không giữ lịch sử) nên điểm cuối ${L.countLast} lệch ${L.residual != null ? `${L.residual > 0 ? '+' : ''}${L.residual}` : '?'} mã so với số của terminal: KHÔNG đọc số của đường, KHÔNG ghép số của đường (${L.countFirst}) với số terminal (${K.above}) trong một câu — chiều của đường nói bằng chữ ("giảm dần từ đầu tháng bảy").`,
        W ? `Tuần này: ${W.screenerFrom != null ? `terminal ${W.screenerFrom} mã ngày ${W.fromDm} → ${K.above} hôm nay (${W.screenerChange > 0 ? '+' : ''}${W.screenerChange})` : `đường ${W.lineFrom} → ${W.lineTo} mã (${W.lineChange > 0 ? '+' : ''}${W.lineChange})`} — nói bằng chữ (gần như không đổi / thêm / bớt), không thêm số thứ ba.` : 'Không có phiên của tuần trước trên đường — không nói thay đổi trong tuần.',
        `Tối đa hai số đọc ra lời. Kết bằng câu dẫn sang scene sau${next === 'sectors' ? ' (xếp hạng nhóm ngành): một câu hỏi như "Vậy nhóm ngành nào còn khỏe?"' : `, dạng câu hỏi ngắn ("Bộ lọc tuần này bắt được gì?")`}.`,
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
  const shots = IM
    ? [
      {beat: 0, x: 0.5, y: clamp(js.card.money.y + js.card.money.h / 2), zoom: 2, move: 'push_in'},
      {beat: 1, x: 0.5, y: clamp(js.card.impact.y + js.card.impact.h / 2), zoom: 2, move: 'tilt'},
    ]
    : [
      {beat: 0, x: clamp(G.cx), y: clamp(G.cy), zoom: 1.75, move: 'push_in'},
      {beat: 1, x: 0.5, y: 0.5, zoom: 1, move: 'pull_out'},
    ];
  const leadWord = FL.moneyLead === 'up' ? 'tăng' : 'giảm';
  push('flow', {
    eyebrow: 'Biến động thị trường',
    beats: todoBeats(2),
    visual: imageOf(p, 'fireant.vn', {...(crop ? {crop} : {}), annotations: marks, shots}),
    brief: [
      `ẢNH FIREANT "Thống kê sàn", sàn ${FL.exchange}, phiên ${FL.dm} — ${FORMAT === 'weekly' ? 'PHIÊN CUỐI TUẦN: FireAnt chỉ hiện phiên mới nhất, nên đây là MỘT phiên, không gán cho cả tuần' : 'PHIÊN HÔM NAY (FireAnt chỉ hiện phiên mới nhất; ảnh được nhận vì chỉ số trên trang bằng giá đóng cửa của phiên)'}. Trái: ${FL.up} mã tăng, ${FL.down} mã giảm, ${FL.flat} mã đứng giá (${FL.countWord}). Phải, phân bổ dòng tiền: ${vi(FL.money.up, 1)} tỷ vào mã tăng, ${vi(FL.money.down, 1)} tỷ vào mã giảm, ${vi(FL.money.flat, 1)} tỷ mã đứng giá — ${FL.moneyWord}, tiền vào mã ${leadWord} gấp ${vi(FL.moneyLeadRatio)} lần phía kia (${vi(FL.moneyPercent[FL.moneyLead], 1)}% tổng ${vi(FL.money.total, 1)} tỷ).`,
      ...(flowAfterHook ? [`SCENE 02, ngay sau hook (người dùng 2026-10-05: "move it into the scene 02"): trả lời câu hỏi "Tiền chảy vào đâu?" của hook bằng ảnh này; hook KHÔNG còn đọc số mã nên scene này ĐỌC số mã tăng và giảm thành chữ (${FL.up} mã tăng, ${FL.down} mã giảm), rồi dòng tiền. Kết bằng câu dẫn sang scene market (chuyện hệ thống: phiên phân phối, trạng thái theo quy tắc), không phải sang bộ lọc.`] : []),
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
const NUM_VI = ['không', 'một', 'hai', 'ba', 'bốn', 'năm'];
/** The names the reel reviews after the boards, in the order their scenes play: the leaders (weaker RS 1M first, top[0]
 * last), then the names the user asked for on the review page. A board lights the ones it shows (lib/board.mjs). */
const reviewOrder = () => [...(F.screener.leaders?.top ?? [])].reverse().map((x) => x.symbol).concat((F.screener.requested ?? []).map((x) => x.symbol));
/** Tickers in speech, separated by WORDS so their spelled letters never run together ("MSR và DGW", "A, rồi B và C"). */
const sayTickers = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', rồi ')} và ${list[list.length - 1]}`);
/** A requested name gets its pick scene only with a photo (buildPicks drops it otherwise). */
const pickHasPhoto = (L) => !!(photo(`${L.symbol.toLowerCase()}-fireant`)?.calib || photo(`${L.symbol.toLowerCase()}-terminal`));
/**
 * `beats`: the board's beat count (a drawn board with no focus row has one). The invitation names the leader scenes that
 * are built (leaderTotal), in the order they play; with none — the daily reviews only the names in all three filters since
 * 2026-10-06 — it names the picks that get a scene, and with neither the board bridges to the VN-Index scenario.
 */
const countdownBrief = (beats = 2, scene = null) => {
  // Tier order (the weekly, 2026-10-06): the board that feeds a review invites ONLY its own pick (tierScene = the board).
  const own = tierOrder && scene ? tierPicks.filter((x) => x.tierScene === scene) : null;
  const leaders = own ?? [...(F.screener.leaders?.top ?? [])].slice(0, leaderTotal).reverse();
  const order = own ?? (leaders.length ? leaders : (F.screener.requested ?? []).filter(pickHasPhoto));
  const n = order.length;
  const pin = beats > 1 ? 'Câu ghim beat 2 — câu CUỐI —' : 'Câu CUỐI (bảng này chỉ một beat)';
  if (!n) return `Hôm nay KHÔNG có scene soi mã sau bảng này: KHÔNG mời "xem kỹ" mã nào. ${pin} là câu dẫn sang kịch bản VN-Index ("Còn VN-Index thì sao?" là được), không mang mã. KHÔNG nói vì sao không soi mã, không "không mã nào có mặt ở cả ba bộ lọc" — luật chọn mã (rules.formats.${FORMAT}.leaders) là việc của đạo diễn, không lên lời (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter").`;
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
  const meaning = feeds ? ` Điều riêng của ${S.filter}: nghĩa của bộ lọc (${describeFilter(savedFilter(S.filter)) || 'điều kiện đã lưu'} — lời nói "giá trên EMA50, EMA50 trên MA200") và mã đứng đầu bảng này.` : '';
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
const buildOwnBoard = (scene) => {
  const S = F.screener[scene];
  if (!S?.top?.length) {
    console.log(`  ${scene}: dropped — ${!S ? `${FACTS} has no screener.${scene} (pull.mjs pulls rules.formats.${FORMAT}.screener.scenes since 2026-10-06, then facts.mjs)` : `no stock passed "${S.filter}" this session`}`);
    return;
  }
  const table = boardOf({scene, F, R, roles: fmt.roles});
  const kind = S.signalKind;
  const f = savedFilter(S.filter);
  const rs1mMin = (f?.conditions ?? []).find((c) => c.field === 'rs_1m')?.value;
  const others = Object.keys(fmt.screener?.scenes ?? {}).filter((k) => k !== scene).map((k) => F.screener[k]?.filter).filter(Boolean);
  const shared = S.top.filter((x) => (x.filters ?? []).some((n) => others.includes(n))).map((x) => x.symbol);
  // The board opens a review when a leader role follows it and its own pick gets that scene (the leader loop's test).
  const feeds = fmt.roles[fmt.roles.indexOf(scene) + 1] === 'leader' && (tierOrder ? tierPicks.some((x) => x.tierScene === scene) : table.focus.length > 0);
  push(scene, {
    beats: todoBeats(table.beats),
    visual: table.visual,
    brief: [
      `Bộ lọc "${S.filter}" của terminal (${[describeFilter(f), describeGroups(f)].filter(Boolean).join(' · ') || 'điều kiện đã lưu'}): ${S.count} mã — ${S.confirmed} ${kind ?? ''} xác nhận, ${S.potential} tiềm năng; tuần này (từ thứ Hai ${S.weekOf ? S.weekOf.slice(8, 10).replace(/^0/, '') + '/' + Number(S.weekOf.slice(5, 7)) : '—'}) ${S.weekUp} mã tăng, ${S.weekDown} mã giảm. Bảng vẽ ${table.visual.rows.length} mã xếp theo RS 1M giảm dần, mỗi dòng: ${table.visual.columns.map((c) => ({...BOARD_COLUMN_VI, weekChange: '% tuần', signal: 'tín hiệu (xác nhận / tiềm năng)', rs3m: 'RS 3M'})[c] ?? c).join(' · ')} — ${table.rowLines.join('; ')}. ${table.beatLine}`,
      `Nghĩa của bộ lọc, nói như trader: cổ phiếu đang có sức mạnh giá (RS 1M từ ${rs1mMin ?? '—'}, RS 3M và RS 52W từ 70, thanh khoản trung bình hai mươi phiên từ một triệu cổ phiếu) và ${OWN_MEANING[kind] ?? 'tín hiệu đã lưu'}.${kind === 'breakdown' ? ' Đây là danh sách CẢNH BÁO: mã đang mạnh mà gãy hoặc sắp gãy hỗ trợ — nói là phải canh rủi ro, KHÔNG phải lời khuyên bán.' : ' Đây là danh sách để THEO DÕI, không phải lời khuyên mua.'}`,
      `Lời không đọc hết bảng: số mã của bộ lọc, một hai mã đầu bảng (gọi MÃ, tách bằng chữ), một nhận xét từ cột % TUẦN hoặc cột tín hiệu (bao nhiêu mã đã xác nhận). Tối đa hai số đọc ra lời. Gọi đúng tên bộ lọc: "bộ lọc ${S.filter}" (tên trader của terminal, lexicon đọc — không dịch thành "đà tăng", "động lượng phá vỡ"). Đây là bản TUẦN: nói "tuần này", không "hôm nay".`,
      `${NO_OVERLAP}${shared.length ? ` (Chỉ cho đạo diễn, KHÔNG lên lời: ${shared.join(', ')} cũng qua bộ lọc ${others.join(' / ')} — không nói ra, không gọi tên bộ lọc kia trong câu có mã.)` : ''}`,
      feeds
        ? `${countdownBrief(table.beats, scene)} Bản tuần: mỗi bộ lọc MỘT mã soi (người dùng chọn "Top of each filter") — lời mời CHỈ gọi mã của bảng này, KHÔNG gọi mã soi của bảng Momentum kia.`
        : `Bảng này không mở scene soi mã: KHÔNG mời "xem kỹ" mã nào. Câu cuối dẫn sang scene sau (${fmt.roles[fmt.roles.indexOf(scene) + 1] ?? '—'}), không mang mã.`,
    ],
  });
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
const LONE_REVIEW = 'Mã đáng chú ý hôm nay';
/** The requested names that get a pick scene (a photo); with the leader scenes they are the reel's symbol reviews. */
const pickTotal = () => (F.screener.requested ?? []).filter(pickHasPhoto).length;
/** The opener of leader scene `rank` (rank 1 = top[0], played last): "Mã đầu tiên" / "Mã thứ hai", or LONE_REVIEW. */
const ordOf = (rank) => (leaderTotal + pickTotal() === 1 ? LONE_REVIEW : ORD_VI[leaderTotal - rank + 1] ?? 'Mã tiếp theo');
/** Why the name was picked (its filters, its tier) is the director's, never the speech's (user 2026-10-05: "Not need
 * mentioned the stock on specific filter existed on other filter"): the brief keeps it as context only. */
const leaderNoFilters = (L, ord = ORD_VI[1]) => `(Chỉ cho đạo diễn, KHÔNG lên lời: qua bộ lọc hôm nay ${(L.filters ?? []).join(' · ') || '—'}${L.tier != null ? `, tầng ${L.tier} của phần soi mã` : ''}.) Scene KHÔNG nói mã này có ở bộ lọc nào, không "cả ba / cả hai bộ lọc", không "cũng ở …", không nhắc bảng của scene trước (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter"; verify \`review-overlap\` FAIL) — câu đầu gọi thứ tự và mã ("${ord} là ${L.symbol}.") rồi vào price action.`;
/** A volume detail written for leaders still says "vừa đột biến khối lượng vừa dẫn dắt" (lib/leader-fireant.mjs) — filter talk. */
const noLeaderTag = (detail) => String(detail ?? '').replace(/ — mã vừa đột biến khối lượng vừa dẫn dắt/g, '');
// A name the user asked for on the review page (user 2026-10-05: "… i can choose and fill the symbol on the artifact to
// review beside existed symbol on 3 filter"; screener.requested) is built like a leader and pushed as a `pick` scene:
// the leader brief's ordinal line gives way to the pick's own (built with rank 0).
const asPick = (brief, L, n) => [
  `SOI THÊM — mã thứ ${n} người dùng chọn trên trang duyệt, ${leaderTotal ? 'sau các mã của bộ lọc' : 'hôm nay không có scene soi mã từ bộ lọc nên mã chọn đầu tiên mở phần soi mã'}: ${L.symbol} (${L.name ?? '—'}, ${L.exchange ?? '—'}): giá ${vi(L.price)} nghìn đồng, ${fmtPct(L.changePercent)} hôm nay, RS 1M ${L.rs1m ?? '—'}, RS 52W ${L.rs52w ?? '—'}${L.volumeVsSma20Percent != null ? `, KL ${fmtPct(L.volumeVsSma20Percent, 0)} so TB20` : ''}. (Chỉ cho đạo diễn: ${L.filters?.length ? `có mặt ở bộ lọc ${L.filters.join(', ')}` : 'không nằm trong ba bộ lọc hôm nay'}.) Lời KHÔNG nói mã này có hay không có ở bộ lọc nào (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter"; verify \`review-overlap\` FAIL), KHÔNG nói "bạn chọn" / "theo yêu cầu".`,
  // A pick is not a leader: the brief's first line (the leader's ordinal and context) gives way to the line above.
  ...brief.slice(1).filter((l) => !String(l).startsWith('Cùng khuôn câu') && !String(l).startsWith(LONE_LEADER)).map(noLeaderTag),
  // No leader scene before it (the daily reviews only the names in all three filters since 2026-10-06): the first pick
  // opens the reviews like a first leader would.
  `Câu đầu: "${!leaderTotal && n === 1 ? `${pickTotal() === 1 ? LONE_REVIEW : 'Mã đầu tiên'} là ${L.symbol}.` : `Thêm một mã đáng chú ý là ${L.symbol}, …`}" — chữ "là" tách cụm khỏi chữ cái đầu (voice.letters đánh vần); eyebrow "Soi mã · ${L.symbol}"; cùng phương pháp với scene soi mã của bộ lọc: price action trước, MA50/MA200 của FireAnt, một thế giá, nhánh nếu … thì không gọi giá.`,
];
const pushLeader = (pick, L, spec) => push(pick ? 'pick' : 'leader', pick ? {...spec, brief: asPick(spec.brief, L, pick)} : spec);
/** The pick scenes, right after the last leader scene; a name with no photo is dropped with the reason printed. */
// `n` counts the picks that get a scene, so the first BUILT pick is pick 1 even when an earlier request had no photo.
const buildPicks = () => {
  let n = 0;
  for (const L of F.screener.requested ?? []) {
    const sym = L.symbol.toLowerCase();
    if (!pickHasPhoto(L)) {
      console.log(`  pick ${L.symbol}: dropped — no photo public/${DIR}/${sym}-fireant.png (calibrated) or ${sym}-terminal.png (node scripts/review/shots.mjs --format=${FORMAT} --only=requested, or --only=requested-terminal)`);
      continue;
    }
    buildLeader(L, 0, ++n);
  }
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

// watch — the payoff: what changes the state, said as if-then. Static camera on beat 2.
const buildWatch = () => {
  // "Kịch bản VN-Index" (user 2026-10-05: "also include the scene relate to the scenario of the market VN-Index", then
  // "Upgrade the closing scene"): the payoff draws the index's two paths from the pack's `scenario` — beat 1 the bull path
  // (the zones overhead: FireAnt's MA and the price-action resistance merged), beat 2 the bear path (the supports under it,
  // the FTD rally low among them) with the rule plates kept (one more distribution day, the danger level). Without a
  // scenario block it falls back to the rule levels alone.
  const SC = F.scenario;
  const marks = [];
  const zoneText = (z) => z.members.map((m) => `${m.kind === 'ma' ? m.name : m.name.charAt(0).toUpperCase() + m.name.slice(1)} ${vi(m.price)}`).join(' · ');
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
  marks.push(lab(clamp(lastX - 0.03), clamp(lastY - 0.1), outOfUptrend ? `Chờ ${ftdRule}` : `Thêm ${nextState.n} phiên phân phối → ${nextState.name.toLowerCase()}`, 'red', 1, 'end'));
  if (dangerNow) marks.push(lab(clamp(lastX - 0.03), clamp(lastY - 0.14), `${DG.vi}: ${DG.action}`, 'red', 1, 'end'));
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
    beats: todoBeats(2),
    visual: indexPhoto(room.settle(marks, shots)),
    brief: [
      `KỊCH BẢN VN-INDEX — payoff (người dùng 2026-10-05: "also include the scene relate to the scenario of the market VN-Index", chọn nâng cấp scene cuối): hai nhánh NẾU … THÌ theo price action của chính chỉ số (đóng cửa ${vi(F.session.close)}), không gọi giá, không lời khuyên.`,
      `Beat 1 — kịch bản tích cực: các mốc phía trên, gần trước: ${upText}. Khuôn: "Kịch bản tích cực: nếu VN-Index vượt <mốc 1> thì <mốc 2> là mốc kế." Gọi tên MA50 / MA200 (của FireAnt) và "kháng cự" như trader.`,
      inRally
        ? `Beat 2 — kịch bản tiêu cực: các mốc phía dưới, gần trước: ${downText}. Mốc đầu là ĐÁY NỖ LỰC PHỤC HỒI ${vi(holdLow)} (đường vàng, nhãn "Thủng ${vi(holdLow)} → ${rallyOutcome}"): khuôn "Kịch bản tiêu cực: nếu thủng <đáy nỗ lực> thì nỗ lực phục hồi thất bại, chỉ số về <mốc kế>." — KHÔNG "FTD thất bại" (chưa có FTD mới; phiên FTD ${ftd?.dm ?? ''} đã thất bại${ftd?.ended ? ` hôm ${ftd.ended.dm}` : ''}). Rồi ĐIỀU KIỆN của nhánh tích cực theo quy tắc, MỘT câu ngắn: chờ phiên FTD — nhãn "Chờ ${ftdRule}" mang luật (người dùng 2026-10-08 không muốn đọc luật FTD ở market; ở watch nhãn nói, lời chỉ "chờ phiên FTD"). KHÔNG đếm phiên phân phối, KHÔNG đồng hồ hết hạn.`
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
  const out = weekVisual({W, toDm: F.session.dm, p: wk, ma: tryJson(`public/${DIR}/vnindex-weekly.ma.json`), weeks, spec: {...R.shots.fireantStock, ...R.shots.fireantWeekly}, maskColor: R.shots.maskColor,
    E: F.indexWeekly ?? null, provisional: !!F.indexDaily?.weekSessions?.at(-1)?.volumeProvisional});
  if (out.why) { console.log(`  week: dropped — ${out.why}`); return; }
  const wroom = plateRoom({photo: wk, bars: weeks, unit: 1, crop: out.visual.crop, volumeBand: R.shots.fireantDaily.volumeBand ?? 0});
  const {annotations, shots} = wroom.settle(out.visual.annotations, out.visual.shots);
  for (const line of wroom.report) console.log(`  plate (week): ${line}`);
  push('week', {
    ...(F.indexWeekly ? {eyebrow: 'VN-Index · Khung tuần'} : {}),
    beats: todoBeats(2),
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
const buildDaily = () => {
  const D = F.indexDaily;
  if (!D) { console.log(`  daily: dropped — ${FACTS} has no indexDaily block (facts.mjs --format=${FORMAT})`); return; }
  if (indexSource !== 'fireant.vn') { console.log('  daily: dropped — the index photo is the terminal fallback, not FireAnt (no MA50/MA200 legend)'); return; }
  const mas = Object.entries(D.ma ?? {});
  if (!mas.length) { console.log(`  daily: dropped — no FireAnt MA50/MA200 of this session (${D.maWhy ?? 'vnindex-daily.ma.json'})`); return; }
  const S = D.structure;
  const inView = (x) => x != null && x > C.x + 0.01 && x < C.x + C.w - 0.01;
  const pts = [...S.highs.map((p) => ({...p, side: 'high'})), ...S.lows.map((p) => ({...p, side: 'low'}))]
    .map((p) => ({...p, x: barX(index, daily, p.t), y: priceY(index, p.price, indexUnit)}))
    .filter((p) => inView(p.x));
  const marks = [];
  // One plate per pair, by its line (a plate per swing point landed 170 px from its candle in the dense September
  // swings — 5/10 test): the highs' plate over the highs line, the lows' under the lows line.
  for (const side of ['high', 'low']) {
    const [a, b] = pts.filter((p) => p.side === side);
    if (!a || !b) continue;
    marks.push({kind: 'line', from: [clamp(a.x), clamp(a.y)], to: [clamp(b.x), clamp(b.y)], dashed: true, accent: b.price > a.price ? 'up' : 'down', beat: 0});
    const y = side === 'high' ? Math.min(a.y, b.y) - 0.04 : Math.max(a.y, b.y) + 0.045;
    marks.push({...lab((a.x + b.x) / 2, clamp(y), `${side === 'high' ? 'Đỉnh' : 'Đáy'} ${a.dm} ${vi(a.price)} → ${b.dm} ${vi(b.price)}`, b.price > a.price ? 'green' : 'red', 0, 'middle'), until: 0});
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
  marks.push(todayRing(1));
  mas.forEach(([name, m], k) => marks.push(lab(...inC(0.5, 0.06 + 0.04 * k), `${m.closeVsPercent < 0 ? 'Dưới' : 'Trên'} ${name} ${vi(m.value)} (${fmtPct(m.closeVsPercent)})`, MA_ACCENT[name] ?? 'white', 1, 'middle')));
  const xs = pts.map((p) => p.x);
  const first = xs.length ? Math.min(...xs) : (lastX ?? 0.85) - 0.25;
  const ys = [...pts.map((p) => p.y), lastY];
  const maYs = mas.map(([, m]) => priceY(index, m.value, indexUnit));
  const shots = [
    {beat: 0, x: clamp((first + (lastX ?? 0.85)) / 2), y: clamp((Math.min(...ys) + Math.max(...ys)) / 2), zoom: 1.45, move: 'pan'},
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
  push('daily', {
    eyebrow: 'VN-Index · Khung ngày',
    beats: todoBeats(2),
    visual: indexPhoto(room.settle(marks, shots)),
    brief: [
      `VN-INDEX · KHUNG NGÀY (người dùng 2026-10-06: "eval the VNIndex as daily and weekly of this week") — đánh giá CẤU TRÚC và XU HƯỚNG trên chart ngày của FireAnt (${D.window} phiên). KHÔNG nói phiên phân phối hay FTD (scene market ngay sau), KHÔNG nhánh nếu … thì (scene watch "Kịch bản VN-Index" cuối video).`,
      `Beat 1 — cấu trúc (hai đường đứt nối hai đỉnh, hai đáy): đỉnh ${H.map((p) => `${p.dm} ${vi(p.price)}`).join(' → ') || '—'}, đáy ${L.map((p) => `${p.dm} ${vi(p.price)}`).join(' → ') || '—'}: ${S.text}.${S.broke ? ` Giá đóng ${vi(D.close)} đã ${S.broke.side === 'low' ? 'ở DƯỚI đáy' : 'ở TRÊN đỉnh'} ${S.broke.dm} (${vi(S.broke.price)}) — ${S.broke.side === 'low' ? 'đáy cao dần đã bị phá' : 'đỉnh gần nhất đã bị vượt'}.` : ''} Khung vàng = các phiên của tuần: ${sessionText || '—'}.`,
      `Beat 2 — xu hướng: giá ${D.maPosition ?? '—'} của FireAnt (${mas.map(([name, m]) => `${name} ${vi(m.value)}, giá ${fmtPct(m.closeVsPercent)}`).join('; ')})${D.ma50AboveMa200 != null ? `; MA50 ${D.ma50AboveMa200 ? 'trên' : 'dưới'} MA200` : ''}. Kết luận do số quyết định: "${verdict}" — viết bằng chữ của trader (cấu trúc, đỉnh, đáy, MA50, MA200), không ví von.`,
      'Tối đa hai số đọc ra lời; số đọc thành chữ, mức điểm đọc tròn. Gọi MA50 / MA200 như trader (lexicon đọc). Nhãn giữ số lẻ của pack (indexDaily.*). Câu cuối trao lời cho scene market — trạng thái theo quy tắc của hệ thống — dạng câu hỏi ngắn, không lặp câu hỏi của hook.',
    ],
  });
};
// sectors — the ICB industry groups ranked by the median RS 1M of their liquid stocks (lib/sectors.mjs; user 2026-10-06:
// "Also include major ranking", picked "ICB groups by RS"). A drawn board in FilterBoard's sector mode: up to ten groups,
// the strongest three lit on beat 2. Dropped with the reason when facts.mjs could not rank (no universe cache for the
// session, no content/review/industries.json).
const buildSectors = () => {
  const S = F.sectors;
  if (!S?.ok || !S.groups?.length) {
    console.log(`  sectors: dropped — ${S?.why ?? (S ? `no ICB group has ${S.minMembers} stocks with KL TB20 ≥ ${S.minVolumeSma20}` : `${FACTS} has no sectors block (facts.mjs --format=${FORMAT})`)}`);
    return;
  }
  const {visual, rowLines, top, focus, label} = sectorBoard({S, R});
  const last = top[top.length - 1];
  const tail = S.groups.slice(top.length);
  const shares = top.filter((g) => g.aboveSma200Share != null);
  const lowShare = [...shares].sort((a, b) => a.aboveSma200Share - b.aboveSma200Share)[0];
  const bestWeek = [...top].filter((g) => g.weekChangePercent != null).sort((a, b) => b.weekChangePercent - a.weekChangePercent)[0];
  const W = F.weekly;
  const weekNote = W && W.sessions < 5 ? ` Cột % TUẦN là tuần tới phiên ${F.session.dm} (${W.sessions} phiên), chưa trọn tuần.` : '';
  const moves = S.comparedWith
    ? top.filter((g) => g.prevRank != null && Math.abs(g.prevRank - g.rank) >= 2).map((g) => `${g.name} ${g.prevRank} → ${g.rank}`).join('; ') || 'không nhóm nào trong bảng đổi từ hai hạng trở lên'
    : null;
  push('sectors', {
    eyebrow: 'Xếp hạng ngành',
    beats: todoBeats(2),
    visual,
    brief: [
      `XẾP HẠNG NHÓM NGÀNH (người dùng 2026-10-06: "Also include major ranking", chọn "ICB groups by RS"): ${S.groups.length} nhóm ngành ICB cấp 2 (bản đồ ngành công khai của VNDirect — terminal không có trường ngành) có từ ${S.minMembers} mã thanh khoản (KL TB20 ≥ ${vi(S.minVolumeSma20 / 1000, 0)} nghìn cổ phiếu) trở lên, xếp theo RS 1M TRUNG VỊ của các mã đó trên terminal — cách xếp hạng nhóm ngành của O'Neil. Bảng in ${top.length} nhóm đầu${S.unranked.length ? `; ${S.unranked.length} nhóm quá ít mã thanh khoản nên không xếp (${S.unranked.map((g) => `${g.name}: ${g.members} mã`).join(', ')})` : ''}.`,
      `Các dòng (SỐ MÃ · RS 1M trung vị · % TUẦN trung vị · % mã trên SMA200): ${rowLines.join('; ')}.`,
      `Beat 1 = bảng hiện dần từ trên xuống (RS 1M trung vị thành thanh); beat 2 = ${focus.map((g) => g.name).join(', ')} sáng lên, các dòng khác mờ, nhãn "${label}" thay caption — câu ghim beat 2 nói về ${focus.length > 1 ? 'các nhóm đó' : 'nhóm đó'}.`,
      `Lời: nói thước đo bằng chữ của trader ("RS 1M trung vị của các mã có thanh khoản trong nhóm"), gọi nhóm bằng tên tiếng Việt đầy đủ (bảng in tên gọn), hai ba nhóm dẫn đầu và nhóm yếu nhất TRÊN BẢNG (#${last.rank} ${last.name}, RS 1M ${last.rs1m}); một nhận xét từ cột % > SMA200 hoặc % TUẦN (${[lowShare ? (lowShare.aboveSma200Share === 0 ? `${lowShare.name}: không mã nào trên SMA200` : `${lowShare.name} chỉ ${lowShare.aboveSma200Share}% mã trên SMA200`) : null, bestWeek ? `tuần này ${bestWeek.name} ${signed(bestWeek.weekChangePercent)}%` : null, top[0].aboveSma200Share != null && top[0].aboveSma200Share < 50 ? `ngay nhóm đứng đầu cũng chỉ ${top[0].aboveSma200Share}% mã trên SMA200` : null].filter(Boolean).join('; ')}); tối đa hai số đọc ra lời.${weekNote}`,
      `Không cần đọc mã. Nếu gọi một mã thì chỉ là mã mạnh nhất của nhóm (ghi "mạnh nhất" ở các dòng trên), và KHÔNG nói mã đó có ở bộ lọc nào (người dùng 2026-10-05: "Not need mentioned the stock on specific filter existed on other filter"). Không khuyên mua bán nhóm ngành nào.`,
      `${tail.length ? `Cuối bảng xếp hạng (không lên bảng — chỉ nói tên nếu cần, không đọc số): ${tail.slice(-3).map((g) => `#${g.rank} ${g.name}`).join(', ')}. ` : ''}${moves != null ? `So bảng tuần trước (${S.comparedWith}): ${moves}.` : 'Chưa có bảng xếp hạng tuần trước để so (bản đầu tiên): không nói "tăng hạng / tụt hạng".'}`,
    ],
  });
};

// outro — the carried-over sign-off.
const buildOutro = () => push('outro', {
  eyebrow: 'Theo dõi tiếp',
  beats: [{atSentence: 0, at: R.audio.leadIn, line1: 'TODO', line2: 'TODO', accent: 'gold'}],
  // rules.logo (a path under public/) replaces the generated monogram inside the ring; the name stays.
  visual: {type: 'outro', ...(R.logo ? {logo: R.logo} : {}), brand: R.brand, kicker: 'Chứng khoán', pill: 'Thả tim · Chia sẻ · Theo dõi', line: FORMAT === 'daily' ? 'Cập nhật sau mỗi phiên' : 'Cập nhật mỗi cuối tuần'},
  brief: ['Thả tim · chia sẻ · theo dõi bằng giọng người, một câu hứa cập nhật. Không số, không thuật ngữ, không "khuyến nghị".'],
});

const builders = {hook: buildHook, market: buildMarket, breadth: buildBreadth, flow: buildFlow, spike: () => (R.screener.scenes.spike.visual === 'movers' && F.screener.spike.gainers?.length ? buildMovers() : buildTable('spike')), watch: buildWatch, week: buildWeek, daily: buildDaily, sectors: buildSectors, outro: buildOutro};
// Every other scene of the screener (rs, uptrend — one saved filter each): a drawn board of its top rows
// when rules say `visual: "board"`, else the Screener photographed with those rows boxed.
for (const [k, spec] of Object.entries(R.screener.scenes)) builders[k] ??= () => (spec.visual === 'board' || spec.visual === 'columns' ? buildBoard(k) : buildTable(k));
// The format's own screener scenes (rules.formats.<format>.screener.scenes — the weekly's Momentum boards, 2026-10-06).
for (const k of Object.keys(fmt.screener?.scenes ?? {})) builders[k] ??= () => buildOwnBoard(k);
const leaderRoles = fmt.roles.filter((r) => r === 'leader').length;
// The leader scenes actually built. A day can have fewer names than leader roles — the daily reviews only the names in
// all three filters since 2026-10-06 (formats.daily.leaders) — and the ranks, ordinals and the board's invitation count
// these: one name is "Mã đầu tiên", never "Mã thứ hai".
// Tier order (the weekly's one review per Momentum filter, 2026-10-06, "Top of each filter"): each pick is reviewed in the
// leader role right after ITS OWN board (top[].tierScene), so a pick counts only when that board is built (it has rows —
// buildOwnBoard's own test) and a leader role follows it.
const tierOrder = F.screener.leaders?.order === 'tier';
const tierPicks = tierOrder ? (F.screener.leaders?.top ?? []).filter((x) => x.tierScene && F.screener[x.tierScene]?.top?.length && fmt.roles[fmt.roles.indexOf(x.tierScene) + 1] === 'leader') : null;
const leaderTotal = Math.min(leaderRoles, tierPicks ? tierPicks.length : F.screener.leaders?.top?.length ?? 0);
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
  builders[role]();
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
