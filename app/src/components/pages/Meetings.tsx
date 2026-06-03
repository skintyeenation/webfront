import React, { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { Button, Card, Chip, IconButton, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent, AdminAddButton, useConfirm } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadMeetings, cancelMeeting, removeMeeting } from 'skintyee/store/modules/meetings';
import { BandMeeting, MeetingLink, TeamsConference } from 'skintyee/models';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Teams meeting block parsing.
//
// Graph returns the meeting body as a long string blending the user's own
// agenda copy with a stock "Microsoft Teams meeting" block (Join URL,
// Meeting ID, Passcode, Help link). Rendering it raw is ugly and the join
// URL is ~200 chars so it wraps awkwardly.
//
// parseAgenda() splits the two: the user's prose stays at the top of the
// card; the Teams details get rendered as a structured, emoji-prefixed
// strip with copy-to-clipboard affordances and shortened display links.
// ----------------------------------------------------------------------------

type TeamsBlock = {
  joinUrl?: string;
  meetingId?: string;
  passcode?: string;
  helpUrl?: string;
};

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseAgenda(agenda?: string): { teams?: TeamsBlock; otherText: string } {
  if (!agenda) return { otherText: '' };
  const flat = stripHtml(agenda);
  if (!/Microsoft Teams meeting/i.test(flat)) return { otherText: flat };

  const joinMatch    = flat.match(/https?:\/\/teams\.microsoft\.com\/(?:meet|l\/meetup-join)\/\S+/i);
  const idMatch      = flat.match(/Meeting ID:\s*([\d\s]+?)(?:\n|Passcode|Help|$)/i);
  const passMatch    = flat.match(/Passcode:\s*(\S+)/i);
  const helpMatch    = flat.match(/https?:\/\/aka\.ms\/\S+/i);

  // Cut everything from "Microsoft Teams meeting" (and the leading
  // underscore divider, if any) onward — that's the chunk we re-render
  // ourselves below.
  const otherText = flat
    .replace(/_{5,}[\s\S]*?Microsoft Teams meeting[\s\S]*$/i, '')
    .replace(/Microsoft Teams meeting[\s\S]*$/i, '')
    .trim();

  return {
    teams: {
      joinUrl:   joinMatch?.[0]?.replace(/[.,)]+$/, ''),
      meetingId: idMatch?.[1]?.trim().replace(/\s+/g, ' '),
      passcode:  passMatch?.[1]?.replace(/[.,)]+$/, ''),
      helpUrl:   helpMatch?.[0]?.replace(/[.,)]+$/, ''),
    },
    otherText,
  };
}

// Display-shorten a URL — keeps the host + a trimmed path so the user
// can tell where it goes, while the copy/open uses the full URL.
function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 22 ? u.pathname.slice(0, 22) + '…' : u.pathname;
    return u.host + path;
  } catch {
    return url.length > 36 ? url.slice(0, 35) + '…' : url;
  }
}

async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  // Native fallback: no clipboard package installed yet — log so the
  // dev console shows the value the user wanted.
  // eslint-disable-next-line no-console
  console.warn('[copy] no clipboard on this platform; value:', text);
  return false;
}

