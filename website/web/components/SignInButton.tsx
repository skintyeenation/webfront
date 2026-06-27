'use client';

import { signIn, signOut } from 'next-auth/react';

// Microsoft (Entra/M365) sign-in/out. `signedIn` comes from the server (auth()),
// so no SessionProvider is needed.
export function SignInButton({ signedIn }: { signedIn: boolean }) {
  return signedIn ? (
    <button onClick={() => signOut()} className="text-ink/70 hover:text-primary">Sign out</button>
  ) : (
    <button onClick={() => signIn('microsoft-entra-id')} className="text-ink/70 hover:text-primary">Staff sign-in</button>
  );
}
