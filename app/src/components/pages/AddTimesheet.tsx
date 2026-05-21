import React, { useState } from 'react';
import { Button, Text, TextInput } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, DateTimeField } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { addTimeEntry } from 'skintyee/store/modules/timekeeping';
import { theme } from 'skintyee/styles';

// Strip the "(Role)" suffix from the spoofed display name to get the worker name.
const cleanName = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').trim();

// Staff/admins log a timesheet entry for themselves (in-memory for the POC).
export default function AddTimesheet({ navigation }: any) {
  const dispatch = useAppDispatch();
  const authName = useAppSelector((s) => s.auth.name);
  const worker = cleanName(authName) || 'Me';

  const [date, setDate] = useState(moment().toISOString());
  const [hours, setHours] = useState('8');
  const [task, setTask] = useState('');

  const submit = () => {
    const h = parseFloat(hours);
    if (!task.trim() || isNaN(h) || h <= 0) return;
    dispatch(
      addTimeEntry({
        _id: `t${Date.now()}`,
        workerName: worker,
        date,
        hours: h,
        task: task.trim(),
        approved: false,
      })
    );
    navigation.goBack();
  };

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.textDarker, marginBottom: 12 }}>Logging hours as {worker}</Text>
        <DateTimeField label="Date" value={date} onChange={setDate} withTime={false} />
        <TextInput label="Hours" value={hours} onChangeText={setHours} mode="outlined" keyboardType="numeric" style={{ marginBottom: 10 }} />
        <TextInput label="Task / description" value={task} onChangeText={setTask} mode="outlined" multiline numberOfLines={3} style={{ marginBottom: 10 }} />
        <Button mode="contained" onPress={submit} disabled={!task.trim()} buttonColor={theme.colors.primary} textColor="#000" style={{ marginTop: 8 }}>
          Submit timesheet
        </Button>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 8 }}>Submitted entries are pending until an admin approves them.</Text>
      </PageContent>
    </PageContainer>
  );
}
