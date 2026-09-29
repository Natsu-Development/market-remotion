#!/usr/bin/env node
/**
 * Folds per-scene worker output into a scaffolded reel.
 *
 *   node scripts/merge.mjs content/channel.json --from=<dir>
 *
 * <dir> holds one <scene id>.json per scene, in the shape the worker briefing
 * asks for: eyebrow, narration, beats, visual, citedFacts, unsupported.
 *
 * The script replaces those content fields, drops the scaffold's `_brief` and
 * `_role`, lifts every non-empty `unsupported` to reel level as {id, why} (the
 * reviewer reads them all in one place), and sets status: enriched. It refuses
 * when a scene's file is missing or when a worker changed `id` or
 * `visual.type` — those belong to the director, not the writer.
 *
 * Exit codes follow verify: 0 merged, 1 worker output rejected, 2 bad invocation.
 */
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};
const contentPath = argv.find((a) => !a.startsWith('--'));
const from = opt('from');

if (!contentPath || !from) {
  console.error('Usage: node scripts/merge.mjs content/<name>.json --from=<dir of <scene id>.json>');
  process.exit(2);
}
const CONTENT = resolve(ROOT, contentPath);
const FROM = resolve(ROOT, from);
if (!existsSync(CONTENT)) { console.error(`No content file at ${contentPath}`); process.exit(2); }
if (!existsSync(FROM)) { console.error(`No worker directory at ${from}`); process.exit(2); }

const reel = JSON.parse(readFileSync(CONTENT, 'utf8'));
const errors = [];
const unsupported = [];
const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

const scenes = reel.scenes.map((scene) => {
  const file = resolve(FROM, `${scene.id}.json`);
  if (!existsSync(file)) { errors.push(`${scene.id}: no ${scene.id}.json in ${from}`); return scene; }
  let w;
  try {
    w = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${scene.id}: ${scene.id}.json is not valid JSON — ${e.message}`);
    return scene;
  }
  if (w.id !== undefined && w.id !== scene.id) errors.push(`${scene.id}: worker renamed the scene to "${w.id}"`);
  if (w.visual?.type !== scene.visual.type) {
    errors.push(`${scene.id}: worker changed the panel from ${scene.visual.type} to ${w.visual?.type}`);
  }
  if (typeof w.eyebrow !== 'string') errors.push(`${scene.id}: eyebrow missing (use "" for none)`);
  if (!w.narration || typeof w.narration !== 'string') errors.push(`${scene.id}: narration missing`);
  if (!Array.isArray(w.beats) || !w.beats.length) errors.push(`${scene.id}: beats[] missing or empty`);
  if (JSON.stringify(w).includes('TODO')) errors.push(`${scene.id}: worker left a TODO`);

  const why = Array.isArray(w.unsupported) ? w.unsupported.join(' ') : w.unsupported;
  if (why && String(why).trim()) unsupported.push({id: scene.id, why: String(why).trim()});

  // Timing fields are outputs of voiceover.mjs; they are stale the moment the
  // words change, so a re-merge with new narration drops them.
  const {_brief, _role, _words, audio, sentenceStarts, ...rest} = scene;
  const keepTiming = rest.narration === w.narration;
  // A worker file carries scaffold `at` values (0.25, 3.75, …). When the words
  // did not change, the voice on disk is still right, so pin each beat back to
  // the start of the sentence it names — the same rule voiceover.mjs applies —
  // instead of letting the scaffold numbers overwrite a voiced timing.
  const beats = keepTiming && sentenceStarts?.length
    ? w.beats.map((b) => {
        if (b.atSentence == null) return b;
        const at = sentenceStarts[Math.min(b.atSentence, sentenceStarts.length - 1)];
        return at == null ? b : {...b, at};
      })
    : w.beats;
  return {
    id: scene.id,
    eyebrow: w.eyebrow,
    act: scene.act,
    duration: scene.duration,
    narration: w.narration,
    beats,
    visual: w.visual,
    ...(scene.headline ? {headline: scene.headline} : {}),
    ...(Array.isArray(w.citedFacts) && w.citedFacts.length ? {citedFacts: w.citedFacts} : {}),
    ...(keepTiming && audio ? {audio, sentenceStarts} : {}),
  };
});

if (errors.length) {
  console.error(`merge: ${errors.length} problem(s) — nothing written`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

const out = {...reel, scenes, status: 'enriched'};
if (unsupported.length) out.unsupported = unsupported;
else delete out.unsupported;
writeFileSync(CONTENT, JSON.stringify(out, null, 2) + '\n');

console.log(`${contentPath}: ${scenes.length} scenes merged, status: enriched`);
for (const s of scenes) console.log(`  ${s.id.padEnd(20)} ${String(words(s.narration)).padStart(3)} words  ${s.beats.length} beat(s)  ${s.visual.type}`);
console.log(unsupported.length
  ? `  unsupported: ${unsupported.length} — ${unsupported.map((u) => u.id).join(', ')} (the reviewer must read these)`
  : '  unsupported: none');
console.log(`\nNext: register the reel in src/Root.tsx, then npm run verify -- <Composition>, then npm run review -- <Composition>.`);
