import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent, AdminAddButton, useConfirm } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadMeetings, cancelMeeting, removeMeeting } from 'skintyee/store/modules/meetings';
import { theme } from 'skintyee/styles';

export default function Meetings({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.meetings);
  const isAdmin = useAppSelector((s) => s.auth.role) === 'admin';
  const { confirm, ConfirmHost } = useConfirm();

  useEffect(() => {
    dispatch(loadMeetings());
  }, [dispatch]);

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Add meeting" icon="gavel" onPress={() => navigation.navigate('meetingCreate')} />

        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No scheduled meetings." />
        ) : (
          entities.map((item) => (
            <Card key={item._id} style={{ marginBottom: 12, backgroundColor: theme.colors.darkDefault, opacity: item.cancelled ? 0.6 : 1 }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1, textDecorationLine: item.cancelled ? 'line-through' : 'none' }}>{item.title}</Text>
                  {item.cancelled ? (
                    <Chip compact style={{ backgroundColor: theme.colors.error }} textStyle={{ color: theme.colors.white, fontSize: 11 }}>Cancelled</Chip>
                  ) : null}
                </View>
                <Text style={{ color: theme.colors.accent, marginTop: 4 }}>{moment(item.startsAt).format('ddd, MMM D · h:mm A')}</Text>
                <Text style={{ color: theme.colors.textDarker, marginTop: 2 }}>{item.location}</Text>
                <Text style={{ color: theme.colors.text, marginTop: 8 }}>{item.agenda}</Text>

                {isAdmin ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                    <Button compact mode="text" icon="pencil" textColor={theme.colors.primary} onPress={() => navigation.navigate('meetingEdit', { id: item._id })}>
                      Edit
                    </Button>
                    <Button
                      compact
                      mode="text"
                      icon={item.cancelled ? 'backup-restore' : 'calendar-remove'}
                      textColor={theme.colors.accent}
                      onPress={() =>
                        item.cancelled
                          ? dispatch(cancelMeeting(item._id))
                          : confirm({ title: 'Cancel meeting?', message: `"${item.title}" will be marked cancelled. You can restore it later.`, confirmLabel: 'Cancel meeting', destructive: true, onConfirm: () => dispatch(cancelMeeting(item._id)) })
                      }
                    >
                      {item.cancelled ? 'Restore' : 'Cancel'}
                    </Button>
                    <Button
                      compact
                      mode="text"
                      icon="delete"
                      textColor={theme.colors.error}
                      onPress={() => confirm({ title: 'Delete meeting?', message: `"${item.title}" will be permanently deleted.`, confirmLabel: 'Delete', destructive: true, onConfirm: () => dispatch(removeMeeting(item._id)) })}
                    >
                      Delete
                    </Button>
                  </View>
                ) : null}
              </Card.Content>
            </Card>
          ))
        )}
        <ConfirmHost />
      </PageContent>
    </PageContainer>
  );
}
