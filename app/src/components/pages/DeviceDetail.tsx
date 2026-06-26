import React, { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import { ActivityIndicator, Avatar, Button, Card, Chip, Divider, HelperText, List, Menu, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { DeviceDetailDto } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';
import { deviceIcon, complianceColor, TRUST_LABEL } from 'skintyee/components/pages/Devices';
import { osDisplay, isServer, complianceState, COMPLIANCE_UI } from 'skintyee/components/pages/device-os';
import {
  canDownloadRdp,
  downloadRdp,
  browserRdpUrl,
  browserConfigured,
  gatewayConfigured,
  defaultRdpMode,
  RDP_MODE_LABEL,
  RdpMode,
} from 'skintyee/services/rdp';

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
  // Remote-desktop reachability picker (RD Gateway / LAN / Browser).
  const [rdpMode, setRdpMode] = useState<RdpMode>(defaultRdpMode());
  const [rdpMenu, setRdpMenu] = useState(false);

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
                const cs = complianceState(device.isCompliant, device.isManaged);
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
            {device.lastSignInIp ? <Row label="IP address" value={device.lastSignInIp} /> : null}
            {device.lastSignInLocation ? (
              <View style={{ flexDirection: 'row', marginTop: 6 }}>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, width: 132 }}>Location</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 12 }}>
                    {[device.lastSignInLocation.city, device.lastSignInLocation.state, device.lastSignInLocation.country]
                      .filter(Boolean)
                      .join(', ') || 'Unknown'}
                  </Text>
                  {device.lastSignInLocation.latitude != null && device.lastSignInLocation.longitude != null ? (
                    <Text
                      onPress={() =>
                        Linking.openURL(
                          `https://www.google.com/maps/search/?api=1&query=${device.lastSignInLocation!.latitude},${device.lastSignInLocation!.longitude}`,
                        )
                      }
                      style={{ color: theme.colors.primary, fontSize: 11, marginTop: 2 }}
                    >
                      View on map
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
            {(device.registrationCount ?? 1) > 1 ? (
              <>
                <Divider style={{ marginVertical: 8 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Chip
                    compact
                    icon="content-duplicate"
                    style={{ backgroundColor: theme.colors.accent }}
                    textStyle={{ color: '#000', fontSize: 10 }}
                  >
                    {`${device.registrationCount} registrations`}
                  </Chip>
                </View>
              </>
            ) : null}
          </Card.Content>
        </Card>

        {/windows/i.test(device.operatingSystem) ? (() => {
          const isBrowser = rdpMode === 'browser';
          const actionDisabled = isBrowser ? !browserConfigured() : !canDownloadRdp();
          const onConnect = () => {
            if (isBrowser) {
              const url = browserRdpUrl(device);
              if (url) Linking.openURL(url);
            } else {
              downloadRdp(device, rdpMode);
            }
          };
          const helper = isBrowser
            ? browserConfigured()
              ? 'Opens a clientless RDP session in your browser (Guacamole) — no client app needed.'
              : 'Browser access isn’t configured (no Guacamole host set).'
            : canDownloadRdp()
              ? `Downloads a .rdp for ${RDP_MODE_LABEL[rdpMode]}. Opens in Remote Desktop (Windows) or the free Windows App (Mac / iOS / Android).`
              : 'Open the desktop or web app to download the connection file.';
          return (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 6, marginLeft: 4 }}>
                REMOTE DESKTOP
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginRight: 8 }}>Connect via</Text>
                <Menu
                  visible={rdpMenu}
                  onDismiss={() => setRdpMenu(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      compact
                      icon="chevron-down"
                      contentStyle={{ flexDirection: 'row-reverse' }}
                      textColor={theme.colors.primary}
                      onPress={() => setRdpMenu(true)}
                      style={{ marginRight: 8 }}
                    >
                      {RDP_MODE_LABEL[rdpMode]}
                    </Button>
                  }
                >
                  <Menu.Item
                    title="RD Gateway"
                    leadingIcon="shield-lock-outline"
                    disabled={!gatewayConfigured()}
                    onPress={() => { setRdpMode('gateway'); setRdpMenu(false); }}
                  />
                  <Menu.Item
                    title="LAN / VPN"
                    leadingIcon="lan-connect"
                    onPress={() => { setRdpMode('lan'); setRdpMenu(false); }}
                  />
                  <Menu.Item
                    title="Browser (Guacamole)"
                    leadingIcon="web"
                    disabled={!browserConfigured()}
                    onPress={() => { setRdpMode('browser'); setRdpMenu(false); }}
                  />
                </Menu>
                <Button
                  mode="contained"
                  compact
                  icon={isBrowser ? 'open-in-new' : 'remote-desktop'}
                  disabled={actionDisabled}
                  onPress={onConnect}
                  buttonColor={theme.colors.primary}
                  textColor="#000"
                >
                  {isBrowser ? 'Open in browser' : 'Download .rdp'}
                </Button>
              </View>
              <HelperText type="info" visible style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                {helper}
              </HelperText>
            </View>
          );
        })() : null}

        {device.registrations && device.registrations.length > 1 ? (
          <>
            <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 4, marginLeft: 4 }}>
              {`ENTRA REGISTRATIONS (${device.registrations.length})`}
            </Text>
            <HelperText type="info" visible style={{ color: theme.colors.textDarker, fontSize: 11, marginLeft: 0, marginBottom: 2 }}>
              This one computer has {device.registrations.length} Entra device records. The
              current record is kept; the rest are stale duplicates (typically a Workplace
              registration left behind after Hybrid Entra Join) — safe to delete in Entra.
            </HelperText>
            <Card style={{ backgroundColor: theme.colors.darkDefault }}>
              <Card.Content style={{ paddingVertical: 4 }}>
                {[...device.registrations]
                  .sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1))
                  .map((r, i) => (
                    <React.Fragment key={r.id}>
                      {i > 0 ? <Divider /> : null}
                      <List.Item
                        title={`${TRUST_LABEL[r.trustType]}${r.isManaged ? ' · Intune-managed' : ''}`}
                        description={
                          `Registered ${dayjs(r.registrationDateTime).format('MMM D, YYYY')}` +
                          ` · last sign-in ${dayjs(r.approximateLastSignInDateTime).format('MMM D, YYYY')}` +
                          ` · ${r.userCount} ${r.userCount === 1 ? 'user' : 'users'}` +
                          `\n${r.id}`
                        }
                        titleStyle={{ color: theme.colors.text, fontSize: 13 }}
                        descriptionNumberOfLines={2}
                        descriptionStyle={{ color: theme.colors.textDarker, fontSize: 11 }}
                        left={() => (
                          <List.Icon
                            icon={r.isPrimary ? 'check-decagram' : 'content-duplicate'}
                            color={r.isPrimary ? theme.colors.success : theme.colors.accent}
                          />
                        )}
                        right={() => (
                          <Chip
                            compact
                            style={{ alignSelf: 'center', backgroundColor: r.isPrimary ? theme.colors.success : theme.colors.accent }}
                            textStyle={{ color: '#000', fontSize: 10 }}
                          >
                            {r.isPrimary ? 'Current' : 'Stale'}
                          </Chip>
                        )}
                      />
                    </React.Fragment>
                  ))}
              </Card.Content>
            </Card>
          </>
        ) : null}

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
