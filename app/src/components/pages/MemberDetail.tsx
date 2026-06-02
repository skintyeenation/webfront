import React, { useEffect, useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Avatar, Button, Card, Chip, Divider, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { PageContainer, PageContent, NoContent, useConfirm } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadDirectory, loadMember, removeMember } from 'skintyee/store/modules/directory';
import Config from 'skintyee/config';
import { theme } from 'skintyee/styles';

// Build the proxied-photo URL — points at the api/'s
// GET /v1/directory/:id/photo endpoint which streams from Graph.
function photoUrl(memberId: string): string | undefined {
  if (!Config.apiServer || Config.apiServer === 'mock' || !/^https?:\/\//.test(Config.apiServer)) {
    return undefined;
  }
  return `${Config.apiServer.replace(/\/+$/, '')}/v1/directory/${memberId}/photo`;
}

type MembershipRel = 'owner' | 'member' | 'manual';
interface ParsedMembership { mail: string; rel: MembershipRel; }
function parseMembership(raw: string): ParsedMembership {
  const [mail, rel] = raw.split('|');
  if (rel === 'owner')  return { mail, rel: 'owner' };
  if (rel === 'member') return { mail, rel: 'member' };
  return { mail, rel: 'manual' };
}
const shortMailbox = (full: string) => {
  const local = full.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
};

function FieldRow({ label, value, icon }: { label: string; value?: string; icon?: string }) {
  if (!value || value === '—') return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      {icon ? <MaterialCommunityIcons name={icon} size={16} color={theme.colors.textDarker} style={{ marginRight: 8 }} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 11, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ color: theme.colors.text, fontSize: 14, marginTop: 2 }}>{value}</Text>
      </View>
    </View>
  );
}

