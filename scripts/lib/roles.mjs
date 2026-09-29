/**
 * Scene roles, read from `arc.roles` in src/shared/content-rules.json.
 *
 * That object is the one definition of a role: its job, default act, pace and
 * default camera. Before 2026-09-29 the act map lived in enrich.mjs, the pace in
 * content-rules.style, the jobs in reference.md, and verify, review and
 * review-page each guessed a scene's role from its id — four places that had
 * already drifted apart. Every script now asks here.
 */

/** Role names in story order. */
export const roleNames = (R) => Object.keys(R.arc?.roles ?? {});

/** The role's entry in content-rules, or null for a name that is not a role. */
export const roleSpec = (R, role) => (role && R.arc?.roles && Object.hasOwn(R.arc.roles, role) ? R.arc.roles[role] : null);

/**
 * A scene's role: the `role` field enrich writes. A scene scaffolded before that
 * field existed carries it in its id (`<reel>-<role>[-n]`), so fall back to the
 * last part of the id that names a role. An unknown `role` comes back as is —
 * verify reports it rather than guessing.
 */
export const roleOf = (R, scene) => {
  if (scene.role) return scene.role;
  const parts = String(scene.id ?? '').split('-').filter((p) => !/^\d+$/.test(p));
  return [...parts].reverse().find((p) => Object.hasOwn(R.arc?.roles ?? {}, p)) ?? '';
};

/**
 * Words enrich aims a scene at: the middle of narration.warnWordsPerScene for a
 * `mid` role, halfway to the low edge for `short`, halfway to the high edge for `long`.
 */
export const targetWords = (R, role) => {
  const [lo, hi] = R.narration.warnWordsPerScene;
  const mid = Math.round((lo + hi) / 2);
  const pace = roleSpec(R, role)?.pace ?? 'mid';
  return pace === 'short' ? Math.round((lo + mid) / 2)
    : pace === 'long' ? Math.round((mid + hi) / 2)
    : mid;
};
