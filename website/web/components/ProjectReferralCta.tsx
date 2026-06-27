import { Mail, Phone } from 'lucide-react';

// Project-referral CTA — shown on the Projects page.
export function ProjectReferralCta() {
  return (
    <section className="mt-10 overflow-hidden rounded-2xl bg-gradient-to-br from-[#00343f] to-[#014e5e] p-8 text-white">
      <h2 className="text-xl font-bold">Have a project referral?</h2>
      <p className="mt-2 max-w-2xl text-white/85">
        Working on a project that could support the community — or want to refer one to the band? Get in
        touch and we&apos;ll connect you with the right people.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href="mailto:referrals@skintyee.ca?subject=Project%20Referral"
          className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 font-semibold text-ink transition hover:opacity-90"
        >
          <Mail size={18} aria-hidden="true" /> referrals@skintyee.ca
        </a>
        <a
          href="tel:+12502513085"
          className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-2.5 font-semibold text-white transition hover:bg-white/10"
        >
          <Phone size={18} aria-hidden="true" /> 250-251-3085
        </a>
      </div>
    </section>
  );
}
