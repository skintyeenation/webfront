import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { PageContainer, SourcePicker } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppDispatch, useAppSelector } from 'lookup/store';
import { loadSources } from 'lookup/store/modules/sources';
import { jobStarted } from 'lookup/store/modules/lookup';
import { historyPushed } from 'lookup/store/modules/history';
import { startRun } from 'lookup/services/lookupApi';

/**
 * Nations lookup. Mirrors BusinessLookup but searches the FN-specific
 * sources (ISC First Nation Profiles, FN Financial Management Board, …).
 * A Nation isn't a business, so we keep this surface separate.
 */
export default function NationsLookup({ navigation }: any) {
  const dispatch = useAppDispatch();
  const allSources = useAppSelector((s) => s.sources.items.filter((x) => x.mode === 'nations'));
  const defaults = useAppSelector((s) => s.sources.defaultsByMode['nations'] ?? []);

  const [target, setTarget] = useState('');
  // BC bands only by default — Skin Tyee + the most common stakeholder set.
  // Toggle off to widen to all of Canada.
  const [bcOnly, setBcOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // All Nations sources are inherently Indigenous — the toggle on the other
  // tabs is irrelevant here, so we lock it on and never expose it.
  const indigenousOnly = true;

  useEffect(() => {
    void dispatch(loadSources({ mode: 'nations', indigenousOnly: true }));
  }, [dispatch]);

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

  const canRun = target.trim().length > 0 && selected.size > 0;

  const run = async () => {
    const options = {
      mode: 'nations' as const,
      target: target.trim(),
      sourceIds: [...selected],
      indigenousOnly,
      // ISC regional office id 9 = BRITISH COLUMBIA. Only fn-profiles uses it.
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
      <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 16 }}>
        Search Indigenous Nations registered in Canada — band number, governance, address, FMA certification.
      </Text>

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
    </PageContainer>
  );
}
