import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Divider, HelperText, IconButton, Modal, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppSelector } from 'skintyee/store';
import { apiFactory } from 'skintyee/store/apis';
import {
  OnboardingAssignmentDto, OnboardingFlowDto, PersonDto, OnboardingStepStateDto, DocumentDto,
} from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// AssignmentTimeline — admin view of a single person's progress
// through an onboarding flow. Mirrors the TimeKeeping approval pattern:
//
//   - Top card: person + flow summary + tokenised public link
//     (copy button) + overall status chip.
//   - One Card per step: status chip, attached docs (Open), free links
//     (Open), person's uploaded file (Open + admin replace), and the
//     ApprovalCard-style row (Approve / Reject / Reset) when there's
//     something to act on.
//   - Rejection notes captured via a modal, surfaced as HelperText on
//     the step.
// ----------------------------------------------------------------------------

const statusColor = (s?: string) =>
    s === 'completed' ? theme.colors.success
  : s === 'rejected' ? theme.colors.error
  : s === 'in_progress' ? theme.colors.accent
  : theme.colors.secondary;

const statusLabel = (s?: string) => (s || 'pending').toUpperCase();

const COMPLETION_LABEL: Record<string, string> = {
  admin_marks: 'Admin marks complete',
  person_uploads: 'Person uploads',
  both: 'Upload + admin review',
};

