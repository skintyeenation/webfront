// "Get the app" CTA — links to the App Store + Google Play. URLs come from env
// (the app ships via TestFlight/Play later); default to '#' until published.
const APP_STORE_URL = process.env.APP_STORE_URL ?? '#';
const PLAY_STORE_URL = process.env.PLAY_STORE_URL ?? '#';

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.74-1.517.03-2.01-.89-3.766-.89-1.756 0-2.302.86-3.74.92-1.43.06-2.518-1.43-3.495-2.77-1.998-2.78-3.524-7.86-1.475-11.28 1.018-1.71 2.84-2.79 4.81-2.82 1.475-.03 2.866.99 3.766.99.9 0 2.59-1.22 4.36-1.04.74.03 2.82.3 4.15 2.24-.106.07-2.48 1.45-2.45 4.33.03 3.44 3.01 4.59 3.04 4.6z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M3 1.5v21l18-10.5L3 1.5z" />
    </svg>
  );
}

function StoreBadge({ href, icon, top, bottom }: { href: string; icon: React.ReactNode; top: string; bottom: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg bg-white px-4 py-2 text-ink transition hover:bg-white/90"
    >
      {icon}
      <span className="leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-ink/60">{top}</span>
        <span className="block text-base font-semibold">{bottom}</span>
      </span>
    </a>
  );
}

export function AppDownloadCta() {
  return (
    <section className="rounded-xl bg-ink p-8 text-white">
      <div className="flex flex-col items-center gap-5 text-center md:flex-row md:justify-between md:text-left">
        <div>
          <h2 className="text-2xl font-bold">Get the Skin Tyee community app</h2>
          <p className="mt-1 text-white/80">Notifications, events, meetings, and member services — in your pocket.</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <StoreBadge href={APP_STORE_URL} icon={<AppleIcon />} top="Download on the" bottom="App Store" />
          <StoreBadge href={PLAY_STORE_URL} icon={<PlayIcon />} top="Get it on" bottom="Google Play" />
        </div>
      </div>
    </section>
  );
}
