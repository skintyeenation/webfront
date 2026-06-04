import { Platform } from 'react-native';
import { createAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
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

// On NATIVE this closes the in-app browser after auth redirects back.
// On WEB we use full-page redirect instead (see signIn below), so this
// is a no-op there.
if (Platform.OS !== 'web') {
  WebBrowser.maybeCompleteAuthSession();
}

// ----------------------------------------------------------------------------
// PKCE helpers (web full-page redirect needs to persist the code_verifier
// across the redirect via sessionStorage; native keeps it in-memory in the
// AuthRequest object).
// ----------------------------------------------------------------------------

const PKCE_VERIFIER_KEY = 'skintyee.pkce.codeVerifier';
const PKCE_STATE_KEY    = 'skintyee.pkce.state';

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let out = '';
  const bytes = new Uint8Array(length);
  // crypto.getRandomValues is in modern browsers + Hermes/RN-web
  (globalThis as any).crypto?.getRandomValues?.(bytes);
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function sha256base64url(input: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  // base64 → base64url
  return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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
  /**
   * The signed-in user's canonical role (their BandMember.appRole at
   * sign-in time). Stays put when the dev Role Switcher overrides
   * `role`, so the Account screen can offer an "Unspoof — reset to
   * <canonical>" button to revert. Null until a real signIn lands.
   */
  canonicalRole: Role | null;
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
  canonicalRole: null,
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

// Unspoof — revert role to the signed-in user's canonical role and
// re-fetch from the api/ so any People-based bump (timesheetsEnabled
// → staff) is picked up. We deliberately DO NOT short-circuit on a
// cached `canonicalRole`: it may be stale relative to People-table
// changes that happened after the last sign-in. Cached value is only
// used as a fallback when the network call fails.
export const unspoof = createAsyncThunk<
  { role: Role; name: string } | null,
  void,
  { state: any; rejectValue: string }
>(
  'auth/unspoof',
  async (_, { getState, rejectWithValue }) => {
    const s = (getState() as any).auth as AuthState;
    if (!s.user?.upn) return rejectWithValue('No signed-in user — nothing to unspoof.');
    const fetched = await fetchRoleFromApi(s.user.upn);
    const role: Role = fetched ?? s.canonicalRole ?? deriveRoleLocally(s.user);
    return { role, name: s.user.name || s.user.upn };
  },
);
export const signOut = createAction('sign_out');
// resetSignInStatus — clears the in-flight 'signing-in' status + any error.
// Used when the user wants to retry after closing the Microsoft popup
// (which on web doesn't always trigger a 'dismiss' result, leaving the
// thunk pending forever otherwise).
export const resetSignInStatus = createAction('reset_sign_in_status');

// ----------------------------------------------------------------------------
// signIn — platform-appropriate Microsoft Entra OAuth flow.
//
//   • WEB:  full-page redirect (this thunk navigates away; the user is
//           taken to Microsoft, then redirected back to the app at /?code=…
//           which is detected at startup by handleAuthCallback).
//           No popup, no parent/child window dance, no
//           maybeCompleteAuthSession needed.
//
//   • NATIVE: AuthRequest + in-app browser via expo-auth-session
//           (ASWebAuthenticationSession on iOS, Custom Tabs on Android).
//           The user stays in the app the whole time — no leaving the app.
//
// Both flows use OAuth Authorization Code + PKCE — no client secret.
// ----------------------------------------------------------------------------

export const signIn = createAsyncThunk<
  { tokens: { accessToken: string; idToken: string; expiresAt: number }; user: SignedInUser; role: Role } | null,
  void,
  { rejectValue: string }
>('sign_in', async (_, { rejectWithValue }) => {
  if (!Config.signinAppId || !Config.signinTenantId) {
    return rejectWithValue('Microsoft sign-in is not configured (missing appId or tenantId).');
  }

  if (Platform.OS === 'web') {
    // ---- WEB: full-page redirect to Microsoft -----------------------------
    // 1. Generate PKCE code verifier + challenge + state
    // 2. Persist verifier + state in sessionStorage (survives the redirect)
    // 3. Build the authorize URL and navigate the whole window there
    // The thunk returns null here; the actual fulfillment happens after the
    // user is redirected back and handleAuthCallback exchanges the code.
    const codeVerifier  = randomString(64);
    const codeChallenge = await sha256base64url(codeVerifier);
    const state         = randomString(16);

    sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(PKCE_STATE_KEY,    state);

    const redirectUri = window.location.origin + '/';
    const authUrl = new URL(`https://login.microsoftonline.com/${Config.signinTenantId}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id',             Config.signinAppId);
    authUrl.searchParams.set('response_type',         'code');
    authUrl.searchParams.set('redirect_uri',          redirectUri);
    authUrl.searchParams.set('response_mode',         'query');
    authUrl.searchParams.set('scope',                 'openid profile email User.Read Calendars.ReadWrite Group.ReadWrite.All');
    authUrl.searchParams.set('state',                 state);
    authUrl.searchParams.set('code_challenge',        codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('prompt',                'select_account');

    // Navigate away — user goes to Microsoft.
    window.location.assign(authUrl.toString());

    // Return null — the post-redirect handler will dispatch a fresh
    // success state once the user comes back.
    return null;
  }

  // ---- NATIVE: in-app browser via AuthRequest ---------------------------
  const discovery = microsoftDiscovery(Config.signinTenantId);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'ca.skintyee.app' });

  const request = new AuthSession.AuthRequest({
    clientId: Config.signinAppId,
    redirectUri,
    scopes: ['openid', 'profile', 'email', 'User.Read', 'Calendars.ReadWrite', 'Group.ReadWrite.All'],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
    prompt: AuthSession.Prompt.SelectAccount,
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') {
    return rejectWithValue(
      result.type === 'cancel' ? 'Sign-in cancelled.' :
      result.type === 'error' ? (result.error?.message ?? 'Sign-in failed.') :
      `Sign-in returned: ${result.type}`
    );
  }

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
  const role = (await fetchRoleFromApi(user.upn)) ?? deriveRoleLocally(user);

  return {
    tokens: { accessToken, idToken, expiresAt },
    user,
    role,
  };
});

// ----------------------------------------------------------------------------
// handleAuthCallback (WEB ONLY) — runs at app startup. If the current URL has
// a `code` query param, exchange it for tokens, then strip the param from the
// address bar. Called from main.tsx before the store initializes.
//
// Returns the same shape as signIn.fulfilled on success, or null if there's
// nothing to handle (no code in URL).
// ----------------------------------------------------------------------------

export const handleAuthCallback = createAsyncThunk<
  { tokens: { accessToken: string; idToken: string; expiresAt: number }; user: SignedInUser; role: Role } | null,
  void,
  { rejectValue: string }
>('handle_auth_callback', async (_, { rejectWithValue }) => {
  if (Platform.OS !== 'web') return null;
  const search = new URLSearchParams(window.location.search);
  const code  = search.get('code');
  const state = search.get('state');
  const err   = search.get('error');
  const errDesc = search.get('error_description');

  if (err) {
    // Strip the error from the URL so a refresh doesn't repeat it.
    history.replaceState({}, '', window.location.pathname);
    return rejectWithValue(`${err}: ${errDesc ?? '(no description)'}`);
  }
  if (!code) return null;

  const codeVerifier  = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(PKCE_STATE_KEY);
  // Clean up storage + URL early so we don't double-redeem.
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
  history.replaceState({}, '', window.location.pathname);

  if (!codeVerifier) {
    return rejectWithValue('Missing PKCE code verifier (sign-in may have been started in a different tab).');
  }
  if (state && expectedState && state !== expectedState) {
    return rejectWithValue('State mismatch — possible cross-site request forgery.');
  }

  const redirectUri = window.location.origin + '/';
  const body = new URLSearchParams({
    client_id:     Config.signinAppId,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    code_verifier: codeVerifier,
    scope:         'openid profile email User.Read Calendars.ReadWrite Group.ReadWrite.All',
  });
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${Config.signinTenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  );
  if (!tokenRes.ok) {
    return rejectWithValue(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const data = await tokenRes.json();
  const accessToken: string | undefined = data.access_token;
  const idToken:     string | undefined = data.id_token;
  if (!idToken || !accessToken) {
    return rejectWithValue('Token response missing access_token or id_token.');
  }
  const expiresAt = Date.now() + ((data.expires_in ?? 3600) * 1000);
  const user = parseIdToken(idToken);
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
      // through signIn; this stays for testing role-gated UI.
      //
      // Two cases:
      //   1. Reverting to the signed-in user's canonical role — restore
      //      their real name from `state.user` and DON'T label them
      //      "(spoofed)". This is the "untap to unspoof" path.
      //   2. Spoofing to a different role — flip `bypassed: true` so
      //      the sign-in gate lets them past, label name as "(spoofed)"
      //      so the header avatar / "name" surface visually flags it.
      const newRole = action.payload;
      const isRevertToCanonical =
        state.signedIn && !!state.canonicalRole && newRole === state.canonicalRole;
      if (isRevertToCanonical) {
        return {
          ...state,
          role: newRole,
          // Drop the "(spoofed)" label; restore the real signed-in name.
          name: state.user?.name || state.user?.upn || state.name,
        };
      }
      const nameByRole: Record<Role, string> = {
        admin: 'Admin (spoofed)',
        staff: 'Staff (spoofed)',
        member: 'Member (spoofed)',
        public: 'Guest (public)',
      };
      return {
        ...state,
        role: newRole,
        bypassed: true,
        name: nameByRole[newRole],
      };
    });

    builder.addCase(signOut, () => ({
      ...authInitialState,
    }));

    builder.addCase(resetSignInStatus, (state) => ({
      ...state, status: 'idle', error: null,
    }));

    builder.addCase(signIn.pending, (state) => ({
      ...state, status: 'signing-in', error: null,
    }));

    builder.addCase(signIn.fulfilled, (state, action) => ({
      ...state,
      signedIn: true,
      user: action.payload.user,
      role: action.payload.role,
      // Pin the canonical role so the Account screen can offer
      // "Unspoof — reset to <canonical>" after a dev role override.
      canonicalRole: action.payload.role,
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

    // handleAuthCallback — same shape as signIn outcomes, called at app
    // boot to complete the WEB redirect flow.
    builder.addCase(handleAuthCallback.pending, (state) => ({
      ...state, status: 'signing-in',
    }));
    builder.addCase(handleAuthCallback.fulfilled, (state, action) => {
      if (!action.payload) return state;  // no-op (no code in URL)
      return {
        ...state,
        signedIn: true,
        user: action.payload.user,
        role: action.payload.role,
        canonicalRole: action.payload.role,
        name: action.payload.user.name || action.payload.user.upn,
        accessToken: action.payload.tokens.accessToken,
        idToken: action.payload.tokens.idToken,
        expiresAt: action.payload.tokens.expiresAt,
        status: 'idle',
        error: null,
      };
    });
    builder.addCase(handleAuthCallback.rejected, (state, action) => ({
      ...state,
      status: 'error',
      error: action.payload ?? 'Sign-in callback failed.',
    }));

    // Unspoof — drops the (spoofed) label and applies the freshly
    // resolved canonical role. Also back-fills state.canonicalRole so
    // future toggles take the fast path through setRole's revert branch.
    builder.addCase(unspoof.fulfilled, (state, action) => {
      if (!action.payload) return state;
      return {
        ...state,
        role: action.payload.role,
        canonicalRole: action.payload.role,
        name: action.payload.name,
      };
    });
  },
});

export default authSlice.reducer;
