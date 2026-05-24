import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Divider, IconButton } from 'react-native-paper';
import { PageContainer, ReserveMap } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { getNationDetail, retryFundingOcr, type BandDetail } from 'lookup/services/lookupApi';

type Tab = 'general' | 'governance' | 'reserves' | 'population' | 'funds' | 'fnfta';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'general', label: 'General', icon: 'card-account-details-outline' },
  { id: 'governance', label: 'Governance', icon: 'gavel' },
  { id: 'reserves', label: 'Reserves', icon: 'map-marker-outline' },
  { id: 'population', label: 'Population', icon: 'account-group-outline' },
  { id: 'funds', label: 'Federal funding', icon: 'cash-multiple' },
  { id: 'fnfta', label: 'FNFTA', icon: 'file-document-outline' },
];

const CHART_COLORS = ['#00B8EC', '#EC6A37', '#9ECD3B', '#7C5CFA', '#F2C94C', '#A4A4A4'];

interface PieSlicesProps {
  slices: Array<{ label: string; value: number; color: string }>;
  size?: number;
  /** Render values as CAD currency rather than a bare integer. */
  formatCurrency?: boolean;
}
function PieSlices({ slices, size = 180, formatCurrency }: PieSlicesProps) {
  const fmtV = (n: number) =>
    formatCurrency ? `$${n.toLocaleString()}` : n.toLocaleString();
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <Text style={{ color: theme.colors.textDarker }}>No data.</Text>;
  if (Platform.OS === 'web') {
    let cursor = 0;
    const stops = slices
      .map((s) => {
        const start = (cursor / total) * 360;
        cursor += s.value;
        const end = (cursor / total) * 360;
        return `${s.color} ${start}deg ${end}deg`;
      })
      .join(', ');
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            // Web-only CSS shorthand for conic-gradient — RN ViewStyle
            // doesn't know about it, hence the cast.
            ...({ backgroundImage: `conic-gradient(${stops})` } as any),
          }}
        />
        <View style={{ flex: 1, minWidth: 200 }}>
          {slices.map((s) => (
            <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
              <View style={{ width: 12, height: 12, marginRight: 8, backgroundColor: s.color }} />
              <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1 }} numberOfLines={1}>
                {s.label}
              </Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginLeft: 8 }}>
                {fmtV(s.value)} ({((s.value / total) * 100).toFixed(0)}%)
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }
  // Native fallback — donut as text + legend (RN-svg path build is heavier).
  return (
    <View>
      {slices.map((s) => (
        <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
          <View style={{ width: 12, height: 12, marginRight: 8, backgroundColor: s.color }} />
          <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1 }}>{s.label}</Text>
          <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
            {fmtV(s.value)} ({((s.value / total) * 100).toFixed(0)}%)
          </Text>
        </View>
      ))}
    </View>
  );
}

