import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, HelperText, Modal, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent, AdminAddButton } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { ContractorDto } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// Contractors — admin CRUDs the lightweight Contractor records used as
// assignment targets. Phase 1 is intentionally minimal (no auth, no
// Entra link). Phase 3 may grow this into Entra B2B integration.

export default function Contractors({ navigation }: any) {
  const [contractors, setContractors] = useState<ContractorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      setContractors(await apiFactory().onboarding.listContractors());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!displayName.trim()) { setFormError('Display name is required.'); return; }
    setSaving(true);
    setFormError(undefined);
    try {
      await apiFactory().onboarding.createContractor({
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setModalOpen(false);
      setDisplayName(''); setEmail(''); setPhone('');
      setToast('Contractor added');
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
        <AdminAddButton label="Add contractor" icon="account-plus" onPress={() => setModalOpen(true)} />

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}
        {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}

        {!loading && contractors.length === 0 ? (
          <NoContent message="No contractors yet. Add one to assign onboarding flows." />
        ) : null}

        {contractors.map((c) => (
          <Card key={c.id} style={{ marginTop: 8, backgroundColor: theme.colors.darkDefault }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 14 }}>{c.displayName}</Text>
              {c.email ? <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{c.email}</Text> : null}
              {c.phone ? <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{c.phone}</Text> : null}
              <Text style={{ color: theme.colors.textDarker, fontSize: 10, marginTop: 4 }}>
                Added {dayjs(c.createdAt).format('MMM D, YYYY')}
              </Text>
            </Card.Content>
          </Card>
        ))}

        <Portal>
          <Modal
            visible={modalOpen}
            onDismiss={() => setModalOpen(false)}
            contentContainerStyle={{ backgroundColor: theme.colors.darkDefault, padding: 16, borderRadius: 8, marginHorizontal: 20, alignSelf: 'center', width: '90%', maxWidth: 420 }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>Add contractor</Text>
            <TextInput label="Display name" value={displayName} onChangeText={setDisplayName} mode="outlined" style={{ marginTop: 12 }} />
            <TextInput label="Email (optional)" value={email} onChangeText={setEmail} mode="outlined" autoCapitalize="none" keyboardType="email-address" style={{ marginTop: 8 }} />
            <TextInput label="Phone (optional)" value={phone} onChangeText={setPhone} mode="outlined" keyboardType="phone-pad" style={{ marginTop: 8 }} />
            {formError ? <HelperText type="error" visible>{formError}</HelperText> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button mode="text" textColor={theme.colors.textDarker} onPress={() => setModalOpen(false)}>Cancel</Button>
              <Button mode="contained" buttonColor={theme.colors.primary} textColor="#fff" onPress={submit} loading={saving} disabled={saving || !displayName.trim()}>
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
