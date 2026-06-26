import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Card, Chip, HelperText, IconButton, List, SegmentedButtons, Switch, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { DeviceDto, DeviceTrustType, DeviceUserDto } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';
import {
  osDisplay,
  isServer,
  complianceState,
  COMPLIANCE_UI,
  type ComplianceState,
} from 'skintyee/components/pages/device-os';
import DeviceNetworkMap from 'skintyee/components/pages/DeviceNetworkMap';

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

// Glyph for a device row: a network-server icon for servers (visually distinct
// from user PCs), otherwise the per-OS glyph.
export const deviceIcon = (operatingSystem: string, osVersion: string): string =>
  isServer(operatingSystem, osVersion) ? 'server-network' : osIcon(operatingSystem);

// Theme colour for each compliance state (success / error / grey).
export const complianceColor = (state: ComplianceState): string =>
  state === 'compliant'
    ? theme.colors.success
    : state === 'noncompliant'
      ? theme.colors.error
      : theme.colors.accent; // 'unknown' = no Intune policy → amber/orange, not red

export const TRUST_LABEL: Record<DeviceTrustType, string> = {
  AzureAd: 'Entra joined',
  Hybrid: 'Hybrid joined',
  Workplace: 'Registered',
};

export default function Devices({ navigation }: any) {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  // Stale / decommissioned machines come back as enabled:false. Show them greyed
  // out and let the admin toggle them out of the way.
  const [showDisabled, setShowDisabled] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');
  // Device ids whose account-chip list is expanded on the card.
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  // Account lists fetched on demand: the real Graph list rows carry only the
  // count, not `users`, so we pull the device detail when a card is expanded.
  // `undefined` = not fetched yet (spinner); `[]` = fetched, none.
  const [fetchedUsers, setFetchedUsers] = useState<Record<string, DeviceUserDto[]>>({});

  // Toggle a device's account-chip list. On expand, fetch its users if the list
  // row didn't include them. Best-effort — never throws into render.
  const toggleUsers = useCallback((d: DeviceDto) => {
    const willExpand = !expandedUsers.has(d.id);
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (willExpand) next.add(d.id);
      else next.delete(d.id);
      return next;
    });
    if (willExpand && !d.users && fetchedUsers[d.id] === undefined) {
      apiFactory().devices.get(d.id)
        .then((detail) => setFetchedUsers((m) => ({ ...m, [d.id]: detail.users ?? [] })))
        .catch(() => setFetchedUsers((m) => ({ ...m, [d.id]: [] })));
    }
  }, [expandedUsers, fetchedUsers]);

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

  // Disabled devices (stale / decommissioned) render greyed out via card opacity.
  const renderCard = (d: DeviceDto) => {
    const server = isServer(d.operatingSystem, d.osVersion);
    const compliance = complianceState(d.isCompliant, d.isManaged);
    const ui = COMPLIANCE_UI[compliance];
    return (
    <Card
      key={d.id}
      style={{ marginTop: 10, backgroundColor: theme.colors.darkDefault, opacity: d.enabled ? 1 : 0.5 }}
      onPress={() => navigation.navigate('deviceDetail', { id: d.id })}
    >
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <List.Icon
            icon={deviceIcon(d.operatingSystem, d.osVersion)}
            color={server ? theme.colors.accent : theme.colors.primary}
          />
          <View style={{ flex: 1, marginLeft: 4 }}>
            <Text style={{ color: theme.colors.text, fontSize: 15 }}>{d.displayName}</Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
              {osDisplay(d.operatingSystem, d.osVersion)}
            </Text>
          </View>
          {!d.enabled ? (
            <Chip compact style={{ backgroundColor: theme.colors.error }} textStyle={{ color: '#000', fontSize: 10 }}>
              Disabled
            </Chip>
          ) : (
            <Chip
              compact
              icon={ui.icon}
              style={{ backgroundColor: complianceColor(compliance) }}
              textStyle={{ color: '#000', fontSize: 10 }}
            >
              {ui.label}
            </Chip>
          )}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          {server ? (
            <Chip
              compact
              icon="server"
              style={{ marginRight: 6, backgroundColor: theme.colors.accent }}
              textStyle={{ color: '#000', fontSize: 10 }}
            >
              Server
            </Chip>
          ) : null}
          <Chip compact style={{ marginRight: 6, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
            {TRUST_LABEL[d.trustType]}
          </Chip>
          <Chip
            compact
            icon="account-multiple"
            onPress={() => toggleUsers(d)}
            style={{ backgroundColor: expandedUsers.has(d.id) ? theme.colors.primary : theme.colors.secondary }}
            textStyle={{ color: expandedUsers.has(d.id) ? '#000' : theme.colors.text, fontSize: 10 }}
          >
            {d.userCount} {d.userCount === 1 ? 'user' : 'users'}
          </Chip>
          <View style={{ flex: 1 }} />
          <Text style={{ color: theme.colors.textDarker, fontSize: 10 }}>
            Last seen {dayjs(d.approximateLastSignInDateTime).format('MMM D, YYYY')}
          </Text>
        </View>
        {expandedUsers.has(d.id) ? (() => {
          const userList = d.users ?? fetchedUsers[d.id];
          if (userList === undefined) {
            return <ActivityIndicator size="small" style={{ alignSelf: 'flex-start', marginTop: 8 }} />;
          }
          if (userList.length === 0) {
            return (
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 6 }}>
                No account details available.
              </Text>
            );
          }
          return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
              {userList.map((u: DeviceUserDto) => (
                <Chip
                  key={u.id}
                  compact
                  icon={u.accessType === 'owner' ? 'account-key' : 'account'}
                  style={{ marginRight: 6, marginBottom: 6, backgroundColor: theme.colors.secondary }}
                  textStyle={{ color: theme.colors.text, fontSize: 10 }}
                >
                  {u.displayName}
                </Chip>
              ))}
            </View>
          );
        })() : null}
      </Card.Content>
    </Card>
    );
  };

  const active = devices.filter((d) => d.enabled);
  const disabled = devices.filter((d) => !d.enabled);

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

        <SegmentedButtons
          value={view}
          onValueChange={(v) => setView(v as 'list' | 'map')}
          style={{ marginTop: 8 }}
          buttons={[
            { value: 'list', label: 'List', icon: 'format-list-bulleted' },
            { value: 'map', label: 'Map', icon: 'graph-outline' },
          ]}
        />

        {view === 'list' && disabled.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Switch value={showDisabled} onValueChange={setShowDisabled} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginLeft: 8 }}>
              Show disabled ({disabled.length})
            </Text>
          </View>
        ) : null}

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : devices.length === 0 ? (
          <NoContent message="No devices registered." />
        ) : view === 'map' ? (
          <DeviceNetworkMap devices={devices} navigation={navigation} />
        ) : (
          <>
            {active.map(renderCard)}
            {showDisabled && disabled.length > 0 ? (
              <>
                <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 18, marginBottom: 2 }}>
                  DISABLED / STALE
                </Text>
                {disabled.map(renderCard)}
              </>
            ) : null}
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}
