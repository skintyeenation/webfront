import React, { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { PageContainer, IndigenousChip, SourcePicker } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppDispatch, useAppSelector } from 'lookup/store';
import { loadSources } from 'lookup/store/modules/sources';
import { jobStarted } from 'lookup/store/modules/lookup';
import { historyPushed } from 'lookup/store/modules/history';
import { startRun } from 'lookup/services/lookupApi';

export default function BusinessLookup({ navigation }: any) {
  const dispatch = useAppDispatch();
  const allSources = useAppSelector((s) => s.sources.items.filter((x) => x.mode === 'business'));
  const defaults = useAppSelector((s) => s.sources.defaultsByMode['business'] ?? []);

  const [target, setTarget] = useState('');
  const [indigenousOnly, setIndigenousOnly] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    void dispatch(loadSources({ mode: 'business', indigenousOnly }));
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

  const canRun = target.trim().length > 0 && selected.size > 0;

  const run = async () => {
    const options = {
      mode: 'business' as const,
      target: target.trim(),
      sourceIds: [...selected],
      indigenousOnly,
      website: websiteUrl.trim() || undefined,
    };
    const { jobId } = await startRun(options);
    dispatch(jobStarted({ jobId, options }));
    dispatch(
      historyPushed({
        jobId,
        startedAt: Date.now(),
        mode: 'business',
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
      <Text style={{ color: theme.colors.primary, fontSize: 18, fontWeight: '700', marginBottom: 6 }}>Business lookup</Text>
      <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 16 }}>
        Search Canadian business registries, Indigenous-business directories and safety certifications by name.
      </Text>

      <TextInput
        mode="outlined"
        label="Company / org name"
        value={target}
        onChangeText={setTarget}
        style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}
        textColor={theme.colors.text}
        outlineColor={theme.colors.defaultBorder}
        activeOutlineColor={theme.colors.primary}
        placeholder="e.g. Birdco Industrial Resources Ltd"
      />

      <TextInput
        mode="outlined"
        label="Optional company website"
        value={websiteUrl}
        onChangeText={setWebsiteUrl}
        style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}
        textColor={theme.colors.text}
        outlineColor={theme.colors.defaultBorder}
        activeOutlineColor={theme.colors.primary}
        placeholder="https://…"
        autoCapitalize="none"
      />

      <View style={{ marginVertical: 12 }}>
        <IndigenousChip value={indigenousOnly} onChange={setIndigenousOnly} />
      </View>

      <Text style={{ color: theme.colors.text, fontSize: 14, marginVertical: 12 }}>Sources</Text>
      <SourcePicker sources={allSources} selected={selected} onToggle={toggle} onSelectAll={onSelectAll} />

      <Button
        mode="contained"
        buttonColor={theme.colors.primary}
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
