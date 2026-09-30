#!/usr/bin/env node
/**
 * Grades content/<reel>.json before it costs anything to be wrong.
 *
 *   npm run verify                every registered reel
 *   npm run verify -- Channel     one reel
 *   npm run verify -- --strict    warnings and skips become errors (CI gate)
 *   npm run verify -- --json      machine-readable, for an orchestrator
 *
 * Exit codes are the contract:
 *   0  clean (warnings allowed)   -> go on to voiceover / render
 *   1  content errors             -> edit content/<reel>.json
 *   2  verify itself broke        -> STOP editing content; fix the environment
 *
 * Most checks need no audio, which is the point: the authoring loop is
 * draft -> verify -> revise, and it runs in about a second. Checks that need a
 * wav report SKIP until one exists rather than FAIL, so you pay the
 * model-loading cost once, after the words are already right.
 *
 * Every budget lives in src/shared/content-rules.json, which this file and
 * .claude/skills/market-video/SKILL.md both read. Nothing restates a constant.
 */
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {reels} from './lib/reels.mjs';
import {roleNames, roleOf, roleSpec} from './lib/roles.mjs';
import {lexiconOf, loadRules} from './lib/rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * The rules grading the reel being checked. market-video's reels use content-rules.json; a reel
 * with its own `rules` field (market-review's) is graded by that file, engine constants inherited
 * (scripts/lib/rules.mjs). Set per reel in the run loop; the repo-wide checks use BASE.
 */
const BASE = loadRules(ROOT);
let R = BASE;

const SEV = {pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP'};

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const selectors = argv.filter((a) => !a.startsWith('--'));
const STRICT = flags.has('--strict');
const JSON_OUT = flags.has('--json');

const die = (msg) => {
  console.error(`verify: ${msg}`);
  process.exit(2);
};

// ---------------------------------------------------------------- inputs

let ROOT_REG;
try {
  ROOT_REG = reels(ROOT);
} catch (e) {
  die(`cannot read the reel registry — ${e.message}`);
}
if (!ROOT_REG.size) die('no reels found in src/Root.tsx (REELS)');

const allIds = [...ROOT_REG.keys()].sort();
const DRAFTS = new Map();
for (const s of selectors) {
  // A path to a content file checks a DRAFT without registering it (a writer's merged copy),
  // so parallel drafts never have to touch content/<name>.json or src/Root.tsx.
  if (s.endsWith('.json')) {
    if (!existsSync(resolve(ROOT, s))) die(`no content file at ${s}`);
    DRAFTS.set(s, s);
    continue;
  }
  if (!allIds.includes(s)) die(`no reel "${s}". Available: ${allIds.join(', ')}`);
}
const ids = selectors.length ? selectors : allIds;

let SERIES = null;
try {
  SERIES = JSON.parse(readFileSync(resolve(ROOT, R.series.path), 'utf8'));
} catch {
  /* checkSeries reports it */
}

// ---------------------------------------------------------------- helpers

const monthIndex = (t) => {
  const [y, m] = String(t).split('-').map(Number);
  return y * 12 + (m - 1);
};

/** Ported verbatim from scripts/voiceover.mjs — atSentence indexes THIS list. */
const sentences = (text) => {
  const parts = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim()).filter(Boolean);
  const merged = [];
  for (const p of parts) {
    if (merged.length && p.split(' ').length < 3) merged[merged.length - 1] += ' ' + p;
    else merged.push(p);
  }
  return merged;
};

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);
const near = (a, b, pct) => Math.abs(a - b) <= Math.abs(b) * (pct / 100);

/** Wilder's RSI — same maths as src/lib/indicators.ts. */
const rsiSeries = (closes, period) => {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  g /= period; l /= period;
  const v = () => 100 - 100 / (1 + g / (l || 1e-9));
  out[period] = v();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    g = (g * (period - 1) + Math.max(d, 0)) / period;
    l = (l * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = v();
  }
  return out;
};

const ffprobe = (file) => {
  try {
    return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file], {encoding: 'utf8'}).trim());
  } catch {
    return null;
  }
};

class Report {
  constructor() { this.reels = []; this.repoChecks = []; }
  reel(name) { const r = {reel: name, checks: []}; this.reels.push(r); return r; }
  static add(bucket, id, severity, message, fix) {
    bucket.push({id, severity, message, ...(fix ? {fix} : {})});
  }
}
const add = Report.add;

/** The level content-rules `arc.severity` gives one story rule; unlisted rules warn. */
const sevOf = (rule) => SEV[R.arc.severity?.[rule]] ?? SEV.warn;

/**
 * One check whose notes carry their own level (see sevOf): the worst decides the check,
 * and each note is tagged with its level when the check mixes them.
 */
const addGraded = (bucket, id, notes, passMessage) => {
  if (!notes.length) { add(bucket, id, SEV.pass, passMessage); return; }
  const worst = notes.some((n) => n.sev === SEV.fail) ? SEV.fail : SEV.warn;
  const mixed = new Set(notes.map((n) => n.sev)).size > 1;
  add(bucket, id, worst, `${notes.length} ${id} ${worst === SEV.fail ? 'problem' : 'note'}(s)`,
    notes.map((n) => (mixed ? `${n.sev}: ${n.text}` : n.text)).join('; '));
};

// ---------------------------------------------------------------- checks

const VISUAL_REQUIRED = {
  candles: [], macd: [], rsi: [],
  pictogram: ['rows', 'columns', 'filledPercent', 'accent'],
  bars: ['bars'], list: ['items', 'accent'], cards: ['cards', 'accent'],
  zigzag: ['topLabel', 'endLabel', 'upLabel', 'downLabel', 'steps'],
  riskReward: ['left', 'right'],
  image: ['src'],
  lines: ['top', 'bottom'],
  movers: ['left', 'right'],
  outro: ['brand', 'kicker', 'pill', 'line'],
};
const ICONS = new Set(['check', 'warning', 'cross', 'up', 'down']);
const ACCENTS = new Set(['gold', 'red', 'green', 'white']);
/** Image marks may also take the direction pair (src/theme.ts COLORS.up/down) — never text. */
const MARK_ACCENTS = new Set([...ACCENTS, 'up', 'down']);
/** The TTS pronunciation map (voice.lexicon) as scripts/voiceover.mjs applies it. */
let LEXICON = lexiconOf(R);
const sayAs = (text) => LEXICON.reduce(
  (t, [word, say]) => t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu'), say),
  String(text ?? ''),
);
/** Camera drift while an image shot holds (src/types.ts ImageShot). */
const SHOT_MOVES = new Set(['push_in', 'pull_out', 'pan', 'tilt', 'static']);

