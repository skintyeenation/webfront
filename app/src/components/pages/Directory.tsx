import React, { useEffect } from 'react';
import { FlatList, TouchableOpacity } from 'react-native';
import { Avatar, Divider, List } from 'react-native-paper';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadDirectory } from 'skintyee/store/modules/directory';
import { theme } from 'skintyee/styles';

export default function Directory({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.directory);

  useEffect(() => {
    dispatch(loadDirectory());
  }, [dispatch]);

  return (
    <PageContainer>
      <PageContent>
        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No band members listed." />
        ) : (
          <FlatList
            data={entities}
            keyExtractor={(item) => item._id}
            ItemSeparatorComponent={() => <Divider />}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => navigation.navigate('memberDetail', { id: item._id })}>
                <List.Item
                  title={item.name}
                  description={item.title ?? item.role}
                  titleStyle={{ color: theme.colors.text }}
                  descriptionStyle={{ color: theme.colors.textDarker }}
                  left={() => <Avatar.Text size={40} label={item.avatarLetter ?? item.name[0]} style={{ backgroundColor: theme.colors.primary }} />}
                />
              </TouchableOpacity>
            )}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
