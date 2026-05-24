import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { PageContainer, IndigenousChip, SourcePicker } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppDispatch, useAppSelector } from 'lookup/store';
import { loadSources } from 'lookup/store/modules/sources';
import { jobStarted } from 'lookup/store/modules/lookup';
import { historyPushed } from 'lookup/store/modules/history';
import { startRun } from 'lookup/services/lookupApi';
import { sourceInMode, type SourceMeta } from 'lookup/models';

/**
 * The Funding tab covers three semantically distinct kinds of data:
 *
 *   - **Contracts & bids** — open procurement opportunities and historical
 *     contract awards (CanadaBuys tenders/awards, MERX, BC Bid, BC Ministry
 *     contract awards, Open Canada Contracts).
 *   - **Grants & funding** — open grant programs accepting applications and
 *     historical grant/transfer payouts (available-grants, ISC/CIRNAC, NACCA,
 *     FPCC, Open Canada Grants, BC CRF Government Transfers).
 *   - **Reference / catalogues** — cross-cutting open-data catalogues and
 *     public-company filings (Open Canada CKAN, BC Open Data CKAN, SEDAR+).
 *
 * Each source belongs to exactly one of those; we classify by the prefix
 * baked into its `category` string.
 */
type Subtab = 'contracts' | 'grants' | 'reference';

const SUBTAB_DEFS: Array<{ id: Subtab; label: string }> = [
  { id: 'contracts', label: 'Contracts & bids' },
  { id: 'grants', label: 'Grants & funding' },
  { id: 'reference', label: 'Reference' },
];

function subtabOf(s: SourceMeta): Subtab {
  const c = s.category;
  if (/^Reference/i.test(c)) return 'reference';
  if (/grant|transfer/i.test(c)) return 'grants';
  // Everything else lives under "Open opportunities — Federal/Provincial bids"
  // or "Historical disclosures — *contracts*" — both belong to contracts & bids.
  return 'contracts';
}

export default function MoneyLookup({ navigation }: any) {
  const dispatch = useAppDispatch();
  const allSources = useAppSelector((s) => s.sources.items.filter((x) => sourceInMode(x, 'money')));
  const defaults = useAppSelector((s) => s.sources.defaultsByMode['money'] ?? []);
  const [subtab, setSubtab] = useState<Subtab>('contracts');

  // Sources grouped by subtab — built once per allSources change. Used both to
  // render counts on each chip and to filter what the SourcePicker sees.
  const sourcesBySubtab = useMemo(() => {
    const out: Record<Subtab, SourceMeta[]> = { contracts: [], grants: [], reference: [] };
    for (const s of allSources) out[subtabOf(s)].push(s);
    return out;
  }, [allSources]);
  const visibleSources = sourcesBySubtab[subtab];

  const [keyword, setKeyword] = useState('');
  const [vendor, setVendor] = useState('');
  const [fromYear, setFromYear] = useState('');
  const [minValue, setMinValue] = useState('');
  const [indigenousOnly, setIndigenousOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    void dispatch(loadSources({ mode: 'money', indigenousOnly }));
  }, [dispatch, indigenousOnly]);

  useEffect(() => {
    setSelected(new Set(defaults));
  }, [defaults.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Funding sources all handle an empty keyword gracefully — they return their
  // default browse view (latest tenders, all available grant programs, recent
  // high-dollar transfers, etc.). So Run is gated only by source selection.
  const canRun = selected.size > 0;

  const run = async () => {
    const options = {
      mode: 'money' as const,
      target: keyword.trim(),
      sourceIds: [...selected],
      indigenousOnly,
      vendor: vendor.trim() || undefined,
      fromYear: fromYear ? Number(fromYear) : undefined,
      minValue: minValue ? Number(minValue) : undefined,
    };
    const { jobId } = await startRun(options);
    dispatch(jobStarted({ jobId, options }));
    dispatch(
      historyPushed({
        jobId,
        startedAt: Date.now(),
        mode: 'money',
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
      <Text style={{ color: theme.colors.accent, fontSize: 18, fontWeight: '700', marginBottom: 6 }}>Funding lookup</Text>
      <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 12 }}>
        Federal + provincial contracts, grants, funding programs and bid solicitations.
      </Text>

      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {SUBTAB_DEFS.map((def) => {
          const list = sourcesBySubtab[def.id];
          const selectedInTab = list.filter((s) => selected.has(s.id)).length;
          const active = subtab === def.id;
          return (
            <Pressable
              key={def.id}
              onPress={() => setSubtab(def.id)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 18,
                backgroundColor: active ? theme.colors.accent : theme.colors.darkDefault,
                borderColor: active ? theme.colors.accent : theme.colors.defaultBorder,
                borderWidth: 1,
              }}
            >
              <Text
                style={{
                  color: active ? '#000' : theme.colors.text,
                  fontWeight: '600',
                  fontSize: 13,
                }}
              >
                {def.label}{' '}
                <Text style={{ color: active ? '#000' : theme.colors.textDarker, fontWeight: '400' }}>
                  ({selectedInTab}/{list.length})
                </Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        mode="outlined"
        label="Keyword (optional)"
        value={keyword}
        onChangeText={setKeyword}
        style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 4 }}
        textColor={theme.colors.text}
        outlineColor={theme.colors.defaultBorder}
        activeOutlineColor={theme.colors.accent}
        placeholder='e.g. "First Nation infrastructure" — leave blank to browse'
      />
      <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 12, marginLeft: 4 }}>
        {keyword.trim()
          ? `Searching for "${keyword.trim()}"`
          : 'Leave blank to browse the default view of each source (latest tenders, all available grant programs, top transfers).'}
      </Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          mode="outlined"
          label="Vendor / recipient (optional)"
          value={vendor}
          onChangeText={setVendor}
          style={{ flex: 2, backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}
          textColor={theme.colors.text}
          outlineColor={theme.colors.defaultBorder}
          activeOutlineColor={theme.colors.accent}
        />
        <TextInput
          mode="outlined"
          label="From year"
          value={fromYear}
          onChangeText={setFromYear}
          style={{ flex: 1, backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}
          textColor={theme.colors.text}
          keyboardType="numeric"
          outlineColor={theme.colors.defaultBorder}
          activeOutlineColor={theme.colors.accent}
        />
        <TextInput
          mode="outlined"
          label="Min value (CAD)"
          value={minValue}
          onChangeText={setMinValue}
          style={{ flex: 1, backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}
          textColor={theme.colors.text}
          keyboardType="numeric"
          outlineColor={theme.colors.defaultBorder}
          activeOutlineColor={theme.colors.accent}
        />
      </View>

      <View style={{ marginVertical: 12 }}>
        <IndigenousChip value={indigenousOnly} onChange={setIndigenousOnly} />
      </View>

      <Text style={{ color: theme.colors.text, fontSize: 14, marginVertical: 12 }}>
        Sources <Text style={{ color: theme.colors.textDarker, fontWeight: '400' }}>
          — {SUBTAB_DEFS.find((d) => d.id === subtab)?.label}
        </Text>
      </Text>
      <SourcePicker sources={visibleSources} selected={selected} onToggle={toggle} onSelectAll={onSelectAll} />

      <Button
        mode="contained"
        buttonColor={theme.colors.accent}
        textColor="#000"
        onPress={run}
        disabled={!canRun}
        style={{ marginTop: 18, alignSelf: 'flex-start' }}
      >
        Run lookup
      </Button>
    </PageContainer>
  );
}
