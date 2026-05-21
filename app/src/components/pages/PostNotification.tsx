import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Text, TextInput } from 'react-native-paper';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppDispatch } from 'skintyee/store';
import { addNotification } from 'skintyee/store/modules/notifications';
import { NotificationCategory } from 'skintyee/models';
import { theme } from 'skintyee/styles';

const CATEGORIES: NotificationCategory[] = ['Health', 'Safety', 'Council', 'Events', 'Programs', 'News', 'Announcements'];

// Admin: post a notification. Categories match the skintyee.ca WordPress taxonomy.
export default function PostNotification({ navigation }: any) {
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<NotificationCategory>('Announcements');

  const submit = () => {
    if (!title.trim()) return;
    dispatch(
      addNotification({
        _id: `n${Date.now()}`,
        title: title.trim(),
        body: body.trim(),
        category,
        createdAt: new Date().toISOString(),
        read: false,
      })
    );
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
        <Button mode="contained" onPress={submit} disabled={!title.trim()} buttonColor={theme.colors.primary} textColor="#000" style={{ marginTop: 8 }}>
          Post notification
        </Button>
      </PageContent>
    </PageContainer>
  );
}
