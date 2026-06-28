'use client';

import { useState } from 'react';

// Demo-access request. Phase A: forwards via the visitor's mail client (mailto)
// to IT + the Band Manager — no backend needed. Phase B can POST to a route that
// sends server-side so requesters without a mail client also work.
const TO = 'it@skintyee.ca';
const CC = 'bandmanager@skintyee.ca';

export function RequestAccessForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');
  const [reason, setReason] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent('Demo access request — skintyee.ca');
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nOrganization: ${org || '—'}\n\nReason for access:\n${reason}`,
    );
    window.location.href = `mailto:${TO}?cc=${CC}&subject=${subject}&body=${body}`;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-primary hover:underline"
      >
        Need access? Request demo access →
      </button>
    );
  }

  const field = 'w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm';
  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <p className="text-sm font-semibold text-ink">Request demo access</p>
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={field} />
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" className={field} />
      <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Organization (optional)" className={field} />
      <textarea
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why would you like access?"
        rows={3}
        className={field}
      />
      <button type="submit" className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
        Send request
      </button>
      <p className="text-xs text-ink/50">Your request is sent to {TO} and the Band Manager.</p>
    </form>
  );
}
