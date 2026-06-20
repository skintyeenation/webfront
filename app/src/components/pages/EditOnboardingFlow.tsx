import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Divider, HelperText, IconButton, Menu, Modal, Portal, Switch, Text, TextInput } from 'react-native-paper';
import { PageContainer, PageContent, NoContent, useToast } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { pickFile } from 'skintyee/core/receiptCapture';
import {
  OnboardingFlowDto, PersonDto, OnboardingAssignmentDto,
  DocumentDto, DocumentTagDto, DocumentAudience, StepCompletion,
} from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// Mirror of the Documents manager (EditDocument.tsx) so an onboarding upload
// asks for the same metadata.
const AUDIENCES: { value: DocumentAudience; label: string }[] = [
  { value: 'admin',       label: 'Admin only' },
  { value: 'staff',       label: 'Staff +' },
  { value: 'band_member', label: 'Members +' },
  { value: 'public',      label: 'Public' },
];
const TAG_CATEGORY_ORDER: Array<'gov' | 'gov_sector' | 'department'> = ['gov', 'gov_sector', 'department'];
const TAG_CATEGORY_LABEL: Record<string, string> = { gov: 'Government', gov_sector: 'Sector', department: 'Department' };

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
  const { showToast, toastNode } = useToast();

  // Per-step menus, attach modal etc. (Assigning a flow to a person
  // lives on the Onboarding screen's Assignments tab now — single home
  // for picking flow + person instead of two entry points.)
  const [attachOpenForStep, setAttachOpenForStep] = useState<string | null>(null);
  const [linkModalForStep, setLinkModalForStep] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [completionMenuFor, setCompletionMenuFor] = useState<string | null>(null);

  // New-document upload form (mirrors the Documents manager fields).
  const [docTags, setDocTags] = useState<DocumentTagDto[]>([]);
  const [uploadForStep, setUploadForStep] = useState<string | null>(null);
  const [uTitle, setUTitle] = useState('');
  const [uDescription, setUDescription] = useState('');
  const [uAudience, setUAudience] = useState<DocumentAudience>('staff');
  const [uTagIds, setUTagIds] = useState<Set<string>>(new Set());
  const [uNeedsUpload, setUNeedsUpload] = useState(true);
  const [uFile, setUFile] = useState<{ uri: string; name: string; mimeType: string; sizeBytes?: number } | undefined>();
  const [uAudienceMenu, setUAudienceMenu] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const uTagsByCategory = useMemo(() => {
    const out: Record<string, DocumentTagDto[]> = { gov: [], gov_sector: [], department: [] };
    for (const t of docTags) (out[t.category] ??= []).push(t);
    return out;
  }, [docTags]);

  const loadAll = async (existingFlow?: OnboardingFlowDto) => {
    setError(undefined);
    try {
      const api = apiFactory();
      const [docs, conts, asg, tagCat] = await Promise.all([
        api.documents.list().catch(() => []),
        api.onboarding.listPeople(),
        flowId ? api.onboarding.listAssignments({ flowId }) : Promise.resolve([]),
        api.documentTags.list().then((r) => r.tags).catch(() => [] as DocumentTagDto[]),
      ]);
      setDocuments(docs);
      setDocTags(tagCat);
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
        showToast('Saved');
      } else {
        const r = await api.onboarding.createFlow({
          title: title.trim(),
          description: description.trim() || undefined,
        });
        setFlow(r);
        showToast('Flow created');
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
      showToast(`Attached “${doc.title}”`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      showToast('Couldn’t attach the document', 'error');
    }
  };
  const detachDoc = async (rowId: string) => {
    try {
      await apiFactory().onboarding.detachDocument(rowId);
      await reloadFlow();
      showToast('Document removed');
    } catch (e: any) {
      setError(e?.message ?? String(e));
      showToast('Couldn’t remove the document', 'error');
    }
  };

  // Open the new-document upload form for a step (mirrors the Documents
  // manager: title / description / audience / tags + the file). The "+ Upload"
  // button used to only attach an EXISTING doc — there was no way to add a new
  // file, so the only thing to attach was the seeded NDA.
  const openUploadForm = (stepId: string) => {
    setUploadForStep(stepId);
    setAttachOpenForStep(null);
    setUTitle(''); setUDescription(''); setUAudience('staff');
    setUTagIds(new Set()); setUNeedsUpload(true); setUFile(undefined);
    setError(undefined);
  };
  const uToggleTag = (id: string) => setUTagIds((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const pickUploadFile = async () => {
    setError(undefined);
    try {
      const picked = await pickFile();
      if (!picked) return;
      setUFile(picked);
      if (!uTitle.trim()) setUTitle(picked.name.replace(/\.[^./\\]+$/, '') || picked.name);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };
  const submitUpload = async () => {
    if (!uploadForStep) return;
    if (!uTitle.trim()) { setError('Title is required.'); return; }
    if (!uFile) { setError('Choose a file to upload.'); return; }
    setUploadingDoc(true);
    setError(undefined);
    try {
      const created = await apiFactory().documents.create({
        title: uTitle.trim(),
        description: uDescription.trim() || undefined,
        audience: uAudience,
        tagIds: Array.from(uTagIds),
        file: { uri: uFile.uri, name: uFile.name, mimeType: uFile.mimeType },
      });
      await apiFactory().onboarding.attachDocument(uploadForStep, { documentId: created.id, personUploadAllowed: uNeedsUpload });
      setUploadForStep(null);
      await loadAll();      // refresh the library list
      await reloadFlow();   // refresh the step's attachments
      showToast(`Uploaded & attached “${uTitle.trim()}”`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      showToast(e?.message ? `Upload failed: ` : 'Upload failed', 'error');
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
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
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
        {flow && flow.steps.length > 0 ? (
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 4, marginBottom: 6 }}>
            STEPS ({flow.steps.length})
          </Text>
        ) : null}
        {flow?.steps.map((s, idx) => (
          <Card key={s.id} style={{ marginBottom: 8, backgroundColor: theme.colors.darkDefault, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
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
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
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
              onPress={() => attachOpenForStep && openUploadForm(attachOpenForStep)}
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              Upload a new document…
            </Button>
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 4 }}>
              Adds the file (PDF/image) to the library and attaches it to this step.
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

        {/* New-document upload form — same fields as the Documents manager. */}
        <Portal>
          <Modal
            visible={uploadForStep !== null}
            onDismiss={() => !uploadingDoc && setUploadForStep(null)}
            contentContainerStyle={{ backgroundColor: theme.colors.darkDefault, padding: 16, borderRadius: 8, marginHorizontal: 20, maxHeight: '85%', alignSelf: 'center', width: '90%', maxWidth: 460 }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>Upload a new document</Text>
            <ScrollView style={{ marginTop: 8 }}>
              {/* File */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Button mode="outlined" icon="paperclip" textColor={theme.colors.text} onPress={pickUploadFile} style={{ borderColor: theme.colors.secondary }}>
                  {uFile ? 'Change file' : 'Choose file (PDF/image)'}
                </Button>
                {uFile ? (
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginLeft: 8, flex: 1 }} numberOfLines={2}>
                    {uFile.name}{uFile.sizeBytes ? ` (${Math.round(uFile.sizeBytes / 1024)} KB)` : ''}
                  </Text>
                ) : null}
              </View>

              <TextInput label="Title" value={uTitle} onChangeText={setUTitle} mode="outlined" style={{ marginTop: 8 }} />
              <TextInput label="Description (optional)" value={uDescription} onChangeText={setUDescription} mode="outlined" multiline numberOfLines={2} style={{ marginTop: 8 }} />

              {/* Audience */}
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 12, marginBottom: 4 }}>AUDIENCE</Text>
              <Menu
                visible={uAudienceMenu}
                onDismiss={() => setUAudienceMenu(false)}
                anchor={
                  <Button mode="outlined" icon="account-group" textColor={theme.colors.text} onPress={() => setUAudienceMenu(true)} style={{ borderColor: theme.colors.secondary, alignSelf: 'flex-start' }}>
                    {AUDIENCES.find((a) => a.value === uAudience)?.label ?? uAudience}
                  </Button>
                }
              >
                {AUDIENCES.map((a) => (
                  <Menu.Item key={a.value} title={a.label} onPress={() => { setUAudience(a.value); setUAudienceMenu(false); }} />
                ))}
              </Menu>

              {/* Tags */}
              {docTags.length > 0 ? (
                <>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginTop: 12, marginBottom: 4 }}>TAGS</Text>
                  {TAG_CATEGORY_ORDER.map((cat) => {
                    const list = uTagsByCategory[cat] ?? [];
                    if (list.length === 0) return null;
                    return (
                      <View key={cat} style={{ marginBottom: 6 }}>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 10 }}>{TAG_CATEGORY_LABEL[cat]}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
                          {list.map((t) => {
                            const on = uTagIds.has(t.id);
                            return (
                              <Chip
                                key={t.id} compact selected={on} showSelectedCheck
                                onPress={() => uToggleTag(t.id)}
                                style={{ marginRight: 6, marginBottom: 6, backgroundColor: on ? theme.colors.primary : theme.colors.secondary }}
                                textStyle={{ color: on ? '#000' : theme.colors.text, fontSize: 11 }}
                              >
                                {t.displayName}
                              </Chip>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </>
              ) : null}

              {/* Person-upload requirement */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <Switch value={uNeedsUpload} onValueChange={setUNeedsUpload} color={theme.colors.primary} />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13 }}>Person uploads a completed copy</Text>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>For forms they fill/sign (TD1, T4…). Off = read-only reference.</Text>
                </View>
              </View>

              {error ? <HelperText type="error" visible>{error}</HelperText> : null}
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button mode="text" textColor={theme.colors.textDarker} onPress={() => setUploadForStep(null)} disabled={uploadingDoc}>Cancel</Button>
              <Button mode="contained" icon="upload" buttonColor={theme.colors.primary} textColor="#fff" onPress={submitUpload} loading={uploadingDoc} disabled={uploadingDoc}>
                Upload & attach
              </Button>
            </View>
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

        {toastNode}
      </PageContent>
    </PageContainer>
  );
}
