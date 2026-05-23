import React from 'react';
import { View, Text } from 'react-native';
import { Card } from 'react-native-paper';
import { PageContainer } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppSelector } from 'lookup/store';

export default function History({ navigation }: any) {
  const entries = useAppSelector((s) => s.history.entries);
  return (
    <PageContainer>
      <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>History</Text>
      {entries.length === 0 ? (
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
          No runs yet. Past lookups will appear here.
        </Text>
      ) : (
        entries.map((h) => (
          <Card
            key={h.jobId}
            style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 10 }}
            onPress={() => navigation.navigate('Results', { jobId: h.jobId })}
          >
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{h.target}</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                  {new Date(h.startedAt).toLocaleString()}
                </Text>
              </View>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 4 }}>
                {h.mode} · {h.sourceCount} sources · {h.indigenousOnly ? 'Indigenous-only' : 'all'} · {h.status}
              </Text>
            </Card.Content>
          </Card>
        ))
      )}
    </PageContainer>
  );
}
