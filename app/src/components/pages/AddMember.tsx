import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Chip, HelperText, IconButton, Snackbar, Switch, Text, TextInput } from 'react-native-paper';
import { PageContainer, PageContent, SecurityGroupPicker, useConfirm } from 'skintyee/components/layout';
import { useAppDispatch } from 'skintyee/store';
import { addMember } from 'skintyee/store/modules/directory';
import { apiFactory } from 'skintyee/store/apis';
import { theme } from 'skintyee/styles';

// Admin: provision a new band member via Microsoft Graph
// (docs/features/member-provisioning.md, ADR-15). Four things happen
// on submit, in order, server-side:
//   1. POST /users — creates the Entra identity.
//   2. POST /groups/{id}/members/$ref — for each picked Entra group.
//   3. Upsert BandMember in Postgres with derived appRole.
//   4. (Optional) Person create with timesheetsEnabled when ticked.
//
// The endpoint returns a one-time password that we surface in a
// success card; never persisted client-side, never re-shown.

const TENANT_DOMAIN = 'skintyee.ca';

// Hex random — 12 chars + a digit + a symbol so it satisfies the
// default Entra password policy without us having to retry.
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  // Stir in fixed tokens that satisfy "≥ 8 chars / mixed case / digits /
  // symbols / no username repetition" — Entra default rules.
  return out + 'a1!';
}

function slugifyMailNickname(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 60);
}

