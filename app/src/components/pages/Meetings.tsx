import React, { useEffect } from 'react';
import { FlatList } from 'react-native';
import { Card, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadMeetings } from 'skintyee/store/modules/meetings';
import { theme } from 'skintyee/styles';

export default function Meetings() {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.meetings);

  useEffect(() => {
    dispatch(loadMeetings());
  }, [dispatch]);

  return (
    <PageContainer>
      <PageContent>
        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No scheduled meetings." />
        ) : (
          <FlatList
            data={entities}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <Card style={{ marginBottom: 12, backgroundColor: theme.colors.darkDefault }}>
                <Card.Content>
                  <Text style={{ color: theme.colors.text, fontSize: 16 }}>{item.title}</Text>
                  <Text style={{ color: theme.colors.accent, marginTop: 4 }}>{moment(item.startsAt).format('ddd, MMM D · h:mm A')}</Text>
                  <Text style={{ color: theme.colors.textDarker, marginTop: 2 }}>{item.location}</Text>
                  <Text style={{ color: theme.colors.text, marginTop: 8 }}>{item.agenda}</Text>
                </Card.Content>
              </Card>
            )}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
