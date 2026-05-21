import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Badge, Card, SegmentedButtons, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import { PageContainer, PageContent, NoContent, MonthCalendar, AdminAddButton } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadNotifications } from 'skintyee/store/modules/notifications';
import { AppNotification } from 'skintyee/models';
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

const dateKey = (iso: string) => moment(iso).format('YYYY-MM-DD');

function NotificationCard({ item }: { item: AppNotification }) {
  return (
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
        <Text style={{ color: theme.colors.textDarker, marginTop: 6, fontSize: 12 }}>{moment(item.createdAt).format('MMM D, h:mm A')} · {moment(item.createdAt).fromNow()}</Text>
      </Card.Content>
    </Card>
  );
}

type ViewMode = 'list' | 'calendar';

export default function Notifications({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.notifications);
  const [view, setView] = useState<ViewMode>('list');

  useEffect(() => {
    dispatch(loadNotifications());
  }, [dispatch]);

  // Count notifications per day for the calendar markers.
  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    entities.forEach((n) => {
      const key = dateKey(n.createdAt);
      m[key] = (m[key] || 0) + 1;
    });
    return m;
  }, [entities]);

  const latestKey = entities.length ? dateKey(entities[0].createdAt) : moment().format('YYYY-MM-DD');
  const [selectedDate, setSelectedDate] = useState(latestKey);

  // Keep the selected day pinned to the latest once data loads.
  useEffect(() => {
    if (entities.length) setSelectedDate(dateKey(entities[0].createdAt));
  }, [loaded]);

  const dayItems = entities.filter((n) => dateKey(n.createdAt) === selectedDate);

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Post notification" icon="bullhorn" onPress={() => navigation.navigate('notificationCreate')} />
        <SegmentedButtons
          value={view}
          onValueChange={(v) => setView(v as ViewMode)}
          density="small"
          style={{ marginBottom: 14 }}
          buttons={[
            { value: 'list', label: 'List', icon: 'view-list' },
            { value: 'calendar', label: 'Calendar', icon: 'calendar' },
          ]}
        />

        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No notifications." />
        ) : view === 'list' ? (
          entities.map((item) => <NotificationCard key={item._id} item={item} />)
        ) : (
          <>
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 14 }}>
              <Card.Content>
                <MonthCalendar marks={marks} selected={selectedDate} onSelect={setSelectedDate} initialMonth={latestKey} />
              </Card.Content>
            </Card>
            <Text style={{ color: theme.colors.text, fontSize: 15, marginBottom: 8 }}>{moment(selectedDate).format('dddd, MMMM D')}</Text>
            {dayItems.length === 0 ? (
              <NoContent message="No notifications on this day." />
            ) : (
              dayItems.map((item) => <NotificationCard key={item._id} item={item} />)
            )}
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}