/** Schema is a gate, not a peer: one clear FAIL beats twenty confusing ones. */
function checkSchema(t, reel) {
  const errs = [];
  if (!Array.isArray(reel.scenes) || !reel.scenes.length) errs.push('scenes[] is missing or empty');
  for (const [i, s] of (reel.scenes ?? []).entries()) {
    const at = `scene ${i + 1} (${s.id ?? '?'})`;
    for (const k of ['id', 'act', 'duration', 'beats', 'visual']) {
      if (s[k] === undefined) errs.push(`${at}: missing ${k}`);
    }
    if (s.eyebrow === undefined) errs.push(`${at}: missing eyebrow (use "" for none)`);
    if (s.act && R.arc && !R.arc.acts.includes(s.act)) errs.push(`${at}: act "${s.act}" not in ${R.arc.acts.join('|')}`);
    if (s.role !== undefined && !roleSpec(R, s.role)) errs.push(`${at}: role "${s.role}" not in ${roleNames(R).join('|')}`);
    if (s.id && R.arc?.sceneIdPattern && !new RegExp(R.arc.sceneIdPattern).test(s.id)) errs.push(`${at}: id "${s.id}" does not match ${R.arc.sceneIdPattern}`);
    const v = s.visual ?? {};
    if (!VISUAL_REQUIRED[v.type]) {
      errs.push(`${at}: visual.type "${v.type}" is not one of ${Object.keys(VISUAL_REQUIRED).join('|')}`);
    } else {
      for (const k of VISUAL_REQUIRED[v.type]) {
        if (v[k] === undefined) errs.push(`${at}: ${v.type} needs ${k}`);
      }
      if (v.type === 'list') {
        for (const it of v.items ?? []) {
          if (!ICONS.has(it.icon)) errs.push(`${at}: icon "${it.icon}" not in ${[...ICONS].join('|')}`);
        }
      }
      if (v.accent && !ACCENTS.has(v.accent)) errs.push(`${at}: accent "${v.accent}" invalid`);
      if (v.type === 'image' && v.annotations !== undefined) {
        if (!Array.isArray(v.annotations)) errs.push(`${at}: annotations must be an array`);
        for (const [j, a] of (Array.isArray(v.annotations) ? v.annotations : []).entries()) {
          const where = `${at} annotation ${j}`;
          const frac = (n) => typeof n === 'number' && n >= 0 && n <= 1;
          const need = {box: ['x', 'y', 'w', 'h'], circle: ['x', 'y', 'r'], label: ['x', 'y'], arrow: [], line: [], hline: ['y'], vline: ['x']}[a.kind];
          if (!need) { errs.push(`${where}: kind "${a.kind}" not in box|circle|arrow|line|label|hline|vline`); continue; }
          for (const k of need) if (!frac(a[k])) errs.push(`${where}: ${k} must be a fraction 0..1`);
          if ((a.kind === 'arrow' || a.kind === 'line') && !(Array.isArray(a.from) && Array.isArray(a.to) && [...a.from, ...a.to].every(frac))) {
            errs.push(`${where}: ${a.kind} needs from/to as [x, y] fractions 0..1`);
          }
          if (a.kind === 'label' && !a.text) errs.push(`${where}: label needs text`);
          if (a.kind === 'label' && a.anchor !== undefined && !['start', 'middle', 'end'].includes(a.anchor)) errs.push(`${where}: anchor "${a.anchor}" not in start|middle|end`);
          if (a.accent && !MARK_ACCENTS.has(a.accent)) errs.push(`${where}: accent "${a.accent}" invalid`);
          if (a.until !== undefined && !(Number.isInteger(a.until) && a.until >= (a.beat ?? 0))) {
            errs.push(`${where}: until ${a.until} must be an integer beat at or after its beat (${a.beat ?? 0})`);
          }
        }
      }
      if (v.type === 'image') {
        const frac = (n) => typeof n === 'number' && n >= 0 && n <= 1;
        const rectOk = (r) => r && frac(r.x) && frac(r.y) && typeof r.w === 'number' && typeof r.h === 'number'
          && r.w > 0 && r.h > 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001;
        if (v.crop !== undefined && !rectOk(v.crop)) errs.push(`${at}: crop must be {x,y,w,h} fractions of the photo, inside it`);
        for (const [j, m] of (Array.isArray(v.masks) ? v.masks : v.masks === undefined ? [] : [null]).entries()) {
          if (!rectOk(m)) errs.push(`${at} mask ${j}: must be {x,y,w,h} fractions of the photo`);
        }
      }
      if (v.type === 'movers') {
        for (const side of ['left', 'right']) {
          const col = v[side];
          if (!col?.title) errs.push(`${at}: movers.${side} needs a title`);
          if (!Array.isArray(col?.rows) || !col.rows.length) errs.push(`${at}: movers.${side}.rows needs at least one row`);
          else if (col.rows.length > 5) errs.push(`${at}: movers.${side} has ${col.rows.length} rows; the panel fits five`);
          else if (!col.rows.every((r) => typeof r.symbol === 'string' && Number.isFinite(r.changePercent))) errs.push(`${at}: movers.${side}.rows need symbol and changePercent`);
          if (col?.accent && !ACCENTS.has(col.accent)) errs.push(`${at}: movers.${side} accent "${col.accent}" invalid`);
        }
      }
      if (v.type === 'lines') {
        for (const side of ['top', 'bottom']) {
          const pane = v[side];
          const pts = pane?.points;
          if (!pane?.label) errs.push(`${at}: lines.${side} needs a label`);
          if (!Array.isArray(pts) || pts.length < 2) errs.push(`${at}: lines.${side}.points needs at least two [date, value] points`);
          else if (!pts.every((p) => Array.isArray(p) && /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && Number.isFinite(p[1]))) errs.push(`${at}: lines.${side}.points must be [YYYY-MM-DD, number] pairs`);
          if (pane?.accent && !ACCENTS.has(pane.accent)) errs.push(`${at}: lines.${side} accent "${pane.accent}" invalid`);
        }
        for (const [j, e] of (v.events ?? []).entries()) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(e?.t ?? '')) errs.push(`${at} event ${j}: t must be YYYY-MM-DD`);
        }
      }
      if (v.type === 'image' && v.shots !== undefined) {
        if (!Array.isArray(v.shots) || !v.shots.length) errs.push(`${at}: shots must be a non-empty array`);
        let prevBeat = -1;
        for (const [j, sh] of (Array.isArray(v.shots) ? v.shots : []).entries()) {
          const where = `${at} shot ${j}`;
          const frac = (n) => typeof n === 'number' && n >= 0 && n <= 1;
          if (!frac(sh.x) || !frac(sh.y)) errs.push(`${where}: x and y must be fractions 0..1 of the photo`);
          if (typeof sh.zoom !== 'number' || sh.zoom < 1 || sh.zoom > 4) errs.push(`${where}: zoom must be 1..4 (1 = the whole photo)`);
          if (sh.move !== undefined && !SHOT_MOVES.has(sh.move)) errs.push(`${where}: move "${sh.move}" not in ${[...SHOT_MOVES].join('|')}`);
          const b = sh.beat ?? 0;
          if (!Number.isInteger(b) || b <= prevBeat) errs.push(`${where}: beat ${b} must be an integer after the previous shot's (${prevBeat})`);
          if (j === 0 && b !== 0) errs.push(`${where}: the first shot must start at beat 0, or the scene opens unframed`);
          prevBeat = b;
        }
      }
    }
    for (const [k, b] of (s.beats ?? []).entries()) {
      if (typeof b.at !== 'number') errs.push(`${at} beat ${k}: at must be a number`);
      if (!b.line1) errs.push(`${at} beat ${k}: line1 is required`);
      if (b.accent && !ACCENTS.has(b.accent)) errs.push(`${at} beat ${k}: accent "${b.accent}" invalid`);
    }
    if (!(s.beats ?? []).length) errs.push(`${at}: needs at least one beat`);
  }
  if (errs.length) add(t, 'schema', SEV.fail, `${errs.length} schema error(s)`, errs.join('; '));
  else add(t, 'schema', SEV.pass, `${reel.scenes.length} scenes, shapes valid`);
  return errs;
}

