import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Chip, HelperText, IconButton, Switch, Text, TextInput } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, DateTimeField, LocationPicker, LatLng } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { addMeeting } from 'skintyee/store/modules/meetings';
import { loadDirectory } from 'skintyee/store/modules/directory';
import { apiFactory } from 'skintyee/store/apis';
import { MeetingLink } from 'skintyee/models';
import { theme } from 'skintyee/styles';

// Default audience for each meeting type, expressed as a predicate
// over a BandMember row (using the bandGroups column populated from
// Entra). Admin can add/remove individuals after auto-fill.
function defaultAudienceFor(typeSlug: string): (m: any) => boolean {
  switch (typeSlug) {
    case 'band-meeting':
    case 'public-event':
      return (m) => m.accountType === 'licensed-user';
    case 'council-meeting':
    case 'closed-session':
      return (m) => m.accountType === 'licensed-user' && (m.bandGroups ?? []).includes('council');
    case 'staff-meeting':
      return (m) => m.accountType === 'licensed-user' && (m.bandGroups ?? []).includes('management');
    default:
      return (m) => m.accountType === 'licensed-user';
  }
}

// Admin: schedule a band meeting. Posts to /v1/meetings which creates a
// real Microsoft 365 calendar event tagged with the chosen Outlook
// category (Band Meeting / Council Meeting / Staff Meeting / Public
// Event / Closed Session) — see docs/features/meeting-types.md.
//
// Catalog of types + source calendars is fetched from /v1/meetings/types
// on mount.
interface MeetingType { slug: string; displayName: string; category: string; description: string }
interface MeetingSource { index: number; kind: 'user'|'group'; name: string; upn?: string; groupId?: string }

const TYPE_ICONS: Record<string, string> = {
  'band-meeting':    'account-group',
  'council-meeting': 'gavel',
  'staff-meeting':   'briefcase',
  'public-event':    'star',
  'closed-session':  'lock',
};

