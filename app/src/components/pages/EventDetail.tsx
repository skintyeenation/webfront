import React, { useEffect } from 'react';
import { Card, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadEvent } from 'skintyee/store/modules/events';
import { theme } from 'skintyee/styles';

export default function EventDetail({ route }: any) {
  const dispatch = useAppDispatch();
  const id = route?.params?.id;
  const { selected, loading } = useAppSelector((s) => s.events);

  useEffect(() => {
    if (id) dispatch(loadEvent(id));
  }, [dispatch, id]);

  if (!selected || selected._id !== id) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent loading={loading} message="Event not found." />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.text, fontSize: 22, marginBottom: 4 }}>{selected.title}</Text>
        <Text style={{ color: theme.colors.accent, marginBottom: 2 }}>{moment(selected.startsAt).format('dddd, MMMM D, YYYY · h:mm A')}</Text>
        <Text style={{ color: theme.colors.textDarker, marginBottom: 16 }}>{selected.location}</Text>
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Content>
            <Text style={{ color: theme.colors.text }}>{selected.description}</Text>
          </Card.Content>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
