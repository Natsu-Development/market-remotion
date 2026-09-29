#!/usr/bin/env node
/**
 * Turns the `narration` field of each scene into an audio file, and (with
 * --retime) refits the reel's timing to the voice that was actually produced.
 *
 *   node scripts/voiceover.mjs                 synthesize what's missing
 *   node scripts/voiceover.mjs --retime        ...and refit durations + beats
 *   node scripts/voiceover.mjs --force         re-synthesize everything
 *   node scripts/voiceover.mjs --force --only=channel-evidence-4
 *                                              ...but only that scene (comma-separated ids);
 *                                              the others keep their track and are re-pinned
 *   node scripts/voiceover.mjs --engine=say    macOS `say` instead of OmniVoice
 *   node scripts/voiceover.mjs --speed=1.05 --pause=0.3
 *   node scripts/voiceover.mjs --content=content/other.json
 *
 * Two engines:
 *
 *   omnivoice (default) — k2-fsa/OmniVoice running locally on the GPU, cloning
 *     the voice in assets/voices/. Ported from video-factory/steps/s4_tts.py;
 *     see scripts/tts_omnivoice.py for the two non-obvious constraints (fp32
 *     only, and ref_text must not overlap the text being spoken).
 *   say — macOS speech synthesis. No model, no GPU, obviously robotic. Kept as
 *     the fallback for machines without the Python side set up.
 *
 * A final track that already exists is never overwritten without --force, so
 * dropping a real recording at public/voiceover/03-momentum.wav wins over both.
 *
 * Pronunciation: `voice.lexicon` in src/shared/content-rules.json respells a written term for
 * the TTS only ("MACD" → how a Vietnamese trader says it). Narration, headlines and the review
 * page keep the written form; the spoken form is in the cache key, so editing the lexicon
 * re-synthesizes exactly the sentences that contain the term (still needs --force for scenes
 * whose final track exists).
 */
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/voiceover');
/** Per-sentence cache, keyed by content. Not under public/ — it isn't served. */
const CACHE_DIR = resolve(ROOT, '.tts-cache');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const CONTENT = resolve(ROOT, opt('content', 'content/channel.json'));
const ENGINE = opt('engine', 'omnivoice');
const RETIME = flag('retime');
const FORCE = flag('force');
/** With --force, restrict the re-synthesis to these scene ids (others keep their track). */
const ONLY = opt('only') ? new Set(opt('only').split(',').map((s) => s.trim()).filter(Boolean)) : null;

/** Voice clone reference. 3-10s, one speaker, no music. */
const REF_AUDIO = resolve(ROOT, opt('ref', 'assets/voices/ref_ThanhBinh_khac_24k.wav'));
const REF_TEXT_FILE = REF_AUDIO.replace(/_24k\.wav$|\.wav$/, '.txt');
const MODEL = opt('model', 'k2-fsa/OmniVoice');
const DEVICE = opt('device', 'mps');
/** OmniVoice has no speed parameter; this drives ffmpeg atempo. Past 1.15 it sounds synthetic. */
const SPEED = Number(opt('speed', '1.0'));
/**
 * Written term → spoken form, whole-word, applied per sentence right before synthesis. A term at
 * the start of a sentence gets its spoken form capitalised, like any first word.
 */
