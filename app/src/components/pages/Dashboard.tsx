import React, { useEffect } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { PageContainer, PageContent, BarChart } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadExpenditures } from 'skintyee/store/modules/transparency';
import { loadEvents } from 'skintyee/store/modules/events';
import { loadPolls } from 'skintyee/store/modules/polls';
import { loadDirectory } from 'skintyee/store/modules/directory';
import { theme } from 'skintyee/styles';

const currency = (n: number) => `$${(n / 1000).toFixed(0)}k`;

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, flexGrow: 1, flexBasis: '47%', margin: 4 }}>
      <Card.Content>
        <Text style={{ color, fontSize: 24 }}>{value}</Text>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{label}</Text>
      </Card.Content>
    </Card>
  );
}

// Community dashboard: at-a-glance stats + spend chart. Tap the chart card to
// open the full transparency breakdown.
export default function Dashboard({ navigation }: any) {
  const dispatch = useAppDispatch();
  const expenditures = useAppSelector((s) => s.transparency.entities);
  const events = useAppSelector((s) => s.events.entities);
  const polls = useAppSelector((s) => s.polls.entities);
  const members = useAppSelector((s) => s.directory.entities);

  useEffect(() => {
    dispatch(loadExpenditures());
    dispatch(loadEvents());
    dispatch(loadPolls());
    dispatch(loadDirectory());
  }, [dispatch]);

  const totalSpent = expenditures.reduce((s, e) => s + e.spent, 0);
  const openPolls = polls.filter((p) => !p.closed).length;
  const upcomingEvents = events.filter((e) => new Date(e.startsAt) > new Date()).length;

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.text, fontSize: 18, marginBottom: 10 }}>Community at a glance</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
          <Stat label="Spent this year" value={currency(totalSpent)} color={theme.colors.success} />
          <Stat label="Band members" value={String(members.length)} color={theme.colors.primary} />
          <Stat label="Upcoming events" value={String(upcomingEvents)} color={theme.colors.accent} />
          <Stat label="Open polls" value={String(openPolls)} color={theme.colors.primary} />
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Records')}>
          <Card style={{ backgroundColor: theme.colors.darkDefault }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, marginBottom: 10 }}>Spending by program area</Text>
              {expenditures.length > 0 ? (
                <BarChart
                  data={expenditures.map((e) => ({ label: e.area, value: e.spent, max: e.budget, color: theme.colors.primary }))}
                  formatValue={(n) => `$${n.toLocaleString('en-CA')}`}
                />
              ) : (
                <Text style={{ color: theme.colors.textDarker }}>Loading…</Text>
              )}
              <Text style={{ color: theme.colors.accent, fontSize: 12, marginTop: 4 }}>Tap to view full transparency report ›</Text>
            </Card.Content>
          </Card>
        </TouchableOpacity>
      </PageContent>
    </PageContainer>
  );
}
