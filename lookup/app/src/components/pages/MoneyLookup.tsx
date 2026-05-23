import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { PageContainer, IndigenousChip, SourcePicker } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppDispatch, useAppSelector } from 'lookup/store';
import { loadSources } from 'lookup/store/modules/sources';
import { jobStarted } from 'lookup/store/modules/lookup';
import { historyPushed } from 'lookup/store/modules/history';
import { startRun } from 'lookup/services/lookupApi';

export default function MoneyLookup({ navigation }: any) {
  const dispatch = useAppDispatch();
  const allSources = useAppSelector((s) => s.sources.items.filter((x) => x.mode === 'money'));
  const defaults = useAppSelector((s) => s.sources.defaultsByMode['money'] ?? []);

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

  const canRun = keyword.trim().length > 0 && selected.size > 0;

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
      <Text style={{ color: theme.colors.accent, fontSize: 18, fontWeight: '700', marginBottom: 6 }}>Money lookup</Text>
      <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 16 }}>
        Disclosed federal + provincial contracts, grants, funding agreements and bid solicitations.
      </Text>

      <TextInput
        mode="outlined"
        label="Keyword"
        value={keyword}
        onChangeText={setKeyword}
        style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}
        textColor={theme.colors.text}
        outlineColor={theme.colors.defaultBorder}
        activeOutlineColor={theme.colors.accent}
        placeholder='e.g. "First Nation infrastructure"'
      />

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

      <Text style={{ color: theme.colors.text, fontSize: 14, marginVertical: 12 }}>Sources</Text>
      <SourcePicker sources={allSources} selected={selected} onToggle={toggle} onSelectAll={onSelectAll} />

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
