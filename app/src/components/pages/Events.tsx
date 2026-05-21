import React, { useEffect } from 'react';
import { FlatList, TouchableOpacity, View } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadEvents } from 'skintyee/store/modules/events';
import { theme } from 'skintyee/styles';

export default function Events({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.events);
  const role = useAppSelector((s) => s.auth.role);

  useEffect(() => {
    dispatch(loadEvents());
  }, [dispatch]);

  // Public users only see public events; members/admins see everything.
  const visible = role === 'public' ? entities.filter((e) => e.public) : entities;

  return (
    <PageContainer>
      <PageContent>
        {visible.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No upcoming events." />
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => navigation.navigate('eventDetail', { id: item._id })}>
                <Card style={{ marginBottom: 12, backgroundColor: theme.colors.darkDefault }}>
                  <Card.Content>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>{item.title}</Text>
                      {!item.public ? (
                        <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 11 }}>
                          Members
                        </Chip>
                      ) : null}
                    </View>
                    <Text style={{ color: theme.colors.accent, marginTop: 4 }}>{moment(item.startsAt).format('ddd, MMM D · h:mm A')}</Text>
                    <Text style={{ color: theme.colors.textDarker, marginTop: 2 }}>{item.location}</Text>
                  </Card.Content>
                </Card>
              </TouchableOpacity>
            )}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