export default function AddMember({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { confirm, ConfirmHost } = useConfirm();

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  // UPN derives from name unless the admin overrides. Keep a separate
  // "manuallyEdited" flag so typing in Name keeps suggesting until the
  // admin actually edits the UPN field.
  const [upnManuallyEdited, setUpnManuallyEdited] = useState(false);
  const [upn, setUpn] = useState('');
  const [password, setPassword] = useState(generatePassword());
  const [bandGroups, setBandGroups] = useState<Set<string>>(new Set());
  const [createPerson, setCreatePerson] = useState(false);
  const [timesheetsEnabled, setTimesheetsEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<null | {
    upn: string; oneTimePassword: string; bandGroupCount: number; failedGroups: string[]; personId?: string;
  }>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Live UPN suggestion as the name is typed.
  const suggestedUpn = useMemo(() => {
    const nick = slugifyMailNickname(name);
    return nick ? `${nick}@${TENANT_DOMAIN}` : '';
  }, [name]);
  const effectiveUpn = upnManuallyEdited ? upn : suggestedUpn;

  const copyPassword = async () => {
    if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      try { await (navigator as any).clipboard.writeText(success?.oneTimePassword ?? password); setToast('Password copied'); return; }
      catch { /* fall through */ }
    }
    setToast(success?.oneTimePassword ?? password);
  };

  const submit = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!effectiveUpn.includes('@')) { setError('UPN must look like name@skintyee.ca.'); return; }
    setSaving(true);
    setError(undefined);
    try {
      const r = await apiFactory().admin.createUser({
        displayName: name.trim(),
        userPrincipalName: effectiveUpn.toLowerCase(),
        mailNickname: slugifyMailNickname(name),
        jobTitle: title.trim() || undefined,
        department: department.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        forceChangePasswordNextSignIn: true,
        bandGroups: Array.from(bandGroups),
        createPerson,
        timesheetsEnabled: createPerson && timesheetsEnabled,
      });
      // Mirror into Redux directory for instant render; canonical state
      // comes from the next loadDirectory(). _id maps to the Entra OID.
      dispatch(addMember({
        _id: r.bandMember._id,
        name: r.bandMember.name,
        role: r.bandMember.role,
        title: r.bandMember.title,
        email: (r.bandMember as any).email,
        phone: r.bandMember.phone,
        avatarLetter: r.bandMember.avatarLetter,
      } as any));
      setSuccess({
        upn: effectiveUpn,
        oneTimePassword: r.oneTimePassword,
        bandGroupCount: bandGroups.size,
        failedGroups: r.failedGroups ?? [],
        personId: r.personId,
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  // After-success card. The one-time password is shown ONCE — no
  // way to re-fetch it from the server.
  if (success) {
    return (
      <PageContainer>
        <PageContent>
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: theme.colors.success }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>
                ✓ Member created
              </Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 4 }}>
                {success.upn} · {success.bandGroupCount} group{success.bandGroupCount === 1 ? '' : 's'} assigned
                {success.personId ? ' · staff record created' : ''}
              </Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 14 }}>
                ONE-TIME PASSWORD
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', padding: 10, borderRadius: 4, marginTop: 4 }}>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontFamily: 'monospace', flex: 1 }}>
                  {success.oneTimePassword}
                </Text>
                <IconButton icon="content-copy" size={18} iconColor={theme.colors.textDarker} onPress={copyPassword} />
              </View>
              <HelperText type="info" visible style={{ marginLeft: -8 }}>
                Share this with {name} now — the password isn't stored and won't appear again. They'll be required to change it on first sign-in.
              </HelperText>
              {success.failedGroups.length > 0 ? (
                <HelperText type="error" visible style={{ marginLeft: -8 }}>
                  Couldn't add to: {success.failedGroups.join(', ')}. Retry from Edit Member.
                </HelperText>
              ) : null}
              <View style={{ flexDirection: 'row', marginTop: 14 }}>
                <Button mode="contained" icon="check" buttonColor={theme.colors.primary} textColor="#fff" onPress={() => navigation.goBack()}>
                  Done
                </Button>
              </View>
            </Card.Content>
          </Card>
          <Snackbar visible={toast !== null} onDismiss={() => setToast(null)} duration={1800}
            wrapperStyle={{ alignItems: 'center' }}
            style={{ backgroundColor: theme.colors.success, alignSelf: 'center', width: '100%', maxWidth: 420 }}>
            <Text style={{ color: '#000', textAlign: 'center', width: '100%' }}>{toast ?? ''}</Text>
          </Snackbar>
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageContent>
        <ScrollView>
          {/* Identity */}
          <TextInput label="Full name" value={name} onChangeText={(v) => { setName(v); if (!upnManuallyEdited) setUpn(slugifyMailNickname(v) + (slugifyMailNickname(v) ? `@${TENANT_DOMAIN}` : '')); }}
            mode="outlined" style={{ marginBottom: 10 }} />
          <TextInput label="User principal name (UPN)" value={effectiveUpn}
            onChangeText={(v) => { setUpn(v); setUpnManuallyEdited(true); }}
            mode="outlined" autoCapitalize="none" keyboardType="email-address" style={{ marginBottom: 4 }} />
          <HelperText type="info" visible style={{ marginLeft: -8 }}>
            This is the user's M365 sign-in. Defaults to firstname.lastname@{TENANT_DOMAIN}.
          </HelperText>
          <TextInput label="Job title (optional)" value={title} onChangeText={setTitle} mode="outlined" style={{ marginTop: 6, marginBottom: 10 }} />
          <TextInput label="Department (optional)" value={department} onChangeText={setDepartment} mode="outlined" style={{ marginBottom: 10 }} />
          <TextInput label="Phone (optional)" value={phone} onChangeText={setPhone} mode="outlined" keyboardType="phone-pad" style={{ marginBottom: 12 }} />

          {/* One-time password */}
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 4 }}>
            ONE-TIME PASSWORD
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <TextInput value={password} onChangeText={setPassword} mode="outlined" style={{ flex: 1, marginRight: 6 }} />
            <Button compact mode="text" icon="dice-multiple" textColor={theme.colors.textDarker} onPress={() => setPassword(generatePassword())}>
              Regenerate
            </Button>
          </View>
          <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 6 }}>
            The user will be required to change this on first sign-in. You'll see it once on the success screen.
          </HelperText>

          {/* Security groups */}
          <SecurityGroupPicker
            value={bandGroups}
            onChange={setBandGroups}
            onConfirmSensitive={async (slug) =>
              new Promise<boolean>((resolve) => {
                confirm({
                  title: 'Grant admin access?',
                  message: `Selecting "${slug}" grants the new user full app-admin access. Confirm.`,
                  confirmLabel: 'Yes, grant admin',
                  destructive: true,
                  onConfirm: () => resolve(true),
                });
                // useConfirm doesn't surface a cancel path back to us; if
                // the dialog is dismissed without calling onConfirm we
                // treat that as a cancel after a short timeout.
                setTimeout(() => resolve(false), 0);
              })
            }
          />

          {/* Staff record toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Switch value={createPerson} onValueChange={setCreatePerson} color={theme.colors.primary} />
            <View style={{ marginLeft: 8, flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 13 }}>Also create staff record</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>Adds a Person row linked to this member.</Text>
            </View>
          </View>
          {createPerson ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 36 }}>
              <Switch value={timesheetsEnabled} onValueChange={setTimesheetsEnabled} color={theme.colors.primary} />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 13 }}>Enable timesheets</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>Lets them save / submit hours.</Text>
              </View>
            </View>
          ) : null}

          {error ? <HelperText type="error" visible>{error}</HelperText> : null}

          <Button mode="contained" icon="account-plus" buttonColor={theme.colors.primary} textColor="#fff"
            onPress={submit} loading={saving}
            disabled={saving || !name.trim() || !effectiveUpn.includes('@') || !password}
            style={{ marginTop: 12, alignSelf: 'flex-start' }}>
            Create member
          </Button>
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 8 }}>
            Creates the Microsoft 365 account, seats them into Entra groups, optionally adds a staff record. Auto-license assignment lands in a follow-up release.
          </Text>
        </ScrollView>
        <ConfirmHost />
      </PageContent>
    </PageContainer>
  );
}
