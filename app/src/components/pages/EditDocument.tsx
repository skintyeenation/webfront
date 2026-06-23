import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Chip, HelperText, IconButton, Menu, Text, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { PageContainer, PageContent, NoContent, useToast } from 'skintyee/components/layout';
import { useAppSelector } from 'skintyee/store';
import { apiFactory } from 'skintyee/store/apis';
import { DocumentDto, DocumentTagDto, DocumentAudience } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// Combined create / edit screen. When mounted with route.params.id it
// loads + edits the existing document; without an id it creates a new
// one. Same form, same submit semantics — fewer parallel files to
// maintain.

const AUDIENCES: { value: DocumentAudience; label: string; description: string }[] = [
  { value: 'admin',       label: 'Admin only',  description: 'Only admins can see this.' },
  { value: 'finance',     label: 'Finance',     description: 'Finance group members (and admins) — payroll/AP documents.' },
  { value: 'staff',       label: 'Staff +',     description: 'Staff and admins can see this.' },
  { value: 'band_member', label: 'Members +',   description: 'Verified band members, staff, and admins.' },
  { value: 'public',      label: 'Public',      description: 'Visible to everyone, signed in or not.' },
];

const CATEGORY_ORDER: Array<'gov' | 'gov_sector' | 'department' | 'records'> = ['gov', 'gov_sector', 'department', 'records'];
const CATEGORY_LABEL: Record<string, string> = {
  gov: 'Government',
  gov_sector: 'Sector',
  department: 'Department',
  records: 'Records',
};

// Filenames: letters, digits, dot, underscore, hyphen only — no spaces or
// other special characters. Enforced live as the user types and on the server.
const sanitizeFileName = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '');

