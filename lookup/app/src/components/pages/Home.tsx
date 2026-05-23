import React from 'react';
import { View, Text } from 'react-native';
import { Button, Card } from 'react-native-paper';
import { PageContainer } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppSelector } from 'lookup/store';

export default function Home({ navigation }: any) {
  const history = useAppSelector((s) => s.history.entries);
  return (
    <PageContainer>
      <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '700', marginBottom: 6 }}>
        Skin Tyee Lookup
      </Text>
      <Text style={{ color: theme.colors.textDarker, fontSize: 13, marginBottom: 24 }}>
        Find a Nation, a business, or follow the funding — contracts, grants and bids.
      </Text>

      <View style={{ flexDirection: 'column', gap: 12 }}>
        {/* Nations first — usually what a band-internal user is looking for. */}
        <Card
          style={{
            backgroundColor: theme.colors.darkDefault,
            borderColor: theme.colors.success,
            borderWidth: 1,
          }}
        >
          <Card.Title
            title="Nations lookup"
            subtitle="Find an Indigenous Nation"
            titleStyle={{ color: theme.colors.success, fontWeight: '700' }}
            subtitleStyle={{ color: theme.colors.textDarker }}
          />
          <Card.Content>
            <Text style={{ color: theme.colors.text, fontSize: 13 }}>
              Search First Nations registered in Canada (ISC band registry, FMA-certified Nations) — band number, governance, address. Defaults to BC bands.
            </Text>
          </Card.Content>
          <Card.Actions>
            <Button
              mode="contained"
              buttonColor={theme.colors.success}
              textColor="#000"
              onPress={() => navigation.navigate('Nations')}
            >
              Start
            </Button>
          </Card.Actions>
        </Card>

        <Card
          style={{
            backgroundColor: theme.colors.darkDefault,
            borderColor: theme.colors.primary,
            borderWidth: 1,
          }}
        >
          <Card.Title
            title="Business lookup"
            subtitle="Who is this company / org?"
            titleStyle={{ color: theme.colors.primary, fontWeight: '700' }}
            subtitleStyle={{ color: theme.colors.textDarker }}
          />
          <Card.Content>
            <Text style={{ color: theme.colors.text, fontSize: 13 }}>
              Search corporate registries (BC, federal), Indigenous-business directories, charities & safety certifications by name.
            </Text>
          </Card.Content>
          <Card.Actions>
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor="#000"
              onPress={() => navigation.navigate('Business')}
            >
              Start
            </Button>
          </Card.Actions>
        </Card>

        <Card
          style={{
            backgroundColor: theme.colors.darkDefault,
            borderColor: theme.colors.accent,
            borderWidth: 1,
          }}
        >
          <Card.Title
            title="Funding lookup"
            subtitle="Where's the money?"
            titleStyle={{ color: theme.colors.accent, fontWeight: '700' }}
            subtitleStyle={{ color: theme.colors.textDarker }}
          />
          <Card.Content>
            <Text style={{ color: theme.colors.text, fontSize: 13 }}>
              Search disclosed federal + provincial contracts, grants, funding agreements and bid solicitations by keyword.
            </Text>
          </Card.Content>
          <Card.Actions>
            <Button
              mode="contained"
              buttonColor={theme.colors.accent}
              textColor="#000"
              onPress={() => navigation.navigate('Funding')}
            >
              Start
            </Button>
          </Card.Actions>
        </Card>
      </View>

      <Text style={{ color: theme.colors.text, fontSize: 16, marginTop: 28, marginBottom: 8 }}>
        Recent lookups
      </Text>
      {history.length === 0 ? (
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>No runs yet — start a Nation, business or funding lookup above.</Text>
      ) : (
        history.slice(0, 5).map((h) => (
          <Card
            key={h.jobId}
            style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 8 }}
            onPress={() => navigation.navigate('Results', { jobId: h.jobId })}
          >
            <Card.Content>
              <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{h.target}</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
                {h.mode} · {h.sourceCount} sources · {h.indigenousOnly ? 'Indigenous-only' : 'all'} · {new Date(h.startedAt).toLocaleString()}
              </Text>
            </Card.Content>
          </Card>
        ))
      )}
    </PageContainer>
  );
}
