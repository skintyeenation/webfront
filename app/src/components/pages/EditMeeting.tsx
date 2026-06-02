import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Chip, HelperText, Switch, Text, TextInput } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent, DateTimeField, LocationPicker, LatLng } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadDirectory } from 'skintyee/store/modules/directory';
import { updateMeeting } from 'skintyee/store/modules/meetings';
import { apiFactory } from 'skintyee/store/apis';
import { theme } from 'skintyee/styles';

// Admin: edit an existing band meeting. Matches the CreateMeeting form
// field-for-field (type chip / source chip / title / location / time /
// agenda / Teams toggle / attendees) so the experience is consistent.
//
// Source is read-only — Graph can't move events between calendars in
// a single PATCH (would require delete+recreate). If you need to move
// an event to a different calendar, delete this one and reschedule.
//
// Saves go through PATCH /v1/meetings/:id which calls Graph PATCH
// against the event's calendar path (derived from sourceIndex).

interface MeetingType { slug: string; displayName: string; category: string; description: string }
interface MeetingSource { index: number; kind: 'me'|'user'|'group'; name: string; upn?: string; groupId?: string }

const TYPE_ICONS: Record<string, string> = {
  'band-meeting':    'account-group',
  'council-meeting': 'gavel',
  'staff-meeting':   'briefcase',
  'public-event':    'star',
  'closed-session':  'lock',
};

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

export default function EditMeeting({ route, navigation }: any) {
  const dispatch = useAppDispatch();
  const id = route?.params?.id;
  const meeting = useAppSelector((s) => s.meetings.entities.find((m: any) => m._id === id));

  // Form state — initialized from the existing meeting
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [location, setLocation] = useState(meeting?.location ?? '');
  const [coords, setCoords] = useState<LatLng | undefined>(
    meeting?.lat != null && meeting?.lng != null ? { lat: meeting.lat, lng: meeting.lng } : undefined
  );
  const [startsAt, setStartsAt] = useState((meeting as any)?.startsAt ?? moment().toISOString());
  const [agenda, setAgenda] = useState(meeting?.agenda ?? '');
  const [typeSlug, setTypeSlug] = useState<string>((meeting as any)?.type ?? 'band-meeting');
  const sourceIndex: number | undefined = (meeting as any)?.sourceIndex;
  const [isOnlineMeeting, setIsOnlineMeeting] = useState<boolean>((meeting as any)?.isOnlineMeeting ?? false);

  const [catalog, setCatalog] = useState<{ types: MeetingType[]; sources: MeetingSource[] }>({ types: [], sources: [] });
  const [catalogError, setCatalogError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  // Attendees prefilled from the existing event's attendees[]
  const directory = useAppSelector((s) => s.directory.entities);
  const licensedUsers = useMemo(
    () => directory.filter((m: any) => m.accountType === 'licensed-user' && m.upn),
    [directory]
  );
  const initialAttendeesKey = JSON.stringify((meeting as any)?.attendees ?? []);
  const [attendees, setAttendees] = useState<Set<string>>(
    new Set(((meeting as any)?.attendees ?? []).map((a: any) => (a.upn ?? '').toLowerCase()).filter(Boolean))
  );
  useEffect(() => {
    setAttendees(new Set(
      ((meeting as any)?.attendees ?? []).map((a: any) => (a.upn ?? '').toLowerCase()).filter(Boolean)
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAttendeesKey]);

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

  if (!meeting) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent message="Meeting not found." />
        </PageContent>
      </PageContainer>
    );
  }

  const toggleAttendee = (upn: string) => {
    setAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(upn)) next.delete(upn);
      else next.add(upn);
      return next;
    });
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      // If this meeting came from Graph (has sourceIndex), patch through
      // the api/'s Graph PATCH endpoint. Otherwise just update Redux.
      if (typeof sourceIndex === 'number') {
        await (apiFactory() as any).meetings.update(meeting._id, {
          sourceIndex,
          typeSlug,
          title: title.trim(),
          agenda: agenda.trim(),
          location: location.trim(),
          startsAt,
          isOnlineMeeting,
          attendees: Array.from(attendees),
        });
      }
      dispatch(
        updateMeeting({
          _id: meeting._id,
          title: title.trim(),
          agenda: agenda.trim(),
          location: location.trim(),
          startsAt,
          lat: coords?.lat,
          lng: coords?.lng,
          ...(typeSlug ? { type: typeSlug } as any : {}),
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
  const currentSource = sources.find((s) => s.index === sourceIndex);

  return (
    <PageContainer>
      <PageContent>
        <TextInput label="Title" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 10 }} />

        {/* Type — editable; updating changes the event's Outlook category */}
        <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>
          Meeting type
        </Text>
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

        {/* Source — read-only on edit. Graph can't move events between
            calendars in a single PATCH. To change source, delete +
            reschedule. */}
        {currentSource ? (
          <>
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>
              On calendar
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              <Chip
                icon="calendar-lock"
                style={{ marginRight: 8, marginBottom: 8, backgroundColor: theme.colors.secondary }}
                textStyle={{ color: theme.colors.text, fontSize: 12 }}
              >
                {currentSource.name}
              </Chip>
            </View>
            <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 4 }}>
              Source calendar can't change on edit. To move this meeting, delete it and reschedule.
            </HelperText>
          </>
        ) : null}

        <TextInput label="Location" value={location} onChangeText={setLocation} mode="outlined" style={{ marginBottom: 10 }} />
        <LocationPicker value={coords} onChange={setCoords} />
        <DateTimeField label="Date & time" value={startsAt} onChange={setStartsAt} />
        <TextInput label="Agenda" value={agenda} onChangeText={setAgenda} mode="outlined" multiline numberOfLines={4} style={{ marginBottom: 10 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Switch value={isOnlineMeeting} onValueChange={setIsOnlineMeeting} />
          <Text style={{ color: theme.colors.text, marginLeft: 8 }}>Has a Teams join link</Text>
        </View>

        {/* Attendees — prefilled from the current event */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
            Invitees ({attendees.size})
          </Text>
          <Button
            mode="text"
            compact
            onPress={() => {
              const pred = defaultAudienceFor(typeSlug);
              setAttendees(new Set(licensedUsers.filter(pred).map((m: any) => m.upn.toLowerCase())));
            }}
            textColor={theme.colors.textDarker}
            style={{ marginLeft: 4 }}
          >
            Reset to type default
          </Button>
        </View>
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
          onPress={save}
          disabled={!title.trim() || saving}
          buttonColor={theme.colors.primary}
          textColor="#000"
          style={{ marginTop: 8 }}
        >
          {saving ? 'Saving to Microsoft 365…' : 'Save changes'}
        </Button>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 8 }}>
          Changes to title, type, date/time, location, agenda, Teams link, and attendees are PATCHed to the underlying M365 calendar event.
        </Text>
      </PageContent>
    </PageContainer>
  );
}