/** The repo's #1 broken video, catchable with zero audio. */
function checkSentenceSync(t, reel) {
  const bad = [];
  for (const s of reel.scenes) {
    if (!s.narration) continue;
    const n = sentences(s.narration).length;
    if (s.sentenceStarts && s.sentenceStarts.length !== n) {
      bad.push(`${s.id}: ${n} sentences but ${s.sentenceStarts.length} sentenceStarts — narration was edited without --force`);
    }
    for (const [k, b] of s.beats.entries()) {
      if (b.atSentence == null) continue;
      if (b.atSentence < 0 || b.atSentence >= n) {
        bad.push(`${s.id} beat ${k}: atSentence ${b.atSentence} out of range (${n} sentences) — silently clamped to the last`);
      } else if (s.sentenceStarts && s.sentenceStarts[b.atSentence] !== undefined
                 && Math.abs(b.at - s.sentenceStarts[b.atSentence]) > 0.005) {
        bad.push(`${s.id} beat ${k}: at=${b.at} but sentence ${b.atSentence} starts at ${s.sentenceStarts[b.atSentence]}`);
      }
    }
  }
  if (bad.length) add(t, 'sentence-sync', SEV.fail, `${bad.length} beat/narration mismatch(es)`,
    bad.join('; ') + '; fix: node scripts/voiceover.mjs --content=<file> --force --retime');
  else add(t, 'sentence-sync', SEV.pass, 'beats agree with the narration they are pinned to');
}

function checkBeats(t, reel) {
  const bad = [];
  for (const s of reel.scenes) {
    let prev = -Infinity;
    for (const [k, b] of s.beats.entries()) {
      if (b.at <= prev) bad.push(`${s.id} beat ${k}: at=${b.at} not after the previous beat (${prev})`);
      prev = b.at;
      if (b.at > s.duration - 0.5) {
        bad.push(`${s.id} beat ${k}: at=${b.at} leaves under 0.5s before the scene ends (${s.duration}s)`);
      }
    }
    const v = s.visual ?? {};
    const gated = (v.type === 'rsi' && v.divergence) || v.type === 'macd'
      || (v.type === 'zigzag' && v.endLabel);
    if (gated && s.beats.length < 2) {
      bad.push(`${s.id}: ${v.type} hides part of its panel until beat 2, but the scene has one beat`);
    }
    for (const [j, a] of (v.type === 'image' ? v.annotations ?? [] : []).entries()) {
      if ((a.beat ?? 0) >= s.beats.length) {
        bad.push(`${s.id}: annotation ${j} waits for beat ${a.beat} but the scene has ${s.beats.length} beat(s) — it never shows`);
      }
    }
    for (const [j, sh] of (v.type === 'image' && Array.isArray(v.shots) ? v.shots : []).entries()) {
      if ((sh.beat ?? 0) >= s.beats.length) {
        bad.push(`${s.id}: shot ${j} waits for beat ${sh.beat} but the scene has ${s.beats.length} beat(s) — the camera never gets there`);
      }
    }
    if (v.type === 'candles' && v.bands && v.bands.length !== s.beats.length) {
      bad.push(`${s.id}: ${v.bands.length} bands for ${s.beats.length} beats — bands are indexed by beat, extras never show`);
    }
  }
  if (bad.length) add(t, 'beats', SEV.fail, `${bad.length} beat problem(s)`, bad.join('; '));
  else add(t, 'beats', SEV.pass, 'beats ordered, in scene, and matched to their panel');
}

function checkNarration(t, reel) {
  const bad = [], warn = [];
  const N = R.narration;
  if (!N) { add(t, 'narration', SEV.skip, 'no narration block in this reel\'s rules'); return; }
  for (const s of reel.scenes) {
    if (!s.narration) continue;
    if (/\d/.test(s.narration)) {
      bad.push(`${s.id}: narration contains digits — spell them (${s.narration.match(/\S*\d\S*/g).join(', ')})`);
    }
    const w = words(s.narration).length;
    if (w < N.minWordsPerScene || w > N.maxWordsPerScene) {
      bad.push(`${s.id}: ${w} words, outside ${N.minWordsPerScene}-${N.maxWordsPerScene}`);
    } else if (w < N.warnWordsPerScene[0] || w > N.warnWordsPerScene[1]) {
      warn.push(`${s.id}: ${w} words`);
    }
    const n = sentences(s.narration).length;
    if (n < N.minSentencesPerScene || n > N.maxSentencesPerScene) {
      warn.push(`${s.id}: ${n} sentences, outside ${N.minSentencesPerScene}-${N.maxSentencesPerScene}`);
    }
  }
  if (bad.length) add(t, 'narration', SEV.fail, `${bad.length} narration problem(s)`, bad.join('; '));
  else if (warn.length) add(t, 'narration', SEV.warn, `${warn.length} near a budget edge`, warn.join('; '));
  else add(t, 'narration', SEV.pass, 'word counts and digit rule clean');
}

/**
 * Does it sound like a person? Heuristics only, so WARN only; thresholds in content-rules.style.
 * They catch the machine signature measured on reel channel 2026-09-23: every scene on the same
 * word budget edge, a spoken number in every sentence, report vocabulary, headlines that are
 * two rows of digits. verify cannot hear tone; the reviewer reads the script aloud for that.
 * Added 2026-09-23 (later), same day the user asked for trader vocabulary and pace: a positive
 * vocabulary check (style.tradeWords), sentence-length contrast inside a scene, and role pace
 * (short roles at or below the reel's median words, long roles at or above — arc.roles.*.pace).
 */