export default function CreateMeeting({ navigation }: any) {
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<LatLng | undefined>(undefined);
  const [startsAt, setStartsAt] = useState(moment().add(7, 'days').hour(18).minute(0).second(0).toISOString());
  const [agenda, setAgenda] = useState('');
  const [typeSlug, setTypeSlug] = useState<string>('band-meeting');
  const [sourceIndex, setSourceIndex] = useState<number>(0);
  const [isOnlineMeeting, setIsOnlineMeeting] = useState(true);

  const [catalog, setCatalog] = useState<{ types: MeetingType[]; sources: MeetingSource[] }>({ types: [], sources: [] });
  const [catalogError, setCatalogError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  // Optional "Links:" section appended to the event body — round-trips
  // as plain text through Graph and is parsed back into a structured
  // array on read.
  const [links, setLinks] = useState<MeetingLink[]>([]);
  const addLink = () => setLinks((prev) => [...prev, { label: '', url: '' }]);
  const updateLink = (i: number, patch: Partial<MeetingLink>) =>
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLink = (i: number) =>
    setLinks((prev) => prev.filter((_, idx) => idx !== i));

  // Attendees — pulled from the directory in Redux. Auto-defaulted by
  // type but admin can add/remove via chip toggles.
  const directory = useAppSelector((s) => s.directory.entities);
  const licensedUsers = useMemo(
    () => directory.filter((m: any) => m.accountType === 'licensed-user' && m.upn),
    [directory]
  );
  const [attendees, setAttendees] = useState<Set<string>>(new Set());
  // Tracks the typeSlug that auto-populated `attendees` so a manual edit
  // doesn't get overwritten when re-renders refire the effect; only a
  // genuine type change triggers a refill.
  const [attendeesAutoForType, setAttendeesAutoForType] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await (apiFactory() as any).meetings.types();
        if (!cancelled) setCatalog(r);
      } catch (e: any) {
        if (!cancelled) setCatalogError(e?.message ?? String(e));
      }
    })();
    dispatch(loadDirectory());
    return () => { cancelled = true; };
  }, [dispatch]);

  // Auto-fill attendees when the user picks/changes a type, or when the
  // directory finishes loading after we already have a type.
  useEffect(() => {
    if (!typeSlug || licensedUsers.length === 0) return;
    if (attendeesAutoForType === typeSlug) return;   // already filled for this type
    const pred = defaultAudienceFor(typeSlug);
    setAttendees(new Set(licensedUsers.filter(pred).map((m: any) => m.upn.toLowerCase())));
    setAttendeesAutoForType(typeSlug);
  }, [typeSlug, licensedUsers, attendeesAutoForType]);

  const toggleAttendee = (upn: string) => {
    setAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(upn)) next.delete(upn);
      else next.add(upn);
      return next;
    });
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const cleanLinks = links
        .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
        .filter((l) => l.url);
      const created = await (apiFactory() as any).meetings.create({
        typeSlug,
        sourceIndex,
        title: title.trim(),
        agenda: agenda.trim(),
        location: location.trim(),
        startsAt,
        isOnlineMeeting,
        attendees: Array.from(attendees),
        links: cleanLinks,
      });
      // Mirror into Redux for instant display; the next loadMeetings()
      // refetches the canonical record from the api/ via Graph.
      dispatch(
        addMeeting({
          _id: created.id ?? `bm${Date.now()}`,
          title: title.trim(),
          agenda: agenda.trim(),
          location: location.trim(),
          startsAt,
          lat: coords?.lat,
          lng: coords?.lng,
          ...(created.typeSlug ? { type: created.typeSlug } as any : {}),
        })
      );
      navigation.goBack();
    } catch (e: any) {
      setSaveError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const types = catalog.types;
  const sources = catalog.sources;
  const selectedSource = sources.find((s) => s.index === sourceIndex);

  return (
    <PageContainer>
      <PageContent>
        <TextInput label="Title" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 10 }} />

        {/* Type chip selector — matches the 5 SKINTYEE_MEETING_TYPES */}
        <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>
          Meeting type
        </Text>
        <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 4 }}>
          Posts to the chosen calendar and tags the event with this Outlook category.
        </HelperText>
        {catalogError ? (
          <HelperText type="error" visible>Couldn't load meeting types: {catalogError}</HelperText>
        ) : null}
        {types.length === 0 && !catalogError ? <ActivityIndicator style={{ marginVertical: 8 }} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {types.map((t) => {
            const on = typeSlug === t.slug;
            return (
              <Chip
                key={t.slug}
                selected={on}
                showSelectedCheck
                icon={TYPE_ICONS[t.slug] ?? 'calendar'}
                onPress={() => setTypeSlug(t.slug)}
                style={{
                  marginRight: 8,
                  marginBottom: 8,
                  backgroundColor: on ? theme.colors.primary : theme.colors.secondary,
                }}
                textStyle={{ color: on ? '#000' : theme.colors.text, fontSize: 12 }}
              >
                {t.displayName}
              </Chip>
            );
          })}
        </View>

        {/* Source calendar — the 3 MEETING_SOURCE_CALENDARS */}
        {sources.length > 0 ? (
          <>
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>
              On calendar
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
              {sources.map((s) => {
                const on = s.index === sourceIndex;
                return (
                  <Chip
                    key={s.index}
                    selected={on}
                    showSelectedCheck
                    icon="calendar"
                    onPress={() => setSourceIndex(s.index)}
                    style={{
                      marginRight: 8,
                      marginBottom: 8,
                      backgroundColor: on ? theme.colors.primary : theme.colors.secondary,
                    }}
                    textStyle={{ color: on ? '#000' : theme.colors.text, fontSize: 12 }}
                  >
                    {s.name}
                  </Chip>
                );
              })}
            </View>
            <HelperText type="info" visible style={{ marginLeft: -8, marginTop: -8 }}>
              {selectedSource?.kind === 'user'
                ? `Event will appear on ${selectedSource.upn}`
                : `Event will appear on the ${selectedSource?.name} group calendar`}
            </HelperText>
          </>
        ) : null}

        <TextInput label="Location" value={location} onChangeText={setLocation} mode="outlined" style={{ marginBottom: 10 }} />
        {/* Map is hidden by default; tap "Set map pin" to expand. The
            picker's address search is wired to the form's Location
            field so typing in either stays in sync, and "Find"
            geocodes via Nominatim onto the map. */}
        <LocationPicker
          value={coords}
          onChange={setCoords}
          onClear={() => setCoords(undefined)}
          address={location}
          onAddressChange={setLocation}
        />
        <DateTimeField label="Date & time" value={startsAt} onChange={setStartsAt} />
        <TextInput label="Agenda" value={agenda} onChangeText={setAgenda} mode="outlined" multiline numberOfLines={4} style={{ marginBottom: 10 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Switch value={isOnlineMeeting} onValueChange={setIsOnlineMeeting} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.text, marginLeft: 8 }}>Create a Teams join link</Text>
        </View>

        {/* Links — optional list of supporting URLs. Saved as a
            "Links:" section in the event body so Graph round-trips them. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
            🔗  Links
          </Text>
          <Button compact mode="text" icon="plus" textColor={theme.colors.primary} onPress={addLink} style={{ marginLeft: 4 }}>
            Add link
          </Button>
        </View>
        {links.length === 0 ? (
          <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 8 }}>
            Optional. Agendas, supporting documents, or any URL members should have handy.
          </HelperText>
        ) : null}
        {links.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <TextInput
              dense mode="outlined" label="Label" value={l.label}
              onChangeText={(v) => updateLink(i, { label: v })}
              style={{ width: 140, marginRight: 6 }}
            />
            <TextInput
              dense mode="outlined" label="URL" value={l.url}
              onChangeText={(v) => updateLink(i, { url: v })}
              style={{ flex: 1, marginRight: 6 }}
              autoCapitalize="none"
              keyboardType="url"
            />
            <IconButton
              icon="close" size={18}
              iconColor={theme.colors.textDarker}
              onPress={() => removeLink(i)}
            />
          </View>
        ))}

        {/* Attendees — auto-defaulted from the type, tap to add/remove.
            Defaults: Band/Public → all licensed; Council/Closed → council
            group; Staff → management group. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
            Invitees ({attendees.size})
          </Text>
          <Button
            mode="text"
            compact
            onPress={() => {
              if (!typeSlug) return;
              const pred = defaultAudienceFor(typeSlug);
              setAttendees(new Set(licensedUsers.filter(pred).map((m: any) => m.upn.toLowerCase())));
            }}
            textColor={theme.colors.textDarker}
            style={{ marginLeft: 4 }}
          >
            Reset to type default
          </Button>
        </View>
        <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 4 }}>
          Auto-filled by type; tap a name to add/remove.
        </HelperText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {licensedUsers
            .slice()
            .sort((a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? ''))
            .map((m: any) => {
              const on = attendees.has(m.upn.toLowerCase());
              return (
                <Chip
                  key={m._id}
                  selected={on}
                  showSelectedCheck
                  onPress={() => toggleAttendee(m.upn.toLowerCase())}
                  style={{
                    marginRight: 6,
                    marginBottom: 6,
                    backgroundColor: on ? theme.colors.primary : theme.colors.secondary,
                  }}
                  textStyle={{ color: on ? '#000' : theme.colors.text, fontSize: 11 }}
                >
                  {m.name}
                </Chip>
              );
            })}
        </View>

        {saveError ? <HelperText type="error" visible>{saveError}</HelperText> : null}

        <Button
          mode="contained"
          onPress={submit}
          disabled={!title.trim() || saving || !typeSlug}
          buttonColor={theme.colors.primary}
          textColor="#000"
          style={{ marginTop: 8 }}
        >
          {saving ? 'Scheduling in Microsoft 365…' : 'Schedule meeting'}
        </Button>
      </PageContent>
    </PageContainer>
  );
}
