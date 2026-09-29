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
//   hook     the distribution days land (tension), then the FTD that still anchors the trend; the
//            words promise the level to watch at the end (open loop 1)
//   market   context: the count, the rally low, the clock (when the oldest DD drops out)
//   breadth  pattern interrupt — the first drawn panel — and the paradox that bridges to the filters
//   spike    the volume table; the words tease the name on both filters (open loop 2)
//   leaders  the leaders table
//   leader   #3 → #2 → #1, one distinct detail each; #1 pays loop 2
//   watch    the payoff, static camera: the levels and the count that change the state tomorrow
//   outro    the button
// The order is rules.formats.<format>.roles; camera moves alternate between neighbouring shots.

const ftd = F.state.ftd ?? F.state.lastFtd;
const ftdX = ftd ? barX(index, daily, ftd.date) : null;
const ftdVisible = !!ftd && ftdX != null && ftdX > C.x && ftdX < C.x + C.w;
const ftdY = ftdVisible ? priceY(index, ftd.close, indexUnit) : null;
const holdLow = F.state.rallyLow ?? F.state.correctionLow;
const holdY = holdLow != null ? priceY(index, holdLow, indexUnit) : null;
const holdVisible = holdY != null && holdY > C.y + 0.02 && holdY < C.y + C.h - 0.02;
const holdName = F.state.rallyLow != null ? 'Đáy nhịp hồi' : 'Đáy điều chỉnh';
const recentTop = Math.min(...daily.slice(-15).map((b) => priceY(index, b.h, indexUnit)));
const ddLeft = ddXs.length ? Math.min(...ddXs.map((d) => d.x)) : null;
const ddCentre = ddLeft != null ? (ddLeft + (lastX ?? 0.9)) / 2 : inC(0.75, 0)[0];
const biggest = [...ddXs].sort((a, b) => a.changePercent - b.changePercent)[0];
const nextExp = F.distribution.nextExpiry;
const nextExpDd = nextExp ? ddXs.find((d) => d.date === nextExp.date) : null;
const nextState = F.distribution.toUnderPressure > 0
  ? {n: F.distribution.toUnderPressure, name: R.status.UNDER_PRESSURE.short}
  : {n: F.distribution.toCorrection, name: R.status.CORRECTION.short};
const todayRing = (beat) => ({kind: 'circle', x: clamp(lastX), y: clamp(lastY), r: 0.022, accent: 'gold', beat});
const indexPhoto = (extra) => imageOf(index, indexSource, {...cropOf(indexCrop), ...maskOf(indexMasks), ...extra});
const ddLabel = (beat) => (ddLeft != null
  ? [lab(ddLeft - 0.012, clamp(Math.min(ddTop(), recentTop - GAP - ARROW) + 0.01), `${F.distribution.count} phiên phân phối`, 'red', beat, 'end')]
  : []);
const ftdMarks = (beat) => (ftdVisible
  ? [ftdArrow(ftd, ftdX, beat), lab(ftdX, clamp(ftdBase(ftd) + 0.03), `FTD ${ftd.dm} ${fmtPct(ftd.changePercent)}`, 'green', beat, 'middle')]
  : []);

