import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Card, Chip, HelperText, IconButton, List, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { DeviceDto, DeviceTrustType } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Devices (Assets) — admin inventory of Entra-registered devices.
//
// List view: one card per device with OS, join type, compliance, and the
// count of users who can access it. Tap → DeviceDetail (the access list).
// Data is Microsoft Graph /devices via the api/ (mocked in the POC — see
// services/api/mock/fixtures.ts + STUBS.md).
// ----------------------------------------------------------------------------

// Map a device's operatingSystem string → a MaterialCommunityIcons glyph.
// Exported so DeviceDetail reuses the same mapping.
export const osIcon = (os: string): string => {
  const s = os.toLowerCase();
  if (s.includes('server')) return 'server';
  if (s.includes('windows')) return 'microsoft-windows';
  if (s.includes('ipad')) return 'tablet';
  if (s.includes('ios')) return 'apple-ios';
  if (s.includes('mac')) return 'apple';
  if (s.includes('android')) return 'android';
  return 'devices';
};

export const TRUST_LABEL: Record<DeviceTrustType, string> = {
  AzureAd: 'Entra joined',
  Hybrid: 'Hybrid joined',
  Workplace: 'Registered',
};

export default function Devices({ navigation }: any) {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      setDevices(await apiFactory().devices.list());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <PageContainer>
      <PageContent>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.textDarker, fontSize: 12, flex: 1 }}>
            Entra-registered devices. Tap a device to see who can access it.
          </Text>
          <IconButton
            icon="refresh"
            size={20}
            iconColor={theme.colors.primary}
            disabled={loading}
            onPress={load}
            accessibilityLabel="Refresh devices"
          />
        </View>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : devices.length === 0 ? (
          <NoContent message="No devices registered." />
        ) : (
          devices.map((d) => (
            <Card
              key={d.id}
              style={{ marginTop: 10, backgroundColor: theme.colors.darkDefault }}
              onPress={() => navigation.navigate('deviceDetail', { id: d.id })}
            >
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <List.Icon icon={osIcon(d.operatingSystem)} color={theme.colors.primary} />
                  <View style={{ flex: 1, marginLeft: 4 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 15 }}>{d.displayName}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                      {d.operatingSystem} {d.osVersion}
                    </Text>
                  </View>
                  {!d.enabled ? (
                    <Chip compact style={{ backgroundColor: theme.colors.error }} textStyle={{ color: '#000', fontSize: 10 }}>
                      Disabled
                    </Chip>
                  ) : (
                    <Chip
                      compact
                      icon={d.isCompliant ? 'shield-check' : 'shield-alert'}
                      style={{ backgroundColor: d.isCompliant ? theme.colors.success : theme.colors.error }}
                      textStyle={{ color: '#000', fontSize: 10 }}
                    >
                      {d.isCompliant ? 'Compliant' : 'Non-compliant'}
                    </Chip>
                  )}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                  <Chip compact style={{ marginRight: 6, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                    {TRUST_LABEL[d.trustType]}
                  </Chip>
                  <Chip compact icon="account-multiple" style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                    {d.userCount} {d.userCount === 1 ? 'user' : 'users'}
                  </Chip>
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: theme.colors.textDarker, fontSize: 10 }}>
                    Last seen {dayjs(d.approximateLastSignInDateTime).format('MMM D, YYYY')}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          ))
        )}
      </PageContent>
    </PageContainer>
  );
}
