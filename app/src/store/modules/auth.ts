import { createAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Role } from 'skintyee/models';
import Config from 'skintyee/config';

// ----------------------------------------------------------------------------
// Microsoft Entra (Azure AD) sign-in for the Skin Tyee app.
//
// Per ADR-1 (auth provider) + ADR-14 (the homescreen needs sign-in to surface
// the user's Teams meetings + Planner items). Uses the OAuth 2.0 + PKCE flow
// via expo-auth-session — works on Web (popup → page redirect), iOS
// (ASWebAuthenticationSession), and Android (Custom Tabs).
//
// The Entra app `skintyee-app-signin` is a PUBLIC CLIENT — no client secret.
// PKCE protects the code → token exchange; the appId itself is public.
//
// Role derivation:
//   1. Anonymous (not signed in) → 'public'
//   2. Signed in:
//      a. Try api/'s /v1/admin/role-for/:upn — looks up BandMember.appRole
//         from the seeded directory in Postgres
//      b. Fall back to local rules if the api/ is unreachable:
//         admin@skintyeenation.onmicrosoft.com → admin
//         *@skintyee.ca → member
//         everyone else → public
// ----------------------------------------------------------------------------

// Required by expo-auth-session on web — closes the popup after redirect.
WebBrowser.maybeCompleteAuthSession();

// ---- Types ---------------------------------------------------------------

export interface SignedInUser {
  oid: string;          // Entra object id
  upn: string;          // userPrincipalName
  email?: string;
  name: string;
  given?: string;
  family?: string;
}

export interface AuthState {
  // Identity
  signedIn: boolean;
  user: SignedInUser | null;
  role: Role;
  // Tokens
  accessToken: string | null;
  idToken: string | null;
  expiresAt: number | null;          // ms epoch
  // UI
  name: string;
  status: 'idle' | 'signing-in' | 'error';
  error: string | null;
  // Gate bypass — true once the user has explicitly chosen a role via the
  // dev Role Switcher (we treat that as "user knows what they're doing,
  // let them in"). Real sign-in (signedIn=true) takes precedence over
  // this; bypassed is the dev-only escape hatch.
  bypassed: boolean;
}

export const authInitialState: AuthState = {
  signedIn: false,
  user: null,
  role: 'public',
  accessToken: null,
  idToken: null,
  expiresAt: null,
  name: 'Guest',
  status: 'idle',
  error: null,
  bypassed: false,
};

// ---- Helpers -------------------------------------------------------------

