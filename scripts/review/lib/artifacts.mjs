/**
 * One artifact per DAILY edition (user 2026-10-06: "With each review daily, create another daily file .mp4 and its
 * artifact respective for me"). Until 5/10 every daily edition was republished over ONE artifact, so the page of the
 * previous session was gone the moment the next one went up. content/review/artifacts.json maps each edition to its
 * own artifact, its review-page folder and its video:
 *
 *   {"_note": "…", "daily": {"2026-10-06": {"url": "https://claude.ai/artifact/<id>", "page": "out/review/daily-2026-10-06",
 *                                           "video": "out/review/daily-2026-10-06.mp4", "updatedAt": "<iso>"}}}
 *
 * The Artifact tool's result is the only place a new URL appears, so the director records it right after the FIRST
 * publish of an edition (scripts/review/artifacts.mjs set daily <edition> --url=…). A URL never moves to another
 * edition: recordArtifact refuses one that is already registered to a different edition, which is exactly the
 * republish over yesterday's page the user asked to stop. The weekly keeps its one link (weekly-review SKILL.md).
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const ARTIFACTS_PATH = 'content/review/artifacts.json';
/** Formats that get one artifact per edition. The weekly keeps a single link. */
export const PER_EDITION = ['daily'];
const EDITION = /^\d{4}-\d{2}-\d{2}$/;

/** The edition's page folder and video, where review-page.mjs and render.mjs put them by default. */
export const pageOf = (format, edition) => `out/review/${format}-${edition}`;
export const videoOf = (format, edition) => `out/review/${format}-${edition}.mp4`;

/** "5/10" — how the page names an edition. */
export const dmOf = (edition) => `${Number(edition.slice(8, 10))}/${Number(edition.slice(5, 7))}`;

/**
 * An artifact link in its https form, or null: claude.ai/artifact/<id> or claude.ai/code/artifact/<uuid>, with or
 * without the scheme; a query, hash or trailing slash is dropped.
 */
export const normalizeUrl = (u) => {
  const m = String(u ?? '').trim().match(/^(?:https?:\/\/)?claude\.ai\/(artifact\/[A-Za-z0-9_-]{8,}|code\/artifact\/[0-9a-fA-F-]{36})\/?(?:[?#].*)?$/);
  return m ? `https://claude.ai/${m[1]}` : null;
};

export const readArtifacts = (root = ROOT) => {
  const p = resolve(root, ARTIFACTS_PATH);
  if (!existsSync(p)) return {daily: {}};
  const j = JSON.parse(readFileSync(p, 'utf8'));
  for (const f of PER_EDITION) j[f] ??= {};
  return j;
};

/** The edition's entry ({url, page, video, updatedAt, note?}), or null. */
export const artifactOf = (format, edition, root = ROOT) => readArtifacts(root)[format]?.[edition] ?? null;

/** The latest registered edition before `edition` with a URL, as {edition, url, …}, or null. */
export const previousArtifact = (format, edition, root = ROOT) => {
  const all = readArtifacts(root)[format] ?? {};
  const before = Object.keys(all).filter((e) => EDITION.test(e) && e < edition && all[e]?.url).sort();
  const e = before[before.length - 1];
  return e ? {edition: e, ...all[e]} : null;
};

/** The edition that already owns this URL (other than `except`), or null. */
export const ownerOf = (format, url, except, root = ROOT) => {
  const all = readArtifacts(root)[format] ?? {};
  return Object.keys(all).find((e) => e !== except && normalizeUrl(all[e]?.url) === url) ?? null;
};

/**
 * Records (or updates) an edition. Throws with the reason when: the format keeps one link, the edition is not a date,
 * the URL is malformed, a NEW edition comes without a URL, the URL belongs to another edition, or the edition already
 * has a different URL (a second artifact for the same edition) — the last two unless `force`.
 */
export const recordArtifact = (format, edition, {url, page, video, note} = {}, {force = false, root = ROOT} = {}) => {
  if (!PER_EDITION.includes(format)) throw new Error(`"${format}" keeps one artifact (weekly-review SKILL.md) — only ${PER_EDITION.join(', ')} editions are registered`);
  if (!EDITION.test(edition ?? '')) throw new Error(`edition "${edition}" is not a YYYY-MM-DD session date`);
  const all = readArtifacts(root);
  const had = all[format][edition] ?? null;
  let link = had?.url ?? null;
  if (url !== undefined) {
    link = normalizeUrl(url);
    if (!link) throw new Error(`"${url}" is not an artifact link (https://claude.ai/artifact/<id> or https://claude.ai/code/artifact/<uuid>)`);
    const owner = ownerOf(format, link, edition, root);
    if (owner && !force) throw new Error(`${link} already belongs to the ${owner} edition — publishing ${edition} there would overwrite that page (user 2026-10-06: one artifact per daily edition). Publish ${edition} as a NEW artifact (no url) and record that link; --force only if the registry itself is wrong.`);
    if (had?.url && normalizeUrl(had.url) !== link && !force) throw new Error(`${edition} already has ${had.url} — republish that one (Artifact publish with url=${had.url}); --force to replace the record with ${link}`);
  }
  if (!link) throw new Error(`${edition} is not registered yet — the first record needs --url=<the link the Artifact tool returned>`);
  const entry = {
    ...(had ?? {}),
    url: link,
    page: page ?? had?.page ?? pageOf(format, edition),
    video: video ?? had?.video ?? videoOf(format, edition),
    updatedAt: new Date().toISOString(),
    ...(note !== undefined ? {note} : {}),
  };
  all[format][edition] = entry;
  // Editions in date order, so the file reads as a log.
  all[format] = Object.fromEntries(Object.entries(all[format]).sort(([a], [b]) => a.localeCompare(b)));
  const p = resolve(root, ARTIFACTS_PATH);
  mkdirSync(dirname(p), {recursive: true});
  writeFileSync(p, JSON.stringify(all, null, 2) + '\n');
  return entry;
};
