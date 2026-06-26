import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Badge, Button, Card, IconButton, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import { PageContainer, PageContent, NoContent, MonthCalendar, AdminAddButton, useConfirm } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadNotifications, removeNotification } from 'skintyee/store/modules/notifications';
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

function NotificationCard({ item, isAdmin, onEdit, onDelete }: { item: AppNotification; isAdmin: boolean; onEdit: () => void; onDelete: () => void }) {
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
        {isAdmin ? (
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            <Button compact mode="text" icon="pencil" textColor={theme.colors.primary} onPress={onEdit}>
              Edit
            </Button>
            <Button compact mode="text" icon="delete" textColor={theme.colors.error} onPress={onDelete}>
              Delete
            </Button>
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );
}

type ViewMode = 'list' | 'calendar';

export default function Notifications({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.notifications);
  const isAdmin = useAppSelector((s) => s.auth.role) === 'admin';
  const { confirm, ConfirmHost } = useConfirm();
  // Calendar is a full-content overlay (toggled), not an inline tab. Splits
  // calendar 1/3 · cards 2/3 on tablet + desktop (width ≥ 768), stacked on phone.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { width } = useWindowDimensions();
  const calendarSplit = width >= 768;

  const confirmDelete = (item: AppNotification) =>
    confirm({ title: 'Delete notification?', message: `"${item.title}" will be permanently deleted.`, confirmLabel: 'Delete', destructive: true, onConfirm: () => dispatch(removeNotification(item._id)) });

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

  // Notification cards — shared by the inline list + the calendar overlay's
  // right column.
  const renderNotifications = () =>
    entities.map((item) => (
      <NotificationCard
        key={item._id}
        item={item}
        isAdmin={isAdmin}
        onEdit={() => navigation.navigate('notificationEdit', { id: item._id })}
        onDelete={() => confirmDelete(item)}
      />
    ));

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Post notification" icon="bullhorn" onPress={() => navigation.navigate('notificationCreate')} />
        {entities.length > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Button
              compact mode="text" icon="calendar-month"
              textColor={theme.colors.primary}
              onPress={() => setCalendarOpen(true)}
            >
              Show calendar
            </Button>
          </View>
        ) : null}

        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No notifications." />
        ) : (
          renderNotifications()
        )}
        <ConfirmHost />
      </PageContent>

      {/* Calendar overlay — fills the content area (below the app header, right
          of the sidebar). Calendar 1/3 · notification cards 2/3 on tablet +
          desktop (width ≥ 768); stacked on phone. */}
      {calendarOpen ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background, zIndex: 20 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.secondary }}>
            <MaterialCommunityIcons name="calendar-month" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>Notifications · calendar</Text>
            <IconButton icon="close" size={22} iconColor={theme.colors.text} onPress={() => setCalendarOpen(false)} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
            {calendarSplit ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <MonthCalendar marks={marks} selected={selectedDate} onSelect={setSelectedDate} initialMonth={latestKey} />
                </View>
                <View style={{ flex: 2 }}>
                  {renderNotifications()}
                </View>
              </View>
            ) : (
              <>
                <MonthCalendar marks={marks} selected={selectedDate} onSelect={setSelectedDate} initialMonth={latestKey} />
                <View style={{ marginTop: 12 }}>{renderNotifications()}</View>
              </>
            )}
          </ScrollView>
        </View>
      ) : null}
    </PageContainer>
  );
}