// hook — tension, anchor, promise.
const buildHook = () => {
  const two = ftdVisible;
  push('hook', {
    beats: todoBeats(two ? 2 : 1),
    visual: indexPhoto({
      annotations: [...idxMarks(0), ...ddLabel(0), ...ftdMarks(1), todayRing(two ? 1 : 0)],
      shots: two
        ? [{beat: 0, x: clamp(ddCentre), y: clamp(recentTop + 0.1), zoom: 2.0, move: 'push_in'},
           {beat: 1, x: clamp((ftdX + (lastX ?? 0.9)) / 2), y: clamp((ftdY + lastY) / 2), zoom: 1.35, move: 'pull_out'}]
        : [{beat: 0, x: clamp(ddCentre), y: clamp(lastY), zoom: 2.0, move: 'push_in'}],
    }),
    brief: [
      `Câu đầu ≤ 10 chữ, là CĂNG THẲNG: ${F.distribution.count} phiên phân phối trên ${F.distribution.window} phiên — beat 1 là ba mũi tên đỏ rơi xuống nến, headline mang con số.`,
      two
        ? `Beat 2 là NEO: ${F.state.label} theo quy tắc từ FTD ${ftd.dmy} (mũi tên xanh chỉ lên); vòng vàng ở nến hôm nay: ${fmtPct(F.session.changePercent)}, KL ×${vi(F.session.volumeRatio)} phiên trước — ${F.session.isDistribution ? 'LÀ phiên phân phối' : 'không phải phiên phân phối'}.`
        : `${F.state.label} theo quy tắc; hôm nay ${fmtPct(F.session.changePercent)}.`,
      'Câu cuối là LỜI HỨA (móc mở 1): cuối video là mức nào thủng thì gãy — trả ở scene watch.',
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
  if (nextExpDd) marks.push(lab(nextExpDd.x - 0.012, clamp(priceY(index, barOf(nextExpDd.date).h, indexUnit) - GAP - ARROW - 0.04), `${nextExp.dm} hết hạn sau ${nextExp.sessionsLeft} phiên`, 'white', 2, 'end'));
  marks.push(lab(...inC(0.5, 0.06), `${R.distribution.underPressureAt} phiên → ${R.status.UNDER_PRESSURE.short.toLowerCase()} · ${R.distribution.correctionAt} phiên → ${R.status.CORRECTION.short.toLowerCase()}`, 'gold', 2));
  push('market', {
    act: warnAct,
    beats: todoBeats(3),
    visual: indexPhoto({
      annotations: marks,
      shots: [
        {beat: 0, x: clamp(ddCentre), y: inC(0, 0.42)[1], zoom: 1.5, move: 'pan'},
        {beat: 1, x: clamp(ftdVisible ? (ftdX + (lastX ?? 0.9)) / 2 : inC(0.5, 0)[0]), y: clamp(holdVisible ? (holdY + lastY) / 2 : inC(0, 0.5)[1]), zoom: 1.15, move: 'tilt'},
        {beat: 2, x: clamp((nextExpDd?.x ?? lastX ?? 0.85) - 0.02), y: clamp(recentTop + 0.1), zoom: 2.1, move: 'push_in'},
      ],
    }),
    brief: [
      `Beat 1 — ${F.distribution.count} phiên phân phối còn hiệu lực: ${dd.map((d) => `${d.dm} ${fmtPct(d.changePercent)} KL ×${vi(d.volumeRatio)} (còn ${d.sessionsLeft} phiên)`).join('; ') || 'không có'}. Phân phối = giảm từ ${F.rules.ddMaxChangePercent}% với KL cao hơn phiên trước.`,
      ftdVisible
        ? `Beat 2 — neo của xu hướng: FTD ${ftd.dmy} (ngày ${ftd.day}, ${fmtPct(ftd.changePercent)}, KL ×${vi(ftd.volumeRatio)}) và đáy nhịp hồi ${vi(ftd.rallyLow)} (đường vàng).`
        : `Beat 2 — ${holdName.toLowerCase()} ${holdLow != null ? vi(holdLow) : '—'}.`,
      `Beat 3 — đồng hồ: ${nextExp ? `phiên ${nextExp.dm} hết hạn sau ${nextExp.sessionsLeft} phiên` : 'không phiên nào sắp hết hạn'}; ${R.distribution.underPressureAt} phiên là ${R.status.UNDER_PRESSURE.vi.toLowerCase()}, ${R.distribution.correctionAt} phiên là ${R.status.CORRECTION.vi.toLowerCase()}.`,
      'Đây là BỐI CẢNH, chưa phải điều kiện (câu nếu … thì để dành cho watch). Kết bằng câu dẫn sang độ rộng thị trường.',
    ],
  });
};

// breadth — the paradox on the only drawn panel.
const pictogramGrid = (pct) => {
  // The Pictogram panel (and verify) re-derive the lit count from filledPercent and scatter it with
  // (k*7+3) % total, which lights the wrong number on a grid whose total shares a factor with 7.
  // Search the grids the panel has room for and keep the one whose drawn share is nearest the truth.
  let best = null;
  for (let rows = 3; rows <= 7; rows++) {
    for (let columns = 4; columns <= 9; columns++) {
      const total = rows * columns;
      const drawnFor = (filled) => { let n = 0; for (let k = 0; k < total; k++) if ((k * 7 + 3) % total >= total - filled) n++; return n; };
      const drawn = drawnFor(Math.round((pct / 100) * total));
      const share = round((drawn / total) * 100, 2);
      if (drawnFor(Math.round((share / 100) * total)) !== drawn) continue;
      const err = Math.abs(share - pct);
      // Within half a point of the truth, the fuller grid wins: 25 dots in an 880×560 panel read as empty.
      const better = !best ? true
        : err <= 0.5 && best.err <= 0.5 ? total > best.total
        : err < best.err - 1e-9;
      if (better) best = {rows, columns, total, drawn, filledPercent: share, err};
    }
  }
  return best;
};
const buildBreadth = () => {
  const B = F.screener.breadth;
  if (B?.aboveSma200Percent == null) return;
  const g = pictogramGrid(B.aboveSma200Percent);
  push('breadth', {
    beats: todoBeats(1),
    visual: {type: 'pictogram', glyph: 'dot', rows: g.rows, columns: g.columns, filledPercent: g.filledPercent, accent: 'green'},
    brief: [
      `NGHỊCH LÝ (pattern interrupt, panel vẽ duy nhất): chỉ số ${F.state.label.toLowerCase()} mà chỉ ${B.aboveSma200} trên ${B.withSma200 ?? B.universe} mã (${vi(B.aboveSma200Percent, 1)}%) đứng trên đường trung bình 200 phiên; hôm nay ${B.up} mã tăng, ${B.down} mã giảm.`,
      `Lưới ${g.rows}×${g.columns} chấm, ${g.drawn} chấm sáng = ${vi(g.filledPercent, 1)}%; headline ghi ${Math.round(B.aboveSma200Percent)}% (số nguyên, có trong pack).`,
      'Kết bằng câu dẫn: vậy tiền đang ở đâu? → bộ lọc.',
    ],
  });
};

// spike and leaders — the terminal's own tables.
const buildTable = (scene) => {
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
      ? [
          `Bộ lọc "${S.filter}" của terminal: ${S.count} mã (${S.up} tăng, ${S.down} giảm). Ba mã khối lượng đột biến nhất so với trung bình 20 phiên: ${S.top.map((x) => `${x.symbol} KL ×${vi(x.volumeRatio)} ${fmtPct(x.changePercent)}`).join('; ')}.`,
          'Nói rõ mã nào tăng, mã nào giảm — khối lượng lớn khi giảm là bán ra, không phải mua vào.',
          `GIEO MÓC 2 (không nói tên): một mã trong bảng này cũng có mặt ở bộ lọc dẫn dắt — để cuối.${F.screener.leaders.alsoSpiking.length ? '' : ' (Hôm nay không có mã nào — bỏ móc này.)'}`,
        ]
      : [
          `Uptrend (giá trên EMA50, EMA50 trên SMA200) có ${S.uptrendCount} mã; RS Strong (RS 1M từ 60) có ${S.rsStrongCount}; qua cả hai: ${S.count} mã. Ba mã dẫn đầu theo RS 1M: ${S.top.map((x) => `${x.symbol} RS 1M ${x.rs1m} ${fmtPct(x.changePercent)}`).join('; ')}.`,
          'Scene ngắn: cầu nối vào đếm ngược. Câu cuối: "đếm ngược từ ba".',
        ],
  });
};

// leader — the countdown: one template, one distinct detail per name.
const buildLeader = (L, rank) => {
  const sym = L.symbol.toLowerCase();
  const p = need(photo(`${sym}-terminal`), `${sym}-terminal`);
  const crop = R.shots.terminalAnalyze.crop;
  // The volume detail belongs to a name in the spike scene's TOP rows (the table the viewer saw), not
  // to every member of the 16-name filter — BSR sits in it at ×1,09 and its story is the 52-week high.
  const spiking = F.screener.spike.top.some((x) => x.symbol === L.symbol);
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
      marks.push({kind: 'box', x: clamp(closeX - 0.007), y: 0.556, w: 0.014, h: clamp(crop.y + crop.h - 0.556 - 0.006), accent: 'gold', beat: 0, label: `KL ×${vi(L.volumeRatio)}`});
      detail = `khối lượng hôm nay ×${vi(L.volumeRatio)} trung bình 20 phiên (hộp vàng trên cột khối lượng) — mã ở CẢ HAI bộ lọc`;
    } else if (L.high52w != null) {
      const hy = priceY(p, L.high52w);
      if (hy > 0.03 && hy < crop.y + crop.h - 0.03) marks.push({kind: 'hline', y: clamp(hy), accent: 'gold', beat: 0, label: `Đỉnh 52T ${vi(L.high52w)} · ${fmtPct(L.fromHigh52wPercent, 1)}`, labelSide: 'left'});
      detail = `đỉnh 52 tuần ${vi(L.high52w)}, giá đang ${fmtPct(L.fromHigh52wPercent, 1)} so với đỉnh (đường vàng)`;
    }
    marks.push({kind: 'arrow', from: [clamp(closeX - 0.1), clamp(closeY + 0.1)], to: [clamp(closeX - 0.012), clamp(closeY + 0.012)], accent: 'green', beat: 1, label: `${fmtPct(L.aboveEma50Percent, 1)} trên EMA50`});
  }
  push('leader', {
    eyebrow: `Dẫn dắt #${rank} · ${L.symbol}`,
    beats: todoBeats(2),
    visual: imageOf(p, 'zionle.io.vn', {
      crop,
      annotations: marks,
      shots: [{beat: 0, x: clamp(crop.x + crop.w / 2), y: clamp(crop.y + crop.h / 2), zoom: 1.0, move: 'push_in'}, {beat: 1, x: clamp(closeX - 0.05), y: clamp(closeY), zoom: 1.8, move: 'pull_out'}],
    }),
    brief: [
      `#${rank} — ${L.symbol} (${L.name}, ${L.exchange}): giá ${vi(L.price)} nghìn đồng, ${fmtPct(L.changePercent)} hôm nay, RS 1M ${L.rs1m}, RS 52W ${L.rs52w}; trên EMA50 ${vi(L.ema50)} ${fmtPct(L.aboveEma50Percent, 1)}, trên SMA200 ${vi(L.sma200)} ${fmtPct(L.aboveSma200Percent, 1)}.`,
      `Chi tiết riêng của mã này: ${detail || 'không có'}.${rank === 1 && spiking ? ' Đây là mã TRẢ MÓC 2: "mã ở cả hai bộ lọc".' : ''}`,
      L.signal ? `Tín hiệu mới nhất trên terminal: ${L.signal.type} ở ${vi(L.signal.price)} ngày ${L.signal.dm} — chỉ nhắc nếu khớp với chart đang chiếu.` : 'Terminal chưa có tín hiệu cho mã này.',
      'Cùng khuôn câu với hai scene leader kia; đọc tên công ty thay cho mã (TTS đọc mã chữ cái thất thường); mã giữ trên màn hình.',
    ],
  });
};

