// Feature gates for the website. Flip a value here to toggle, or override at
// build time with the matching NEXT_PUBLIC_* env var (1/true/on vs 0/false/off).
function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  return ['1', 'true', 'on', 'yes'].includes(v.toLowerCase());
}

export const FEATURES = {
  // Pre-launch access gate — blocks the whole site behind a sign-in "password
  // block" until the Band Council (BCR) approves public release (band publicity
  // policy). Default OFF; flip on with NEXT_PUBLIC_ACCESS_GATE=on once Entra
  // sign-in enforcement (Phase B) is wired, otherwise there is no way past it.
  accessGate: {
    enabled: envBool('NEXT_PUBLIC_ACCESS_GATE', false),
  },

  // Under-construction / test-data notice shown after the intro hero.
  constructionNotice: {
    // Master toggle — set false (or NEXT_PUBLIC_CONSTRUCTION_NOTICE=off) to hide it.
    enabled: envBool('NEXT_PUBLIC_CONSTRUCTION_NOTICE', true),
    // true  = show on EVERY page load (dev mode — current default)
    // false = show once per browser session
    everyLoad: envBool('NEXT_PUBLIC_CONSTRUCTION_NOTICE_EVERY_LOAD', true),
  },
};
