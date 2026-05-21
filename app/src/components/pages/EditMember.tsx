import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Text, TextInput } from 'react-native-paper';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { updateMember } from 'skintyee/store/modules/directory';
import { BandMember } from 'skintyee/models';
import { theme } from 'skintyee/styles';

const ROLES: BandMember['role'][] = ['Member', 'Staff', 'Council', 'Chief'];

// Admin: edit a band member (in-memory for the POC).
export default function EditMember({ route, navigation }: any) {
  const dispatch = useAppDispatch();
  const id = route?.params?.id;
  const member = useAppSelector((s) => s.directory.entities.find((m) => m._id === id));

  const [name, setName] = useState(member?.name ?? '');
  const [role, setRole] = useState<BandMember['role']>(member?.role ?? 'Member');
  const [title, setTitle] = useState(member?.title ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');

  if (!member) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent message="Member not found." />
        </PageContent>
      </PageContainer>
    );
  }

  const save = () => {
    if (!name.trim()) return;
    dispatch(
      updateMember({
        _id: member._id,
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
        <Button mode="contained" onPress={save} disabled={!name.trim()} buttonColor={theme.colors.primary} textColor="#000" style={{ marginTop: 8 }}>
          Save changes
        </Button>
      </PageContent>
    </PageContainer>
  );
}
