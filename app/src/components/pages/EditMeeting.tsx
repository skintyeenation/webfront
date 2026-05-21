import React, { useState } from 'react';
import { Button, Text, TextInput } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent, DateTimeField, LocationPicker, LatLng } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { updateMeeting } from 'skintyee/store/modules/meetings';
import { theme } from 'skintyee/styles';

// Admin: edit / reschedule an existing band meeting (in-memory for the POC).
export default function EditMeeting({ route, navigation }: any) {
  const dispatch = useAppDispatch();
  const id = route?.params?.id;
  const meeting = useAppSelector((s) => s.meetings.entities.find((m) => m._id === id));

  const [title, setTitle] = useState(meeting?.title ?? '');
  const [location, setLocation] = useState(meeting?.location ?? '');
  const [coords, setCoords] = useState<LatLng | undefined>(meeting?.lat != null && meeting?.lng != null ? { lat: meeting.lat, lng: meeting.lng } : undefined);
  const [startsAt, setStartsAt] = useState(meeting?.startsAt ?? moment().toISOString());
  const [agenda, setAgenda] = useState(meeting?.agenda ?? '');

  if (!meeting) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent message="Meeting not found." />
        </PageContent>
      </PageContainer>
    );
  }

  const save = () => {
    if (!title.trim()) return;
    dispatch(
      updateMeeting({
        _id: meeting._id,
        title: title.trim(),
        agenda: agenda.trim(),
        location: location.trim(),
        startsAt,
        lat: coords?.lat,
        lng: coords?.lng,
      })
    );
    navigation.goBack();
  };

  return (
    <PageContainer>
      <PageContent>
        <TextInput label="Title" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 10 }} />
        <TextInput label="Location" value={location} onChangeText={setLocation} mode="outlined" style={{ marginBottom: 10 }} />
        <LocationPicker value={coords} onChange={setCoords} />
        <DateTimeField label="Date & time (reschedule)" value={startsAt} onChange={setStartsAt} />
        <TextInput label="Agenda" value={agenda} onChangeText={setAgenda} mode="outlined" multiline numberOfLines={4} style={{ marginBottom: 10 }} />
        <Button mode="contained" onPress={save} disabled={!title.trim()} buttonColor={theme.colors.primary} textColor="#000" style={{ marginTop: 8 }}>
          Save changes
        </Button>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 8 }}>Changing the date & time reschedules the meeting.</Text>
      </PageContent>
    </PageContainer>
  );
}
