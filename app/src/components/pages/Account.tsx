import React, { useEffect } from 'react';
import { Image, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { Avatar, Button, Card, Chip, Divider, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { resetSignInStatus, setRole, signIn, signOut, unspoof } from 'skintyee/store/modules/auth';
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
          {user?.upn ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>{user.upn}</Text>
          ) : null}

          {/* Role chip carries a tappable refresh icon — re-fetches
              /v1/admin/role-for/:upn through the unspoof thunk so any
              server-side change picks up without a separate button.
              Words are uppercased (ROLE: STAFF) to match the rest of
              the in-chip typography. */}
          <Chip
            compact
            icon={signedIn ? 'refresh' : undefined}
            onPress={signedIn ? () => dispatch(unspoof()) : undefined}
            style={{ marginTop: 6, backgroundColor: isAdmin ? theme.colors.accent : theme.colors.secondary }}
            textStyle={{ color: isAdmin ? '#000' : theme.colors.text, fontSize: 11 }}
          >
            {signedIn ? `ROLE: ${role.toUpperCase()}` : 'NOT SIGNED IN'}
          </Chip>
        </View>

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
        ) : (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <MaterialCommunityIcons name="account-check" size={20} color={theme.colors.success} style={{ marginRight: 8 }} />
                <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>Signed in</Text>
              </View>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 8 }}>
                Your role was derived from your Microsoft account.
                {role === 'admin' ? ' You have full admin access.' :
                 role === 'staff' ? ' You have staff access.' :
                 role === 'member' ? ' You have band-member access.' :
                 ''}
              </Text>
              <Button
                mode="outlined"
                icon="logout"
                textColor={theme.colors.accent}
                onPress={() => dispatch(signOut())}
                style={{ borderColor: theme.colors.defaultBorder, alignSelf: 'center', marginTop: 6 }}
              >
                Sign out
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* Member details — read-only mirror of what shows up on Edit
            Member. Pulled from the directory slice (Entra-seeded) and
            only renders for signed-in users with a matching directory
            row. Gives the user (and admin) a quick "is my profile
            correct?" view without bouncing through Band Management. */}
        {signedIn && me ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <MaterialCommunityIcons name="card-account-details-outline" size={20} color={theme.colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>Member details</Text>
                {isAdmin ? (
                  <Button
                    compact mode="text" icon="pencil"
                    textColor={theme.colors.primary}
                    onPress={() => (navigation as any)?.navigate?.('Admin', { screen: 'memberEdit', params: { id: me._id } })}
                  >
                    Edit
                  </Button>
                ) : null}
              </View>
              <MemberDetailRow icon="briefcase-outline" label="Job title" value={me.title} />
              <MemberDetailRow icon="domain"             label="Department" value={(me as any).department} />
              <MemberDetailRow icon="email-outline"      label="Email"      value={(me as any).email} />
              <MemberDetailRow icon="phone-outline"      label="Phone"      value={me.phone} />
              {me.managerName ? (
                <MemberDetailRow icon="account-tie" label="Manager" value={me.managerName} />
              ) : null}
              {Array.isArray(me.bandGroups) && me.bandGroups.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>
                    SECURITY GROUPS
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {me.bandGroups.map((g: string) => (
                      <Chip
                        key={g} compact
                        style={{ marginRight: 6, marginBottom: 4, backgroundColor: theme.colors.secondary }}
                        textStyle={{ color: theme.colors.text, fontSize: 10 }}
                      >
                        {g}
                      </Chip>
                    ))}
                  </View>
                </View>
              ) : null}
            </Card.Content>
          </Card>
        ) : null}

        {/* Dev role switcher ---------------------------------------------
            Hidden in prod (Config.isProd resolves true when apiServer is
            api.skintyee.ca). Letting real users spoof admin would be a
            privilege-escalation surface; the switcher only exists so
            dev/staging can exercise role-gated screens without juggling
            Entra accounts. The signed-in user's canonical role still
            comes through normally. */}
        {!Config.isProd ? (
        <>
        <Text style={{ color: theme.colors.textDarker, marginBottom: 8 }}>
          Switch role (development only){isSpoofed ? ` · tap "${role}" again to revert to your ${canonicalRole} role` : ''}
        </Text>
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
        </>
        ) : null}
      </PageContent>
    </PageContainer>
  );
}
