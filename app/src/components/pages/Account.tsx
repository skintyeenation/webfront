import React, { useEffect, useState } from 'react';
import { Image, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { Avatar, Button, Card, Chip, Divider, HelperText, Switch, Text, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import * as WebBrowser from 'expo-web-browser';
import { PageContainer, PageContent } from 'skintyee/components/layout';

// Microsoft self-service password reset (SSPR). Opens in an in-app browser
// tab — the right surface for the MS auth flow (a raw WebView gets blocked).
// Works even when locked out / forgotten, and (writeback is enabled) the new
// password lands on the on-prem STFN.local account. See docs/365/password-reset-sspr.md.
const SSPR_URL = 'https://aka.ms/sspr';
const openPasswordReset = () => WebBrowser.openBrowserAsync(SSPR_URL);
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { resetSignInStatus, setRole, signIn, signInStaff, signOut, unspoof } from 'skintyee/store/modules/auth';
import { requestStaffPasswordReset, submitStaffPasswordReset } from 'skintyee/services/staffAuth';
import { Role } from 'skintyee/models';
import Config from 'skintyee/config';
import { theme } from 'skintyee/styles';

// Derive 2-letter initials from a display name. "Lucas Lopatka" → "LL",
// "System Admin" → "SA", "Madonna" → "M". Falls back to '?'.
// Single label / value row used in the Member details card. Hides
// itself when the value is missing so the card doesn't show empty rows.
function MemberDetailRow({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
      <MaterialCommunityIcons name={icon as any} size={16} color={theme.colors.textDarker} style={{ marginRight: 8, marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 10, letterSpacing: 1 }}>{label.toUpperCase()}</Text>
        <Text style={{ color: theme.colors.text, fontSize: 13 }}>{value}</Text>
      </View>
    </View>
  );
}

function initialsOf(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Security-group slug → label (mirrors MemberDetail's chip labels).
const GROUP_LABELS: Record<string, string> = {
  'public': 'Public', 'band-members': 'Band Members', 'contractors': 'Contractors',
  'chief': 'Chief', 'council': 'Council', 'band-manager': 'Band Manager',
  'management': 'Management', 'admins': 'Admins', 'system-admin': 'System Admin',
  'it': 'IT', 'finance': 'Finance', 'forestry': 'Forestry',
  'land-resources': 'Land Resources', 'housing': 'Housing', 'fire-chief': 'Fire Chief',
  'it-project-docs': 'IT Project Docs', 'band-members-m365': 'Band Members (M365)',
  'council-m365': 'Council (M365)', 'management-m365': 'Management (M365)',
};

// Build the api/ photo proxy URL when we have a real (non-mock) backend.
function photoUrl(memberId: string): string | undefined {
  if (!Config.apiServer || Config.apiServer === 'mock' || !/^https?:\/\//.test(Config.apiServer)) {
    return undefined;
  }
  return `${Config.apiServer.replace(/\/+$/, '')}/v1/directory/${memberId}/photo`;
}

const ROLES: { role: Role; label: string; desc: string }[] = [
  { role: 'public', label: 'Public', desc: 'Anyone — events & public records only' },
  { role: 'member', label: 'Band Member', desc: 'Members — meetings, directory, voting' },
  { role: 'staff', label: 'Staff (worker)', desc: 'Members + submit your own timesheets' },
  { role: 'admin', label: 'Admin', desc: 'Everything + time approvals & records' },
];

/**
 * Account screen.
 *
 * Real auth via Microsoft Entra (skintyee-app-signin app). When signed in:
 * shows the user's profile + role badge + sign-out button. When NOT signed
 * in: shows the "Sign in with Microsoft" button + the dev role switcher
 * underneath (for testing role-gated UI without going through real sign-in).
 */

// Staff (email + password) sign-in card. Surfaces below the Microsoft
// button on the signed-out Account screen. Calls /v1/auth/staff/login
// via the signInStaff thunk, which lands a JWT in auth.accessToken so
// HttpApiService sends it as Authorization: Bearer on subsequent calls.
// See docs/features/staff-auth.md for the design + locked decisions.
//
// Submit + error state is owned LOCALLY (not via auth.status / auth.error)
// so clicking Sign in here doesn't fire the Microsoft card's spinner —
// the two paths share the auth slice's signedIn/role landing but not
// the in-flight UI.
// Detect a ?reset-token=... query on web boot so the reset-password
// link from the forgot-password email lands the user directly in the
// reset panel (instead of the sign-in form). Returns the token if
// present, null otherwise. Cleared from the URL on consumption so a
// refresh doesn't re-open the reset panel.
function pickResetTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const u = new URL(window.location.href);
    const t = u.searchParams.get('reset-token');
    if (!t) return null;
    u.searchParams.delete('reset-token');
    window.history.replaceState({}, '', u.toString());
    return t;
  } catch {
    return null;
  }
}

function StaffSignInCard() {
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  // Three panels — one card, three states:
  //   'signin'   — default (email + password form)
  //   'forgot'   — email-only forgot-password form (after "Forgot password?")
  //   'reset'    — set a new password via reset token (link from email)
  // 'reset' auto-opens on mount if URL has a ?reset-token query param.
  const [panel, setPanel] = useState<'signin' | 'forgot' | 'reset'>('signin');
  const [resetToken, setResetToken] = useState<string | null>(null);
  useEffect(() => {
    const t = pickResetTokenFromUrl();
    if (t) {
      setResetToken(t);
      setPanel('reset');
    }
  }, []);

  // ---- Forgot panel state -----------------------------------------
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // ---- Reset panel state ------------------------------------------
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const result = await dispatch(signInStaff({ email, password }));
      if (signInStaff.rejected.match(result)) {
        setLocalError((result.payload as string) ?? 'Sign-in failed.');
      }
      // Success path: auth.signedIn flips in the slice reducer, the
      // Account screen re-renders into its signed-in branch and this
      // component unmounts — no need to clear state here.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: theme.colors.primary }}>
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <MaterialCommunityIcons name="email-outline" size={22} color={theme.colors.primary} style={{ marginRight: 8 }} />
          <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>
            {panel === 'forgot' ? 'Reset your password'
             : panel === 'reset' ? 'Set a new password'
             : 'Sign in with email'}
          </Text>
        </View>

        {panel === 'signin' ? (
          <>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 12 }}>
              For staff and contractors who don't have a Skin Tyee Microsoft 365
              account. An admin must have created your account first.
            </Text>
            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              mode="outlined"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword((p) => !p)}
                  forceTextInputFocus={false}
                />
              }
              onSubmitEditing={onSubmit}
              style={{ marginBottom: 4 }}
            />
            <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 4 }}>
              8+ characters, mix of upper, lower, digit, symbol.
            </HelperText>
            <Button
              mode="contained"
              icon="login"
              disabled={!canSubmit}
              onPress={onSubmit}
              loading={submitting}
              textColor="#FFFFFF"
              // Match the "Sign in with Microsoft" button — regular
              // weight, not Paper's bold default for short labels.
              labelStyle={{ fontWeight: '400' }}
              style={{ marginTop: 6 }}
            >
              Sign in
            </Button>
            {localError ? (
              <Text style={{ color: theme.colors.accent, fontSize: 12, marginTop: 8 }}>
                {localError}
              </Text>
            ) : null}
            <Button
              mode="text"
              compact
              textColor={theme.colors.textDarker}
              onPress={() => {
                // Pre-fill the forgot-email field if the user already typed
                // an address in the sign-in form — saves a re-type.
                setForgotEmail(email);
                setForgotError(null);
                setForgotSent(false);
                setPanel('forgot');
              }}
              style={{ alignSelf: 'flex-start', marginTop: 6 }}
            >
              Forgot password?
            </Button>
          </>
        ) : null}

        {panel === 'forgot' ? (
          forgotSent ? (
            <>
              <Text style={{ color: theme.colors.text, fontSize: 13, marginTop: 4, marginBottom: 12 }}>
                If <Text style={{ color: theme.colors.primary }}>{forgotEmail}</Text> is registered
                for app sign-in, a reset link is on its way. The link
                is valid for 1 hour.
              </Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 12 }}>
                Didn't get it after a few minutes? Check spam, or ask
                an admin to issue a new password directly.
              </Text>
              <Button
                mode="outlined"
                textColor={theme.colors.text}
                onPress={() => { setPanel('signin'); setForgotSent(false); }}
                style={{ alignSelf: 'flex-start', borderColor: theme.colors.defaultBorder }}
              >
                Back to sign in
              </Button>
            </>
          ) : (
            <>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 12 }}>
                Enter the email address for your app account. We'll send
                you a one-hour reset link.
              </Text>
              <TextInput
                label="Email"
                value={forgotEmail}
                onChangeText={setForgotEmail}
                mode="outlined"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={{ marginBottom: 8 }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                <Button
                  mode="contained"
                  icon="email-send"
                  disabled={forgotSubmitting || forgotEmail.trim().length === 0}
                  loading={forgotSubmitting}
                  textColor="#FFFFFF"
                  labelStyle={{ fontWeight: '400' }}
                  style={{ marginRight: 8 }}
                  onPress={async () => {
                    setForgotSubmitting(true);
                    setForgotError(null);
                    try {
                      await requestStaffPasswordReset(forgotEmail);
                      setForgotSent(true);
                    } catch (e: any) {
                      setForgotError(e?.message ?? String(e));
                    } finally {
                      setForgotSubmitting(false);
                    }
                  }}
                >
                  Send reset link
                </Button>
                <Button
                  mode="text"
                  textColor={theme.colors.textDarker}
                  onPress={() => setPanel('signin')}
                >
                  Cancel
                </Button>
              </View>
              {forgotError ? (
                <Text style={{ color: theme.colors.accent, fontSize: 12, marginTop: 8 }}>
                  {forgotError}
                </Text>
              ) : null}
            </>
          )
        ) : null}

        {panel === 'reset' ? (
          resetDone ? (
            <>
              <Text style={{ color: theme.colors.text, fontSize: 13, marginTop: 4, marginBottom: 12 }}>
                ✓ Password updated. You can sign in with your new
                password now.
              </Text>
              <Button
                mode="contained"
                icon="login"
                textColor="#FFFFFF"
                labelStyle={{ fontWeight: '400' }}
                onPress={() => {
                  setPanel('signin');
                  setResetDone(false);
                  setResetToken(null);
                  setNewPassword('');
                }}
                style={{ alignSelf: 'flex-start' }}
              >
                Sign in
              </Button>
            </>
          ) : (
            <>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 12 }}>
                Choose a new password. The reset link you clicked
                stays valid for 1 hour from when it was sent.
              </Text>
              <TextInput
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                mode="outlined"
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
                right={
                  <TextInput.Icon
                    icon={showNewPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowNewPassword((p) => !p)}
                    forceTextInputFocus={false}
                  />
                }
                style={{ marginBottom: 4 }}
              />
              <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 4 }}>
                8+ characters, mix of upper, lower, digit, symbol.
              </HelperText>
              <Button
                mode="contained"
                icon="lock-reset"
                disabled={resetSubmitting || !resetToken || newPassword.length < 8}
                loading={resetSubmitting}
                textColor="#FFFFFF"
                labelStyle={{ fontWeight: '400' }}
                onPress={async () => {
                  if (!resetToken) return;
                  setResetSubmitting(true);
                  setResetError(null);
                  const r = await submitStaffPasswordReset(resetToken, newPassword);
                  setResetSubmitting(false);
                  if (r.ok === true) {
                    setResetDone(true);
                  } else {
                    setResetError(r.reason);
                  }
                }}
                style={{ marginTop: 6 }}
              >
                Set new password
              </Button>
              {resetError ? (
                <Text style={{ color: theme.colors.accent, fontSize: 12, marginTop: 8 }}>
                  {resetError}
                </Text>
              ) : null}
            </>
          )
        ) : null}
      </Card.Content>
    </Card>
  );
}

