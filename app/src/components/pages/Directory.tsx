import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, TouchableOpacity, View } from 'react-native';
import { Avatar, Button, Chip, Divider, List, SegmentedButtons, Searchbar, Text } from 'react-native-paper';
import { PageContainer, PageContent, NoContent, AdminAddButton } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadDirectory } from 'skintyee/store/modules/directory';
import { theme } from 'skintyee/styles';

type Filter = 'licensed-user' | 'shared-inbox';

// Compact display for a mailbox UPN — strip the domain + capitalize the
// first letter to keep chips short but readable.
// "council@skintyee.ca" → "Council"
// "it-project-docs@skintyee.ca" → "It-project-docs"
const shortMailbox = (full: string) => {
  const local = full.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
};

// Display labels for the 13 Skin Tyee security-group slugs (catalog lives in
// api/src/skintyee-groups.ts). Kept inline here for chip labels — small,
// rarely changes; keeps the directory render dependency-free.
const BAND_GROUP_LABELS: Record<string, string> = {
  'public':         'Public',
  'band-members':   'Band Members',
  'contractors':    'Contractors',
  'chief':          'Chief',
  'council':        'Council',
  'band-manager':   'Band Manager',
  'management':     'Management',
  'admins':         'Admins',
  'system-admin':   'System Admin',
  'it':             'IT',
  'finance':        'Finance',
  'housing':        'Housing',
  'forestry':       'Forestry',
  'land-resources': 'Land Resources',
  'gis':            'GIS',
  'fire-chief':     'Fire Chief',
  // M365 groups
  'it-project-docs':  'IT Project Docs',
  'council-m365':     'Council (M365)',
  'management-m365':  'Management (M365)',
};
const bandGroupLabel = (slug: string) =>
  BAND_GROUP_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Shared chip styles for the directory row description. Paper's compact
// chip is still ~26px tall and stacks unevenly when rows wrap.
//
//   - outer `chipStyle`     → row-grid: marginRight + marginBottom = true
//                             gap that holds at any row count
//   - `chipContentStyle`    → the icon+text inner container: zero vertical
//                             padding + centered alignment keeps the icon
//                             aligned with the text baseline (Paper's
//                             default lineHeight on Text was offsetting them)
//   - `chipTextStyle`       → just fontSize; no lineHeight override (was
//                             the cause of the misalignment)
const chipRowStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, marginTop: 4 };
const chipStyle = {
  marginRight: 4,
  marginBottom: 4,
  minHeight: 0,                  // let inner content dictate height
  backgroundColor: theme.colors.secondary,
};
const chipContentStyle = {
  alignItems: 'center' as const,
  paddingVertical: 0,
  height: 22,
};
const chipTextStyle = { fontSize: 10 };
const chipOverflowStyle = {
  color: theme.colors.textDarker,
  fontSize: 11,
  marginLeft: 4,
  marginBottom: 4,
  alignSelf: 'center' as const,
};

// Parse "mail|owner" or "mail|member" entries from the seed. Plain "mail"
// (no pipe) is treated as a manual admin entry with role unknown.
type MembershipRel = 'owner' | 'member' | 'manual';
interface ParsedMembership { mail: string; rel: MembershipRel; }
function parseMembership(raw: string): ParsedMembership {
  const [mail, rel] = raw.split('|');
  if (rel === 'owner')  return { mail, rel: 'owner' };
  if (rel === 'member') return { mail, rel: 'member' };
  return { mail, rel: 'manual' };
}

// Strip the "Member" role from the description — everyone in the directory
// is a member, so it adds no information. Show the role ONLY if it's
// something distinctive (Chief / Council / Staff).
function meaningfulRole(role?: string): string | undefined {
  if (!role || role.toLowerCase() === 'member') return undefined;
  return role;
}

