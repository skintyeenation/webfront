import { auth } from '@/auth';

// Thin wrapper over NextAuth's session. Guarded so an unconfigured/missing Entra
// setup degrades to "signed out" rather than crashing every page. Entra creds +
// AUTH_SECRET enable real sign-in (see .env.example); until then this is null.
export interface Session {
  user: { name?: string; email?: string };
}

export async function getSession(): Promise<Session | null> {
  try {
    const session = await auth();
    if (!session?.user) return null;
    return {
      user: {
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
      },
    };
  } catch {
    return null;
  }
}

export const onboardingUrl = () => process.env.ONBOARDING_URL ?? '/onboarding';
