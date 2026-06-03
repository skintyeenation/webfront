import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, HelperText, IconButton, SegmentedButtons, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent, AdminAddButton, useConfirm } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { OnboardingFlowDto, ContractorDto, OnboardingAssignmentDto } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// OnboardingFlows — admin landing page for Phase 2.
//
// Two tabs (mirroring TimeKeeping.tsx's My/Approvals SegmentedButtons):
//   - Flows        : reusable flow templates the admin designs
//   - Assignments  : flows assigned to contractors; in-progress + completed
//
// Contractors tab is a side-trip — admin manages them on the linked
// Contractors screen. Step approvals live inside AssignmentTimeline.
// ----------------------------------------------------------------------------

type Tab = 'flows' | 'assignments';

// Status palette matches TimeKeeping for visual consistency.
const statusColor = (s?: string) =>
    s === 'completed' ? theme.colors.success
  : s === 'rejected' ? theme.colors.error
  : s === 'in_progress' ? theme.colors.accent
  : theme.colors.secondary;

export default function OnboardingFlows({ navigation }: any) {
  const [tab, setTab] = useState<Tab>('flows');
  const [flows, setFlows] = useState<OnboardingFlowDto[]>([]);
  const [contractors, setContractors] = useState<ContractorDto[]>([]);
  const [assignments, setAssignments] = useState<OnboardingAssignmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const { confirm, ConfirmHost } = useConfirm();

  const load = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      const api = apiFactory();
      const [fs, cs, as] = await Promise.all([
        api.onboarding.listFlows(),
        api.onboarding.listContractors(),
        api.onboarding.listAssignments(),
      ]);
      setFlows(fs);
      setContractors(cs);
      setAssignments(as);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const contractorById = new Map(contractors.map((c) => [c.id, c]));
  const flowById = new Map(flows.map((f) => [f.id, f]));

  return (
    <PageContainer>
      <PageContent>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <AdminAddButton label="New flow" icon="file-tree" onPress={() => navigation.navigate('onboardingFlowCreate')} />
          <View style={{ width: 6 }} />
          <Button
            compact mode="outlined" icon="account-hard-hat"
            textColor={theme.colors.text}
            onPress={() => navigation.navigate('onboardingContractors')}
            style={{ marginLeft: 6 }}
          >
            Contractors ({contractors.length})
          </Button>
        </View>

        <SegmentedButtons
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          style={{ marginTop: 12 }}
          buttons={[
            { value: 'flows',       label: `Flows (${flows.length})`,             icon: 'file-tree' },
            { value: 'assignments', label: `Assignments (${assignments.length})`, icon: 'clipboard-check' },
          ]}
        />

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}
        {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}

        {tab === 'flows' && !loading ? (
          flows.length === 0 ? (
            <NoContent message="No flows yet. Create one to get started." />
          ) : (
            flows.map((f) => (
              <Card key={f.id} style={{ marginTop: 10, backgroundColor: theme.colors.darkDefault }}>
                <Card.Content>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 15 }}>{f.title}</Text>
                      {f.description ? (
                        <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>{f.description}</Text>
                      ) : null}
                    </View>
                    {!f.active ? (
                      <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                        inactive
                      </Chip>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                    <Chip compact icon="format-list-numbered" style={{ marginRight: 6, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                      {f.steps.length} step{f.steps.length === 1 ? '' : 's'}
                    </Chip>
                    <Chip compact icon="clipboard-check" style={{ marginRight: 6, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                      {assignments.filter((a) => a.flowId === f.id).length} assigned
                    </Chip>
                    <View style={{ flex: 1 }} />
                    <Button compact mode="text" icon="pencil" textColor={theme.colors.primary}
                      onPress={() => navigation.navigate('onboardingFlowEdit', { id: f.id })}>
                      Edit
                    </Button>
                    <IconButton icon="delete" size={18} iconColor={theme.colors.textDarker}
                      onPress={() => confirm({
                        title: 'Delete flow?',
                        message: `"${f.title}" + its steps will be removed. Existing assignments stay.`,
                        confirmLabel: 'Delete',
                        destructive: true,
                        onConfirm: async () => { await apiFactory().onboarding.deleteFlow(f.id); load(); },
                      })}
                    />
                  </View>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 10, marginTop: 4 }}>
                    Updated {dayjs(f.updatedAt).format('MMM D, YYYY')} · by {f.createdBy}
                  </Text>
                </Card.Content>
              </Card>
            ))
          )
        ) : null}

        {tab === 'assignments' && !loading ? (
          assignments.length === 0 ? (
            <NoContent message="No assignments yet. Assign a flow from a flow's Edit screen." />
          ) : (
            assignments.map((a) => {
              const flow = flowById.get(a.flowId);
              const contractor = contractorById.get(a.contractorId);
              const completed = a.stepStates.filter((s) => s.status === 'completed').length;
              const pendingAdmin = a.stepStates.filter((s) => s.status === 'in_progress').length;
              const overall =
                a.completedAt ? 'completed'
                : pendingAdmin > 0 ? 'in_progress'
                : completed > 0 ? 'in_progress'
                : 'pending';
              return (
                <Card key={a.id} style={{ marginTop: 10, backgroundColor: theme.colors.darkDefault }}>
                  <Card.Content>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 15 }}>{contractor?.displayName ?? a.contractorId}</Text>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
                          {flow?.title ?? a.flowId}
                        </Text>
                      </View>
                      <Chip compact style={{ backgroundColor: statusColor(overall) }} textStyle={{ color: '#000', fontSize: 10 }}>
                        {overall.toUpperCase()}
                      </Chip>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                      <Chip compact style={{ marginRight: 6, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                        {completed}/{a.stepStates.length} done
                      </Chip>
                      {pendingAdmin > 0 ? (
                        <Chip compact icon="alert" style={{ marginRight: 6, backgroundColor: theme.colors.accent }} textStyle={{ color: '#000', fontSize: 10 }}>
                          {pendingAdmin} to review
                        </Chip>
                      ) : null}
                      <View style={{ flex: 1 }} />
                      <Button compact mode="text" icon="arrow-right" textColor={theme.colors.primary}
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
            })
          )
        ) : null}

        <ConfirmHost />
      </PageContent>
    </PageContainer>
  );
}
