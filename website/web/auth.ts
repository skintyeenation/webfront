import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

// Microsoft Entra (M365) sign-in for the public site. Auth.js auto-reads the
// app-registration creds from env: AUTH_MICROSOFT_ENTRA_ID_ID / _SECRET /
// _ISSUER, plus AUTH_SECRET (see .env.example). Until those are set, sign-in is
// a no-op and the site stays fully public — getSession() returns null so the
// Onboarding link/CTA stay hidden. wp-admin SSO is handled separately (plan §6).
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [MicrosoftEntraID],
});
