import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Divider, HelperText, IconButton, Modal, Portal, Switch, Text, TextInput } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { PageContainer, PageContent, useConfirm, useToast } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { ExpenseTag } from 'skintyee/models';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Expense Tag Manager — admin curates the editable expense-category catalog,
// exactly like the Document Tag Manager. Pre-seeded with standard expense
// items (Travel, Meals, Fuel, …). Tags can be renamed, deactivated (hidden
// from the receipt picker without losing history), or deleted.
// ----------------------------------------------------------------------------

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function ExpenseTagManager() {
  const [tags, setTags] = useState<ExpenseTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const { showToast, toastNode } = useToast();
  const { confirm, ConfirmHost } = useConfirm();

  const [editing, setEditing] = useState<{ slug: string; label: string; glAccount: string; isNew: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setError(undefined); setLoading(true);
    try {
      setTags(await apiFactory().expenses.tags());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => { setEditing({ slug: '', label: '', glAccount: '', isNew: true }); setFormError(undefined); };
  const openEdit = (t: ExpenseTag) => { setEditing({ slug: t.slug, label: t.label, glAccount: t.glAccount ?? '', isNew: false }); setFormError(undefined); };

  const submit = async () => {
    if (!editing) return;
    if (!editing.label.trim()) { setFormError('Label is required.'); return; }
    setSaving(true); setFormError(undefined);
    try {
      const api = apiFactory();
      const gl = editing.glAccount.trim();
      if (editing.isNew) {
        const slug = editing.slug.trim() || slugify(editing.label);
        await api.expenses.createTag(slug, editing.label.trim(), gl || undefined);
        showToast('Tag added');
      } else {
        await api.expenses.updateTag(editing.slug, { label: editing.label.trim(), glAccount: gl || null });
        showToast('Tag updated');
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: ExpenseTag) => {
    try {
      await apiFactory().expenses.updateTag(t.slug, { active: !t.active });
      setTags((prev) => prev.map((x) => (x.slug === t.slug ? { ...x, active: !x.active } : x)));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const remove = (t: ExpenseTag) =>
    confirm({
      title: 'Delete tag?',
      message: `"${t.label}" will be removed from the catalog. Receipts already tagged with it keep the tag value.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await apiFactory().expenses.deleteTag(t.slug);
          showToast('Tag deleted');
          await load();
        } catch (e: any) {
          setError(e?.message ?? String(e));
        }
      },
    });

  return (
    <PageContainer>
      <PageContent>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: theme.colors.textDarker, fontSize: 12, flex: 1 }}>
            Standard expense categories workers pick from when tagging receipts. Claude also
            suggests one of these per receipt. Deactivate to hide from the picker without losing history.
          </Text>
          <Button compact mode="text" icon="plus" textColor={theme.colors.primary} onPress={openCreate}>Add</Button>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : error ? (
          <HelperText type="error" visible>{error}</HelperText>
        ) : (
          <Card style={{ backgroundColor: theme.colors.darkDefault }}>
            <Card.Content>
              {tags.length === 0 ? (
                <Text style={{ color: theme.colors.textDarker, fontStyle: 'italic' }}>No tags yet.</Text>
              ) : (
                tags.map((t, i) => (
                  <React.Fragment key={t.slug}>
                    {i > 0 ? <Divider style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ color: t.active ? theme.colors.text : theme.colors.textDarker, fontSize: 13 }}>{t.label}</Text>
                          {t.glAccount ? (
                            <Chip compact icon="book-account" style={{ marginLeft: 8, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                              GL {t.glAccount}
                            </Chip>
                          ) : null}
                          {!t.active ? (
                            <Chip compact style={{ marginLeft: 8, backgroundColor: 'rgba(255,255,255,0.06)' }} textStyle={{ color: theme.colors.textDarker, fontSize: 10 }}>
                              hidden
                            </Chip>
                          ) : null}
                        </View>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 10 }}>{t.slug}</Text>
                      </View>
                      <Switch value={t.active} onValueChange={() => toggleActive(t)} color={theme.colors.primary} />
                      <IconButton icon="pencil" size={18} iconColor={theme.colors.textDarker} onPress={() => openEdit(t)} />
                      <IconButton icon="delete" size={18} iconColor={theme.colors.error} onPress={() => remove(t)} />
                    </View>
                  </React.Fragment>
                ))
              )}
            </Card.Content>
          </Card>
        )}

        <Portal>
          <Modal
            visible={editing !== null}
            onDismiss={() => setEditing(null)}
            contentContainerStyle={{ backgroundColor: theme.colors.darkDefault, marginHorizontal: 20, borderRadius: 8, alignSelf: 'center', width: '90%', maxWidth: 420, padding: 16 }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>
              {editing?.isNew ? 'Add expense tag' : 'Edit tag'}
            </Text>
            <TextInput
              label="Label" value={editing?.label ?? ''}
              onChangeText={(v) => setEditing((cur) => (cur ? { ...cur, label: v } : cur))}
              mode="outlined" autoCapitalize="none" style={{ marginTop: 12 }}
            />
            <TextInput
              label="GL account number" value={editing?.glAccount ?? ''}
              onChangeText={(v) => setEditing((cur) => (cur ? { ...cur, glAccount: v } : cur))}
              mode="outlined" autoCapitalize="characters" style={{ marginTop: 8 }}
              placeholder="e.g. 5010 — the ledger account this category posts to"
            />
            {editing?.isNew ? (
              <TextInput
                label="Slug (kebab-case)" value={editing?.slug ?? ''}
                onChangeText={(v) => setEditing((cur) => (cur ? { ...cur, slug: v } : cur))}
                mode="outlined" autoCapitalize="none" style={{ marginTop: 8 }}
                placeholder={editing?.label ? slugify(editing.label) : 'auto-generated from label'}
              />
            ) : null}
            {formError ? <HelperText type="error" visible>{formError}</HelperText> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button mode="text" textColor={theme.colors.textDarker} onPress={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button mode="contained" buttonColor={theme.colors.primary} textColor="#fff" onPress={submit} loading={saving} disabled={saving}>
                {editing?.isNew ? 'Add' : 'Save'}
              </Button>
            </View>
          </Modal>
        </Portal>

        {toastNode}
        <ConfirmHost />
      </PageContent>
    </PageContainer>
  );
}
