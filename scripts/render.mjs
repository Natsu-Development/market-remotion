#!/usr/bin/env node
/**
 * One-command build: make sure the data and the voice exist, then render.
 *
 *   npm run build                      full reel -> out/reel.mp4
 *   npm run build -- --force           render even if status is not "reviewed"
 *   npm run build -- --id=RSI          a different composition + its content file
 *   npm run build -- --retime          refit scene lengths to the narration first
 *   npm run build -- --no-voice        skip TTS (silent render)
 *   npm run build -- --revoice         re-synthesize every scene first (narration changed);
 *                                      --revoice=channel-hook,channel-outro for only those scenes.
 *                                      --force alone does NOT re-voice: it only skips the review gate.
 *   npm run build -- --out=out/x.mp4
 *   npm run build -- --frames=0-300    render a slice while iterating
 */
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
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
if (existsSync(contentPath) && !flag('force')) {
  const status = JSON.parse(readFileSync(contentPath, 'utf8')).status;
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
}

const out = opt('out', `out/${id.toLowerCase()}.mp4`);
const frames = opt('frames', null);
step(
  `rendering ${id} -> ${out}`,
  'npx',
  ['remotion', 'render', id, out, ...(frames ? [`--frames=${frames}`] : [])],
);

console.log(`\n✓ ${out}`);
