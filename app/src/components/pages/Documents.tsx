import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, HelperText, IconButton, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, AdminAddButton, NoContent } from 'skintyee/components/layout';
import { useAppSelector } from 'skintyee/store';
import { apiFactory } from 'skintyee/store/apis';
import { DocumentDto, DocumentTagDto } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Documents — admin-managed library of band documents.
//
// List view: search + per-category chip filters (gov / gov_sector /
// department). Admins see all; members see audience-filtered subset.
//
// Visual conventions borrowed from TimeKeeping (status chip palette,
// card layout, info-modal pattern). See docs/features/documents-and-onboarding.md.
// ----------------------------------------------------------------------------

const AUDIENCE_LABEL: Record<string, string> = {
  admin: 'Admin only',
  finance: 'Finance',
  staff: 'Staff +',
  band_member: 'Members +',
  public: 'Public',
};
const audienceColor = (a: string) =>
  a === 'admin' ? theme.colors.error
  : a === 'finance' ? '#C9A227' // gold — distinct from staff's orange
  : a === 'staff' ? theme.colors.accent
  : a === 'band_member' ? theme.colors.primary
  : theme.colors.success;

const CATEGORY_ORDER: Array<'gov' | 'gov_sector' | 'department' | 'records'> = ['gov', 'gov_sector', 'department', 'records'];
const CATEGORY_LABEL: Record<string, string> = {
  gov: 'Government',
  gov_sector: 'Categories',
  department: 'Department',
  records: 'Records',
};

