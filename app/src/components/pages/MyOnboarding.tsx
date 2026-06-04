import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, HelperText, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { OnboardingAssignmentDto, OnboardingFlowDto } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// MyOnboarding — worker view of the signed-in user's onboarding
// assignments. Mirrors the admin's Assignments tab but scoped to the
// caller's Person record:
//
//   - One Card per assignment
//   - Flow title + progress chip (X/Y done) + overall status colour
//   - "Open" → AssignmentTimeline screen (existing read view; admin
//     actions are gated inside by role so workers see only their own
//     state)
// ----------------------------------------------------------------------------

const statusColor = (s?: string) =>
    s === 'completed' ? theme.colors.success
  : s === 'rejected' ? theme.colors.error
  : s === 'in_progress' ? theme.colors.accent
  : theme.colors.secondary;

const statusLabel = (s?: string) => (s || 'pending').toUpperCase();

export default function MyOnboarding({ navigation }: any) {
  const [assignments, setAssignments] = useState<OnboardingAssignmentDto[]>([]);
  const [flowsById, setFlowsById] = useState<Map<string, OnboardingFlowDto>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      const api = apiFactory().onboarding;
      const as = await api.myAssignments();
      setAssignments(as);
      // Pull each referenced flow so we can render the title +
      // step count. Network-cheap: typical worker has 1–3 flows.
      const uniqFlowIds: string[] = Array.from(new Set(as.map((a) => a.flowId)));
      const flows = await Promise.all(uniqFlowIds.map((id: string) => api.getFlow(id).catch(() => null)));
      const map = new Map<string, OnboardingFlowDto>();
      for (const f of flows) if (f) map.set(f.id, f);
      setFlowsById(map);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 8 }}>
          Your onboarding assignments. Tap one to see the steps, attached documents, and upload anything that's required.
        </Text>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}
        {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}

        {!loading && assignments.length === 0 ? (
          <NoContent message="You don't have any onboarding flows assigned yet." />
        ) : null}

        {assignments.map((a) => {
          const flow = flowsById.get(a.flowId);
          const total = a.stepStates.length;
          const completed = a.stepStates.filter((s) => s.status === 'completed').length;
          const pendingAdmin = a.stepStates.filter((s) => s.status === 'in_progress').length;
          const overall =
            a.completedAt ? 'completed'
            : pendingAdmin > 0 ? 'in_progress'
            : completed > 0 ? 'in_progress'
            : 'pending';
          return (
            <Card key={a.id} style={{ marginTop: 8, backgroundColor: theme.colors.darkDefault, borderLeftWidth: 3, borderLeftColor: statusColor(overall) }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 15 }}>
                      {flow?.title ?? a.flowId}
                    </Text>
                    {flow?.description ? (
                      <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>{flow.description}</Text>
                    ) : null}
                  </View>
                  <Chip compact style={{ backgroundColor: statusColor(overall) }} textStyle={{ color: '#000', fontSize: 10 }}>
                    {statusLabel(overall)}
                  </Chip>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                  <Chip compact style={{ marginRight: 6, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                    {completed}/{total} done
                  </Chip>
                  {pendingAdmin > 0 ? (
                    <Chip compact icon="clock-alert" style={{ marginRight: 6, backgroundColor: theme.colors.accent }} textStyle={{ color: '#000', fontSize: 10 }}>
                      {pendingAdmin} awaiting review
                    </Chip>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Button compact mode="contained" icon="arrow-right" buttonColor={theme.colors.primary} textColor="#fff"
                    onPress={() => navigation.navigate('onboardingAssignment', { id: a.id })}>
                    Open
                  </Button>
                </View>
                <Text style={{ color: theme.colors.textDarker, fontSize: 10, marginTop: 4 }}>
                  Started {dayjs(a.startedAt).format('MMM D, YYYY')}
                  {a.completedAt ? ` · finished ${dayjs(a.completedAt).format('MMM D')}` : ''}
                </Text>
              </Card.Content>
            </Card>
          );
        })}
      </PageContent>
    </PageContainer>
  );
}
