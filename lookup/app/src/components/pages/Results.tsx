import React, { useEffect, useState } from 'react';
import { View, Text, Linking, Pressable } from 'react-native';
import { Card, Chip } from 'react-native-paper';
import { PageContainer } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppSelector } from 'lookup/store';
import { getReportMarkdown } from 'lookup/services/lookupApi';

export default function Results({ route }: any) {
  const jobId: string = route?.params?.jobId;
  const job = useAppSelector((s) => (jobId ? s.lookup.jobs[jobId] : undefined));
  const sources = useAppSelector((s) => s.sources.items);
  const [report, setReport] = useState<string>('');

  useEffect(() => {
    if (jobId && job?.status === 'done') {
      getReportMarkdown(jobId).then(setReport).catch(() => {});
    }
  }, [jobId, job?.status]);

  if (!job) {
    return (
      <PageContainer>
        <Text style={{ color: theme.colors.textDarker }}>Job not found in memory — start a new lookup.</Text>
      </PageContainer>
    );
  }

  const byId = Object.fromEntries(sources.map((s) => [s.id, s]));

  return (
    <PageContainer>
      <Text style={{ color: theme.colors.primary, fontSize: 18, fontWeight: '700' }}>{job.options.target}</Text>
      <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 18 }}>
        {job.options.mode} · {job.options.sourceIds.length} sources · {job.options.indigenousOnly ? 'Indigenous-only' : 'all'}
      </Text>

      {job.options.sourceIds.map((sid) => {
        const meta = byId[sid];
        const st = job.perSource[sid];
        if (!meta) return null;
        return (
          <Card key={sid} style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Title
              title={meta.name}
              subtitle={
                meta.scrapable
                  ? `${st?.count ?? 0} items · ${st?.status ?? 'idle'}`
                  : `link only — open search ↗`
              }
              titleStyle={{ color: theme.colors.primary }}
              subtitleStyle={{ color: theme.colors.textDarker, fontSize: 12 }}
            />
            <Card.Content>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <Chip
                  compact
                  style={{ backgroundColor: theme.colors.secondary }}
                  textStyle={{ color: theme.colors.text, fontSize: 11 }}
                >
                  {meta.format}
                </Chip>
                <Chip
                  compact
                  style={{ backgroundColor: theme.colors.secondary }}
                  textStyle={{ color: theme.colors.text, fontSize: 11 }}
                >
                  {meta.category}
                </Chip>
                {meta.autoSelectOnIndigenous ? (
                  <Chip
                    compact
                    style={{ backgroundColor: theme.colors.secondary }}
                    textStyle={{ color: theme.colors.accent, fontSize: 11 }}
                  >
                    Indigenous
                  </Chip>
                ) : null}
              </View>
              {st?.searchUrl ? (
                <Pressable onPress={() => Linking.openURL(st.searchUrl!)}>
                  <Text style={{ color: theme.colors.primary, fontSize: 12, marginBottom: 4 }}>
                    Open search ↗
                  </Text>
                </Pressable>
              ) : null}
              {st?.status === 'error' ? (
                <Text style={{ color: theme.colors.error, fontSize: 12 }}>{st.error}</Text>
              ) : null}
            </Card.Content>
          </Card>
        );
      })}

      {report ? (
        <View style={{ marginTop: 18 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700', marginBottom: 8 }}>Full report (markdown)</Text>
          <View style={{ backgroundColor: theme.colors.darkDefault, padding: 12, borderColor: theme.colors.defaultBorder, borderWidth: 1 }}>
            <Text selectable style={{ color: theme.colors.text, fontFamily: 'Menlo, monospace' as any, fontSize: 11 }}>
              {report}
            </Text>
          </View>
        </View>
      ) : null}
    </PageContainer>
  );
}
