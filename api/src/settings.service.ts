import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Admin-configurable, global notification settings: which system emails are
// enabled + the sender identity (From + Reply-To) applied to every send.
// Persisted as a single JSON blob in AppSetting('notification-settings');
// falls back to an in-memory copy when Prisma isn't connected so the api/
// keeps working in no-db mode.

export type NotificationCategory =
  | 'staffOtp'
  | 'communityNotifications'
  | 'timesheetEvents'
  | 'expenseEvents'
  | 'accountDeleted';

export interface NotificationSettings {
  // Per-category global email toggles (true = send).
  staffOtp: boolean;              // staff sign-in OTP on add / password set
  communityNotifications: boolean; // band-member notification blasts
  timesheetEvents: boolean;        // timesheet submitted / edited / approved / rejected
  expenseEvents: boolean;          // expense claim submitted / edited / approved / rejected
  accountDeleted: boolean;         // staff offboarding email
  // Sender identity applied to every outgoing email.
  fromName: string;
  fromEmail: string;
  replyTo: string; // '' = no Reply-To header
}

const SETTINGS_KEY = 'notification-settings';

// Defaults seed from the existing MAILGUN_FROM / MAILGUN_REPLY_TO env so
// behaviour is unchanged until an admin overrides it in the UI.
function defaults(): NotificationSettings {
  const env = (process.env.MAILGUN_FROM ?? '').trim();
  const m = env.match(/^(.*?)\s*<([^>]+)>$/);
  const fromName = m ? m[1].trim() : 'Skin Tyee First Nation';
  const fromEmail = m ? m[2].trim() : (env.includes('@') ? env : 'it@skintyee.ca');
  return {
    staffOtp: true,
    communityNotifications: true,
    timesheetEvents: true,
    expenseEvents: true,
    accountDeleted: true,
    fromName: fromName || 'Skin Tyee First Nation',
    fromEmail: fromEmail || 'it@skintyee.ca',
    replyTo: (process.env.MAILGUN_REPLY_TO ?? '').trim(),
  };
}

function coerceBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

// Document-library settings — a second AppSetting JSON blob, separate from
// notification-settings. Admin-configurable so the band can widen/narrow which
// Entra groups get the payroll/AP (audience:'finance') document scope without a
// code change.
export interface DocumentSettings {
  // Entra security-group slugs whose members can see audience:'finance'
  // documents. Admins always can, regardless of this list.
  financeDocumentGroups: string[];
}

const DOC_SETTINGS_KEY = 'document-settings';

function docDefaults(): DocumentSettings {
  return { financeDocumentGroups: ['finance'] };
}

@Injectable()
export class SettingsService {
  private readonly log = new Logger(SettingsService.name);
  private cache: NotificationSettings | null = null;

  constructor(private prisma: PrismaService) {}

  private async load(): Promise<NotificationSettings> {
    if (this.cache) return this.cache;
    let stored: Partial<NotificationSettings> = {};
    if (this.prisma.isAvailable) {
      try {
        const row = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
        if (row?.value) stored = JSON.parse(row.value);
      } catch (e: any) {
        this.log.warn(`load notification-settings failed; using defaults: ${e?.message ?? e}`);
      }
    }
    // Merge over defaults so a partial/older blob still yields every field.
    this.cache = { ...defaults(), ...stored };
    return this.cache;
  }

  async get(): Promise<NotificationSettings> {
    return { ...(await this.load()) };
  }

  async update(patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
    const cur = await this.load();
    const next: NotificationSettings = {
      staffOtp:               coerceBool(patch.staffOtp, cur.staffOtp),
      communityNotifications: coerceBool(patch.communityNotifications, cur.communityNotifications),
      timesheetEvents:        coerceBool(patch.timesheetEvents, cur.timesheetEvents),
      expenseEvents:          coerceBool(patch.expenseEvents, cur.expenseEvents),
      accountDeleted:         coerceBool(patch.accountDeleted, cur.accountDeleted),
      fromName:  (patch.fromName  ?? cur.fromName ).toString().trim() || defaults().fromName,
      fromEmail: (patch.fromEmail ?? cur.fromEmail).toString().trim() || defaults().fromEmail,
      replyTo:   (patch.replyTo   ?? cur.replyTo  ).toString().trim(),
    };
    this.cache = next;
    if (this.prisma.isAvailable) {
      try {
        await this.prisma.appSetting.upsert({
          where:  { key: SETTINGS_KEY },
          create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
          update: { value: JSON.stringify(next) },
        });
      } catch (e: any) {
        this.log.warn(`persist notification-settings failed (kept in memory): ${e?.message ?? e}`);
      }
    }
    return { ...next };
  }

  /** Whether a given category of system email is enabled (default true). */
  async isEnabled(category: NotificationCategory): Promise<boolean> {
    return (await this.load())[category] !== false;
  }

  /** Configured "Name <email>" used as the Mailgun From header. */
  async mailFrom(): Promise<string> {
    const s = await this.load();
    return `${s.fromName} <${s.fromEmail}>`;
  }

  /** Configured Reply-To address, or undefined when unset. */
  async replyTo(): Promise<string | undefined> {
    const s = await this.load();
    return s.replyTo || undefined;
  }

  // ---- Document settings (financeDocumentGroups) --------------------------

  private docCache: DocumentSettings | null = null;

  private async loadDoc(): Promise<DocumentSettings> {
    if (this.docCache) return this.docCache;
    let stored: Partial<DocumentSettings> = {};
    if (this.prisma.isAvailable) {
      try {
        const row = await this.prisma.appSetting.findUnique({ where: { key: DOC_SETTINGS_KEY } });
        if (row?.value) stored = JSON.parse(row.value);
      } catch (e: any) {
        this.log.warn(`load document-settings failed; using defaults: ${e?.message ?? e}`);
      }
    }
    const merged = { ...docDefaults(), ...stored };
    if (!Array.isArray(merged.financeDocumentGroups)) {
      merged.financeDocumentGroups = docDefaults().financeDocumentGroups;
    }
    this.docCache = merged;
    return this.docCache;
  }

  async getDocumentSettings(): Promise<DocumentSettings> {
    return { ...(await this.loadDoc()) };
  }

  async updateDocumentSettings(patch: Partial<DocumentSettings>): Promise<DocumentSettings> {
    const cur = await this.loadDoc();
    const groups = Array.isArray(patch.financeDocumentGroups)
      ? patch.financeDocumentGroups.map((s) => String(s).trim()).filter(Boolean)
      : cur.financeDocumentGroups;
    const next: DocumentSettings = { financeDocumentGroups: groups };
    this.docCache = next;
    if (this.prisma.isAvailable) {
      try {
        await this.prisma.appSetting.upsert({
          where:  { key: DOC_SETTINGS_KEY },
          create: { key: DOC_SETTINGS_KEY, value: JSON.stringify(next) },
          update: { value: JSON.stringify(next) },
        });
      } catch (e: any) {
        this.log.warn(`persist document-settings failed (kept in memory): ${e?.message ?? e}`);
      }
    }
    return { ...next };
  }

  /** Entra group slugs whose members can see audience:'finance' documents. */
  async financeDocumentGroups(): Promise<string[]> {
    return (await this.loadDoc()).financeDocumentGroups;
  }
}
