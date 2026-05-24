import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ActivityIndicator, Card, Divider } from 'react-native-paper';
import { PageContainer } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppSelector } from 'lookup/store';
import { getQueueSnapshot, type QueueSnapshot } from 'lookup/services/lookupApi';

/**
 * Average wall-clock per OCR job — used for ETA estimation. The worker
 * pauses 65s between successful claims to stay under Anthropic's 30k
 * tokens/minute window, and a single multi-page scanned PDF takes
 * ~15–25s to process. Round to ~80s/job.
 */
const AVG_JOB_SECONDS = 80;

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function History({ navigation }: any) {
  const entries = useAppSelector((s) => s.history.entries);
  const [queue, setQueue] = useState<QueueSnapshot | undefined>();
  const [queueError, setQueueError] = useState<string | undefined>();

  // Poll the worker queue every 5s while this screen is mounted.
  useEffect(() => {
    let cancelled = false;
    const fetchQueue = () => {
      getQueueSnapshot()
        .then((q) => {
          if (!cancelled) setQueue(q);
          if (!cancelled) setQueueError(undefined);
        })
        .catch((e) => {
          if (!cancelled) setQueueError((e as Error).message);
        });
    };
    fetchQueue();
    const t = setInterval(fetchQueue, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Compute progress + ETA.
  const totals = queue?.counts;
  const pending = totals?.pending ?? 0;
  const running = totals?.running ?? 0;
  const done = totals?.done ?? 0;
  const failed = totals?.failed ?? 0;
  const totalAll = pending + running + done + failed;
  const processed = done + failed;
  const etaSec = (pending + running) * AVG_JOB_SECONDS;
  const pctDone = totalAll ? (processed / totalAll) * 100 : 0;
  const runningItems = (queue?.items ?? []).filter((j) => j.status === 'running');
  const recentDone = (queue?.items ?? [])
    .filter((j) => j.status === 'done')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 5);

  return (
    <PageContainer>
      <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>History</Text>

      {/* ── Worker progress ─────────────────────────────────────────────── */}
      <Text style={{ color: theme.colors.success, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>
        Background OCR worker
      </Text>
      <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 8 }}>
        Federal Schedule-of-Federal-Funding PDFs are OCR'd through Claude with a ~65s gap between jobs to stay under Anthropic's tier-1 rate limit. Cached forever once extracted.
      </Text>

      {queueError ? (
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
          <Card.Content>
            <Text style={{ color: theme.colors.error, fontSize: 12 }}>
              ⚠ Couldn't reach the worker queue: {queueError}
            </Text>
          </Card.Content>
        </Card>
      ) : !queue ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <ActivityIndicator size={14} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>polling queue…</Text>
        </View>
      ) : (
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
                {processed} of {totalAll} jobs processed
              </Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                {pending + running > 0 ? `ETA ~${fmtDuration(etaSec)}` : 'idle'}
              </Text>
            </View>
            {/* Progress bar */}
            <View style={{ height: 8, backgroundColor: theme.colors.secondary, marginBottom: 10 }}>
              <View style={{ width: `${pctDone}%`, height: '100%', backgroundColor: theme.colors.success }} />
            </View>

            {/* Counter strip */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <Text style={{ color: theme.colors.accent, fontSize: 12 }}>⚙ running: {running}</Text>
              <Text style={{ color: theme.colors.primary, fontSize: 12 }}>⏳ pending: {pending}</Text>
              <Text style={{ color: theme.colors.success, fontSize: 12 }}>✔ done: {done}</Text>
              <Text style={{ color: theme.colors.error, fontSize: 12 }}>✖ failed: {failed}</Text>
            </View>

            {/* Currently-running detail */}
            {runningItems.length > 0 ? (
              <View style={{ marginTop: 10, paddingTop: 8, borderTopColor: theme.colors.defaultBorder, borderTopWidth: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
                  Currently running
                </Text>
                {runningItems.map((j) => (
                  <View key={j.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
                    <Text style={{ color: theme.colors.accent, fontSize: 11, width: 22 }}>⚙</Text>
                    <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1, fontFamily: 'Menlo, monospace' as any }}>
                      {j.key}
                    </Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                      attempt {j.attempts}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Recently completed */}
            {recentDone.length > 0 ? (
              <View style={{ marginTop: 10, paddingTop: 8, borderTopColor: theme.colors.defaultBorder, borderTopWidth: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
                  Recently completed
                </Text>
                {recentDone.map((j) => (
                  <View key={j.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
                    <Text style={{ color: theme.colors.success, fontSize: 11, width: 22 }}>✔</Text>
                    <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1, fontFamily: 'Menlo, monospace' as any }}>
                      {j.key}
                    </Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                      {j.completedAt ? new Date(j.completedAt).toLocaleTimeString() : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card.Content>
        </Card>
      )}

      <Divider style={{ backgroundColor: theme.colors.defaultBorder, marginVertical: 12 }} />

      {/* ── Lookup history ──────────────────────────────────────────────── */}
      <Text style={{ color: theme.colors.primary, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>
        Lookup history
      </Text>
      {entries.length === 0 ? (
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
          No runs yet. Past lookups will appear here.
        </Text>
      ) : (
        entries.map((h) => (
          <Card
            key={h.jobId}
            style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 10 }}
            onPress={() => navigation.navigate('Results', { jobId: h.jobId })}
          >
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{h.target}</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                  {new Date(h.startedAt).toLocaleString()}
                </Text>
              </View>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 4 }}>
                {h.mode} · {h.sourceCount} sources · {h.indigenousOnly ? 'Indigenous-only' : 'all'} · {h.status}
              </Text>
            </Card.Content>
          </Card>
        ))
      )}
    </PageContainer>
  );
}
