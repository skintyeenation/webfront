import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Divider, IconButton } from 'react-native-paper';
import { PageContainer, ReserveMap } from 'lookup/components/layout';
import { theme } from 'lookup/styles';
import { getNationDetail, type BandDetail } from 'lookup/services/lookupApi';

type Tab = 'general' | 'governance' | 'reserves' | 'map' | 'population' | 'funds' | 'fnfta';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'general', label: 'General', icon: 'card-account-details-outline' },
  { id: 'governance', label: 'Governance', icon: 'gavel' },
  { id: 'reserves', label: 'Reserves', icon: 'map-marker-outline' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'population', label: 'Population', icon: 'account-group-outline' },
  { id: 'funds', label: 'Federal funding', icon: 'cash-multiple' },
  { id: 'fnfta', label: 'FNFTA', icon: 'file-document-outline' },
];

const CHART_COLORS = ['#00B8EC', '#EC6A37', '#9ECD3B', '#7C5CFA', '#F2C94C', '#A4A4A4'];

function PieSlices({ slices, size = 180 }: { slices: Array<{ label: string; value: number; color: string }>; size?: number }) {
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
                {s.value} ({((s.value / total) * 100).toFixed(0)}%)
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
            {s.value} ({((s.value / total) * 100).toFixed(0)}%)
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = async (refresh = false) => {
    if (!bandNumber) return;
    setLoading(true);
    setError(undefined);
    try {
      const d = await getNationDetail(bandNumber, refresh);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, [bandNumber]); // eslint-disable-line react-hooks/exhaustive-deps

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
            {detail?.fetchedAt ? ` · ${detail.cached ? 'cached' : 'fresh'} ${new Date(detail.fetchedAt).toLocaleString()}` : ''}
            {detail?.stale ? ' · stale' : ''}
          </Text>
        </View>
        <IconButton
          icon="refresh"
          iconColor={theme.colors.primary}
          onPress={() => void load(true)}
          accessibilityLabel="Re-scrape this band"
        />
      </View>

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
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Title title="Reserves" titleStyle={{ color: theme.colors.primary }} />
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
                    {[r.size, r.community].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              ))
            )}
          </Card.Content>
        </Card>
      ) : null}

      {tab === 'map' ? (
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Title
            title="Reserve territory"
            subtitle={detail?.geo
              ? `${detail.geo.features.length} reserve${detail.geo.features.length === 1 ? '' : 's'} plotted from the federal CLSS Aboriginal Lands layer`
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
              <ReserveMap features={detail.geo.features as any} bbox={detail.geo.bbox} height={380} />
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
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Title
            title="Schedule of Federal Funding"
            subtitle={`${detail.funds.rows.length} fiscal years on record`}
            titleStyle={{ color: theme.colors.accent }}
            subtitleStyle={{ color: theme.colors.textDarker, fontSize: 12 }}
          />
          <Card.Content>
            {detail.funds.rows.length === 0 ? (
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>No fiscal years on record.</Text>
            ) : (
              detail.funds.rows.map((r) => (
                <View key={r.fiscalYear} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomColor: theme.colors.defaultBorder, borderBottomWidth: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, width: 100 }}>{r.fiscalYear}</Text>
                  {r.documentUrl ? (
                    <Pressable onPress={() => Linking.openURL(r.documentUrl!)}>
                      <Text style={{ color: theme.colors.primary, fontSize: 13 }}>{r.documentName} ↗</Text>
                    </Pressable>
                  ) : (
                    <Text style={{ color: theme.colors.textDarker, fontSize: 13 }}>{r.documentName}</Text>
                  )}
                </View>
              ))
            )}
          </Card.Content>
        </Card>
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
