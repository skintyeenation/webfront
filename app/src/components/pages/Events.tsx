import React, { useEffect } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Button, Card, Chip, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent, AdminAddButton, useConfirm } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadEvents, cancelEvent, removeEvent } from 'skintyee/store/modules/events';
import { theme } from 'skintyee/styles';

export default function Events({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.events);
  const role = useAppSelector((s) => s.auth.role);
  const isAdmin = role === 'admin';
  const { confirm, ConfirmHost } = useConfirm();

  useEffect(() => {
    dispatch(loadEvents());
  }, [dispatch]);

  // Public users only see public events; members/staff/admins see everything.
  const visible = role === 'public' ? entities.filter((e) => e.public) : entities;

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Add event" onPress={() => navigation.navigate('eventCreate')} />

        {visible.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No upcoming events." />
        ) : (
          visible.map((item) => (
            <TouchableOpacity key={item._id} onPress={() => navigation.navigate('eventDetail', { id: item._id })}>
              <Card style={{ marginBottom: 12, backgroundColor: theme.colors.darkDefault, opacity: item.cancelled ? 0.6 : 1 }}>
                <Card.Content>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1, textDecorationLine: item.cancelled ? 'line-through' : 'none' }}>{item.title}</Text>
                    {item.cancelled ? (
                      <Chip compact style={{ backgroundColor: theme.colors.error }} textStyle={{ color: theme.colors.white, fontSize: 11 }}>Cancelled</Chip>
                    ) : !item.public ? (
                      <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 11 }}>Members</Chip>
                    ) : null}
                  </View>
                  <Text style={{ color: theme.colors.accent, marginTop: 4 }}>{moment(item.startsAt).format('ddd, MMM D · h:mm A')}</Text>
                  <Text style={{ color: theme.colors.textDarker, marginTop: 2 }}>{item.location}</Text>

                  {isAdmin ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                      <Button compact mode="text" icon="pencil" textColor={theme.colors.primary} onPress={() => navigation.navigate('eventEdit', { id: item._id })}>
                        Edit
                      </Button>
                      <Button
                        compact
                        mode="text"
                        icon={item.cancelled ? 'backup-restore' : 'calendar-remove'}
                        textColor={theme.colors.accent}
                        onPress={() =>
                          item.cancelled
                            ? dispatch(cancelEvent(item._id))
                            : confirm({ title: 'Cancel event?', message: `"${item.title}" will be marked cancelled. You can restore it later.`, confirmLabel: 'Cancel event', destructive: true, onConfirm: () => dispatch(cancelEvent(item._id)) })
                        }
                      >
                        {item.cancelled ? 'Restore' : 'Cancel'}
                      </Button>
                      <Button
                        compact
                        mode="text"
                        icon="delete"
                        textColor={theme.colors.error}
                        onPress={() => confirm({ title: 'Delete event?', message: `"${item.title}" will be permanently deleted.`, confirmLabel: 'Delete', destructive: true, onConfirm: () => dispatch(removeEvent(item._id)) })}
                      >
                        Delete
                      </Button>
                    </View>
                  ) : null}
                </Card.Content>
              </Card>
            </TouchableOpacity>
          ))
        )}
        <ConfirmHost />
      </PageContent>
    </PageContainer>
  );
}