function HorizontalBars({ rows, max }: { rows: Array<{ label: string; value: number; color?: string }>; max?: number }) {
  const m = max ?? rows.reduce((s, r) => Math.max(s, r.value), 0);
  return (
    <View>
      {rows.map((r, i) => (
        <View key={r.label} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.text, fontSize: 12 }} numberOfLines={1}>
              {r.label}
            </Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{r.value}</Text>
          </View>
          <View style={{ height: 8, backgroundColor: theme.colors.secondary, marginTop: 4 }}>
            <View
              style={{
                width: m ? `${(r.value / m) * 100}%` : 0,
                height: '100%',
                backgroundColor: r.color || CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 4, borderBottomColor: theme.colors.defaultBorder, borderBottomWidth: 1 }}>
      <Text style={{ color: theme.colors.textDarker, fontSize: 13, width: 130 }}>{label}</Text>
      <Text selectable style={{ color: theme.colors.text, fontSize: 13, flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}

export default function NationDetail({ route, navigation }: any) {
  const bandNumber: string = String(route?.params?.bandNumber || '');
  const [tab, setTab] = useState<Tab>('general');
  const [detail, setDetail] = useState<BandDetail | undefined>();
  // Two separate flags so the spinner state on the refresh button is correct
  // independently of the first-load skeleton.
  const [loading, setLoading] = useState(false);   // initial first-fetch
  const [refreshing, setRefreshing] = useState(false); // user-triggered refresh
  const [error, setError] = useState<string | undefined>();

  const load = async (refresh = false) => {
    if (!bandNumber) return;
    if (refresh) setRefreshing(true);
    else if (!detail) setLoading(true);
    setError(undefined);
    try {
      const d = await getNationDetail(bandNumber, refresh);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Stale-while-revalidate: on mount we always pull the cached row first
  // (instant if the JSON store has it; ~10s puppeteer scrape if not). The
  // refresh button + the polling loop below both kick a server-side
  // ?refresh=1 which re-runs every section without blocking the cached
  // copy currently being displayed.
  useEffect(() => {
    void load(false);
  }, [bandNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // While any PDF OCR is pending / running in the background worker, poll
  // the band-detail endpoint every 15s so the chart populates without a
  // manual refresh.
  useEffect(() => {
    if (!detail?.funds?.extracted) return;
    const pending = detail.funds.extracted.some(
      (e) => e.extractStatus === 'pending' || e.extractStatus === 'running',
    );
    if (!pending) return;
    const t = setInterval(() => void load(false), 15000);
    return () => clearInterval(t);
  }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = detail?.general?.officialName || `Band ${bandNumber}`;
  const populationSlices = useMemo(() => {
    if (!detail?.population) return [];
    const s = detail.population.summary;
    return [
      { label: 'On Own Reserve', value: s.onReserve, color: CHART_COLORS[0] },
      { label: 'On Other Reserve', value: s.onOtherReserve, color: CHART_COLORS[2] },
      { label: 'On Crown Land', value: s.onCrownLand, color: CHART_COLORS[3] },
      { label: 'Off Reserve', value: s.offReserve, color: CHART_COLORS[1] },
    ].filter((x) => x.value > 0);
  }, [detail]);

  const genderSlices = useMemo(() => {
    if (!detail?.population) return [];
    const s = detail.population.summary;
    return [
      { label: 'Male', value: s.male, color: CHART_COLORS[0] },
      { label: 'Female', value: s.female, color: CHART_COLORS[1] },
    ].filter((x) => x.value > 0);
  }, [detail]);

  return (
    <PageContainer>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.success, fontSize: 20, fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
            Band {bandNumber}
            {detail?.general?.address ? ` · ${detail.general.address}` : ''}
            {detail?.fetchedAt
              ? ` · ${detail.cached ? '📦 cached' : '✨ fresh'} ${new Date(detail.fetchedAt).toLocaleString()}`
              : ''}
            {detail?.stale ? ' · stale (last scrape failed)' : ''}
          </Text>
        </View>
        <Button
          mode={refreshing ? 'outlined' : 'contained-tonal'}
          icon={refreshing ? undefined : 'refresh'}
          buttonColor={refreshing ? undefined : theme.colors.secondary}
          textColor={theme.colors.primary}
          loading={refreshing}
          disabled={refreshing || loading}
          onPress={() => void load(true)}
          compact
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </View>
      {refreshing ? (
        <Text style={{ color: theme.colors.primary, fontSize: 11, marginBottom: 8 }}>
          Re-scraping every section (FN Profiles sub-pages + reserve geometry + federal grants + funding PDFs). Takes ~10–20s. The currently displayed data stays in place until the refresh completes.
        </Text>
      ) : null}

      {/* Tabs */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {TABS.map((t) => (
          <Chip
            key={t.id}
            icon={t.icon}
            selected={tab === t.id}
            onPress={() => setTab(t.id)}
            style={{
              backgroundColor: tab === t.id ? theme.colors.success : theme.colors.secondary,
            }}
            textStyle={{ color: tab === t.id ? '#000' : theme.colors.text, fontSize: 12 }}
          >
            {t.label}
          </Chip>
        ))}
      </View>

      {error ? <Text style={{ color: theme.colors.error, fontSize: 12, marginBottom: 8 }}>⚠ {error}</Text> : null}
      {loading && !detail ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size={14} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>fetching detail…</Text>
        </View>
      ) : null}
      {detail?.warning ? (
        <Text style={{ color: theme.colors.accent, fontSize: 12, marginBottom: 8 }}>⚠ {detail.warning}</Text>
      ) : null}

      {tab === 'general' && detail?.general ? (
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Content>
            <Field label="Official Name" value={detail.general.officialName} />
            <Field label="Number" value={bandNumber} />
            <Field label="Address" value={detail.general.address} />
            <Field label="Postal code" value={detail.general.postalCode} />
            <Field label="Phone" value={detail.general.phone} />
            <Field label="Fax" value={detail.general.fax} />
          </Card.Content>
        </Card>
      ) : null}

      {tab === 'governance' ? (
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Title title="Governance" titleStyle={{ color: theme.colors.primary }} />
          <Card.Content>
            {(detail?.governance?.rows ?? []).length === 0 ? (
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                No governance rows extracted. Open the live page for the source.
              </Text>
            ) : (
              (detail?.governance?.rows ?? []).map((r, i) => (
                <View key={`${r.name}-${i}`} style={{ paddingVertical: 4, borderBottomColor: theme.colors.defaultBorder, borderBottomWidth: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13 }}>{r.name}</Text>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                    {[r.role, r.term].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              ))
            )}
          </Card.Content>
        </Card>
      ) : null}

      {tab === 'reserves' ? (
        <View>
          {/* Map first — visual context before the legal descriptions. */}
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Title
              title="Reserve territory"
              subtitle={
                detail?.geo
                  ? `${detail.geo.features.length} reserve${detail.geo.features.length === 1 ? '' : 's'} plotted from the federal NRCan CLSS Aboriginal Lands layer`
                  : 'Fetching reserve geometry…'
              }
              titleStyle={{ color: theme.colors.success }}
              subtitleStyle={{ color: theme.colors.textDarker, fontSize: 12 }}
            />
            <Card.Content>
              {detail?.geo?.warnings?.map((w, i) => (
                <Text key={i} style={{ color: theme.colors.accent, fontSize: 12, marginBottom: 4 }}>⚠ {w}</Text>
              ))}
              {detail?.geo && detail.geo.features.length > 0 ? (
                <ReserveMap features={detail.geo.features as any} bbox={detail.geo.bbox} height={360} />
              ) : detail?.geo ? (
                <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                  No reserve polygons matched on the federal CLSS Aboriginal Lands layer for this Nation.
                </Text>
              ) : null}
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 8 }}>
                Polygons sourced from NRCan CLSS Administrative Boundaries; tiles © OpenStreetMap contributors.
              </Text>
            </Card.Content>
          </Card>

          <Card style={{ backgroundColor: theme.colors.darkDefault }}>
            <Card.Title title="Reserve list" titleStyle={{ color: theme.colors.primary }} />
            <Card.Content>
              {(detail?.reserves?.rows ?? []).length === 0 ? (
                <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>No reserve rows extracted.</Text>
              ) : (
                (detail?.reserves?.rows ?? []).map((r, i) => (
                  <View key={`${r.name}-${i}`} style={{ paddingVertical: 6, borderBottomColor: theme.colors.defaultBorder, borderBottomWidth: 1 }}>
                    {r.url ? (
                      <Pressable onPress={() => Linking.openURL(r.url!)}>
                        <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '600' }}>{r.name} ↗</Text>
                      </Pressable>
                    ) : (
                      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>{r.name}</Text>
                    )}
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                      {[r.size && `${r.size} ha`, r.community].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))
              )}
            </Card.Content>
          </Card>
        </View>
      ) : null}

      {tab === 'population' && detail?.population ? (
        <View>
          <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
            <Card.Title
              title={`Registered population — ${detail.population.total}`}
              subtitle={detail.population.asOf ? `as of ${detail.population.asOf}` : undefined}
              titleStyle={{ color: theme.colors.success }}
              subtitleStyle={{ color: theme.colors.textDarker, fontSize: 12 }}
            />
            <Card.Content>
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
                Residency
              </Text>
              <PieSlices slices={populationSlices} />
              <Divider style={{ backgroundColor: theme.colors.defaultBorder, marginVertical: 16 }} />
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
                By gender
              </Text>
              <PieSlices slices={genderSlices} size={140} />
            </Card.Content>
          </Card>
          <Card style={{ backgroundColor: theme.colors.darkDefault }}>
            <Card.Title title="Full breakdown" titleStyle={{ color: theme.colors.primary }} />
            <Card.Content>
              <HorizontalBars rows={detail.population.rows.map((r) => ({ label: r.label, value: r.count }))} />
            </Card.Content>
          </Card>
        </View>
      ) : null}

      {tab === 'funds' && detail?.funds ? (
        (() => {
          const allExtracted = (detail.funds.extracted ?? [])
            .map((e) => e.extracted)
            .filter(Boolean) as NonNullable<NonNullable<typeof detail.funds.extracted>[number]['extracted']>[];
          const expByYear = allExtracted
            .filter((x) => x.computedExpenditureTotal !== undefined)
            .map((x) => ({ fiscalYear: x.fiscalYear, total: x.computedExpenditureTotal! }));
          const plByYear = allExtracted
            .filter((x) => x.surplusDeficit !== undefined)
            .map((x) => ({ fiscalYear: x.fiscalYear, surplus: x.surplusDeficit! }));
          // Aggregate expenditure categories across all years.
          const expCatMap = new Map<string, number>();
          for (const x of allExtracted) {
            for (const e of x.expenditures ?? []) {
              const k = (e.category || 'Unspecified').trim() || 'Unspecified';
              expCatMap.set(k, (expCatMap.get(k) ?? 0) + (Number(e.amount) || 0));
            }
          }
          const expByCategory = [...expCatMap.entries()].sort((a, b) => b[1] - a[1]).map(([category, total]) => ({ category, total }));
          // Latest balance sheet (most recent year with one).
          const latestBs = [...allExtracted]
            .filter((x) => x.balanceSheet && Object.keys(x.balanceSheet).length > 0)
            .sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear))[0];
          return (
        <View>
          {/* Year-over-year totals — PDF-extracted vs federal Grants & Contributions */}
          {(detail.funds.summary?.byYear?.length || detail.funds.federal?.byYear?.length) ? (
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
              <Card.Title
                title="Year-over-year federal transfers"
                subtitle="Two independent sources — Schedule of Federal Funding PDFs (OCR'd via Claude) vs the federal Proactive Disclosure of Grants & Contributions"
                titleStyle={{ color: theme.colors.accent }}
                subtitleStyle={{ color: theme.colors.textDarker, fontSize: 11 }}
              />
              <Card.Content>
                {(() => {
                  const years = Array.from(
                    new Set([
                      ...(detail.funds.summary?.byYear ?? []).map((y) => y.fiscalYear),
                      ...(detail.funds.federal?.byYear ?? []).map((y) => y.fiscalYear),
                    ]),
                  ).sort();
                  const pdfMap = new Map((detail.funds.summary?.byYear ?? []).map((y) => [y.fiscalYear, y.total]));
                  const fedMap = new Map((detail.funds.federal?.byYear ?? []).map((y) => [y.fiscalYear, y.total]));
                  const max = Math.max(
                    1,
                    ...years.map((y) => Math.max(pdfMap.get(y) ?? 0, fedMap.get(y) ?? 0)),
                  );
                  return years.map((y) => {
                    const p = pdfMap.get(y) ?? 0;
                    const f = fedMap.get(y) ?? 0;
                    return (
                      <View key={y} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>{y}</Text>
                          <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                            {p ? `PDF $${p.toLocaleString()}` : 'PDF —'} · {f ? `Federal $${f.toLocaleString()}` : 'Federal —'}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Text style={{ width: 50, fontSize: 10, color: theme.colors.textDarker }}>PDF</Text>
                          <View style={{ flex: 1, height: 8, backgroundColor: theme.colors.secondary }}>
                            <View style={{ width: `${(p / max) * 100}%`, height: '100%', backgroundColor: theme.colors.accent }} />
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Text style={{ width: 50, fontSize: 10, color: theme.colors.textDarker }}>Federal</Text>
                          <View style={{ flex: 1, height: 8, backgroundColor: theme.colors.secondary }}>
                            <View style={{ width: `${(f / max) * 100}%`, height: '100%', backgroundColor: theme.colors.primary }} />
                          </View>
                        </View>
                      </View>
                    );
                  });
                })()}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 12, height: 12, backgroundColor: theme.colors.accent }} />
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>Schedule of Federal Funding PDF (Claude OCR)</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 12, height: 12, backgroundColor: theme.colors.primary }} />
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>Open Canada Grants & Contributions</Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          ) : null}

          {/* Profit / loss by year */}
          {plByYear.length ? (
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
              <Card.Title
                title="Profit / loss by year"
                subtitle="Revenue minus expenditures (from each year's audited submission)"
                titleStyle={{ color: theme.colors.success }}
                subtitleStyle={{ color: theme.colors.textDarker, fontSize: 11 }}
              />
              <Card.Content>
                {plByYear.map((p) => (
                  <View key={p.fiscalYear} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomColor: theme.colors.defaultBorder, borderBottomWidth: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 12, width: 90 }}>{p.fiscalYear}</Text>
                    <Text style={{
                      color: p.surplus >= 0 ? theme.colors.success : theme.colors.error,
                      fontSize: 12,
                      flex: 1,
                      textAlign: 'right',
                      fontFamily: 'Menlo, monospace' as any,
                    }}>
                      {p.surplus >= 0 ? '+' : '−'}${Math.abs(p.surplus).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </Card.Content>
            </Card>
          ) : null}

          {/* Year-over-year revenue vs expenditures double-bar */}
          {expByYear.length ? (
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
              <Card.Title
                title="Revenue vs expenditures by year"
                subtitle="Top: revenue from federal transfer payments; bottom: total expenditures"
                titleStyle={{ color: theme.colors.accent }}
                subtitleStyle={{ color: theme.colors.textDarker, fontSize: 11 }}
              />
              <Card.Content>
                {(() => {
                  const revMap = new Map((detail.funds.summary?.byYear ?? []).map((y) => [y.fiscalYear, y.total]));
                  const expMap = new Map(expByYear.map((x) => [x.fiscalYear, x.total]));
                  const years = Array.from(new Set([...revMap.keys(), ...expMap.keys()])).sort();
                  const max = Math.max(1, ...years.map((y) => Math.max(revMap.get(y) ?? 0, expMap.get(y) ?? 0)));
                  return years.map((y) => {
                    const rev = revMap.get(y) ?? 0;
                    const exp = expMap.get(y) ?? 0;
                    return (
                      <View key={y} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>{y}</Text>
                          <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                            Rev ${rev.toLocaleString()} · Exp ${exp.toLocaleString()}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Text style={{ width: 50, fontSize: 10, color: theme.colors.textDarker }}>Rev</Text>
                          <View style={{ flex: 1, height: 8, backgroundColor: theme.colors.secondary }}>
                            <View style={{ width: `${(rev / max) * 100}%`, height: '100%', backgroundColor: theme.colors.accent }} />
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Text style={{ width: 50, fontSize: 10, color: theme.colors.textDarker }}>Exp</Text>
                          <View style={{ flex: 1, height: 8, backgroundColor: theme.colors.secondary }}>
                            <View style={{ width: `${(exp / max) * 100}%`, height: '100%', backgroundColor: theme.colors.primary }} />
                          </View>
                        </View>
                      </View>
                    );
                  });
                })()}
              </Card.Content>
            </Card>
          ) : null}

          {/* Expenditures by category — aggregated across all years */}
          {expByCategory.length ? (
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
              <Card.Title title="Expenditures by category (all years combined)" titleStyle={{ color: theme.colors.primary }} />
              <Card.Content>
                <PieSlices
                  formatCurrency
                  slices={expByCategory.slice(0, 8).map((d, i) => ({
                    label: d.category,
                    value: d.total,
                    color: CHART_COLORS[i % CHART_COLORS.length],
                  }))}
                />
              </Card.Content>
            </Card>
          ) : null}

          {/* Balance sheet snapshot — latest available year */}
          {latestBs?.balanceSheet ? (
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
              <Card.Title
                title={`Balance sheet — ${latestBs.fiscalYear}`}
                subtitle="Assets, liabilities, equity (year-end snapshot from the audited submission)"
                titleStyle={{ color: theme.colors.success }}
                subtitleStyle={{ color: theme.colors.textDarker, fontSize: 11 }}
              />
              <Card.Content>
                {[
                  ['Current assets', latestBs.balanceSheet.currentAssets],
                  ['Capital assets', latestBs.balanceSheet.capitalAssets],
                  ['Total assets', latestBs.balanceSheet.totalAssets],
                  ['Current liabilities', latestBs.balanceSheet.currentLiabilities],
                  ['Long-term liabilities', latestBs.balanceSheet.longTermLiabilities],
                  ['Total liabilities', latestBs.balanceSheet.totalLiabilities],
                  ['Equity in capital assets', latestBs.balanceSheet.equityInCapitalAssets],
                  ['Accumulated surplus', latestBs.balanceSheet.accumulatedSurplus],
                  ['Net assets / band equity', latestBs.balanceSheet.netAssetsOrEquity],
                ]
                  .filter(([, v]) => typeof v === 'number')
                  .map(([label, v]) => {
                    const bold = ['Total assets', 'Total liabilities', 'Net assets / band equity'].includes(String(label));
                    return (
                      <View key={String(label)} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomColor: theme.colors.defaultBorder, borderBottomWidth: 1 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: bold ? '700' : '400', flex: 1 }}>{label}</Text>
                        <Text style={{
                          color: (v as number) < 0 ? theme.colors.error : theme.colors.text,
                          fontWeight: bold ? '700' : '400',
                          fontSize: 12,
                          fontFamily: 'Menlo, monospace' as any,
                        }}>
                          ${(v as number).toLocaleString()}
                        </Text>
                      </View>
                    );
                  })}
              </Card.Content>
            </Card>
          ) : null}

          {/* Per-department breakdown (pie, from whichever side has data) */}
          {detail.funds.summary?.byDepartment?.length ? (
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
              <Card.Title title="By funding department (from PDFs)" titleStyle={{ color: theme.colors.success }} />
              <Card.Content>
                <PieSlices
                  formatCurrency
                  slices={detail.funds.summary.byDepartment.slice(0, 6).map((d, i) => ({
                    label: d.department,
                    value: d.total,
                    color: CHART_COLORS[i % CHART_COLORS.length],
                  }))}
                />
              </Card.Content>
            </Card>
          ) : null}

          {/* Cross-check table */}
          {detail.funds.comparison?.byYear?.length ? (
            <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
              <Card.Title
                title="Cross-check: PDF vs Federal records"
                subtitle="Δ > 0 → the band's PDF reports more than federal proactive disclosure shows"
                titleStyle={{ color: theme.colors.primary }}
                subtitleStyle={{ color: theme.colors.textDarker, fontSize: 11 }}
              />
              <Card.Content>
                {detail.funds.comparison.byYear.map((r) => (
                  <View key={r.fiscalYear} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomColor: theme.colors.defaultBorder, borderBottomWidth: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 12, width: 90 }}>{r.fiscalYear}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12, flex: 1 }}>
                      PDF {r.pdfTotal !== undefined ? `$${r.pdfTotal.toLocaleString()}` : '—'} · Fed {r.federalTotal !== undefined ? `$${r.federalTotal.toLocaleString()}` : '—'}
                    </Text>
                    {r.delta !== undefined ? (
                      <Text style={{ color: Math.abs(r.delta) < 1 ? theme.colors.textDarker : r.delta > 0 ? theme.colors.success : theme.colors.error, fontSize: 12, width: 110, textAlign: 'right' }}>
                        Δ ${Math.abs(r.delta).toLocaleString()}{r.deltaPct !== undefined ? ` (${r.deltaPct.toFixed(0)}%)` : ''}
                      </Text>
                    ) : null}
                  </View>
                ))}
                <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 8 }}>
                  Sources rarely align perfectly: PDFs include all federal payments per the band's audited submission; the federal Grants & Contributions disclosure only covers agreements ≥ the disclosure threshold and only post-1998 with varying coverage. Use the comparison directionally, not as a strict reconciliation.
                </Text>
              </Card.Content>
            </Card>
          ) : null}

          {/* Original PDF list */}
          <Card style={{ backgroundColor: theme.colors.darkDefault }}>
            <Card.Title
              title="Schedule of Federal Funding (audited submissions)"
              subtitle={`${detail.funds.rows.length} fiscal years on record — scanned PDFs from the federal FN Profiles archive`}
              titleStyle={{ color: theme.colors.accent }}
              subtitleStyle={{ color: theme.colors.textDarker, fontSize: 12 }}
            />
            <Card.Content>
              {detail.funds.rows.length === 0 ? (
                <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>No fiscal years on record.</Text>
              ) : (
                detail.funds.rows.map((r) => {
                  const e = detail.funds!.extracted?.find((x) => x.fiscalYear === r.fiscalYear);
                  return (
                    <View key={r.fiscalYear} style={{ paddingVertical: 6, borderBottomColor: theme.colors.defaultBorder, borderBottomWidth: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={{ color: theme.colors.text, fontSize: 13, width: 100 }}>{r.fiscalYear}</Text>
                        {r.documentUrl ? (
                          <Pressable onPress={() => Linking.openURL(r.documentUrl!)}>
                            <Text style={{ color: theme.colors.primary, fontSize: 13 }}>{r.documentName} ↗</Text>
                          </Pressable>
                        ) : (
                          <Text style={{ color: theme.colors.textDarker, fontSize: 13 }}>{r.documentName}</Text>
                        )}
                        {e?.extracted ? (
                          <Text style={{ color: theme.colors.success, fontSize: 11, marginLeft: 8 }}>
                            ✔ {e.extracted.transfers.length} transfers · ${e.extracted.computedTotal.toLocaleString()}
                            {e.extractStatus === 'cached' ? ' (cached)' : ''}
                          </Text>
                        ) : e?.extractStatus === 'pending' ? (
                          <Text style={{ color: theme.colors.primary, fontSize: 11, marginLeft: 8 }}>
                            ⏳ queued for background OCR{e.attempts && e.attempts > 1 ? ` (attempt ${e.attempts})` : ''}
                          </Text>
                        ) : e?.extractStatus === 'running' ? (
                          <Text style={{ color: theme.colors.accent, fontSize: 11, marginLeft: 8 }}>
                            ⚙ OCR in progress{e?.attempts && e.attempts > 1 ? ` (attempt ${e.attempts})` : ''}…
                          </Text>
                        ) : e?.extractStatus === 'failed' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginLeft: 8 }}>
                            <Text style={{ color: theme.colors.error, fontSize: 11 }}>
                              ✖ OCR failed: {(e.extractError || '').slice(0, 80)}
                            </Text>
                            <Pressable
                              onPress={async () => {
                                try {
                                  await retryFundingOcr(bandNumber, e.fiscalYear);
                                  await load(true);
                                } catch (err) {
                                  setError((err as Error).message);
                                }
                              }}
                              style={{ marginLeft: 8 }}
                            >
                              <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '600' }}>
                                Retry OCR ↻
                              </Text>
                            </Pressable>
                          </View>
                        ) : e?.extractError ? (
                          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginLeft: 8 }}>
                            {e.extractError.includes('ANTHROPIC_API_KEY')
                              ? 'OCR disabled — set ANTHROPIC_API_KEY to enable.'
                              : `OCR error: ${e.extractError.slice(0, 80)}`}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </Card.Content>
          </Card>
        </View>
          );
        })()
      ) : null}

      {tab === 'fnfta' ? (
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Title title="FNFTA — Financial Transparency Act" titleStyle={{ color: theme.colors.primary }} />
          <Card.Content>
            <Text style={{ color: theme.colors.text, fontSize: 13, marginBottom: 8 }}>
              Per-Nation audited consolidated statements + schedule of remuneration and expenses are published by ISC. Open the FNFTA hub and filter by Nation name.
            </Text>
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor="#000"
              onPress={() => detail?.fnfta?.searchUrl && Linking.openURL(detail.fnfta.searchUrl)}
            >
              Open FNFTA records
            </Button>
          </Card.Content>
        </Card>
      ) : null}
    </PageContainer>
  );
}
