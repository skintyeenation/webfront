import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Switch, Text, TextInput } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppDispatch } from 'skintyee/store';
import { addEvent } from 'skintyee/store/modules/events';
import { theme } from 'skintyee/styles';

// Admin: create a community event (added to the in-memory list for the POC).
export default function CreateEvent({ navigation }: any) {
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(moment().add(7, 'days').format('YYYY-MM-DD'));
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  const submit = () => {
    if (!title.trim()) return;
    dispatch(
      addEvent({
        _id: `e${Date.now()}`,
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        startsAt: moment(date, 'YYYY-MM-DD').toISOString(),
        public: isPublic,
      })
    );
    navigation.goBack();
  };

  return (
    <PageContainer>
      <PageContent>
        <TextInput label="Title" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 10 }} />
        <TextInput label="Location" value={location} onChangeText={setLocation} mode="outlined" style={{ marginBottom: 10 }} />
        <TextInput label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} mode="outlined" style={{ marginBottom: 10 }} />
        <TextInput label="Description" value={description} onChangeText={setDescription} mode="outlined" multiline numberOfLines={4} style={{ marginBottom: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 }}>
          <Text style={{ color: theme.colors.text }}>Public (visible to everyone)</Text>
          <Switch value={isPublic} onValueChange={setIsPublic} color={theme.colors.primary} />
        </View>
        <Button mode="contained" onPress={submit} disabled={!title.trim()} buttonColor={theme.colors.primary} textColor="#000" style={{ marginTop: 8 }}>
          Publish event
        </Button>
      </PageContent>
    </PageContainer>
  );
}
