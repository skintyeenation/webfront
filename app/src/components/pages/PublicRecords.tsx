import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Button, Card, Chip, ProgressBar, SegmentedButtons, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { PageContainer, PageContent, NoContent, BarChart, PieChart, colorAt } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadExpenditures, loadMajorProjects } from 'skintyee/store/modules/transparency';
import { loadRollup } from 'skintyee/store/modules/planner';
import { loadTimeEntries } from 'skintyee/store/modules/timekeeping';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Records — one tab, two role-based views (ADR-14 / docs/features/planner-
// dashboard.md).
//
//   • MEMBER VIEW  (visible to public + member + staff + admin):
//       - Budget month/year transparency (totals + pie + bar)
//       - Expenditures by program area, drill-down per area
//       - Major projects status
//     The transparency content that used to live on the old Dashboard
//     moves HERE so the new homescreen can stay focused on notifications +
//     calendar/feed.
//
//   • ADMIN VIEW   (visible to staff + admin only — renders BELOW the
//                   member content, additively):
//       - Planner board rollup (cross-Nation, from Microsoft Planner)
//       - Time keeping summary
//       - Link to full Financial Records
//     Powered by the api/'s GraphFeedService (Tasks.Read.All etc.); see
//     scripts/setup-app-graph.sh.
// ----------------------------------------------------------------------------

type Period = 'month' | 'year';

const currency = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`;
const k = (n: number) => `$${(n / 1000).toFixed(0)}k`;

const statusColor: Record<string, string> = {
  complete: theme.colors.success,
  in_progress: theme.colors.primary,
  planned: theme.colors.textDarker,
};

// ---- Member view: budget transparency -------------------------------------

function MemberSection({ navigation }: { navigation: any }) {
  const { entities, majorProjects, loading, loaded } = useAppSelector((s) => s.transparency);
  const [period, setPeriod] = useState<Period>('year');
  const f = period === 'month' ? 1 / 12 : 1;
  const periodWord = period === 'month' ? 'this month' : 'this year';

  const totalSpent = entities.reduce((s, e) => s + e.spent, 0) * f;
  const totalBudget = entities.reduce((s, e) => s + e.budget, 0) * f;
  const pctOfBudget = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;

  if (entities.length === 0) {
    return <NoContent loading={loading || !loaded} message="No expenditure data." />;
  }

  return (
    <View>
      <Text style={{ color: theme.colors.text, fontSize: 18, marginBottom: 8 }}>Where the money goes</Text>

      <SegmentedButtons
        value={period}
        onValueChange={(v) => setPeriod(v as Period)}
        density="small"
        style={{ marginBottom: 12 }}
        buttons={[
          { value: 'month', label: 'Month', icon: 'calendar-month' },
          { value: 'year', label: 'Year', icon: 'calendar' },
        ]}
      />

      <Text style={{ color: theme.colors.textDarker, marginBottom: 14 }}>
        {currency(totalSpent)} spent of {currency(totalBudget)} budgeted · {pctOfBudget}% · {periodWord}
      </Text>

      {/* Budget summary pie */}
      <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
        <Card.Content>
          <Text style={{ color: theme.colors.text, marginBottom: 12 }}>Budget summary ({periodWord})</Text>
          <PieChart
            data={entities.map((e, i) => ({ label: e.area, value: e.spent * f, color: colorAt(i) }))}
            centerLabel={k(totalSpent)}
            centerSub={periodWord}
            formatValue={k}
          />
        </Card.Content>
      </Card>

      {/* Budget vs actual overall */}
      <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: theme.colors.text }}>Budget vs actual ({periodWord})</Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
              {currency(totalSpent)} of {currency(totalBudget)}
            </Text>
          </View>
          <ProgressBar progress={totalBudget ? totalSpent / totalBudget : 0} color={theme.colors.success} style={{ height: 8, backgroundColor: theme.colors.secondary }} />
        </Card.Content>
      </Card>

      {/* Per-area bar chart */}
      <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
        <Card.Content>
          <BarChart
            data={entities.map((e) => ({ label: e.area, value: e.spent * f, max: e.budget * f, color: theme.colors.primary }))}
            formatValue={currency}
          />
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 4 }}>Bar = spent · faint track = budget</Text>
        </Card.Content>
      </Card>

      <Text style={{ color: theme.colors.textDarker, marginBottom: 8 }}>Tap an area for the breakdown</Text>
      {entities.map((e) => (
        <TouchableOpacity key={e._id} onPress={() => navigation.navigate('expenditureDetail', { id: e._id, period })}>
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 8 }}>
            <Card.Content>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ color: theme.colors.text, fontSize: 15 }}>{e.area}</Text>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{Math.round((e.spent / e.budget) * 100)}% of budget</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.success, marginRight: 6 }}>{currency(e.spent * f)}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textDarker} />
                </View>
              </View>
            </Card.Content>
          </Card>
        </TouchableOpacity>
      ))}

      {/* Major projects (project-to-date — not period-scaled) */}
      <Text style={{ color: theme.colors.text, fontSize: 16, marginTop: 18, marginBottom: 8 }}>Major projects (project to date)</Text>
      {majorProjects.map((p) => (
        <Card key={p._id} style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 8 }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1, paddingRight: 8 }}>{p.name}</Text>
              <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: statusColor[p.status], fontSize: 10 }}>
                {p.status.replace('_', ' ')}
              </Chip>
            </View>
            <View style={{ height: 10, backgroundColor: theme.colors.secondary, borderRadius: 5, overflow: 'hidden' }}>
              <View style={{ height: 10, width: `${Math.min(100, (p.spent / p.allocated) * 100)}%`, backgroundColor: theme.colors.success, borderRadius: 5 }} />
            </View>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 4 }}>
              {currency(p.spent)} spent of {currency(p.allocated)} allocated ({Math.round((p.spent / p.allocated) * 100)}%)
            </Text>
          </Card.Content>
        </Card>
      ))}
    </View>
  );
}

// ---- Admin view: operational management depth -----------------------------

function AdminSection({ navigation }: { navigation: any }) {
  const dispatch = useAppDispatch();
  const role = useAppSelector((s) => s.auth.role);
  const rollup = useAppSelector((s) => s.planner.rollup);
  const timeEntries = useAppSelector((s) => s.timekeeping.entities);
  const pendingApprovals = timeEntries.filter((t) => !t.approved).length;
  const hoursLogged = timeEntries.reduce((s, t) => s + t.hours, 0);

  useEffect(() => {
    dispatch(loadRollup());
    dispatch(loadTimeEntries());
  }, [dispatch]);

  return (
    <View style={{ marginTop: 24 }}>
      {/* Section divider with admin badge */}
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

              {/* Per-program-area breakdown */}
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

              {/* Top overdue */}
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
  );
}

// ---- Main page: stacks Member view + (if role allows) Admin view ----------

export default function PublicRecords({ navigation }: any) {
  const dispatch = useAppDispatch();
  const role = useAppSelector((s) => s.auth.role);
  const isStaffOrAdmin = role === 'staff' || role === 'admin';

  useEffect(() => {
    dispatch(loadExpenditures());
    dispatch(loadMajorProjects());
  }, [dispatch]);

  return (
    <PageContainer>
      <PageContent>
        <MemberSection navigation={navigation} />
        {isStaffOrAdmin ? <AdminSection navigation={navigation} /> : null}
      </PageContent>
    </PageContainer>
  );
}
