import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Card, SegmentedButtons, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { PageContainer, PageContent, NoContent, BarChart, PieChart, colorAt } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadExpenditures, loadMajorProjects } from 'skintyee/store/modules/transparency';
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

// ---- Main page ------------------------------------------------------------
// Admin-tools rollup (Planner + time keeping) used to render below this
// screen for staff + admin. It moved to the Dashboard so admins land on
// operational state by default — see app/src/components/pages/Dashboard.tsx.

export default function PublicRecords({ navigation }: any) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(loadExpenditures());
    dispatch(loadMajorProjects());
  }, [dispatch]);

  return (
    <PageContainer>
      <PageContent>
        <MemberSection navigation={navigation} />
      </PageContent>
    </PageContainer>
  );
}
