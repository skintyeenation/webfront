// ============================================================================
// Email letterhead template — EDIT THIS FILE to change how all outgoing emails
// look. Two things to adjust:
//   1. BRAND below — the band's name / address / phone / email / colors.
//   2. The markup in `renderEmail()` — the shared header + footer shell.
// Per-email content is passed in as `bodyHtml` (the "custom content" slot), so
// every email reuses the same letterhead. The logo is sent as an inline
// attachment (Content-ID: "logo") and referenced as <img src="cid:logo">.
// ============================================================================

export const BRAND = {
  name: 'Skin Tyee First Nation',
  tagline: 'Band 729',
  address: 'PO Box 131, Southbank, BC, V0J 2P0',
  phone: '250-251-3085',
  email: 'info@skintyee.ca',
  website: 'skintyee.ca',
  // Light letterhead palette (cyan accent echoes the app theme).
  colors: {
    ink: '#1f2937',
    muted: '#6b7280',
    accent: '#0e7c86',
    panel: '#f6f8f8',
    border: '#e5e7eb',
    page: '#eef1f1',
  },
};

export interface EmailParts {
  /** Short subject-line-ish heading shown above the body. */
  title: string;
  /** The custom email content (trusted HTML). */
  bodyHtml: string;
  /** Hidden inbox-preview text. */
  preheader?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Wrap custom body HTML in the Skin Tyee letterhead (header logo + contact
 * block, body, footer). Email-safe: tables + inline styles, 600px max width.
 */
export function renderEmail({ title, bodyHtml, preheader = '' }: EmailParts): string {
  const c = BRAND.colors;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<title>${esc(title)}</title>
</head>
<body style="margin:0; padding:0; background:${c.page}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:${c.ink};">
  <span style="display:none; visibility:hidden; opacity:0; height:0; width:0; overflow:hidden;">${esc(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.page};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; background:#ffffff; border:1px solid ${c.border}; border-radius:10px; overflow:hidden;">

        <!-- ============ HEADER / LETTERHEAD ============ -->
        <tr><td style="padding:20px 24px; border-bottom:3px solid ${c.accent}; background:${c.panel};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle" style="width:84px;">
              <img src="${process.env.EMAIL_LOGO_URL ?? 'https://api.skintyee.ca/v1/assets/skintyee-logo.png'}" width="72" alt="${esc(BRAND.name)}" style="display:block; border:0; width:72px; height:auto;" />
            </td>
            <td valign="middle" style="padding-left:14px;">
              <div style="font-size:18px; font-weight:700; color:${c.ink}; line-height:1.2;">${esc(BRAND.name)}</div>
              <div style="font-size:12px; color:${c.muted}; margin-top:2px;">${esc(BRAND.tagline)} &nbsp;·&nbsp; ${esc(BRAND.address)}</div>
              <div style="font-size:12px; color:${c.muted}; margin-top:2px;">
                ${esc(BRAND.phone)} &nbsp;·&nbsp;
                <a href="mailto:${esc(BRAND.email)}" style="color:${c.accent}; text-decoration:none;">${esc(BRAND.email)}</a> &nbsp;·&nbsp;
                <a href="https://${esc(BRAND.website)}" style="color:${c.accent}; text-decoration:none;">${esc(BRAND.website)}</a>
              </div>
            </td>
          </tr></table>
        </td></tr>

        <!-- ============ BODY (custom content) ============ -->
        <tr><td style="padding:28px 24px;">
          ${title ? `<h1 style="margin:0 0 16px; font-size:20px; font-weight:700; color:${c.ink};">${esc(title)}</h1>` : ''}
          ${bodyHtml}
        </td></tr>

        <!-- ============ FOOTER ============ -->
        <tr><td style="padding:16px 24px; border-top:1px solid ${c.border}; background:${c.panel};">
          <div style="font-size:11px; color:${c.muted}; line-height:1.5;">
            ${esc(BRAND.name)} &nbsp;·&nbsp; ${esc(BRAND.address)}<br />
            ${esc(BRAND.phone)} &nbsp;·&nbsp; <a href="mailto:${esc(BRAND.email)}" style="color:${c.muted};">${esc(BRAND.email)}</a><br />
            This is an automated message — please do not reply to this email.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Bare-bones HTML → text fallback for the multipart `text` part. */
export function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

// ----------------------------------------------------------------------------
// Specific emails
// ----------------------------------------------------------------------------

/**
 * Staff onboarding: "you've been added — here's your one-time password".
 * `extraHtml` is an optional admin-written custom note injected into the body.
 */
export function renderStaffOtpEmail(opts: {
  displayName?: string;
  upn: string;
  oneTimePassword: string;
  signInUrl?: string;
  extraHtml?: string;
}): { subject: string; html: string; text: string } {
  const c = BRAND.colors;
  const greeting = opts.displayName ? `Hi ${esc(opts.displayName)},` : 'Hello,';
  const signInLine = opts.signInUrl
    ? `<p style="margin:0 0 16px; font-size:14px; line-height:1.6;">Sign in here: <a href="${esc(opts.signInUrl)}" style="color:${c.accent};">${esc(opts.signInUrl)}</a></p>`
    : '';
  const extra = opts.extraHtml ? `<div style="margin:0 0 16px; font-size:14px; line-height:1.6;">${opts.extraHtml}</div>` : '';
  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
      You've been added to the <strong>${esc(BRAND.name)}</strong> staff app. Use the
      one-time password below to sign in, then set your own password.
    </p>
    ${extra}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="padding:16px 20px; background:${c.panel}; border:1px solid ${c.border}; border-radius:8px;">
        <div style="font-size:12px; color:${c.muted}; text-transform:uppercase; letter-spacing:1px;">Username</div>
        <div style="font-size:15px; color:${c.ink}; margin:2px 0 12px;">${esc(opts.upn)}</div>
        <div style="font-size:12px; color:${c.muted}; text-transform:uppercase; letter-spacing:1px;">One-time password</div>
        <div style="font-size:22px; font-weight:700; color:${c.accent}; font-family:'SFMono-Regular',Menlo,Consolas,monospace; margin-top:2px;">${esc(opts.oneTimePassword)}</div>
      </td></tr>
    </table>
    ${signInLine}
    <p style="margin:0; font-size:12px; color:${c.muted}; line-height:1.6;">
      For your security, please change this password the first time you sign in. If you
      weren't expecting this, contact the band office at ${esc(BRAND.phone)}.
    </p>`;
  const html = renderEmail({
    title: 'Your Skin Tyee app sign-in',
    bodyHtml,
    preheader: 'Your one-time password for the Skin Tyee staff app',
  });
  return { subject: `Your ${BRAND.name} app sign-in`, html, text: toPlainText(html) };
}

/**
 * Password reset prompt — sent when an admin forces a reset (or a user asks
 * to reset). Points the user at the self-service reset URL (aka.ms/sspr).
 * Their sign-in sessions are revoked alongside this, so they must reset.
 */
export function renderPasswordResetEmail(opts: {
  displayName?: string;
  resetUrl?: string;       // default https://aka.ms/sspr
  byAdmin?: boolean;       // admin-initiated vs self-requested
}): { subject: string; html: string; text: string } {
  const c = BRAND.colors;
  const url = opts.resetUrl ?? 'https://aka.ms/sspr';
  const greeting = opts.displayName ? `Hi ${esc(opts.displayName)},` : 'Hello,';
  const reason = opts.byAdmin
    ? `An administrator at <strong>${esc(BRAND.name)}</strong> has requested that you reset your password.`
    : `Here's how to reset your <strong>${esc(BRAND.name)}</strong> password.`;
  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
      ${reason} You've been signed out everywhere — set a new password using the
      secure self-service link below, then sign back in.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td align="center" style="padding:18px;">
        <a href="${esc(url)}" style="display:inline-block; padding:12px 28px; background:${c.accent}; color:#fff; font-size:15px; font-weight:600; text-decoration:none; border-radius:8px;">Reset my password</a>
      </td></tr>
    </table>
    <p style="margin:0 0 16px; font-size:13px; line-height:1.6; color:${c.muted};">
      Or paste this into your browser: <a href="${esc(url)}" style="color:${c.accent};">${esc(url)}</a>
    </p>
    <p style="margin:0; font-size:12px; color:${c.muted}; line-height:1.6;">
      You'll verify your identity, then choose a new password. If you didn't expect
      this, contact the band office at ${esc(BRAND.phone)}.
    </p>`;
  const html = renderEmail({
    title: `Reset your ${BRAND.name} password`,
    bodyHtml,
    preheader: 'Reset your password using the secure self-service link',
  });
  return { subject: `Reset your ${BRAND.name} password`, html, text: toPlainText(html) };
}

/**
 * Community notification → email blast to band members. Mirrors the in-app
 * notification (title + body + category). The body is split on blank/newlines
 * into paragraphs.
 */
export function renderNotificationEmail(opts: {
  title: string;
  body: string;
  category?: string;
}): { subject: string; html: string; text: string } {
  const c = BRAND.colors;
  const cat = opts.category
    ? `<div style="font-size:11px; font-weight:700; color:${c.accent}; text-transform:uppercase; letter-spacing:1px; margin:0 0 12px;">${esc(opts.category)}</div>`
    : '';
  const paras = (opts.body || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px; font-size:14px; line-height:1.7; color:${c.ink};">${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const bodyHtml = `
    ${cat}
    ${paras || `<p style="margin:0; font-size:14px; color:${c.ink};">${esc(opts.title)}</p>`}
    <p style="margin:18px 0 0; font-size:12px; color:${c.muted};">You're receiving this because you're a ${esc(BRAND.name)} band member.</p>`;
  const html = renderEmail({ title: opts.title, bodyHtml, preheader: (opts.body || opts.title).slice(0, 140) });
  return { subject: opts.title, html, text: toPlainText(html) };
}

/** Offboarding — a staff app account was deleted. To the admins group (audit)
 *  and the person's non-skintyee.ca email (since their @skintyee.ca is gone). */
export function renderAccountDeletedEmail(opts: {
  personName: string;
  personEmail?: string;
  deletedBy?: string;
}): { subject: string; html: string; text: string } {
  const c = BRAND.colors;
  const row = (label: string, val: string) =>
    `<tr><td style="padding:5px 0; font-size:13px; color:${c.muted};">${esc(label)}</td><td style="padding:5px 0; font-size:13px; color:${c.ink}; text-align:right; font-weight:600;">${esc(val)}</td></tr>`;
  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
      A ${esc(BRAND.name)} staff app account has been <strong>removed</strong>${opts.deletedBy ? ` by ${esc(opts.deletedBy)}` : ''}.
      Access to the app and related staff records has been revoked.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td style="padding:16px 20px; background:${c.panel}; border:1px solid ${c.border}; border-radius:8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Name', opts.personName)}
          ${opts.personEmail ? row('Account', opts.personEmail) : ''}
        </table>
      </td></tr>
    </table>
    <p style="margin:0; font-size:12px; color:${c.muted};">If this wasn't expected, contact the band office at ${esc(BRAND.phone)}.</p>`;
  const html = renderEmail({ title: 'Staff account removed', bodyHtml, preheader: `${opts.personName} — account removed` });
  return { subject: `Account removed — ${opts.personName}`, html, text: toPlainText(html) };
}

export type TimesheetEvent = 'submitted' | 'edited' | 'approved' | 'rejected';

/**
 * Timesheet lifecycle email — one per event (submitted / edited / approved /
 * rejected), each with a "what changed" summary. Sent to the worker + the
 * admins group. `changes` is a pre-computed list of human-readable diff lines.
 */
export function renderTimesheetEventEmail(opts: {
  event: TimesheetEvent;
  workerName: string;
  periodLabel: string;
  status: string;
  totalHours: number;
  overtimeHours: number;
  week1Hours: number;
  week2Hours: number;
  changes: string[];
  actor?: string;
  reason?: string;
}): { subject: string; html: string; text: string } {
  const c = BRAND.colors;
  const VERB: Record<TimesheetEvent, string> = {
    submitted: 'submitted', edited: 'adjusted', approved: 'approved', rejected: 'rejected',
  };
  const intro: Record<TimesheetEvent, string> = {
    submitted: `A timesheet has been <strong>submitted</strong> for approval.`,
    edited: `A timesheet has been <strong>adjusted by an administrator</strong>${opts.actor ? ` (${esc(opts.actor)})` : ''}.`,
    approved: `A timesheet has been <strong>approved</strong>${opts.actor ? ` by ${esc(opts.actor)}` : ''}.`,
    rejected: `A timesheet has been <strong>rejected</strong>${opts.actor ? ` by ${esc(opts.actor)}` : ''}.`,
  };
  const row = (label: string, val: string) =>
    `<tr><td style="padding:5px 0; font-size:13px; color:${c.muted};">${esc(label)}</td><td style="padding:5px 0; font-size:13px; color:${c.ink}; text-align:right; font-weight:600;">${esc(val)}</td></tr>`;
  const changeItems = (opts.changes.length ? opts.changes : ['No field changes recorded.'])
    .map((ch) => `<li style="margin:0 0 5px; font-size:13px; line-height:1.5; color:${c.ink};">${esc(ch)}</li>`)
    .join('');
  const reasonBlock = opts.reason
    ? `<p style="margin:0 0 16px; font-size:13px; color:${c.ink};"><strong>Reason:</strong> ${esc(opts.reason)}</p>`
    : '';
  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">${intro[opts.event]}</p>
    ${reasonBlock}
    <div style="font-size:12px; font-weight:700; color:${c.muted}; text-transform:uppercase; letter-spacing:1px; margin:0 0 6px;">What changed</div>
    <ul style="margin:0 0 18px; padding-left:18px;">${changeItems}</ul>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td style="padding:16px 20px; background:${c.panel}; border:1px solid ${c.border}; border-radius:8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Worker', opts.workerName)}
          ${row('Pay period', opts.periodLabel)}
          ${row('Status', opts.status.toUpperCase())}
          ${row('Total hours', `${opts.totalHours}h`)}
          ${row('Overtime', `${opts.overtimeHours}h`)}
          ${row('Week 1 / Week 2', `${opts.week1Hours}h / ${opts.week2Hours}h`)}
        </table>
      </td></tr>
    </table>
    <p style="margin:0; font-size:12px; color:${c.muted};">If this looks incorrect, contact the band office at ${esc(BRAND.phone)}.</p>`;
  const html = renderEmail({
    title: `Timesheet ${VERB[opts.event]}`,
    bodyHtml,
    preheader: `${opts.workerName} — ${opts.periodLabel}`,
  });
  return {
    subject: `Timesheet ${VERB[opts.event]} — ${opts.workerName} (${opts.periodLabel})`,
    html,
    text: toPlainText(html),
  };
}

export type ExpenseEvent = 'submitted' | 'edited' | 'approved' | 'rejected';

/**
 * Expense-claim lifecycle email — the reimbursement twin of the timesheet
 * event email. Sent to the submitter + the finance group (admins on edits).
 * `lines` is a pre-computed receipt breakdown (vendor · amount · tag).
 */
export function renderExpenseEventEmail(opts: {
  event: ExpenseEvent;
  submitterName: string;
  periodLabel: string;
  status: string;
  totalAmount: number;
  currency: string;
  receiptCount: number;
  lines: string[];
  actor?: string;
  reason?: string;
}): { subject: string; html: string; text: string } {
  const c = BRAND.colors;
  const money = `${opts.currency === 'CAD' ? '$' : opts.currency + ' '}${(Number(opts.totalAmount) || 0).toFixed(2)}`;
  const VERB: Record<ExpenseEvent, string> = {
    submitted: 'submitted', edited: 'adjusted', approved: 'approved', rejected: 'rejected',
  };
  const intro: Record<ExpenseEvent, string> = {
    submitted: `An expense claim has been <strong>submitted</strong> for reimbursement.`,
    edited: `An expense claim has been <strong>adjusted by an administrator</strong>${opts.actor ? ` (${esc(opts.actor)})` : ''}.`,
    approved: `An expense claim has been <strong>approved</strong>${opts.actor ? ` by ${esc(opts.actor)}` : ''} for reimbursement.`,
    rejected: `An expense claim has been <strong>rejected</strong>${opts.actor ? ` by ${esc(opts.actor)}` : ''}.`,
  };
  const row = (label: string, val: string) =>
    `<tr><td style="padding:5px 0; font-size:13px; color:${c.muted};">${esc(label)}</td><td style="padding:5px 0; font-size:13px; color:${c.ink}; text-align:right; font-weight:600;">${esc(val)}</td></tr>`;
  const lineItems = (opts.lines.length ? opts.lines : ['No receipts recorded.'])
    .map((ln) => `<li style="margin:0 0 5px; font-size:13px; line-height:1.5; color:${c.ink};">${esc(ln)}</li>`)
    .join('');
  const reasonBlock = opts.reason
    ? `<p style="margin:0 0 16px; font-size:13px; color:${c.ink};"><strong>Reason:</strong> ${esc(opts.reason)}</p>`
    : '';
  const bodyHtml = `
    <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">${intro[opts.event]}</p>
    ${reasonBlock}
    <div style="font-size:12px; font-weight:700; color:${c.muted}; text-transform:uppercase; letter-spacing:1px; margin:0 0 6px;">Receipts</div>
    <ul style="margin:0 0 18px; padding-left:18px;">${lineItems}</ul>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td style="padding:16px 20px; background:${c.panel}; border:1px solid ${c.border}; border-radius:8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Submitter', opts.submitterName)}
          ${row('Period', opts.periodLabel)}
          ${row('Status', opts.status.toUpperCase())}
          ${row('Receipts', String(opts.receiptCount))}
          ${row('Total claimed', money)}
        </table>
      </td></tr>
    </table>
    <p style="margin:0; font-size:12px; color:${c.muted};">If this looks incorrect, contact the band office at ${esc(BRAND.phone)}.</p>`;
  const html = renderEmail({
    title: `Expense claim ${VERB[opts.event]}`,
    bodyHtml,
    preheader: `${opts.submitterName} — ${opts.periodLabel} · ${money}`,
  });
  return {
    subject: `Expense claim ${VERB[opts.event]} — ${opts.submitterName} (${opts.periodLabel})`,
    html,
    text: toPlainText(html),
  };
}