// Open a Blob in a new tab on web (object URL). Mirrors the Timekeeping /
// Expense report screens. We must stream the bytes through the api/ (with
// the x-role/x-upn/auth headers) rather than open the document's fileUrl
// directly — locally that fileUrl is a `mem://` URL the browser can't open,
// and even a real storage URL would arrive header-less → 403 on the
// audience-gated /pdf endpoint.
function openBlob(blob: Blob) {
  if (Platform.OS === 'web' && typeof URL !== 'undefined') {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Keep the object URL alive long enough for the new tab to render.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export default function Documents({ navigation }: any) {
  const role = useAppSelector((s) => s.auth.role);
  const isAdmin = role === 'admin';
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [tagCat, setTagCat] = useState<{ tags: DocumentTagDto[] }>({ tags: [] });
  const [search, setSearch] = useState('');
  const [activeTagId, setActiveTagId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [openingId, setOpeningId] = useState<string | undefined>();

  const loadAll = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      const api = apiFactory();
      const [list, tags] = await Promise.all([
        api.documents.list({ tag: activeTagId, search: search.trim() || undefined }),
        api.documentTags.list(),
      ]);
      setDocs(list);
      setTagCat({ tags: tags.tags });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [activeTagId, search]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // Stream the file through the api/ (carries x-role/x-upn/auth) and open the
  // returned blob, instead of opening the document's raw fileUrl (which is a
  // browser-unopenable `mem://` URL in local dev).
  const openPdf = useCallback(async (id: string) => {
    setError(undefined);
    setOpeningId(id);
    try {
      const { blob } = await apiFactory().documents.fetchPdf(id);
      openBlob(blob);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setOpeningId(undefined);
    }
  }, []);

  const tagsByCategory = useMemo(() => {
    const out: Record<string, DocumentTagDto[]> = { gov: [], gov_sector: [], department: [], records: [] };
    for (const t of tagCat.tags) (out[t.category] ??= []).push(t);
    return out;
  }, [tagCat.tags]);

  const tagById = useMemo(() => new Map(tagCat.tags.map((t) => [t.id, t])), [tagCat.tags]);

  return (
    <PageContainer>
      <PageContent>
        {isAdmin ? (
          // Same alignment trick as Onboarding — drop `compact` so the
          // outlined button matches AdminAddButton (non-compact contained)
          // in height; alignItems:center keeps them on a baseline on
          // reflow.
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            <AdminAddButton label="Add document" icon="file-plus" onPress={() => navigation.navigate('documentCreate')} />
            <Button
              mode="outlined" icon="tag-multiple"
              textColor={theme.colors.text}
              onPress={() => navigation.navigate('tagManager')}
              style={{ marginLeft: 6, marginBottom: 12 }}
            >
              Tag Manager
            </Button>
          </View>
        ) : null}

        {/* Search */}
        <TextInput
          dense mode="outlined"
          label="Search documents"
          value={search}
          onChangeText={setSearch}
          style={{ marginTop: 12 }}
          left={<TextInput.Icon icon="magnify" />}
          right={search ? <TextInput.Icon icon="close" onPress={() => setSearch('')} /> : undefined}
          onSubmitEditing={loadAll}
        />

        {/* Tag filters — three chip rows, one per category. */}
        {CATEGORY_ORDER.map((cat) => {
          const tags = tagsByCategory[cat] ?? [];
          if (tags.length === 0) return null;
          return (
            <View key={cat} style={{ marginTop: 10 }}>
              <Text style={{ color: theme.colors.textDarker, fontSize: 10, letterSpacing: 1 }}>
                {CATEGORY_LABEL[cat].toUpperCase()}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                {tags.map((t) => {
                  const on = activeTagId === t.id;
                  return (
                    <Chip
                      key={t.id}
                      selected={on}
                      showSelectedCheck
                      onPress={() => setActiveTagId(on ? undefined : t.id)}
                      style={{
                        marginRight: 6,
                        backgroundColor: on ? theme.colors.primary : theme.colors.secondary,
                      }}
                      textStyle={{ color: on ? '#000' : theme.colors.text, fontSize: 11 }}
                    >
                      {t.displayName}
                    </Chip>
                  );
                })}
              </ScrollView>
            </View>
          );
        })}

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : docs.length === 0 ? (
          <NoContent message={activeTagId || search ? 'No matches for that filter.' : 'No documents yet.'} />
        ) : (
          docs.map((d) => (
            <Card key={d.id} style={{ marginTop: 10, backgroundColor: theme.colors.darkDefault }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>{d.title}</Text>
                  <Chip compact style={{ backgroundColor: audienceColor(d.audience) }} textStyle={{ color: '#000', fontSize: 10 }}>
                    {AUDIENCE_LABEL[d.audience] ?? d.audience}
                  </Chip>
                </View>
                {d.description ? (
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 4 }}>{d.description}</Text>
                ) : null}
                {d.tagIds.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                    {d.tagIds.map((tid) => {
                      const tag = tagById.get(tid);
                      if (!tag) return null;
                      return (
                        <Chip key={tid} compact style={{ marginRight: 4, marginBottom: 4, backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                          {tag.displayName}
                        </Chip>
                      );
                    })}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  {d.fileUrl ? (
                    <Button compact mode="contained" icon="download" buttonColor={theme.colors.primary} textColor="#fff" loading={openingId === d.id} disabled={openingId === d.id} onPress={() => openPdf(d.id)}>
                      Open PDF
                    </Button>
                  ) : null}
                  {d.linkUrl ? (
                    <Button compact mode="text" icon="open-in-new" textColor={theme.colors.primary} onPress={() => Linking.openURL(d.linkUrl!)} style={{ marginLeft: 6 }}>
                      External link
                    </Button>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  {isAdmin ? (
                    <IconButton icon="pencil" size={18} iconColor={theme.colors.textDarker} onPress={() => navigation.navigate('documentEdit', { id: d.id })} />
                  ) : null}
                </View>
                <Text style={{ color: theme.colors.textDarker, fontSize: 10, marginTop: 4 }}>
                  Updated {dayjs(d.updatedAt).format('MMM D, YYYY')} · by {d.createdBy}
                </Text>
              </Card.Content>
            </Card>
          ))
        )}
      </PageContent>
    </PageContainer>
  );
}
