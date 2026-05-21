import React, { useEffect } from 'react';
import { FlatList, View } from 'react-native';
import { Badge, Card, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadNotifications } from 'skintyee/store/modules/notifications';
import { theme } from 'skintyee/styles';

// Icons keyed by the WordPress notification categories.
const categoryIcon: Record<string, string> = {
  Health: 'medical-bag',
  Safety: 'alert-octagon',
  Council: 'gavel',
  Events: 'calendar-star',
  Programs: 'account-group',
  News: 'newspaper-variant-outline',
  Announcements: 'bullhorn-outline',
};

// Accent colour for the more urgent categories.
const categoryColor: Record<string, string> = {
  Health: '#EC6A37',
  Safety: '#F21651',
};

export default function Notifications() {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.notifications);

  useEffect(() => {
    dispatch(loadNotifications());
  }, [dispatch]);

  return (
    <PageContainer>
      <PageContent>
        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No notifications." />
        ) : (
          <FlatList
            data={entities}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <Card
                style={{
                  marginBottom: 10,
                  backgroundColor: theme.colors.darkDefault,
                  borderLeftWidth: 3,
                  borderLeftColor: item.read ? 'transparent' : theme.colors.primary,
                }}
              >
                <Card.Content>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons name={categoryIcon[item.category] ?? 'bell-outline'} size={20} color={categoryColor[item.category] ?? theme.colors.accent} style={{ marginRight: 8 }} />
                    <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>{item.title}</Text>
                    {!item.read ? <Badge style={{ backgroundColor: theme.colors.primary }} size={10} /> : null}
                  </View>
                  <Text style={{ color: theme.colors.textDarker, marginTop: 4 }}>{item.body}</Text>
                  <Text style={{ color: theme.colors.textDarker, marginTop: 6, fontSize: 12 }}>{moment(item.createdAt).fromNow()}</Text>
                </Card.Content>
              </Card>
            )}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
