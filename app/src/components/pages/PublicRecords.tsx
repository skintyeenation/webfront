import React, { useEffect } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { PageContainer, PageContent, NoContent, BarChart, PieChart, colorAt } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadExpenditures, loadMajorProjects } from 'skintyee/store/modules/transparency';
import { theme } from 'skintyee/styles';

const currency = (n: number) => `$${n.toLocaleString('en-CA')}`;
const k = (n: number) => `$${(n / 1000).toFixed(0)}k`;

const statusColor: Record<string, string> = {
  complete: theme.colors.success,
  in_progress: theme.colors.primary,
  planned: theme.colors.textDarker,
};

/**
 * Public Records = transparent band expenditures. Shows where the Nation's money
 * goes, by program area, with a chart. Tap an area to drill into a breakdown
 * (how much was spent and where). Figures come from the Ferrus / Adagio (Sage)
 * financial integration once wired (mocked for the POC).
 */
export default function PublicRecords({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, majorProjects, loading, loaded } = useAppSelector((s) => s.transparency);

  useEffect(() => {
    dispatch(loadExpenditures());
    dispatch(loadMajorProjects());
  }, [dispatch]);

  const totalSpent = entities.reduce((s, e) => s + e.spent, 0);
  const totalBudget = entities.reduce((s, e) => s + e.budget, 0);

  if (entities.length === 0) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent loading={loading || !loaded} message="No expenditure data." />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.text, fontSize: 18, marginBottom: 2 }}>Where the money goes</Text>
        <Text style={{ color: theme.colors.textDarker, marginBottom: 14 }}>
          {currency(totalSpent)} spent of {currency(totalBudget)} budgeted · FY2024
        </Text>

        {/* Budget summary pie */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
          <Card.Content>
            <Text style={{ color: theme.colors.text, marginBottom: 12 }}>Budget summary</Text>
            <PieChart
              data={entities.map((e, i) => ({ label: e.area, value: e.spent, color: colorAt(i) }))}
              centerLabel={k(totalSpent)}
              centerSub="spent"
              formatValue={k}
            />
          </Card.Content>
        </Card>

        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
          <Card.Content>
            <BarChart
              data={entities.map((e) => ({ label: e.area, value: e.spent, max: e.budget, color: theme.colors.primary }))}
              formatValue={currency}
            />
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 4 }}>Bar = spent · faint track = budget</Text>
          </Card.Content>
        </Card>

        <Text style={{ color: theme.colors.textDarker, marginBottom: 8 }}>Tap an area for the breakdown</Text>
        {entities.map((e) => (
          <TouchableOpacity key={e._id} onPress={() => navigation.navigate('expenditureDetail', { id: e._id })}>
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 8 }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ color: theme.colors.text, fontSize: 15 }}>{e.area}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{Math.round((e.spent / e.budget) * 100)}% of budget</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: theme.colors.success, marginRight: 6 }}>{currency(e.spent)}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textDarker} />
                  </View>
                </View>
              </Card.Content>
            </Card>
          </TouchableOpacity>
        ))}

        {/* Major projects: allocated vs spent */}
        <Text style={{ color: theme.colors.text, fontSize: 16, marginTop: 18, marginBottom: 8 }}>Major projects</Text>
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
      </PageContent>
    </PageContainer>
  );
}
