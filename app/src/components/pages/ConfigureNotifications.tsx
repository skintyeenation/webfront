import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, Divider, HelperText, Snackbar, Switch, Text, TextInput } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { NotificationSettings } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// System → Configure Notifications (admin-only). Global on/off switches for
// each class of system email, plus the sender identity (From + Reply-To)
// applied to every outgoing message. Reads/writes the api/'s
// GET/PUT /v1/admin/notification-settings (SettingsService). In mock mode the
// MockApiService keeps the values in memory so the screen is fully usable.
// ----------------------------------------------------------------------------

type ToggleKey = 'staffOtp' | 'communityNotifications' | 'timesheetEvents' | 'accountDeleted';

const TOGGLES: Array<{ key: ToggleKey; label: string; description: string }> = [
  { key: 'staffOtp',               label: 'Staff sign-in (OTP)',    description: 'One-time password emails when a staff member is added or their password is reset.' },
  { key: 'communityNotifications', label: 'Community notifications', description: 'Band-member notification blasts (Health, Council, Events, News…).' },
  { key: 'timesheetEvents',        label: 'Timesheet updates',      description: 'Submitted, edited, approved and rejected timesheet emails.' },
  { key: 'accountDeleted',         label: 'Staff offboarding',      description: 'Notice to admins when a staff account is removed.' },
];

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function ConfigureNotifications() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      setSettings(await apiFactory().admin.getNotificationSettings());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(undefined);
    try {
      const saved = await apiFactory().admin.updateNotificationSettings(settings);
      setSettings(saved);
      setToast('Saved');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer><PageContent>
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
      </PageContent></PageContainer>
    );
  }
  if (!settings) {
    return (
      <PageContainer><PageContent>
        <NoContent message={error ?? 'Could not load notification settings.'} />
      </PageContent></PageContainer>
    );
  }

  const emailValid = isEmail(settings.fromEmail);
  const replyValid = !settings.replyTo.trim() || isEmail(settings.replyTo);

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.textDarker, fontSize: 13, marginBottom: 12 }}>
          Turn each class of system email on or off globally, and set the address every email is sent from.
        </Text>

        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
          <Card.Title title="System emails" titleStyle={{ color: theme.colors.text, fontSize: 15 }} />
          <Card.Content>
            {TOGGLES.map((t, i) => (
              <View key={t.key}>
                {i > 0 ? <Divider style={{ marginVertical: 10, backgroundColor: '#2A2A2A' }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 15 }}>{t.label}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>{t.description}</Text>
                  </View>
                  <Switch value={settings[t.key]} onValueChange={(v) => set(t.key, v)} color={theme.colors.primary} />
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>

        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
          <Card.Title title="Sender" titleStyle={{ color: theme.colors.text, fontSize: 15 }} />
          <Card.Content>
            <TextInput
              label="From name"
              value={settings.fromName}
              mode="outlined"
              onChangeText={(v) => set('fromName', v)}
              style={{ marginBottom: 10 }}
            />
            <TextInput
              label="From email"
              value={settings.fromEmail}
              mode="outlined"
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(v) => set('fromEmail', v)}
              error={!emailValid}
            />
            <HelperText type={emailValid ? 'info' : 'error'} visible>
              {emailValid ? 'Shown as the sender on every email.' : 'Enter a valid email address.'}
            </HelperText>
            <TextInput
              label="Reply-To (optional)"
              value={settings.replyTo}
              mode="outlined"
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(v) => set('replyTo', v)}
              error={!replyValid}
            />
            <HelperText type={replyValid ? 'info' : 'error'} visible>
              {replyValid ? 'Where replies go. Leave blank to use the From address.' : 'Enter a valid email address or leave blank.'}
            </HelperText>
          </Card.Content>
        </Card>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        <Button
          mode="contained"
          icon="content-save"
          buttonColor={theme.colors.primary}
          textColor="#fff"
          onPress={save}
          disabled={saving || !emailValid || !replyValid || !settings.fromName.trim()}
          loading={saving}
        >
          Save changes
        </Button>

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
