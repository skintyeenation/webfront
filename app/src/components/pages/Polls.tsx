import React, { useEffect } from 'react';
import { FlatList, TouchableOpacity } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadPolls } from 'skintyee/store/modules/polls';
import { theme } from 'skintyee/styles';

export default function Polls({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.polls);

  useEffect(() => {
    dispatch(loadPolls());
  }, [dispatch]);

  return (
    <PageContainer>
      <PageContent>
        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No active polls or surveys." />
        ) : (
          <FlatList
            data={entities}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => {
              const total = item.options.reduce((s, o) => s + o.votes, 0);
              return (
                <TouchableOpacity onPress={() => navigation.navigate('pollDetail', { id: item._id })}>
                  <Card style={{ marginBottom: 12, backgroundColor: theme.colors.darkDefault }}>
                    <Card.Content>
                      <Text style={{ color: theme.colors.text, fontSize: 16 }}>{item.question}</Text>
                      <Chip compact style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 11 }}>
                        {item.closed ? 'Closed' : `Closes ${moment(item.closesAt).fromNow()}`}
                      </Chip>
                      <Text style={{ color: theme.colors.textDarker, marginTop: 6, fontSize: 12 }}>{total} votes</Text>
                    </Card.Content>
                  </Card>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
