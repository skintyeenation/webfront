'use client';
import { useState } from 'react';
import { Mail, Phone } from 'lucide-react';

// Project-referral CTA (Projects page) — expands inline into a referral form that posts to
// /api/project-referral. Phone + direct-email remain as alternatives.
export function ProjectReferralCta() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', organization: '', details: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.details.trim()) {
      setStatus('error');
      setMessage('Please fill in your name, email, and the referral details.');
      return;
    }
    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch('/api/project-referral', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed.');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Submission failed.');
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-white/20 bg-white/95 px-3 py-2 text-ink placeholder:text-ink/40';

  return (
    <section className="mt-10 overflow-hidden rounded-2xl bg-gradient-to-br from-[#00343f] to-[#014e5e] p-8 text-white">
      <h2 className="text-xl font-bold">Have a project referral?</h2>
      <p className="mt-2 max-w-2xl text-white/85">
        Working on a project that could support the community — or want to refer one to the band? Tell us
        about it and we&apos;ll connect you with the right people.
      </p>

      {status === 'done' ? (
        <div className="mt-5 rounded-xl bg-white/10 p-4">
          <p className="font-semibold">Thank you — your referral has been received.</p>
          <p className="mt-1 text-sm text-white/80">Skin Tyee staff will follow up at {form.email}.</p>
        </div>
      ) : !open ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 font-semibold text-ink transition hover:opacity-90"
          >
            <Mail size={18} aria-hidden="true" /> Make a referral
          </button>
          <a
            href="tel:+12502513085"
            className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-2.5 font-semibold text-white transition hover:bg-white/10"
          >
            <Phone size={18} aria-hidden="true" /> 250-251-3085
          </a>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 max-w-2xl space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="font-semibold text-white/80">Your name</span>
              <input value={form.name} onChange={set('name')} className={field} required />
            </label>
            <label className="block">
              <span className="font-semibold text-white/80">Email</span>
              <input type="email" value={form.email} onChange={set('email')} className={field} required />
            </label>
          </div>
          <label className="block">
            <span className="font-semibold text-white/80">Organization (optional)</span>
            <input value={form.organization} onChange={set('organization')} className={field} />
          </label>
          <label className="block">
            <span className="font-semibold text-white/80">Referral details</span>
            <textarea
              value={form.details}
              onChange={set('details')}
              rows={4}
              className={field}
              placeholder="What's the project, who's involved, and how it could support the community."
              required
            />
          </label>

          {status === 'error' && <p className="font-semibold text-amber-200">{message}</p>}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={status === 'sending'}
              className="rounded-lg bg-white px-5 py-2.5 font-semibold text-ink transition hover:opacity-90 disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending…' : 'Send referral'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/40 px-5 py-2.5 font-semibold text-white transition hover:bg-white/10"
            >
              Cancel
            </button>
            <span className="text-xs text-white/60">
              or email{' '}
              <a href="mailto:referrals@skintyee.ca?subject=Project%20Referral" className="underline">
                referrals@skintyee.ca
              </a>
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
