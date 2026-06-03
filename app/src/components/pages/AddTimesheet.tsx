import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Card, Chip, HelperText, IconButton, Text, TextInput } from 'react-native-paper';
import dayjs from 'dayjs';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppSelector } from 'skintyee/store';
import { apiFactory } from 'skintyee/store/apis';
import { PayPeriod, PayPeriodConfig, Timesheet } from 'skintyee/models';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Edit / submit the current pay-period timesheet.
//
// Layout: one card per day of the 14-day period. Each card holds 0..N entries
// (one row per task). A row has [task] + [timeIn] + [timeOut] + auto-hours
// + delete. Workers can add multiple entries per day for different tasks.
//
// Hours auto-compute from timeIn/timeOut when both are filled and valid.
// Empty times + a manual hours number is also valid (contractor billing).
//
// Live tallies: per-week + period total. OT badge appears once a week > 40.
// ----------------------------------------------------------------------------

interface DraftEntry {
  id: string;
  date: string;      // YYYY-MM-DD
  task: string;
  timeIn?: string;
  timeOut?: string;
  hours: number;
}

const newRowId = () => `row-${Math.random().toString(36).slice(2, 9)}`;

function hoursBetween(timeIn?: string, timeOut?: string): number {
  if (!timeIn || !timeOut) return 0;
  const m = (s: string) => {
    const parts = s.split(':');
    if (parts.length !== 2) return NaN;
    const h = parseInt(parts[0], 10);
    const mi = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(mi)) return NaN;
    return h * 60 + mi;
  };
  const a = m(timeIn), b = m(timeOut);
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  return Math.round(((b - a) / 60) * 100) / 100;
}

function isValidTime(s?: string): boolean {
  if (!s) return true; // empty is fine — manual hours
  return /^\d{1,2}:\d{2}$/.test(s);
}

function rowsFromTimesheet(existing: Timesheet | null): DraftEntry[] {
  return (existing?.entries ?? []).map((e) => ({
    id: e.id ?? newRowId(),
    date: e.date,
    task: e.task || 'Regular',
    timeIn: e.timeIn ?? undefined,
    timeOut: e.timeOut ?? undefined,
    hours: Number(e.hours) || 0,
  }));
}

