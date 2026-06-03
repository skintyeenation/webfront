import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, HelperText, Modal, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent, AdminAddButton } from 'skintyee/components/layout';
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

export default function People({ navigation }: any) {
  const dispatch = useAppDispatch();
  const directory = useAppSelector((s) => s.directory.entities) as Array<any>;
  const directoryLoaded = useAppSelector((s) => s.directory.loaded);

  const [people, setPeople] = useState<PersonDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bandMemberId, setBandMemberId] = useState<string | undefined>();
  const [bandSearch, setBandSearch] = useState('');
  const [bandPickerOpen, setBandPickerOpen] = useState(false);
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

  const selectedMember = bandMemberId ? linkableMembers.find((m) => m.id === bandMemberId) : undefined;

  const resetForm = () => {
    setDisplayName(''); setEmail(''); setPhone('');
    setBandMemberId(undefined); setBandSearch('');
    setFormError(undefined);
  };

  const pickMember = (m: any) => {
    setBandMemberId(m.id);
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
    setSaving(true);
    setFormError(undefined);
    try {
      await apiFactory().onboarding.createPerson({
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        bandMemberId,
      });
      setModalOpen(false);
      resetForm();
      setToast('Person added');
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Add person" icon="account-plus" onPress={() => setModalOpen(true)} />

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}
        {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}

        {!loading && people.length === 0 ? (
          <NoContent message="No people yet. Add one to assign onboarding flows." />
        ) : null}

        {people.map((p) => (
          <Card key={p.id} style={{ marginTop: 8, backgroundColor: theme.colors.darkDefault }}>
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1 }}>{p.displayName}</Text>
                {p.bandMemberId ? (
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
              ) : null}
              <Text style={{ color: theme.colors.textDarker, fontSize: 10, marginTop: 4 }}>
                Added {dayjs(p.createdAt).format('MMM D, YYYY')}
              </Text>
            </Card.Content>
          </Card>
        ))}

        {/* Add Person modal */}
        <Portal>
          <Modal
            visible={modalOpen}
            onDismiss={() => setModalOpen(false)}
            contentContainerStyle={{ backgroundColor: theme.colors.darkDefault, padding: 16, borderRadius: 8, marginHorizontal: 20, alignSelf: 'center', width: '90%', maxWidth: 460, maxHeight: '85%' }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>Add person</Text>

            {/* Band-member autocomplete — collapsed when nothing picked,
                expands to a searchable list of directory entries. */}
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 12 }}>
              BAND MEMBER (OPTIONAL)
            </Text>
            {selectedMember ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: 8, marginTop: 6 }}>
                <MaterialCommunityIcons name="badge-account" size={18} color={theme.colors.primary} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13 }}>{selectedMember.name}</Text>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{selectedMember.upn}</Text>
                </View>
                <Button compact mode="text" textColor={theme.colors.textDarker} onPress={unlinkMember}>
                  Unlink
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
                      const alreadyLinked = linkedMemberIds.has(m.id);
                      return (
                        <TouchableOpacity
                          key={m.id}
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
              label="Email (optional)"
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

            {formError ? <HelperText type="error" visible>{formError}</HelperText> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button mode="text" textColor={theme.colors.textDarker} onPress={() => { setModalOpen(false); resetForm(); }}>Cancel</Button>
              <Button mode="contained" buttonColor={theme.colors.primary} textColor="#fff" onPress={submit} loading={saving} disabled={saving || (!bandMemberId && !displayName.trim())}>
                Add
              </Button>
            </View>
          </Modal>
        </Portal>

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
