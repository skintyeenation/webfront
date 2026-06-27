// Site auth (Microsoft Entra via NextAuth) is wired in the next phase — see
// docs/plan.md §6. Until then there's no session, so the onboarding link/CTA
// stay hidden for anonymous visitors. Swap this for `auth()` from the NextAuth
// config when Entra sign-in lands.
export interface Session {
  user: { name?: string; email?: string };
}

export async function getSession(): Promise<Session | null> {
  return null;
}

export const onboardingUrl = () => process.env.ONBOARDING_URL ?? '/onboarding';
