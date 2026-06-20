import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Card, Chip, Divider, HelperText, IconButton, Text, TextInput } from 'react-native-paper';
import { PageContainer, PageContent, NoContent, useConfirm, useToast } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadDirectory, loadMember, setMemberGroups, setMemberMailboxes, setMemberLicenses, setMemberBlocked, updateMember } from 'skintyee/store/modules/directory';
import { BandMember } from 'skintyee/models';
import { SecurityGroup, SharedMailbox, LicenseSku } from 'skintyee/services/api/ApiService';
import { apiFactory } from 'skintyee/store/apis';
import { adminResetPassword } from 'skintyee/services/graphAdmin';
import { theme } from 'skintyee/styles';

// Pull the "fullaccess" entries out of mailboxMemberships — those are the
// ones we manage end-to-end through EXO. Other entries (M365 group
// memberships derived during seed, tagged "owner"/"member") stay untouched.
function fullAccessMailboxes(memberships?: string[]): string[] {
  return (memberships ?? [])
    .map((raw) => raw.split('|'))
    .filter(([, rel]) => rel === 'fullaccess')
    .map(([mail]) => mail.toLowerCase());
}

// Admin: edit a band member.
//
// Identity fields (name/title/email/phone) edit in-memory only — those are
// derived from Entra on seed and not yet writable here. The role chips are
// the Entra security-group memberships (see api/src/skintyee-groups.ts):
// SAVING THEM CALLS BACK TO ENTRA via PATCH /v1/directory/:id/groups, which
// uses the Group.ReadWrite.All permission to add/remove the user from each
// group.
//
// Sections by kind:
//   • ACCESS — Public / Band Members / Contractors
//   • ROLE   — Council / Management / Admins / System Admin
//   • DEPT   — IT / Finance / Housing / Forestry / Land Resources / Fire Chief
export default function EditMember({ route, navigation }: any) {
  const dispatch = useAppDispatch();
  const id = route?.params?.id;
  // Prefer the entities row (full directory list — already merged with
  // setGroups/setMailboxes writes). Fall back to `selected` so deep links
  // and post-AddMember navigation still render when the list hasn't been
  // fetched yet (or has a stale partial from the addMember in-memory
  // mirror in AddMember.tsx).
  const fromEntities = useAppSelector((s) => s.directory.entities.find((m) => m._id === id));
  const fromSelected = useAppSelector((s) =>
    s.directory.selected?._id === id ? s.directory.selected : undefined
  );
  const member = fromEntities ?? fromSelected;

  // Always pull a fresh row for the screen — guarantees identity fields
  // populate even if entities was loaded before the user's last sync.
  useEffect(() => {
    if (id) dispatch(loadMember(id));
    dispatch(loadDirectory());
  }, [dispatch, id]);

  const [name, setName] = useState(member?.name ?? '');
  const [title, setTitle] = useState(member?.title ?? '');
  const [department, setDepartment] = useState((member as any)?.department ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');
  // UPN is read-only on edit — changing it in Entra requires its own
  // ritual (POST .../changeUserPrincipalName) and the new value has to
  // pass mail-flow validation. Surface it so the admin can confirm
  // who they're editing, but don't edit it inline.
  const memberUpn = (member as any)?.upn ?? '';

  // Catalog of all security groups (fetched once from /v1/admin/security-groups).
  const [catalog, setCatalog] = useState<SecurityGroup[]>([]);
  const [catalogError, setCatalogError] = useState<string | undefined>();
  // Currently selected slugs — initialized from the member's bandGroups.
  // Re-syncs whenever the member's bandGroups changes (e.g. directory was
  // still loading when the screen mounted, or another tab updated the row).
  const [selected, setSelected] = useState<Set<string>>(new Set(member?.bandGroups ?? []));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  // Rotate-password state — kept entirely separate from the main edit
  // save. `rotatedPassword` is the new password the admin needs to
  // copy / share with the user; clears when they navigate away.
  const [rotateError, setRotateError] = useState<string | undefined>();
  // Admin access actions — force a self-service reset (revoke sessions) and
  // lock/unlock. `forcedInfo` holds the relay instructions to show the admin
  // after a force-reset (the user can't read their own work mailbox).
  const [forcing, setForcing] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [forcedInfo, setForcedInfo] = useState<string | null>(null);
  // Admin reset (Route B / MSAL) — uses the signed-in admin's delegated Graph
  // token to set a temp password that writes back on-prem. Only available when
  // actually signed in with Microsoft (not the dev role switcher).
  const [adminResetting, setAdminResetting] = useState(false);
  const [adminTempPw, setAdminTempPw] = useState<string | null>(null);
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const locked = member?.enabled === false;
  // Break-glass tenant admin — locking/force-resetting it could lock the whole
  // org out of M365, so those actions are disabled (api/ also hard-refuses).
  const protectedAdmin = (member as any)?.protectedAdmin === true;
  // Editing your own account — never let an admin lock themselves out.
  const myUpn = useAppSelector((s) => (s.auth.user?.upn ?? '').toLowerCase());
  const isSelf = !!member?.upn && (member.upn as string).toLowerCase() === myUpn;
  const { showToast, toastNode } = useToast();
  const { confirm, ConfirmHost } = useConfirm();

  // Shared mailbox catalog + selected. Only fetched/shown for licensed
  // users (shared inboxes themselves don't get access to other inboxes).
  const [mailboxCatalog, setMailboxCatalog] = useState<SharedMailbox[]>([]);
  const [mailboxCatalogError, setMailboxCatalogError] = useState<string | undefined>();
  const [selectedMailboxes, setSelectedMailboxes] = useState<Set<string>>(
    new Set(fullAccessMailboxes(member?.mailboxMemberships))
  );
  const isShared = member?.accountType === 'shared-inbox';

  // License catalog (Business Standard, Entra ID P1) + selected. Selected is
  // tracked by skuPartNumber (matches BandMember.licenses); mapped to skuIds
  // on save via the catalog. Only meaningful for licensed users.
  const [licenseCatalog, setLicenseCatalog] = useState<LicenseSku[]>([]);
  const [licenseCatalogError, setLicenseCatalogError] = useState<string | undefined>();
  const [selectedLicenses, setSelectedLicenses] = useState<Set<string>>(
    new Set(member?.licenses ?? [])
  );

  // Key the effect on the SERIALIZED bandGroups so it only fires when the
  // content actually changes (not on every render where the array identity
  // is fresh). Without this we'd clobber user toggles every render.
  const bandGroupsKey = (member?.bandGroups ?? []).join(',');
  useEffect(() => {
    setSelected(new Set(member?.bandGroups ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandGroupsKey]);

  // Sync the text fields when `member` arrives after mount. useState's
  // initial value runs ONCE at first render — if entities was still
  // loading then, name/title/department/email/phone freeze to '' and
  // stay blank until the user edits them. Re-sync whenever any of the
  // source fields change so the form populates as soon as data lands.
  // (Keyed on string identity, not member identity, so re-renders with
  // a fresh entities array reference don't clobber pending edits.)
  useEffect(() => {
    if (!member) return;
    setName(member.name ?? '');
    setTitle(member.title ?? '');
    setDepartment((member as any).department ?? '');
    setEmail(member.email ?? '');
    setPhone(member.phone ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    member?._id,
    member?.name,
    member?.title,
    (member as any)?.department,
    member?.email,
    member?.phone,
  ]);

  // Same pattern for mailbox memberships.
  const mailboxesKey = (member?.mailboxMemberships ?? []).join(',');
  useEffect(() => {
    setSelectedMailboxes(new Set(fullAccessMailboxes(member?.mailboxMemberships)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailboxesKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const groups = await apiFactory().admin.securityGroups();
        if (!cancelled) setCatalog(groups);
      } catch (e: any) {
        if (!cancelled) setCatalogError(e?.message ?? String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch the shared mailbox catalog (only meaningful for licensed users)
  useEffect(() => {
    if (isShared) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await apiFactory().admin.sharedMailboxes();
        if (!cancelled) setMailboxCatalog(list);
      } catch (e: any) {
        if (!cancelled) setMailboxCatalogError(e?.message ?? String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [isShared]);

  // Fetch the licence catalog (Business Standard, Entra ID P1)
  useEffect(() => {
    if (isShared) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await apiFactory().admin.licenseCatalog();
        if (!cancelled) setLicenseCatalog(list);
      } catch (e: any) {
        if (!cancelled) setLicenseCatalogError(e?.message ?? String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [isShared]);

  // Re-sync selected licences when the member row updates.
  const licensesKey = (member?.licenses ?? []).join(',');
  useEffect(() => {
    setSelectedLicenses(new Set(member?.licenses ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licensesKey]);

  const byKind = useMemo(() => {
    const out: Record<SecurityGroup['kind'], SecurityGroup[]> = { entra: [], m365: [] };
    for (const g of catalog) out[g.kind].push(g);
    return out;
  }, [catalog]);

  if (!member) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent message="Member not found." />
        </PageContent>
      </PageContainer>
    );
  }

  const toggle = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  // Has the role selection diverged from what's currently in Entra (i.e. the
  // member's bandGroups)? Used to enable/label the save button.
  const initial = useMemo(() => new Set(member.bandGroups ?? []), [member.bandGroups]);
  const dirty = useMemo(() => {
    if (initial.size !== selected.size) return true;
    for (const s of selected) if (!initial.has(s)) return true;
    return false;
  }, [initial, selected]);

  // Same for mailbox memberships
  const initialMailboxes = useMemo(
    () => new Set(fullAccessMailboxes(member.mailboxMemberships)),
    [member.mailboxMemberships]
  );
  const mailboxesDirty = useMemo(() => {
    if (initialMailboxes.size !== selectedMailboxes.size) return true;
    for (const s of selectedMailboxes) if (!initialMailboxes.has(s)) return true;
    return false;
  }, [initialMailboxes, selectedMailboxes]);

  const toggleMailbox = (upn: string) => {
    setSelectedMailboxes((prev) => {
      const next = new Set(prev);
      if (next.has(upn)) next.delete(upn);
      else next.add(upn);
      return next;
    });
  };

  // Licences — selection diverged from the member's current licences?
  const initialLicenses = useMemo(() => new Set(member.licenses ?? []), [member.licenses]);
  const licensesDirty = useMemo(() => {
    if (initialLicenses.size !== selectedLicenses.size) return true;
    for (const s of selectedLicenses) if (!initialLicenses.has(s)) return true;
    return false;
  }, [initialLicenses, selectedLicenses]);

  const toggleLicense = (partNumber: string) => {
    setSelectedLicenses((prev) => {
      const next = new Set(prev);
      if (next.has(partNumber)) next.delete(partNumber);
      else next.add(partNumber);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaveError(undefined);

    // Identity fields — in-memory only for now. Department joins the
    // local mirror so the EditMember surface round-trips correctly,
    // even though it doesn't reach Entra yet (parity wired via the
    // same Graph PATCH /users/{id} path AddMember uses is a follow-up).
    dispatch(
      updateMember({
        _id: member._id,
        name: name.trim(),
        title: title.trim() || undefined,
        department: department.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        avatarLetter: name.trim()[0]?.toUpperCase(),
      } as any)
    );

    // Role chips — write back to Entra. Mailbox chips — write back to EXO.
    // Licence chips — write back to Entra via Graph assignLicense.
    if (dirty || mailboxesDirty || licensesDirty) {
      setSaving(true);
      try {
        if (dirty) {
          await dispatch(setMemberGroups({ id: member._id, groups: Array.from(selected) })).unwrap();
        }
        if (mailboxesDirty) {
          await dispatch(setMemberMailboxes({ id: member._id, mailboxes: Array.from(selectedMailboxes) })).unwrap();
        }
        if (licensesDirty) {
          // Map selected skuPartNumbers → skuIds via the catalog.
          const skuIds = licenseCatalog
            .filter((l) => selectedLicenses.has(l.partNumber))
            .map((l) => l.skuId);
          await dispatch(setMemberLicenses({ id: member._id, skuIds })).unwrap();
        }
      } catch (e: any) {
        setSaveError(e?.message ?? String(e));
        setSaving(false);
        return;   // stay on screen so admin can retry / cancel
      }
      setSaving(false);
    }
    navigation.goBack();
  };

  const renderSection = (title: string, items: SecurityGroup[]) => (
    items.length > 0 && (
      <View style={{ marginBottom: 14 }}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>
          {title.toUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {items.map((g) => {
            const on = selected.has(g.slug);
            return (
              <Chip
                key={g.slug}
                selected={on}
                showSelectedCheck
                onPress={() => toggle(g.slug)}
                style={{
                  marginRight: 8,
                  marginBottom: 8,
                  backgroundColor: on ? theme.colors.primary : theme.colors.secondary,
                }}
                textStyle={{ color: on ? '#000' : theme.colors.text, fontSize: 12 }}
              >
                {g.displayName.replace(/^Skin Tyee /, '')}
              </Chip>
            );
          })}
        </View>
      </View>
    )
  );

  return (
    <PageContainer>
      <PageContent>
        <TextInput label="Full name" value={name} onChangeText={setName} mode="outlined" style={{ marginBottom: 10 }} />
        {memberUpn ? (
          <>
            <TextInput
              label="User principal name (UPN)"
              value={memberUpn}
              disabled
              mode="outlined"
              style={{ marginBottom: 2 }}
            />
            <HelperText type="info" visible style={{ marginLeft: -8 }}>
              Read-only. Changing a UPN requires a separate Entra rename + mail-flow validation.
            </HelperText>
          </>
        ) : null}
        <TextInput label="Job title (optional)" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 10 }} />
        <TextInput label="Department (optional)" value={department} onChangeText={setDepartment} mode="outlined" style={{ marginBottom: 10 }} />
        <TextInput label="Email (optional)" value={email} onChangeText={setEmail} mode="outlined" autoCapitalize="none" keyboardType="email-address" style={{ marginBottom: 10 }} />
        <TextInput label="Phone (optional)" value={phone} onChangeText={setPhone} mode="outlined" keyboardType="phone-pad" style={{ marginBottom: 16 }} />

        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
          Group memberships
        </Text>
        <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 8 }}>
          Edits sync to Microsoft Entra / Microsoft 365. Saving updates the directory directly.
        </HelperText>

        {catalogError && (
          <HelperText type="error" visible>
            Couldn't load groups: {catalogError}
          </HelperText>
        )}
        {catalog.length === 0 && !catalogError && (
          <ActivityIndicator style={{ marginVertical: 16 }} />
        )}

        {renderSection('Entra groups', byKind.entra)}
        {renderSection('Microsoft 365 groups', byKind.m365)}

        {/* Shared mailbox access — FullAccess + SendAs in Exchange Online.
            Only meaningful for licensed users (a shared mailbox getting
            FullAccess on another mailbox isn't a normal pattern). */}
        {!isShared && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
              Shared mailbox access
            </Text>
            <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 8 }}>
              FullAccess + SendAs in Exchange Online. Saving updates EXO directly (may take 5-30s).
            </HelperText>

            {mailboxCatalogError && (
              <HelperText type="error" visible>
                Couldn't load shared mailboxes: {mailboxCatalogError}
              </HelperText>
            )}
            {mailboxCatalog.length === 0 && !mailboxCatalogError && (
              <ActivityIndicator style={{ marginVertical: 16 }} />
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {mailboxCatalog.map((mbx) => {
                const on = selectedMailboxes.has(mbx.upn);
                const local = mbx.upn.split('@')[0];
                return (
                  <Chip
                    key={mbx.upn}
                    selected={on}
                    showSelectedCheck
                    icon="email"
                    onPress={() => toggleMailbox(mbx.upn)}
                    style={{
                      marginRight: 8,
                      marginBottom: 8,
                      backgroundColor: on ? theme.colors.primary : theme.colors.secondary,
                    }}
                    textStyle={{ color: on ? '#000' : theme.colors.text, fontSize: 12 }}
                  >
                    {local}@
                  </Chip>
                );
              })}
            </View>
          </View>
        )}

        {/* Microsoft licences — Business Standard + Entra ID P1. Toggling
            calls Graph assignLicense on save. Greyed out when the tenant
            owns no free seats of that SKU. */}
        {!isShared && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
              Microsoft licences
            </Text>
            <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 8 }}>
              Microsoft 365 + Entra ID P1. Saving assigns/removes them in Entra directly.
              {' '}Entra ID P1 also lets the member reset their own password (self-service
              password reset).
            </HelperText>

            {licenseCatalogError && (
              <HelperText type="error" visible>
                Couldn't load licences: {licenseCatalogError}
              </HelperText>
            )}
            {licenseCatalog.length === 0 && !licenseCatalogError && (
              <ActivityIndicator style={{ marginVertical: 16 }} />
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {licenseCatalog.map((lic) => {
                const on = selectedLicenses.has(lic.partNumber);
                const unavailable = !on && (!lic.owned || lic.available <= 0);
                const seats = lic.owned ? `${lic.available} free` : 'none owned';
                return (
                  <Chip
                    key={lic.skuId}
                    selected={on}
                    showSelectedCheck
                    icon={lic.paid ? 'star-circle' : 'microsoft-office'}
                    onPress={() => { if (!unavailable) toggleLicense(lic.partNumber); }}
                    style={{
                      marginRight: 8,
                      marginBottom: 8,
                      backgroundColor: on ? theme.colors.primary : theme.colors.secondary,
                    }}
                    // Blue (primary) highlight when assigned — matches the other
                    // selected chips. Text is white when the licence is available
                    // to assign (owned + free seats), grey when it isn't.
                    textStyle={{
                      color: on ? '#000' : (unavailable ? theme.colors.textDarker : theme.colors.text),
                      fontSize: 12,
                    }}
                  >
                    {lic.label.replace(/^Microsoft /, '')} · {seats}
                  </Chip>
                );
              })}
            </View>
          </View>
        )}

        {/* Rotate-password panel — sits below Shared mailbox access so
            the high-frequency edits live up top and the destructive
            credential reset has its own bottom-of-form home. Action is
            its own separate save cycle, NOT bundled with the main Save
            below. Only meaningful when the member has a real Entra id
            (seeded members do; old in-memory ones don't). */}
        {memberUpn ? (
          <Card style={{ marginTop: 4, marginBottom: 14, backgroundColor: theme.colors.darkDefault, borderLeftWidth: 3, borderLeftColor: theme.colors.accent }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>Password & access</Text>
              <HelperText type="info" visible style={{ marginLeft: -8, marginTop: 2, marginBottom: 8 }}>
                <Text style={{ color: theme.colors.text }}>Reset password</Text> — set a temp password to hand {name} (writes back on-prem).
                {'\n'}<Text style={{ color: theme.colors.text }}>Force password reset</Text> — sign them out so they self-serve at aka.ms/sspr.
                {'\n'}<Text style={{ color: theme.colors.text }}>Lock / Unlock</Text> — block or restore sign-in.
              </HelperText>
              {rotateError ? <HelperText type="error" visible>{rotateError}</HelperText> : null}
              {adminTempPw ? (
                <>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 4 }}>
                    NEW TEMPORARY PASSWORD
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', padding: 10, borderRadius: 4, marginTop: 4 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 16, fontFamily: 'monospace', flex: 1 }}>{adminTempPw}</Text>
                    <IconButton icon="content-copy" size={18} iconColor={theme.colors.textDarker} onPress={async () => {
                      if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
                        try { await (navigator as any).clipboard.writeText(adminTempPw); showToast('Password copied'); return; } catch { /* fall through */ }
                      }
                      showToast(adminTempPw);
                    }} />
                  </View>
                  <HelperText type="info" visible style={{ marginLeft: -8 }}>
                    Give this to {name} now — it isn't shown again. They change it at next sign-in.
                  </HelperText>
                </>
              ) : null}
              {forcedInfo ? (
                <View style={{ backgroundColor: 'rgba(0,184,236,0.08)', borderRadius: 6, padding: 10, marginBottom: 8 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, lineHeight: 19 }}>{forcedInfo}</Text>
                </View>
              ) : null}
              {!accessToken ? (
                <HelperText type="info" visible style={{ marginLeft: -8 }}>
                  Sign in with Microsoft (Account tab) to set a temp password directly. Force reset + Lock still work below.
                </HelperText>
              ) : null}
              {protectedAdmin ? (
                <HelperText type="error" visible style={{ marginLeft: -8 }}>
                  Break-glass tenant admin — Lock and Force reset are unavailable to protect organization access.
                </HelperText>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {accessToken ? (
                  <Button
                    mode="contained" icon="lock-reset"
                    buttonColor={theme.colors.primary} textColor="#000"
                    loading={adminResetting} disabled={adminResetting || forcing || blocking}
                    onPress={() => confirm({
                      title: 'Reset password?',
                      message: `Sets a new temporary password for ${name} and writes it back to on-prem AD. You'll see it once to hand over.`,
                      confirmLabel: 'Reset',
                      destructive: true,
                      onConfirm: async () => {
                        setAdminResetting(true); setRotateError(undefined); setAdminTempPw(null); setForcedInfo(null);
                        try {
                          const pw = await adminResetPassword(member!._id, accessToken);
                          setAdminTempPw(pw);
                        } catch (e: any) { setRotateError(e?.message ?? String(e)); }
                        finally { setAdminResetting(false); }
                      },
                    })}
                    style={{ marginRight: 8, marginBottom: 8 }}
                  >
                    Reset password
                  </Button>
                ) : null}
                {!protectedAdmin ? (
                <Button
                  mode="outlined" icon="lock-reset"
                  textColor={theme.colors.primary}
                  loading={forcing} disabled={forcing || blocking}
                  onPress={() => confirm({
                    title: 'Force a password reset?',
                    message: `${name} will be signed out everywhere. They then reset their own password at aka.ms/sspr using their registered phone or personal email.`,
                    confirmLabel: 'Force reset',
                    onConfirm: async () => {
                      setForcing(true); setRotateError(undefined); setForcedInfo(null);
                      try {
                        const r = await apiFactory().directory.forcePasswordReset(member!._id);
                        setForcedInfo(
                          `${name} has been signed out everywhere.\n\n` +
                          `Tell them to go to aka.ms/sspr and verify with their registered phone or personal email — NOT their @skintyee.ca inbox (they're locked out of it).` +
                          (r.emailed ? `\n\nA reminder was also emailed to ${r.emailedTo}.` : ``),
                        );
                      } catch (e: any) { setRotateError(e?.message ?? String(e)); }
                      finally { setForcing(false); }
                    },
                  })}
                  style={{ marginRight: 8, marginBottom: 8, borderColor: theme.colors.primary }}
                >
                  Force password reset
                </Button>
                ) : null}
                {!protectedAdmin && !isSelf ? (
                <Button
                  mode="outlined" icon={locked ? 'lock-open-variant' : 'lock'}
                  textColor={locked ? theme.colors.success : theme.colors.error}
                  loading={blocking} disabled={forcing || blocking}
                  onPress={() => confirm({
                    title: locked ? 'Unlock account?' : 'Lock account?',
                    message: locked
                      ? `${name} will be able to sign in again.`
                      : `${name} will be blocked from signing in and signed out everywhere.`,
                    confirmLabel: locked ? 'Unlock' : 'Lock',
                    destructive: !locked,
                    onConfirm: async () => {
                      setBlocking(true); setRotateError(undefined);
                      try {
                        await dispatch(setMemberBlocked({ id: member!._id, blocked: !locked })).unwrap();
                        showToast(locked ? 'Account unlocked' : 'Account locked');
                      } catch (e: any) { setRotateError(e?.message ?? String(e)); }
                      finally { setBlocking(false); }
                    },
                  })}
                  style={{ marginBottom: 8, borderColor: locked ? theme.colors.success : theme.colors.error }}
                >
                  {locked ? 'Unlock account' : 'Lock account'}
                </Button>
                ) : null}
              </View>
            </Card.Content>
          </Card>
        ) : null}

        {saveError && (
          <HelperText type="error" visible>
            Couldn't save: {saveError}
          </HelperText>
        )}

        <Button
          mode="contained"
          onPress={save}
          disabled={!name.trim() || saving}
          buttonColor={theme.colors.primary}
          textColor="#000"
          style={{ marginTop: 8 }}
        >
          {saving
            ? (mailboxesDirty ? 'Saving to Exchange Online…' : 'Saving to Entra…')
            : (dirty || mailboxesDirty) ? 'Save changes' : 'Save'}
        </Button>

        <ConfirmHost />

        {toastNode}
      </PageContent>
    </PageContainer>
  );
}
