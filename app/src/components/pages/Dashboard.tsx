import React, { useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Button, Card, Chip, ProgressBar, SegmentedButtons, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import { NoContent, PageContainer, PageContent, colorAt } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadFeed } from 'skintyee/store/modules/feed';
import { loadRollup } from 'skintyee/store/modules/planner';
import { loadTimeEntries } from 'skintyee/store/modules/timekeeping';
import { FeedItem, Role } from 'skintyee/models';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Homescreen — the "Home" tab. Per ADR-14 and
// docs/features/planner-dashboard.md.
//
//   1. THIS WEEK feed (calendar OR list toggle) — scheduled events
//      (community salmon BBQ etc.) + Teams meetings + Planner due
//      dates as time-bound items. Same items as the Events tab,
//      promoted here for the next 7 days.
//
//   2. ADMIN TOOLS (staff + admin only, additive below the feed) —
//      Planner board rollup across program areas + Time keeping
//      summary. Was on the Records (Financial Summary) screen; moved
//      here so admins land on operational state by default.
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
  const isStaffOrAdmin = role === 'staff' || role === 'admin';
  const { items, loading, loaded } = useAppSelector((s) => s.feed);

  // Planner rollup + time entries — admin-tools section below the feed
  const rollup = useAppSelector((s) => s.planner.rollup);
  const timeEntries = useAppSelector((s) => s.timekeeping.entities);
  const pendingApprovals = timeEntries.filter((t) => !t.approved).length;
  const hoursLogged = timeEntries.reduce((s, t) => s + t.hours, 0);

  const [view, setView] = useState<FeedView>('list');

  // Pull this week's feed on mount; staff/admin also pull Planner + time.
  useEffect(() => {
    const from = moment().startOf('day').toISOString();
    const to = moment().add(7, 'days').endOf('day').toISOString();
    dispatch(loadFeed({ role, from, to }));
    if (isStaffOrAdmin) {
      dispatch(loadRollup());
      dispatch(loadTimeEntries());
    }
  }, [dispatch, role, isStaffOrAdmin]);

  // ---- "This week" feed items (scheduled stuff) ---------------------------
  // Notifications live in their own tab; the calendar/list here is WHEN-first.

  const visible = useMemo(() => {
    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return items.filter((it) => {
      // Notifications have their own tab — don't dupe them here
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
        {/* ── THIS WEEK feed (Calendar | List) ────────────────────────────── */}
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

        {/* ── ADMIN TOOLS (staff + admin) ───────────────────────────────────
            Moved here from the Financial Summary screen — Planner board
            rollup + Time keeping summary. Not the right home for budget
            transparency content; it IS the right home for what an admin
            opens the app to see. */}
        {isStaffOrAdmin ? (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <MaterialCommunityIcons name="shield-account" size={20} color={theme.colors.accent} style={{ marginRight: 8 }} />
              <Text style={{ color: theme.colors.accent, fontSize: 16, fontWeight: '600' }}>Admin tools</Text>
              <Chip compact style={{ marginLeft: 8, backgroundColor: theme.colors.secondary }} textStyle={{ fontSize: 10 }}>
                {role}
              </Chip>
            </View>

            {/* Planner rollup card */}
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: theme.colors.accent }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={18} color={theme.colors.accent} style={{ marginRight: 6 }} />
                  <Text style={{ color: theme.colors.text, fontSize: 15 }}>Tasks across program areas</Text>
                </View>
                {!rollup ? (
                  <Text style={{ color: theme.colors.textDarker }}>Loading Planner data…</Text>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.primary, fontSize: 22 }}>{rollup.totalOpen}</Text>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Open</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: rollup.totalOverdue > 0 ? theme.colors.accent : theme.colors.success, fontSize: 22 }}>{rollup.totalOverdue}</Text>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Overdue</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.success, fontSize: 22 }}>{rollup.totalCompleted}</Text>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Done</Text>
                      </View>
                    </View>

                    {rollup.byProgramArea.slice(0, 6).map((row, idx) => {
                      const total = row.open + row.completed;
                      const pct = total > 0 ? row.completed / total : 0;
                      return (
                        <View key={row.programArea} style={{ marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                            <Text style={{ color: theme.colors.text, fontSize: 13 }}>{row.programArea}</Text>
                            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                              {row.open} open · {row.completed} done
                            </Text>
                          </View>
                          <ProgressBar progress={pct} color={colorAt(idx)} style={{ height: 6, backgroundColor: theme.colors.secondary }} />
                        </View>
                      );
                    })}

                    {rollup.topOverdue.length > 0 ? (
                      <>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 10, marginBottom: 6, textTransform: 'uppercase' }}>
                          Top overdue
                        </Text>
                        {rollup.topOverdue.map((t) => (
                          <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={14} color={theme.colors.accent} style={{ marginRight: 4 }} />
                            <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1 }} numberOfLines={1}>
                              {t.title}
                            </Text>
                            {t.categoryLabels?.[0] ? (
                              <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginLeft: 6 }}>
                                {t.categoryLabels[0]}
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </>
                    ) : null}

                    <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 10 }}>
                      From Microsoft Planner · refreshed {new Date(rollup.generatedAt).toLocaleTimeString()}
                    </Text>
                  </>
                )}
              </Card.Content>
            </Card>

            {/* Time keeping summary */}
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
                  <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>Time keeping</Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: pendingApprovals > 0 ? theme.colors.accent : theme.colors.success, fontSize: 22 }}>{pendingApprovals}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Entries to approve</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.primary, fontSize: 22 }}>{hoursLogged}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Hours logged</Text>
                  </View>
                </View>
                <Button
                  mode="outlined"
                  compact
                  icon="clock-outline"
                  textColor={theme.colors.primary}
                  style={{ marginTop: 12, alignSelf: 'flex-start' }}
                  onPress={() => navigation.navigate('timekeeping')}
                >
                  Open time keeping
                </Button>
              </Card.Content>
            </Card>
          </View>
        ) : null}
      </PageContent>
    </PageContainer>
  );
}
