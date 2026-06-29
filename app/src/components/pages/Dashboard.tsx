import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Badge, Button, Card, Chip, IconButton, ProgressBar, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import { GovernanceFundingDeadlines, NoContent, PageContainer, PageContent, colorAt } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadFeed } from 'skintyee/store/modules/feed';
import { loadRollup } from 'skintyee/store/modules/planner';
import { loadTimeEntries } from 'skintyee/store/modules/timekeeping';
import { apiFactory } from 'skintyee/store/apis';
import { FeedItem, Role } from 'skintyee/models';
import FEATURES from 'skintyee/features';
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
function CalendarView({ items, hideDayList }: { items: FeedItem[]; hideDayList?: boolean }) {
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: isSelected ? '#000' : theme.colors.accent,
                      }}
                    />
                    {itemCount > 1 ? (
                      <Text
                        style={{
                          color: isSelected ? '#000' : theme.colors.text,
                          fontSize: 12,
                          fontWeight: '700',
                          marginLeft: 4,
                        }}
                      >
                        {itemCount}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Selected-day items below the grid — hidden when the overlay shows the
          full task list in its own column (hideDayList) to avoid a duplicate. */}
      {!hideDayList ? (
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
      ) : null}
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
  const userKind = useAppSelector((s) => s.auth.user?.kind);
  const isAdmin = role === 'admin';
  const isStaffOrAdmin = role === 'staff' || role === 'admin';
  // M365-dependent widgets — feature-gated. External users (staff-
  // auth path, no Entra identity) have nothing for Graph to fetch
  // for Planner / Teams, so the widgets just show empty + the api/
  // logs Graph 404s. Hide both the cards AND the data fetches when
  // the flag is on. See app/src/features.ts.
  const hasM365 = userKind !== 'staff';
  const showPlannerWidgets = isStaffOrAdmin && (hasM365 || !FEATURES.hideM365WidgetsForExternals);
  const { items, loading, loaded } = useAppSelector((s) => s.feed);

  // Planner rollup + time entries — admin-tools section below the feed
  const rollup = useAppSelector((s) => s.planner.rollup);
  const timeEntries = useAppSelector((s) => s.timekeeping.entities);
  const pendingApprovals = timeEntries.filter((t) => !t.approved).length;
  const hoursLogged = timeEntries.reduce((s, t) => s + t.hours, 0);

  // Worker-side timesheet snapshot for the current pay period — pulled
  // when the signed-in user isn't admin so the widget can render their
  // own hours instead of the approver-side "Review timesheets" copy.
  const [myTimesheet, setMyTimesheet] = useState<null | { status: string; totalHours: number; week1Hours: number; week2Hours: number; overtimeHours: number }>(null);
  const [myPeriodLabel, setMyPeriodLabel] = useState<string | undefined>();
  const [myEligible, setMyEligible] = useState<boolean | null>(null);
  // Open onboarding assignments for the signed-in user. Pinned alert
  // banner at the top of the dashboard until dismissed in-session.
  // Reloading the app re-fetches + re-shows.
  const [openOnboardingCount, setOpenOnboardingCount] = useState(0);
  const [openFlowTitles, setOpenFlowTitles] = useState<string[]>([]);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  // Dismiss state for the timesheet-due reminder banner (re-shows on reload).
  const [timesheetDismissed, setTimesheetDismissed] = useState(false);

  // My-tasks calendar is a full-content overlay (toggled), not an inline tab.
  const [calendarOpen, setCalendarOpen] = useState(false);

  // "My projects" + "My tasks" sit side by side on DESKTOP only. Gate on
  // Platform.OS === 'web' so the native tablet app (iOS/Android) always keeps
  // the stacked layout — tablet portrait *and* landscape stay single-column.
  const { width } = useWindowDimensions();
  const twoCol = Platform.OS === 'web' && width >= 1024;
  // The calendar overlay splits (calendar 1/3 · cards 2/3) on tablet AND
  // desktop — width-based (no Platform gate) so native tablets get it too.
  const calendarSplit = width >= 768;

  // Pull this week's feed on mount; staff/admin also pull Planner + time.
  useEffect(() => {
    const from = moment().startOf('day').toISOString();
    const to = moment().add(7, 'days').endOf('day').toISOString();
    dispatch(loadFeed({ role, from, to }));
    if (isStaffOrAdmin) {
      // loadRollup pulls Microsoft Planner data — skip for externals
      // when the feature flag is on. loadTimeEntries is Postgres-
      // backed and works for everyone.
      if (showPlannerWidgets) dispatch(loadRollup());
      dispatch(loadTimeEntries());
    }
  }, [dispatch, role, isStaffOrAdmin, showPlannerWidgets]);

  // Personal timesheet fetch — for EVERY role (gated by /me/eligible so
  // non-workers don't render an empty widget). Non-admins also render the
  // MyTimekeepingCard from this; admins use it only for the "timesheet due"
  // banner (an admin who's also a worker still owes their own timesheet).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = apiFactory().timekeeping;
        const me = await api.meEligible();
        if (cancelled) return;
        setMyEligible(!!me.eligible);
        if (!me.eligible) return;
        const my = await api.myTimesheets();
        if (cancelled) return;
        setMyPeriodLabel(my.period?.label);
        if (my.current) {
          setMyTimesheet({
            status: my.current.status,
            totalHours: my.current.totalHours ?? 0,
            week1Hours: my.current.week1Hours ?? 0,
            week2Hours: my.current.week2Hours ?? 0,
            overtimeHours: my.current.overtimeHours ?? 0,
          });
        }
      } catch { /* swallow — widget hides gracefully */ }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  // Open onboarding assignments — separate fetch so admins (who can
  // also be assigned an onboarding flow) see the alert too. Runs once
  // per Dashboard mount; "every time we reload" satisfied by the mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const as = await apiFactory().onboarding.myAssignments();
        if (cancelled) return;
        const open = as.filter((a) => !a.completedAt);
        setOpenOnboardingCount(open.length);
        // Pull titles for the alert copy — best-effort, fall back to
        // the count-only banner if any flow lookup fails.
        if (open.length > 0) {
          const flows = await Promise.all(
            open.map((a) => apiFactory().onboarding.getFlow(a.flowId).catch(() => null)),
          );
          if (cancelled) return;
          setOpenFlowTitles(flows.filter(Boolean).map((f) => f!.title));
        }
      } catch { /* swallow — banner just doesn't render */ }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // Tasks grouped under a date heading — shared by the inline list and the
  // calendar overlay's right column.
  const renderTaskDays = () => {
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
  };

  return (
    <PageContainer>
      <PageContent>
        {/* Pinned alert: open onboarding work. Dismissable in-session;
            reloading the app re-fires the fetch + shows it again until
            the underlying assignments are completed server-side. */}
        {openOnboardingCount > 0 && !onboardingDismissed ? (
          <Card
            style={{
              backgroundColor: theme.colors.darkDefault,
              marginBottom: 12,
              borderLeftWidth: 3,
              borderLeftColor: theme.colors.accent,
            }}
          >
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <MaterialCommunityIcons name="clipboard-alert-outline" size={20} color={theme.colors.accent} style={{ marginRight: 8, marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
                    Onboarding incomplete
                  </Text>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
                    {openOnboardingCount === 1
                      ? `You have an open onboarding flow${openFlowTitles[0] ? `: ${openFlowTitles[0]}` : ''}.`
                      : `You have ${openOnboardingCount} open onboarding flows${openFlowTitles.length ? `: ${openFlowTitles.join(', ')}` : ''}.`}
                  </Text>
                  <View style={{ flexDirection: 'row', marginTop: 8 }}>
                    <Button
                      compact mode="contained" icon="arrow-right"
                      buttonColor={theme.colors.primary} textColor="#fff"
                      onPress={() => navigation.navigate(isAdmin ? 'Admin' : 'More', { screen: 'myOnboarding', initial: false })}
                    >
                      Open
                    </Button>
                    <Button
                      compact mode="text" icon="close"
                      textColor={theme.colors.textDarker}
                      onPress={() => setOnboardingDismissed(true)}
                      style={{ marginLeft: 4 }}
                    >
                      Dismiss
                    </Button>
                  </View>
                </View>
              </View>
            </Card.Content>
          </Card>
        ) : null}

        {/* Timesheet-due reminder — the prompt to enter/submit before cut-off.
            Shown to ANY eligible worker (staff or admin) who hasn't submitted,
            within 3 days of cut-off; red + "due today" on the cut-off date. */}
        {(() => {
          const myStatus = myTimesheet?.status ?? 'not_started';
          const needsTimesheet = myEligible && !['submitted', 'approved'].includes(myStatus);
          if (!needsTimesheet || daysRemaining > 3 || timesheetDismissed) return null;
          const dueToday = daysRemaining === 0;
          // Green for due-today (actionable "do it now"), amber for the lead-up.
          const color = dueToday ? theme.colors.success : theme.colors.accent;
          return (
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: color }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={20} color={color} style={{ marginRight: 8, marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
                      {dueToday ? 'Timesheet due today' : `Timesheet due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}
                    </Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
                      {`Cut-off ${cutoffDate.format('ddd, MMM D')}. `}
                      {myStatus === 'rejected'
                        ? 'Your timesheet was rejected — fix and resubmit.'
                        : myTimesheet?.totalHours
                          ? `You've logged ${myTimesheet.totalHours}h — submit it.`
                          : 'You haven’t entered your hours yet.'}
                    </Text>
                    <View style={{ flexDirection: 'row', marginTop: 8 }}>
                      <Button
                        compact mode="contained" icon="clock-edit-outline"
                        buttonColor={theme.colors.success} textColor="#000"
                        onPress={() => navigation.navigate(isAdmin ? 'Admin' : 'More', { screen: 'timekeeping', initial: false })}
                      >
                        Enter my timesheet
                      </Button>
                      <Button
                        compact mode="text" icon="close" textColor={theme.colors.textDarker}
                        onPress={() => setTimesheetDismissed(true)} style={{ marginLeft: 4 }}
                      >
                        Dismiss
                      </Button>
                    </View>
                  </View>
                </View>
              </Card.Content>
            </Card>
          );
        })()}

        {/* ── 1. TIME KEEPING — admin approver card or worker self-view.
            Both components live at the bottom of this file; see
            AdminTimekeepingCard / MyTimekeepingCard. */}
        {isAdmin ? (
          <AdminTimekeepingCard
            pendingApprovals={pendingApprovals}
            hoursLogged={hoursLogged}
            cutoffDate={cutoffDate}
            daysRemaining={daysRemaining}
            wide={twoCol}
            onOpen={() => navigation.navigate('Admin', { screen: 'timekeeping', initial: false })}
          />
        ) : myEligible ? (
          <MyTimekeepingCard
            status={myTimesheet?.status ?? 'not_started'}
            totalHours={myTimesheet?.totalHours ?? 0}
            week1Hours={myTimesheet?.week1Hours ?? 0}
            week2Hours={myTimesheet?.week2Hours ?? 0}
            overtimeHours={myTimesheet?.overtimeHours ?? 0}
            periodLabel={myPeriodLabel}
            cutoffDate={cutoffDate}
            daysRemaining={daysRemaining}
            onOpen={() => navigation.navigate('More', { screen: 'timekeeping', initial: false })}
          />
        ) : null}

        {/* Governance funding calendar — PAW/DCI deadlines; after the time-keeping
            row. Renders only for council / finance / system-admin / band-manager / admin. */}
        <GovernanceFundingDeadlines />

        {/* ── 2. MY PROJECTS — Planner plans as project bars ────────────── */}
        {showPlannerWidgets ? (
          <View style={twoCol ? { flexDirection: 'row', alignItems: 'flex-start' } : undefined}>
          <View style={twoCol ? { flex: 1, marginRight: 8 } : undefined}>
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
          </View>
          <View style={twoCol ? { flex: 1, marginLeft: 8 } : undefined}>

        {/* ── 3. MY TASKS — Planner tasks, list / calendar toggle ─────────
            Gated on showPlannerWidgets — externals (staff-auth, no
            Entra) don't have Planner tasks to surface. See features.ts. */}
        {showPlannerWidgets ? <>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <MaterialCommunityIcons name="checkbox-marked-outline" size={18} color={theme.colors.text} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>
            My tasks {formatRange(taskItems) ? `· ${formatRange(taskItems)}` : ''}
          </Text>
          {taskItems.length > 0 ? (
            <Button
              compact mode="text" icon="calendar-month"
              textColor={theme.colors.primary}
              onPress={() => setCalendarOpen(true)}
            >
              Show calendar
            </Button>
          ) : null}
        </View>

        {!loaded && loading ? (
          <NoContent loading message="Loading your tasks…" />
        ) : taskItems.length === 0 ? (
          <NoContent message="No Planner tasks due this week. Clear slate." />
        ) : (
          renderTaskDays()
        )}
        </> : null}
          </View>
          </View>
        ) : null}

      </PageContent>

      {/* My-tasks calendar — fills the content area (below the app header and
          right of the sidebar, since it's inside PageContainer), not a small
          centered dialog. Toggled from the "Show calendar" button. */}
      {calendarOpen ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background, zIndex: 20 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.secondary }}>
            <MaterialCommunityIcons name="calendar-month" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>
              My tasks · calendar
            </Text>
            <IconButton icon="close" size={22} iconColor={theme.colors.text} onPress={() => setCalendarOpen(false)} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
            {calendarSplit ? (
              // Tablet + desktop: calendar 1/3 left, task-list cards 2/3 right.
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <CalendarView items={taskItems} hideDayList />
                </View>
                <View style={{ flex: 2 }}>
                  {renderTaskDays()}
                </View>
              </View>
            ) : (
              // Phone: calendar grid, then the list below (single list).
              <>
                <CalendarView items={taskItems} hideDayList />
                <View style={{ marginTop: 12 }}>{renderTaskDays()}</View>
              </>
            )}
          </ScrollView>
        </View>
      ) : null}
    </PageContainer>
  );
}

