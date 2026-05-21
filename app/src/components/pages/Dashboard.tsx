import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Button, Card, Chip, ProgressBar, SegmentedButtons, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { PageContainer, PageContent, BarChart, PieChart, colorAt } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadExpenditures, loadMajorProjects } from 'skintyee/store/modules/transparency';
import { loadEvents } from 'skintyee/store/modules/events';
import { loadPolls } from 'skintyee/store/modules/polls';
import { loadDirectory } from 'skintyee/store/modules/directory';
import { loadTimeEntries } from 'skintyee/store/modules/timekeeping';
import { theme } from 'skintyee/styles';

type Period = 'month' | 'year';

const k = (n: number) => `$${(n / 1000).toFixed(0)}k`;
const full = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`;

const statusColor: Record<string, string> = {
  complete: theme.colors.success,
  in_progress: theme.colors.primary,
  planned: theme.colors.textDarker,
};

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, flexGrow: 1, flexBasis: '47%', margin: 4 }}>
      <Card.Content>
        <Text style={{ color, fontSize: 22 }}>{value}</Text>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{label}</Text>
      </Card.Content>
    </Card>
  );
}

export default function Dashboard({ navigation }: any) {
  const dispatch = useAppDispatch();
  const role = useAppSelector((s) => s.auth.role);
  const isAdmin = role === 'admin';
  const expenditures = useAppSelector((s) => s.transparency.entities);
  const majorProjects = useAppSelector((s) => s.transparency.majorProjects);
  const events = useAppSelector((s) => s.events.entities);
  const polls = useAppSelector((s) => s.polls.entities);
  const members = useAppSelector((s) => s.directory.entities);
  const timeEntries = useAppSelector((s) => s.timekeeping.entities);

  // Reporting period toggle. Annual figures are the source; "month" shows the
  // monthly run-rate (annual / 12).
  const [period, setPeriod] = useState<Period>('year');
  const f = period === 'month' ? 1 / 12 : 1;
  const periodWord = period === 'month' ? 'this month' : 'this year';

  useEffect(() => {
    dispatch(loadExpenditures());
    dispatch(loadMajorProjects());
    dispatch(loadEvents());
    dispatch(loadPolls());
    dispatch(loadDirectory());
    dispatch(loadTimeEntries());
  }, [dispatch]);

  const pendingApprovals = timeEntries.filter((t) => !t.approved).length;
  const hoursLogged = timeEntries.reduce((s, t) => s + t.hours, 0);

  const totalSpent = expenditures.reduce((s, e) => s + e.spent, 0) * f;
  const totalAllocated = expenditures.reduce((s, e) => s + e.budget, 0) * f;
  const pctOfBudget = totalAllocated ? Math.round((totalSpent / totalAllocated) * 100) : 0;
  const avgPerMember = members.length ? totalSpent / members.length : 0;
  const openPolls = polls.filter((p) => !p.closed).length;
  const upcomingEvents = events.filter((e) => new Date(e.startsAt) > new Date()).length;

  return (
    <PageContainer>
      <PageContent>
        {/* Reporting period toggle */}
        <SegmentedButtons
          value={period}
          onValueChange={(v) => setPeriod(v as Period)}
          density="small"
          style={{ marginBottom: 14 }}
          buttons={[
            { value: 'month', label: 'Month', icon: 'calendar-month' },
            { value: 'year', label: 'Year', icon: 'calendar' },
          ]}
        />

        {/* Admins get a different home: an admin overview up top. */}
        {isAdmin ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: theme.colors.accent }}>
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <MaterialCommunityIcons name="shield-account" size={20} color={theme.colors.accent} style={{ marginRight: 8 }} />
                <Text style={{ color: theme.colors.text, fontSize: 16 }}>Admin overview</Text>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: pendingApprovals > 0 ? theme.colors.accent : theme.colors.success, fontSize: 24 }}>{pendingApprovals}</Text>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Time entries to approve</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.primary, fontSize: 24 }}>{hoursLogged}</Text>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Hours logged</Text>
                </View>
              </View>
              <Button
                mode="contained"
                compact
                icon="shield-account"
                buttonColor={theme.colors.accent}
                textColor="#000"
                style={{ marginTop: 12, alignSelf: 'flex-start' }}
                onPress={() => navigation.navigate('Admin')}
              >
                Open Admin tools
              </Button>
            </Card.Content>
          </Card>
        ) : null}

        {/* Budget summary pie at the top */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
          <Card.Content>
            <Text style={{ color: theme.colors.text, fontSize: 16, marginBottom: 12 }}>Budget summary · spending by area ({periodWord})</Text>
            {expenditures.length > 0 ? (
              <PieChart
                data={expenditures.map((e, i) => ({ label: e.area, value: e.spent * f, color: colorAt(i) }))}
                centerLabel={k(totalSpent)}
                centerSub={periodWord}
                formatValue={k}
              />
            ) : (
              <Text style={{ color: theme.colors.textDarker }}>Loading…</Text>
            )}
          </Card.Content>
        </Card>

        <Text style={{ color: theme.colors.text, fontSize: 18, marginBottom: 10 }}>Community at a glance</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
          <Stat label={`Spent ${periodWord}`} value={k(totalSpent)} color={theme.colors.success} />
          <Stat label={`Spent vs allocated (${pctOfBudget}%)`} value={`${k(totalSpent)} / ${k(totalAllocated)}`} color={theme.colors.accent} />
          <Stat label="Band members" value={String(members.length)} color={theme.colors.primary} />
          <Stat label={`Avg spend / member (${periodWord})`} value={full(avgPerMember)} color={theme.colors.primary} />
          <Stat label="Upcoming events" value={String(upcomingEvents)} color={theme.colors.accent} />
          <Stat label="Open polls" value={String(openPolls)} color={theme.colors.primary} />
        </View>

        {/* Overall budget vs actual */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: theme.colors.text }}>Budget vs actual ({periodWord})</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{full(totalSpent)} of {full(totalAllocated)}</Text>
            </View>
            <ProgressBar progress={totalAllocated ? totalSpent / totalAllocated : 0} color={theme.colors.success} style={{ height: 8, backgroundColor: theme.colors.secondary }} />
          </Card.Content>
        </Card>

        <TouchableOpacity onPress={() => navigation.navigate('Records')}>
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, marginBottom: 10 }}>Spending by program area (spent vs allocated)</Text>
              {expenditures.length > 0 ? (
                <BarChart data={expenditures.map((e) => ({ label: e.area, value: e.spent * f, max: e.budget * f, color: theme.colors.primary }))} formatValue={full} />
              ) : (
                <Text style={{ color: theme.colors.textDarker }}>Loading…</Text>
              )}
              <Text style={{ color: theme.colors.accent, fontSize: 12, marginTop: 4 }}>Tap to view full transparency report ›</Text>
            </Card.Content>
          </Card>
        </TouchableOpacity>

        {/* Major projects: allocated vs spent (project to date — not period-scaled) */}
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Content>
            <Text style={{ color: theme.colors.text, marginBottom: 10 }}>Major projects · allocated vs spent (project to date)</Text>
            {majorProjects.length === 0 ? (
              <Text style={{ color: theme.colors.textDarker }}>Loading…</Text>
            ) : (
              majorProjects.map((p) => (
                <View key={p._id} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 13, flex: 1, paddingRight: 8 }}>{p.name}</Text>
                    <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: statusColor[p.status], fontSize: 10 }}>
                      {p.status.replace('_', ' ')}
                    </Chip>
                  </View>
                  <View style={{ height: 10, backgroundColor: theme.colors.secondary, borderRadius: 5, overflow: 'hidden' }}>
                    <View style={{ height: 10, width: `${Math.min(100, (p.spent / p.allocated) * 100)}%`, backgroundColor: theme.colors.success, borderRadius: 5 }} />
                  </View>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 3 }}>
                    {full(p.spent)} spent of {full(p.allocated)} allocated ({Math.round((p.spent / p.allocated) * 100)}%)
                  </Text>
                </View>
              ))
            )}
          </Card.Content>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
