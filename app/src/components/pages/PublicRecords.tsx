import React, { useEffect } from 'react';
import { FlatList } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadPublicRecords } from 'skintyee/store/modules/publicRecords';
import { theme } from 'skintyee/styles';

export default function PublicRecords() {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.publicRecords);

  useEffect(() => {
    dispatch(loadPublicRecords());
  }, [dispatch]);

  return (
    <PageContainer>
      <PageContent>
        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No public records published." />
        ) : (
          <FlatList
            data={entities}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <Card style={{ marginBottom: 12, backgroundColor: theme.colors.darkDefault }}>
                <Card.Content>
                  <Chip compact style={{ alignSelf: 'flex-start', marginBottom: 6, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 11 }}>
                    {item.category}
                  </Chip>
                  <Text style={{ color: theme.colors.text, fontSize: 16 }}>{item.title}</Text>
                  <Text style={{ color: theme.colors.textDarker, marginTop: 4 }}>{item.summary}</Text>
                  <Text style={{ color: theme.colors.textDarker, marginTop: 6, fontSize: 12 }}>Published {moment(item.publishedAt).format('MMM D, YYYY')}</Text>
                </Card.Content>
              </Card>
            )}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
