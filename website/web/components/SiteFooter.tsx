// Footer — uses the old "Rights & Title" link styling, now for social links.
// URLs from env (FACEBOOK_URL / INSTAGRAM_URL / LINKEDIN_URL); default '#'.
const SOCIAL = [
  { label: 'Facebook', url: process.env.FACEBOOK_URL || '#' },
  { label: 'Instagram', url: process.env.INSTAGRAM_URL || '#' },
  { label: 'LinkedIn', url: process.env.LINKEDIN_URL || '#' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-black/[0.03]">
      <div className="mx-auto flex max-w-[1140px] flex-wrap items-center justify-between gap-4 px-5 py-6">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink/70">Follow us</h2>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {SOCIAL.map((s) => (
              <li key={s.label}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {s.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-ink/50">© {new Date().getFullYear()} Skin Tyee First Nation</p>
      </div>
    </footer>
  );
}
