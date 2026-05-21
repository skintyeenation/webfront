import React, { useEffect } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { PageContainer, PageContent, NoContent, BarChart } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadExpenditures } from 'skintyee/store/modules/transparency';
import { theme } from 'skintyee/styles';

const currency = (n: number) => `$${n.toLocaleString('en-CA')}`;

/**
 * Public Records = transparent band expenditures. Shows where the Nation's money
 * goes, by program area, with a chart. Tap an area to drill into a breakdown
 * (how much was spent and where). Figures come from the Ferrus / Adagio (Sage)
 * financial integration once wired (mocked for the POC).
 */
export default function PublicRecords({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.transparency);

  useEffect(() => {
    dispatch(loadExpenditures());
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
      </PageContent>
    </PageContainer>
  );
}
