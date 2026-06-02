import React, { useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Badge, Button, Card, Chip, ProgressBar, SegmentedButtons, Text } from 'react-native-paper';
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
//   1. ADMIN TOOLS (staff + admin only) — Planner board rollup
//      across program areas + Time keeping summary. Pinned to the
//      top because it's what an admin opens the app to check.
//
//   2. THIS WEEK feed (calendar OR list toggle) — scheduled events
//      (community salmon BBQ etc.) + Teams meetings + Planner due
//      dates as time-bound items. Same items as the Events tab,
//      promoted here for the next 7 days.
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

// Actual month grid: 7-column wall calendar. Days with items get a dot.
// Tapping a day opens its items below the grid.
function CalendarView({ items }: { items: FeedItem[] }) {
  // Month being browsed — defaults to today's month; arrows move it.
  const [cursor, setCursor] = useState(() => moment().startOf('month'));
  const [selectedKey, setSelectedKey] = useState(() => moment().format('YYYY-MM-DD'));

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

  // Grid spans Sunday-of-first-week → Saturday-of-last-week of the cursor's
  // month, so the first and last rows include some adjacent-month days.
  const grid = useMemo(() => {
    const start = cursor.clone().startOf('month').startOf('week');
    const end = cursor.clone().endOf('month').endOf('week');
    const days: moment.Moment[] = [];
    const d = start.clone();
    while (d.isSameOrBefore(end)) {
      days.push(d.clone());
      d.add(1, 'day');
    }
    // 6 rows max
    const rows: moment.Moment[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [cursor]);

  const today = moment().startOf('day');
  const weekDayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const selectedDayItems = byDay.get(selectedKey) ?? [];

  return (
    <View>
      {/* Month header with prev/next */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <TouchableOpacity onPress={() => setCursor((c) => c.clone().subtract(1, 'month'))} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: theme.colors.text, fontSize: 15, fontWeight: '600' }}>
          {cursor.format('MMMM YYYY')}
        </Text>
        <TouchableOpacity onPress={() => setCursor((c) => c.clone().add(1, 'month'))} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* Day-of-week header */}
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {weekDayLabels.map((l, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', color: theme.colors.textDarker, fontSize: 11 }}>{l}</Text>
        ))}
      </View>

      {/* Grid */}
      {grid.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((day) => {
            const key = day.format('YYYY-MM-DD');
            const inMonth = day.month() === cursor.month();
            const isToday = day.isSame(today, 'day');
            const isSelected = key === selectedKey;
            const itemCount = byDay.get(key)?.length ?? 0;
            return (
              <TouchableOpacity
                key={key}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  margin: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  backgroundColor: isSelected
                    ? theme.colors.primary
                    : isToday
                    ? theme.colors.secondary
                    : 'transparent',
                  borderWidth: isToday && !isSelected ? 1 : 0,
                  borderColor: theme.colors.primary,
                }}
                onPress={() => setSelectedKey(key)}
              >
                <Text
                  style={{
                    color: isSelected
                      ? '#000'
                      : inMonth
                      ? theme.colors.text
                      : theme.colors.textDarker,
                    fontSize: 13,
                    fontWeight: isToday || isSelected ? '700' : '400',
                  }}
                >
                  {day.date()}
                </Text>
                {itemCount > 0 ? (
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 2.5,
                      backgroundColor: isSelected ? '#000' : theme.colors.accent,
                      marginTop: 2,
                    }}
                  />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Selected-day items below the grid */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 6, textTransform: 'uppercase' }}>
          {moment(selectedKey).format('dddd, MMM D')}
        </Text>
        {selectedDayItems.length === 0 ? (
          <Text style={{ color: theme.colors.textDarker, fontSize: 13 }}>Nothing on this day.</Text>
        ) : (
          selectedDayItems.map((it) => <FeedItemCard key={it.id} item={it} />)
        )}
      </View>
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

  // ---- My Tasks feed items (Planner tasks within ~7 days) -----------------
  // Meetings + events have their own tabs; Notifications has one too. This
  // section is scoped to Planner tasks specifically.

  const taskItems = useMemo(() => {
    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return items.filter((it) => {
      if (it.source !== 'planner-task') return false;
      const t = timeOf(it);
      if (!t) return false;
      if (isOverdue(it)) return true;
      const ts = new Date(t).getTime();
      return ts >= Date.now() - 24 * 60 * 60 * 1000 && ts <= horizon;
    });
  }, [items]);

  // ---- Timesheet cut-off (bi-weekly Fridays) -------------------------------
  // Anchor is the most recent known cutoff: Friday 2026-05-29. Next cutoff
  // is the smallest anchor + 14n that's ≥ today. Move the anchor when the
  // tenant pay cycle changes (or surface it from the api/ when wired).
  const { cutoffDate, daysRemaining } = useMemo(() => {
    const anchor = moment('2026-05-29').startOf('day');   // last cutoff
    const today = moment().startOf('day');
    const daysSince = today.diff(anchor, 'days');
    const remainder = ((daysSince % 14) + 14) % 14;
    const daysToNext = remainder === 0 ? 0 : 14 - remainder;
    return {
      cutoffDate: today.clone().add(daysToNext, 'days'),
      daysRemaining: daysToNext,
    };
  }, []);

  return (
    <PageContainer>
      <PageContent>
        {/* ── 1. TIME KEEPING (staff + admin) ───────────────────────────── */}
        {isStaffOrAdmin ? (
          <Card
            style={{
              backgroundColor: theme.colors.darkDefault,
              marginBottom: 16,
              // Border-left accent flips to red when something is waiting on
              // the admin — visual "this needs you" cue.
              borderLeftWidth: 3,
              borderLeftColor: pendingApprovals > 0 ? theme.colors.accent : theme.colors.primary,
            }}
          >
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
                <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>Time keeping</Text>
                {/* Alert badge when timesheets are awaiting approval. */}
                {pendingApprovals > 0 ? (
                  <Badge
                    style={{ backgroundColor: theme.colors.accent }}
                  >
                    {pendingApprovals === 1
                      ? '1 timesheet to approve'
                      : `${pendingApprovals} timesheets to approve`}
                  </Badge>
                ) : null}
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

              {/* Next cut-off + days remaining — semi-monthly cycle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.secondary }}>
                <MaterialCommunityIcons name="calendar-clock" size={16} color={theme.colors.textDarker} style={{ marginRight: 6 }} />
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, flex: 1 }}>
                  Cut-off {cutoffDate.format('ddd, MMM D')}
                </Text>
                <Chip
                  compact
                  style={{
                    backgroundColor: daysRemaining <= 2 ? theme.colors.accent : theme.colors.secondary,
                  }}
                  textStyle={{ color: daysRemaining <= 2 ? '#000' : theme.colors.text, fontSize: 10 }}
                >
                  {daysRemaining === 0
                    ? 'Due today'
                    : daysRemaining === 1
                    ? '1 day left'
                    : `${daysRemaining} days left`}
                </Chip>
              </View>

              <Button
                mode={pendingApprovals > 0 ? 'contained' : 'outlined'}
                compact
                icon="clock-outline"
                buttonColor={pendingApprovals > 0 ? theme.colors.accent : undefined}
                textColor={pendingApprovals > 0 ? '#000' : theme.colors.primary}
                style={{ marginTop: 12, alignSelf: 'flex-start' }}
                onPress={() => navigation.navigate('timekeeping')}
              >
                {pendingApprovals > 0 ? 'Review timesheets' : 'Open time keeping'}
              </Button>
            </Card.Content>
          </Card>
        ) : null}

        {/* ── 2. MY PROJECTS — Planner plans as project bars ────────────── */}
        {isStaffOrAdmin ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <MaterialCommunityIcons name="folder-multiple-outline" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
                <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>My projects</Text>
                {rollup ? (
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                    {rollup.byProgramArea.length} plan{rollup.byProgramArea.length === 1 ? '' : 's'}
                  </Text>
                ) : null}
              </View>
              {!rollup ? (
                <Text style={{ color: theme.colors.textDarker }}>Loading Planner data…</Text>
              ) : rollup.byProgramArea.length === 0 ? (
                <Text style={{ color: theme.colors.textDarker }}>No active Planner plans.</Text>
              ) : (
                <>
                  {rollup.byProgramArea.map((row, idx) => {
                    const total = row.open + row.completed;
                    const pct = total > 0 ? row.completed / total : 0;
                    return (
                      <View key={row.programArea} style={{ marginBottom: 10 }}>
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
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 6 }}>
                    From Microsoft Planner · refreshed {new Date(rollup.generatedAt).toLocaleTimeString()}
                  </Text>
                </>
              )}
            </Card.Content>
          </Card>
        ) : null}

        {/* ── 3. MY TASKS — Planner tasks, list / calendar toggle ───────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <MaterialCommunityIcons name="checkbox-marked-outline" size={18} color={theme.colors.text} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>
            My tasks {formatRange(taskItems) ? `· ${formatRange(taskItems)}` : ''}
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
          <NoContent loading message="Loading your tasks…" />
        ) : taskItems.length === 0 ? (
          <NoContent message="No Planner tasks due this week. Clear slate." />
        ) : view === 'list' ? (
          // List groups items under a date heading so dates aren't lost.
          (() => {
            const byDay = new Map<string, typeof taskItems>();
            for (const it of taskItems) {
              const t = timeOf(it);
              if (!t) continue;
              const key = moment(t).format('YYYY-MM-DD');
              byDay.set(key, [...(byDay.get(key) ?? []), it]);
            }
            return Array.from(byDay.entries()).map(([day, dayItems]) => (
              <View key={day} style={{ marginBottom: 12 }}>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 6, textTransform: 'uppercase' }}>
                  {moment(day).format('dddd, MMM D')}
                </Text>
                {dayItems.map((it) => (
                  <FeedItemCard key={it.id} item={it} />
                ))}
              </View>
            ));
          })()
        ) : (
          <CalendarView items={taskItems} />
        )}

      </PageContent>
    </PageContainer>
  );
}
