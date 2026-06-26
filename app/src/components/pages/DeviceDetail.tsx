import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Avatar, Card, Chip, Divider, HelperText, List, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { DeviceDetailDto } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';
import { deviceIcon, complianceColor, TRUST_LABEL } from 'skintyee/components/pages/Devices';
import { osDisplay, isServer, complianceState, COMPLIANCE_UI } from 'skintyee/components/pages/device-os';

// ----------------------------------------------------------------------------
// DeviceDetail — one Entra device: its properties + the access list (who can
// sign in to it). Owners (registeredOwners) are flagged separately from users
// (registeredUsers). See Devices.tsx + STUBS.md.
// ----------------------------------------------------------------------------

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={{ flexDirection: 'row', marginTop: 6 }}>
    <Text style={{ color: theme.colors.textDarker, fontSize: 12, width: 132 }}>{label}</Text>
    <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1 }}>{value}</Text>
  </View>
);

export default function DeviceDetail({ route }: any) {
  const id = route?.params?.id as string;
  const [device, setDevice] = useState<DeviceDetailDto | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      setDevice(await apiFactory().devices.get(id));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <PageContainer><PageContent><ActivityIndicator style={{ marginTop: 16 }} /></PageContent></PageContainer>;
  }
  if (error || !device) {
    return (
      <PageContainer><PageContent>
        {error ? <HelperText type="error" visible>{error}</HelperText> : <NoContent message="Device not found." />}
      </PageContent></PageContainer>
    );
  }

  // Owners first, then plain users.
  const ordered = [...device.users].sort((a, b) =>
    a.accessType === b.accessType ? 0 : a.accessType === 'owner' ? -1 : 1);

  return (
    <PageContainer>
      <PageContent>
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <List.Icon
                icon={deviceIcon(device.operatingSystem, device.osVersion)}
                color={isServer(device.operatingSystem, device.osVersion) ? theme.colors.accent : theme.colors.primary}
              />
              <View style={{ flex: 1, marginLeft: 4 }}>
                <Text style={{ color: theme.colors.text, fontSize: 18 }}>{device.displayName}</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                  {osDisplay(device.operatingSystem, device.osVersion)}
                </Text>
              </View>
              {(() => {
                const cs = complianceState(device.isCompliant);
                const ui = COMPLIANCE_UI[cs];
                return (
                  <Chip
                    compact
                    icon={ui.icon}
                    style={{ backgroundColor: complianceColor(cs) }}
                    textStyle={{ color: '#000', fontSize: 10 }}
                  >
                    {ui.label}
                  </Chip>
                );
              })()}
            </View>
            <Divider style={{ marginVertical: 8 }} />
            {isServer(device.operatingSystem, device.osVersion) ? (
              <Row label="Device type" value="Windows Server" />
            ) : null}
            <Row label="Join type" value={TRUST_LABEL[device.trustType]} />
            <Row label="Managed (Intune)" value={device.isManaged ? 'Yes' : 'No'} />
            <Row label="Enabled" value={device.enabled ? 'Yes' : 'No — cannot sign in'} />
            <Row label="Last sign-in" value={dayjs(device.approximateLastSignInDateTime).format('MMM D, YYYY h:mm A')} />
            <Row label="Registered" value={dayjs(device.registrationDateTime).format('MMM D, YYYY')} />
          </Card.Content>
        </Card>

        <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 4, marginLeft: 4 }}>
          {`WHO CAN ACCESS (${device.users.length})`}
        </Text>

        {device.users.length === 0 ? (
          <NoContent message="No registered owners or users." />
        ) : (
          <Card style={{ backgroundColor: theme.colors.darkDefault }}>
            <Card.Content style={{ paddingVertical: 4 }}>
              {ordered.map((u, i) => (
                <React.Fragment key={`${u.id}-${u.accessType}`}>
                  {i > 0 ? <Divider /> : null}
                  <List.Item
                    title={u.displayName}
                    description={u.email}
                    titleStyle={{ color: theme.colors.text }}
                    descriptionStyle={{ color: theme.colors.textDarker }}
                    left={() => (
                      <Avatar.Text
                        size={36}
                        label={u.displayName.charAt(0)}
                        style={{ backgroundColor: theme.colors.primary, alignSelf: 'center' }}
                        color="#000"
                      />
                    )}
                    right={() => (
                      <Chip
                        compact
                        icon={u.accessType === 'owner' ? 'account-key' : 'account'}
                        style={{ alignSelf: 'center', backgroundColor: u.accessType === 'owner' ? theme.colors.primary : theme.colors.secondary }}
                        textStyle={{ color: u.accessType === 'owner' ? '#000' : theme.colors.text, fontSize: 10 }}
                      >
                        {u.accessType === 'owner' ? 'Owner' : 'User'}
                      </Chip>
                    )}
                  />
                </React.Fragment>
              ))}
            </Card.Content>
          </Card>
        )}
      </PageContent>
    </PageContainer>
  );
}
