/**
 * Was every sentence a reel's voice tracks are built from LISTENED to, and heard whole?
 *
 * The user, 2026-10-06, on the 6/10 daily: "The pronounce of the number on this video is not clear … ensure it not
 * happened again." The takes in that video said "một nghìn bảy trăm năm chín" for 1759 and skipped FPT's 0,58, and
 * one sentence had been voiced after scripts/tts_takes.py last ran, so nobody listened to it. Listening was a manual
 * step with nothing behind it. This module is the something: scripts/verify.mjs reports it as `voice-heard`, and
 * scripts/render.mjs refuses to render while it fails.
 *
 * It reads two files tts_takes.py and voiceover.mjs keep in .tts-cache/:
 *   manifests/<reel>.json  which sentence take (cache file) each scene's track is assembled from (voiceover.mjs)
 *   _heard.json            a verdict per take, keyed by its audio bytes (tts_takes.py)
 * and fails a scene when its narration changed since the manifest was written, when a take was never listened to
 * (or under another LISTEN_VERSION), when a take that carries a figure / ticker / term is not CLEAR, or when a take
 * is newer than the scene's track (picked, but the track was not reassembled from it).
 */
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {basename, resolve} from 'node:path';

/** Keep equal to LISTEN_VERSION in scripts/tts_takes.py. */
export const LISTEN_VERSION = 5;

export const ledgerPath = (root) => resolve(root, '.tts-cache/_heard.json');
export const manifestPath = (root, contentRel) =>
  resolve(root, '.tts-cache/manifests', `${basename(contentRel, '.json')}.json`);

/** The Python that has torch + omnivoice + mlx_whisper: --python / TTS_PYTHON, else the sibling video-factory venv. */
export const ttsPython = (root, explicit = process.env.TTS_PYTHON) => {
  if (explicit) return resolve(explicit);
  const sibling = resolve(root, '../video-factory/.venv/bin/python');
  return existsSync(sibling) ? sibling : 'python3';
};

const digest = (file) => createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 16);
const short = (s, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * {level: 'pass'|'warn'|'fail'|'skip', message, problems: string[], fix}. `skip` while no scene has a track yet —
 * the check costs nothing before the voice exists, like verify's `audio`.
 */
export function heardCheck(root, reel, contentRel) {
  const voiced = (reel.scenes ?? []).filter((s) => s.narration && s.audio && existsSync(resolve(root, 'public', s.audio)));
  if (!voiced.length) return {level: 'skip', message: 'no voice tracks yet', problems: []};
  const listen = `../video-factory/.venv/bin/python scripts/tts_takes.py --content=${contentRel} --rebuild`;
  const mp = manifestPath(root, contentRel);
  if (!existsSync(mp)) {
    return {
      level: 'fail',
      message: 'no record of which sentence takes the tracks are built from',
      problems: [`${mp.replace(root + '/', '')} is missing`],
      fix: `node scripts/voiceover.mjs --content=${contentRel} (writes it, synthesizes nothing cached), then ${listen}`,
    };
  }
  const man = JSON.parse(readFileSync(mp, 'utf8'));
  let clips = {};
  try {
    clips = JSON.parse(readFileSync(ledgerPath(root), 'utf8')).clips ?? {};
  } catch { /* no ledger yet: every take counts as never listened to */ }

  const fail = [], warn = [];
  let sentences = 0, clear = 0;
  for (const s of voiced) {
    const m = (man.scenes ?? []).find((x) => x.id === s.id);
    if (!m || m.narration !== s.narration) {
      fail.push(`${s.id}: narration changed since its voice was built — node scripts/voiceover.mjs --content=${contentRel} --force --only=${s.id} --retime`);
      continue;
    }
    const trackTime = statSync(resolve(root, 'public', s.audio)).mtimeMs;
    let stale = false;
    for (const [k, sent] of (m.sentences ?? []).entries()) {
      sentences++;
      const tag = `${s.id}#${k + 1}`;
      if (!existsSync(sent.file)) { fail.push(`${tag}: its take ${basename(sent.file)} is gone`); continue; }
      if (statSync(sent.file).mtimeMs > trackTime + 1000) stale = true;
      const e = clips[digest(sent.file)];
      if (!e || e.v !== LISTEN_VERSION || e.text !== sent.text) {
        fail.push(`${tag}: never listened to («${short(sent.text)}»)`);
        continue;
      }
      if (e.clear) { clear++; continue; }
      const why = [
        e.missing?.length ? `not heard: ${e.missing.join(', ')}` : '',
        e.joined === false ? 'a gap inside a spelled ticker' : '',
        e.cov_ok === false ? `dropped: ${(e.misses ?? []).join(' ')}` : '',
      ].filter(Boolean).join('; ') || 'not clear';
      (e.required?.length ? fail : warn).push(`${tag}: ${why} — heard «${short(e.heard ?? '', 90)}»`);
    }
    if (stale) fail.push(`${s.id}: a take was picked after the track was built — node scripts/voiceover.mjs --content=${contentRel} --reassemble --only=${s.id} --retime`);
  }
  if (fail.length) {
    return {level: 'fail', message: `${fail.length} voice problem(s) — ${clear}/${sentences} sentence takes heard clear`, problems: [...fail, ...warn], fix: listen};
  }
  if (warn.length) {
    return {level: 'warn', message: `${warn.length} sentence(s) without a figure or term not heard whole`, problems: warn, fix: listen};
  }
  return {level: 'pass', message: `${sentences} sentence takes listened to, every figure, ticker and term heard`, problems: []};
}