// watch — the payoff: what changes the state, said as if-then. Static camera on beat 2.
const buildWatch = () => {
  const marks = [];
  if (holdVisible) marks.push({kind: 'hline', y: clamp(holdY), accent: 'gold', beat: 0, label: `Thủng ${vi(holdLow)} → ${F.state.rallyLow != null ? 'FTD thất bại' : 'đáy mới'}`, labelSide: 'left'});
  const expLevel = F.distribution.lowestExpireLevel;
  const expDd = expLevel != null ? dd.find((d) => d.expireLevel === expLevel) : null;
  const expY = expLevel != null ? priceY(index, expLevel, indexUnit) : null;
  const expVisible = expY != null && expY > C.y + 0.02 && expY < C.y + C.h - 0.02;
  if (expVisible && expDd) marks.push({kind: 'hline', y: clamp(expY), accent: 'green', beat: 0, label: `Chạm ${vi(expLevel)} → phiên ${expDd.dm} hết hạn`, labelSide: 'left'});
  marks.push(todayRing(1));
  marks.push(lab(clamp(lastX - 0.03), clamp(lastY - 0.1), `Thêm ${nextState.n} phiên phân phối → ${nextState.name.toLowerCase()}`, 'red', 1, 'end'));
  if (nextExp) marks.push(lab(clamp(lastX - 0.03), clamp(lastY - 0.06), `${nextExp.dm} hết hạn sau ${nextExp.sessionsLeft} phiên`, 'white', 1, 'end'));
  const midY = ((holdVisible ? holdY : lastY) + (expVisible ? expY : lastY)) / 2;
  push('watch', {
    beats: todoBeats(2),
    visual: indexPhoto({
      annotations: marks,
      shots: [
        {beat: 0, x: inC(0.55, 0)[0], y: clamp(midY), zoom: 1.0, move: 'tilt'},
        {beat: 1, x: clamp((lastX ?? 0.85) - 0.07), y: clamp(lastY), zoom: 2.2, move: 'static'},
      ],
    }),
    brief: [
      `PAYOFF — trả lời hứa của hook bằng ba nhánh nếu … thì: nếu thủng ${holdLow != null ? vi(holdLow) : '—'} → ${F.state.rallyLow != null ? 'FTD thất bại, về điều chỉnh' : 'đáy điều chỉnh mới'}; nếu thêm ${nextState.n} phiên phân phối → ${nextState.name.toLowerCase()}; ${expDd ? `nếu chạm ${vi(expLevel)} → phiên ${expDd.dm} hết hạn, số đếm giảm` : ''}${nextExp ? `; qua ${nextExp.sessionsLeft} phiên nữa, phiên ${nextExp.dm} tự hết hạn` : ''}.`,
      'Máy đứng yên ở beat 2. Câu ngắn, chậm. Không lời khuyên, không gọi giá — chỉ là quy tắc nói gì.',
      `Toàn bộ số lấy từ watch[] và distribution.* của fact pack (${F.watch.map((w) => `nếu ${w.if} → ${w.then}`).join('; ')}).`,
    ],
  });
};

