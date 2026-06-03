import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Divider, HelperText, IconButton, Modal, Portal, SegmentedButtons, Snackbar, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
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

  // Assign-flow modal state — single home for picking flow + contractor.
  // Two-step: pick flow (only active ones with steps) → pick contractor.
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignFlowId, setAssignFlowId] = useState<string | undefined>();
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

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
  const assignableFlows = flows.filter((f) => f.active && f.steps.length > 0);

  const openAssignModal = () => {
    setAssignFlowId(undefined);
    setAssignError(undefined);
    setAssignModalOpen(true);
  };
  const assignToContractor = async (contractorId: string) => {
    if (!assignFlowId) { setAssignError('Pick a flow first.'); return; }
    setAssignSaving(true);
    setAssignError(undefined);
    try {
      const r = await apiFactory().onboarding.createAssignment({ flowId: assignFlowId, contractorId });
      setAssignModalOpen(false);
      setAssignments((prev) => [r, ...prev]);
      setToast('Assignment created');
      navigation.navigate('onboardingAssignment', { id: r.id });
    } catch (e: any) {
      setAssignError(e?.message ?? String(e));
    } finally {
      setAssignSaving(false);
    }
  };

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
          <>
            {/* Assign-flow CTA lives here now (was on EditOnboardingFlow).
                Single home: pick a flow + a contractor in one modal. */}
            <View style={{ marginTop: 10 }}>
              <Button
                mode="contained" icon="account-plus"
                buttonColor={theme.colors.primary} textColor="#fff"
                onPress={openAssignModal}
                disabled={assignableFlows.length === 0 || contractors.length === 0}
              >
                Assign flow to contractor
              </Button>
              {assignableFlows.length === 0 ? (
                <HelperText type="info" visible style={{ marginLeft: -8 }}>
                  Create an active flow with at least one step first.
                </HelperText>
              ) : contractors.length === 0 ? (
                <HelperText type="info" visible style={{ marginLeft: -8 }}>
                  Add a contractor first (Contractors button above).
                </HelperText>
              ) : null}
            </View>
            {assignments.length === 0 ? (
              <NoContent message="No assignments yet." />
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
            )}
          </>
        ) : null}

        {/* Assign-flow modal — pick flow (top section), then contractor
            (bottom section). Two-step on a single surface so the admin
            can see both choices without paging. */}
        <Portal>
          <Modal
            visible={assignModalOpen}
            onDismiss={() => setAssignModalOpen(false)}
            contentContainerStyle={{
              backgroundColor: theme.colors.darkDefault,
              padding: 16, borderRadius: 8,
              marginHorizontal: 20, maxHeight: '85%',
              alignSelf: 'center', width: '90%', maxWidth: 480,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>
              Assign onboarding flow
            </Text>

            <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 12 }}>
              1. FLOW
            </Text>
            <Divider style={{ marginVertical: 6, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            {assignableFlows.map((f) => {
              const on = assignFlowId === f.id;
              return (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                  <MaterialCommunityIcons
                    name={on ? 'radiobox-marked' : 'radiobox-blank'}
                    size={18}
                    color={on ? theme.colors.primary : theme.colors.textDarker}
                    style={{ marginRight: 8 }}
                    onPress={() => setAssignFlowId(f.id)}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 13 }} onPress={() => setAssignFlowId(f.id)}>{f.title}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                      {f.steps.length} step{f.steps.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
              );
            })}

            <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 14 }}>
              2. CONTRACTOR
            </Text>
            <Divider style={{ marginVertical: 6, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            {contractors.map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13 }}>{c.displayName}</Text>
                  {c.email ? <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{c.email}</Text> : null}
                </View>
                <Button
                  compact mode="contained" icon="check"
                  buttonColor={theme.colors.primary} textColor="#fff"
                  onPress={() => assignToContractor(c.id)}
                  disabled={!assignFlowId || assignSaving}
                >
                  Assign
                </Button>
              </View>
            ))}

            {assignError ? <HelperText type="error" visible>{assignError}</HelperText> : null}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
              <Button mode="text" textColor={theme.colors.textDarker} onPress={() => setAssignModalOpen(false)}>
                Cancel
              </Button>
            </View>
          </Modal>
        </Portal>

        <Snackbar
          visible={toast !== null}
          onDismiss={() => setToast(null)}
          duration={1800}
          wrapperStyle={{ alignItems: 'center' }}
          style={{ backgroundColor: theme.colors.success, alignSelf: 'center', width: '100%', maxWidth: 420 }}
        >
          <Text style={{ color: '#000', textAlign: 'center', width: '100%' }}>{toast ?? ''}</Text>
        </Snackbar>

        <ConfirmHost />
      </PageContent>
    </PageContainer>
  );
}
