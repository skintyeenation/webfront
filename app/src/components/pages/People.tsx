import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, HelperText, IconButton, Modal, Portal, Snackbar, Switch, Text, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent, AdminAddButton, useConfirm } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadDirectory } from 'skintyee/store/modules/directory';
import { apiFactory } from 'skintyee/store/apis';
import { PersonDto } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// People — admin CRUDs the lightweight Person records used as assignment
// targets. A Person can optionally be linked 1:1 to a BandMember (Entra-
// backed); when linked, name/email/phone are sourced from the band-
// member row. Otherwise the admin fills them in directly.
//
// The Add Person modal exposes a band-member autocomplete: type a few
// characters, pick from the matching directory entries, or skip the
// link and add an external person (most contractors).

// 12-char random + 'a1!' tail — matches AddMember's generator so the
// resulting password satisfies the same complexity rule (8+ chars,
// 3 of upper/lower/digit/symbol) the staff-auth server enforces.
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out + 'a1!';
}

export default function People({ navigation }: any) {
  const dispatch = useAppDispatch();
  const directory = useAppSelector((s) => s.directory.entities) as Array<any>;
  const directoryLoaded = useAppSelector((s) => s.directory.loaded);

  const [people, setPeople] = useState<PersonDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);
  const { confirm, ConfirmHost } = useConfirm();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bandMemberId, setBandMemberId] = useState<string | undefined>();
  const [bandSearch, setBandSearch] = useState('');
  const [bandPickerOpen, setBandPickerOpen] = useState(false);
  const [timesheetsEnabled, setTimesheetsEnabled] = useState(false);
  const [expensesEnabled, setExpensesEnabled] = useState(false);
  // staff-auth: when adding an external Person (no band-member link)
  // with an email, the admin can mint an app-sign-in account at the
  // same time. Mirrors the AddMember UX:
  //   • `password` is pre-generated; admin can edit / Regenerate before
  //     saving so they can pick something easy to relay (rare) or just
  //     accept the random one.
  //   • After save, the same password is revealed ONCE in the follow-up
  //     modal with a copy button.
  const [createAppSignIn, setCreateAppSignIn] = useState(true);
  const [password, setPassword] = useState<string>(generatePassword());
  const [revealedCredential, setRevealedCredential] = useState<
    { email: string; displayName: string; password: string } | null
  >(null);
  // Inline copy confirmation. Snackbars render at the parent layer
  // and end up BEHIND open modals on web, so the user can't see
  // them. These two flags drive a small "Copied" badge next to the
  // copy icon in each modal, separate so the form + reveal modal
  // don't visually fight each other.
  const [formPasswordCopied, setFormPasswordCopied] = useState(false);
  const [revealedPasswordCopied, setRevealedPasswordCopied] = useState(false);

  // staff-auth Edit-mode panel — server-generated reset / revoke, inline
  // result so the admin doesn't lose the modal. Same UX as EditMember's
  // rotate-password panel.
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [resetResultCopied, setResetResultCopied] = useState(false);
  const [resetError, setResetError] = useState<string | undefined>();

  // Shared helper — copy to clipboard with the inline-badge timer.
  const copyToClipboardInline = async (text: string, setFlag: (b: boolean) => void) => {
    let ok = false;
    if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      try {
        await (navigator as any).clipboard.writeText(text);
        ok = true;
      } catch { /* fall through */ }
    }
    if (ok) {
      setFlag(true);
      setTimeout(() => setFlag(false), 1800);
    } else {
      // No Clipboard API (rare — old browser, insecure context): show
      // the password in the snackbar as a fallback so admin can long-
      // press / triple-click to grab it. Best-effort, but the inline
      // success path covers the common case.
      setToast(text);
    }
  };
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      setPeople(await apiFactory().onboarding.listPeople());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (!directoryLoaded) dispatch(loadDirectory()); }, [dispatch, directoryLoaded]);

  // Active licensed band members the admin can link to. Anyone disabled
  // or a shared inbox is filtered out — those aren't real people.
  const linkableMembers = useMemo(
    () => directory.filter((m) => m.accountType === 'licensed-user' && m.enabled !== false && m.upn),
    [directory]
  );

  // UPNs already linked elsewhere — disable in the picker so a single
  // BandMember can only back one Person at a time (matches the 1:1
  // schema constraint; surfacing it here avoids a 409 round-trip).
  const linkedMemberIds = useMemo(
    () => new Set(people.map((p) => p.bandMemberId).filter(Boolean) as string[]),
    [people]
  );

  const filteredMembers = useMemo(() => {
    const q = bandSearch.trim().toLowerCase();
    const base = linkableMembers.slice().sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    if (!q) return base.slice(0, 30);
    return base
      .filter((m) =>
        (m.name ?? '').toLowerCase().includes(q) ||
        (m.upn ?? '').toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [linkableMembers, bandSearch]);

  const selectedMember = bandMemberId ? linkableMembers.find((m) => m._id === bandMemberId) : undefined;

  // Email-match fallback: for legacy People rows that predate the
  // bandMemberId column (or weren't linked at create time), infer a
  // band-member link by matching email / UPN. Returns the member's
  // friendly name if matched, undefined otherwise.
  const inferLinkedMember = useCallback((p: PersonDto): any | undefined => {
    if (p.bandMemberId) return undefined; // already linked; no fallback
    const e = (p.email ?? '').toLowerCase();
    if (!e) return undefined;
    return linkableMembers.find((m) => (m.email ?? '').toLowerCase() === e || (m.upn ?? '').toLowerCase() === e);
  }, [linkableMembers]);

  const resetForm = () => {
    setEditingId(undefined);
    setDisplayName(''); setEmail(''); setPhone('');
    setBandMemberId(undefined); setBandSearch('');
    setBandPickerOpen(false);
    setTimesheetsEnabled(false);
    setExpensesEnabled(false);
    setCreateAppSignIn(true);
    // Fresh password per add — avoids accidentally reusing a previous
    // one across modal opens.
    setPassword(generatePassword());
    setFormError(undefined);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };
  const openEdit = (p: PersonDto) => {
    setEditingId(p.id);
    setDisplayName(p.displayName);
    setEmail(p.email ?? '');
    setPhone(p.phone ?? '');
    setBandMemberId(p.bandMemberId ?? undefined);
    setBandSearch('');
    setBandPickerOpen(false);
    setTimesheetsEnabled(!!p.timesheetsEnabled);
    setExpensesEnabled(!!p.expensesEnabled);
    setResetting(false);
    setResetResult(null);
    setResetResultCopied(false);
    setResetError(undefined);
    setFormError(undefined);
    setModalOpen(true);
  };

  // Live row used by the Edit modal's app-sign-in panel — keeps
  // `hasAppSignIn` fresh after a reset / revoke.
  const editingPerson = editingId ? people.find((p) => p.id === editingId) : undefined;
  const removePerson = (p: PersonDto) =>
    confirm({
      title: 'Remove person?',
      message: `${p.displayName} will be removed. Any existing assignments stay (the person record stays attached).`,
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: async () => {
        try {
          await apiFactory().onboarding.deletePerson(p.id);
          setToast('Removed');
          await load();
        } catch (e: any) {
          setError(e?.message ?? String(e));
        }
      },
    });

  const pickMember = (m: any) => {
    setBandMemberId(m._id);
    // Pre-fill the form fields from the member as a courtesy — the server
    // will overwrite from the canonical BandMember row on save anyway.
    setDisplayName(m.name ?? '');
    setEmail(m.email ?? '');
    setPhone(m.phone ?? '');
    setBandPickerOpen(false);
  };
  const unlinkMember = () => {
    setBandMemberId(undefined);
    setBandSearch('');
  };

  const submit = async () => {
    // Either a band-member link OR a typed displayName is required.
    if (!bandMemberId && !displayName.trim()) {
      setFormError('Pick a band member or type a display name.');
      return;
    }
    // Email is REQUIRED for externals (no band-member link). It's both
    // the contact address and — if "Create app sign-in" is on — the
    // login identifier. A super-quick shape check; the server still
    // enforces uniqueness.
    if (!bandMemberId && !email.trim()) {
      setFormError('Email is required for external people (it is also the sign-in identifier).');
      return;
    }
    if (!bandMemberId && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Email doesn\'t look right (e.g. name@example.com).');
      return;
    }
    setSaving(true);
    setFormError(undefined);
    try {
      const api = apiFactory().onboarding;
      if (editingId) {
        await api.updatePerson(editingId, {
          displayName: displayName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          bandMemberId: bandMemberId ?? null,
          timesheetsEnabled,
          expensesEnabled,
        });
        setToast('Saved');
        setModalOpen(false);
        resetForm();
        await load();
      } else {
        const created = await api.createPerson({
          displayName: displayName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          bandMemberId,
          timesheetsEnabled,
          expensesEnabled,
        });

        // staff-auth: optionally mint an app-sign-in password right
        // after the create. Skip silently when there's no email or
        // when bandMember is linked (those Persons use SSO and the
        // server would reject the set-password call anyway).
        const wantsAppSignIn =
          createAppSignIn && !bandMemberId && email.trim().length > 0 && !!created?.id;
        if (wantsAppSignIn) {
          try {
            // Send the admin-picked password — the same value lands
            // in the reveal modal below so they always see what they
            // saved, never a server-regenerated one.
            const { password: savedPassword } =
              await apiFactory().admin.setPersonPassword(created.id, password);
            // Close the Add Person modal and pop the credential
            // reveal modal — same UX as AddMember.
            setModalOpen(false);
            setRevealedCredential({
              email: email.trim(),
              displayName: displayName.trim(),
              password: savedPassword,
            });
            resetForm();
            await load();
            return;
          } catch (e: any) {
            // Person is created; password issuance failed. Surface
            // the failure so admin can rotate from EditPerson later.
            setFormError(
              `Person created, but couldn't set password: ${e?.message ?? e}. Issue it from Edit Person.`,
            );
            await load();
            return;
          }
        }

        setToast('Person added');
        setModalOpen(false);
        resetForm();
        await load();
      }
    } catch (e: any) {
      setFormError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Add person" icon="account-plus" onPress={openCreate} />

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}
        {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}

        {!loading && people.length === 0 ? (
          <NoContent message="No people yet. Add one to assign onboarding flows." />
        ) : null}

        {people.map((p) => {
          const inferred = inferLinkedMember(p);
          const isBandMember = !!p.bandMemberId || !!inferred;
          return (
            <Card key={p.id} style={{ marginTop: 8, backgroundColor: theme.colors.darkDefault }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1 }}>{p.displayName}</Text>
                  {isBandMember ? (
                    <Chip compact icon="badge-account" style={{ backgroundColor: theme.colors.primary }} textStyle={{ color: '#000', fontSize: 10 }}>
                      Band member
                    </Chip>
                  ) : (
                    <Chip compact icon="account-outline" style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                      External
                    </Chip>
                  )}
                </View>
                {p.email ? <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>{p.email}</Text> : null}
                {p.phone ? <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{p.phone}</Text> : null}
                {p.bandMemberName && p.bandMemberUpn && p.bandMemberName !== p.displayName ? (
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 2 }}>
                    Linked to {p.bandMemberName} ({p.bandMemberUpn})
                  </Text>
                ) : inferred ? (
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 2 }}>
                    Matches {inferred.name} ({inferred.upn}) — open to link.
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 10, flex: 1 }}>
                    Added {dayjs(p.createdAt).format('MMM D, YYYY')}
                  </Text>
                  {p.timesheetsEnabled ? (
                    <Chip
                      compact icon="clock-outline"
                      style={{ marginRight: 4, backgroundColor: theme.colors.success }}
                      textStyle={{ color: '#000', fontSize: 10 }}
                    >
                      Timesheets
                    </Chip>
                  ) : null}
                  {p.expensesEnabled ? (
                    <Chip
                      compact icon="receipt"
                      style={{ marginRight: 4, backgroundColor: theme.colors.success }}
                      textStyle={{ color: '#000', fontSize: 10 }}
                    >
                      Expenses
                    </Chip>
                  ) : null}
                  <IconButton icon="pencil" size={18} iconColor={theme.colors.textDarker} onPress={() => openEdit(p)} />
                  <IconButton icon="delete" size={18} iconColor={theme.colors.textDarker} onPress={() => removePerson(p)} />
                </View>
              </Card.Content>
            </Card>
          );
        })}

        {/* Add Person modal */}
        <Portal>
          <Modal
            visible={modalOpen}
            onDismiss={() => setModalOpen(false)}
            contentContainerStyle={{ backgroundColor: theme.colors.darkDefault, padding: 16, borderRadius: 8, marginHorizontal: 20, alignSelf: 'center', width: '90%', maxWidth: 460, maxHeight: '85%' }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>
              {editingId ? 'Edit person' : 'Add person'}
            </Text>

            {/* Band-member autocomplete — collapsed when nothing picked,
                expands to a searchable list of directory entries. */}
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 12 }}>
              BAND MEMBER (OPTIONAL)
            </Text>
            {selectedMember ? (
              <View style={{ marginTop: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: 8 }}>
                  <MaterialCommunityIcons name="badge-account" size={18} color={theme.colors.success} style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 13 }}>{selectedMember.name}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{selectedMember.upn}</Text>
                  </View>
                </View>
                {/* Linked state = a green "Band Member Linked" button. Tapping
                    it confirms before unlinking (it's a destructive change —
                    the Person reverts to manually-entered name/email/phone). */}
                <Button
                  mode="contained" icon="link-variant"
                  buttonColor={theme.colors.success} textColor="#000"
                  style={{ alignSelf: 'flex-start', marginTop: 6 }}
                  onPress={() => confirm({
                    title: 'Unlink band member?',
                    message: `${selectedMember.name} (${selectedMember.upn}) will be unlinked. This Person reverts to manually-entered name, email and phone.`,
                    confirmLabel: 'Unlink',
                    destructive: true,
                    onConfirm: unlinkMember,
                  })}
                >
                  Band Member Linked
                </Button>
              </View>
            ) : !bandPickerOpen ? (
              <Button mode="outlined" icon="account-search" textColor={theme.colors.text} style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={() => setBandPickerOpen(true)}>
                Link a band member
              </Button>
            ) : (
              <View style={{ marginTop: 6 }}>
                <TextInput
                  dense mode="outlined"
                  label="Type a name or email"
                  value={bandSearch}
                  onChangeText={setBandSearch}
                  autoFocus
                  autoCapitalize="none"
                  left={<TextInput.Icon icon="magnify" />}
                  right={bandSearch ? <TextInput.Icon icon="close" onPress={() => setBandSearch('')} /> : undefined}
                />
                <ScrollView style={{ maxHeight: 180, marginTop: 4 }}>
                  {filteredMembers.length === 0 ? (
                    <HelperText type="info" visible style={{ marginLeft: -8 }}>
                      {linkableMembers.length === 0 ? 'Directory not loaded yet.' : 'No matches.'}
                    </HelperText>
                  ) : (
                    filteredMembers.map((m) => {
                      const alreadyLinked = linkedMemberIds.has(m._id);
                      return (
                        <TouchableOpacity
                          key={m._id}
                          onPress={() => { if (!alreadyLinked) pickMember(m); }}
                          activeOpacity={alreadyLinked ? 1 : 0.6}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, opacity: alreadyLinked ? 0.45 : 1 }}
                        >
                          <MaterialCommunityIcons name="account" size={16} color={theme.colors.textDarker} style={{ marginRight: 8 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.colors.text, fontSize: 13 }}>{m.name}</Text>
                            <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                              {m.upn}{alreadyLinked ? '  ·  already linked' : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
                <Button compact mode="text" textColor={theme.colors.textDarker} onPress={() => setBandPickerOpen(false)} style={{ alignSelf: 'flex-start' }}>
                  Skip (external person)
                </Button>
              </View>
            )}

            {/* Manual fields — disabled when linked to a band member
                (server uses the BandMember row as the source of truth). */}
            <TextInput
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              mode="outlined" style={{ marginTop: 12 }}
              disabled={!!selectedMember}
            />
            <TextInput
              label={selectedMember ? 'Email' : 'Email (required)'}
              value={email} onChangeText={setEmail}
              mode="outlined" autoCapitalize="none" keyboardType="email-address" style={{ marginTop: 8 }}
              disabled={!!selectedMember}
            />
            <TextInput
              label="Phone (optional)"
              value={phone} onChangeText={setPhone}
              mode="outlined" keyboardType="phone-pad" style={{ marginTop: 8 }}
              disabled={!!selectedMember}
            />
            {selectedMember ? (
              <HelperText type="info" visible style={{ marginLeft: -8 }}>
                Name, email, and phone come from the linked band member.
              </HelperText>
            ) : null}

            {/* App sign-in — only available for external Persons with an
                email (band-member-linked rows use Microsoft Entra SSO).
                Hidden on edit; the EditPerson Reset/Revoke panels handle
                rotation post-create. Same one-time-password UX as
                AddMember: a pre-generated value with Regenerate, shown
                ONCE in the success modal below.
                See docs/features/staff-auth.md. */}
            {!editingId && !selectedMember && email.trim().length > 0 ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                  <Switch
                    value={createAppSignIn}
                    onValueChange={setCreateAppSignIn}
                    color={theme.colors.primary}
                  />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 13 }}>Create app sign-in</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                      {email.trim()} signs in at the Account page with their email + password.
                    </Text>
                  </View>
                </View>
                {createAppSignIn ? (
                  <>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 12 }}>
                      ONE-TIME PASSWORD
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        mode="outlined"
                        autoCapitalize="none"
                        autoCorrect={false}
                        right={
                          <TextInput.Icon
                            icon={formPasswordCopied ? 'check' : 'content-copy'}
                            forceTextInputFocus={false}
                            onPress={() => copyToClipboardInline(password, setFormPasswordCopied)}
                          />
                        }
                        style={{ flex: 1, marginRight: 6 }}
                      />
                      {formPasswordCopied ? (
                        <Text style={{ color: theme.colors.success, fontSize: 11, marginLeft: 4 }}>
                          Copied
                        </Text>
                      ) : null}
                      <Button
                        compact
                        mode="text"
                        icon="dice-multiple"
                        textColor={theme.colors.textDarker}
                        onPress={() => setPassword(generatePassword())}
                      >
                        Regenerate
                      </Button>
                    </View>
                    <HelperText type="info" visible style={{ marginLeft: -8 }}>
                      You'll see this once on the success screen. 8+ chars; mix of upper, lower, digit, symbol.
                    </HelperText>
                  </>
                ) : null}
              </>
            ) : null}

            {/* Time Keeping toggle. When on the person becomes a worker
                in the Approvals roster + their account is allowed to
                save / submit timesheets via the worker-side endpoints. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <Switch
                value={timesheetsEnabled}
                onValueChange={setTimesheetsEnabled}
                color={theme.colors.primary}
              />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 13 }}>Enable Timesheets</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                  Worker appears in Time Keeping approvals and can submit hours.
                </Text>
              </View>
            </View>

            {/* Expenses toggle — the reimbursement twin of the timesheet
                toggle. When on, the person appears in the expense Approvals
                roster and may start / submit expense claims. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <Switch
                value={expensesEnabled}
                onValueChange={setExpensesEnabled}
                color={theme.colors.primary}
              />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 13 }}>Enable Expenses</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                  Worker can submit receipt claims; appears in Expenses approvals.
                </Text>
              </View>
            </View>

            {/* App sign-in maintenance — Edit-mode only, external rows
                only (band-member-linked uses SSO). Mirrors EditMember's
                rotate-password panel: server-generated, inline result,
                separate from the main Save. Reset issues a fresh
                password; Revoke clears it without deleting the row. */}
            {editingId && !selectedMember && editingPerson ? (
              <View style={{ marginTop: 14, padding: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)', borderLeftWidth: 3, borderLeftColor: resetResult ? theme.colors.success : (editingPerson.hasAppSignIn ? theme.colors.primary : theme.colors.textDarker) }}>
                <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>App sign-in</Text>
                {resetResult ? (
                  <>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 8 }}>
                      NEW ONE-TIME PASSWORD
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 4, marginTop: 4 }}>
                      <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontFamily: 'monospace', flex: 1 }}>
                        {resetResult}
                      </Text>
                      {resetResultCopied ? (
                        <Text style={{ color: theme.colors.success, fontSize: 12, marginRight: 6 }}>
                          Copied
                        </Text>
                      ) : null}
                      <IconButton
                        icon={resetResultCopied ? 'check' : 'content-copy'}
                        size={18}
                        iconColor={resetResultCopied ? theme.colors.success : theme.colors.textDarker}
                        onPress={() => copyToClipboardInline(resetResult, setResetResultCopied)}
                      />
                    </View>
                    <HelperText type="info" visible style={{ marginLeft: -8 }}>
                      Share with {editingPerson.displayName} now — won't appear again.
                    </HelperText>
                  </>
                ) : (
                  <HelperText type="info" visible style={{ marginLeft: -8, marginTop: 2 }}>
                    {editingPerson.hasAppSignIn
                      ? `Active — ${editingPerson.email} can sign in with email + password.`
                      : 'No password set. Issue one to give this person app access.'}
                  </HelperText>
                )}
                {resetError ? <HelperText type="error" visible>{resetError}</HelperText> : null}
                <View style={{ flexDirection: 'row', marginTop: 6, flexWrap: 'wrap' }}>
                  <Button
                    mode="outlined"
                    icon="lock-reset"
                    textColor={theme.colors.primary}
                    style={{ marginRight: 8, marginTop: 4, borderColor: theme.colors.primary }}
                    loading={resetting}
                    disabled={resetting || !editingPerson.email}
                    onPress={() => {
                      confirm({
                        title: editingPerson.hasAppSignIn ? 'Reset password?' : 'Issue password?',
                        message: editingPerson.hasAppSignIn
                          ? `Generates a fresh one-time password for ${editingPerson.displayName}. The current password will stop working immediately.`
                          : `Issues a one-time password so ${editingPerson.displayName} can sign in with their email.`,
                        confirmLabel: editingPerson.hasAppSignIn ? 'Reset' : 'Issue',
                        destructive: editingPerson.hasAppSignIn,
                        onConfirm: async () => {
                          setResetting(true);
                          setResetError(undefined);
                          setResetResultCopied(false);
                          try {
                            // Server-generated. Single-click parity
                            // with EditMember's rotate-password.
                            const r = await apiFactory().admin.setPersonPassword(editingPerson.id);
                            setResetResult(r.password);
                            await load();
                          } catch (e: any) {
                            setResetError(e?.message ?? String(e));
                          } finally {
                            setResetting(false);
                          }
                        },
                      });
                    }}
                  >
                    {editingPerson.hasAppSignIn
                      ? (resetResult ? 'Reset again' : 'Reset password')
                      : 'Issue password'}
                  </Button>
                  {editingPerson.hasAppSignIn ? (
                    <Button
                      mode="outlined"
                      icon="account-cancel"
                      textColor={theme.colors.accent}
                      style={{ marginTop: 4, borderColor: theme.colors.accent }}
                      onPress={() => {
                        confirm({
                          title: 'Revoke app access?',
                          message: `${editingPerson.displayName} won't be able to sign in until you issue a new password. Their onboarding history is preserved.`,
                          confirmLabel: 'Revoke',
                          destructive: true,
                          onConfirm: async () => {
                            setResetError(undefined);
                            try {
                              await apiFactory().admin.revokePersonPassword(editingPerson.id);
                              setResetResult(null);
                              await load();
                            } catch (e: any) {
                              setResetError(e?.message ?? String(e));
                            }
                          },
                        });
                      }}
                    >
                      Revoke access
                    </Button>
                  ) : null}
                </View>
              </View>
            ) : null}

            {formError ? <HelperText type="error" visible>{formError}</HelperText> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button mode="text" textColor={theme.colors.textDarker} onPress={() => { setModalOpen(false); resetForm(); }}>Cancel</Button>
              <Button mode="contained" buttonColor={theme.colors.primary} textColor="#fff" onPress={submit} loading={saving} disabled={saving || (!bandMemberId && !displayName.trim())}>
                {editingId ? 'Save' : 'Add'}
              </Button>
            </View>
          </Modal>
        </Portal>

        {/* One-time password reveal — shown ONCE after a Person is
            created with createAppSignIn. Same UX as the AddMember
            success card. Admin shares the password with the user out-
            of-band; closing dismisses the password forever. */}
        <Portal>
          <Modal
            visible={revealedCredential !== null}
            // Dismiss only via the explicit "Done" button so an
            // accidental backdrop tap doesn't lose the password.
            onDismiss={() => { /* swallowed — done button only */ }}
            dismissable={false}
            contentContainerStyle={{
              backgroundColor: theme.colors.darkDefault,
              padding: 16,
              borderRadius: 8,
              marginHorizontal: 20,
              alignSelf: 'center',
              width: '90%',
              maxWidth: 460,
              borderLeftWidth: 3,
              borderLeftColor: theme.colors.success,
            }}
          >
            {revealedCredential ? (
              <>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>
                  ✓ Person added — app sign-in ready
                </Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 4 }}>
                  {revealedCredential.displayName} ({revealedCredential.email})
                </Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 14 }}>
                  ONE-TIME PASSWORD
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', padding: 10, borderRadius: 4, marginTop: 4 }}>
                  <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontFamily: 'monospace', flex: 1 }}>
                    {revealedCredential.password}
                  </Text>
                  {revealedPasswordCopied ? (
                    <Text style={{ color: theme.colors.success, fontSize: 12, marginRight: 6 }}>
                      Copied
                    </Text>
                  ) : null}
                  <IconButton
                    icon={revealedPasswordCopied ? 'check' : 'content-copy'}
                    size={18}
                    iconColor={revealedPasswordCopied ? theme.colors.success : theme.colors.textDarker}
                    onPress={() => copyToClipboardInline(revealedCredential.password, setRevealedPasswordCopied)}
                  />
                </View>
                <HelperText type="info" visible style={{ marginLeft: -8 }}>
                  Share this with {revealedCredential.displayName} now — the password isn't stored and won't appear again. They can sign in at the Account page using their email + this password.
                </HelperText>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 }}>
                  <Button
                    mode="contained"
                    icon="check"
                    buttonColor={theme.colors.primary}
                    textColor="#fff"
                    onPress={() => setRevealedCredential(null)}
                  >
                    Done
                  </Button>
                </View>
              </>
            ) : null}
          </Modal>
        </Portal>

        <ConfirmHost />

        <Snackbar
          visible={toast !== null}
          onDismiss={() => setToast(null)}
          duration={1800}
          wrapperStyle={{ alignItems: 'center' }}
          style={{ backgroundColor: theme.colors.success, alignSelf: 'center', width: '100%', maxWidth: 420 }}
        >
          <Text style={{ color: '#000', textAlign: 'center', width: '100%' }}>{toast ?? ''}</Text>
        </Snackbar>
      </PageContent>
    </PageContainer>
  );
}
