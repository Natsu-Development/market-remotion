#!/usr/bin/env node
/**
 * One-command build: make sure the data and the voice exist, then render.
 *
 *   npm run build                      Channel -> out/channel.mp4
 *   npm run build -- --force           render even if status is not "reviewed"
 *   npm run build -- --id=<Id>         another registered composition + its content file
 *   npm run build -- --retime          refit scene lengths to the narration first
 *   npm run build -- --no-voice        skip TTS (silent render)
 *   npm run build -- --revoice         re-synthesize every scene first (narration changed);
 *                                      --revoice=channel-hook,channel-outro for only those scenes.
 *                                      --force alone does NOT re-voice: it only skips the review gate.
 *   npm run build -- --out=out/x.mp4
 *   npm run build -- --frames=0-300    render a slice while iterating
 *   npm run build -- --unheard         skip the listening gate (scripts/tts_takes.py + voice-heard) — throwaway only
 *
 * After the voice, every sentence take is listened to (scripts/tts_takes.py --rebuild) and the render refuses a reel
 * whose tracks hold a take in which a figure, ticker or term was not heard (scripts/lib/heard.mjs; user 2026-10-06).
 *
 * A dated market-review edition (DailyReview of 2026-10-06) renders to out/review/daily-2026-10-06.mp4 by default, and
 * an --out naming another edition is refused before anything runs (scripts/lib/outputs.mjs; user 2026-10-06: "With
 * each review daily, create another daily file .mp4 and its artifact respective for me").
 */
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {heardCheck, ttsPython} from './lib/heard.mjs';
import {videoOut} from './lib/outputs.mjs';
import {reels} from './lib/reels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const step = (label, cmd, args) => {
  console.log(`\n▸ ${label}`);
  const r = spawnSync(cmd, args, {cwd: ROOT, stdio: 'inherit'});
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!existsSync(resolve(ROOT, 'content/vnindex-monthly.json'))) {
  step('building the price series', 'node', ['scripts/make-series.mjs']);
}

// Derived from src/Root.tsx — a reel is declared in exactly one place.
const CONTENT = Object.fromEntries(reels(ROOT));
const id = opt('id', 'Channel');
if (!CONTENT[id]) {
  console.error(`Unknown --id=${id}. Known: ${Object.keys(CONTENT).join(', ')}`);
  process.exit(1);
}

// The review gate. A reel is scaffolded, then enriched, then a human reads it.
// Voiceover and render are the expensive half; neither opens before that.
const contentPath = resolve(ROOT, CONTENT[id]);
const reel = existsSync(contentPath) ? JSON.parse(readFileSync(contentPath, 'utf8')) : null;

// Where the video goes, settled before the gate and the voice: a dated edition never lands on another one's file.
const frames = opt('frames', null);
const {out, error: outError} = videoOut({id, reel, out: opt('out', null), frames});
if (outError) {
  console.error(outError);
  process.exit(2);
}

if (reel && !flag('force')) {
  const status = reel.status;
  if (status && status !== 'reviewed') {
    console.error(
      `\n${CONTENT[id]} is "${status}", not "reviewed".\n` +
        '  Read it, then: npm run approve -- ' + id + '\n' +
        '  Or override for a throwaway render: npm run build -- --id=' + id + ' --force\n',
    );
    process.exit(1);
  }
}

if (!flag('no-voice')) {
  const revoice = flag('revoice') || argv.some((a) => a.startsWith('--revoice='));
  step('voiceover', 'node', [
    'scripts/voiceover.mjs',
    `--content=${CONTENT[id]}`,
    ...(flag('retime') ? ['--retime'] : []),
    ...(revoice ? ['--force'] : []),
    ...(revoice && opt('revoice', '') ? [`--only=${opt('revoice', '')}`] : []),
  ]);

  // The listening gate (user 2026-10-06: "The pronounce of the number on this video is not clear … ensure it not
  // happened again"): every sentence take is listened to with digits suppressed and a take in which every figure,
  // ticker and term is heard is kept (scripts/tts_takes.py — takes already judged are not listened to again), the
  // scenes whose take changed are reassembled, and the render refuses a track holding a take nobody heard whole.
  // --unheard skips both, for a throwaway render.
  if (!flag('unheard')) {
    step('listening to every sentence (scripts/tts_takes.py)', ttsPython(ROOT, opt('python', process.env.TTS_PYTHON)),
      ['scripts/tts_takes.py', `--content=${CONTENT[id]}`, '--rebuild']);
    const voiced = JSON.parse(readFileSync(contentPath, 'utf8'));
    const heard = heardCheck(ROOT, voiced, CONTENT[id]);
    if (heard.level === 'fail') {
      console.error(`\nvoice-heard: ${heard.message}\n  ${heard.problems.join('\n  ')}\n  fix: ${heard.fix}\n` +
        `  (a throwaway render: npm run build -- --id=${id} --unheard)\n`);
      process.exit(1);
    }
    console.log(`\nvoice-heard: ${heard.message}`);
  }
}

step(
  `rendering ${id} -> ${out}`,
  'npx',
  ['remotion', 'render', id, out, ...(frames ? [`--frames=${frames}`] : [])],
);

console.log(`\n✓ ${out}`);
