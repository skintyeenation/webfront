// Admin Microsoft Graph calls made directly from the app with the signed-in
// admin's DELEGATED token (acquired via the Entra MSAL sign-in — see
// store/modules/auth.ts). Delegated = Graph enforces the caller's own role, so
// only real admins can reset passwords; everyone else is denied by Graph.
//
// This is the "Route B (MSAL)" admin password reset from
// docs/365/password-reset-sspr.md. Unlike the app-only api/ credential (which
// can't write back for synced users), the admin SSPR reset routes through
// password writeback and lands on the on-prem STFN.local account.

// Well-known id of the password authentication method (constant for every user).
const PASSWORD_METHOD_ID = '28c10230-6103-485e-b985-444c60001490';
const GRAPH = 'https://graph.microsoft.com/v1.0';

function rand(max: number): number {
  const g = (globalThis as any).crypto;
  if (g?.getRandomValues) {
    const a = new Uint32Array(1);
    g.getRandomValues(a);
    return a[0] % max;
  }
  return Math.floor(Math.random() * max);
}

// A 16-char temp password meeting Entra + on-prem AD complexity (one of each
// class, no ambiguous chars). The user changes it at next sign-in anyway.
function generateTempPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%^&*-_=+'];
  const all = sets.join('');
  const chars = sets.map((s) => s[rand(s.length)]); // guarantee one from each class
  while (chars.length < 16) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Admin-reset a user's password to a Microsoft-generated temporary value.
 * Returns the temp password (shown once). Polls the long-running operation so
 * we only return after the reset has actually committed (incl. writeback).
 *
 * @param userId  the user's Entra object id (BandMember._id)
 * @param accessToken  the signed-in admin's delegated Graph token (auth.accessToken)
 */
export async function adminResetPassword(userId: string, accessToken: string): Promise<string> {
  // Synced (on-prem) users REQUIRE us to submit the new password — Graph won't
  // auto-generate one for them ("A new password must be submitted for users
  // whose passwords are synced to on-premises Active Directory"). So we always
  // generate + submit one and return that exact value.
  const newPassword = generateTempPassword();
  const url = `${GRAPH}/users/${encodeURIComponent(userId)}/authentication/methods/${PASSWORD_METHOD_ID}/resetPassword`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 403) {
      throw new Error(
        'Microsoft Graph denied the reset. Your signed-in account needs an admin role ' +
        '(Authentication / Privileged Authentication Administrator) with MFA. ' + text,
      );
    }
    throw new Error(`Graph resetPassword ${res.status}: ${text}`);
  }

  // Poll the long-running operation to confirm it committed (writeback to STFN.local).
  const loc = res.headers.get('Location');
  if (loc) {
    const opUrl = loc.startsWith('http') ? loc : `${GRAPH}${loc}`;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const op = await fetch(opUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!op.ok) continue;
      const status = (await op.json().catch(() => ({})))?.status;
      if (status === 'succeeded') break;
      if (status === 'failed') throw new Error('The reset operation failed during writeback to on-prem AD.');
    }
  }
  return newPassword;
}
