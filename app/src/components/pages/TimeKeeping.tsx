import React, { useEffect } from 'react';
import { FlatList, View } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadTimeEntries } from 'skintyee/store/modules/timekeeping';
import { theme } from 'skintyee/styles';

// Admin/Staff only — gated in routes. Time keeping for workers.
export default function TimeKeeping() {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.timekeeping);

  useEffect(() => {
    dispatch(loadTimeEntries());
  }, [dispatch]);

  const totalHours = entities.reduce((sum, e) => sum + e.hours, 0);

  return (
    <PageContainer>
      <PageContent>
        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No time entries logged." />
        ) : (
          <FlatList
            ListHeaderComponent={<Text style={{ color: theme.colors.textDarker, marginBottom: 10 }}>Total logged: {totalHours} hrs</Text>}
            data={entities}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <Card style={{ marginBottom: 10, backgroundColor: theme.colors.darkDefault }}>
                <Card.Content>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.colors.text, fontSize: 16 }}>{item.workerName}</Text>
                    <Chip compact style={{ backgroundColor: item.approved ? theme.colors.success : theme.colors.secondary }} textStyle={{ color: '#000', fontSize: 11 }}>
                      {item.approved ? 'Approved' : 'Pending'}
                    </Chip>
                  </View>
                  <Text style={{ color: theme.colors.accent, marginTop: 4 }}>{item.hours} hrs · {moment(item.date).format('MMM D')}</Text>
                  <Text style={{ color: theme.colors.textDarker, marginTop: 2 }}>{item.task}</Text>
                </Card.Content>
              </Card>
            )}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
