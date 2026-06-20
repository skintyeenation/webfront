import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Divider, HelperText, IconButton, Menu, Modal, Portal, Snackbar, Switch, Text, TextInput } from 'react-native-paper';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { pickFile } from 'skintyee/core/receiptCapture';
import {
  OnboardingFlowDto, PersonDto, OnboardingAssignmentDto,
  DocumentDto, StepCompletion,
} from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// EditOnboardingFlow — admin screen to design / edit a flow.
//
// Layout mirrors AddTimesheet's day-card pattern: one Card per step,
// dense per-step actions, "Add step" button at the bottom. Each step
// card lets the admin attach Documents + arbitrary URL links and pick
// a completion mode.
//
// The header card carries Title / Description / Active switch, plus an
// "Assign to person" button that opens a modal-picker over the
// already-loaded people list.
// ----------------------------------------------------------------------------

const COMPLETION_LABEL: Record<StepCompletion, string> = {
  admin_marks: 'Admin marks complete',
  person_uploads: 'Person uploads',
  both: 'Upload + admin review',
};

export default function EditOnboardingFlow({ navigation, route }: any) {
  const flowId: string | undefined = route?.params?.id;
  const isNew = !flowId;

  useEffect(() => {
    navigation?.setOptions?.({ title: isNew ? 'New flow' : 'Edit flow' });
  }, [navigation, isNew]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [flow, setFlow] = useState<OnboardingFlowDto | undefined>();
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [assignments, setAssignments] = useState<OnboardingAssignmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

  // Per-step menus, attach modal etc. (Assigning a flow to a person
  // lives on the Onboarding screen's Assignments tab now — single home
  // for picking flow + person instead of two entry points.)
  const [attachOpenForStep, setAttachOpenForStep] = useState<string | null>(null);
  const [linkModalForStep, setLinkModalForStep] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [completionMenuFor, setCompletionMenuFor] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const loadAll = async (existingFlow?: OnboardingFlowDto) => {
    setError(undefined);
    try {
      const api = apiFactory();
      const [docs, conts, asg] = await Promise.all([
        api.documents.list().catch(() => []),
        api.onboarding.listPeople(),
        flowId ? api.onboarding.listAssignments({ flowId }) : Promise.resolve([]),
      ]);
      setDocuments(docs);
      setPeople(conts);
      setAssignments(asg);
      if (existingFlow) {
        setFlow(existingFlow);
        setTitle(existingFlow.title);
        setDescription(existingFlow.description ?? '');
        setActive(existingFlow.active);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (flowId) {
          const f = await apiFactory().onboarding.getFlow(flowId);
          if (cancelled) return;
          await loadAll(f);
        } else {
          await loadAll();
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [flowId]);

  // Header save (create or update). After create, swap to edit mode by
  // loading the just-created flow so step-management can hang off it.
  const saveHeader = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError(undefined);
    try {
      const api = apiFactory();
      if (flow) {
        const r = await api.onboarding.updateFlow(flow.id, {
          title: title.trim(),
          description: description.trim() || null,
          active,
        });
        setFlow(r);
        setToast('Saved');
      } else {
        const r = await api.onboarding.createFlow({
          title: title.trim(),
          description: description.trim() || undefined,
        });
        setFlow(r);
        setToast('Flow created');
        navigation?.setParams?.({ id: r.id });
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const reloadFlow = async () => {
    if (!flow) return;
    const r = await apiFactory().onboarding.getFlow(flow.id);
    setFlow(r);
  };

  const addStep = async () => {
    if (!flow) { setError('Save the flow first to add steps.'); return; }
    await apiFactory().onboarding.addStep(flow.id, { title: 'New step' });
    await reloadFlow();
  };
  const updateStep = async (stepId: string, patch: any) => {
    await apiFactory().onboarding.updateStep(stepId, patch);
    await reloadFlow();
  };
  const removeStep = async (stepId: string) => {
    await apiFactory().onboarding.deleteStep(stepId);
    await reloadFlow();
  };

  const attachDoc = async (stepId: string, doc: DocumentDto, allowUpload: boolean) => {
    try {
      await apiFactory().onboarding.attachDocument(stepId, { documentId: doc.id, personUploadAllowed: allowUpload });
      setAttachOpenForStep(null);
      await reloadFlow();
      setToast(`Attached “${doc.title}”`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setToast('Couldn’t attach the document');
    }
  };
  const detachDoc = async (rowId: string) => {
    try {
      await apiFactory().onboarding.detachDocument(rowId);
      await reloadFlow();
      setToast('Document removed');
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setToast('Couldn’t remove the document');
    }
  };

  // Upload a brand-new file (e.g. the TD1 / TD1BC / T4 forms) straight into the
  // library AND attach it to this step — the "+ Upload" button only attached an
  // EXISTING doc, so there was no way to add a new file from here. The person is
  // then required to upload their completed/signed copy (personUploadAllowed).
  const uploadAndAttach = async (stepId: string) => {
    setError(undefined);
    try {
      const picked = await pickFile();
      if (!picked) return;
      setUploadingDoc(true);
      const title = picked.name.replace(/\.[^./\\]+$/, '') || picked.name;
      const created = await apiFactory().documents.create({
        title,
        audience: 'staff',
        tagIds: [],
        file: { uri: picked.uri, name: picked.name, mimeType: picked.mimeType },
      });
      await apiFactory().onboarding.attachDocument(stepId, { documentId: created.id, personUploadAllowed: true });
      setAttachOpenForStep(null);
      await loadAll();      // refresh the library list
      await reloadFlow();   // refresh the step's attachments
      setToast(`Uploaded & attached “${title}”`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setToast(e?.message ? `Upload failed: ${e.message}` : 'Upload failed');
    } finally {
      setUploadingDoc(false);
    }
  };
  const submitLink = async () => {
    if (!linkModalForStep || !linkUrl.trim()) return;
    await apiFactory().onboarding.addLink(linkModalForStep, {
      label: linkLabel.trim() || linkUrl.trim(),
      url: linkUrl.trim(),
    });
    setLinkModalForStep(null);
    setLinkLabel(''); setLinkUrl('');
    await reloadFlow();
  };
  const removeLinkRow = async (rowId: string) => {
    await apiFactory().onboarding.removeLink(rowId);
    await reloadFlow();
  };

  const documentById = new Map(documents.map((d) => [d.id, d]));

  if (loading) {
    return (
      <PageContainer><PageContent>
        <ActivityIndicator style={{ marginVertical: 24 }} />
      </PageContent></PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageContent>
        {/* Header card */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 10 }}>
          <Card.Content>
            <TextInput label="Flow title" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 8 }} />
            <TextInput label="Description (optional)" value={description} onChangeText={setDescription} mode="outlined" multiline numberOfLines={3} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <Switch value={active} onValueChange={setActive} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.text, marginLeft: 8 }}>{active ? 'Active' : 'Inactive'}</Text>
              <View style={{ flex: 1 }} />
              <Button compact mode="contained" icon="content-save" buttonColor={theme.colors.primary} textColor="#fff" onPress={saveHeader} loading={saving} disabled={saving || !title.trim()}>
                {flow ? 'Save' : 'Create flow'}
              </Button>
            </View>
          </Card.Content>
        </Card>

        {!flow ? (
          <HelperText type="info" visible>
            Save the flow first, then add steps.
          </HelperText>
        ) : null}

        {/* Steps */}
        {flow?.steps.map((s, idx) => (
          <Card key={s.id} style={{ marginBottom: 8, backgroundColor: theme.colors.darkDefault }}>
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginRight: 6 }}>
                  STEP {idx + 1}
                </Text>
                <View style={{ flex: 1 }} />
                <IconButton icon="arrow-up" size={16} iconColor={theme.colors.textDarker} disabled={idx === 0}
                  onPress={() => updateStep(s.id, { order: s.order - 1 })} />
                <IconButton icon="arrow-down" size={16} iconColor={theme.colors.textDarker} disabled={idx === flow.steps.length - 1}
                  onPress={() => updateStep(s.id, { order: s.order + 1 })} />
                <IconButton icon="close" size={16} iconColor={theme.colors.textDarker} onPress={() => removeStep(s.id)} />
              </View>
              <TextInput
                dense mode="outlined" label="Title"
                value={s.title}
                onChangeText={(v) => setFlow((cur) => cur ? { ...cur, steps: cur.steps.map((x) => x.id === s.id ? { ...x, title: v } : x) } : cur)}
                onBlur={() => updateStep(s.id, { title: s.title })}
                style={{ marginBottom: 6 }}
              />
              <TextInput
                dense mode="outlined" label="Instructions (optional)" multiline numberOfLines={2}
                value={s.instructions ?? ''}
                onChangeText={(v) => setFlow((cur) => cur ? { ...cur, steps: cur.steps.map((x) => x.id === s.id ? { ...x, instructions: v } : x) } : cur)}
                onBlur={() => updateStep(s.id, { instructions: s.instructions || null })}
                style={{ marginBottom: 6 }}
              />

              {/* Completion mode dropdown */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginRight: 8 }}>Completed by:</Text>
                <Menu
                  visible={completionMenuFor === s.id}
                  onDismiss={() => setCompletionMenuFor(null)}
                  anchor={
                    <Button compact mode="outlined" icon="check-circle-outline" textColor={theme.colors.text} onPress={() => setCompletionMenuFor(s.id)}>
                      {COMPLETION_LABEL[s.completion]}
                    </Button>
                  }
                  contentStyle={{ backgroundColor: theme.colors.darkDefault }}
                >
                  {(['admin_marks', 'person_uploads', 'both'] as StepCompletion[]).map((c) => (
                    <Menu.Item
                      key={c} title={COMPLETION_LABEL[c]}
                      trailingIcon={c === s.completion ? 'check' : undefined}
                      onPress={() => { updateStep(s.id, { completion: c }); setCompletionMenuFor(null); }}
                      titleStyle={{ color: c === s.completion ? theme.colors.primary : theme.colors.text }}
                    />
                  ))}
                </Menu>
              </View>

              {/* Document attachments */}
              <Text style={{ color: theme.colors.textDarker, fontSize: 10, letterSpacing: 1, marginTop: 4 }}>DOCUMENTS</Text>
              {s.documents.length === 0 ? (
                <Text style={{ color: theme.colors.textDarker, fontSize: 11, fontStyle: 'italic' }}>No documents attached.</Text>
              ) : (
                s.documents.map((sd) => {
                  const doc = documentById.get(sd.documentId);
                  return (
                    <View key={sd.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1 }}>
                        📄 {doc?.title ?? sd.documentId}
                        {sd.personUploadAllowed ? '  ·  upload required' : ''}
                      </Text>
                      <IconButton icon="close" size={16} iconColor={theme.colors.textDarker} onPress={() => detachDoc(sd.id)} />
                    </View>
                  );
                })
              )}
              <Button compact mode="text" icon="paperclip" textColor={theme.colors.primary} onPress={() => setAttachOpenForStep(s.id)}>
                Attach document
              </Button>

              {/* Link attachments */}
              <Text style={{ color: theme.colors.textDarker, fontSize: 10, letterSpacing: 1, marginTop: 6 }}>LINKS</Text>
              {s.links.length === 0 ? (
                <Text style={{ color: theme.colors.textDarker, fontSize: 11, fontStyle: 'italic' }}>No links.</Text>
              ) : (
                s.links.map((l) => (
                  <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1 }} numberOfLines={1}>
                      🔗 {l.label}
                    </Text>
                    <IconButton icon="close" size={16} iconColor={theme.colors.textDarker} onPress={() => removeLinkRow(l.id)} />
                  </View>
                ))
              )}
              <Button compact mode="text" icon="link-plus" textColor={theme.colors.primary} onPress={() => { setLinkModalForStep(s.id); setLinkLabel(''); setLinkUrl(''); }}>
                Add link
              </Button>
            </Card.Content>
          </Card>
        ))}

        {flow ? (
          <Button mode="outlined" icon="plus" textColor={theme.colors.text} onPress={addStep} style={{ marginTop: 6 }}>
            Add step
          </Button>
        ) : null}

        {/* Existing assignments — read-only summary so the admin can see
            who's already on this flow. Adding new ones happens from the
            Onboarding screen's Assignments tab. */}
        {flow && assignments.length > 0 ? (
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginTop: 12 }}>
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
                Assignments ({assignments.length})
              </Text>
              <HelperText type="info" visible style={{ marginLeft: -8 }}>
                Assign this flow from Onboarding → Assignments.
              </HelperText>
              <Divider style={{ marginVertical: 6, backgroundColor: 'rgba(255,255,255,0.08)' }} />
              {assignments.map((a) => {
                const c = people.find((x) => x.id === a.personId);
                const completed = a.stepStates.filter((s) => s.status === 'completed').length;
                return (
                  <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 13 }}>{c?.displayName ?? a.personId}</Text>
                      <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                        {completed}/{a.stepStates.length} steps done
                      </Text>
                    </View>
                    <Button compact mode="text" icon="arrow-right" textColor={theme.colors.primary}
                      onPress={() => navigation.navigate('onboardingAssignment', { id: a.id })}>
                      Open
                    </Button>
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        ) : null}

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        {/* Document attach modal */}
        <Portal>
          <Modal
            visible={attachOpenForStep !== null}
            onDismiss={() => setAttachOpenForStep(null)}
            contentContainerStyle={{ backgroundColor: theme.colors.darkDefault, padding: 16, borderRadius: 8, marginHorizontal: 20, maxHeight: '80%', alignSelf: 'center', width: '90%', maxWidth: 460 }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>Attach a document</Text>

            {/* Upload a brand-new file (TD1 / TD1BC / T4, etc.) right here. */}
            <Button
              mode="contained" icon="file-upload"
              buttonColor={theme.colors.primary} textColor="#fff"
              onPress={() => attachOpenForStep && uploadAndAttach(attachOpenForStep)}
              loading={uploadingDoc}
              disabled={uploadingDoc}
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              Upload a new document…
            </Button>
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 4 }}>
              Adds the file (PDF/image) to the library and attaches it — the person uploads their completed copy.
            </Text>

            <Divider style={{ marginVertical: 10, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <Text style={{ color: theme.colors.textDarker, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
              OR PICK FROM THE LIBRARY
            </Text>
            {documents.length === 0 ? (
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, fontStyle: 'italic' }}>
                Nothing in the library yet — upload one above.
              </Text>
            ) : (
              documents.map((d) => (
                <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, flex: 1 }}>{d.title}</Text>
                  <Button compact mode="text" icon="link-variant" textColor={theme.colors.primary} onPress={() => attachDoc(attachOpenForStep!, d, false)}>
                    Attach
                  </Button>
                  <Button compact mode="text" icon="account-arrow-up" textColor={theme.colors.accent} onPress={() => attachDoc(attachOpenForStep!, d, true)}>
                    Needs upload
                  </Button>
                </View>
              ))
            )}
            <Button mode="text" textColor={theme.colors.textDarker} onPress={() => setAttachOpenForStep(null)} style={{ marginTop: 6 }}>
              Cancel
            </Button>
          </Modal>
        </Portal>

        {/* Add-link modal */}
        <Portal>
          <Modal
            visible={linkModalForStep !== null}
            onDismiss={() => setLinkModalForStep(null)}
            contentContainerStyle={{ backgroundColor: theme.colors.darkDefault, padding: 16, borderRadius: 8, marginHorizontal: 20, alignSelf: 'center', width: '90%', maxWidth: 420 }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>Add link</Text>
            <TextInput label="Label (optional)" value={linkLabel} onChangeText={setLinkLabel} mode="outlined" style={{ marginTop: 12 }} />
            <TextInput label="URL" value={linkUrl} onChangeText={setLinkUrl} mode="outlined" autoCapitalize="none" keyboardType="url" style={{ marginTop: 8 }} placeholder="https://…" />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button mode="text" textColor={theme.colors.textDarker} onPress={() => setLinkModalForStep(null)}>Cancel</Button>
              <Button mode="contained" buttonColor={theme.colors.primary} textColor="#fff" onPress={submitLink} disabled={!linkUrl.trim()}>
                Add
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
      </PageContent>
    </PageContainer>
  );
}
