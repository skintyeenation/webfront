// Public-facing authentication endpoints for the email/password sign-in
// path (Persons without a linked BandMember). See
// docs/features/staff-auth.md for the model.
//
// Path prefix: /v1/auth/staff/*
// All endpoints here are PUBLIC (no @Roles) — they ARE the way in.
//
// Counterpart admin endpoints (/v1/admin/people/:id/set-password,
// DELETE …/password) live in controllers.ts alongside the existing
// admin user-provisioning flow.

import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { StaffAuthService } from './staff-auth.service';

function normaliseEmail(e: unknown): string {
  if (typeof e !== 'string') return '';
  return e.trim().toLowerCase();
}

// Locked decision #3 — Entra-default complexity. Mirrored here so the
// staff path matches what M365 admins explain to users about their M365
// password. 8+ chars, 3 of {lower, upper, digit, symbol}.
function validateComplexity(p: string): void {
  if (typeof p !== 'string' || p.length < 8) {
    throw new BadRequestException('Password must be at least 8 characters.');
  }
  const cats = [
    /[a-z]/.test(p),
    /[A-Z]/.test(p),
    /[0-9]/.test(p),
    /[^A-Za-z0-9]/.test(p),
  ].filter(Boolean).length;
  if (cats < 3) {
    throw new BadRequestException(
      'Password must contain at least 3 of: lowercase, uppercase, digit, symbol.',
    );
  }
}

@Controller('auth/staff')
export class StaffAuthController {
  private readonly log = new Logger(StaffAuthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: StaffAuthService,
  ) {}

  // ---- POST /v1/auth/staff/login ---------------------------------------
  // body: { email, password }
  // 200: { token, person: { id, displayName, email, appRole } }
  // 401: invalid credentials (single-message reply — don't leak whether
  //      the email exists)
  // 429: locked out after 5 failures within 15 minutes

  @Post('login') @HttpCode(200)
  async login(@Body() b: { email?: string; password?: string }) {
    const email = normaliseEmail(b?.email);
    const password = typeof b?.password === 'string' ? b.password : '';
    if (!email || !password) {
      throw new UnauthorizedException('invalid_credentials');
    }
    if (this.auth.isLocked(email)) {
      throw new HttpException('too_many_attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!this.prisma.isAvailable) {
      throw new UnauthorizedException('invalid_credentials');
    }

    const person = await this.prisma.person.findUnique({ where: { email } });
    // Single failure path for "not found", "no password", "bad password",
    // and "linked to bandMember" so the response timing + message are
    // identical regardless of why. Belt-and-braces against the lifecycle
    // bug where a stale passwordHash survives a link transaction.
    if (
      !person ||
      !person.passwordHash ||
      person.bandMemberId !== null ||
      !(await this.auth.verifyPassword(password, person.passwordHash))
    ) {
      this.auth.recordFailure(email);
      throw new UnauthorizedException('invalid_credentials');
    }

    this.auth.clearFailures(email);
    await this.prisma.person.update({
      where: { id: person.id },
      data: { lastSignInAt: new Date() },
    }).catch(() => null);

    const role = (person.appRole === 'admin' ? 'admin' : 'staff') as 'admin' | 'staff';
    const token = this.auth.signToken({ sub: person.id, role, kind: 'staff' });

    return {
      token,
      person: {
        id: person.id,
        displayName: person.displayName,
        email: person.email,
        appRole: role,
      },
    };
  }

  // ---- POST /v1/auth/staff/request-reset -------------------------------
  // body: { email }
  // 204 always (don't leak whether the email is known). Slice 4 sends
  // the reset link via Microsoft Graph from info@skintyee.ca; until
  // that lands this endpoint just provisions the token in the DB and
  // logs it for admin pickup.

  @Post('request-reset') @HttpCode(204)
  async requestReset(@Body() b: { email?: string }) {
    const email = normaliseEmail(b?.email);
    if (!email || !this.prisma.isAvailable) return;
    const person = await this.prisma.person.findUnique({ where: { email } });
    // Only Persons that can actually log in are eligible to reset.
    if (!person || person.bandMemberId !== null || !person.passwordHash) return;

    const token = this.auth.generateResetToken();
    await this.prisma.person.update({
      where: { id: person.id },
      data: { resetToken: token, resetTokenAt: new Date() },
    });
    // TEMP (Slice 4 replaces this with a Graph sendMail call):
    this.log.log(
      `staff-auth: reset-token issued for ${email} — token=${token} (expires in 1h)`,
    );
  }

  // ---- POST /v1/auth/staff/reset-password ------------------------------
  // body: { token, newPassword }
  // 204 ok | 400 invalid/expired token | 400 weak password

  @Post('reset-password') @HttpCode(204)
  async resetPassword(@Body() b: { token?: string; newPassword?: string }) {
    const token = typeof b?.token === 'string' ? b.token : '';
    const newPassword = typeof b?.newPassword === 'string' ? b.newPassword : '';
    if (!token) {
      throw new BadRequestException('invalid_token');
    }
    validateComplexity(newPassword);
    if (!this.prisma.isAvailable) {
      throw new BadRequestException('invalid_token');
    }

    const person = await this.prisma.person.findUnique({ where: { resetToken: token } });
    if (
      !person ||
      person.bandMemberId !== null ||
      !this.auth.isResetTokenFresh(person.resetTokenAt)
    ) {
      throw new BadRequestException('invalid_token');
    }

    const hash = await this.auth.hashPassword(newPassword);
    await this.prisma.person.update({
      where: { id: person.id },
      data: {
        passwordHash: hash,
        passwordSetAt: new Date(),
        resetToken: null,
        resetTokenAt: null,
      },
    });
    // Clear any lockout for this email — the user just proved control of
    // the inbox, no reason to keep penalising them.
    if (person.email) this.auth.clearFailures(person.email);
  }
}
