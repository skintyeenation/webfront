// Feature gates for the website. Flip a value here to toggle, or override at
// build time with the matching NEXT_PUBLIC_* env var (1/true/on vs 0/false/off).
function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  return ['1', 'true', 'on', 'yes'].includes(v.toLowerCase());
}

export const FEATURES = {
  // Under-construction / test-data notice shown after the intro hero.
  constructionNotice: {
    // Master toggle — set false (or NEXT_PUBLIC_CONSTRUCTION_NOTICE=off) to hide it.
    enabled: envBool('NEXT_PUBLIC_CONSTRUCTION_NOTICE', true),
    // true  = show on EVERY page load (dev mode — current default)
    // false = show once per browser session
    everyLoad: envBool('NEXT_PUBLIC_CONSTRUCTION_NOTICE_EVERY_LOAD', true),
  },
};
