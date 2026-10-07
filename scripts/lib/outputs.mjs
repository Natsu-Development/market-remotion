/**
 * Where scripts/render.mjs writes a reel.
 *
 * A dated edition of a market-review reel (`edition` + `format` in its content, e.g. DailyReview of 2026-10-06) goes to
 * out/review/<format>-<edition>.mp4: one file per edition, which the next edition never overwrites (user 2026-10-06:
 * "With each review daily, create another daily file .mp4 and its artifact respective for me"). Before that the default
 * was out/<id>.mp4 for every reel, and only the --out the skill typed kept the editions apart. Any other reel (Channel)
 * keeps out/<id>.mp4.
 *
 * An explicit --out that names ANOTHER dated edition (out/review/daily-2026-10-05.mp4 while rendering 6/10, or the
 * weekly's file) is refused: it would replace that edition's video. A --frames slice without --out goes to its own
 * file, never over the edition's full render.
 */
const DATED = /(daily|weekly)-(\d{4}-\d{2}-\d{2})/;

/** {out, error}: the output path, and why it is refused (null when it is fine). */
export const videoOut = ({id, reel, out, frames} = {}) => {
  const dated = reel && /^\d{4}-\d{2}-\d{2}$/.test(reel.edition ?? '') && /^[a-z]+$/.test(reel.format ?? '');
  if (!out) {
    if (!dated) return {out: `out/${String(id).toLowerCase()}.mp4`, error: null};
    const base = `out/review/${reel.format}-${reel.edition}`;
    return {out: frames ? `${base}-frames-${String(frames).replace(/[^0-9-]/g, '')}.mp4` : `${base}.mp4`, error: null};
  }
  const m = dated ? String(out).match(DATED) : null;
  if (m && (m[1] !== reel.format || m[2] !== reel.edition)) {
    return {
      out,
      error: `--out=${out} names the ${m[1]} edition of ${m[2]}, but ${id} holds the ${reel.format} edition of ${reel.edition} — ` +
        `that would overwrite another edition's video. Leave --out off (→ out/review/${reel.format}-${reel.edition}.mp4) or name this edition.`,
    };
  }
  return {out, error: null};
};