function checkStyle(t, reel) {
  const S = R.style;
  if (!S) { add(t, 'style', SEV.skip, 'no style block in content-rules.json'); return; }
  const warn = [];
  const STRONG = new Set(S.spokenNumberWords.filter((w) => !w.includes(' ')));
  const BASIC = new Set(['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười']);
  // A spoken number is a RUN of number words that either holds a strong word (nghìn, mươi, phẩy,
  // phần trăm…) or is two or more digit words long. A lone "năm" is a year, a lone "một" an
  // article, "hai năm" two years — people say those; they are not figures being read out.
  const spokenNumbers = (text) => {
    const toks = String(text).toLowerCase().replace(/[.,!?;:…()]/g, ' ').split(/\s+/).filter(Boolean);
    // 'không' is part of the number in 'một nghìn không trăm chín mươi chín' (1099) and 'hai nghìn không trăm
    // hai mươi hai'; elsewhere (hai không mười tám, không phải) it is not a figure.
    const isTok = (i) => BASIC.has(toks[i]) || STRONG.has(toks[i]) || (toks[i] === 'phần' && toks[i + 1] === 'trăm')
      || (toks[i] === 'không' && (toks[i + 1] === 'trăm' || toks[i - 1] === 'nghìn'));
    let runs = 0;
    for (let i = 0; i < toks.length;) {
      if (!isTok(i)) { i++; continue; }
      let j = i, strong = false;
      while (j < toks.length && isTok(j)) { if (STRONG.has(toks[j]) || toks[j] === 'phần') strong = true; j++; }
      if (strong || j - i >= 2) runs++;
      i = j;
    }
    return runs;
  };
  const counts = [];
  const perRole = [];
  let tradeScenes = 0;
  for (const sc of reel.scenes) {
    if (!sc.narration) continue;
    const n = sc.narration;
    counts.push(words(n).length);
    perRole.push({id: sc.id, role: roleOf(R, sc), w: words(n).length});
    if ((S.tradeWords ?? []).some((w) => n.toLowerCase().includes(w))) tradeScenes++;
    const sents = sentences(n);
    const perSentence = sents.map(spokenNumbers);
    if (S.sentenceContrastWords && sents.length >= 3) {
      const lens = sents.map((x) => words(x).length);
      const lo = Math.min(...lens), hi = Math.max(...lens);
      if (hi - lo < S.sentenceContrastWords) warn.push(`${sc.id}: every sentence is ${lo}–${hi} words — follow a long sentence with a short one`);
    }
    const total = perSentence.reduce((a, b) => a + b, 0);
    if (total > S.maxSpokenNumbersPerScene) warn.push(`${sc.id}: ${total} spoken numbers in one scene (max ${S.maxSpokenNumbersPerScene}) — let the headline carry the digits`);
    else if (perSentence.some((c) => c > S.maxSpokenNumbersPerSentence)) warn.push(`${sc.id}: a sentence speaks ${Math.max(...perSentence)} numbers — one per sentence`);
    if (S.openingNumberWarn && sents[0]) {
      const first = sents[0].toLowerCase();
      const opener = first.split(/\s+/).slice(0, 6).join(' ');
      if (spokenNumbers(opener) > 0) warn.push(`${sc.id}: opens with a number ("${sents[0].slice(0, 40)}…") — open with what you see or a question`);
    }
    for (const [w, max] of Object.entries(S.reportWords)) {
      const c = (n.toLowerCase().match(new RegExp(w, 'g')) ?? []).length;
      if (c > max) warn.push(`${sc.id}: "${w}" ×${c} (max ${max})`);
    }
    const addr = S.addressWords.reduce((a, w) => a + (n.toLowerCase().match(new RegExp(`\\b${w}\\b`, 'g')) ?? []).length, 0);
    if (addr > S.maxAddressPerScene) warn.push(`${sc.id}: "bạn/mình" ×${addr} — one or two per scene`);
    if (S.headlineBothLinesNumeric === 'warn') {
      for (const [k, b] of sc.beats.entries()) {
        if (/\d/.test(b.line1 ?? '') && /\d/.test(b.line2 ?? '')) warn.push(`${sc.id} beat ${k}: both headline lines are numbers — line 2 should say what it means`);
      }
    }
  }
  if (counts.length >= 4) {
    const spread = Math.max(...counts) - Math.min(...counts);
    if (spread < S.minSceneWordSpread) warn.push(`every scene is ${Math.min(...counts)}–${Math.max(...counts)} words — same budget edge everywhere; let hook and outro breathe`);
  }
  if (counts.length >= 4) {
    // Role pace lives with the role (arc.roles.<role>.pace), the same field enrich aims _words at.
    const sorted = [...counts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const p of perRole) {
      const pace = roleSpec(R, p.role)?.pace;
      if (pace === 'short' && p.w > median) warn.push(`${p.id}: ${p.role} is ${p.w} words, above the reel's median ${median} — hook and outro breathe`);
      if (pace === 'long' && p.w < median) warn.push(`${p.id}: ${p.role} is ${p.w} words, below the reel's median ${median} — the evidence carries the detail`);
    }
  }
  if (S.tradeWords?.length && counts.length >= 4) {
    const pct = Math.round((tradeScenes / counts.length) * 100);
    if (pct < S.minTradeWordScenesPercent) warn.push(`only ${tradeScenes}/${counts.length} scenes use a trading term (${pct}%, min ${S.minTradeWordScenesPercent}%) — kháng cự, hỗ trợ, tích luỹ, phá vỡ, thanh khoản…`);
  }
  if (warn.length) add(t, 'style', SEV.warn, `${warn.length} voice note(s) — reads like a report`, warn.join('; '));
  else add(t, 'style', SEV.pass, 'sounds like a person: varied lengths, trading vocabulary, few spoken numbers, headlines carry meaning');
}

/** Where this reel sits in scaffold -> enrich -> review -> fan out. */
function checkStatus(t, reel) {
  const STAGES = ['scaffolded', 'enriched', 'reviewed'];
  const st = reel.status;
  if (!st) { add(t, 'status', SEV.pass, 'no status field — hand-authored reel'); return; }
  if (!STAGES.includes(st)) {
    add(t, 'status', SEV.fail, `status "${st}" is not one of ${STAGES.join(' -> ')}`);
    return;
  }
  const todos = [];
  for (const sc of reel.scenes) {
    const blob = JSON.stringify(sc);
    if (blob.includes('TODO')) todos.push(sc.id);
  }
  if (todos.length) {
    add(t, 'status', st === 'scaffolded' ? SEV.warn : SEV.fail,
      `${todos.length} scene(s) still hold TODO placeholders`,
      todos.join('; ') + (st === 'scaffolded' ? '; run the enrich worker' : '; the worker left them unfilled'));
    return;
  }
  if (st === 'reviewed') add(t, 'status', SEV.pass, 'reviewed — voiceover and render are unblocked');
  else add(t, 'status', SEV.warn, `"${st}" — a person still has to read it (npm run approve)`);
}

function checkArc(t, reel) {
  if (!R.arc) { add(t, 'arc', SEV.skip, 'no arc block in this reel\'s rules'); return; }
  const n = reel.scenes.length;
  const notes = [];
  const note = (rule, text) => notes.push({sev: sevOf(rule), text});
  if (n < R.arc.minScenes || n > R.arc.maxScenes) {
    note('sceneCount', `${n} scenes, outside ${R.arc.minScenes}-${R.arc.maxScenes}`);
  }
  const last = reel.scenes[n - 1];
  if (last.visual?.type !== 'outro') note('outroPanel', `last scene is ${last.visual?.type}, expected outro`);
  const order = R.arc.acts;
  let seen = 0;
  for (const s of reel.scenes) {
    const at = order.indexOf(s.act);
    if (at < seen) { note('actOrder', `${s.id}: act "${s.act}" goes backwards`); break; }
    seen = at;
  }
  const secs = Math.round(reel.scenes.reduce((a, s) => a + (s.duration ?? 0), 0) * 10) / 10;
  const [lo, hi] = R.arc.totalSecondsWarn ?? [0, Infinity];
  if (secs < lo || secs > hi) {
    note('totalSeconds', `${secs}s in all, outside ${lo}-${hi}s — ${secs > hi ? 'cut a scene or tighten the longest ones' : 'the reel ends before its argument lands'}`);
  }
  addGraded(t, 'arc', notes, `${n} scenes · ${secs}s, acts move forward, outro last`);
}

/**
 * The story the roles tell (content-rules arc.roles, user 2026-09-29): it opens on the hook and
 * closes on the outro, a role with `minRun` (the history chapters of a timeline) comes in
 * consecutive runs, and a role with `mustSay` (a scenario) says out loud what it is.
 */
