import React from 'react';
import { View } from 'react-native';
import { Card, Divider, Text } from 'react-native-paper';
import { PageContainer, PageContent, NoContent, BarChart } from 'skintyee/components/layout';
import { useAppSelector } from 'skintyee/store';
import { theme } from 'skintyee/styles';

const currency = (n: number) => `$${n.toLocaleString('en-CA')}`;

// Drill-down for one program area: how much was spent and where.
export default function ExpenditureDetail({ route }: any) {
  const id = route?.params?.id;
  const expenditure = useAppSelector((s) => s.transparency.entities.find((e) => e._id === id));

  if (!expenditure) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent message="Expenditure area not found." />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.text, fontSize: 22 }}>{expenditure.area}</Text>
        <Text style={{ color: theme.colors.textDarker, marginBottom: 14 }}>
          {currency(expenditure.spent)} spent of {currency(expenditure.budget)} · {expenditure.fiscalYear}
        </Text>

        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16 }}>
          <Card.Content>
            <Text style={{ color: theme.colors.text, marginBottom: 10 }}>Breakdown</Text>
            <BarChart
              data={expenditure.breakdown.map((b) => ({ label: b.label, value: b.amount, color: theme.colors.accent }))}
              formatValue={currency}
            />
          </Card.Content>
        </Card>

        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Content>
            {expenditure.breakdown.map((b, i) => (
              <View key={b.label}>
                {i > 0 ? <Divider style={{ marginVertical: 8 }} /> : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.colors.text, flex: 1, paddingRight: 8 }}>{b.label}</Text>
                  <Text style={{ color: theme.colors.success }}>{currency(b.amount)}</Text>
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
