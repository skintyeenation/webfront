import { HeartHandshake, Phone } from 'lucide-react';

// Member-facing "Need assistance?" CTA — shown on the Programs master page and
// each program page. Lighter style to distinguish from the proposal-writers CTA.
export function NeedAssistanceCta() {
  return (
    <section className="mt-8 rounded-2xl border border-[var(--line)] bg-[#f2f7f8] p-8">
      <h2 className="text-xl font-bold text-ink">Need to talk to an advisor?</h2>
      <p className="mt-2 max-w-2xl text-ink/70">
        Band members — need help applying for or accessing a program? Talk to a program advisor who can
        walk you through it.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href="tel:+12502513085"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-white transition hover:opacity-90"
        >
          <Phone size={18} aria-hidden="true" /> Call 250-251-3085
        </a>
        <a
          href="mailto:STFN_BandManager@outlook.com?subject=Program%20Assistance"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-5 py-2.5 font-semibold text-ink transition hover:shadow-sm"
        >
          <HeartHandshake size={18} aria-hidden="true" /> Email the band office
        </a>
      </div>
    </section>
  );
}
