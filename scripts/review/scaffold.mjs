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

const {opt, flag} = cli();
const R = rules();
const FORMAT = opt('format', 'daily');
const fmt = R.formats[FORMAT] ?? die(`--format=${FORMAT}: one of ${Object.keys(R.formats).join(', ')}`);
const FACTS = fmt.content.replace(/\.json$/, '.facts.json');
const F = tryJson(FACTS) ?? die(`no ${FACTS} — run node scripts/review/facts.mjs --format=${FORMAT}`);
const date = F.asOf;
const DIR = `${PATHS.shots}/${date}`;

// ------------------------------------------------------------------ the previous edition

const OUT = opt('out');
const prior = OUT ? null : tryJson(fmt.content);
if (prior) {
  if (prior.edition === date && prior.status !== 'scaffolded' && !flag('force')) {
    die(`${fmt.content} is the ${date} edition and already "${prior.status}" — the writer's work would be lost. --force to rebuild it.`);
  }
  if (prior.edition && prior.edition !== date) {
    const to = `${PATHS.archive}/${prior.edition}-${FORMAT}.json`;
    mkdirSync(dirname(abs(to)), {recursive: true});
    copyFileSync(abs(fmt.content), abs(to));
    if (exists(FACTS)) copyFileSync(abs(FACTS), abs(to.replace(/\.json$/, '.facts.json')));
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
if (!index.calib) die(`public/${index.rel} has no calibration — run node scripts/review/shots.mjs --format=${FORMAT} --calib-only`);

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
  };
};

// ------------------------------------------------------------------ scenes

