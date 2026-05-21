import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Text, TextInput } from 'react-native-paper';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { updateNotification } from 'skintyee/store/modules/notifications';
import { NotificationCategory } from 'skintyee/models';
import { theme } from 'skintyee/styles';

const CATEGORIES: NotificationCategory[] = ['Health', 'Safety', 'Council', 'Events', 'Programs', 'News', 'Announcements'];

// Admin: edit an existing notification (in-memory for the POC).
export default function EditNotification({ route, navigation }: any) {
  const dispatch = useAppDispatch();
  const id = route?.params?.id;
  const notification = useAppSelector((s) => s.notifications.entities.find((n) => n._id === id));

  const [title, setTitle] = useState(notification?.title ?? '');
  const [body, setBody] = useState(notification?.body ?? '');
  const [category, setCategory] = useState<NotificationCategory>(notification?.category ?? 'Announcements');

  if (!notification) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent message="Notification not found." />
        </PageContent>
      </PageContainer>
    );
  }

  const save = () => {
    if (!title.trim()) return;
    dispatch(updateNotification({ _id: notification._id, title: title.trim(), body: body.trim(), category }));
    navigation.goBack();
  };

  return (
    <PageContainer>
      <PageContent>
        <TextInput label="Title" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 10 }} />
        <TextInput label="Message" value={body} onChangeText={setBody} mode="outlined" multiline numberOfLines={4} style={{ marginBottom: 12 }} />
        <Text style={{ color: theme.colors.textDarker, marginBottom: 8 }}>Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              selected={category === c}
              onPress={() => setCategory(c)}
              style={{ marginRight: 8, marginBottom: 8, backgroundColor: category === c ? theme.colors.primary : theme.colors.secondary }}
              textStyle={{ color: category === c ? '#000' : theme.colors.text, fontSize: 12 }}
            >
              {c}
            </Chip>
          ))}
        </View>
        <Button mode="contained" onPress={save} disabled={!title.trim()} buttonColor={theme.colors.primary} textColor="#000" style={{ marginTop: 8 }}>
          Save changes
        </Button>
      </PageContent>
    </PageContainer>
  );
}
