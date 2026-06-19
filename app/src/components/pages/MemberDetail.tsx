import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Avatar, Button, Card, Chip, Divider, HelperText, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { PageContainer, PageContent, NoContent, useConfirm } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadDirectory, loadMember, removeMember } from 'skintyee/store/modules/directory';
import { MailboxAccess } from 'skintyee/services/api/ApiService';
import { apiFactory } from 'skintyee/store/apis';
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

// M365 group slug → group mail. Every M365 group IS a shared mailbox so
// membership surfaces twice (bandGroups + mailboxMemberships). Hide the
// mailbox chip when the matching M365 group chip is already shown.
const M365_SLUG_TO_MAIL: Record<string, string> = {
  'it-project-docs':    'it-project-docs@skintyee.ca',
  'band-members-m365':  'band@skintyee.ca',
  'council-m365':       'council@skintyee.ca',
  'management-m365':    'management@skintyee.ca',
};
const shortMailbox = (full: string) => {
  const local = full.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
};

// Display labels for the 13 Skin Tyee security-group slugs (catalog lives in
// api/src/skintyee-groups.ts). Kept inline here for chip labels so the
// MemberDetail screen doesn't need to fetch the catalog just to render a
// pretty string. Add a new slug here when adding a group to Entra.
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
  'staff':          'Staff',
  // M365 groups
  'it-project-docs':  'IT Project Docs',
  'council-m365':     'Council (M365)',
  'management-m365':  'Management (M365)',
};
const bandGroupLabel = (slug: string) =>
  BAND_GROUP_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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

  // For shared-inbox detail pages (admin only): real-time EXO access list.
  // Populated from /v1/admin/shared-mailboxes/:upn/access. Reloads when
  // the upn changes or we just saved a change.
  const [exoAccess, setExoAccess] = useState<MailboxAccess | undefined>();
  const [exoLoading, setExoLoading] = useState(false);
  const [exoError, setExoError] = useState<string | undefined>();
  const [exoSaving, setExoSaving] = useState(false);

  useEffect(() => {
    if (id) dispatch(loadMember(id));
    // Also ensure the full directory is loaded — we need it for the
    // shared-mailbox inverse lookup ("who has access to chief@") below.
    dispatch(loadDirectory());
  }, [dispatch, id]);

  // Fetch the real EXO access list for shared-inbox pages (admin only).
  const selectedUpn = (selected as any)?.upn;
  const selectedIsShared = (selected as any)?.accountType === 'shared-inbox';
  useEffect(() => {
    if (!isAdmin || !selectedIsShared || !selectedUpn) return;
    let cancelled = false;
    setExoLoading(true);
    setExoError(undefined);
    (async () => {
      try {
        const access = await apiFactory().admin.mailboxAccess(selectedUpn);
        if (!cancelled) setExoAccess(access);
      } catch (e: any) {
        if (!cancelled) setExoError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setExoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, selectedIsShared, selectedUpn]);

  // Grant or revoke access for a user on this shared mailbox.
  const toggleExoUser = async (userUpn: string) => {
    if (!selectedUpn || !exoAccess) return;
    const currentSet = new Set(exoAccess.full.map((u) => u.user.toLowerCase()));
    const desired = new Set(currentSet);
    if (desired.has(userUpn.toLowerCase())) desired.delete(userUpn.toLowerCase());
    else desired.add(userUpn.toLowerCase());

    setExoSaving(true);
    setExoError(undefined);
    try {
      const updated = await apiFactory().admin.setMailboxAccess(selectedUpn, Array.from(desired));
      setExoAccess(updated);
    } catch (e: any) {
      setExoError(e?.message ?? String(e));
    } finally {
      setExoSaving(false);
    }
  };

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
  // Filter mailbox entries that duplicate an M365 group chip already
  // rendered from bandGroups (the Roles card below).
  const bandGroupSlugs: string[] = Array.isArray(m.bandGroups) ? m.bandGroups : [];
  const m365MailsAlreadyShown = new Set(
    bandGroupSlugs.map((s) => M365_SLUG_TO_MAIL[s]).filter(Boolean)
  );
  const memberships: ParsedMembership[] = (m.mailboxMemberships ?? [])
    .map(parseMembership)
    .filter((p: ParsedMembership) => !m365MailsAlreadyShown.has(p.mail.toLowerCase()));
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
            {/* Entra paid-licence badge — flags users on a premium (P1) SKU. */}
            {(m.licenses ?? []).includes('AAD_PREMIUM') ? (
              <Chip compact icon="star-circle" style={{ marginLeft: 6, backgroundColor: theme.colors.success }} textStyle={{ fontSize: 11, color: '#000' }}>
                Entra P1
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

        {/* Skin Tyee security-group memberships — the app's role model.
            Edited via the EditMember screen, which writes back to Entra.
            Split into ENTRA GROUPS + MICROSOFT 365 GROUPS to match the
            EditMember layout (and to make the distinction visible — M365
            groups also surface in Shared mailbox access below). */}
        {(m.bandGroups?.length ?? 0) > 0 ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 14, marginBottom: 8 }}>
                Group memberships
              </Text>
              {(() => {
                const slugs = (m.bandGroups ?? []) as string[];
                // M365_SLUG_TO_MAIL's keys are the catalog's M365 group
                // slugs; everything else is an Entra security group.
                const m365  = slugs.filter((s) => s in M365_SLUG_TO_MAIL);
                const entra = slugs.filter((s) => !(s in M365_SLUG_TO_MAIL));
                const renderRow = (title: string, items: string[]) => items.length === 0 ? null : (
                  <View style={{ marginBottom: 10 }} key={title}>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>
                      {title}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {items.map((slug) => (
                        <Chip
                          key={slug}
                          compact
                          icon="shield-account"
                          style={{ marginRight: 4, marginTop: 2, backgroundColor: theme.colors.secondary }}
                          textStyle={{ fontSize: 11 }}
                        >
                          {bandGroupLabel(slug)}
                        </Chip>
                      ))}
                    </View>
                  </View>
                );
                return (
                  <>
                    {renderRow('Entra groups', entra)}
                    {renderRow('Microsoft 365 groups', m365)}
                  </>
                );
              })()}
            </Card.Content>
          </Card>
        ) : null}

        {/* Microsoft licences — Entra ID P1 (highlighted, paid) + Microsoft
            365 Business Standard. Mirrors the directory card chips. */}
        {!isShared && (m.licenses?.length ?? 0) > 0 ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 14, marginBottom: 8 }}>
                Microsoft licences
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {(m.licenses ?? []).map((p) => {
                  const paid = p === 'AAD_PREMIUM';
                  const label = paid ? 'Entra ID P1'
                    : p === 'O365_BUSINESS_PREMIUM' ? 'Microsoft 365 Business Standard'
                    : p;
                  return (
                    <Chip
                      key={p}
                      compact
                      icon={paid ? 'star-circle' : 'microsoft-office'}
                      style={{ marginRight: 4, marginTop: 2, backgroundColor: paid ? theme.colors.success : theme.colors.secondary }}
                      textStyle={{ fontSize: 11, color: paid ? '#000' : theme.colors.text }}
                    >
                      {label}
                    </Chip>
                  );
                })}
              </View>
            </Card.Content>
          </Card>
        ) : null}

        {/* For licensed users: their shared-mailbox FullAccess grants
            (managed via EXO from the EditMember screen). M365 group
            mailboxes are filtered upstream so they don't appear here AND
            in the Group memberships card above. */}
        {!isShared && memberships.length > 0 ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 14, marginBottom: 8 }}>
                Shared mailbox access
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

        {/* Shared-inbox detail (admin): real-time EXO access list.
            Source: GET /v1/admin/shared-mailboxes/:upn/access — uncached,
            always reflects the current Exchange Online state. Admin can
            tap any licensed user below to toggle FullAccess + SendAs;
            change writes back to EXO via PATCH .../access (may take
            5-30s to propagate but the next render shows fresh state).

            Non-admins fall back to the legacy DB-inferred view below
            (peopleWithAccess) — what the api/ thinks based on the
            mailboxMemberships column. */}
        {isShared && isAdmin ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: theme.colors.text, fontSize: 14 }}>
                  Access to {m.upn}
                </Text>
                {exoSaving ? <ActivityIndicator size="small" /> : null}
              </View>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 8 }}>
                Source: Exchange Online (live). Tap a name to toggle FullAccess + SendAs.
              </Text>
              {exoError ? (
                <HelperText type="error" visible>{exoError}</HelperText>
              ) : null}

              {exoLoading && !exoAccess ? (
                <ActivityIndicator style={{ marginVertical: 16 }} />
              ) : (
                <>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>
                    Currently has access ({exoAccess?.full.length ?? 0})
                  </Text>
                  {(exoAccess?.full.length ?? 0) === 0 ? (
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 12 }}>
                      No one outside system accounts.
                    </Text>
                  ) : (
                    <View style={{ marginBottom: 12 }}>
                      {(exoAccess?.full ?? []).map(({ user }, i) => {
                        const person = (entities as any[]).find((e) => e.upn?.toLowerCase() === user.toLowerCase());
                        const hasSendAs = exoAccess?.sendAs.some((s) => s.user.toLowerCase() === user.toLowerCase());
                        return (
                          <TouchableOpacity key={user} onPress={() => toggleExoUser(user)} disabled={exoSaving}>
                            {i > 0 ? <Divider style={{ marginVertical: 6 }} /> : null}
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                              <Avatar.Text
                                size={32}
                                label={person?.avatarLetter ?? person?.name?.[0] ?? user[0].toUpperCase()}
                                style={{ backgroundColor: theme.colors.primary, marginRight: 10 }}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.colors.text, fontSize: 14 }}>
                                  {person?.name ?? user}
                                </Text>
                                <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{user}</Text>
                              </View>
                              <Chip
                                compact
                                style={{ backgroundColor: theme.colors.secondary, marginRight: 6 }}
                                textStyle={{ fontSize: 10 }}
                              >
                                FullAccess{hasSendAs ? ' + SendAs' : ''}
                              </Chip>
                              <MaterialCommunityIcons name="minus-circle-outline" size={18} color={theme.colors.error} />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* Eligible users — all licensed users not already granted */}
                  {(() => {
                    const granted = new Set((exoAccess?.full ?? []).map((u) => u.user.toLowerCase()));
                    const eligible = (entities as any[])
                      .filter((e) => e.accountType === 'licensed-user' && !granted.has(e.upn?.toLowerCase()));
                    if (eligible.length === 0) return null;
                    return (
                      <>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>
                          Grant access to ({eligible.length})
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                          {eligible.map((p) => (
                            <Chip
                              key={p._id}
                              compact
                              icon="plus"
                              onPress={() => toggleExoUser(p.upn)}
                              disabled={exoSaving}
                              style={{ marginRight: 4, marginTop: 2, backgroundColor: theme.colors.secondary }}
                              textStyle={{ fontSize: 11 }}
                            >
                              {p.name}
                            </Chip>
                          ))}
                        </View>
                      </>
                    );
                  })()}
                </>
              )}
            </Card.Content>
          </Card>
        ) : isShared ? (
          /* Non-admin: read-only DB-inferred view */
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 14, marginBottom: 8 }}>
                Who has access to {m.upn}
              </Text>
              {peopleWithAccess.length === 0 ? (
                <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                  No one has been assigned access in the directory yet.
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