const LEXICON = (() => {
  try {
    const lex = JSON.parse(readFileSync(resolve(ROOT, 'src/shared/content-rules.json'), 'utf8')).voice?.lexicon ?? {};
    return Object.entries(lex).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string');
  } catch {
    return [];
  }
})();
const escapeRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sayAs = (text) => LEXICON.reduce(
  (t, [word, say]) => t.replace(
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])`, 'gu'),
    (_, at) => (at === 0 ? say.charAt(0).toUpperCase() + say.slice(1) : say),
  ),
  text,
);

/** Gap inserted between sentences of the same scene. */
const PAUSE = Number(opt('pause', '0.28'));

/** macOS `say` options, used only when --engine=say. */
const VOICE = opt('voice', 'Linh');
const RATE = Number(opt('rate', '165'));

/** Silence before the first word, so the scene's fade-in lands first. */
const LEAD_IN = 0.25;
/** Silence after the last word, so the next scene doesn't clip the tail. */
const TAIL = 0.9;
/** Anything below this counts as silence when trimming the model's padding. */
const SILENCE_DB = -40;

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {stdio: ['ignore', 'pipe', 'pipe'], ...opts});

const have = (cmd) => {
  try {
    execFileSync('which', [cmd], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
};

const durationOf = (file) =>
  Number(
    run('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ]).toString().trim(),
  );

if (!have('ffmpeg') || !have('ffprobe')) {
  console.error('ffmpeg and ffprobe are required (brew install ffmpeg).');
  process.exit(1);
}

// ---------------------------------------------------------------- engines

/**
 * OmniVoice needs a Python with torch + omnivoice installed. That environment is
 * ~4GB, so rather than duplicate it this defaults to the sibling video-factory
 * venv where it already lives. Override with --python= or TTS_PYTHON.
 */
const resolvePython = () => {
  const explicit = opt('python', process.env.TTS_PYTHON);
  if (explicit) return resolve(explicit);
  const sibling = resolve(ROOT, '../video-factory/.venv/bin/python');
  if (existsSync(sibling)) return sibling;
  return 'python3';
};

const readRefText = () => {
  const inline = opt('ref-text', null);
  if (inline) return inline;
  if (!existsSync(REF_TEXT_FILE)) {
    console.error(
      `Missing ${REF_TEXT_FILE}. It must hold the exact words spoken in ${REF_AUDIO} —\n` +
      'and that sentence must NOT be how any narration line starts, or the model\n' +
      'treats the overlap as already spoken and skips it.',
    );
    process.exit(1);
  }
  return readFileSync(REF_TEXT_FILE, 'utf8').trim();
};

/**
 * Split narration into sentences. OmniVoice is read one sentence at a time:
 * a whole paragraph in a single pass drifts in pace, and each fragment of a
 * sentence read separately gets its own falling final intonation.
 */
const sentences = (text) => {
  const parts = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Fold stragglers ("Vâng.") into the previous sentence rather than reading them alone.
  const merged = [];
  for (const p of parts) {
    if (merged.length && p.split(' ').length < 3) merged[merged.length - 1] += ' ' + p;
    else merged.push(p);
  }
  return merged;
};

const cacheKey = (text) =>
  createHash('sha1')
    .update(`${ENGINE}|${REF_AUDIO}|${REF_TEXT}|${MODEL}|${SPEED}|${text.trim()}`)
    .digest('hex')
    .slice(0, 12);

/** Trim the model's own leading/trailing padding, then add our own. */
const trimChain = `silenceremove=start_periods=1:start_threshold=${SILENCE_DB}dB:start_silence=0.05`;

/**
 * Strip the silence OmniVoice pads each clip with, as its own cached file.
 * Trimming up front rather than inside the concat filter is what makes the
 * sentence start times knowable — the headline sync depends on them.
 */
const trimPart = (src) => {
  const dest = src.replace(/\.wav$/, '.trim.wav');
  if (!existsSync(dest) || FORCE) {
    run('ffmpeg', [
      '-v', 'error', '-y', '-i', src,
      '-af', `${trimChain},areverse,${trimChain},areverse`,
      dest,
    ]);
  }
  return dest;
};

/**
 * Concatenate a scene's sentences into one track — PAUSE between them, then
 * lead-in, tail and a consistent loudness — and report where each sentence
 * begins so the headline beats can be pinned to it.
 */
const assembleScene = (parts, dest) => {
  const trimmed = parts.map(trimPart);
  const inputs = trimmed.flatMap((p) => ['-i', p]);
  const perPart = trimmed
    .map((_, k) => (k < trimmed.length - 1 ? `[${k}:a]apad=pad_dur=${PAUSE}[s${k}]` : `[${k}:a]anull[s${k}]`))
    .join(';');
  const joined = trimmed.map((_, k) => `[s${k}]`).join('');
  const filter =
    `${perPart};${joined}concat=n=${trimmed.length}:v=0:a=1[c];` +
    `[c]adelay=${Math.round(LEAD_IN * 1000)}:all=1,apad=pad_dur=${TAIL},` +
    'loudnorm=I=-18:TP=-1.5:LRA=11[out]';
  run('ffmpeg', [
    '-v', 'error', '-y',
    ...inputs,
    '-filter_complex', filter,
    '-map', '[out]',
    '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le',
    dest,
  ]);

  // Sentence k starts after the lead-in plus every earlier sentence and its pause.
  const starts = [];
  let cursor = LEAD_IN;
  for (const t of trimmed) {
    starts.push(Math.round(cursor * 100) / 100);
    cursor += durationOf(t) + PAUSE;
  }
  return starts;
};

/** macOS `say` — one pass for the whole narration, no sentence splitting needed. */
const sayInto = (text, dest) => {
  const aiff = dest.replace(/\.wav$/, '.aiff');
  run('say', ['-v', VOICE, '-r', String(RATE), '-o', aiff, text]);
  run('ffmpeg', [
    '-v', 'error', '-y',
    '-i', aiff,
    '-af', `adelay=${Math.round(LEAD_IN * 1000)}:all=1,apad=pad_dur=${TAIL},loudnorm=I=-18:TP=-1.5:LRA=11`,
    '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le',
    dest,
  ]);
  rmSync(aiff, {force: true});
};

// ---------------------------------------------------------------- plan

const REF_TEXT = ENGINE === 'omnivoice' ? readRefText() : '';

if (ENGINE === 'say') {
  if (!have('say')) {
    console.error('`say` not found — this engine is macOS-only.');
    process.exit(1);
  }
  const voices = run('say', ['-v', '?']).toString();
  if (!voices.split('\n').some((l) => l.startsWith(`${VOICE} `))) {
    console.error(
      `Voice "${VOICE}" is not installed. Add it in System Settings > Accessibility >\n` +
      'Spoken Content > System Voice > Manage Voices, or pass --voice=<name>.',
    );
    process.exit(1);
  }
} else if (ENGINE !== 'omnivoice') {
  console.error(`Unknown --engine=${ENGINE}. Use "omnivoice" or "say".`);
  process.exit(1);
}

mkdirSync(OUT_DIR, {recursive: true});
mkdirSync(CACHE_DIR, {recursive: true});
const reel = JSON.parse(readFileSync(CONTENT, 'utf8'));
if (ONLY) {
  const known = new Set(reel.scenes.map((s) => s.id));
  const bad = [...ONLY].filter((id) => !known.has(id));
  if (bad.length) {
    console.error(`--only names scene(s) not in ${CONTENT}: ${bad.join(', ')}`);
    process.exit(1);
  }
  if (!FORCE) console.warn('--only has no effect without --force (nothing is re-synthesized)');
}

/** Scenes that need a new final track, with their per-sentence cache targets. */
const plan = [];
for (const [i, scene] of reel.scenes.entries()) {
  const stem = `${String(i + 1).padStart(2, '0')}-${scene.id}`;
  const wav = resolve(OUT_DIR, `${stem}.wav`);
  const rel = `voiceover/${stem}.wav`;
  if (!scene.narration) {
    plan.push({scene, stem, wav, rel, skip: 'no narration'});
    continue;
  }
  const force = FORCE && (!ONLY || ONLY.has(scene.id));
  if (existsSync(wav) && !force) {
    plan.push({scene, stem, wav, rel, skip: 'kept existing file'});
    continue;
  }
  const lines = ENGINE === 'omnivoice' ? sentences(scene.narration) : [scene.narration];
  const parts = lines.map((line) => {
    const text = ENGINE === 'omnivoice' ? sayAs(line) : line;
    return {text, force, file: resolve(CACHE_DIR, `${cacheKey(text)}.wav`)};
  });
  plan.push({scene, stem, wav, rel, lines, parts});
}

// ---------------------------------------------------------------- synthesize

if (ENGINE === 'omnivoice') {
  // Every missing sentence across every scene goes in ONE call: loading the
  // model costs seconds and ~4GB, so the job pays for it once.
  const missing = plan
    .filter((p) => p.parts)
    .flatMap((p) => p.parts)
    .filter((part) => part.force || !existsSync(part.file));
  const unique = [...new Map(missing.map((m) => [m.file, m])).values()];

  if (unique.length) {
    const python = resolvePython();
    const specPath = resolve(CACHE_DIR, '_omnivoice_items.json');
    writeFileSync(
      specPath,
      JSON.stringify(
        {
          model: MODEL,
          device: DEVICE,
          ref_audio: REF_AUDIO,
          ref_text: REF_TEXT,
          speed: SPEED,
          items: unique.map((m) => ({text: m.text, out: m.file})),
        },
        null,
        1,
      ),
    );
    console.log(`synthesizing ${unique.length} sentence(s) with OmniVoice on ${DEVICE}…`);
    const res = execFileSync(python, [resolve(ROOT, 'scripts/tts_omnivoice.py'), specPath], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    for (const line of res.split('\n')) {
      if (line.startsWith('INFO') || line.startsWith('FAIL')) console.log(`  ${line}`);
    }
    const stillMissing = unique.filter((m) => !existsSync(m.file));
    if (stillMissing.length) {
      console.error(`\n${stillMissing.length} sentence(s) failed to synthesize. Aborting.`);
      process.exit(1);
    }
  } else {
    console.log('every sentence already in .tts-cache/');
  }
}

// ---------------------------------------------------------------- assemble

let changed = false;
let total = 0;

for (const item of plan) {
  const {scene, stem, wav, rel} = item;

  if (item.skip === 'no narration') {
    console.log(`· ${stem.padEnd(20)} no narration, leaving ${scene.duration}s as authored`);
    total += scene.duration;
    continue;
  }
  if (item.skip) {
    console.log(`= ${stem.padEnd(20)} ${item.skip}`);
  } else if (ENGINE === 'omnivoice') {
    const starts = assembleScene(item.parts.map((p) => p.file), wav);
    if (JSON.stringify(scene.sentenceStarts) !== JSON.stringify(starts)) {
      scene.sentenceStarts = starts;
      changed = true;
    }
    console.log(`✚ ${stem.padEnd(20)} ${item.lines.length} sentence(s)`);
  } else {
    sayInto(scene.narration, wav);
    console.log(`✚ ${stem.padEnd(20)} synthesized`);
  }

  const spoken = durationOf(wav);
  if (scene.audio !== rel) {
    scene.audio = rel;
    changed = true;
  }

  // Pin every beat that names a sentence to where that sentence actually
  // starts, so the headline turns as the voice reaches it. This is independent
  // of --retime: a beat on the wrong word is wrong at any scene length.
  const starts = scene.sentenceStarts;
  if (starts?.length) {
    const pinned = scene.beats.map((b) => {
      if (b.atSentence == null) return b;
      const at = starts[Math.min(b.atSentence, starts.length - 1)];
      return at == null ? b : {...b, at};
    });
    if (JSON.stringify(pinned) !== JSON.stringify(scene.beats)) {
      const moved = pinned.filter((b, k) => b.at !== scene.beats[k].at).length;
      console.log(`  ${moved} beat(s) pinned to sentence starts [${starts.join(', ')}]`);
      scene.beats = pinned;
      changed = true;
    }
  }

  if (RETIME) {
    const next = Math.max(Math.round(spoken * 100) / 100, 4);
    if (Math.abs(next - scene.duration) > 0.01) {
      // A beat pinned to a sentence already sits at a real timestamp — rescaling
      // it would move it off the word. Only unpinned beats keep their rhythm as
      // a fraction of the scene.
      const scale = next / scene.duration;
      scene.beats = scene.beats.map((b) =>
        b.atSentence != null
          ? {...b, at: Math.min(b.at, next - 0.5)}
          : {...b, at: Math.min(Math.round(b.at * scale * 100) / 100, next - 0.5)},
      );
      console.log(`  ${scene.duration}s -> ${next}s`);
      scene.duration = next;
      changed = true;
    }
  } else if (spoken > scene.duration + 0.15) {
    console.warn(
      `  ⚠ narration is ${spoken.toFixed(2)}s but the scene is ${scene.duration}s — it will be cut off. Run with --retime.`,
    );
  }

  total += scene.duration;
}

if (changed) {
  writeFileSync(CONTENT, JSON.stringify(reel, null, 2) + '\n');
  console.log(`\nupdated ${CONTENT.replace(ROOT + '/', '')}`);
}
console.log(`reel length: ${total.toFixed(2)}s (${Math.round(total * 30)} frames @ 30fps)`);