function checkRoles(t, reel) {
  if (!R.arc?.roles) { add(t, 'roles', SEV.skip, 'no arc.roles in this reel\'s rules'); return; }
  const notes = [];
  const note = (rule, text) => notes.push({sev: sevOf(rule), text});
  const roles = reel.scenes.map((s) => roleOf(R, s));
  for (const [i, s] of reel.scenes.entries()) {
    if (!roles[i]) note('roleOrder', `${s.id}: no role — set "role" to one of ${roleNames(R).join('|')}`);
  }
  const first = roles[0], last = roles[roles.length - 1];
  if (first && first !== R.arc.firstRole) note('roleOrder', `the reel opens on ${first}, not ${R.arc.firstRole} — the promise has to land in the first seconds`);
  if (last && last !== R.arc.lastRole) note('roleOrder', `the reel ends on ${last}, not ${R.arc.lastRole}`);
  for (const role of roleNames(R)) {
    const need = roleSpec(R, role).minRun;
    if (!need) continue;
    for (let i = 0; i < roles.length;) {
      if (roles[i] !== role) { i++; continue; }
      let j = i;
      while (j < roles.length && roles[j] === role) j++;
      if (j - i < need) note('minRun', `${reel.scenes[i].id}: ${j - i} ${role} in a row, needs ${need} — add its sibling chapters, or relabel a lone one as evidence`);
      i = j;
    }
  }
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [i, s] of reel.scenes.entries()) {
    const must = roleSpec(R, roles[i])?.mustSay;
    if (!must?.length || !s.narration || s.narration.includes('TODO')) continue;
    const said = must.some((w) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, 'iu').test(s.narration));
    if (!said) note('mustSay', `${s.id}: a ${roles[i]} has to say it is one — the narration needs ${must.map((w) => `"${w}"`).join(' / ')}, told as an if-then branch, not a call`);
  }
  // hook → concept → chapter×3 → …: the arc in one line, repeats folded.
  const runs = [];
  for (const r of roles) {
    const top = runs[runs.length - 1];
    if (top && top.r === r) top.n++;
    else runs.push({r: r || '?', n: 1});
  }
  addGraded(t, 'roles', notes, runs.map((x) => (x.n > 1 ? `${x.r}×${x.n}` : x.r)).join(' → '));
}

/**
 * vox-director's camera rules as SKILL.md 1d states them: neighbouring framings never share a
 * move, and `static` is saved for a scene's payoff — its last shot. Framings are neighbours inside
 * a scene, and across a scene cut when the next scene stays on the same photo.
 */
function checkCamera(t, reel) {
  const notes = [];
  const note = (text) => notes.push({sev: sevOf('shots'), text});
  let prev = null;
  let count = 0;
  for (const s of reel.scenes) {
    const v = s.visual ?? {};
    const shots = v.type === 'image' && Array.isArray(v.shots) ? v.shots : [];
    if (!shots.length) { prev = null; continue; }
    for (const [j, sh] of shots.entries()) {
      const move = sh.move ?? 'push_in';
      count++;
      if (prev && prev.move === move && (j > 0 || prev.src === v.src)) {
        note(`${s.id} shot ${j}: ${move} again right after ${prev.id} shot ${prev.j} — change the move with the framing`);
      }
      if (move === 'static' && j < shots.length - 1) note(`${s.id} shot ${j}: static before the scene's last shot — hold still only for the payoff`);
      prev = {src: v.src, move, id: s.id, j};
    }
  }
  if (!count) { add(t, 'camera', SEV.pass, 'no image shots to check'); return; }
  addGraded(t, 'camera', notes, `${count} shots: no move repeats back to back, static only on a payoff`);
}

/** Annotations that name a month or year the series does not contain draw nothing. */
function checkDataRefs(t, reel) {
  if (!SERIES) { add(t, 'data-refs', SEV.skip, `${R.series.path} not readable`); return; }
  const byMonth = new Map(SERIES.map((c) => [c.t, c]));
  const years = new Set(SERIES.map((c) => c.t.slice(0, 4)));
  const closes = SERIES.map((c) => c.c);
  const rsi = rsiSeries(closes, R.series.rsiPeriod);
  const idx = new Map(SERIES.map((c, i) => [c.t, i]));
  const bad = [];
  for (const s of reel.scenes) {
    const v = s.visual ?? {};
    for (const b of v.bands ?? []) {
      if (!years.has(b.year)) bad.push(`${s.id}: band year ${b.year} has no candle`);
    }
    for (const y of v.touches ?? []) {
      if (!R.series.peakMonths.some((m) => m.startsWith(y))) {
        bad.push(`${s.id}: touch "${y}" is not a peakMonths year — no dot is drawn`);
      }
    }
    for (const m of v.marks ?? []) {
      if (!byMonth.has(m.month)) { bad.push(`${s.id}: mark ${m.month} has no candle`); continue; }
      if (idx.get(m.month) < R.series.rsiPeriod) {
        bad.push(`${s.id}: mark ${m.month} is inside the ${R.series.rsiPeriod}-bar RSI warm-up — it plots at 0`);
      }
      const want = rsi[idx.get(m.month)];
      const got = Number(String(m.label).replace(',', '.'));
      if (Number.isFinite(got) && want != null && !near(got, want, 2)) {
        bad.push(`${s.id}: mark ${m.month} labelled ${m.label} but RSI there is ${want.toFixed(1)}`);
      }
    }
    if (v.divergence) {
      for (const k of ['from', 'to']) {
        if (!byMonth.has(v.divergence[k])) bad.push(`${s.id}: divergence.${k} ${v.divergence[k]} has no candle`);
      }
    }
  }
  if (bad.length) add(t, 'data-refs', SEV.fail, `${bad.length} annotation(s) point at nothing`, bad.join('; '));
  else add(t, 'data-refs', SEV.pass, 'every month and year on a chart exists in the series');
}

/** The one the viewer can count. */
function checkPictogram(t, reel) {
  const bad = [];
  for (const s of reel.scenes) {
    const v = s.visual ?? {};
    if (v.type !== 'pictogram') continue;
    const total = v.rows * v.columns;
    const filled = Math.round((v.filledPercent / 100) * total);
    let drawn = 0;
    for (let k = 0; k < total; k++) if ((k * 7 + 3) % total >= total - filled) drawn++;
    const actual = (drawn / total) * 100;
    if (!near(actual, v.filledPercent, R.claims.tolerancePercent)) {
      bad.push(`${s.id}: ${v.rows}x${v.columns} at ${v.filledPercent}% draws ${drawn}/${total} = ${actual.toFixed(1)}% — the viewer can count the difference`);
    }
  }
  if (bad.length) add(t, 'pictogram', SEV.fail, `${bad.length} grid(s) disagree with their percentage`,
    bad.join('; ') + '; fix: pick rows x columns so the percentage lands on a whole glyph');
  else add(t, 'pictogram', SEV.pass, 'grids match their stated percentage');
}