export default function AssignmentTimeline({ navigation, route }: any) {
  const id: string | undefined = route?.params?.id;
  const role = useAppSelector((s) => s.auth.role);
  const isAdmin = role === 'admin';
  // Fallback display name for non-admin viewers (their own assignment).
  // We can't call listPeople (admin-only), so we use the signed-in
  // user's name from the auth slice. Admins still get the Person row.
  const meName = useAppSelector((s) => s.auth.user?.name || s.auth.name);

  const [assignment, setAssignment] = useState<OnboardingAssignmentDto | undefined>();
  const [flow, setFlow] = useState<OnboardingFlowDto | undefined>();
  const [person, setPerson] = useState<PersonDto | undefined>();
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<{ stepId: string; reason: string } | null>(null);
  const [busyStep, setBusyStep] = useState<string | undefined>();

  useEffect(() => {
    navigation?.setOptions?.({ title: 'Assignment' });
  }, [navigation]);

  const load = useCallback(async () => {
    if (!id) return;
    setError(undefined);
    setLoading(true);
    try {
      const api = apiFactory();
      const a = await api.onboarding.getAssignment(id);
      setAssignment(a);
      // listPeople is admin-only — non-admin viewers (workers looking
      // at their own assignment) just skip the roster lookup. We
      // already know the assignment is theirs because getAssignment
      // enforces ownership on the server.
      const [f, conts, docs] = await Promise.all([
        api.onboarding.getFlow(a.flowId),
        isAdmin ? api.onboarding.listPeople().catch(() => []) : Promise.resolve([] as PersonDto[]),
        api.documents.list().catch(() => []),
      ]);
      setFlow(f);
      setPerson(conts.find((c) => c.id === a.personId));
      setDocuments(docs);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [id, isAdmin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doApprove = async (stepId: string) => {
    if (!assignment) return;
    setBusyStep(stepId);
    try {
      await apiFactory().onboarding.approveStep(assignment.id, stepId);
      setToast('Step marked complete');
      await load();
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusyStep(undefined); }
  };
  const doReject = async () => {
    if (!assignment || !rejectFor) return;
    setBusyStep(rejectFor.stepId);
    try {
      await apiFactory().onboarding.rejectStep(assignment.id, rejectFor.stepId, rejectFor.reason || undefined);
      setRejectFor(null);
      setToast('Step rejected');
      await load();
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusyStep(undefined); }
  };
  const doReset = async (stepId: string) => {
    if (!assignment) return;
    setBusyStep(stepId);
    try {
      await apiFactory().onboarding.resetStep(assignment.id, stepId);
      setToast('Step reset');
      await load();
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusyStep(undefined); }
  };

  const adminUpload = async (stepId: string) => {
    if (!assignment) return;
    let file: { uri: string; name: string; mimeType: string } | undefined;
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,image/*';
      file = await new Promise<typeof file>((resolve) => {
        input.onchange = async () => {
          const f = input.files?.[0];
          if (!f) return resolve(undefined);
          const r = new FileReader();
          r.onload = () => resolve({ uri: r.result as string, name: f.name, mimeType: f.type || 'application/pdf' });
          r.readAsDataURL(f);
        };
        input.click();
      });
    } else {
      try {
        const DocumentPicker = await import('expo-document-picker');
        const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
        if (res.canceled || !res.assets?.[0]) return;
        const a = res.assets[0];
        file = { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf' };
      } catch (e: any) { setError(e?.message ?? String(e)); return; }
    }
    if (!file) return;
    setBusyStep(stepId);
    try {
      await apiFactory().onboarding.adminUpload(assignment.id, stepId, file);
      setToast('Uploaded');
      await load();
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusyStep(undefined); }
  };

  const copyPublicLink = async () => {
    if (!assignment) return;
    // Web's URL convention for the public person link.
    const url = (typeof window !== 'undefined' ? window.location.origin : 'https://app.skintyee.ca')
      + `/onboard/${assignment.id}/${assignment.publicToken}`;
    if (Platform.OS === 'web' && navigator?.clipboard) {
      try { await navigator.clipboard.writeText(url); setToast('Link copied'); }
      catch { setToast(url); }
    } else {
      setToast(url);
    }
  };

  const rotateToken = async () => {
    if (!assignment) return;
    try {
      const { publicToken } = await apiFactory().onboarding.rotateToken(assignment.id);
      setAssignment({ ...assignment, publicToken });
      setToast('New link generated');
    } catch (e: any) { setError(e?.message ?? String(e)); }
  };

  if (loading) {
    return (
      <PageContainer><PageContent>
        <ActivityIndicator style={{ marginVertical: 24 }} />
      </PageContent></PageContainer>
    );
  }
  if (!assignment || !flow) {
    return (
      <PageContainer><PageContent>
        <NoContent message="Assignment not found." />
      </PageContent></PageContainer>
    );
  }

  const stepById = new Map(flow.steps.map((s) => [s.id, s]));
  const documentById = new Map(documents.map((d) => [d.id, d]));
  const completed = assignment.stepStates.filter((s) => s.status === 'completed').length;
  const overall =
    assignment.completedAt ? 'completed'
    : assignment.stepStates.some((s) => s.status === 'in_progress') ? 'in_progress'
    : completed > 0 ? 'in_progress' : 'pending';

  return (
    <PageContainer>
      <PageContent>
        {/* Header card */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 10 }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                  {person?.displayName ?? (isAdmin ? assignment.personId : meName)}
                </Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
                  {flow.title} · {completed}/{assignment.stepStates.length} complete
                </Text>
              </View>
              <Chip compact style={{ backgroundColor: statusColor(overall) }} textStyle={{ color: '#000', fontSize: 11 }}>
                {statusLabel(overall)}
              </Chip>
            </View>
            {isAdmin ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                <Button compact mode="outlined" icon="link-variant" textColor={theme.colors.text} onPress={copyPublicLink}>
                  Copy public link
                </Button>
                <View style={{ width: 6 }} />
                <Button compact mode="text" icon="refresh" textColor={theme.colors.textDarker} onPress={rotateToken}>
                  Rotate
                </Button>
              </View>
            ) : null}
          </Card.Content>
        </Card>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        {/* Step cards */}
        {flow.steps.map((step, idx) => {
          const state = assignment.stepStates.find((s) => s.stepId === step.id);
          const status = state?.status ?? 'pending';
          const reviewable = status === 'in_progress';
          return (
            <Card key={step.id} style={{ marginBottom: 8, backgroundColor: theme.colors.darkDefault, borderLeftWidth: 3, borderLeftColor: statusColor(status) }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginRight: 6 }}>
                    STEP {idx + 1}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Chip compact style={{ backgroundColor: statusColor(status) }} textStyle={{ color: '#000', fontSize: 10 }}>
                    {statusLabel(status)}
                  </Chip>
                </View>
                <Text style={{ color: theme.colors.text, fontSize: 14 }}>{step.title}</Text>
                {step.instructions ? (
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 4 }}>{step.instructions}</Text>
                ) : null}
                <Text style={{ color: theme.colors.textDarker, fontSize: 10, marginTop: 6 }}>
                  {COMPLETION_LABEL[step.completion]}
                </Text>

                {/* Attached documents */}
                {step.documents.length > 0 ? (
                  <View style={{ marginTop: 8 }}>
                    {step.documents.map((sd) => {
                      const doc = documentById.get(sd.documentId);
                      if (!doc) return null;
                      return (
                        <View key={sd.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                          <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1 }} numberOfLines={1}>
                            📄 {doc.title}
                          </Text>
                          {doc.fileUrl ? (
                            <Button compact mode="text" icon="download" textColor={theme.colors.primary} onPress={() => Linking.openURL(doc.fileUrl!)}>
                              Open
                            </Button>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* Free links */}
                {step.links.length > 0 ? (
                  <View style={{ marginTop: 4 }}>
                    {step.links.map((l) => (
                      <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1 }} numberOfLines={1}>
                          🔗 {l.label}
                        </Text>
                        <Button compact mode="text" icon="open-in-new" textColor={theme.colors.primary} onPress={() => Linking.openURL(l.url)}>
                          Open
                        </Button>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Person's uploaded file */}
                {state?.personFileUrl ? (
                  <View style={{
                    marginTop: 8, padding: 8, borderRadius: 4,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    borderLeftWidth: 3, borderLeftColor: theme.colors.accent,
                  }}>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 10, letterSpacing: 1 }}>UPLOADED</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1 }} numberOfLines={1}>
                        📤 {state.personFileName ?? 'file'}
                        {state.personSizeBytes ? `  ·  ${Math.round(state.personSizeBytes / 1024)} KB` : ''}
                      </Text>
                      <Button compact mode="text" icon="download" textColor={theme.colors.primary} onPress={() => Linking.openURL(state.personFileUrl!)}>
                        Open
                      </Button>
                    </View>
                  </View>
                ) : null}

                {state?.notes && status === 'rejected' ? (
                  <HelperText type="error" visible style={{ marginLeft: -8, marginTop: 4 }}>
                    Rejected: {state.notes}
                  </HelperText>
                ) : null}

                {/* Admin action row — matches ApprovalCard from TimeKeeping. */}
                {isAdmin ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                    {(step.completion !== 'admin_marks') ? (
                      <Button compact mode="text" icon="upload" textColor={theme.colors.text} onPress={() => adminUpload(step.id)} disabled={busyStep === step.id}>
                        Upload on their behalf
                      </Button>
                    ) : null}
                    <View style={{ flex: 1 }} />
                    {status !== 'completed' ? (
                      <>
                        <Button compact mode="contained" icon="check" buttonColor={theme.colors.success} textColor="#000" onPress={() => doApprove(step.id)} disabled={busyStep === step.id}>
                          {reviewable ? 'Approve' : 'Mark complete'}
                        </Button>
                        <Button compact mode="text" icon="close" textColor={theme.colors.error} onPress={() => setRejectFor({ stepId: step.id, reason: '' })} disabled={busyStep === step.id} style={{ marginLeft: 4 }}>
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Button compact mode="text" icon="backup-restore" textColor={theme.colors.textDarker} onPress={() => doReset(step.id)} disabled={busyStep === step.id}>
                        Reopen
                      </Button>
                    )}
                  </View>
                ) : null}
                {state?.completedAt ? (
                  <Text style={{ color: theme.colors.textDarker, fontSize: 10, marginTop: 4 }}>
                    {status === 'completed' ? 'Completed' : 'Updated'} {dayjs(state.completedAt).format('MMM D, YYYY')} · by {state.completedBy ?? '—'}
                  </Text>
                ) : null}
              </Card.Content>
            </Card>
          );
        })}

        {/* Reject reason modal */}
        <Portal>
          <Modal
            visible={rejectFor !== null}
            onDismiss={() => setRejectFor(null)}
            contentContainerStyle={{ backgroundColor: theme.colors.darkDefault, padding: 16, borderRadius: 8, marginHorizontal: 20, alignSelf: 'center', width: '90%', maxWidth: 420 }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>Reject step</Text>
            <TextInput
              label="Reason (optional)"
              value={rejectFor?.reason ?? ''}
              onChangeText={(v) => setRejectFor((cur) => cur ? { ...cur, reason: v } : cur)}
              mode="outlined" multiline numberOfLines={3}
              style={{ marginTop: 12 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button mode="text" textColor={theme.colors.textDarker} onPress={() => setRejectFor(null)}>Cancel</Button>
              <Button mode="contained" buttonColor={theme.colors.error} textColor="#fff" onPress={doReject}>
                Reject
              </Button>
            </View>
          </Modal>
        </Portal>

        <Snackbar
          visible={toast !== null}
          onDismiss={() => setToast(null)}
          duration={2400}
          wrapperStyle={{ alignItems: 'center' }}
          style={{ backgroundColor: theme.colors.success, alignSelf: 'center', width: '100%', maxWidth: 480 }}
        >
          <Text style={{ color: '#000', textAlign: 'center', width: '100%' }}>{toast ?? ''}</Text>
        </Snackbar>
      </PageContent>
    </PageContainer>
  );
}
