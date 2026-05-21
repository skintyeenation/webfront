import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Switch, Text, TextInput } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent, DateTimeField, LocationPicker, LatLng } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { updateEvent } from 'skintyee/store/modules/events';
import { theme } from 'skintyee/styles';

// Admin: edit / reschedule an existing community event (in-memory for the POC).
export default function EditEvent({ route, navigation }: any) {
  const dispatch = useAppDispatch();
  const id = route?.params?.id;
  const event = useAppSelector((s) => s.events.entities.find((e) => e._id === id));

  const [title, setTitle] = useState(event?.title ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [coords, setCoords] = useState<LatLng | undefined>(event?.lat != null && event?.lng != null ? { lat: event.lat, lng: event.lng } : undefined);
  const [startsAt, setStartsAt] = useState(event?.startsAt ?? moment().toISOString());
  const [description, setDescription] = useState(event?.description ?? '');
  const [isPublic, setIsPublic] = useState(event?.public ?? true);

  if (!event) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent message="Event not found." />
        </PageContent>
      </PageContainer>
    );
  }

  const save = () => {
    if (!title.trim()) return;
    dispatch(
      updateEvent({
        _id: event._id,
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        startsAt,
        public: isPublic,
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
        <TextInput label="Description" value={description} onChangeText={setDescription} mode="outlined" multiline numberOfLines={4} style={{ marginBottom: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 }}>
          <Text style={{ color: theme.colors.text }}>Public (visible to everyone)</Text>
          <Switch value={isPublic} onValueChange={setIsPublic} color={theme.colors.primary} />
        </View>
        <Button mode="contained" onPress={save} disabled={!title.trim()} buttonColor={theme.colors.primary} textColor="#000" style={{ marginTop: 8 }}>
          Save changes
        </Button>
      </PageContent>
    </PageContainer>
  );
}
