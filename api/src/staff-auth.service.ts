// Staff authentication service — password hashing + JWT signing +
// failed-login lockout for the email/password sign-in path used by
// Person rows without a linked BandMember. See
// docs/features/staff-auth.md for the design and the 7 locked decisions.
//
// Three layers:
//   1. Password hashing (scrypt — node:crypto, no external dep).
//      OWASP-recommended; Alpine-friendly (no native binary).
//   2. JWT signing/verifying (HS256, 24h TTL). Locked decision #1.
//      Secret comes from STAFF_AUTH_SECRET env var.
//   3. In-memory failed-login tracker — 5 attempts → 15-min lockout
//      per email (locked decision #4). Single-instance api/ today
//      means a Map is sufficient; revisit if we scale to multiple
//      replicas.

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const SCRYPT_KEYLEN = 32;
const SCRYPT_SALTLEN = 16;
// scrypt N=2^14 (16384), r=8, p=1 — OWASP 2023 minimum. Same hash format
// MAY be used by other future password paths (e.g. break-glass admin),
// so the prefix "scrypt$" lets us add other algorithms later by inspecting
// it at verify time.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

const JWT_TTL_SECONDS = 24 * 60 * 60; // 24h — locked decision #1
const JWT_ALG: jwt.Algorithm = 'HS256';
const JWT_ISS = 'skintyee-api';
const JWT_AUD = 'skintyee-app-staff';

// Locked decision #4 — lockout policy
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export type StaffJwtPayload = {
  sub: string;            // Person.id
  role: 'staff' | 'admin';
  kind: 'staff';          // discriminator so future Entra JWTs can co-exist
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
};

@Injectable()
export class StaffAuthService {
  private readonly log = new Logger(StaffAuthService.name);

  // email-lowercased → { count, windowStart }
  private readonly failedAttempts = new Map<string, { count: number; firstFailAt: number }>();

  private secret(): string {
    const s = process.env.STAFF_AUTH_SECRET ?? '';
    if (!s || s.length < 32) {
      // Hard-fail at sign time rather than ship insecure tokens. The
      // log line names the env var so an ops person fixing this in
      // Container App config sees what to set.
      throw new Error(
        'STAFF_AUTH_SECRET env var is missing or shorter than 32 chars. ' +
        'Set it as a Container App secret before enabling staff sign-in.',
      );
    }
    return s;
  }

  // ---- Password hashing -------------------------------------------------
  //
  // Returns "scrypt$<saltHex>$<hashHex>" — single-string serialisation so
  // the column stays a plain String. verifyPassword parses the prefix.

  async hashPassword(plain: string): Promise<string> {
    const salt = crypto.randomBytes(SCRYPT_SALTLEN);
    const hash = await this.scrypt(plain, salt);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  }

  async verifyPassword(plain: string, stored: string): Promise<boolean> {
    if (!stored) return false;
    const [algo, saltHex, hashHex] = stored.split('$');
    if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await this.scrypt(plain, salt);
    // Constant-time compare so attackers can't time-side-channel the hash.
    return expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual);
  }

  private scrypt(plain: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(plain, salt, SCRYPT_KEYLEN, {
        N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
      }, (err, derivedKey) => err ? reject(err) : resolve(derivedKey as Buffer));
    });
  }

  // ---- JWT --------------------------------------------------------------

  signToken(payload: Omit<StaffJwtPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
    return jwt.sign(payload, this.secret(), {
      algorithm: JWT_ALG,
      expiresIn: JWT_TTL_SECONDS,
      issuer: JWT_ISS,
      audience: JWT_AUD,
    });
  }

  /** Returns the decoded payload on success, `null` on any verification failure. */
  verifyToken(token: string): StaffJwtPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret(), {
        algorithms: [JWT_ALG],
        issuer: JWT_ISS,
        audience: JWT_AUD,
      }) as StaffJwtPayload;
      if (decoded?.kind !== 'staff') return null;
      return decoded;
    } catch (e: any) {
      // Don't log the token; do log why it was rejected at debug level.
      this.log.debug?.(`verifyToken rejected: ${e?.message ?? e}`);
      return null;
    }
  }

  // ---- Failed-login lockout --------------------------------------------
  //
  // Per-email tracker, cleared on success and on window expiry. Email
  // normalised to lowercase by callers; this layer trusts what it gets.

  isLocked(email: string): boolean {
    const entry = this.failedAttempts.get(email);
    if (!entry) return false;
    if (Date.now() - entry.firstFailAt > LOCKOUT_WINDOW_MS) {
      // Window expired — wipe and treat as fresh.
      this.failedAttempts.delete(email);
      return false;
    }
    return entry.count >= LOCKOUT_MAX_ATTEMPTS;
  }

  recordFailure(email: string): void {
    const now = Date.now();
    const entry = this.failedAttempts.get(email);
    if (!entry || now - entry.firstFailAt > LOCKOUT_WINDOW_MS) {
      this.failedAttempts.set(email, { count: 1, firstFailAt: now });
      return;
    }
    entry.count += 1;
    if (entry.count === LOCKOUT_MAX_ATTEMPTS) {
      this.log.warn(`staff-auth: lockout triggered for ${email} (${entry.count} failures in window)`);
    }
  }

  clearFailures(email: string): void {
    this.failedAttempts.delete(email);
  }

  // ---- One-time tokens (used by request-reset; Slice 4 mails them) ------

  generateResetToken(): string {
    // 32 bytes → 64 hex chars. Plenty of entropy for a single-use,
    // short-lived (1h) reset token.
    return crypto.randomBytes(32).toString('hex');
  }

  /** True when the token is within its 1-hour validity window. */
  isResetTokenFresh(setAt: Date | null | undefined): boolean {
    if (!setAt) return false;
    return Date.now() - setAt.getTime() <= 60 * 60 * 1000;
  }
}