/** Panel is 880x560 with overflow:hidden; SVG text does not wrap. */
function checkGeometry(t, reel) {
  const bad = [], warn = [];
  const {panel, headlineMaxWidth, headlineWarnChars, monoAdvanceEm} = R.layout;
  const first = SERIES ? monthIndex(SERIES[0].t) : null;
  const last = SERIES ? monthIndex(SERIES[SERIES.length - 1].t) : null;
  const span = first != null ? last - first : null;
  const PAD = 22, PLOT = panel.w - PAD * 2;
  const x = (i) => PAD + ((i - first) / span) * PLOT;

  for (const s of reel.scenes) {
    const v = s.visual ?? {};
    if (v.type === 'pictogram') {
      const gridW = (v.columns - 1) * 95 + 45;
      const gridH = (v.rows - 1) * 84.4 + 50.4;
      if (gridW > panel.w) bad.push(`${s.id}: ${v.columns} columns need ${Math.round(gridW)}px of ${panel.w}`);
      if (gridH > panel.h) bad.push(`${s.id}: ${v.rows} rows need ${Math.round(gridH)}px of ${panel.h}`);
    }
    if (v.type === 'list') {
      const h = (v.items.length - 1) * 112 + 70;
      if (h > panel.h) bad.push(`${s.id}: ${v.items.length} rows need ${Math.round(h)}px of ${panel.h}`);
    }
    if (v.type === 'candles' && span) {
      const step = PLOT / span;
      for (const b of v.bands ?? []) {
        // CandleChart clamps the band to the panel, so an overrun is no longer
        // a clipped rail — it means the year is only partly in the series and
        // the band will look narrower than a full year.
        const right = x(monthIndex(`${b.year}-12`)) + step * 3;
        const left = x(monthIndex(`${b.year}-01`)) - step * 3;
        const months = SERIES.filter((c) => c.t.startsWith(b.year)).length;
        if (right > panel.w || left < 0) {
          warn.push(`${s.id}: the ${b.year} band is clamped to the panel — that year has ${months}/12 months in the series, so it is drawn narrower than the others`);
        }
      }
    }
    if (v.caption) {
      // Chart footers are 17px JetBrains Mono with 1.6px tracking (CandleChart/RsiChart FOOTER).
      const w = v.caption.length * (17 * monoAdvanceEm + 1.6);
      if (w > PLOT) bad.push(`${s.id}: caption is ${Math.round(w)}px wide, ${Math.round(PLOT)}px available`);
    }
    for (const b of s.beats) {
      for (const line of [b.line1, b.line2].filter(Boolean)) {
        if (line.length > headlineWarnChars) {
          warn.push(`${s.id}: "${line}" is ${line.length} chars — it shrinks below the ${R.layout.headlineMaxFontSize}px cap`);
        }
      }
    }
  }
  if (bad.length) add(t, 'geometry', SEV.fail, `${bad.length} element(s) overflow the panel`, bad.join('; '));
  else if (warn.length) add(t, 'geometry', SEV.warn, `${warn.length} headline(s) will auto-shrink`, warn.join('; '));
  else add(t, 'geometry', SEV.pass, 'panel contents and headlines fit');
}

/**
 * Every figure on screen must be traceable to the fact pack.
 *
 * This is the check the enrichment layer exists for: `enrich.mjs` derives the
 * numbers, the worker is told to cite nothing else, and here is where that is
 * actually enforced. Narration carries no digits by rule, so the surface is the
 * headline lines and the text fields of the panel.
 */
function checkFacts(t, reel) {
  if (!reel.facts) { add(t, 'facts', SEV.skip, 'no facts file — hand-authored reel'); return; }
  const fp = resolve(ROOT, reel.facts);
  if (!existsSync(fp)) {
    add(t, 'facts', SEV.fail, `${reel.facts} is referenced but missing`,
      'regenerate it: npm run enrich -- <brief>');
    return;
  }
  const facts = JSON.parse(readFileSync(fp, 'utf8'));

  // Every number anywhere in the pack, plus the years and the |value| of each
  // signed figure — a drawdown of -42.8 is legitimately spoken as "42,8".
  const allowed = new Set();
  const walk = (v) => {
    if (typeof v === 'number') { allowed.add(Math.abs(v)); return; }
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4})-\d{2}$/);
      if (m) allowed.add(Number(m[1]));
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') { Object.values(v).forEach(walk); }
  };
  walk(facts);

  // Match at the precision the label actually shows, NOT within a percentage
  // band. Measured 2026-09-22: with 120 values in a pack and a flat 1%
  // tolerance, 27% of random one-decimal numbers found a "match" — the check
  // was theatre. Rounding the fact to the shown precision makes it mean
  // something: "1933" must round from a real figure, not merely be near one.
  const decimals = (s) => (s.includes('.') || s.includes(',') ? s.split(/[.,]/)[1].length : 0);
  const traced = (n, dp) =>
    [...allowed].some((a) => Number(a.toFixed(dp)) === Number(n.toFixed(dp)));

  // Digits carried by a decimal comma are Vietnamese decimals, not thousands.
  const numbersIn = (text) =>
    [...String(text).matchAll(/\d+(?:[.,]\d+)?/g)]
      .map((m) => ({value: Number(m[0].replace(',', '.')), dp: decimals(m[0])}))
      .filter((x) => Number.isFinite(x.value));

  // A number that is a calendar month or a count of what is drawn is not a
  // claim about the data. Patterns live in content-rules.json; adding one
  // widens the gate, which is the user's call.
  const exemptions = (R.claims?.factsExemptions ?? []).map((e) => new RegExp(e.pattern, 'giu'));
  const exemptNumbers = (text) => {
    const out = new Set();
    for (const re of exemptions) {
      for (const m of String(text).matchAll(re)) {
        for (const n of m[0].matchAll(/\d+(?:[.,]\d+)?/g)) out.add(Number(n[0].replace(',', '.')));
      }
    }
    return out;
  };

  const NOT_TEXT = new Set(['type', 'src', 'fit', 'focus', 'sourceCorner', 'maskColor', 'logo']);
  const bad = [];
  for (const sc of reel.scenes) {
    const surfaces = [
      ...sc.beats.flatMap((b) => [['beat', b.line1], ['beat', b.line2 ?? '']]),
      // String fields that are drawn as text; paths, colours and CSS values are not claims.
      ...Object.entries(sc.visual ?? {}).flatMap(([k, v]) =>
        typeof v === 'string' && !NOT_TEXT.has(k) ? [[`visual.${k}`, v]] : []),
      ...(sc.visual?.items ?? []).map((it) => ['visual.items', it.text]),
      ...(sc.visual?.cards ?? []).flatMap((c) => [['visual.cards', c.title], ['visual.cards', c.body]]),
      ...(sc.visual?.bars ?? []).map((b) => ['visual.bars', `${b.label} ${b.percent}`]),
      ...(sc.visual?.marks ?? []).map((m) => ['visual.marks', String(m.label)]),
      ...(sc.visual?.annotations ?? []).map((a) => ['visual.annotations', a.label ?? a.text ?? '']),
      // A movers board prints each row's change and volume ratio from its numbers.
      ...['left', 'right'].flatMap((side) => (sc.visual?.type === 'movers' && sc.visual[side] ? [
        [`visual.${side}.title`, sc.visual[side].title ?? ''],
        ...(sc.visual[side].rows ?? []).map((r) => [`visual.${side}.rows`, `${r.symbol} ${Number(r.changePercent).toFixed(2)} ${r.volumeRatio != null ? Number(r.volumeRatio).toFixed(2) : ''}`]),
      ] : [])),
    ];
    for (const [where, text] of surfaces) {
      const exempt = exemptNumbers(text);
      for (const {value, dp} of numbersIn(text)) {
        if (exempt.has(value) || traced(value, dp)) continue;
        bad.push(`${sc.id} ${where}: "${text}" cites ${value}, which is not in ${reel.facts}`);
      }
    }
  }
  // An overridden ticker prints its own close and change on every scene (Ticker.tsx:
  // integer points, change at 2dp). The series-derived default needs no pack.
  const tk = reel.ticker;
  if (tk && typeof tk.last === 'number') {
    const shown = [['ticker.last', tk.last, 0]];
    if (typeof tk.prev === 'number') shown.push(['ticker change', Math.abs(((tk.last - tk.prev) / tk.prev) * 100), 2]);
    for (const [where, n, dp] of shown) {
      if (!traced(Number(n.toFixed(dp)), dp)) bad.push(`reel ${where}: shows ${n.toFixed(dp)}, which is not in ${reel.facts}`);
    }
  }
  if (bad.length) add(t, 'facts', SEV.fail, `${bad.length} untraceable figure(s)`,
    bad.join('; ') + '; every number on screen must come from the fact pack');
  else add(t, 'facts', SEV.pass, `every figure traces to ${reel.facts}`);
}

