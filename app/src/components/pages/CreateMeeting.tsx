import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Chip, HelperText, Switch, Text, TextInput } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, DateTimeField, LocationPicker, LatLng } from 'skintyee/components/layout';
import { useAppDispatch } from 'skintyee/store';
import { addMeeting } from 'skintyee/store/modules/meetings';
import { apiFactory } from 'skintyee/store/apis';
import { theme } from 'skintyee/styles';

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
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const created = await (apiFactory() as any).meetings.create({
        typeSlug,
        sourceIndex,
        title: title.trim(),
        agenda: agenda.trim(),
        location: location.trim(),
        startsAt,
        isOnlineMeeting,
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
        <LocationPicker value={coords} onChange={setCoords} />
        <DateTimeField label="Date & time" value={startsAt} onChange={setStartsAt} />
        <TextInput label="Agenda" value={agenda} onChangeText={setAgenda} mode="outlined" multiline numberOfLines={4} style={{ marginBottom: 10 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Switch value={isOnlineMeeting} onValueChange={setIsOnlineMeeting} />
          <Text style={{ color: theme.colors.text, marginLeft: 8 }}>Create a Teams join link</Text>
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