const microsoftDiscovery = (tenantId: string) => ({
  authorizationEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
  tokenEndpoint:         `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
});

// Pulls name/email/upn/oid from the ID token (a base64url-encoded JWT).
function parseIdToken(idToken: string): SignedInUser {
  const [, payloadB64] = idToken.split('.');
  // base64url → base64 + pad
  const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const payload = JSON.parse(
    typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8')
  );
  return {
    oid:   payload.oid ?? payload.sub,
    upn:   (payload.preferred_username ?? payload.upn ?? payload.email ?? '').toLowerCase(),
    email: payload.email ?? payload.preferred_username,
    name:  payload.name ?? `${payload.given_name ?? ''} ${payload.family_name ?? ''}`.trim(),
    given: payload.given_name,
    family: payload.family_name,
  };
}

// Local fallback when the api/'s role-for endpoint isn't reachable.
function deriveRoleLocally(user: SignedInUser): Role {
  const upn = user.upn.toLowerCase();
  if (upn === 'admin@skintyeenation.onmicrosoft.com') return 'admin';
  if (upn.endsWith('@skintyee.ca')) return 'member';
  return 'public';
}

// Hit the api/ to get the user's app-role (uses the seeded BandMember table).
async function fetchRoleFromApi(upn: string): Promise<Role | null> {
  if (!Config.apiServer || Config.apiServer === 'mock' || !/^https?:\/\//.test(Config.apiServer)) {
    return null;
  }
  try {
    const res = await fetch(
      `${Config.apiServer.replace(/\/+$/, '')}/v1/admin/role-for/${encodeURIComponent(upn)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { appRole?: Role };
    return body.appRole ?? null;
  } catch {
    return null;
  }
}

// ---- Actions -------------------------------------------------------------

export const setRole = createAction<Role>('set_role');        // dev-only override
export const signOut = createAction('sign_out');

// signIn — the OAuth flow. Returns the new auth state slice on success.
// On native + Expo Go this opens a system browser; on web it opens a popup
// (or full-page redirect, depending on the configured redirectUri).
export const signIn = createAsyncThunk<
  { tokens: { accessToken: string; idToken: string; expiresAt: number }; user: SignedInUser; role: Role },
  void,
  { rejectValue: string }
>('sign_in', async (_, { rejectWithValue }) => {
  if (!Config.signinAppId || !Config.signinTenantId) {
    return rejectWithValue('Microsoft sign-in is not configured (missing appId or tenantId).');
  }

  const discovery = microsoftDiscovery(Config.signinTenantId);

  // makeRedirectUri picks the right URI per platform:
  //   Web build:        the current page URL
  //   Native (deep link): ca.skintyee.app:// (matches scheme in app.config.js)
  //   Expo Go:          the expo-proxy URL
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'ca.skintyee.app' });

  // Construct the auth request: PKCE-enabled by default in expo-auth-session.
  const request = new AuthSession.AuthRequest({
    clientId: Config.signinAppId,
    redirectUri,
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
    prompt: AuthSession.Prompt.SelectAccount,  // forces account picker
  });

  // Prompt the user — opens the browser.
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') {
    return rejectWithValue(
      result.type === 'cancel' ? 'Sign-in cancelled.' :
      result.type === 'error' ? (result.error?.message ?? 'Sign-in failed.') :
      `Sign-in returned: ${result.type}`
    );
  }

  // Exchange the auth code for tokens (the code verifier was stored on the
  // AuthRequest object by promptAsync).
  const tokenResp = await AuthSession.exchangeCodeAsync(
    {
      clientId: Config.signinAppId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery
  );

  const accessToken = tokenResp.accessToken;
  const idToken     = (tokenResp as any).idToken as string | undefined;
  if (!idToken) {
    return rejectWithValue('Sign-in succeeded but no ID token was returned.');
  }
  const expiresAt = Date.now() + ((tokenResp.expiresIn ?? 3600) * 1000);

  const user = parseIdToken(idToken);

  // Derive role: try api/, fall back to local rule.
  const role = (await fetchRoleFromApi(user.upn)) ?? deriveRoleLocally(user);

  return {
    tokens: { accessToken, idToken, expiresAt },
    user,
    role,
  };
});

// ---- Slice ---------------------------------------------------------------

const authSlice = createSlice({
  name: 'auth',
  initialState: authInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(setRole, (state, action) => {
      // Dev-only override (Account screen Role Switcher). Real auth comes
      // through signIn; this stays for testing role-gated UI. Setting any
      // role via this action also flips `bypassed: true` so the sign-in
      // gate lets the user past — they've explicitly chosen access.
      const nameByRole: Record<Role, string> = {
        admin: 'Admin (spoofed)',
        staff: 'Staff (spoofed)',
        member: 'Member (spoofed)',
        public: 'Guest (public)',
      };
      return {
        ...state,
        role: action.payload,
        bypassed: true,
        name: nameByRole[action.payload],
      };
    });

    builder.addCase(signOut, () => ({
      ...authInitialState,
    }));

    builder.addCase(signIn.pending, (state) => ({
      ...state, status: 'signing-in', error: null,
    }));

    builder.addCase(signIn.fulfilled, (state, action) => ({
      ...state,
      signedIn: true,
      user: action.payload.user,
      role: action.payload.role,
      name: action.payload.user.name || action.payload.user.upn,
      accessToken: action.payload.tokens.accessToken,
      idToken: action.payload.tokens.idToken,
      expiresAt: action.payload.tokens.expiresAt,
      status: 'idle',
      error: null,
    }));

    builder.addCase(signIn.rejected, (state, action) => ({
      ...state,
      status: 'error',
      error: action.payload ?? 'Sign-in failed.',
    }));
  },
});

export default authSlice.reducer;
