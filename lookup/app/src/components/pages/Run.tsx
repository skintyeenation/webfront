import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Button } from 'react-native-paper';
import { PageContainer, ProgressList } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppDispatch, useAppSelector } from 'lookup/store';
import { eventReceived } from 'lookup/store/modules/lookup';
import { historyUpdated } from 'lookup/store/modules/history';
import { streamJob } from 'lookup/services/lookupApi';

export default function Run({ route, navigation }: any) {
  const dispatch = useAppDispatch();
  const jobId: string = route?.params?.jobId;
  const job = useAppSelector((s) => (jobId ? s.lookup.jobs[jobId] : undefined));
  const sources = useAppSelector((s) => s.sources.items);

  useEffect(() => {
    if (!jobId) return;
    const stop = streamJob(jobId, (e) => {
      dispatch(eventReceived({ jobId, event: e }));
      if (e.type === 'job-done') {
        dispatch(
          historyUpdated({
            jobId,
            startedAt: job?.options ? Date.now() - e.durationMs : Date.now(),
            mode: job?.options.mode ?? 'business',
            target: job?.options.target ?? '',
            indigenousOnly: !!job?.options.indigenousOnly,
            sourceCount: job?.options.sourceIds.length ?? 0,
            status: 'done',
            reportPath: e.reportPath,
          }),
        );
      }
    });
    return stop;
  }, [jobId, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) {
    return (
      <PageContainer>
        <Text style={{ color: theme.colors.textDarker }}>No active job.</Text>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Text style={{ color: theme.colors.primary, fontSize: 18, fontWeight: '700' }}>{job.options.target}</Text>
      <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 18 }}>
        {job.options.mode} · {job.options.sourceIds.length} sources · {job.options.indigenousOnly ? 'Indigenous-only' : 'all'}
      </Text>

      <ProgressList job={job} sources={sources} />

      {job.status === 'done' ? (
        <View style={{ marginTop: 18 }}>
          <Button
            mode="contained"
            buttonColor={theme.colors.success}
            textColor="#000"
            onPress={() => navigation.navigate('Results', { jobId })}
          >
            View results
          </Button>
        </View>
      ) : null}
    </PageContainer>
  );
}