export default function Account({ navigation }: { navigation?: any } = {}) {
  const dispatch = useAppDispatch();
  const { role, canonicalRole, name, signedIn, user, status, error } = useAppSelector((s) => s.auth);

  // Always refresh the role from the api/ when the Account screen
  // mounts (signed-in only). Catches the case where the cached auth
  // state predates a server-side change (e.g. People → role bump,
  // BandMember.appRole patch, security-group rotation). Result lands
  // through unspoof.fulfilled which also back-fills canonicalRole.
  useEffect(() => {
    if (signedIn) dispatch(unspoof());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);
  // The role-switcher is dev-only "spoof". A user is "spoofed" if either:
  //   - canonicalRole is known and role !== canonicalRole, OR
  //   - canonicalRole is unknown (persisted state predates the field)
  //     BUT the displayed name is one of the synthetic "(spoofed)"
  //     labels setRole writes. We fall back to unspoof() which refetches
  //     the canonical role from the api/ so the user can still revert.
  const nameLooksSpoofed = signedIn && typeof name === 'string' && / \(spoofed\)$/.test(name);
  const isSpoofed = !!signedIn && (
    (canonicalRole && role !== canonicalRole) || (!canonicalRole && nameLooksSpoofed)
  );
  const directory = useAppSelector((s) => s.directory.entities);
  const isAdmin = role === 'admin';
  const isSigningIn = status === 'signing-in';
  // Dev-only: the advanced role switcher is hidden behind a toggle.
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);

  // Match the signed-in user against the directory to pick up hasPhoto +
  // the member id needed by the photo proxy. Falls through if the user
  // isn't synced yet — initials still render fine without it.
  const myUpn = (user?.upn ?? '').toLowerCase();
  const me = myUpn
    ? (directory as any[]).find((m) => (m.upn ?? '').toLowerCase() === myUpn)
    : undefined;
  const photoSrc = me?.hasPhoto ? photoUrl(me._id) : undefined;
  const ini = initialsOf(name);
  const hasName = !!(name && name.trim() && ini !== '?');

  return (
    <PageContainer>
      <PageContent>
        {/* Header: avatar + name + role chip ----------------------------- */}
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <View style={{ position: 'relative', width: 72, height: 72 }}>
            {/* Avatar cascade:
                1. NOT signed in → Skin Tyee mark (replaces the placeholder
                   "G" initial — guest state owns the brand mark)
                2. real M365 profile photo (signed in + directory says hasPhoto)
                3. initials over the brand background (whenever we have a name)
                4. generic person icon (only when truly nothing — signed in
                   but no name + no photo, e.g. mid-spoof of a public role) */}
            {!signedIn ? (
              <Image
                source={require('../../../assets/skintyee-logo.png')}
                resizeMode="contain"
                style={{ width: 72, height: 72 }}
                accessibilityLabel="Skin Tyee logo"
              />
            ) : photoSrc ? (
              <Avatar.Image
                size={72}
                source={{ uri: photoSrc }}
              />
            ) : hasName ? (
              <Avatar.Text
                size={72}
                label={ini}
                color="#000"
                style={{ backgroundColor: theme.colors.primary }}
                labelStyle={{ fontSize: 28, fontWeight: '600' }}
              />
            ) : (
              <Avatar.Icon
                size={72}
                icon="account-check"
                style={{ backgroundColor: theme.colors.primary }}
              />
            )}
            {signedIn ? (
              <View
                style={{
                  position: 'absolute',
                  right: -2, bottom: -2,
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: isAdmin ? theme.colors.accent : theme.colors.success,
                  borderWidth: 2, borderColor: theme.colors.background,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons
                  name={isAdmin ? 'shield-account' : 'check'}
                  size={16}
                  color={isAdmin ? '#000' : '#000'}
                />
              </View>
            ) : null}
          </View>

          <Text style={{ color: theme.colors.text, fontSize: 18, marginTop: 10 }}>{name}</Text>

          {/* Role chip carries a tappable refresh icon — re-fetches
              /v1/admin/role-for/:upn through the unspoof thunk so any
              server-side change picks up without a separate button.
              Words are uppercased (ROLE: STAFF) to match the rest of
              the in-chip typography. */}
          {/* Same chip row as the Member page — role badge first (orange when
              admin), then title + Entra P1. Role chip stays tappable to
              refresh (unspoof). */}
          <View style={{ flexDirection: 'row', marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {!signedIn ? (
              <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ fontSize: 11 }}>
                NOT SIGNED IN
              </Chip>
            ) : (
              <>
                {role && role !== 'public' ? (
                  <Chip compact icon="shield-account"
                    onPress={() => dispatch(unspoof())}
                    style={{ marginRight: 6, marginBottom: 4, backgroundColor: isAdmin ? theme.colors.accent : theme.colors.secondary }}
                    textStyle={{ fontSize: 11, color: isAdmin ? '#000' : theme.colors.text }}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Chip>
                ) : null}
                {me?.title ? (
                  <Chip compact icon="briefcase-outline" style={{ marginRight: 6, marginBottom: 4, backgroundColor: theme.colors.secondary }} textStyle={{ fontSize: 11 }}>
                    {me.title}
                  </Chip>
                ) : null}
              </>
            )}
          </View>
        </View>

        {/* My profile — same card layout as the Member-detail page, for the
            signed-in user's own directory record. */}
        {signedIn && me ? (
          <>
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
              <Card.Content>
                <MemberDetailRow icon="email-outline"      label="Email"      value={me.email ?? user?.upn} />
                <MemberDetailRow icon="at"                 label="UPN"        value={me.upn ?? user?.upn} />
                <MemberDetailRow icon="phone-outline"      label="Phone"      value={me.phone} />
                <MemberDetailRow icon="briefcase-outline"  label="Title"      value={me.title} />
                <MemberDetailRow icon="domain"             label="Department" value={me.department} />
                <MemberDetailRow icon="account-key-outline" label="Account type"
                  value={me.accountType === 'shared-inbox' ? 'Shared inbox' : 'Licensed user'} />
              </Card.Content>
            </Card>

            {(me.licenses?.length ?? 0) > 0 ? (
              <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
                <Card.Content>
                  <Text style={{ color: theme.colors.text, fontSize: 14, marginBottom: 8 }}>Microsoft licences</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {(me.licenses as string[]).map((p) => {
                      const paid = p === 'AAD_PREMIUM';
                      const label = paid ? 'Entra ID P1'
                        : p === 'O365_BUSINESS_PREMIUM' ? 'Microsoft 365 Business Standard'
                        : p;
                      return (
                        <Chip key={p} compact icon={paid ? 'star-circle' : 'microsoft-office'}
                          style={{ marginRight: 4, marginTop: 2, backgroundColor: theme.colors.secondary }}
                          textStyle={{ fontSize: 11, color: theme.colors.text }}>
                          {label}
                        </Chip>
                      );
                    })}
                  </View>
                </Card.Content>
              </Card>
            ) : null}

            {(me.bandGroups?.length ?? 0) > 0 ? (
              <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
                <Card.Content>
                  <Text style={{ color: theme.colors.text, fontSize: 14, marginBottom: 8 }}>Group memberships</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {(me.bandGroups as string[]).map((slug) => (
                      <Chip key={slug} compact icon="shield-account"
                        style={{ marginRight: 4, marginTop: 2, backgroundColor: theme.colors.secondary }}
                        textStyle={{ fontSize: 11 }}>
                        {GROUP_LABELS[slug] ?? slug}
                      </Chip>
                    ))}
                  </View>
                </Card.Content>
              </Card>
            ) : null}
          </>
        ) : null}

        {/* Sign-in / sign-out -------------------------------------------- */}
        {!signedIn ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#0078D4' }}>
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <MaterialCommunityIcons name="microsoft" size={22} color="#0078D4" style={{ marginRight: 8 }} />
                <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>Sign in with Microsoft</Text>
              </View>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 12 }}>
                Use your Skin Tyee Microsoft 365 account ({'@skintyee.ca'}) to see your tasks,
                meetings, and role-specific tools.
              </Text>
              <Button
                mode="contained"
                icon="microsoft"
                buttonColor="#0078D4"
                textColor="#FFFFFF"
                // INTENTIONALLY NOT using `loading` prop — Paper's loading
                // disables onPress, which would lock the user out when
                // promptAsync hangs after a manually-closed popup. Each
                // click instead resets in-flight status + starts a fresh
                // auth flow.
                onPress={() => {
                  dispatch(resetSignInStatus());
                  dispatch(signIn());
                }}
              >
                {isSigningIn ? 'Try again' : 'Sign in with Microsoft'}
              </Button>
              <Button
                mode="text"
                compact
                icon="lock-reset"
                textColor={theme.colors.primary}
                onPress={openPasswordReset}
                style={{ alignSelf: 'center', marginTop: 6 }}
              >
                Forgot your password? Reset it
              </Button>

              {/* Visual feedback when in-flight — separate from the button so
                  it doesn't block taps. Shows a small spinner + cancel link. */}
              {isSigningIn && !error ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginLeft: 8, flex: 1 }}>
                    Waiting for Microsoft sign-in…
                  </Text>
                  <Button
                    mode="text"
                    compact
                    textColor={theme.colors.textDarker}
                    onPress={() => dispatch(resetSignInStatus())}
                  >
                    Cancel
                  </Button>
                </View>
              ) : null}

              {error ? (
                <Text style={{ color: theme.colors.accent, fontSize: 12, marginTop: 8 }}>
                  {error}
                </Text>
              ) : null}
            </Card.Content>
          </Card>
        ) : null}

        {/* Email + password sign-in — for Person rows without an Entra
            identity (contractors, externals). See
            docs/features/staff-auth.md. Surfaces only when signed-out. */}
        {!signedIn ? (
          <StaffSignInCard />
        ) : null}

        {!signedIn ? null : (
          <View style={{ marginBottom: 16 }}>
            {me && isAdmin ? (
              <Button
                mode="contained" icon="pencil"
                buttonColor={theme.colors.primary} textColor="#000"
                onPress={() => (navigation as any)?.navigate?.('Admin', { screen: 'memberEdit', params: { id: me._id } })}
                style={{ marginBottom: 8 }}
              >
                Edit Account
              </Button>
            ) : null}
            <Button
              mode="outlined" icon="lock-reset"
              textColor={theme.colors.primary}
              onPress={openPasswordReset}
              style={{ borderColor: theme.colors.primary, marginBottom: 8 }}
            >
              Reset Password
            </Button>
            <Button
              mode="outlined" icon="logout"
              textColor={theme.colors.accent}
              onPress={() => dispatch(signOut())}
              style={{ borderColor: theme.colors.accent }}
            >
              Sign Out
            </Button>
          </View>
        )}

        {/* Dev role switcher ---------------------------------------------
            Hidden in prod (Config.isProd resolves true when apiServer is
            api.skintyee.ca). Letting real users spoof admin would be a
            privilege-escalation surface; the switcher only exists so
            dev/staging can exercise role-gated screens without juggling
            Entra accounts. The signed-in user's canonical role still
            comes through normally. */}
        {!Config.isProd ? (
        <>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ color: theme.colors.textDarker, flex: 1, paddingRight: 8 }}>
            Advanced: role switcher (dev only){isSpoofed ? ` · spoofing ${role}` : ''}
          </Text>
          <Switch value={showRoleSwitcher} onValueChange={setShowRoleSwitcher} color={theme.colors.primary} />
        </View>
        {showRoleSwitcher ? (
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Content>
            {ROLES.map((r, i) => {
              const isActive = role === r.role;
              const isCanonical = canonicalRole === r.role;
              // When the active row is a SPOOFED role (i.e. not the
              // user's canonical role), tapping it again reverts to
              // canonical — the "untap to unspoof" gesture. If we don't
              // know the canonical role (persisted state predates the
              // field), call unspoof() which re-fetches from the api/.
              const onTap = () => {
                if (isActive && isSpoofed) {
                  if (canonicalRole) dispatch(setRole(canonicalRole));
                  else dispatch(unspoof());
                } else if (!isActive) {
                  dispatch(setRole(r.role));
                }
              };
              return (
                <View key={r.role}>
                  {i > 0 ? <Divider style={{ marginVertical: 6 }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: theme.colors.text }}>
                        {r.label}
                        {isCanonical ? (
                          <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>  · your role</Text>
                        ) : null}
                      </Text>
                      <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{r.desc}</Text>
                    </View>
                    <Button
                      mode={isActive ? 'contained' : 'outlined'}
                      compact
                      onPress={onTap}
                      buttonColor={isActive ? (isSpoofed ? theme.colors.accent : theme.colors.primary) : undefined}
                      textColor={isActive ? '#000' : theme.colors.primary}
                      style={{ borderColor: theme.colors.defaultBorder }}
                    >
                      {isActive ? (isSpoofed ? 'Unspoof' : 'Active') : 'Use'}
                    </Button>
                  </View>
                </View>
              );
            })}
          </Card.Content>
        </Card>
        ) : null}
        </>
        ) : null}
      </PageContent>
    </PageContainer>
  );
}
