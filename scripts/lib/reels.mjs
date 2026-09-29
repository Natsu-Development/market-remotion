/**
 * The reel registry, parsed from src/Root.tsx.
 *
 * Root.tsx has to hold static imports — Remotion bundles them — so it is the
 * one place a reel is declared. Every script derives the id -> content map from
 * it rather than keeping its own copy. Three copies is how render.mjs and
 * approve.mjs drifted apart from Root.tsx in the first place.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export const reels = (root) => {
  const src = readFileSync(resolve(root, 'src/Root.tsx'), 'utf8');
  const imports = new Map();
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\.\/(content\/[\w.-]+\.json)'/g)) {
    imports.set(m[1], m[2]);
  }
  const out = new Map();
  for (const m of src.matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*content:\s*(\w+)/g)) {
    const path = imports.get(m[2]);
    if (path) out.set(m[1], path);
  }
  return out;
};
