import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, TouchableOpacity, View } from 'react-native';
import { Avatar, Chip, Divider, List, SegmentedButtons, Text } from 'react-native-paper';
import { PageContainer, PageContent, NoContent, AdminAddButton } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadDirectory } from 'skintyee/store/modules/directory';
import { theme } from 'skintyee/styles';

type Filter = 'licensed-user' | 'shared-inbox';

// Compact display for a mailbox UPN — strip the domain to keep chips short.
// "council@skintyee.ca" → "council"
const shortMailbox = (full: string) => full.split('@')[0];

export default function Directory({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.directory);
  const [filter, setFilter] = useState<Filter>('licensed-user');

  useEffect(() => {
    dispatch(loadDirectory());
  }, [dispatch]);

  // Bucket counts so the toggle labels show "Members (N)" / "Shared (M)".
  const { licensed, shared, currentList } = useMemo(() => {
    const lic = entities.filter((e: any) => (e.accountType ?? 'licensed-user') === 'licensed-user');
    const shr = entities.filter((e: any) => e.accountType === 'shared-inbox');
    return {
      licensed: lic,
      shared: shr,
      currentList: filter === 'licensed-user' ? lic : shr,
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
                    description={() => (
                      <View>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                          {item.title ?? item.role}
                          {item.upn ? ` · ${item.upn}` : ''}
                        </Text>
                        {/* Mailbox-access chips: only for licensed users with memberships */}
                        {!isShared && memberships.length > 0 ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                            {memberships.slice(0, 4).map((m) => (
                              <Chip
                                key={m}
                                compact
                                icon="email"
                                style={{ marginRight: 4, marginTop: 2, backgroundColor: theme.colors.secondary }}
                                textStyle={{ fontSize: 10 }}
                              >
                                {shortMailbox(m)}
                              </Chip>
                            ))}
                            {memberships.length > 4 ? (
                              <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginLeft: 4, alignSelf: 'center' }}>
                                +{memberships.length - 4} more
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    )}
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
                          style={{ alignSelf: 'center', marginRight: 8, backgroundColor: theme.colors.accent }}
                          textStyle={{ color: '#000', fontSize: 10 }}
                        >
                          shared
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
