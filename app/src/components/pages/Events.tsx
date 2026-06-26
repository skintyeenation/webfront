import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Button, Card, Chip, IconButton, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import { PageContainer, PageContent, NoContent, MonthCalendar, AdminAddButton, useConfirm } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadEvents, cancelEvent, removeEvent } from 'skintyee/store/modules/events';
import { theme } from 'skintyee/styles';

const dateKey = (d: any) => moment(d).format('YYYY-MM-DD');

export default function Events({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.events);
  const role = useAppSelector((s) => s.auth.role);
  const isAdmin = role === 'admin';
  const { confirm, ConfirmHost } = useConfirm();
  // Calendar is a full-content overlay (toggled), not an inline tab. Splits
  // calendar 1/3 · cards 2/3 on tablet + desktop (width ≥ 768), stacked on phone.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { width } = useWindowDimensions();
  const calendarSplit = width >= 768;

  useEffect(() => {
    dispatch(loadEvents());
  }, [dispatch]);

  // Public users only see public events; members/staff/admins see everything.
  const visible = role === 'public' ? entities.filter((e) => e.public) : entities;

  // Count events per day for the calendar markers.
  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    visible.forEach((e) => { const k = dateKey(e.startsAt); m[k] = (m[k] || 0) + 1; });
    return m;
  }, [visible]);
  const latestKey = visible.length ? dateKey(visible[0].startsAt) : moment().format('YYYY-MM-DD');
  const [selectedDate, setSelectedDate] = useState(latestKey);

  // Event cards — shared by the inline list + the calendar overlay's right column.
  const renderEvents = () =>
    visible.map((item) => (
      <TouchableOpacity key={item._id} onPress={() => navigation.navigate('eventDetail', { id: item._id })}>
        <Card style={{ marginBottom: 12, backgroundColor: theme.colors.darkDefault, opacity: item.cancelled ? 0.6 : 1 }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1, textDecorationLine: item.cancelled ? 'line-through' : 'none' }}>{item.title}</Text>
              {item.cancelled ? (
                <Chip compact style={{ backgroundColor: theme.colors.error }} textStyle={{ color: theme.colors.white, fontSize: 11 }}>Cancelled</Chip>
              ) : !item.public ? (
                <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 11 }}>Members</Chip>
              ) : null}
            </View>
            <Text style={{ color: theme.colors.accent, marginTop: 4 }}>{moment(item.startsAt).format('ddd, MMM D · h:mm A')}</Text>
            <Text style={{ color: theme.colors.textDarker, marginTop: 2 }}>{item.location}</Text>

            {isAdmin ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                <Button compact mode="text" icon="pencil" textColor={theme.colors.primary} onPress={() => navigation.navigate('eventEdit', { id: item._id })}>
                  Edit
                </Button>
                <Button
                  compact
                  mode="text"
                  icon={item.cancelled ? 'backup-restore' : 'calendar-remove'}
                  textColor={theme.colors.accent}
                  onPress={() =>
                    item.cancelled
                      ? dispatch(cancelEvent(item._id))
                      : confirm({ title: 'Cancel event?', message: `"${item.title}" will be marked cancelled. You can restore it later.`, confirmLabel: 'Cancel event', destructive: true, onConfirm: () => dispatch(cancelEvent(item._id)) })
                  }
                >
                  {item.cancelled ? 'Restore' : 'Cancel'}
                </Button>
                <Button
                  compact
                  mode="text"
                  icon="delete"
                  textColor={theme.colors.error}
                  onPress={() => confirm({ title: 'Delete event?', message: `"${item.title}" will be permanently deleted.`, confirmLabel: 'Delete', destructive: true, onConfirm: () => dispatch(removeEvent(item._id)) })}
                >
                  Delete
                </Button>
              </View>
            ) : null}
          </Card.Content>
        </Card>
      </TouchableOpacity>
    ));

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Add event" onPress={() => navigation.navigate('eventCreate')} />
        {visible.length > 0 ? (
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

        {visible.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No upcoming events." />
        ) : (
          renderEvents()
        )}
        <ConfirmHost />
      </PageContent>

      {/* Calendar overlay — fills the content area (below the app header, right
          of the sidebar). Calendar 1/3 · event cards 2/3 on tablet + desktop
          (width ≥ 768); stacked on phone. */}
      {calendarOpen ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background, zIndex: 20 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.secondary }}>
            <MaterialCommunityIcons name="calendar-month" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>Events · calendar</Text>
            <IconButton icon="close" size={22} iconColor={theme.colors.text} onPress={() => setCalendarOpen(false)} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
            {calendarSplit ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <MonthCalendar marks={marks} selected={selectedDate} onSelect={setSelectedDate} initialMonth={latestKey} />
                </View>
                <View style={{ flex: 2 }}>{renderEvents()}</View>
              </View>
            ) : (
              <>
                <MonthCalendar marks={marks} selected={selectedDate} onSelect={setSelectedDate} initialMonth={latestKey} />
                <View style={{ marginTop: 12 }}>{renderEvents()}</View>
              </>
            )}
          </ScrollView>
        </View>
      ) : null}
    </PageContainer>
  );
}
