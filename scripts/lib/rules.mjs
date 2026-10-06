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
const ENGINE_VOICE_KEYS = ['engine', 'model', 'dtype', '_dtypeWhy', 'refAudio', 'refTextOverlapWords', '_refWhy', 'pace', '_pace'];

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

/** A ticker as the narration writes it: three capitals standing alone (HOSE/UPCOM/MACD are longer). */
export const TICKER_RE = /(?<![\p{L}\p{N}])[A-Z]{3}(?![\p{L}\p{N}])/u;

/** What goes between the letter names of a spelled ticker: `voice.letterJoin`, else the old comma form. */
export const letterJoinOf = (R) => (typeof R?.voice?.letterJoin === 'string' ? R.voice.letterJoin : ', ');

/**
 * How the voice SAYS a ticker. `voice.letters` names each letter ("B": "bê") and the speller joins the
 * names with `voice.letterJoin`. market-review sets a single space (user 2026-10-01: "Pronounce of symbol
 * must be solid and clearly not separate" — the comma form "em, ét, rờ" made the voice stop on every
 * letter; the same move the user made for MACD, "em ây xê đê"). A rules file with a table but no joiner
 * keeps the comma form. It runs AFTER the lexicon, so FTD and MACD keep their own entries, and only for
 * a rules file that carries a table: Channel's content-rules.json has none, so its reels are read exactly
 * as before. User 2026-10-01: market-review's filter scenes and countdown say the ticker, never the
 * company name.
 */
export const spellerOf = (R) => {
  const table = Object.fromEntries(Object.entries(R?.voice?.letters ?? {}).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string'));
  if (!Object.keys(table).length) return null;
  const join = letterJoinOf(R);
  const re = new RegExp(TICKER_RE.source, 'gu');
  return (text) => String(text ?? '').replace(re, (tk, at) => {
    const said = [...tk].map((c) => table[c] ?? c.toLowerCase()).join(join);
    return at === 0 ? said.charAt(0).toUpperCase() + said.slice(1) : said;
  });
};
