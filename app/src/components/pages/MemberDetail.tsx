import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Avatar, Button, Card, Chip, Text } from 'react-native-paper';
import { PageContainer, PageContent, NoContent, useConfirm } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadMember, removeMember } from 'skintyee/store/modules/directory';
import { theme } from 'skintyee/styles';

export default function MemberDetail({ route, navigation }: any) {
  const dispatch = useAppDispatch();
  const id = route?.params?.id;
  const { selected, loading } = useAppSelector((s) => s.directory);
  // Public users do not see contact details; members and admins do.
  const role = useAppSelector((s) => s.auth.role);
  const canSeeContact = role !== 'public'; // members, staff, admins
  const isAdmin = role === 'admin';
  const { confirm, ConfirmHost } = useConfirm();

  useEffect(() => {
    if (id) dispatch(loadMember(id));
  }, [dispatch, id]);

  if (!selected || selected._id !== id) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent loading={loading} message="Member not found." />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageContent>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Avatar.Text size={72} label={selected.avatarLetter ?? selected.name[0]} style={{ backgroundColor: theme.colors.primary }} />
          <Text style={{ color: theme.colors.text, fontSize: 22, marginTop: 12 }}>{selected.name}</Text>
          <Chip style={{ marginTop: 8, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text }}>
            {selected.title ?? selected.role}
          </Chip>
        </View>
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Content>
            {canSeeContact ? (
              <>
                <Text style={{ color: theme.colors.textDarker }}>Email</Text>
                <Text style={{ color: theme.colors.text, marginBottom: 12 }}>{selected.email ?? '—'}</Text>
                <Text style={{ color: theme.colors.textDarker }}>Phone</Text>
                <Text style={{ color: theme.colors.text }}>{selected.phone ?? '—'}</Text>
              </>
            ) : (
              <Text style={{ color: theme.colors.textDarker }}>Contact details are visible to band members only.</Text>
            )}
          </Card.Content>
        </Card>

        {isAdmin ? (
          <Button
            mode="contained"
            icon="account-edit"
            buttonColor={theme.colors.primary}
            textColor="#000"
            style={{ marginTop: 16 }}
            onPress={() => navigation.navigate('memberEdit', { id: selected._id })}
          >
            Edit member
          </Button>
        ) : null}

        {isAdmin ? (
          <Button
            mode="outlined"
            icon="account-remove"
            textColor={theme.colors.error}
            style={{ marginTop: 10, borderColor: theme.colors.error }}
            onPress={() =>
              confirm({
                title: 'Remove member?',
                message: `${selected.name} will be removed from the directory.`,
                confirmLabel: 'Remove',
                destructive: true,
                onConfirm: () => {
                  dispatch(removeMember(selected._id));
                  navigation.goBack();
                },
              })
            }
          >
            Remove member
          </Button>
        ) : null}
        <ConfirmHost />
      </PageContent>
    </PageContainer>
  );
}
