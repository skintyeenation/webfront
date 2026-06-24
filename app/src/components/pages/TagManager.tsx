import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Divider, HelperText, IconButton, Modal, Portal, Text, TextInput } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { PageContainer, PageContent, useToast } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { DocumentTagDto } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Tag Manager — admin curates the 3 tag categories (gov / gov_sector /
// department). Tags in use show an "in use (N)" badge and have their
// Delete button disabled, surfacing the 409 the server would throw.
// ----------------------------------------------------------------------------

const CATEGORY_ORDER: Array<'gov' | 'gov_sector' | 'department' | 'records' | 'records'> = ['gov', 'gov_sector', 'department', 'records'];
const CATEGORY_LABEL: Record<string, string> = {
  gov: 'Government',
  gov_sector: 'Categories',
  department: 'Department',
  records: 'Records',
};
const CATEGORY_DESC: Record<string, string> = {
  gov: 'Flag a document as government-issued.',
  gov_sector: 'Which band governance domain this document concerns.',
  department: 'Which internal Skin Tyee department owns it.',
  records: 'Accounts-payable / payroll document type (EFTs, payroll slips, expense sheets, mileage, timesheets).',
};

export default function TagManager({ navigation }: any) {
  useEffect(() => {
    navigation?.setOptions?.({ title: 'Tag Manager' });
  }, [navigation]);

  const [tags, setTags] = useState<DocumentTagDto[]>([]);
  const [categories, setCategories] = useState<Array<{ slug: 'gov' | 'gov_sector' | 'department' | 'records'; displayName: string; description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const { showToast, toastNode } = useToast();

  const [editing, setEditing] = useState<{ id?: string; category: 'gov' | 'gov_sector' | 'department' | 'records'; slug: string; displayName: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      const r = await apiFactory().documentTags.list();
      setTags(r.tags);
      setCategories(r.categories);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tagsByCategory = useMemo(() => {
    const out: Record<string, DocumentTagDto[]> = { gov: [], gov_sector: [], department: [], records: [] };
    for (const t of tags) (out[t.category] ??= []).push(t);
    return out;
  }, [tags]);

  const openCreate = (category: 'gov' | 'gov_sector' | 'department' | 'records') => {
    setEditing({ category, slug: '', displayName: '' });
    setFormError(undefined);
  };
  const openEdit = (t: DocumentTagDto) => {
    setEditing({ id: t.id, category: t.category, slug: t.slug, displayName: t.displayName });
    setFormError(undefined);
  };

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const submit = async () => {
    if (!editing) return;
    if (!editing.displayName.trim()) { setFormError('Name is required.'); return; }
    const slug = editing.slug.trim() || slugify(editing.displayName);
    setSaving(true);
    setFormError(undefined);
    try {
      const api = apiFactory();
      if (editing.id) {
        await api.documentTags.update(editing.id, { slug, displayName: editing.displayName.trim() });
        showToast('Tag updated');
      } else {
        await api.documentTags.create({ category: editing.category, slug, displayName: editing.displayName.trim() });
        showToast('Tag added');
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: DocumentTagDto) => {
    if (t.inUseCount > 0) return; // UI gate; server throws 409 too
    try {
      await apiFactory().documentTags.delete(t.id);
      showToast('Tag deleted');
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 8 }}>
          Curate the three tag categories used to organise documents. Tags currently in use can't be deleted — remove them from the listing documents first.
        </Text>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : error ? (
          <HelperText type="error" visible>{error}</HelperText>
        ) : (
          CATEGORY_ORDER.map((cat) => {
            const list = tagsByCategory[cat] ?? [];
            return (
              <Card key={cat} style={{ marginBottom: 12, backgroundColor: theme.colors.darkDefault }}>
                <Card.Content>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>{CATEGORY_LABEL[cat]}</Text>
                      <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{CATEGORY_DESC[cat]}</Text>
                    </View>
                    <Button compact mode="text" icon="plus" textColor={theme.colors.primary} onPress={() => openCreate(cat)}>
                      Add
                    </Button>
                  </View>
                  <Divider style={{ marginVertical: 8, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                  {list.length === 0 ? (
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12, fontStyle: 'italic' }}>No tags yet.</Text>
                  ) : (
                    list.map((t) => (
                      <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ color: theme.colors.text, fontSize: 13 }}>{t.displayName}</Text>
                            {t.inUseCount > 0 ? (
                              <Chip compact icon="link-variant" style={{ marginLeft: 8, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                                in use · {t.inUseCount}
                              </Chip>
                            ) : null}
                          </View>
                          <Text style={{ color: theme.colors.textDarker, fontSize: 10 }}>{t.slug}</Text>
                        </View>
                        <IconButton icon="pencil" size={18} iconColor={theme.colors.textDarker} onPress={() => openEdit(t)} />
                        <IconButton
                          icon="delete"
                          size={18}
                          iconColor={t.inUseCount > 0 ? 'rgba(255,255,255,0.25)' : theme.colors.error}
                          disabled={t.inUseCount > 0}
                          onPress={() => remove(t)}
                        />
                      </View>
                    ))
                  )}
                </Card.Content>
              </Card>
            );
          })
        )}

        {/* Add / Edit modal */}
        <Portal>
          <Modal
            visible={editing !== null}
            onDismiss={() => setEditing(null)}
            contentContainerStyle={{
              backgroundColor: theme.colors.darkDefault,
              marginHorizontal: 20,
              borderRadius: 8,
              alignSelf: 'center',
              width: '90%',
              maxWidth: 420,
              padding: 16,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>
              {editing?.id ? 'Edit tag' : `Add ${editing ? CATEGORY_LABEL[editing.category] : ''} tag`}
            </Text>
            <TextInput
              label="Display name"
              value={editing?.displayName ?? ''}
              onChangeText={(v) => setEditing((cur) => cur ? { ...cur, displayName: v } : cur)}
              mode="outlined"
              style={{ marginTop: 12 }}
            />
            <TextInput
              label="Slug (kebab-case)"
              value={editing?.slug ?? ''}
              onChangeText={(v) => setEditing((cur) => cur ? { ...cur, slug: v } : cur)}
              mode="outlined"
              autoCapitalize="none"
              style={{ marginTop: 8 }}
              placeholder={editing && editing.displayName ? slugify(editing.displayName) : 'auto-generated from name'}
            />
            {formError ? <HelperText type="error" visible>{formError}</HelperText> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button mode="text" textColor={theme.colors.textDarker} onPress={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button mode="contained" buttonColor={theme.colors.primary} textColor="#fff" onPress={submit} loading={saving} disabled={saving}>
                {editing?.id ? 'Save' : 'Add'}
              </Button>
            </View>
          </Modal>
        </Portal>

        {toastNode}
      </PageContent>
    </PageContainer>
  );
}