export default function AddTimesheet({ navigation, route }: any) {
  const isSignedIn = useAppSelector((s) => s.auth.signedIn);
  const targetPeriodId: string | undefined = route?.params?.periodId;

  const [payPeriod, setPayPeriod] = useState<PayPeriod | undefined>();
  const [config, setConfig] = useState<PayPeriodConfig | undefined>();
  const [existing, setExisting] = useState<Timesheet | null>(null);
  const [rows, setRows] = useState<DraftEntry[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittedMode, setSubmittedMode] = useState<'draft' | 'submit' | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const api = apiFactory();
        const periods = await api.timekeeping.payPeriods();
        const periodTarget = targetPeriodId ?? periods.current.id;
        const my = await api.timekeeping.myTimesheets(periodTarget);
        if (cancelled) return;
        setConfig(periods.config);
        setPayPeriod(my.period);
        setExisting(my.current);
        setRows(rowsFromTimesheet(my.current));
        setNotes(my.current?.notes ?? '');
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [targetPeriodId]);

  const addRow = (date: string) => {
    setRows((prev) => [...prev, { id: newRowId(), date, task: 'Regular', hours: 0 }]);
  };
  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };
  const updateRow = (id: string, patch: Partial<DraftEntry>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        // Hours is read-only and always derived from timeIn/timeOut.
        next.hours = (next.timeIn && next.timeOut && isValidTime(next.timeIn) && isValidTime(next.timeOut))
          ? hoursBetween(next.timeIn, next.timeOut)
          : 0;
        return next;
      })
    );
  };

  const tallies = useMemo(() => {
    if (!payPeriod) return null;
    const splitDate = dayjs(payPeriod.startISO).add(7, 'day').format('YYYY-MM-DD');
    let week1 = 0, week2 = 0;
    for (const r of rows) {
      if (r.date < splitDate) week1 += Number(r.hours) || 0;
      else                    week2 += Number(r.hours) || 0;
    }
    const overtimeThreshold = config?.overtimeWeeklyHoursThreshold ?? 40;
    const ot = Math.max(0, week1 - overtimeThreshold) + Math.max(0, week2 - overtimeThreshold);
    return {
      week1: Math.round(week1 * 100) / 100,
      week2: Math.round(week2 * 100) / 100,
      total: Math.round((week1 + week2) * 100) / 100,
      ot: Math.round(ot * 100) / 100,
      overtimeThreshold,
    };
  }, [rows, payPeriod, config]);

  const dayBlocks = useMemo(() => {
    if (!payPeriod) return [] as Array<{ date: string; rows: DraftEntry[]; weekIdx: 1 | 2 }>;
    const start = dayjs(payPeriod.startISO);
    const splitDate = start.add(7, 'day').format('YYYY-MM-DD');
    const out: Array<{ date: string; rows: DraftEntry[]; weekIdx: 1 | 2 }> = [];
    for (let i = 0; i < 14; i++) {
      const date = start.add(i, 'day').format('YYYY-MM-DD');
      out.push({
        date,
        rows: rows.filter((r) => r.date === date),
        weekIdx: date < splitDate ? 1 : 2,
      });
    }
    return out;
  }, [payPeriod, rows]);

  const persist = async (mode: 'draft' | 'submit') => {
    if (!payPeriod) return;
    setSaving(true);
    setError(undefined);
    setSubmittedMode(mode);
    try {
      for (const r of rows) {
        if (!isValidTime(r.timeIn) || !isValidTime(r.timeOut)) {
          throw new Error(`Invalid time on ${r.date}. Use HH:mm (e.g. 08:00).`);
        }
      }
      const api = apiFactory();
      const body = {
        entries: rows
          .filter((r) => (r.hours > 0) || r.timeIn || r.timeOut)
          .map((r) => ({
            date: r.date,
            hours: Number(r.hours) || 0,
            task: r.task || 'Regular',
            timeIn: r.timeIn || undefined,
            timeOut: r.timeOut || undefined,
          })),
        notes: notes.trim() || undefined,
      };
      const saved = mode === 'submit'
        ? await api.timekeeping.submit(payPeriod.id, body)
        : await api.timekeeping.saveDraft(payPeriod.id, body);
      setExisting(saved);
      if (mode === 'submit') {
        setTimeout(() => navigation?.goBack?.(), 600);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
      if (mode === 'draft') setSubmittedMode(null);
    }
  };

  if (!isSignedIn) {
    return (
      <PageContainer><PageContent>
        <Text style={{ color: theme.colors.text }}>Sign in to enter a timesheet.</Text>
      </PageContent></PageContainer>
    );
  }
  if (loading || !payPeriod) {
    return (
      <PageContainer><PageContent>
        <ActivityIndicator style={{ marginVertical: 24 }} />
      </PageContent></PageContainer>
    );
  }

  const statusColor = (s?: string) =>
    s === 'approved' ? theme.colors.success
    : s === 'rejected' ? theme.colors.error
    : s === 'submitted' ? theme.colors.accent
    : theme.colors.secondary;

  return (
    <PageContainer>
      <PageContent>
        {/* Period + status header */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 16 }}>Pay period {payPeriod.label}</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
                  Cutoff Fri {dayjs(payPeriod.endISO).format('MMM D')} · Pay date Fri {dayjs(payPeriod.payDateISO).format('MMM D')}
                </Text>
              </View>
              <Chip compact style={{ backgroundColor: statusColor(existing?.status) }} textStyle={{ color: '#000', fontSize: 11 }}>
                {existing?.status ?? 'draft'}
              </Chip>
            </View>
            {existing?.rejectedReason ? (
              <Text style={{ color: theme.colors.error, fontSize: 12, marginTop: 8 }}>
                Rejected: {existing.rejectedReason}
              </Text>
            ) : null}
          </Card.Content>
        </Card>

        {/* Week 1 + Week 2 day cards */}
        {[1, 2].map((wk) => {
          const wkHours = wk === 1 ? tallies?.week1 ?? 0 : tallies?.week2 ?? 0;
          const overOT = wkHours > (tallies?.overtimeThreshold ?? 40);
          return (
            <View key={wk}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 6 }}>
                <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>
                  WEEK {wk}
                </Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginLeft: 8 }}>· {wkHours}h</Text>
                {overOT ? (
                  <Chip compact icon="alert" style={{ marginLeft: 8, backgroundColor: theme.colors.accent }} textStyle={{ color: '#000', fontSize: 10 }}>
                    {Math.round((wkHours - (tallies?.overtimeThreshold ?? 40)) * 100) / 100}h OT
                  </Chip>
                ) : null}
              </View>

              {dayBlocks.filter((d) => d.weekIdx === wk).map((d) => (
                <Card key={d.date} style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 8 }}>
                  <Card.Content>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1 }}>
                        {dayjs(d.date).format('ddd MMM D')}
                      </Text>
                      <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                        {Math.round(d.rows.reduce((s, r) => s + (Number(r.hours) || 0), 0) * 100) / 100}h
                      </Text>
                    </View>

                    {d.rows.length === 0 ? (
                      <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 6 }}>
                        No entries
                      </Text>
                    ) : (
                      d.rows.map((r) => (
                        <View key={r.id} style={{ marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TextInput
                              dense mode="outlined" label="Task" value={r.task}
                              onChangeText={(v) => updateRow(r.id, { task: v })}
                              style={{ flex: 1, marginRight: 6 }}
                            />
                            <IconButton
                              icon="close" size={18}
                              iconColor={theme.colors.textDarker}
                              onPress={() => removeRow(r.id)}
                            />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <TextInput
                              dense mode="outlined" label="In" placeholder="08:00"
                              value={r.timeIn ?? ''}
                              onChangeText={(v) => updateRow(r.id, { timeIn: v.trim() || undefined })}
                              style={{ flex: 1, marginRight: 6 }}
                              error={!isValidTime(r.timeIn)}
                            />
                            <TextInput
                              dense mode="outlined" label="Out" placeholder="16:30"
                              value={r.timeOut ?? ''}
                              onChangeText={(v) => updateRow(r.id, { timeOut: v.trim() || undefined })}
                              style={{ flex: 1, marginRight: 6 }}
                              error={!isValidTime(r.timeOut)}
                            />
                            {/* Hours — read-only, derived from In/Out. Styled
                                as a plain label so it's obviously not an
                                input. Shows '–' until both times are set. */}
                            <View style={{ width: 70, alignItems: 'center' }}>
                              <Text style={{ color: theme.colors.textDarker, fontSize: 10, letterSpacing: 1 }}>HOURS</Text>
                              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '600' }}>
                                {r.hours > 0 ? r.hours : '–'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))
                    )}

                    <Button
                      compact mode="text" icon="plus"
                      textColor={theme.colors.primary}
                      onPress={() => addRow(d.date)}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Add entry
                    </Button>
                  </Card.Content>
                </Card>
              ))}
            </View>
          );
        })}

        {/* Notes */}
        <TextInput
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          mode="outlined"
          multiline numberOfLines={3}
          style={{ marginTop: 12, marginBottom: 12 }}
        />

        {/* Period totals */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
          <Card.Content>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.primary, fontSize: 22 }}>{tallies?.total ?? 0}h</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Period total</Text>
              </View>
              {tallies?.ot ? (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.accent, fontSize: 22 }}>{tallies.ot}h</Text>
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Overtime · admin approval required</Text>
                </View>
              ) : null}
            </View>
          </Card.Content>
        </Card>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap' }}>
          <Button
            mode="outlined" icon="content-save-outline"
            onPress={() => persist('draft')}
            disabled={saving}
            loading={saving && submittedMode === 'draft'}
            textColor={theme.colors.text}
            style={{ marginBottom: 6 }}
          >
            Save draft
          </Button>
          <Button
            mode="contained" icon="send"
            buttonColor={theme.colors.primary} textColor="#000"
            onPress={() => persist('submit')}
            disabled={saving || rows.length === 0}
            loading={saving && submittedMode === 'submit'}
            style={{ marginBottom: 6 }}
          >
            Submit
          </Button>
        </View>
      </PageContent>
    </PageContainer>
  );
}
