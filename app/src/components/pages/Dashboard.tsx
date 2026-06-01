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
// docs/features/planner-dashboard.md.
//
// Two sections:
//
//   1. NOTIFICATIONS strip — manually-entered app notifications
//      (water boil advisory, council announcements, etc.) PLUS
//      Planner tasks surfaced as alerts when they're overdue / due
//      in next 24h / recently assigned. Rendered inline as cards so
//      users see the actual content, not just a count.
//
//   2. THIS WEEK feed (calendar OR list toggle) — scheduled events
//      (community salmon BBQ etc.) + Teams meetings + Planner due
//      dates as time-bound items. Same items as the Events tab,
//      promoted here for the next 7 days.
//
// A Planner task can appear in BOTH sections — once as an alert (in
// notifications) and once as a time-bound calendar item (in This
// week). That's intentional UX: tasks deserve aggressive surfacing.
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

const CATEGORY_ICONS: Record<string, string> = {
  Health: 'medical-bag',
  Safety: 'alert-octagon',
  Council: 'gavel',
  Events: 'calendar-star',
  Programs: 'account-group',
  News: 'newspaper-variant-outline',
  Announcements: 'bullhorn-outline',
};

function timeOf(item: FeedItem): string | undefined {
  return item.startAt ?? item.dueAt;
}

function isOverdue(item: FeedItem): boolean {
  if (item.source !== 'planner-task' || !item.dueAt) return false;
  return new Date(item.dueAt).getTime() < Date.now();
}

function isDueSoon(item: FeedItem): boolean {
  // Planner tasks due in the next 24h surface as notifications
  if (item.source !== 'planner-task' || !item.dueAt) return false;
  const dueTs = new Date(item.dueAt).getTime();
  const now = Date.now();
  return dueTs >= now && dueTs <= now + 24 * 60 * 60 * 1000;
}

function formatRange(items: FeedItem[]): string {
  if (items.length === 0) return '';
  const first = timeOf(items[0]);
  const last = timeOf(items[items.length - 1]);
  if (!first || !last) return '';
  return `${moment(first).format('MMM D')} – ${moment(last).format('MMM D')}`;
}

// ---- Notification-style card (used in the notifications strip) -------------
//
// Renders both AppNotification objects AND FeedItems with source='planner-task'
// in the same visual style — left border accent, icon, title, secondary text.

function NotificationCard({
  icon, color, title, subtitle, badge,
}: {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <Card
      style={{
        marginBottom: 8,
        backgroundColor: theme.colors.darkDefault,
        borderLeftWidth: 3,
        borderLeftColor: color,
      }}
    >
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MaterialCommunityIcons name={icon} size={20} color={color} style={{ marginRight: 8 }} />
          <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1 }} numberOfLines={2}>
            {title}
          </Text>
          {badge ? (
            <Chip compact style={{ backgroundColor: theme.colors.secondary, marginLeft: 6 }} textStyle={{ fontSize: 10 }}>
              {badge}
            </Chip>
          ) : null}
        </View>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 4, marginLeft: 28 }}>
          {subtitle}
        </Text>
      </Card.Content>
    </Card>
  );
}

// ---- Calendar (scheduled-stuff) card ---------------------------------------

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
  const appNotifications = useAppSelector((s) => s.notifications.entities);

  const [view, setView] = useState<FeedView>('list');

  // Pull this week's worth of feed + notifications on mount.
  useEffect(() => {
    const from = moment().startOf('day').toISOString();
    const to = moment().add(7, 'days').endOf('day').toISOString();
    dispatch(loadFeed({ role, from, to }));
    dispatch(loadNotifications());
  }, [dispatch, role]);

  // ---- Notifications strip data -------------------------------------------
  // Merge: (a) manually-entered AppNotifications (water boil advisory etc.)
  //        (b) Planner tasks that are overdue OR due in the next 24h
  // — sorted with the most-urgent (overdue) first.

  const notificationItems = useMemo(() => {
    const fromNotifications = appNotifications.slice(0, 10).map((n) => ({
      key: `nt-${n._id}`,
      kind: 'app-notification' as const,
      title: n.title,
      subtitle: `${n.category} · ${moment(n.createdAt).fromNow()}`,
      icon: CATEGORY_ICONS[n.category] ?? 'bell-outline',
      color: n.category === 'Health' || n.category === 'Safety' ? theme.colors.accent : theme.colors.primary,
      badge: !n.read ? 'NEW' : undefined,
      sortKey: -new Date(n.createdAt).getTime(),
      isUnread: !n.read,
    }));

    const fromPlanner = items
      .filter((it) => it.source === 'planner-task' && (isOverdue(it) || isDueSoon(it)))
      .map((it) => ({
        key: it.id,
        kind: 'planner-task' as const,
        title: it.title,
        subtitle: isOverdue(it)
          ? `OVERDUE · ${moment(it.dueAt).fromNow(true)} late · ${it.category ?? 'Planner'}`
          : `Due ${moment(it.dueAt).fromNow()} · ${it.category ?? 'Planner'}`,
        icon: isOverdue(it) ? 'alert' : 'clock-alert-outline',
        color: isOverdue(it) ? theme.colors.accent : '#0078D4',
        badge: isOverdue(it) ? 'OVERDUE' : 'DUE SOON',
        sortKey: new Date(it.dueAt ?? 0).getTime(), // overdue earliest first → most-overdue at top
        isUnread: true,
      }));

    // Combine, sort: overdue planner first, then due-soon planner, then notifications by date.
    return [...fromPlanner, ...fromNotifications]
      .sort((a, b) => {
        if (a.kind === 'planner-task' && b.kind !== 'planner-task') return -1;
        if (a.kind !== 'planner-task' && b.kind === 'planner-task') return 1;
        return a.sortKey - b.sortKey;
      })
      .slice(0, 6);
  }, [items, appNotifications]);

  const unreadCount = notificationItems.filter((n) => n.isUnread).length;

  // ---- "This week" feed items (scheduled stuff) ---------------------------
  // Same source as before; the calendar/list emphasizes WHEN, not WHAT.

  const visible = useMemo(() => {
    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return items.filter((it) => {
      // Notifications already shown above; don't dupe in the calendar
      if (it.source === 'notification') return false;
      const t = timeOf(it);
      if (!t) return false;
      // Include OVERDUE planner items so they appear on the calendar even if past
      if (isOverdue(it)) return true;
      const ts = new Date(t).getTime();
      return ts >= Date.now() - 24 * 60 * 60 * 1000 && ts <= horizon;
    });
  }, [items]);

  return (
    <PageContainer>
      <PageContent>
        {/* ── NOTIFICATIONS strip ─────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <MaterialCommunityIcons name="bell-outline" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>Notifications</Text>
          {unreadCount > 0 ? (
            <Badge style={{ backgroundColor: theme.colors.primary }}>{unreadCount}</Badge>
          ) : null}
        </View>

        {notificationItems.length === 0 ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
            <Card.Content>
              <Text style={{ color: theme.colors.textDarker }}>No notifications. You're all caught up.</Text>
            </Card.Content>
          </Card>
        ) : (
          <>
            {notificationItems.map((n) => (
              <NotificationCard
                key={n.key}
                icon={n.icon}
                color={n.color}
                title={n.title}
                subtitle={n.subtitle}
                badge={n.badge}
              />
            ))}
            <TouchableOpacity onPress={() => navigation.navigate('notifications')}>
              <Text style={{ color: theme.colors.accent, fontSize: 12, marginBottom: 16, marginTop: -2 }}>
                See all notifications →
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── THIS WEEK feed (Calendar | List) ────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 4 }}>
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
