#!/usr/bin/env node
/**
 * Marks a reel reviewed, which is what opens the fan-out to voiceover and render.
 *
 *   npm run approve -- RSI
 *
 * Deliberately a separate command rather than a flag on the build: the point is
 * that a person read the words. It refuses while verify still reports an error,
 * so "reviewed" can never mean "reviewed a draft that does not even pass".
 */
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reels} from './lib/reels.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = Object.fromEntries(reels(ROOT));
const id = process.argv.slice(2).find((a) => !a.startsWith('--'));

if (!id || !CONTENT[id]) {
  console.error(`Usage: npm run approve -- <id>   (${Object.keys(CONTENT).join(' | ')})`);
  process.exit(2);
}

try {
  execFileSync('node', [resolve(ROOT, 'scripts/verify.mjs'), id], {cwd: ROOT, stdio: 'inherit'});
} catch {
  console.error(`\nverify still reports errors for ${id} — fix those before approving.`);
  process.exit(1);
}

const p = resolve(ROOT, CONTENT[id]);
const reel = JSON.parse(readFileSync(p, 'utf8'));
const was = reel.status ?? '(none)';
reel.status = 'reviewed';
writeFileSync(p, JSON.stringify(reel, null, 2) + '\n');
console.log(`\n${id}: ${was} -> reviewed. npm run build -- --id=${id} is now unblocked.`);
