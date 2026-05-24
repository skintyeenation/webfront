import React, { useEffect, useMemo, useState } from 'react';
import { Platform, View, Text, Pressable } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, TextInput } from 'react-native-paper';
import { PageContainer, SourcePicker } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppDispatch, useAppSelector } from 'lookup/store';
import { loadSources } from 'lookup/store/modules/sources';
import { jobStarted } from 'lookup/store/modules/lookup';
import { historyPushed } from 'lookup/store/modules/history';
import { listNations, startRun, type NationListItem } from 'lookup/services/lookupApi';

type Mode = 'search' | 'browse';

const REGIONS: Array<{ id: string; label: string }> = [
  { id: '9', label: 'British Columbia' },
  { id: '8', label: 'Yukon' },
  { id: '7', label: 'Alberta' },
  { id: '6', label: 'Saskatchewan' },
  { id: '5', label: 'Manitoba' },
  { id: '4', label: 'Ontario' },
  { id: '3', label: 'Quebec' },
  { id: '2', label: 'Atlantic' },
  { id: '0', label: 'Northwest Territories' },
];

/**
 * Nations lookup. Top-level "Search" / "Browse nations" chip toggle.
 *  - Search: type a name, run the federal sources, results render via the
 *    standard Run/Results pages (same as Business / Funding tabs).
 *  - Browse: full ISC band list for one region (BC by default), filterable
 *    in-line, tap a row to drill into Nation Detail.
 */