// Driven by the structured fields on BandMeeting first; falls back to
// agenda-string parsing for legacy events that haven't been re-read
// from Graph since the server-side parser shipped.
function MeetingAgenda({ meeting }: { meeting: BandMeeting }) {
  // Prefer structured conference/links on the meeting itself; fall back
  // to inline parsing of the agenda string for legacy/local data.
  const fallback = parseAgenda(meeting.agenda);
  const teams: TeamsBlock | undefined = meeting.conference ?? fallback.teams;
  const links: MeetingLink[] | undefined = meeting.links;
  const otherText = meeting.conference || meeting.links ? (meeting.agenda ?? '') : fallback.otherText;

  const [copiedKey, setCopiedKey] = useState<string | undefined>();
  const doCopy = async (key: string, value: string) => {
    const ok = await copyText(value);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(undefined), 1500);
    }
  };

  // One row in the Teams block: emoji + LABEL + value + copy IconButton.
  const TeamsRow = ({
    icon, label, value, display, link,
  }: { icon: string; label: string; value: string; display?: string; link?: boolean }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
      <Text style={{ width: 22, fontSize: 14 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 9, letterSpacing: 1 }}>{label.toUpperCase()}</Text>
        {link ? (
          <Text
            onPress={() => Linking.openURL(value)}
            style={{ color: theme.colors.primary, fontSize: 13, textDecorationLine: 'underline' }}
            numberOfLines={1}
          >
            {display ?? value}
          </Text>
        ) : (
          <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', letterSpacing: 0.5 }} numberOfLines={1}>
            {display ?? value}
          </Text>
        )}
      </View>
      <IconButton
        icon={copiedKey === label ? 'check' : 'content-copy'}
        size={18}
        iconColor={copiedKey === label ? theme.colors.success : theme.colors.textDarker}
        onPress={() => doCopy(label, value)}
        accessibilityLabel={`Copy ${label}`}
      />
    </View>
  );

  return (
    <View>
      {otherText ? (
        <Text style={{ color: theme.colors.text, marginTop: 8 }}>{otherText}</Text>
      ) : null}
      {teams ? (
        <View
          style={{
            marginTop: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: 6,
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.accent, // app's orange accent
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700' }}>
            📹  Microsoft Teams meeting
          </Text>
          {teams.joinUrl ? (
            <>
              <TeamsRow icon="🔗" label="Join" value={teams.joinUrl} display={shortenUrl(teams.joinUrl)} link />
              <Button
                compact mode="contained" icon="video"
                buttonColor={theme.colors.accent} textColor="#000"
                onPress={() => Linking.openURL(teams.joinUrl!)}
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
              >
                Join Teams
              </Button>
            </>
          ) : null}
          {teams.meetingId ? <TeamsRow icon="🆔" label="Meeting ID" value={teams.meetingId} /> : null}
          {teams.passcode ? <TeamsRow icon="🔒" label="Passcode" value={teams.passcode} /> : null}
          {teams.helpUrl ? <TeamsRow icon="❓" label="Help" value={teams.helpUrl} display={shortenUrl(teams.helpUrl)} link /> : null}
        </View>
      ) : null}
      {links && links.length ? (
        <View
          style={{
            marginTop: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: 6,
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.primary,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700' }}>
            🔗  Links
          </Text>
          {links.map((l, i) => (
            <TeamsRow
              key={`${l.url}-${i}`}
              icon="•"
              label={l.label || l.url}
              value={l.url}
              display={shortenUrl(l.url)}
              link
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Display labels + icons for the 5 meeting types. Catalog lives in
// api/src/skintyee-meeting-types.ts; this mirror keeps the chip render
// dependency-free (no extra fetch per render).
const MEETING_TYPE_LABELS: Record<string, string> = {
  'band-meeting':    'Band Meeting',
  'council-meeting': 'Council',
  'staff-meeting':   'Staff',
  'public-event':    'Public',
  'closed-session':  'Closed Session',
};
const MEETING_TYPE_ICONS: Record<string, string> = {
  'band-meeting':    'account-group',
  'council-meeting': 'gavel',
  'staff-meeting':   'briefcase',
  'public-event':    'star',
  'closed-session':  'lock',
};
const meetingTypeLabel = (slug: string) => MEETING_TYPE_LABELS[slug] ?? slug;
const meetingTypeIcon  = (slug: string) => MEETING_TYPE_ICONS[slug]  ?? 'calendar';

export default function Meetings({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.meetings);
  const isAdmin = useAppSelector((s) => s.auth.role) === 'admin';
  const { confirm, ConfirmHost } = useConfirm();

  useEffect(() => {
    dispatch(loadMeetings());
  }, [dispatch]);

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Add meeting" icon="gavel" onPress={() => navigation.navigate('meetingCreate')} />

        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No scheduled meetings." />
        ) : (
          entities.map((item) => (
            <Card key={item._id} style={{ marginBottom: 12, backgroundColor: theme.colors.darkDefault, opacity: item.cancelled ? 0.6 : 1 }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1, textDecorationLine: item.cancelled ? 'line-through' : 'none' }}>{item.title}</Text>
                  {item.cancelled ? (
                    <Chip compact style={{ backgroundColor: theme.colors.error }} textStyle={{ color: theme.colors.white, fontSize: 11 }}>Cancelled</Chip>
                  ) : null}
                </View>

                {/* Type chip — comes from the Outlook category on the
                    underlying M365 event (band-meeting / council-meeting /
                    staff-meeting / public-event / closed-session). */}
                {(item as any).type ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                    <Chip
                      compact
                      icon={meetingTypeIcon((item as any).type)}
                      style={{ backgroundColor: theme.colors.secondary, marginRight: 6 }}
                      textStyle={{ fontSize: 10 }}
                    >
                      {meetingTypeLabel((item as any).type)}
                    </Chip>
                    {(item as any).source ? (
                      <Chip
                        compact
                        icon="calendar"
                        style={{ backgroundColor: theme.colors.secondary }}
                        textStyle={{ fontSize: 10 }}
                      >
                        {(item as any).source}
                      </Chip>
                    ) : null}
                  </View>
                ) : null}

                <Text style={{ color: theme.colors.accent, marginTop: 4 }}>{moment(item.startsAt).format('ddd, MMM D · h:mm A')}</Text>
                <Text style={{ color: theme.colors.textDarker, marginTop: 2 }}>{item.location}</Text>
                <MeetingAgenda meeting={item} />

                {isAdmin ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                    <Button compact mode="text" icon="pencil" textColor={theme.colors.primary} onPress={() => navigation.navigate('meetingEdit', { id: item._id })}>
                      Edit
                    </Button>
                    <Button
                      compact
                      mode="text"
                      icon={item.cancelled ? 'backup-restore' : 'calendar-remove'}
                      textColor={theme.colors.accent}
                      onPress={() =>
                        item.cancelled
                          ? dispatch(cancelMeeting(item._id))
                          : confirm({ title: 'Cancel meeting?', message: `"${item.title}" will be marked cancelled. You can restore it later.`, confirmLabel: 'Cancel meeting', destructive: true, onConfirm: () => dispatch(cancelMeeting(item._id)) })
                      }
                    >
                      {item.cancelled ? 'Restore' : 'Cancel'}
                    </Button>
                    <Button
                      compact
                      mode="text"
                      icon="delete"
                      textColor={theme.colors.error}
                      onPress={() => confirm({ title: 'Delete meeting?', message: `"${item.title}" will be permanently deleted.`, confirmLabel: 'Delete', destructive: true, onConfirm: () => dispatch(removeMeeting(item._id)) })}
                    >
                      Delete
                    </Button>
                  </View>
                ) : null}
              </Card.Content>
            </Card>
          ))
        )}
        <ConfirmHost />
      </PageContent>
    </PageContainer>
  );
}
