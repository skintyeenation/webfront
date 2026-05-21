import React, { useState } from 'react';
import { Button, TextInput } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppDispatch } from 'skintyee/store';
import { addMeeting } from 'skintyee/store/modules/meetings';
import { theme } from 'skintyee/styles';

// Admin: schedule a band meeting (in-memory for the POC).
export default function CreateMeeting({ navigation }: any) {
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(moment().add(7, 'days').format('YYYY-MM-DD'));
  const [agenda, setAgenda] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    dispatch(
      addMeeting({
        _id: `bm${Date.now()}`,
        title: title.trim(),
        agenda: agenda.trim(),
        location: location.trim(),
        startsAt: moment(date, 'YYYY-MM-DD').toISOString(),
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
        <TextInput label="Agenda" value={agenda} onChangeText={setAgenda} mode="outlined" multiline numberOfLines={4} style={{ marginBottom: 10 }} />
        <Button mode="contained" onPress={submit} disabled={!title.trim()} buttonColor={theme.colors.primary} textColor="#000" style={{ marginTop: 8 }}>
          Schedule meeting
        </Button>
      </PageContent>
    </PageContainer>
  );
}
