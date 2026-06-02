/**
 * ExoService — HTTP client to the Exchange Online PowerShell Function.
 *
 * Reads/writes shared-mailbox permissions by POSTing to the
 * `skintyee-exo-fn` Azure Function (PowerShell 7.4, Linux Consumption).
 * The function itself connects to EXO with cert-based app-only auth.
 *
 * Why a remote function and not local pwsh: macOS .NET silently can't
 * acquire confidential-client tokens from a cert for EXO. See
 * docs/features/shared-mailbox-management.md.
 *
 * Env vars (set by scripts/setup-exo-function.sh):
 *   EXO_FUNCTION_URL  — e.g. https://skintyee-exo-fn.azurewebsites.net/api/ExoFunction
 *   EXO_FUNCTION_KEY  — function host key for auth
 *
 * Graceful degrade: if either env var is missing, isAvailable=false and
 * calls throw a 503-ish error. The DB-side intent tracking still works
 * (mailboxMemberships column on BandMember), so the UI can save desired
 * state without actually writing to EXO — useful for development.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface SharedMailbox {
  displayName: string;
  upn: string;
  primarySmtpAddress: string;
  alias: string;
}

export interface MailboxAccess {
  mailbox: string;
  full: Array<{ user: string; rights: string }>;
  sendAs: Array<{ user: string; rights: string }>;
}

export interface MailboxForUser {
  mailbox: string;
  display: string;
  rights: string;
}

@Injectable()
export class ExoService {
  private readonly log = new Logger(ExoService.name);
  private readonly url: string | undefined;
  private readonly key: string | undefined;

  constructor() {
    this.url = process.env.EXO_FUNCTION_URL;
    this.key = process.env.EXO_FUNCTION_KEY;
    if (!this.url || !this.key) {
      this.log.warn(
        'EXO_FUNCTION_URL or EXO_FUNCTION_KEY missing — shared-mailbox ' +
          'operations will return 503. Run scripts/setup-exo-function.sh.'
      );
    } else {
      this.log.log(`ExoService → ${this.url}`);
    }
  }

  get isAvailable(): boolean {
    return !!(this.url && this.key);
  }

  private async call<T>(body: object): Promise<T> {
    if (!this.isAvailable) {
      throw new Error('EXO function not configured — set EXO_FUNCTION_URL + EXO_FUNCTION_KEY');
    }
    const target = `${this.url}?code=${this.key}`;
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`EXO function ${res.status}: ${text}`);
    }
    try {
      const json = JSON.parse(text);
      if (json.error) throw new Error(json.error);
      return json as T;
    } catch (e: any) {
      throw new Error(`EXO function returned non-JSON: ${text.slice(0, 200)}`);
    }
  }

  // List all shared mailboxes in the tenant.
  async listSharedMailboxes(): Promise<SharedMailbox[]> {
    const r = await this.call<{ mailboxes: any[] }>({ op: 'list' });
    return (r.mailboxes ?? []).map((m) => ({
      displayName:        m.DisplayName,
      upn:                (m.UserPrincipalName ?? '').toLowerCase(),
      primarySmtpAddress: (m.PrimarySmtpAddress ?? '').toLowerCase(),
      alias:              m.Alias,
    }));
  }

  // Who has FullAccess + SendAs on a given mailbox.
  async getMailboxAccess(mailboxUpn: string): Promise<MailboxAccess> {
    const r = await this.call<MailboxAccess>({ op: 'list-access', mailbox: mailboxUpn });
    return {
      mailbox: r.mailbox ?? mailboxUpn,
      full:    r.full   ?? [],
      sendAs:  r.sendAs ?? [],
    };
  }

  // Which mailboxes can a given user open.
  async getMailboxesForUser(userUpn: string): Promise<MailboxForUser[]> {
    const r = await this.call<{ mailboxes: MailboxForUser[] }>({ op: 'list-for-user', user: userUpn });
    return r.mailboxes ?? [];
  }

  // Grant FullAccess + SendAs.
  async grantAccess(mailboxUpn: string, userUpn: string): Promise<void> {
    await this.call({ op: 'grant', mailbox: mailboxUpn, user: userUpn });
  }

  // Revoke FullAccess + SendAs.
  async revokeAccess(mailboxUpn: string, userUpn: string): Promise<void> {
    await this.call({ op: 'revoke', mailbox: mailboxUpn, user: userUpn });
  }
}
