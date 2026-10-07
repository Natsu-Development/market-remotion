#!/usr/bin/env node
/**
 * The registry of daily editions' artifacts (content/review/artifacts.json; scripts/review/lib/artifacts.mjs). One
 * artifact per daily edition (user 2026-10-06: "With each review daily, create another daily file .mp4 and its artifact
 * respective for me"): the first publish of an edition's review page makes a NEW artifact, recorded here at once —
 * the Artifact tool's result is the only place the link appears; re-review rounds of the same edition republish it.
 *
 *   node scripts/review/artifacts.mjs set daily 2026-10-06 --url=https://claude.ai/artifact/<id> [--video=…] [--page=…] [--note=…] [--force]
 *   node scripts/review/artifacts.mjs get daily 2026-10-06     the edition's link (exit 1 when it has none); --json for the entry
 *   node scripts/review/artifacts.mjs prev daily 2026-10-06    the latest registered edition before it: "<edition> <link>"
 *   node scripts/review/artifacts.mjs list
 *
 * `set` refuses a link already registered to ANOTHER edition, and a second link for the same edition (--force
 * overrides both). page/video default to out/review/daily-<edition>[.mp4], where review-page.mjs and render.mjs put them.
 */
import {ARTIFACTS_PATH, artifactOf, previousArtifact, readArtifacts, recordArtifact} from './lib/artifacts.mjs';

const argv = process.argv.slice(2);
const opt = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};
const flag = (n) => argv.includes(`--${n}`);
const [cmd, format, edition] = argv.filter((a) => !a.startsWith('--'));
const usage = () => {
  console.error('Usage: node scripts/review/artifacts.mjs set|get|prev <format> <YYYY-MM-DD> [--url=…] [--video=…] [--page=…] [--note=…] [--force] [--json]  ·  list');
  process.exit(2);
};

switch (cmd) {
  case 'list': {
    const all = readArtifacts();
    let n = 0;
    for (const [f, eds] of Object.entries(all)) {
      if (f.startsWith('_') || !eds || typeof eds !== 'object') continue;
      for (const [e, x] of Object.entries(eds)) {
        n++;
        console.log(`${f.padEnd(6)} ${e}  ${x.url}  ${x.video ?? '—'}${x.note ? '  · ' + x.note.slice(0, 60) + (x.note.length > 60 ? '…' : '') : ''}`);
      }
    }
    if (!n) console.log(`(no edition in ${ARTIFACTS_PATH})`);
    break;
  }
  case 'get': {
    if (!format || !edition) usage();
    const x = artifactOf(format, edition);
    if (!x) {
      console.error(`${format} ${edition}: no artifact recorded in ${ARTIFACTS_PATH} — its first publish is a NEW artifact (no url), then: node scripts/review/artifacts.mjs set ${format} ${edition} --url=<link>`);
      process.exit(1);
    }
    console.log(flag('json') ? JSON.stringify({edition, ...x}, null, 2) : x.url);
    break;
  }
  case 'prev': {
    if (!format || !edition) usage();
    const x = previousArtifact(format, edition);
    if (!x) {
      console.error(`${format}: no edition before ${edition} in ${ARTIFACTS_PATH}`);
      process.exit(1);
    }
    console.log(flag('json') ? JSON.stringify(x, null, 2) : `${x.edition} ${x.url}`);
    break;
  }
  case 'set': {
    if (!format || !edition) usage();
    try {
      const x = recordArtifact(format, edition, {url: opt('url'), page: opt('page'), video: opt('video'), note: opt('note')}, {force: flag('force')});
      console.log(`${format} ${edition} → ${x.url}  (page ${x.page}, video ${x.video})`);
    } catch (e) {
      console.error(e.message);
      process.exit(2);
    }
    break;
  }
  default:
    usage();
}