export default function Directory({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.directory);
  const role = useAppSelector((s) => s.auth.role);
  const isAdmin = role === 'admin';
  const [filter, setFilter] = useState<Filter>('licensed-user');
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | undefined>();
  const [syncSummary, setSyncSummary] = useState<string | undefined>();

  useEffect(() => {
    dispatch(loadDirectory());
  }, [dispatch]);

  const runSync = async () => {
    setSyncing(true);
    setSyncError(undefined);
    setSyncSummary(undefined);
    try {
      const r = await apiFactory().admin.sync();
      // Refresh the local Redux state
      await dispatch(loadDirectory());
      setSyncSummary(
        `${r.total} from Entra (${r.inserted} new, ${r.updated} existing, ${r.disabled} disabled); ` +
        `EXO: ${r.reconcile?.users ?? 0} users across ${r.reconcile?.mailboxes ?? 0} mailboxes (${r.reconcile?.grants ?? 0} grants)`
      );
    } catch (e: any) {
      setSyncError(e?.message ?? String(e));
    } finally {
      setSyncing(false);
    }
  };

  // Bucket counts so the toggle labels show "Members (N)" / "Shared (M)".
  // Also pre-compute the set of UPNs that are themselves shared mailboxes,
  // so chip rendering can tag those as "shared inbox" instead of "group".
  // Search filters AFTER bucketing — i.e. the tab still shows accurate
  // bucket totals, but the rendered list narrows to matches.
  const { licensed, shared, currentList, sharedMailboxUpns } = useMemo(() => {
    const lic = entities.filter((e: any) => (e.accountType ?? 'licensed-user') === 'licensed-user');
    const shr = entities.filter((e: any) => e.accountType === 'shared-inbox');
    const sharedSet = new Set<string>(shr.map((e: any) => (e.upn ?? '').toLowerCase()));

    const base = filter === 'licensed-user' ? lic : shr;
    const q = query.trim().toLowerCase();
    // Match on: name, email, upn, the legacy role field, the appRole
    // (admin/staff/member/public), and any bandGroups slug or its display
    // label (so a search for "council" matches Skin Tyee Council members).
    const matches = (e: any) => {
      if (!q) return true;
      const hay = [
        e.name,
        e.email,
        e.upn,
        e.title,
        e.role,
        e.appRole,
        ...(e.bandGroups ?? []),
        ...(e.bandGroups ?? []).map((slug: string) => bandGroupLabel(slug)),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    };

    return {
      licensed: lic,
      shared: shr,
      currentList: base.filter(matches),
      sharedMailboxUpns: sharedSet,
    };
  }, [entities, filter, query]);

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Add member" onPress={() => navigation.navigate('memberCreate')} />

        {/* Admin Sync — pull fresh from Entra + reconcile Exchange Online
            mailbox permissions into the directory. Takes 20-60s typically. */}
        {isAdmin ? (
          <View style={{ marginBottom: 12 }}>
            <Button
              mode="outlined"
              icon={syncing ? undefined : 'sync'}
              onPress={runSync}
              disabled={syncing}
              textColor={theme.colors.text}
              style={{ borderColor: theme.colors.secondary }}
            >
              {syncing ? 'Syncing… (may take 30-60s)' : 'Sync from Entra + Exchange'}
            </Button>
            {syncing ? <ActivityIndicator size="small" style={{ marginTop: 4 }} /> : null}
            {syncError ? (
              <Text style={{ color: theme.colors.error, fontSize: 11, marginTop: 4 }}>
                {syncError}
              </Text>
            ) : null}
            {syncSummary ? (
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 4 }}>
                {syncSummary}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Search — matches on name, email, upn, title, role, appRole,
            and any bandGroup slug or display label. */}
        <Searchbar
          placeholder="Search by name, email, or role"
          value={query}
          onChangeText={setQuery}
          mode="bar"
          style={{ marginBottom: 8, backgroundColor: theme.colors.darkDefault }}
          inputStyle={{ color: theme.colors.text, fontSize: 14 }}
          iconColor={theme.colors.textDarker}
          placeholderTextColor={theme.colors.textDarker}
        />

        {/* Account-type toggle: Members (licensed users) | Shared inboxes */}
        <SegmentedButtons
          value={filter}
          onValueChange={(v) => setFilter(v as Filter)}
          density="small"
          style={{ marginBottom: 12 }}
          buttons={[
            { value: 'licensed-user', label: `Members${licensed.length ? ` (${licensed.length})` : ''}`, icon: 'account-multiple' },
            { value: 'shared-inbox',  label: `Shared${shared.length ? ` (${shared.length})` : ''}`,      icon: 'email-multiple-outline' },
          ]}
        />

        {currentList.length === 0 ? (
          <NoContent
            loading={loading || !loaded}
            message={filter === 'licensed-user' ? 'No band members listed.' : 'No shared inboxes listed.'}
          />
        ) : (
          <FlatList
            data={currentList}
            keyExtractor={(item: any) => item._id}
            ItemSeparatorComponent={() => <Divider />}
            renderItem={({ item }: { item: any }) => {
              const isShared = item.accountType === 'shared-inbox';
              const memberships: string[] = Array.isArray(item.mailboxMemberships) ? item.mailboxMemberships : [];
              return (
                <TouchableOpacity onPress={() => navigation.navigate('memberDetail', { id: item._id })}>
                  <List.Item
                    title={item.name}
                    description={() => {
                      // Description = title OR distinctive role (Chief/Council/Staff)
                      // + the UPN. Drops "Member" since everyone is a member —
                      // adds no information.
                      const lead = item.title ?? meaningfulRole(item.role);
                      const descParts = [lead, item.upn].filter(Boolean);
                      return (
                        <View>
                          <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                            {descParts.join(' · ')}
                          </Text>
                          {/* Skin Tyee roles — Entra security-group memberships
                              (catalog at api/src/skintyee-groups.ts). Shown as
                              shield-account chips above the mailbox chips. */}
                          {(item.bandGroups?.length ?? 0) > 0 ? (
                            <View style={chipRowStyle}>
                              {(item.bandGroups as string[]).slice(0, 8).map((slug) => (
                                <Chip
                                  key={`bg-${slug}`}
                                  compact
                                  icon="shield-account"
                                  style={chipStyle}
                                  contentStyle={chipContentStyle}
                                  textStyle={chipTextStyle}
                                >
                                  {bandGroupLabel(slug)}
                                </Chip>
                              ))}
                              {item.bandGroups.length > 8 ? (
                                <Text style={chipOverflowStyle}>
                                  +{item.bandGroups.length - 8} more
                                </Text>
                              ) : null}
                            </View>
                          ) : null}

                          {/* Chips: only for licensed users with memberships.
                              Split into two groups visually:
                                - SHARED INBOXES (email icon, accent if owner)
                                - M365 GROUPS (account-group icon, secondary)
                              Owners of either get a star + accent background. */}
                          {!isShared && memberships.length > 0 ? (
                            <View style={chipRowStyle}>
                              {memberships.slice(0, 8).map((raw) => {
                                const { mail, rel } = parseMembership(raw);
                                const isOwner = rel === 'owner';
                                const isSharedInbox = sharedMailboxUpns.has(mail);
                                // All chips share the secondary background. Owners get
                                // the star icon as the differentiator (no shouty color).
                                // Shared inboxes get the email icon; M365 groups get
                                // account-group.
                                const icon = isOwner ? 'star' :
                                             isSharedInbox ? 'email' : 'account-group';
                                return (
                                  <Chip
                                    key={raw}
                                    compact
                                    icon={icon}
                                    style={chipStyle}
                                    contentStyle={chipContentStyle}
                                    textStyle={chipTextStyle}
                                  >
                                    {shortMailbox(mail)}
                                  </Chip>
                                );
                              })}
                              {memberships.length > 8 ? (
                                <Text style={chipOverflowStyle}>
                                  +{memberships.length - 8} more
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      );
                    }}
                    titleStyle={{ color: theme.colors.text }}
                    left={() => (
                      <Avatar.Text
                        size={40}
                        label={item.avatarLetter ?? item.name[0]}
                        style={{
                          backgroundColor: isShared ? theme.colors.accent : theme.colors.primary,
                        }}
                      />
                    )}
                    right={() =>
                      isShared ? (
                        <Chip
                          compact
                          icon="email-multiple-outline"
                          style={{ alignSelf: 'center', marginRight: 8, backgroundColor: theme.colors.secondary }}
                          textStyle={{ fontSize: 10 }}
                        >
                          Shared
                        </Chip>
                      ) : null
                    }
                  />
                </TouchableOpacity>
              );
            }}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