export default function NationsLookup({ navigation }: any) {
  const dispatch = useAppDispatch();
  const allSources = useAppSelector((s) => s.sources.items.filter((x) => x.mode === 'nations'));
  const defaults = useAppSelector((s) => s.sources.defaultsByMode['nations'] ?? []);

  const [mode, setMode] = useState<Mode>('browse');
  const [target, setTarget] = useState('');
  const [bcOnly, setBcOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const indigenousOnly = true;

  // Browse-mode state
  const [browseRegion, setBrowseRegion] = useState<string>('9');
  const [filter, setFilter] = useState('');
  const [browseList, setBrowseList] = useState<NationListItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | undefined>();
  const [browseCached, setBrowseCached] = useState<boolean | undefined>();
  const [browseFetchedAt, setBrowseFetchedAt] = useState<string | undefined>();

  useEffect(() => {
    void dispatch(loadSources({ mode: 'nations', indigenousOnly: true }));
  }, [dispatch]);

  useEffect(() => {
    setSelected(new Set(defaults));
  }, [defaults.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load the browse list when the mode flips to 'browse' or the region
  // changes. The full registry CSV is cached for 7 days, so flipping
  // between regions is free after the first hit.
  const loadBrowse = (refresh = false) => {
    setBrowseLoading(true);
    setBrowseError(undefined);
    return listNations(browseRegion, refresh)
      .then((res) => {
        setBrowseList(res.items);
        setBrowseCached(res.cached);
        setBrowseFetchedAt(res.fetchedAt);
      })
      .catch((e) => {
        setBrowseError((e as Error).message);
      })
      .finally(() => setBrowseLoading(false));
  };

  useEffect(() => {
    if (mode !== 'browse') return;
    let cancelled = false;
    void loadBrowse(false).then(() => { if (cancelled) {} });
    return () => {
      cancelled = true;
    };
  }, [mode, browseRegion]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredBrowse = useMemo(() => {
    if (!filter.trim()) return browseList;
    const needle = filter.trim().toLowerCase();
    return browseList.filter(
      (b) =>
        b.name.toLowerCase().includes(needle) ||
        b.bandNumber.includes(needle) ||
        (b.community || '').toLowerCase().includes(needle),
    );
  }, [browseList, filter]);

  // Alphabet index — letters present in the filtered list, mapped to the
  // first band that starts with that letter. Used by the right-side
  // alphabet scroller to jump-scroll the page.
  const alphabet = useMemo(() => {
    const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const seen = new Set<string>();
    const byLetter: Record<string, string> = {};
    for (const b of filteredBrowse) {
      // Strip leading non-alpha characters (some names start with ʔ, ?, ŋ, etc.).
      const first = (b.name.match(/[A-Za-z]/)?.[0] ?? '').toUpperCase();
      if (!first) continue;
      if (!seen.has(first)) {
        seen.add(first);
        byLetter[first] = `band-${b.bandNumber}`;
      }
    }
    return { letters: all, present: seen, byLetter };
  }, [filteredBrowse]);

  const jumpToLetter = (letter: string) => {
    const id = alphabet.byLetter[letter];
    if (!id) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSelectAll = (ids: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const canRun = target.trim().length > 0 && selected.size > 0;

  const run = async () => {
    const options = {
      mode: 'nations' as const,
      target: target.trim(),
      sourceIds: [...selected],
      indigenousOnly,
      regionId: bcOnly ? '9' : undefined,
    };
    const { jobId } = await startRun(options);
    dispatch(jobStarted({ jobId, options }));
    dispatch(
      historyPushed({
        jobId,
        startedAt: Date.now(),
        mode: 'nations',
        target: options.target,
        indigenousOnly,
        sourceCount: options.sourceIds.length,
        status: 'running',
      }),
    );
    navigation.navigate('Run', { jobId });
  };

  return (
    <PageContainer>
      <Text style={{ color: theme.colors.success, fontSize: 18, fontWeight: '700', marginBottom: 6 }}>
        Nations lookup
      </Text>
      <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 12 }}>
        Browse the ISC band registry, or search by name.
      </Text>

      {/* Mode toggle */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
        <Chip
          selected={mode === 'browse'}
          icon="format-list-bulleted"
          onPress={() => setMode('browse')}
          style={{ backgroundColor: mode === 'browse' ? theme.colors.success : theme.colors.secondary }}
          textStyle={{ color: mode === 'browse' ? '#000' : theme.colors.text }}
        >
          Browse nations
        </Chip>
        <Chip
          selected={mode === 'search'}
          icon="magnify"
          onPress={() => setMode('search')}
          style={{ backgroundColor: mode === 'search' ? theme.colors.success : theme.colors.secondary }}
          textStyle={{ color: mode === 'search' ? '#000' : theme.colors.text }}
        >
          Search by name
        </Chip>
      </View>

      {mode === 'browse' ? (
        <View>
          {/* Region chips */}
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 6 }}>ISC regional office</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {REGIONS.map((r) => (
              <Chip
                key={r.id}
                selected={browseRegion === r.id}
                onPress={() => setBrowseRegion(r.id)}
                style={{ backgroundColor: browseRegion === r.id ? theme.colors.accent : theme.colors.secondary }}
                textStyle={{ color: browseRegion === r.id ? '#000' : theme.colors.text, fontSize: 12 }}
              >
                {r.label}
              </Chip>
            ))}
          </View>

          {/* Inline filter */}
          <TextInput
            mode="outlined"
            label="Filter by name / band number / community"
            value={filter}
            onChangeText={setFilter}
            style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}
            textColor={theme.colors.text}
            outlineColor={theme.colors.defaultBorder}
            activeOutlineColor={theme.colors.success}
            placeholder="e.g. Skin Tyee, 729, Burns Lake"
          />

          {/* Meta + manual refresh */}
          {(() => {
            const totalReg = filteredBrowse.reduce((s, b) => s + (b.population || 0), 0);
            const fullReg = browseList.reduce((s, b) => s + (b.population || 0), 0);
            return (
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, flex: 1 }}>
                    {browseLoading
                      ? 'Fetching the ISC band registry CSV…'
                      : browseError
                        ? `⚠ ${browseError}`
                        : `${filteredBrowse.length} of ${browseList.length} Nation${browseList.length === 1 ? '' : 's'}${browseCached ? ` · 📦 cached ${browseFetchedAt ? new Date(browseFetchedAt).toLocaleString() : ''}` : ` · ✨ fresh ${browseFetchedAt ? new Date(browseFetchedAt).toLocaleString() : ''}`}`}
                  </Text>
                  <Button
                    mode="text"
                    compact
                    icon="refresh"
                    loading={browseLoading}
                    disabled={browseLoading}
                    textColor={theme.colors.primary}
                    onPress={() => void loadBrowse(true)}
                  >
                    {browseLoading ? 'Refreshing…' : 'Refresh list'}
                  </Button>
                </View>
                {!browseLoading && !browseError && totalReg > 0 ? (
                  <Text style={{ color: theme.colors.success, fontSize: 11, marginTop: 4 }}>
                    {filter.trim()
                      ? `Σ Registered population in filtered ${filteredBrowse.length} Nation${filteredBrowse.length === 1 ? '' : 's'}: ${totalReg.toLocaleString()} (of ${fullReg.toLocaleString()} region-wide)`
                      : `Σ Registered population across all ${browseList.length} Nations: ${fullReg.toLocaleString()}`}
                  </Text>
                ) : null}
              </View>
            );
          })()}

          {browseLoading && browseList.length === 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 16 }}>
              <ActivityIndicator size={14} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>loading band registry…</Text>
            </View>
          ) : null}

          {/* List + right-edge alphabet jumper */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              {filteredBrowse.map((b, i) => {
                const first = (b.name.match(/[A-Za-z]/)?.[0] ?? '').toUpperCase();
                // Tag the first band of each letter so the alphabet jumper
                // can scrollIntoView to it.
                const isFirstOfLetter = first && alphabet.byLetter[first] === `band-${b.bandNumber}`;
                return (
                  <Pressable
                    key={`${b.bandNumber}-${b.name}`}
                    // RN-web maps nativeID to id on the underlying DOM node.
                    nativeID={`band-${b.bandNumber}`}
                    onPress={() => navigation.navigate('NationDetail', { bandNumber: b.bandNumber })}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      marginBottom: 6,
                      backgroundColor: theme.colors.darkDefault,
                      borderColor: isFirstOfLetter ? theme.colors.success : theme.colors.defaultBorder,
                      borderLeftWidth: isFirstOfLetter ? 3 : 1,
                      borderWidth: 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{b.name}</Text>
                      <Text style={{ color: theme.colors.accent, fontSize: 11, fontFamily: 'Menlo, monospace' as any, marginLeft: 8 }}>
                        Band {b.bandNumber}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2 }}>
                      {b.community ? (
                        <Text style={{ color: theme.colors.textDarker, fontSize: 11, flex: 1 }} numberOfLines={1}>
                          {b.community}
                        </Text>
                      ) : <View style={{ flex: 1 }} />}
                      {typeof b.population === 'number' && b.population > 0 ? (
                        <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginLeft: 8 }}>
                          {b.population.toLocaleString()} registered
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {filteredBrowse.length > 0 ? (
                <Text style={{ color: theme.colors.textDarker, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
                  — end of list · {filteredBrowse.length} {filteredBrowse.length === 1 ? 'Nation' : 'Nations'} —
                </Text>
              ) : null}
            </View>

            {/* Vertical alphabet jumper — fixed-width column, web-only scroll target. */}
            {filteredBrowse.length > 0 ? (
              <View
                style={{
                  width: 22,
                  alignItems: 'center',
                  paddingVertical: 4,
                  ...({ position: 'sticky', top: 8, alignSelf: 'flex-start' } as any),
                }}
              >
                {alphabet.letters.map((L) => {
                  const has = alphabet.present.has(L);
                  return (
                    <Pressable
                      key={L}
                      onPress={() => has && jumpToLetter(L)}
                      disabled={!has}
                      style={{ paddingVertical: 1, paddingHorizontal: 4 }}
                    >
                      <Text
                        style={{
                          color: has ? theme.colors.primary : theme.colors.textDarker,
                          fontSize: 11,
                          fontWeight: has ? '700' : '400',
                          opacity: has ? 1 : 0.35,
                          fontFamily: 'Menlo, monospace' as any,
                        }}
                      >
                        {L}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {!browseLoading && filteredBrowse.length === 0 && browseList.length > 0 ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 8 }}>
              No bands match "{filter}".
            </Text>
          ) : null}
        </View>
      ) : (
        <View>
          <TextInput
            mode="outlined"
            label="Nation name (or partial — uses % matching)"
            value={target}
            onChangeText={setTarget}
            style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}
            textColor={theme.colors.text}
            outlineColor={theme.colors.defaultBorder}
            activeOutlineColor={theme.colors.success}
            placeholder="e.g. Skin Tyee, Lheidli, Tsleil-Waututh"
          />

          <View style={{ marginVertical: 12 }}>
            <Pressable
              onPress={() => setBcOnly(!bcOnly)}
              style={{
                alignSelf: 'flex-start',
                backgroundColor: bcOnly ? theme.colors.success : theme.colors.secondary,
                paddingVertical: 6,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 14,
                  height: 14,
                  marginRight: 8,
                  borderWidth: 1,
                  borderColor: bcOnly ? '#000' : theme.colors.textDarker,
                  backgroundColor: bcOnly ? '#000' : 'transparent',
                }}
              />
              <Text style={{ color: bcOnly ? '#000' : theme.colors.text, fontWeight: '600', fontSize: 13 }}>
                BC bands only
              </Text>
            </Pressable>
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 6 }}>
              Sets the ISC regional-office dropdown to British Columbia on the federal FN Profiles search. Toggle off to widen across Canada.
            </Text>
          </View>

          <Text style={{ color: theme.colors.text, fontSize: 14, marginVertical: 12 }}>Sources</Text>
          <SourcePicker sources={allSources} selected={selected} onToggle={toggle} onSelectAll={onSelectAll} />

          <Button
            mode="contained"
            buttonColor={theme.colors.success}
            textColor="#000"
            onPress={run}
            disabled={!canRun}
            style={{ marginTop: 18, alignSelf: 'flex-start' }}
          >
            Run lookup
          </Button>
        </View>
      )}
    </PageContainer>
  );
}