const tag = yymmdd(date);
const est = (role) => round(targetWords(R, role) / R.narration.wordsPerSecond + R.audio.leadIn + R.audio.tail, 1);
const todoBeats = (n) => Array.from({length: n}, (_, k) => ({atSentence: k === 0 ? 0 : k + 1, at: round(R.audio.leadIn + k * 3.5, 2), line1: 'TODO', line2: 'TODO', accent: 'gold'}));
const status = F.state.status;
const warnAct = status === 'CORRECTION' || status === 'UNDER_PRESSURE' ? 'maroon' : null;
const scenes = [];
const briefs = [];
let leaderN = 0;
const push = (role, {eyebrow = 'TODO', visual, beats, brief, act}) => {
  const n = role === 'leader' ? ++leaderN : 0;
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
const ddXs = dd.map((d) => ({...d, x: barX(index, daily, d.date)})).filter((d) => d.x != null && d.x > 0 && d.x < 1);
const lastX = barX(index, daily, date);
const lastY = priceY(index, F.session.close, indexUnit);
/**
 * Distribution days and the FTD are ARROWS whose tip touches the candle (user, 2026-09-29): red
 * pointing DOWN onto each distribution day's high, blue pointing UP at the FTD's low. The tip sits
 * GAP above the wick (below for the FTD) so it never covers it; the shaft is ARROW long. Positions
 * come from the photo's calibration: x of the session, y of its high/low.
 */
const ARROW = 0.075;
const GAP = 0.007;
const barOf = (t) => daily.find((b) => b.t === t);
/**
 * Solid block arrows (style: 'block'; user 2026-09-29, the line arrows were "so hard to see"). Two
 * distribution days a session or two apart would stack their heads on the same few pixels, so a
 * cluster fans out: the earlier arrow comes in from the upper left, the later from the upper right —
 * each tip still lands on its own candle.
 */
const FAN = 0.4;                       // horizontal lean of a fanned arrow, as a share of its length
const sessionIndex = new Map(daily.map((b, i) => [b.t, i]));
const leanOf = (d) => {
  const i = sessionIndex.get(d.date);
  const near = (j) => ddXs.some((o) => o !== d && Math.abs(sessionIndex.get(o.date) - j) <= 0);
  const before = near(i - 1) || near(i - 2);
  const after = near(i + 1) || near(i + 2);
  return after && !before ? -1 : before && !after ? 1 : 0;
};
const aspect = index.W / index.H;
const ddArrow = (d, beat) => {
  const tip = priceY(index, barOf(d.date).h, indexUnit) - GAP;
  const lean = leanOf(d) * FAN * ARROW / aspect;
  return {kind: 'arrow', style: 'block', from: [clamp(d.x + lean), clamp(tip - ARROW)], to: [clamp(d.x), clamp(tip)], accent: 'red', beat};
};
const ftdArrow = (f, x, beat) => {
  const tip = priceY(index, barOf(f.date).l, indexUnit) + GAP;
  return {kind: 'arrow', style: 'block', from: [clamp(x), clamp(tip + ARROW)], to: [clamp(x), clamp(tip)], accent: 'blue', beat};
};
const ftdBase = (f) => priceY(index, barOf(f.date).l, indexUnit) + GAP + ARROW;
const idxMarks = (beat) => ddXs.map((d) => ddArrow(d, beat));
const ddTop = () => Math.min(...ddXs.map((d) => priceY(index, barOf(d.date).h, indexUnit))) - GAP - ARROW;
const fmtPct = (n, dp = 2) => `${signed(n, dp)}%`;
const lab = (x, y, text, accent, beat, anchor) => ({kind: 'label', x: clamp(x), y: clamp(y), text, accent, beat, ...(anchor ? {anchor} : {})});
const cropOf = (c) => (c ? {crop: c} : {});
const maskOf = (m) => (m?.length ? {masks: m, maskColor: R.shots.maskColor} : {});

// hook — the verdict pinned on the chart (user, 2026-09-29): beat 1 circles the FTD that confirmed the
// trend; beat 2 draws the distribution days since and rings today's candle. Without an FTD in view, one
// beat with the distribution days.
const ftdIn = (() => {
  const f = F.state.ftd ?? F.state.lastFtd;
  const x = f ? barX(index, daily, f.date) : null;
  return f && x != null && x > C.x && x < C.x + C.w ? {f, x, y: priceY(index, f.close, indexUnit)} : null;
})();
const recentTop = Math.min(...daily.slice(-15).map((b) => priceY(index, b.h, indexUnit)));
const hookMarks = ftdIn
  ? [
      ftdArrow(ftdIn.f, ftdIn.x, 0),
      lab(ftdIn.x, clamp(ftdBase(ftdIn.f) + 0.03), `FTD ${ftdIn.f.dm} ${fmtPct(ftdIn.f.changePercent)}`, 'blue', 0, 'middle'),
      ...idxMarks(1),
      ...(ddXs.length ? [lab(Math.min(...ddXs.map((d) => d.x)) - 0.012, clamp(Math.min(ddTop(), recentTop - GAP - ARROW) + 0.01), `${F.distribution.count} phiên phân phối`, 'red', 1, 'end')] : []),
      {kind: 'circle', x: clamp(lastX), y: clamp(lastY), r: 0.022, accent: 'gold', beat: 1},
    ]
  : idxMarks(0);
push('hook', {
  beats: todoBeats(ftdIn ? 2 : 1),
  visual: imageOf(index, indexSource, {
    ...cropOf(indexCrop), ...maskOf(indexMasks),
    annotations: hookMarks,
    shots: ftdIn
      ? [{beat: 0, x: clamp((ftdIn.x + (lastX ?? 0.9)) / 2), y: clamp((ftdIn.y + lastY) / 2), zoom: 1.5, move: 'push_in'},
         {beat: 1, x: clamp((lastX ?? 0.8) - 0.08), y: clamp(lastY), zoom: 2.3, move: 'pan'}]
      : [{beat: 0, x: clamp((lastX ?? 0.8) - 0.07), y: clamp(lastY), zoom: 2.0, move: 'push_in'}],
  }),
  brief: [
    `Kết luận phiên ${F.session.dmy}: ${F.state.label} theo quy tắc${F.state.rallyDay ? `, ngày ${F.state.rallyDay}` : ''}.`,
    `${F.distribution.count}/${F.distribution.window} phiên phân phối còn hiệu lực.`,
    `Hôm nay ${fmtPct(F.session.changePercent)}, khối lượng ×${vi(F.session.volumeRatio)} phiên trước — ${F.session.isDistribution ? 'LÀ phiên phân phối' : F.session.isFtd ? 'LÀ phiên FTD' : 'không phải phiên phân phối'}.`,
    ftdIn ? `Beat 1 = vòng quanh FTD ${ftdIn.f.dm} (mốc của xu hướng); beat 2 = các phiên phân phối từ đó và nến hôm nay.` : '',
    'Câu đầu ≤ 10 chữ, headline beat đầu đã mang kết luận.',
  ],
});

// market — beat 1 the distribution days, beat 2 the FTD, its rally low and the condition.
if (FORMAT === 'weekly') {
  const W = F.weekly;
  const wk = photo('vnindex-weekly');
  if (wk?.calib) {
    push('week', {
      beats: todoBeats(2),
      visual: imageOf(wk, 'fireant.vn', {
        ...maskOf(R.shots.fireantWeekly.masks),
        annotations: [lab(0.08, 0.2, `Tuần ${fmtPct(W.changePercent)} · KL ×${vi(W.volumeVsPriorWeek)}`, W.changePercent >= 0 ? 'green' : 'red', 0)],
        shots: [{beat: 0, x: 0.75, y: 0.5, zoom: 1.6, move: 'push_in'}, {beat: 1, x: 0.5, y: 0.5, zoom: 1.0, move: 'pull_out'}],
      }),
      brief: [`Nến tuần ${W.fromDm} → ${F.session.dm}: ${fmtPct(W.changePercent)}, khối lượng/phiên ×${vi(W.volumeVsPriorWeek)} tuần trước.`, `Cao ${vi(W.high)}, thấp ${vi(W.low)}, đóng ${vi(W.close)}.`],
    });
  }
}
const ftd = F.state.ftd ?? F.state.lastFtd;
const ftdX = ftd ? barX(index, daily, ftd.date) : null;
const marketMarks = [
  ...idxMarks(0),
  // Toward the right: beat 1's camera frames the distribution days, which are the latest sessions.
  lab(...inC(0.5, 0.06), `${F.distribution.count}/${F.distribution.window} phiên phân phối`, 'red', 0),
];
const biggest = [...ddXs].sort((a, b) => a.changePercent - b.changePercent)[0];
if (biggest) marketMarks.push(lab(biggest.x - 0.012, clamp(priceY(index, barOf(biggest.date).h, indexUnit) - GAP - ARROW / 2), `${biggest.dm} ${fmtPct(biggest.changePercent)} · KL ×${vi(biggest.volumeRatio)}`, 'red', 0, 'end'));
if (ftd && ftdX != null && ftdX > C.x && ftdX < C.x + C.w) {
  marketMarks.push(ftdArrow(ftd, ftdX, 1));
  marketMarks.push(lab(ftdX, clamp(ftdBase(ftd) + 0.03), `FTD ${ftd.dm} ${fmtPct(ftd.changePercent)}`, 'blue', 1, 'middle'));
}
const holdLow = F.state.rallyLow ?? F.state.correctionLow;
const holdY = holdLow != null ? priceY(index, holdLow, indexUnit) : null;
if (holdY != null && holdY > 0.02 && holdY < 0.98) {
  marketMarks.push({kind: 'hline', y: clamp(holdY), accent: 'gold', beat: 1, label: `${F.state.rallyLow != null ? 'Đáy nhịp hồi' : 'Đáy điều chỉnh'} ${vi(holdLow)}`, labelSide: 'left'});
}
push('market', {
  act: warnAct,
  beats: todoBeats(2),
  visual: imageOf(index, indexSource, {
    ...cropOf(indexCrop), ...maskOf(indexMasks),
    annotations: marketMarks,
    shots: [
      {beat: 0, x: clamp(ddXs.length ? (Math.min(...ddXs.map((d) => d.x)) + (lastX ?? 0.9)) / 2 : inC(0.75, 0)[0]), y: inC(0, 0.45)[1], zoom: 1.35, move: 'push_in'},
      {beat: 1, x: inC(0.5, 0)[0], y: inC(0, 0.5)[1], zoom: 1.0, move: 'pull_out'},
    ],
  }),
  brief: [
    `Beat 1 — ${F.distribution.count} phiên phân phối trên ${F.distribution.window} phiên: ${dd.map((d) => `${d.dm} ${fmtPct(d.changePercent)} KL ×${vi(d.volumeRatio)} (còn ${d.sessionsLeft} phiên)`).join('; ') || 'không có'}.`,
    `Thêm ${F.distribution.toUnderPressure} phiên là "${R.status.UNDER_PRESSURE.vi}", thêm ${F.distribution.toCorrection} phiên là "${R.status.CORRECTION.vi}".`,
    ftd ? `Beat 2 — FTD ${ftd.dmy}: ngày ${ftd.day} của nỗ lực hồi phục, ${fmtPct(ftd.changePercent)}, KL ×${vi(ftd.volumeRatio)}; đáy nhịp hồi ${vi(ftd.rallyLow)} — thủng là FTD thất bại.` : 'Beat 2 — chưa có FTD trong lịch sử gần.',
    `Kết bằng điều kiện nếu … thì (${F.watch.map((w) => `nếu ${w.if} → ${w.then}`).join('; ')}). Không gọi giá.`,
    `Quy tắc: phân phối = giảm từ ${F.rules.ddMaxChangePercent}% với KL cao hơn phiên trước; FTD = từ ngày ${F.rules.ftdMinDay}, tăng từ ${F.rules.ftdMinChangePercent}% với KL cao hơn.`,
  ],
});

// spike and leaders — the terminal's own tables.
for (const scene of ['spike', 'leaders']) {
  const p = need(photo(scene), scene);
  const t = table(p);
  const picks = F.screener[scene].top;
  const rows = picks.map((x) => t.rows.find((r) => r.symbol === x.symbol)).filter(Boolean);
  if (rows.length !== picks.length) die(`public/${p.rel}: rows for ${picks.map((x) => x.symbol).join(', ')} not all in the photo — re-shoot`);
  const top = Math.min(...rows.map((r) => r.y));
  const bottom = Math.max(...rows.map((r) => r.y + r.h));
  // Beat 1: the three rows. Beat 2: the column the scene is about, boxed cell by cell — the
  // numbers stay the terminal's own; one summary plate lies over the table's Columns/Export buttons.
  const focus = R.shots.screener.sortColumn[R.screener.scenes[scene].sortBy];
  const marks = [{kind: 'box', x: t.rows[0].x, y: clamp(top), w: t.rows[0].w, h: clamp(bottom - top), accent: 'gold', beat: 0, until: 0}];
  for (const r of rows) {
    const c = r.cells[focus];
    if (c) marks.push({kind: 'box', x: clamp(c.x - 0.004), y: clamp(c.y + 0.002), w: clamp(c.w + 0.008), h: clamp(c.h - 0.004), accent: 'gold', beat: 1});
  }
  const uiRight = t.ui.length ? Math.max(...t.ui.map((u) => u.x + u.w)) : t.crop.x + t.crop.w - 0.02;
  const uiMid = t.ui.length ? t.ui[0].y + t.ui[0].h / 2 : (t.count ? t.count.y + t.count.h / 2 : t.crop.y + 0.05);
  const summary = scene === 'spike'
    ? `Top ${picks.length}: KL ×${picks.map((x) => vi(x.volumeRatio)).join(' · ×')}`
    : `${F.screener.leaders.count} mã qua RS Strong + Uptrend`;
  marks.push(lab(clamp(uiRight), clamp(uiMid), summary, 'gold', 0, 'end'));
  const cellsMid = rows.map((r) => r.cells[focus]).filter(Boolean);
  const mid = (top + bottom) / 2;
  const focusX = cellsMid.length ? cellsMid[0].x + cellsMid[0].w / 2 : t.crop.x + t.crop.w * 0.42;
  const S = F.screener[scene];
  push(scene, {
    beats: todoBeats(2),
    visual: imageOf(p, 'zionle.io.vn', {
      crop: t.crop, annotations: marks,
      shots: [{beat: 0, x: clamp(t.crop.x + t.crop.w / 2), y: clamp(t.crop.y + t.crop.h / 2), zoom: 1.0, move: 'push_in'}, {beat: 1, x: clamp(focusX - 0.08), y: clamp(mid), zoom: 1.8, move: 'pull_out'}],
    }),
    brief: scene === 'spike'
      ? [`Bộ lọc "${S.filter}" của terminal: ${S.count} mã (${S.up} tăng, ${S.down} giảm).`, `Ba mã khối lượng đột biến nhất so với trung bình 20 phiên: ${S.top.map((x) => `${x.symbol} KL ×${vi(x.volumeRatio)} ${fmtPct(x.changePercent)}`).join('; ')}.`, 'Nói rõ mã nào tăng, mã nào giảm — khối lượng lớn khi giảm là bán ra, không phải mua vào.', F.screener.volumeVsSmaUnit === 'percent' ? 'Lưu ý của đạo diễn: bộ lọc đang so KL theo % (volume_vs_sma > 1,2 nghĩa là trên TB20 hơn 1,2%), nên danh sách gồm cả mã chỉ nhỉnh hơn TB20; ba mã được chọn là ba mã mạnh nhất.' : '']
          .filter(Boolean)
      : [`Uptrend (giá trên EMA50, EMA50 trên SMA200) có ${S.uptrendCount} mã; RS Strong (RS 1M từ 60) có ${S.rsStrongCount}; qua cả hai: ${S.count} mã.`, `Ba mã dẫn đầu theo RS 1M: ${S.top.map((x) => `${x.symbol} RS 1M ${x.rs1m} ${fmtPct(x.changePercent)}`).join('; ')}.`, S.alsoSpiking.length ? `${S.alsoSpiking.join(', ')} có mặt ở cả Volume spike.` : ''].filter(Boolean),
  });
}

// leader ×3 — each top name on the terminal's own chart.
for (const L of F.screener.leaders.top) {
  const p = need(photo(`${L.symbol.toLowerCase()}-terminal`), `${L.symbol.toLowerCase()}-terminal`);
  const crop = R.shots.terminalAnalyze.crop;
  const marks = [lab(crop.x + 0.02, 0.06, `${L.symbol} · RS 1M ${L.rs1m} · ${fmtPct(L.changePercent)}`, 'gold', 0)];
  let closeX = crop.x + crop.w * 0.9;
  let closeY = 0.3;
  if (p.calib) {
    const bars = tryJson(`${PATHS.analyze}/${date}/${L.symbol}.json`)?.price_history ?? [];
    closeX = barX(p, bars, date) ?? closeX;
    closeY = priceY(p, L.price);
    const emaY = priceY(p, L.ema50);
    if (emaY > 0.02 && emaY < crop.y + crop.h - 0.02) marks.push({kind: 'hline', y: clamp(emaY), accent: 'green', beat: 0, label: `EMA50 ${vi(L.ema50)}`, labelSide: 'left'});
    // The latest candle sits against the crop's right edge (the axis is cropped out), so an arrow
    // points at it from the open chart on its left instead of a circle the edge would cut.
    marks.push({kind: 'arrow', from: [clamp(closeX - 0.1), clamp(closeY + 0.1)], to: [clamp(closeX - 0.012), clamp(closeY + 0.012)], accent: 'green', beat: 1, label: `${fmtPct(L.aboveEma50Percent, 1)} trên EMA50`});
  }
  push('leader', {
    beats: todoBeats(2),
    visual: imageOf(p, 'zionle.io.vn', {
      crop,
      annotations: marks,
      shots: [{beat: 0, x: clamp(crop.x + crop.w / 2), y: clamp(crop.y + crop.h / 2), zoom: 1.0, move: 'push_in'}, {beat: 1, x: clamp(closeX - 0.05), y: clamp(closeY), zoom: 1.8, move: 'pull_out'}],
    }),
    brief: [
      `${L.symbol} (${L.name}, ${L.exchange}): giá ${vi(L.price)} nghìn đồng, ${fmtPct(L.changePercent)} hôm nay, RS 1M ${L.rs1m}, RS 52W ${L.rs52w}.`,
      `Trên EMA50 ${vi(L.ema50)} ${fmtPct(L.aboveEma50Percent, 1)}, trên SMA200 ${vi(L.sma200)} ${fmtPct(L.aboveSma200Percent, 1)}; cách đỉnh 52 tuần ${vi(L.high52w)} ${fmtPct(L.fromHigh52wPercent, 1)}.`,
      L.signal ? `Tín hiệu mới nhất trên terminal: ${L.signal.type} ở ${vi(L.signal.price)} ngày ${L.signal.dm} — chỉ nhắc nếu khớp với chart đang chiếu.` : 'Terminal chưa có tín hiệu cho mã này.',
      'Đọc tên công ty thay cho mã ở lời đọc (TTS đọc mã chữ cái thất thường); mã giữ trên màn hình.',
    ],
  });
}

// outro — the carried-over sign-off.
push('outro', {
  eyebrow: 'Theo dõi tiếp',
  beats: [{atSentence: 0, at: R.audio.leadIn, line1: 'TODO', line2: 'TODO', accent: 'gold'}],
  visual: {type: 'outro', brand: R.brand, kicker: 'Chứng khoán', pill: 'Thả tim · Chia sẻ · Theo dõi', line: FORMAT === 'daily' ? 'Cập nhật sau mỗi phiên' : 'Cập nhật mỗi cuối tuần'},
  brief: ['Thả tim · chia sẻ · theo dõi bằng giọng người, một câu hứa cập nhật. Không số, không thuật ngữ, không "khuyến nghị".'],
});

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