export default function EditDocument({ navigation, route }: any) {
  const editingId: string | undefined = route?.params?.id;
  const isEdit = !!editingId;

  useEffect(() => {
    navigation?.setOptions?.({ title: isEdit ? 'Edit document' : 'Add document' });
  }, [navigation, isEdit]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [audience, setAudience] = useState<DocumentAudience>('staff');
  const [tagIds, setTagIds] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<{ uri: string; name: string; mimeType: string; sizeBytes?: number } | undefined>();
  const [existing, setExisting] = useState<DocumentDto | undefined>();

  const [tagCat, setTagCat] = useState<{ tags: DocumentTagDto[] }>({ tags: [] });
  const [audienceMenuOpen, setAudienceMenuOpen] = useState(false);
  const [audienceAnchorWidth, setAudienceAnchorWidth] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { showToast, toastNode } = useToast();

  // Initial load — tag catalog + existing doc if editing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = apiFactory();
        const tags = await api.documentTags.list();
        if (cancelled) return;
        setTagCat({ tags: tags.tags });
        if (editingId) {
          const d = await api.documents.get(editingId);
          if (cancelled) return;
          setExisting(d);
          setTitle(d.title);
          setDescription(d.description ?? '');
          setLinkUrl(d.linkUrl ?? '');
          setFileName(d.fileName ?? '');
          setAudience(d.audience);
          setTagIds(new Set(d.tagIds));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editingId]);

  const tagsByCategory = useMemo(() => {
    const out: Record<string, DocumentTagDto[]> = { gov: [], gov_sector: [], department: [], records: [] };
    for (const t of tagCat.tags) (out[t.category] ??= []).push(t);
    return out;
  }, [tagCat.tags]);

  const toggleTag = (id: string) => {
    setTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // File picking — Expo DocumentPicker on native, <input type="file"> on web.
  const pickFile = async () => {
    setError(undefined);
    if (Platform.OS === 'web') {
      // Lazy <input> trigger so we don't have to mount one in the DOM.
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,image/*';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          setFile({ uri: reader.result as string, name: f.name, mimeType: f.type || 'application/pdf', sizeBytes: f.size });
          setFileName((cur) => cur || sanitizeFileName(f.name));
        };
        reader.readAsDataURL(f);
      };
      input.click();
      return;
    }
    try {
      const DocumentPicker = await import('expo-document-picker');
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', sizeBytes: a.size });
      setFileName((cur) => cur || sanitizeFileName(a.name));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const save = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!isEdit && !file && !linkUrl.trim()) {
      setError('Provide a PDF, a link URL, or both.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const api = apiFactory();
      if (isEdit && editingId) {
        await api.documents.update(editingId, {
          title: title.trim(),
          description: description.trim() || null,
          linkUrl: linkUrl.trim() || null,
          audience,
          tagIds: Array.from(tagIds),
          ...(fileName.trim() ? { fileName: fileName.trim() } : {}),
        });
        showToast('Saved');
      } else {
        await api.documents.create({
          title: title.trim(),
          description: description.trim() || undefined,
          linkUrl: linkUrl.trim() || undefined,
          audience,
          tagIds: Array.from(tagIds),
          file,
        });
        showToast('Document added');
      }
      setTimeout(() => navigation?.goBack?.(), 800);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editingId) return;
    setSaving(true);
    setError(undefined);
    try {
      await apiFactory().documents.delete(editingId);
      navigation?.goBack?.();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer><PageContent>
        <ActivityIndicator style={{ marginVertical: 24 }} />
      </PageContent></PageContainer>
    );
  }
  if (isEdit && !existing) {
    return (
      <PageContainer><PageContent>
        <NoContent message="Document not found." />
      </PageContent></PageContainer>
    );
  }

  const audienceOption = AUDIENCES.find((a) => a.value === audience)!;

  return (
    <PageContainer>
      <PageContent>
        <TextInput label="Display name" value={title} onChangeText={setTitle} mode="outlined" style={{ marginBottom: 10 }} />
        <TextInput label="Description (optional)" value={description} onChangeText={setDescription} mode="outlined" multiline numberOfLines={3} style={{ marginBottom: 10 }} />

        {/* File name — the download/display slug, distinct from the display
            name. Only relevant for file-backed docs. Charset enforced live. */}
        {(existing?.fileKey || file) ? (
          <View style={{ marginBottom: 10 }}>
            <TextInput
              label="File name"
              value={fileName}
              onChangeText={(v) => setFileName(sanitizeFileName(v))}
              mode="outlined"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <HelperText type="info">Letters, numbers, dot, underscore, hyphen — no spaces or special characters.</HelperText>
          </View>
        ) : null}

        {/* PDF picker */}
        <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>
          📄  PDF
        </Text>
        {existing?.fileName ? (
          <HelperText type="info" visible style={{ marginLeft: -8 }}>
            Currently: {existing.fileName}{existing.sizeBytes ? ` (${Math.round(existing.sizeBytes / 1024)} KB)` : ''} — pick a new file to replace.
          </HelperText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Button mode="outlined" icon="paperclip" textColor={theme.colors.text} onPress={pickFile}>
            {file ? 'Replace file' : (existing?.fileName ? 'Pick a different PDF' : 'Pick PDF')}
          </Button>
          {file ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginLeft: 8, flex: 1 }} numberOfLines={1}>
              {file.name} {file.sizeBytes ? `· ${Math.round(file.sizeBytes / 1024)} KB` : ''}
            </Text>
          ) : null}
        </View>

        {/* Optional external link */}
        <TextInput
          label="External link (optional)"
          placeholder="https://…"
          value={linkUrl}
          onChangeText={setLinkUrl}
          mode="outlined"
          autoCapitalize="none"
          keyboardType="url"
          style={{ marginBottom: 10 }}
        />

        {/* Audience dropdown — same anchor-width pattern as the meeting
            type picker for visual consistency. */}
        <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>
          Audience
        </Text>
        <Menu
          visible={audienceMenuOpen}
          onDismiss={() => setAudienceMenuOpen(false)}
          anchor={
            <View onLayout={(e) => setAudienceAnchorWidth(e.nativeEvent.layout.width)}>
              <Button mode="outlined" icon="account-key" textColor={theme.colors.text} onPress={() => setAudienceMenuOpen(true)} contentStyle={{ justifyContent: 'flex-start' }}>
                {audienceOption.label}
              </Button>
            </View>
          }
          contentStyle={{ backgroundColor: theme.colors.darkDefault, width: audienceAnchorWidth }}
        >
          {AUDIENCES.map((a) => (
            <Menu.Item
              key={a.value}
              title={a.label}
              trailingIcon={a.value === audience ? 'check' : undefined}
              onPress={() => { setAudience(a.value); setAudienceMenuOpen(false); }}
              titleStyle={{ color: a.value === audience ? theme.colors.primary : theme.colors.text, fontWeight: a.value === audience ? '700' : '400' }}
            />
          ))}
        </Menu>
        <HelperText type="info" visible style={{ marginLeft: -8, marginBottom: 4 }}>
          {audienceOption.description}
        </HelperText>

        {/* Tags */}
        <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginTop: 6, marginBottom: 4 }}>
          Tags
        </Text>
        {CATEGORY_ORDER.map((cat) => {
          const tags = tagsByCategory[cat] ?? [];
          if (tags.length === 0) return null;
          return (
            <View key={cat} style={{ marginTop: 6 }}>
              <Text style={{ color: theme.colors.textDarker, fontSize: 10, letterSpacing: 1 }}>
                {CATEGORY_LABEL[cat].toUpperCase()}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                {tags.map((t) => {
                  const on = tagIds.has(t.id);
                  return (
                    <Chip
                      key={t.id}
                      selected={on}
                      showSelectedCheck
                      onPress={() => toggleTag(t.id)}
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

        {/* Company field — placeholder for Phase 2 onboarding work. */}
        <View style={{ marginTop: 12, opacity: 0.5 }}>
          <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
            Company
          </Text>
          <TextInput
            mode="outlined"
            value="Coming soon"
            disabled
            style={{ marginTop: 4 }}
          />
          <HelperText type="info" visible style={{ marginLeft: -8 }}>
            Reserved for the contractor onboarding feature.
          </HelperText>
        </View>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap' }}>
          {isEdit ? (
            <Button mode="text" icon="delete" textColor={theme.colors.error} onPress={remove} disabled={saving}>
              Delete
            </Button>
          ) : <View />}
          <Button
            mode="contained" icon={isEdit ? 'content-save' : 'plus'}
            buttonColor={theme.colors.primary} textColor="#fff"
            onPress={save}
            disabled={saving || !title.trim()}
            loading={saving}
          >
            {isEdit ? 'Save changes' : 'Add document'}
          </Button>
        </View>

        {toastNode}
      </PageContent>
    </PageContainer>
  );
}