// ---- TIME KEEPING widgets ------------------------------------------------
//
// Two role-flavoured cards that share the same outer shape: header row
// ("Time keeping" + status/badge), totals row, cut-off footer, primary
// CTA. Co-located in Dashboard.tsx since both are dashboard-only; if
// either grows new use sites, lift to components/layout/.

interface AdminTimekeepingCardProps {
  pendingApprovals: number;
  hoursLogged: number;
  cutoffDate: moment.Moment;
  daysRemaining: number;
  onOpen: () => void;
  wide?: boolean; // desktop → stats + cut-off + CTA on one row
}

function AdminTimekeepingCard({ pendingApprovals, hoursLogged, cutoffDate, daysRemaining, onOpen, wide }: AdminTimekeepingCardProps) {
  return (
    <Card
      style={{
        backgroundColor: theme.colors.darkDefault,
        marginBottom: 16,
        // Border-left accent flips to orange when something is waiting
        // on the admin — visual "this needs you" cue.
        borderLeftWidth: 3,
        borderLeftColor: pendingApprovals > 0 ? theme.colors.accent : theme.colors.primary,
      }}
    >
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.accent} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>Time keeping</Text>
          {pendingApprovals > 0 ? (
            <Badge style={{ backgroundColor: theme.colors.accent }}>
              {pendingApprovals === 1 ? '1 timesheet to approve' : `${pendingApprovals} timesheets to approve`}
            </Badge>
          ) : null}
        </View>
        {(() => {
          const statEntries = (
            <View style={wide ? { marginRight: 28 } : { flex: 1 }}>
              <Text style={{ color: pendingApprovals > 0 ? theme.colors.accent : theme.colors.success, fontSize: 22 }}>{pendingApprovals}</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Entries to approve</Text>
            </View>
          );
          const statHours = (
            <View style={wide ? { marginRight: 28 } : { flex: 1 }}>
              <Text style={{ color: theme.colors.primary, fontSize: 22 }}>{hoursLogged}</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Hours · all workers</Text>
            </View>
          );
          const button = (
            <Button
              mode={pendingApprovals > 0 ? 'contained' : 'outlined'}
              compact icon="clock-outline"
              buttonColor={pendingApprovals > 0 ? theme.colors.accent : undefined}
              textColor={pendingApprovals > 0 ? '#000' : theme.colors.primary}
              style={wide ? undefined : { marginTop: 12, alignSelf: 'flex-start' }}
              onPress={onOpen}
            >
              {pendingApprovals > 0 ? 'Review timesheets' : 'Open time keeping'}
            </Button>
          );
          // Desktop: stats + cut-off + CTA on one row (no stacked footer).
          if (wide) {
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {statEntries}
                {statHours}
                <CutoffFooter cutoffDate={cutoffDate} daysRemaining={daysRemaining} inline />
                <View style={{ flex: 1 }} />
                {button}
              </View>
            );
          }
          return (
            <>
              <View style={{ flexDirection: 'row' }}>
                {statEntries}
                {statHours}
              </View>
              <CutoffFooter cutoffDate={cutoffDate} daysRemaining={daysRemaining} />
              {button}
            </>
          );
        })()}
      </Card.Content>
    </Card>
  );
}

