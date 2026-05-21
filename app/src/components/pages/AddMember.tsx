import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Text, TextInput } from 'react-native-paper';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppDispatch } from 'skintyee/store';
import { addMember } from 'skintyee/store/modules/directory';
import { BandMember } from 'skintyee/models';
import { theme } from 'skintyee/styles';

const ROLES: BandMember['role'][] = ['Member', 'Staff', 'Council', 'Chief'];

// Admin: add a band member to the directory (in-memory).
export default function AddMember({ navigation }: any) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [role, setRole] = useState<BandMember['role']>('Member');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    dispatch(
      addMember({
        _id: `m${Date.now()}`,
        name: name.trim(),
        role,
        title: title.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        avatarLetter: name.trim()[0]?.toUpperCase(),
      })
    );
    navigation.goBack();
  };

  return (
    <PageContainer>
      <PageContent>
        <TextInput label="Full name" value={name} onChangeText={setName} mode="outlined" style={{ marginBottom: 10 }} />
        <Text style={{ color: theme.colors.textDarker, marginBottom: 8 }}>Role</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {ROLES.map((r) => (
            <Chip
              key={r}
              selected={role === r}
              onPress={() => setRole(r)}
              style={{ marginRight: 8, marginBottom: 8, backgroundColor: role === r ? theme.colors.primary : theme.colors.secondary }}
              textStyle={{ color: role === r ? '#000' : theme.colors.text, fontSize: 12 }}
            >
              {r}
            </Chip>
          ))}
        </View>
        <TextInput label="Title (optional)" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 10 }} />
        <TextInput label="Email (optional)" value={email} onChangeText={setEmail} mode="outlined" autoCapitalize="none" keyboardType="email-address" style={{ marginBottom: 10 }} />
        <TextInput label="Phone (optional)" value={phone} onChangeText={setPhone} mode="outlined" keyboardType="phone-pad" style={{ marginBottom: 10 }} />
        <Button mode="contained" onPress={submit} disabled={!name.trim()} buttonColor={theme.colors.primary} textColor="#000" style={{ marginTop: 8 }}>
          Add member
        </Button>
      </PageContent>
    </PageContainer>
  );
}
