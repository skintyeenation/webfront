import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, TouchableOpacity, View } from 'react-native';
import { Avatar, Chip, Divider, List, SegmentedButtons, Text } from 'react-native-paper';
import { PageContainer, PageContent, NoContent, AdminAddButton } from 'skintyee/components/layout';
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
  const [filter, setFilter] = useState<Filter>('licensed-user');

  useEffect(() => {
    dispatch(loadDirectory());
  }, [dispatch]);

  // Bucket counts so the toggle labels show "Members (N)" / "Shared (M)".
  // Also pre-compute the set of UPNs that are themselves shared mailboxes,
  // so chip rendering can tag those as "shared inbox" instead of "group".
  const { licensed, shared, currentList, sharedMailboxUpns } = useMemo(() => {
    const lic = entities.filter((e: any) => (e.accountType ?? 'licensed-user') === 'licensed-user');
    const shr = entities.filter((e: any) => e.accountType === 'shared-inbox');
    const sharedSet = new Set<string>(shr.map((e: any) => (e.upn ?? '').toLowerCase()));
    return {
      licensed: lic,
      shared: shr,
      currentList: filter === 'licensed-user' ? lic : shr,
      sharedMailboxUpns: sharedSet,
    };
  }, [entities, filter]);

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Add member" onPress={() => navigation.navigate('memberCreate')} />

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
                          {/* Chips: only for licensed users with memberships.
                              Split into two groups visually:
                                - SHARED INBOXES (email icon, accent if owner)
                                - M365 GROUPS (account-group icon, secondary)
                              Owners of either get a star + accent background. */}
                          {!isShared && memberships.length > 0 ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
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
                                    style={{
                                      marginRight: 4,
                                      marginTop: 2,
                                      backgroundColor: theme.colors.secondary,
                                    }}
                                    textStyle={{ fontSize: 10 }}
                                  >
                                    {shortMailbox(mail)}
                                  </Chip>
                                );
                              })}
                              {memberships.length > 8 ? (
                                <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginLeft: 4, alignSelf: 'center' }}>
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