interface MyTimekeepingCardProps {
  status: string;
  totalHours: number;
  week1Hours: number;
  week2Hours: number;
  overtimeHours: number;
  periodLabel?: string;
  cutoffDate: moment.Moment;
  daysRemaining: number;
  onOpen: () => void;
}

const MY_STATUS_LABEL: Record<string, string> = {
  draft: 'DRAFT',
  submitted: 'SUBMITTED',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  not_started: 'NOT STARTED',
};

function MyTimekeepingCard({
  status, totalHours, week1Hours, week2Hours, overtimeHours, periodLabel,
  cutoffDate, daysRemaining, onOpen,
}: MyTimekeepingCardProps) {
  // Status-driven left rule colour so a rejection / approval stands out.
  const accent =
      status === 'rejected'  ? theme.colors.error
    : status === 'submitted' || status === 'in_progress' ? theme.colors.accent
    : status === 'approved'  ? theme.colors.success
    : theme.colors.primary;

  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: accent }}>
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.accent} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>Time keeping</Text>
          <Chip compact style={{ backgroundColor: accent }} textStyle={{ color: '#000', fontSize: 10 }}>
            {MY_STATUS_LABEL[status] ?? status.toUpperCase()}
          </Chip>
        </View>
        {periodLabel ? (
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 6 }}>
            Pay period {periodLabel}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.primary, fontSize: 22 }}>{totalHours}h</Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Total</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 22 }}>{week1Hours}h</Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Week 1</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 22 }}>{week2Hours}h</Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Week 2</Text>
          </View>
          {overtimeHours ? (
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.accent, fontSize: 22 }}>{overtimeHours}h</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>OT</Text>
            </View>
          ) : null}
        </View>
        <CutoffFooter cutoffDate={cutoffDate} daysRemaining={daysRemaining} />
        <Button
          mode="contained" compact icon="clock-outline"
          buttonColor={theme.colors.primary} textColor="#fff"
          style={{ marginTop: 12, alignSelf: 'flex-start' }}
          onPress={onOpen}
        >
          Open my timesheet
        </Button>
      </Card.Content>
    </Card>
  );
}

// Shared cut-off footer used by both flavours — pay-period banner with
// the days-remaining chip.
function CutoffFooter({ cutoffDate, daysRemaining, inline }: { cutoffDate: moment.Moment; daysRemaining: number; inline?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', ...(inline ? {} : { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.secondary }) }}>
      <MaterialCommunityIcons name="calendar-clock" size={16} color={theme.colors.textDarker} style={{ marginRight: 6 }} />
      <Text style={{ color: theme.colors.textDarker, fontSize: 12, ...(inline ? { marginRight: 8 } : { flex: 1 }) }}>
        Cut-off {cutoffDate.format('ddd, MMM D')}
      </Text>
      <Chip compact
        style={{ backgroundColor: daysRemaining <= 2 ? theme.colors.accent : theme.colors.secondary }}
        textStyle={{ color: daysRemaining <= 2 ? '#000' : theme.colors.text, fontSize: 10 }}>
        {daysRemaining === 0 ? 'Due today' : daysRemaining === 1 ? '1 day left' : `${daysRemaining} days left`}
      </Chip>
    </View>
  );
}
