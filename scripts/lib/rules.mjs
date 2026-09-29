/**
 * Which rules file grades a reel.
 *
 * market-video's reels are graded by src/shared/content-rules.json. A reel can name its
 * own contract with a top-level `rules` field — market-review's reels point at
 * .claude/skills/market-review/rules.json. That file brings its own content policy
 * (roles, budgets, voice heuristics, lexicon, claims) and inherits only the ENGINE
 * constants below from the default file. The renderer (src/theme.ts, src/lib/series.ts)
 * and scripts/voiceover.mjs hard-code the same frame, audio timing, monthly series and
 * voice clip, so a second copy of them could only drift.
 *
 * A reel without `rules` gets the default file object itself, unchanged: Channel is
 * graded exactly as before this module existed.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export const DEFAULT_RULES = 'src/shared/content-rules.json';

/** Top-level blocks that describe the engine, not the content. */
const ENGINE_KEYS = ['layout', 'audio', 'series'];
/** voice.* fields that belong to the TTS engine; `lexicon` stays with the reel's own rules. */
const ENGINE_VOICE_KEYS = ['engine', 'model', 'dtype', '_dtypeWhy', 'refAudio', 'refTextOverlapWords', '_refWhy'];

const cache = new Map();
const read = (root, rel) => {
  const abs = resolve(root, rel);
  if (!cache.has(abs)) cache.set(abs, JSON.parse(readFileSync(abs, 'utf8')));
  return cache.get(abs);
};

/** The rules path for a reel: an explicit override, the reel's own `rules` field, or the default. */
export const rulesPath = ({reel, path} = {}) => path ?? reel?.rules ?? DEFAULT_RULES;

/** The rules object that grades `reel` (or the file at `path`), engine constants included. */
export const loadRules = (root, {reel, path} = {}) => {
  const rel = rulesPath({reel, path});
  const base = read(root, DEFAULT_RULES);
  if (resolve(root, rel) === resolve(root, DEFAULT_RULES)) return base;
  const own = read(root, rel);
  const merged = {...own};
  for (const k of ENGINE_KEYS) if (base[k] !== undefined) merged[k] = base[k];
  const voice = {...(own.voice ?? {})};
  for (const k of ENGINE_VOICE_KEYS) if (base.voice?.[k] !== undefined) voice[k] = base.voice[k];
  merged.voice = voice;
  return merged;
};

/** `voice.lexicon` as [written, spoken] pairs, the shape voiceover.mjs and verify.mjs apply. */
export const lexiconOf = (R) => Object.entries(R?.voice?.lexicon ?? {})
  .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string');