export default function MemberDetail({ route, navigation }: any) {
  const dispatch = useAppDispatch();
  const id = route?.params?.id;
  const { selected, entities, loading } = useAppSelector((s) => s.directory);
  const role = useAppSelector((s) => s.auth.role);
  const canSeeContact = role !== 'public';
  const isAdmin = role === 'admin';
  const { confirm, ConfirmHost } = useConfirm();

  useEffect(() => {
    if (id) dispatch(loadMember(id));
    // Also ensure the full directory is loaded — we need it for the
    // shared-mailbox inverse lookup ("who has access to chief@") below.
    dispatch(loadDirectory());
  }, [dispatch, id]);

  // For shared-inbox detail pages, do the inverse lookup: who in the
  // tenant has THIS upn listed in their mailboxMemberships?
  const peopleWithAccess = useMemo(() => {
    if (!selected || (selected as any).accountType !== 'shared-inbox') return [];
    const myUpn = (selected as any).upn?.toLowerCase();
    if (!myUpn) return [];
    return (entities as any[])
      .filter((e) => e.accountType === 'licensed-user')
      .map((e) => {
        const matches = (e.mailboxMemberships ?? []).find((raw: string) => parseMembership(raw).mail === myUpn);
        if (!matches) return null;
        return { person: e, rel: parseMembership(matches).rel };
      })
      .filter(Boolean) as { person: any; rel: MembershipRel }[];
  }, [selected, entities]);

  if (!selected || selected._id !== id) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent loading={loading} message="Member not found." />
        </PageContent>
      </PageContainer>
    );
  }

  const m: any = selected;
  const isShared = m.accountType === 'shared-inbox';
  const memberships: ParsedMembership[] = (m.mailboxMemberships ?? []).map(parseMembership);
  const ownedGroups   = memberships.filter((x) => x.rel === 'owner');
  const memberGroups  = memberships.filter((x) => x.rel === 'member');
  const manualEntries = memberships.filter((x) => x.rel === 'manual');

  return (
    <PageContainer>
      <PageContent>
        {/* Header — avatar (photo if available, letter fallback) + name + role + account-type badge */}
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          {m.hasPhoto && photoUrl(m._id) ? (
            <Avatar.Image
              size={72}
              source={{ uri: photoUrl(m._id) }}
            />
          ) : (
            <Avatar.Text
              size={72}
              label={m.avatarLetter ?? m.name[0]}
              style={{ backgroundColor: isShared ? theme.colors.accent : theme.colors.primary }}
            />
          )}
          <Text style={{ color: theme.colors.text, fontSize: 22, marginTop: 12 }}>{m.name}</Text>
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            {m.title || m.role ? (
              <Chip compact style={{ marginRight: 6, backgroundColor: theme.colors.secondary }} textStyle={{ fontSize: 11 }}>
                {m.title ?? m.role}
              </Chip>
            ) : null}
            {isShared ? (
              <Chip compact icon="email-multiple-outline" style={{ backgroundColor: theme.colors.secondary }} textStyle={{ fontSize: 11 }}>
                Shared inbox
              </Chip>
            ) : null}
            {m.appRole && m.appRole !== 'member' && m.appRole !== 'public' ? (
              <Chip compact icon="shield-account" style={{ marginLeft: 6, backgroundColor: theme.colors.secondary }} textStyle={{ fontSize: 11 }}>
                {m.appRole}
              </Chip>
            ) : null}
          </View>
        </View>

        {/* Contact + identity card */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
          <Card.Content>
            {canSeeContact ? (
              <>
                <FieldRow label="Email"      value={m.email ?? '—'} icon="email-outline" />
                <FieldRow label="UPN"        value={m.upn} icon="at" />
                <FieldRow label="Phone"      value={m.phone ?? '—'} icon="phone-outline" />
                <FieldRow label="Title"      value={m.title} icon="briefcase-outline" />
                <FieldRow label="Department" value={m.department} icon="domain" />
                <FieldRow
                  label="Account type"
                  value={isShared ? 'Shared inbox (no license)' : 'Licensed user'}
                  icon={isShared ? 'email-multiple-outline' : 'account-key-outline'}
                />
              </>
            ) : (
              <Text style={{ color: theme.colors.textDarker }}>
                Contact details are visible to band members only.
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Manager (if set in Entra) — clickable, navigates to that user's page */}
        {m.managerId && m.managerName ? (
          <TouchableOpacity
            onPress={() => navigation.push('memberDetail', { id: m.managerId })}
          >
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
              <Card.Content style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="account-supervisor-outline" size={20} color={theme.colors.textDarker} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, textTransform: 'uppercase' }}>Manager</Text>
                  <Text style={{ color: theme.colors.text, fontSize: 14, marginTop: 2 }}>{m.managerName}</Text>
                  {m.managerUpn ? (
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 1 }}>{m.managerUpn}</Text>
                  ) : null}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textDarker} />
              </Card.Content>
            </Card>
          </TouchableOpacity>
        ) : null}

        {/* For licensed users: their group memberships + shared mailboxes */}
        {!isShared && memberships.length > 0 ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 14, marginBottom: 8 }}>
                Group memberships
              </Text>
              {ownedGroups.length > 0 ? (
                <>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>
                    Owns ({ownedGroups.length})
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                    {ownedGroups.map(({ mail }) => (
                      <Chip
                        key={mail}
                        compact
                        icon="star"
                        style={{ marginRight: 4, marginTop: 2, backgroundColor: theme.colors.secondary }}
                        textStyle={{ fontSize: 11 }}
                      >
                        {shortMailbox(mail)}
                      </Chip>
                    ))}
                  </View>
                </>
              ) : null}
              {memberGroups.length > 0 ? (
                <>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>
                    Member of ({memberGroups.length})
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                    {memberGroups.map(({ mail }) => (
                      <Chip
                        key={mail}
                        compact
                        icon="account-group"
                        style={{ marginRight: 4, marginTop: 2, backgroundColor: theme.colors.secondary }}
                        textStyle={{ fontSize: 11 }}
                      >
                        {shortMailbox(mail)}
                      </Chip>
                    ))}
                  </View>
                </>
              ) : null}
              {manualEntries.length > 0 ? (
                <>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>
                    Assigned shared inboxes ({manualEntries.length})
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {manualEntries.map(({ mail }) => (
                      <Chip
                        key={mail}
                        compact
                        icon="email"
                        style={{ marginRight: 4, marginTop: 2, backgroundColor: theme.colors.secondary }}
                        textStyle={{ fontSize: 11 }}
                      >
                        {shortMailbox(mail)}
                      </Chip>
                    ))}
                  </View>
                </>
              ) : null}
            </Card.Content>
          </Card>
        ) : null}

        {/* For shared inboxes: inverse lookup — who has access to this mailbox */}
        {isShared ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 14, marginBottom: 8 }}>
                Who has access to {m.upn}
              </Text>
              {peopleWithAccess.length === 0 ? (
                <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                  No one has been assigned access in the directory yet.
                  Use the admin endpoint to add assignments:{'\n'}
                  PATCH /v1/admin/users/&lt;upn&gt;/mailbox-memberships
                </Text>
              ) : (
                <View>
                  {peopleWithAccess.map(({ person, rel }, i) => (
                    <View key={person._id}>
                      {i > 0 ? <Divider style={{ marginVertical: 6 }} /> : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Avatar.Text
                          size={32}
                          label={person.avatarLetter ?? person.name[0]}
                          style={{ backgroundColor: theme.colors.primary, marginRight: 10 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.colors.text, fontSize: 14 }}>{person.name}</Text>
                          <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{person.upn}</Text>
                        </View>
                        <Chip
                          compact
                          icon={rel === 'owner' ? 'star' : 'email'}
                          style={{ backgroundColor: theme.colors.secondary }}
                          textStyle={{ fontSize: 10 }}
                        >
                          {rel === 'owner' ? 'Owner' : rel === 'manual' ? 'Assigned' : 'Member'}
                        </Chip>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Card.Content>
          </Card>
        ) : null}

        {isAdmin ? (
          <Button
            mode="contained"
            icon="account-edit"
            buttonColor={theme.colors.primary}
            textColor="#000"
            style={{ marginTop: 8 }}
            onPress={() => navigation.navigate('memberEdit', { id: m._id })}
          >
            Edit member
          </Button>
        ) : null}

        {isAdmin ? (
          <Button
            mode="outlined"
            icon="account-remove"
            textColor={theme.colors.error}
            style={{ marginTop: 10, borderColor: theme.colors.error }}
            onPress={() =>
              confirm({
                title: 'Remove member?',
                message: `${m.name} will be removed from the directory.`,
                confirmLabel: 'Remove',
                destructive: true,
                onConfirm: () => {
                  dispatch(removeMember(m._id));
                  navigation.goBack();
                },
              })
            }
          >
            Remove member
          </Button>
        ) : null}
        <ConfirmHost />
      </PageContent>
    </PageContainer>
  );
}