// week — the weekly edition's candle.
const buildWeek = () => {
  const W = F.weekly;
  const wk = photo('vnindex-weekly');
  if (!W || !wk?.calib) return;
  push('week', {
    beats: todoBeats(2),
    visual: imageOf(wk, 'fireant.vn', {
      ...maskOf(R.shots.fireantWeekly.masks),
      annotations: [lab(0.08, 0.2, `Tuần ${fmtPct(W.changePercent)} · KL ×${vi(W.volumeVsPriorWeek)}`, W.changePercent >= 0 ? 'green' : 'red', 0)],
      shots: [{beat: 0, x: 0.75, y: 0.5, zoom: 1.6, move: 'push_in'}, {beat: 1, x: 0.5, y: 0.5, zoom: 1.0, move: 'pull_out'}],
    }),
    brief: [`Nến tuần ${W.fromDm} → ${F.session.dm}: ${fmtPct(W.changePercent)}, khối lượng/phiên ×${vi(W.volumeVsPriorWeek)} tuần trước.`, `Cao ${vi(W.high)}, thấp ${vi(W.low)}, đóng ${vi(W.close)}.`],
  });
};

// outro — the carried-over sign-off.
const buildOutro = () => push('outro', {
  eyebrow: 'Theo dõi tiếp',
  beats: [{atSentence: 0, at: R.audio.leadIn, line1: 'TODO', line2: 'TODO', accent: 'gold'}],
  visual: {type: 'outro', brand: R.brand, kicker: 'Chứng khoán', pill: 'Thả tim · Chia sẻ · Theo dõi', line: FORMAT === 'daily' ? 'Cập nhật sau mỗi phiên' : 'Cập nhật mỗi cuối tuần'},
  brief: ['Thả tim · chia sẻ · theo dõi bằng giọng người, một câu hứa cập nhật. Không số, không thuật ngữ, không "khuyến nghị".'],
});

const builders = {hook: buildHook, market: buildMarket, breadth: buildBreadth, spike: () => buildTable('spike'), leaders: () => buildTable('leaders'), watch: buildWatch, week: buildWeek, outro: buildOutro};
const leaderTotal = fmt.roles.filter((r) => r === 'leader').length;
let leaderIdx = 0;
for (const role of fmt.roles) {
  if (role === 'leader') {
    const L = F.screener.leaders.top[leaderIdx];
    if (L) buildLeader(L, leaderTotal - leaderIdx);
    leaderIdx++;
    continue;
  }
  if (!builders[role]) die(`rules.formats.${FORMAT}.roles names "${role}", which scaffold.mjs cannot build`);
  builders[role]();
}

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
