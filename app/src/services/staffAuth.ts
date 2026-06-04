// Public staff-auth endpoint helpers — request-reset + reset-password.
// Kept outside ApiService because these endpoints are public (no auth
// header), so the shared get/post helpers (which inject x-role +
// Authorization) would do unnecessary work. Login also bypasses the
// ApiService for the same reason; lives inline in auth.ts as a
// createAsyncThunk.

import Config from 'skintyee/config';

function apiBase(): string {
  const base = Config.apiServer;
  if (!base || base === 'mock' || !/^https?:\/\//.test(base)) {
    throw new Error(
      'staff-auth endpoints need a real api/ — set EXPO_PUBLIC_API_SERVER ' +
      `(currently "${base}").`,
    );
  }
  return base.replace(/\/+$/, '');
}

/**
 * Triggers a password-reset email. Server always returns 204 (no
 * enumeration), so this resolves on any non-network failure too.
 * Throws only on a hard network problem so the UI can show a real
 * "couldn't reach the api/" message.
 */
export async function requestStaffPasswordReset(email: string): Promise<void> {
  const res = await fetch(`${apiBase()}/v1/auth/staff/request-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  // 204 expected; any 2xx is fine. 4xx/5xx ignored — the server
  // suppresses errors on purpose to avoid leaking which addresses
  // are registered. The follow-up UI just says "if registered…".
  if (res.status >= 500) {
    throw new Error(`Server error (${res.status}). Try again in a moment.`);
  }
}

/**
 * Submits a reset token + new password. Returns the (sanitised)
 * server error message on a 4xx so the UI can distinguish
 * "token expired" from "password too weak". Network errors throw.
 */
export async function submitStaffPasswordReset(
  token: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const res = await fetch(`${apiBase()}/v1/auth/staff/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  if (res.status === 204) return { ok: true };
  if (res.status === 400) {
    // Server returns { message: "Password must be..." } or
    // { message: "invalid_token" } — pull message out for display.
    const body = await res.json().catch(() => ({}));
    const raw = body?.message ?? 'invalid_request';
    const reason =
      raw === 'invalid_token'
        ? 'This reset link has expired or is no longer valid. Request a new one.'
        : raw;
    return { ok: false, reason };
  }
  return { ok: false, reason: `Server error (${res.status}). Try again later.` };
}
