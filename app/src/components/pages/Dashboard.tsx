import React, { useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Badge, Card, Chip, SegmentedButtons, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import { NoContent, PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadFeed } from 'skintyee/store/modules/feed';
import { loadNotifications } from 'skintyee/store/modules/notifications';
import { FeedItem, Role } from 'skintyee/models';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Homescreen — the redesigned "Home" tab. Per ADR-14 and
// docs/features/planner-dashboard.md. Three sections:
//
//   1. Notifications strip (unread count + the top few items)
//   2. "This week" feed (calendar OR list toggle) — app events + Teams
//      meetings + Planner due-dates, role-filtered server-side
//   3. Records → link card (where budget transparency now lives)
//
// The old Dashboard's financial widgets (budget pie, month/year, major
// projects) moved to Records (member view); operational widgets
// (timekeeping pending approvals, Planner board rollup, financial
// records) moved to Records (admin view).
// ----------------------------------------------------------------------------

type FeedView = 'list' | 'calendar';

const SOURCE_ICONS: Record<FeedItem['source'], string> = {
  'app-event':     'calendar-star',
  'teams-meeting': 'video',
  'planner-task':  'checkbox-marked-outline',
  'notification':  'bell-outline',
};

const SOURCE_COLORS: Record<FeedItem['source'], string> = {
  'app-event':     theme.colors.accent,
  'teams-meeting': '#5B5FC7',     // Teams purple
  'planner-task':  '#0078D4',     // Planner blue
  'notification':  theme.colors.primary,
};

function timeOf(item: FeedItem): string | undefined {
  return item.startAt ?? item.dueAt;
}

function isOverdue(item: FeedItem): boolean {
  if (item.source !== 'planner-task' || !item.dueAt) return false;
  return new Date(item.dueAt).getTime() < Date.now();
}

function formatRange(items: FeedItem[]): string {
  if (items.length === 0) return '';
  const first = timeOf(items[0]);
  const last = timeOf(items[items.length - 1]);
  if (!first || !last) return '';
  return `${moment(first).format('MMM D')} – ${moment(last).format('MMM D')}`;
}

// ---- Feed item card --------------------------------------------------------

function FeedItemCard({ item, onPress }: { item: FeedItem; onPress?: () => void }) {
  const t = timeOf(item);
  const overdue = isOverdue(item);
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress}>
      <Card
        style={{
          marginBottom: 8,
          backgroundColor: theme.colors.darkDefault,
          borderLeftWidth: 3,
          borderLeftColor: overdue ? theme.colors.accent : SOURCE_COLORS[item.source],
        }}
      >
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons
              name={overdue ? 'alert' : SOURCE_ICONS[item.source]}
              size={18}
              color={overdue ? theme.colors.accent : SOURCE_COLORS[item.source]}
              style={{ marginRight: 8 }}
            />
            <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1 }}>{item.title}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            {item.category ? (
              <Chip compact style={{ backgroundColor: theme.colors.secondary, marginRight: 6 }} textStyle={{ fontSize: 10 }}>
                {item.category}
              </Chip>
            ) : null}
            <Text style={{ color: overdue ? theme.colors.accent : theme.colors.textDarker, fontSize: 12 }}>
              {overdue ? `OVERDUE · ${moment(t).fromNow(true)} late` : t ? moment(t).format('ddd MMM D · h:mm A') : ''}
            </Text>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

// ---- Calendar view (simple per-day grouping) ------------------------------

function CalendarView({ items }: { items: FeedItem[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, FeedItem[]>();
    for (const it of items) {
      const t = timeOf(it);
      if (!t) continue;
      const key = moment(t).format('YYYY-MM-DD');
      map.set(key, [...(map.get(key) ?? []), it]);
    }
    return map;
  }, [items]);

  if (byDay.size === 0) {
    return <NoContent message="Nothing scheduled this week." />;
  }

  return (
    <View>
      {Array.from(byDay.entries()).map(([day, dayItems]) => (
        <View key={day} style={{ marginBottom: 12 }}>
          <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 6, textTransform: 'uppercase' }}>
            {moment(day).format('dddd, MMM D')}
          </Text>
          {dayItems.map((it) => (
            <FeedItemCard key={it.id} item={it} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ---- Main screen -----------------------------------------------------------

export default function Dashboard({ navigation }: any) {
  const dispatch = useAppDispatch();
  // Role is consumed only for the server-side filter on the feed thunk —
  // not for any conditional UI on the homescreen (which by design shows
  // the same shape to everyone, just with role-tiered ITEMS).
  const role = useAppSelector((s) => s.auth.role) as Role;
  const { items, loading, loaded } = useAppSelector((s) => s.feed);
  const notifications = useAppSelector((s) => s.notifications.entities);

  const [view, setView] = useState<FeedView>('list');

  // Pull this week's worth of feed + notifications on mount.
  useEffect(() => {
    const from = moment().startOf('day').toISOString();
    const to = moment().add(7, 'days').endOf('day').toISOString();
    dispatch(loadFeed({ role, from, to }));
    dispatch(loadNotifications());
  }, [dispatch, role]);

  const unreadNotifications = notifications.filter((n) => !n.read).length;

  // Only show items in the next 7 days for the homescreen widget.
  const visible = useMemo(() => {
    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return items.filter((it) => {
      const t = timeOf(it);
      if (!t) return false;
      // Include OVERDUE Planner tasks even if their due date was earlier
      if (isOverdue(it)) return true;
      const ts = new Date(t).getTime();
      return ts >= Date.now() - 24 * 60 * 60 * 1000 && ts <= horizon;
    });
  }, [items]);

  return (
    <PageContainer>
      <PageContent>
        {/* Notifications strip — top of the homescreen */}
        <TouchableOpacity onPress={() => navigation.navigate('notifications')}>
          <Card
            style={{
              backgroundColor: theme.colors.darkDefault,
              marginBottom: 12,
              borderLeftWidth: 3,
              borderLeftColor: unreadNotifications > 0 ? theme.colors.primary : theme.colors.secondary,
            }}
          >
            <Card.Content style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialCommunityIcons name="bell-outline" size={22} color={theme.colors.primary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.text, fontSize: 16 }}>Notifications</Text>
                  {unreadNotifications > 0 ? (
                    <Badge style={{ backgroundColor: theme.colors.primary, marginLeft: 8 }}>{unreadNotifications}</Badge>
                  ) : null}
                </View>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
                  {unreadNotifications > 0
                    ? `${unreadNotifications} new — tap to read`
                    : 'No new notifications'}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textDarker} />
            </Card.Content>
          </Card>
        </TouchableOpacity>

        {/* "This week" feed with Calendar | List toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={theme.colors.text} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>
            This week {formatRange(visible) ? `· ${formatRange(visible)}` : ''}
          </Text>
        </View>

        <SegmentedButtons
          value={view}
          onValueChange={(v) => setView(v as FeedView)}
          density="small"
          style={{ marginBottom: 12 }}
          buttons={[
            { value: 'list', label: 'List', icon: 'format-list-bulleted' },
            { value: 'calendar', label: 'Calendar', icon: 'calendar-month' },
          ]}
        />

        {!loaded && loading ? (
          <NoContent loading message="Loading your week…" />
        ) : visible.length === 0 ? (
          <NoContent message="Nothing scheduled in the next 7 days. Check Events, or come back tomorrow." />
        ) : view === 'list' ? (
          visible.map((it) => <FeedItemCard key={it.id} item={it} />)
        ) : (
          <CalendarView items={visible} />
        )}
      </PageContent>
    </PageContainer>
  );
}