/** Superlatives and "right now" claims the data does not support. */
function checkClaims(t, reel) {
  if (!R.claims) { add(t, 'claims', SEV.skip, 'no claims block in this reel\'s rules'); return; }
  if (!SERIES) { add(t, 'claims', SEV.skip, `${R.series.path} not readable`); return; }
  const lastMonth = SERIES[SERIES.length - 1].t;
  const warn = [];
  for (const s of reel.scenes) {
    const text = [s.narration ?? '', ...s.beats.flatMap((b) => [b.line1, b.line2 ?? ''])].join(' ').toLowerCase();
    const v = s.visual ?? {};
    if (R.claims.recencyMarkers.some((m) => text.includes(m))) {
      const refs = [...(v.marks ?? []).map((m) => m.month), v.divergence?.to].filter(Boolean);
      if (refs.length && !refs.includes(lastMonth)) {
        warn.push(`${s.id}: says "right now" but points at ${refs.join(', ')} while the series ends ${lastMonth}`);
      }
    }
    for (const sup of R.claims.superlatives) {
      if (text.includes(sup)) { warn.push(`${s.id}: "${sup}" — confirm it against the whole series, not the window you looked at`); break; }
    }
  }
  if (warn.length) add(t, 'claims', SEV.warn, `${warn.length} claim(s) to re-check`, warn.join('; '));
  else add(t, 'claims', SEV.pass, 'no unverified superlative or recency claim');
}

function checkVoiceAssets(t, reel) {
  const bad = [];
  const ref = resolve(ROOT, R.voice.refAudio);
  const txt = ref.replace(/_24k\.wav$|\.wav$/, '.txt');
  if (!existsSync(ref)) bad.push(`missing ${R.voice.refAudio}`);
  if (!existsSync(txt)) bad.push(`missing ${txt.replace(ROOT + '/', '')} (the _24k suffix is stripped to find it)`);
  if (existsSync(txt)) {
    const head = words(readFileSync(txt, 'utf8').toLowerCase().replace(/[^\p{L}\s]/gu, ''))
      .slice(0, R.voice.refTextOverlapWords).join(' ');
    for (const s of reel.scenes) {
      for (const sent of sentences(s.narration ?? '')) {
        const h = words(sent.toLowerCase().replace(/[^\p{L}\s]/gu, ''))
          .slice(0, R.voice.refTextOverlapWords).join(' ');
        if (h && h === head) bad.push(`${s.id}: a sentence opens with the same words as the reference clip — the model will drop them`);
      }
    }
  }
  for (const s of reel.scenes) {
    const logo = s.visual?.logo;
    if (logo && !existsSync(resolve(ROOT, 'public', logo))) bad.push(`${s.id}: logo public/${logo} missing`);
    if (s.visual?.type === 'image') {
      const src = s.visual.src;
      if (!src || src === 'TODO') bad.push(`${s.id}: image has no src — shoot it: node scripts/shoot.mjs … --out=public/shots/<name>.png`);
      else if (!existsSync(resolve(ROOT, 'public', src))) bad.push(`${s.id}: image public/${src} missing`);
      else if (!existsSync(resolve(ROOT, 'public', src.replace(/\.png$/, '') + '.json'))) {
        bad.push(`${s.id}: public/${src} has no .json sidecar — it was not taken by scripts/shoot.mjs, so its source and time are unknown`);
      }
    }
  }
  if (reel.music && !existsSync(resolve(ROOT, 'public', reel.music))) bad.push(`music public/${reel.music} missing`);
  if (bad.length) add(t, 'assets', SEV.fail, `${bad.length} asset problem(s)`, bad.join('; '));
  else add(t, 'assets', SEV.pass, 'voice reference and static assets present');
}

/** SKIP until a wav exists — this is what keeps the authoring loop fast. */
function checkAudio(t, reel, id) {
  const missing = reel.scenes.filter((s) => s.narration && !s.audio).length;
  const present = reel.scenes.filter((s) => s.audio && existsSync(resolve(ROOT, 'public', s.audio)));
  if (!present.length) {
    add(t, 'audio', SEV.skip, 'no voice tracks yet — run npm run voiceover');
    return;
  }
  if (missing) add(t, 'audio', SEV.warn, `${missing} scene(s) have narration but no audio path`);
  const bad = [], warn = [];
  for (const s of reel.scenes) {
    if (!s.audio) continue;
    const f = resolve(ROOT, 'public', s.audio);
    if (!existsSync(f)) { bad.push(`${s.id}: ${s.audio} is referenced but missing`); continue; }
    const dur = ffprobe(f);
    if (dur == null) { bad.push(`${s.id}: ffprobe could not read ${s.audio}`); continue; }
    const frames = Math.round(s.duration * R.layout.fps) / R.layout.fps;
    if (dur > frames + 0.02) {
      bad.push(`${s.id}: ${dur.toFixed(2)}s of voice in a ${frames.toFixed(2)}s scene — the last word is cut off`);
    }
    const speech = dur - R.audio.leadIn - R.audio.tail;
    if (speech > 0 && s.narration) {
      // Count what the voice SAYS: a lexicon term like MACD is one token on paper, four syllables aloud.
      const rate = words(sayAs(s.narration)).length / speech;
      const [lo, hi] = R.narration.syllableRateWarn;
      const [flo, fhi] = R.narration.syllableRateFail;
      if (rate < flo || rate > fhi) bad.push(`${s.id}: ${rate.toFixed(2)} syllables/s, outside ${flo}-${fhi}`);
      else if (rate < lo || rate > hi) warn.push(`${s.id}: ${rate.toFixed(2)} syllables/s`);
    }
  }
  if (bad.length) add(t, 'audio', SEV.fail, `${bad.length} audio problem(s)`,
    bad.join('; ') + '; fix: node scripts/voiceover.mjs --content=<file> --retime');
  else if (warn.length) add(t, 'audio', SEV.warn, `${warn.length} scene(s) off the natural speaking rate`, warn.join('; '));
  else add(t, 'audio', SEV.pass, `${present.length} tracks fit their scenes`);
}

// ---------------------------------------------------------------- repo-wide

