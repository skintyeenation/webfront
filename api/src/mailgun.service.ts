import { Injectable, Logger } from '@nestjs/common';
import { EMAIL_LOGO_PNG_B64 } from './email-logo';

// Transactional email via the Mailgun HTTP API. Zero deps — uses Node 20's
// global fetch + FormData. Config (all via env; secrets live in Container App
// secrets in prod):
//
//   MAILGUN_API_KEY   (required)  Mailgun private API key
//   MAILGUN_DOMAIN    (required)  sending domain, e.g. mg.skintyee.ca
//   MAILGUN_FROM      (optional)  default: "Skin Tyee First Nation <it@skintyee.ca>"
//   MAILGUN_BASE_URL  (optional)  default https://api.mailgun.net  (EU: https://api.eu.mailgun.net)
//
// The Skin Tyee logo is attached inline (Content-ID "logo.png") so the
// letterhead's <img src="cid:logo.png"> renders without external hosting.

const LOGO_CID = 'logo.png';

@Injectable()
export class MailgunService {
  private readonly log = new Logger(MailgunService.name);

  get configured(): boolean {
    return !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
  }

  private get from(): string {
    return process.env.MAILGUN_FROM ?? 'Skin Tyee First Nation <it@skintyee.ca>';
  }

  /**
   * Send one email. Returns true if Mailgun accepted it, false if email is not
   * configured (no-op so dev/prod without Mailgun still works). Throws on a
   * Mailgun API error so callers can decide whether that's fatal.
   */
  async send(opts: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    /** Attach the letterhead logo inline (default true). */
    inlineLogo?: boolean;
  }): Promise<boolean> {
    if (!this.configured) {
      this.log.warn(`Mailgun not configured — skipping email "${opts.subject}" → ${opts.to}`);
      return false;
    }
    const base = process.env.MAILGUN_BASE_URL ?? 'https://api.mailgun.net';
    const domain = process.env.MAILGUN_DOMAIN!;
    const apiKey = process.env.MAILGUN_API_KEY!;

    const form = new FormData();
    form.append('from', opts.from ?? this.from);
    form.append('to', opts.to);
    form.append('subject', opts.subject);
    form.append('html', opts.html);
    if (opts.text) form.append('text', opts.text);
    if (opts.inlineLogo === true) {
      const logo = Buffer.from(EMAIL_LOGO_PNG_B64, 'base64');
      form.append('inline', new Blob([logo], { type: 'image/png' }), LOGO_CID);
    }

    const res = await fetch(`${base}/v3/${domain}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`api:${apiKey}`).toString('base64') },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Mailgun send failed ${res.status}: ${body}`);
    }
    this.log.log(`Mailgun: sent "${opts.subject}" → ${opts.to}`);
    return true;
  }

  /**
   * Send the SAME message to many recipients as individualised emails —
   * recipient-variables makes Mailgun deliver a separate copy to each address
   * (recipients don't see one another). Batched at Mailgun's 1000-per-message
   * limit. Returns how many were accepted (0 if Mailgun isn't configured).
   */
  async sendBulk(opts: {
    recipients: string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
    inlineLogo?: boolean;
  }): Promise<{ sent: number; configured: boolean }> {
    const recipients = [...new Set(opts.recipients.filter(Boolean))];
    if (!this.configured) {
      this.log.warn(`Mailgun not configured — skipping bulk "${opts.subject}" (${recipients.length} recipients)`);
      return { sent: 0, configured: false };
    }
    if (recipients.length === 0) return { sent: 0, configured: true };

    const base = process.env.MAILGUN_BASE_URL ?? 'https://api.mailgun.net';
    const domain = process.env.MAILGUN_DOMAIN!;
    const auth = 'Basic ' + Buffer.from(`api:${process.env.MAILGUN_API_KEY!}`).toString('base64');
    const logo = Buffer.from(EMAIL_LOGO_PNG_B64, 'base64');

    let sent = 0;
    for (let i = 0; i < recipients.length; i += 1000) {
      const batch = recipients.slice(i, i + 1000);
      const form = new FormData();
      form.append('from', opts.from ?? this.from);
      for (const r of batch) form.append('to', r);
      form.append('subject', opts.subject);
      form.append('html', opts.html);
      if (opts.text) form.append('text', opts.text);
      // Empty per-recipient vars still triggers individualised delivery.
      form.append('recipient-variables', JSON.stringify(Object.fromEntries(batch.map((r) => [r, {}]))));
      if (opts.inlineLogo === true) {
        form.append('inline', new Blob([logo], { type: 'image/png' }), LOGO_CID);
      }
      const res = await fetch(`${base}/v3/${domain}/messages`, {
        method: 'POST',
        headers: { Authorization: auth },
        body: form,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Mailgun bulk send failed ${res.status}: ${body}`);
      }
      sent += batch.length;
    }
    this.log.log(`Mailgun: sent "${opts.subject}" to ${sent} recipients`);
    return { sent, configured: true };
  }
}
