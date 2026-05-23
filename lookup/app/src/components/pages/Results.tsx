import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Linking, Pressable } from 'react-native';
import { Button, Card, Chip, Divider, IconButton, Modal, Portal } from 'react-native-paper';
import { PageContainer } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { useAppSelector } from 'lookup/store';
import { getJob, getReportMarkdown, type JobSourceResult } from 'lookup/services/lookupApi';

type SourceResultMap = Record<string, JobSourceResult | { error: string; searchUrl: string }>;

export default function Results({ route, navigation }: any) {
  const jobId: string = route?.params?.jobId;
  const job = useAppSelector((s) => (jobId ? s.lookup.jobs[jobId] : undefined));
  const sources = useAppSelector((s) => s.sources.items);
  const [results, setResults] = useState<SourceResultMap>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalSourceId, setModalSourceId] = useState<string | null>(null);
  const [reportMd, setReportMd] = useState<string>('');
  const [reportErr, setReportErr] = useState<string>('');
  const [showFullReport, setShowFullReport] = useState(false);

  // Fetch the full job result once the run is done.
  useEffect(() => {
    if (!jobId || job?.status !== 'done') return;
    getJob(jobId).then((state) => {
      if (state.result?.results) setResults(state.result.results);
    }).catch(() => {});
  }, [jobId, job?.status]);

  const byId = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s])), [sources]);

  if (!job) {
    return (
      <PageContainer>
        <Text style={{ color: theme.colors.textDarker }}>Job not found in memory — start a new lookup.</Text>
      </PageContainer>
    );
  }

  const toggle = (sid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const renderItems = (items: JobSourceResult['items'], compact: boolean) => {
    const list = compact ? items.slice(0, 6) : items;
    return (
      <View>
        {list.map((it, i) => (
          <View
            key={`${it.title}-${i}`}
            style={{
              paddingVertical: 8,
              borderTopColor: theme.colors.defaultBorder,
              borderTopWidth: i === 0 ? 0 : 1,
            }}
          >
            {it.url ? (
              <Pressable onPress={() => Linking.openURL(it.url!)}>
                <Text style={{ color: theme.colors.primary, fontWeight: '600' }} numberOfLines={2}>
                  {it.title}
                </Text>
              </Pressable>
            ) : (
              <Text style={{ color: theme.colors.text, fontWeight: '600' }} numberOfLines={2}>
                {it.title}
              </Text>
            )}
            {it.subtitle ? (
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>{it.subtitle}</Text>
            ) : null}
            {it.snippet ? (
              <Text style={{ color: theme.colors.text, fontSize: 12, marginTop: 4 }} numberOfLines={compact ? 2 : undefined}>
                {it.snippet}
              </Text>
            ) : null}
            {!compact && it.fields
              ? Object.entries(it.fields)
                  .filter(([, v]) => v !== '' && v !== undefined && v !== null)
                  .map(([k, v]) => (
                    <Text key={k} style={{ color: theme.colors.textDarker, fontSize: 11, fontFamily: 'Menlo, monospace' as any, marginTop: 2 }}>
                      {k}: {String(v)}
                    </Text>
                  ))
              : null}
          </View>
        ))}
        {compact && items.length > 6 ? (
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 6 }}>
            +{items.length - 6} more — tap "Open" to see all.
          </Text>
        ) : null}
      </View>
    );
  };

  const modalSource = modalSourceId ? byId[modalSourceId] : null;
  const modalRes = modalSourceId ? results[modalSourceId] : null;

  return (
    <PageContainer>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.primary, fontSize: 18, fontWeight: '700' }}>{job.options.target}</Text>
          <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 18 }}>
            {job.options.mode} · {job.options.sourceIds.length} sources · {job.options.indigenousOnly ? 'Indigenous-only' : 'all'}
          </Text>
        </View>
        <Button
          mode="contained"
          icon="magnify-plus-outline"
          buttonColor={theme.colors.primary}
          textColor="#000"
          compact
          onPress={() =>
            navigation?.navigate?.(job.options.mode === 'business' ? 'Business' : 'Money')
          }
        >
          New search
        </Button>
      </View>

      {job.options.sourceIds.map((sid) => {
        const meta = byId[sid];
        const st = job.perSource[sid];
        const result = results[sid];
        if (!meta) return null;
        const hasError = result && 'error' in result;
        const items = !hasError ? (result as JobSourceResult | undefined)?.items ?? [] : [];
        const warnings = !hasError ? (result as JobSourceResult | undefined)?.warnings ?? [] : [];
        const isExpanded = expanded.has(sid);
        const subtitleText = hasError
          ? `error · ${(result as any).error}`
          : meta.scrapable
            ? `${items.length || st?.count || 0} items · ${st?.status ?? 'idle'}`
            : 'link only — open search ↗';

        return (
          <Card key={sid} style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Title
              title={meta.name}
              subtitle={subtitleText}
              titleStyle={{ color: theme.colors.primary }}
              subtitleStyle={{ color: theme.colors.textDarker, fontSize: 12 }}
              right={(props) =>
                items.length > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                    <Button
                      mode="contained"
                      buttonColor={theme.colors.accent}
                      textColor="#000"
                      compact
                      icon="file-document-outline"
                      onPress={() => setModalSourceId(sid)}
                    >
                      View report
                    </Button>
                    <IconButton
                      {...props}
                      icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                      iconColor={theme.colors.primary}
                      onPress={() => toggle(sid)}
                      accessibilityLabel={isExpanded ? 'Collapse' : 'Expand'}
                    />
                  </View>
                ) : null
              }
            />
            <Card.Content>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 11 }}>
                  {meta.format}
                </Chip>
                <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 11 }}>
                  {meta.category}
                </Chip>
                {meta.autoSelectOnIndigenous ? (
                  <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.accent, fontSize: 11 }}>
                    Indigenous
                  </Chip>
                ) : null}
                {meta.requiresAuth ? (
                  <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.error, fontSize: 11 }}>
                    {String(meta.requiresAuth)}
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

              {warnings.map((w, i) => (
                <Text key={i} style={{ color: theme.colors.accent, fontSize: 12, marginTop: 2 }}>
                  ⚠ {w}
                </Text>
              ))}

              {isExpanded && items.length > 0 ? (
                <View style={{ marginTop: 8 }}>{renderItems(items, true)}</View>
              ) : null}
            </Card.Content>
          </Card>
        );
      })}

      {/* Full-result modal */}
      <Portal>
        <Modal
          visible={!!modalSourceId}
          onDismiss={() => setModalSourceId(null)}
          contentContainerStyle={{
            backgroundColor: theme.colors.darkDefault,
            margin: 24,
            padding: 16,
            maxHeight: '85%',
            borderColor: theme.colors.defaultBorder,
            borderWidth: 1,
          }}
        >
          {modalSource && modalRes && !('error' in modalRes) ? (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.primary, fontSize: 18, fontWeight: '700' }}>{modalSource.name}</Text>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 2 }}>
                    {modalSource.category} · {modalSource.format} · {modalRes.items.length} items
                  </Text>
                </View>
                <IconButton icon="close" iconColor={theme.colors.textDarker} onPress={() => setModalSourceId(null)} />
              </View>
              <Pressable onPress={() => Linking.openURL(modalRes.searchUrl)}>
                <Text style={{ color: theme.colors.primary, fontSize: 12, marginBottom: 8 }}>Open live search ↗</Text>
              </Pressable>
              <Divider style={{ backgroundColor: theme.colors.defaultBorder, marginBottom: 8 }} />
              {/* RN-web auto-scrolls; max-height keeps it contained. */}
              <View style={{ maxHeight: 500, overflow: 'scroll' as any }}>
                {modalRes.items.map((it, i) => (
                  <View
                    key={`${it.title}-${i}`}
                    style={{ paddingVertical: 10, borderTopColor: theme.colors.defaultBorder, borderTopWidth: i === 0 ? 0 : 1 }}
                  >
                    {it.url ? (
                      <Pressable onPress={() => Linking.openURL(it.url!)}>
                        <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 14 }}>{it.title}</Text>
                      </Pressable>
                    ) : (
                      <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>{it.title}</Text>
                    )}
                    {it.subtitle ? (
                      <Text style={{ color: theme.colors.accent, fontSize: 12, marginTop: 2 }}>{it.subtitle}</Text>
                    ) : null}
                    {it.snippet ? (
                      <Text style={{ color: theme.colors.text, fontSize: 12, marginTop: 4 }}>{it.snippet}</Text>
                    ) : null}
                    {it.fields && Object.keys(it.fields).length > 0 ? (
                      <View
                        style={{
                          marginTop: 8,
                          padding: 8,
                          backgroundColor: theme.colors.background,
                          borderColor: theme.colors.defaultBorder,
                          borderWidth: 1,
                        }}
                      >
                        {Object.entries(it.fields)
                          .filter(([, v]) => v !== '' && v !== undefined && v !== null)
                          .map(([k, v]) => (
                            <View key={k} style={{ flexDirection: 'row', paddingVertical: 2 }}>
                              <Text style={{ color: theme.colors.textDarker, fontSize: 11, width: 140, fontFamily: 'Menlo, monospace' as any }}>
                                {k}
                              </Text>
                              <Text
                                selectable
                                style={{ color: theme.colors.text, fontSize: 12, flex: 1, fontFamily: 'Menlo, monospace' as any }}
                              >
                                {String(v)}
                              </Text>
                            </View>
                          ))}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </Modal>
      </Portal>

      {/* Full markdown report toggle */}
      <View style={{ marginTop: 18 }}>
        <Button
          mode={showFullReport ? 'outlined' : 'contained'}
          onPress={async () => {
            if (!reportMd) {
              try {
                const md = await getReportMarkdown(jobId);
                setReportMd(md);
                setReportErr('');
              } catch (e) {
                setReportErr((e as Error).message || 'Failed to fetch report');
              }
            }
            setShowFullReport((v) => !v);
          }}
          textColor={showFullReport ? theme.colors.textDarker : '#000'}
          buttonColor={showFullReport ? undefined : theme.colors.secondary}
        >
          {showFullReport ? 'Hide full markdown report' : 'Show full markdown report'}
        </Button>
      </View>
      {reportErr ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: theme.colors.error, fontSize: 12 }}>⚠ {reportErr}</Text>
        </View>
      ) : null}
      {showFullReport && reportMd ? (
        <View style={{ backgroundColor: theme.colors.darkDefault, padding: 12, borderColor: theme.colors.defaultBorder, borderWidth: 1, marginTop: 8 }}>
          <Text selectable style={{ color: theme.colors.text, fontFamily: 'Menlo, monospace' as any, fontSize: 11 }}>
            {reportMd}
          </Text>
        </View>
      ) : null}
    </PageContainer>
  );
}