/** One registry now, so the check is that every declared reel resolves to a file. */
function checkRegistration(report) {
  const msgs = [];
  for (const [id, path] of ROOT_REG) {
    if (!path) msgs.push(`${id}: no content import found in src/Root.tsx`);
    else if (!existsSync(resolve(ROOT, path))) msgs.push(`${id}: ${path} does not exist`);
  }
  if (msgs.length) add(report.repoChecks, 'registration', SEV.fail, `${msgs.length} registry problem(s)`, msgs.join('; '));
  else add(report.repoChecks, 'registration', SEV.pass, `${ROOT_REG.size} reels declared in src/Root.tsx, all resolving`);
}

function checkVoiceStems(report, loaded) {
  const claim = new Map();
  const clash = [];
  for (const [id, reel] of loaded) {
    for (const [i, s] of reel.scenes.entries()) {
      const stem = `${String(i + 1).padStart(2, '0')}-${s.id}`;
      const prev = claim.get(stem);
      if (prev && prev.narration !== s.narration) {
        clash.push(`${stem}.wav is claimed by ${prev.id}:${prev.scene} and ${id}:${s.id} with different narration — the second reel inherits the first one's voice`);
      }
      if (!prev) claim.set(stem, {id, scene: s.id, narration: s.narration});
    }
  }
  if (clash.length) add(report.repoChecks, 'voice-stems', SEV.fail, `${clash.length} filename collision(s)`, clash.join('; '));
  else add(report.repoChecks, 'voice-stems', SEV.pass, `${claim.size} voice stems unique across every reel`);
}

function checkSeries(report) {
  if (!SERIES) {
    add(report.repoChecks, 'series', SEV.fail, `cannot read ${R.series.path}`,
      'run node scripts/make-series.mjs or node scripts/fetch-market.mjs');
    return;
  }
  const have = new Set(SERIES.map((c) => c.t));
  const msgs = [];
  for (const m of [...R.series.peakMonths, ...R.series.troughMonths]) {
    if (!have.has(m)) msgs.push(`${m} is named in src/lib/series.ts but absent — this throws at module scope and kills EVERY composition`);
  }
  let gaps = 0, ohlc = 0;
  for (let i = 0; i < SERIES.length; i++) {
    const c = SERIES[i];
    if (i && monthIndex(c.t) !== monthIndex(SERIES[i - 1].t) + 1) gaps++;
    if (c.h < Math.max(c.o, c.c) - 1e-6 || c.l > Math.min(c.o, c.c) + 1e-6) ohlc++;
  }
  if (gaps) msgs.push(`${gaps} month gap(s) — the x axis stretches across them silently`);
  if (ohlc) msgs.push(`${ohlc} bar(s) where high/low do not contain open/close`);
  if (msgs.length) add(report.repoChecks, 'series', SEV.fail, `${msgs.length} series problem(s)`, msgs.join('; '));
  else add(report.repoChecks, 'series', SEV.pass, `${SERIES.length} candles, ${SERIES[0].t}..${SERIES[SERIES.length - 1].t}, anchors present`);
}

// ---------------------------------------------------------------- run

const report = new Report();
const loaded = [];

for (const id of ids) {
  const rel = ROOT_REG.get(id) ?? DRAFTS.get(id);
  const t = report.reel(id);
  let reel;
  try {
    reel = JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
  } catch (e) {
    die(`${rel} is not valid JSON — ${e.message}`);
  }
  // A draft is checked on its own: its stems are meant to replace the registered reel's, so it
  // stays out of the cross-reel collision check.
  if (!DRAFTS.has(id)) loaded.push([id, reel]);
  try {
    R = loadRules(ROOT, {reel});
  } catch (e) {
    die(`${rel}: its rules file ${reel.rules} cannot be read — ${e.message}`);
  }
  LEXICON = lexiconOf(R);
  if (checkSchema(t.checks, reel).length) continue;   // gate, not a peer
  checkStatus(t.checks, reel);
  checkSentenceSync(t.checks, reel);
  checkBeats(t.checks, reel);
  checkNarration(t.checks, reel);
  checkStyle(t.checks, reel);
  checkArc(t.checks, reel);
  checkRoles(t.checks, reel);
  checkCamera(t.checks, reel);
  checkDataRefs(t.checks, reel);
  checkPictogram(t.checks, reel);
  checkGeometry(t.checks, reel);
  checkFacts(t.checks, reel);
  checkClaims(t.checks, reel);
  checkVoiceAssets(t.checks, reel);
  checkAudio(t.checks, reel, id);
  // A rules file may add its own checks (market-review: scripts/review/checks.mjs). Each module's
  // default export returns [{id, level: pass|warn|fail|skip, message, fix?}].
  for (const mod of R.extraChecks ?? []) {
    let out;
    try {
      out = await (await import(pathToFileURL(resolve(ROOT, mod)).href)).default(reel, {root: ROOT, rules: R, id});
    } catch (e) {
      die(`extra check ${mod} broke on ${id} — ${e.message}`);
    }
    for (const c of out ?? []) add(t.checks, c.id, SEV[c.level] ?? SEV.warn, c.message, c.fix);
  }
}
R = BASE;
LEXICON = lexiconOf(R);
checkRegistration(report);
checkVoiceStems(report, loaded);
checkSeries(report);

const all = [...report.reels.flatMap((r) => r.checks), ...report.repoChecks];
const errors = all.filter((c) => c.severity === SEV.fail).length;
const warnings = all.filter((c) => c.severity === SEV.warn).length;
const skips = all.filter((c) => c.severity === SEV.skip).length;
const effErrors = STRICT ? errors + warnings + skips : errors;

if (JSON_OUT) {
  console.log(JSON.stringify({errors, warnings, skips, reels: report.reels, repoChecks: report.repoChecks}, null, 2));
  process.exit(effErrors ? 1 : 0);
}

const wrapFix = (s, width = 74) => s.split('; ').flatMap((part) => {
  const out = [];
  let line = '';
  for (const w of part.split(' ')) {
    if ((line + ' ' + w).trim().length > width) { out.push(line.trim()); line = w; }
    else line += ' ' + w;
  }
  if (line.trim()) out.push(line.trim());
  return out;
});

console.log(`\nverify · ${ids.length} reel${ids.length === 1 ? '' : 's'} · ${SERIES ? SERIES.length + ' candles' : 'no series'}\n`);
for (const r of report.reels) {
  console.log(`── ${r.reel} ${'─'.repeat(Math.max(0, 68 - r.reel.length))}`);
  for (const c of r.checks) {
    console.log(`${c.severity} ${c.id.padEnd(15)} ${c.message}`);
    if (c.fix) for (const line of wrapFix(c.fix)) console.log(`                     → ${line}`);
  }
  console.log('');
}
if (report.repoChecks.length) {
  console.log(`── repo ${'─'.repeat(63)}`);
  for (const c of report.repoChecks) {
    console.log(`${c.severity} ${c.id.padEnd(15)} ${c.message}`);
    if (c.fix) for (const line of wrapFix(c.fix)) console.log(`                     → ${line}`);
  }
  console.log('');
}
console.log(`${ids.length} reels · ${errors} errors · ${warnings} warnings · ${skips} skips${STRICT ? '  [--strict: warnings and skips are errors]' : ''}`);
console.log(`exit ${effErrors ? 1 : 0}\n`);
process.exit(effErrors ? 1 : 0);
