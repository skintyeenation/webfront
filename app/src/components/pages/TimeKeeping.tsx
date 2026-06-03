import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { Badge, Button, Card, Chip, Divider, HelperText, IconButton, Menu, Modal, Portal, SegmentedButtons, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppSelector } from 'skintyee/store';
import { apiFactory } from 'skintyee/store/apis';
import { PayPeriod, Timesheet } from 'skintyee/models';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Time Keeping — two modes role-gated on a tab:
//
//   • My timesheet  — current pay period + history dropdown
//   • Approvals     — workers' submitted timesheets in a chosen period
//                     (visible when admin appRole OR bandGroups includes
//                     'band-manager'; OT-flagged sheets need admin)
//
// All data lives on Postgres via /v1/timekeeping. See
// docs/features/timesheets.md for the full design.
// ----------------------------------------------------------------------------

type Tab = 'mine' | 'approvals';

const statusColor = (s?: string) =>
  s === 'approved' ? theme.colors.success
  : s === 'rejected' ? theme.colors.error
  : s === 'submitted' ? theme.colors.accent
  : theme.colors.secondary;

const statusLabel = (s?: string) => (s || 'draft').toUpperCase();

export default function TimeKeeping({ navigation }: any) {
  const role = useAppSelector((s) => s.auth.role);
  const myUpn = (useAppSelector((s) => s.auth.user?.upn) || '').toLowerCase();
  const directoryEntities = useAppSelector((s) => s.directory.entities);
  const me = (directoryEntities as any[]).find((m) => (m.upn ?? '').toLowerCase() === myUpn);
  const myBandGroups: string[] = (me?.bandGroups ?? []) as string[];
  const canApprove = role === 'admin' || (role === 'staff' && myBandGroups.includes('band-manager'));

  const [tab, setTab] = useState<Tab>('mine');
  const [recent, setRecent] = useState<PayPeriod[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<PayPeriod | undefined>();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>();
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);

  const [myCurrent, setMyCurrent] = useState<Timesheet | null>(null);
  const [myHistory, setMyHistory] = useState<Timesheet[]>([]);
  const [allTimesheets, setAllTimesheets] = useState<Timesheet[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [actingOn, setActingOn] = useState<string | undefined>();

  // Initial bootstrap: load periods + the current view's data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const api = apiFactory();
        const periods = await api.timekeeping.payPeriods();
        if (cancelled) return;
        setRecent(periods.recent);
        setCurrentPeriod(periods.current);
        setSelectedPeriodId((prev) => prev ?? periods.current.id);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reload the active dataset whenever:
  //   - the screen regains focus (returning from AddTimesheet after a
  //     save would otherwise leave the summary card showing stale hours)
  //   - the tab or selected period changes
  //
  // useFocusEffect re-runs both when the focus event fires AND when
  // the memoised callback's deps change, so it cleanly replaces the
  // earlier plain useEffect.
  useFocusEffect(
    useCallback(() => {
      if (!selectedPeriodId) return;
      let cancelled = false;
      (async () => {
        setError(undefined);
        try {
          const api = apiFactory();
          if (tab === 'mine') {
            const my = await api.timekeeping.myTimesheets(selectedPeriodId);
            if (cancelled) return;
            setMyCurrent(my.current);
            setMyHistory(my.history);
          } else {
            const all = await api.timekeeping.allTimesheets(selectedPeriodId);
            if (cancelled) return;
            setAllTimesheets(all);
          }
        } catch (e: any) {
          if (!cancelled) setError(e?.message ?? String(e));
        }
      })();
      return () => { cancelled = true; };
    }, [tab, selectedPeriodId])
  );

  const selectedPeriod = useMemo(
    () => recent.find((p) => p.id === selectedPeriodId) ?? currentPeriod,
    [recent, currentPeriod, selectedPeriodId]
  );

  const pendingCount = useMemo(
    () => allTimesheets.filter((t) => t.status === 'submitted').length,
    [allTimesheets]
  );

  const onApprove = async (id: string) => {
    setActingOn(id);
    setError(undefined);
    try {
      const updated = await apiFactory().timekeeping.approve(id);
      setAllTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setActingOn(undefined);
    }
  };
  const onReject = async (id: string) => {
    setActingOn(id);
    setError(undefined);
    try {
      const updated = await apiFactory().timekeeping.reject(id, undefined);
      setAllTimesheets((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setActingOn(undefined);
    }
  };

  if (loading) {
    return (
      <PageContainer><PageContent>
        <ActivityIndicator style={{ marginVertical: 24 }} />
      </PageContent></PageContainer>
    );
  }
  if (error && !selectedPeriod) {
    return (
      <PageContainer><PageContent>
        <HelperText type="error" visible>{error}</HelperText>
      </PageContent></PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageContent>
        {/* Tab — only if user is an approver */}
        {canApprove ? (
          <SegmentedButtons
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            style={{ marginBottom: 12 }}
            density="small"
            buttons={[
              { value: 'mine', label: 'My timesheet', icon: 'account-clock' },
              {
                value: 'approvals',
                label: `Approvals${pendingCount > 0 ? ` (${pendingCount})` : ''}`,
                icon: 'check-decagram',
              },
            ]}
          />
        ) : null}

        {/* Pay period dropdown */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Menu
            visible={periodMenuOpen}
            onDismiss={() => setPeriodMenuOpen(false)}
            anchor={
              <Button
                mode="outlined"
                icon="calendar-range"
                textColor={theme.colors.text}
                onPress={() => setPeriodMenuOpen(true)}
                style={{ borderColor: theme.colors.secondary }}
              >
                {selectedPeriod?.label ?? 'Choose period'}
              </Button>
            }
          >
            {recent.map((p) => (
              <Menu.Item
                key={p.id}
                title={p.label + (p.id === currentPeriod?.id ? ' · current' : '')}
                onPress={() => {
                  setSelectedPeriodId(p.id);
                  setPeriodMenuOpen(false);
                }}
              />
            ))}
          </Menu>
          {selectedPeriod ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginLeft: 10 }}>
              Cutoff Fri {dayjs(selectedPeriod.endISO).format('MMM D')} · Pay Fri {dayjs(selectedPeriod.payDateISO).format('MMM D')}
            </Text>
          ) : null}
        </View>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        {tab === 'mine' ? (
          <MyTimesheetView
            navigation={navigation}
            period={selectedPeriod}
            current={myCurrent}
            history={myHistory}
            currentPeriodId={currentPeriod?.id}
          />
        ) : (
          <ApprovalsView
            timesheets={allTimesheets}
            actingOn={actingOn}
            onApprove={onApprove}
            onReject={onReject}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}

// ---- My timesheet view -----------------------------------------------------

function MyTimesheetView({
  navigation, period, current, history, currentPeriodId,
}: {
  navigation: any;
  period?: PayPeriod;
  current: Timesheet | null;
  history: Timesheet[];
  currentPeriodId?: string;
}) {
  if (!period) return null;
  const isCurrentPeriod = period.id === currentPeriodId;
  const editable = isCurrentPeriod && current?.status !== 'approved';

  return (
    <View>
      <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: theme.colors.text, fontSize: 16 }}>{period.label}</Text>
            <Chip compact style={{ backgroundColor: statusColor(current?.status) }} textStyle={{ color: '#000', fontSize: 11 }}>
              {statusLabel(current?.status)}
            </Chip>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.primary, fontSize: 22 }}>{current?.totalHours ?? 0}h</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Total</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 22 }}>{current?.week1Hours ?? 0}h</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Week 1</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 22 }}>{current?.week2Hours ?? 0}h</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Week 2</Text>
            </View>
            {current?.overtimeHours ? (
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.accent, fontSize: 22 }}>{current.overtimeHours}h</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Overtime</Text>
              </View>
            ) : null}
          </View>

          {current?.rejectedReason ? (
            <Text style={{ color: theme.colors.error, fontSize: 12, marginTop: 8 }}>
              Rejected: {current.rejectedReason}
            </Text>
          ) : null}

          <Button
            mode={editable ? 'contained' : 'outlined'}
            icon={editable ? 'pencil' : 'eye-outline'}
            buttonColor={editable ? theme.colors.primary : undefined}
            textColor={editable ? '#000' : theme.colors.text}
            onPress={() => navigation.navigate('timesheetCreate', { periodId: period.id })}
            style={{ marginTop: 12, alignSelf: 'flex-start', borderColor: theme.colors.secondary }}
          >
            {editable ? 'Edit / submit' : 'View'}
          </Button>
        </Card.Content>
      </Card>

      {/* History list */}
      {history.length > 0 ? (
        <View>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 8, marginBottom: 6 }}>
            HISTORY
          </Text>
          {history.map((t) => (
            <HistoryRow key={t.id} t={t} navigation={navigation} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---- Approvals view --------------------------------------------------------

function ApprovalsView({
  timesheets, actingOn, onApprove, onReject,
}: {
  timesheets: Timesheet[];
  actingOn?: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (timesheets.length === 0) {
    return <NoContent message="No timesheets in this pay period yet." />;
  }
  const submitted = timesheets.filter((t) => t.status === 'submitted');
  const done = timesheets.filter((t) => t.status !== 'submitted');

  return (
    <View>
      <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
        PENDING ({submitted.length})
      </Text>
      {submitted.length === 0 ? (
        <Text style={{ color: theme.colors.textDarker, marginBottom: 12, fontSize: 12 }}>
          Nothing waiting. Inbox zero.
        </Text>
      ) : (
        submitted.map((t) => (
          <ApprovalCard key={t.id} t={t} actingOn={actingOn} onApprove={onApprove} onReject={onReject} />
        ))
      )}

      {done.length > 0 ? (
        <>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 6 }}>
            ALREADY DECIDED
          </Text>
          {done.map((t) => (
            <Card key={t.id} style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 6 }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.text, flex: 1 }}>{t.workerName}</Text>
                  <Text style={{ color: theme.colors.textDarker, marginRight: 8 }}>{t.totalHours}h</Text>
                  <Chip compact style={{ backgroundColor: statusColor(t.status) }} textStyle={{ color: '#000', fontSize: 10 }}>
                    {statusLabel(t.status)}
                  </Chip>
                </View>
              </Card.Content>
            </Card>
          ))}
        </>
      ) : null}
    </View>
  );
}

function ApprovalCard({
  t, actingOn, onApprove, onReject,
}: {
  t: Timesheet;
  actingOn?: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const busy = actingOn === t.id;
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: theme.colors.accent }}>
      <Card.Content>
        {/* Minimal summary — everything else lives in the detail modal. */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>{t.workerName}</Text>
          {t.requiresAdminApproval ? (
            <Chip compact icon="fire" style={{ backgroundColor: theme.colors.accent, marginRight: 6 }} textStyle={{ color: '#000', fontSize: 10 }}>
              {t.overtimeHours}h OT
            </Chip>
          ) : null}
          <Text style={{ color: theme.colors.textDarker }}>{t.totalHours}h</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Button
            mode="contained" compact icon="check"
            buttonColor={theme.colors.success} textColor="#000"
            disabled={busy}
            loading={busy}
            onPress={() => onApprove(t.id)}
            style={{ marginRight: 8 }}
          >
            Approve
          </Button>
          <Button
            mode="outlined" compact icon="close"
            textColor={theme.colors.error}
            disabled={busy}
            onPress={() => onReject(t.id)}
            style={{ borderColor: theme.colors.error, marginRight: 8 }}
          >
            Reject
          </Button>
          <IconButton
            icon="information-outline"
            size={20}
            iconColor={theme.colors.textDarker}
            onPress={() => setDetailOpen(true)}
          />
        </View>

        <TimesheetDetailModal
          visible={detailOpen}
          timesheet={t}
          onDismiss={() => setDetailOpen(false)}
        />
      </Card.Content>
    </Card>
  );
}

// ---- History row (worker view) — same detail modal -----------------------
function HistoryRow({ t, navigation }: { t: Timesheet; navigation: any }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 6 }}>
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
            onPress={() => navigation.navigate('timesheetCreate', { periodId: t.payPeriodId })}
          >
            <Text style={{ color: theme.colors.text, flex: 1 }}>
              {dayjs(t.payPeriodId).format('MMM D, YYYY')}
            </Text>
            <Text style={{ color: theme.colors.textDarker, marginRight: 8 }}>
              {t.totalHours}h
            </Text>
            <Chip compact style={{ backgroundColor: statusColor(t.status) }} textStyle={{ color: '#000', fontSize: 10 }}>
              {statusLabel(t.status)}
            </Chip>
          </TouchableOpacity>
          <IconButton
            icon="information-outline"
            size={18}
            iconColor={theme.colors.textDarker}
            onPress={() => setOpen(true)}
          />
        </View>
      </Card.Content>
      <TimesheetDetailModal
        visible={open}
        timesheet={t}
        onDismiss={() => setOpen(false)}
      />
    </Card>
  );
}

// ---- Read-only detail modal — shared by ApprovalCard + HistoryRow ----------
function TimesheetDetailModal({
  visible, timesheet, onDismiss,
}: { visible: boolean; timesheet: Timesheet; onDismiss: () => void }) {
  const byDay = useMemo(() => {
    const map = new Map<string, Timesheet['entries']>();
    for (const e of timesheet.entries ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [timesheet.entries]);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          backgroundColor: theme.colors.background,
          margin: 16,
          borderRadius: 8,
          maxHeight: '85%',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.secondary }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600' }}>
              {timesheet.workerName}
            </Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
              Pay period {dayjs(timesheet.payPeriodId).format('MMM D, YYYY')}
            </Text>
          </View>
          <Chip compact style={{ backgroundColor: statusColor(timesheet.status), marginRight: 8 }} textStyle={{ color: '#000', fontSize: 10 }}>
            {statusLabel(timesheet.status)}
          </Chip>
          <IconButton icon="close" size={20} iconColor={theme.colors.text} onPress={onDismiss} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {/* Notes — most prominent */}
          {timesheet.notes ? (
            <View style={{ marginBottom: 12, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: theme.colors.primary }}>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>NOTES</Text>
              <Text style={{ color: theme.colors.text, fontSize: 14 }}>{timesheet.notes}</Text>
            </View>
          ) : (
            <Text style={{ color: theme.colors.textDarker, fontStyle: 'italic', marginBottom: 12 }}>
              No notes from the worker.
            </Text>
          )}

          {/* Rejection reason if applicable */}
          {timesheet.rejectedReason ? (
            <View style={{ marginBottom: 12, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: theme.colors.error }}>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>REJECTION REASON</Text>
              <Text style={{ color: theme.colors.error, fontSize: 14 }}>{timesheet.rejectedReason}</Text>
            </View>
          ) : null}

          {/* Hour totals */}
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.primary, fontSize: 22 }}>{timesheet.totalHours}h</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>Total</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 22 }}>{timesheet.week1Hours}h</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>Week 1</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 22 }}>{timesheet.week2Hours}h</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>Week 2</Text>
            </View>
            {timesheet.overtimeHours ? (
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.accent, fontSize: 22 }}>{timesheet.overtimeHours}h</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>Overtime</Text>
              </View>
            ) : null}
          </View>

          {/* Per-day entries */}
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>ENTRIES</Text>
          {byDay.length === 0 ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>No entries.</Text>
          ) : (
            byDay.map(([date, entries]) => {
              const dayTotal = entries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
              return (
                <View key={date} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600', flex: 1 }}>
                      {dayjs(date).format('ddd MMM D')}
                    </Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                      {Math.round(dayTotal * 100) / 100}h
                    </Text>
                  </View>
                  {entries.map((e) => (
                    <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingVertical: 3 }}>
                      <Text style={{ color: theme.colors.textDarker, fontSize: 12, flex: 1 }} numberOfLines={2}>
                        {e.task || 'Regular'}
                        {e.timeIn && e.timeOut ? ` · ${e.timeIn}–${e.timeOut}` : ''}
                      </Text>
                      <Text style={{ color: theme.colors.text, fontSize: 12 }}>{e.hours}h</Text>
                    </View>
                  ))}
                </View>
              );
            })
          )}

          {/* Submission / approval metadata */}
          <Divider style={{ marginVertical: 12 }} />
          <View>
            {timesheet.submittedAt ? (
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 4 }}>
                Submitted {dayjs(timesheet.submittedAt).format('ddd MMM D, YYYY · h:mm A')}
              </Text>
            ) : null}
            {timesheet.approvedBy && timesheet.approvedAt ? (
              <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 4 }}>
                {timesheet.status === 'rejected' ? 'Rejected' : 'Approved'} by {timesheet.approvedBy} · {dayjs(timesheet.approvedAt).format('MMM D, h:mm A')}
              </Text>
            ) : null}
            {timesheet.requiresAdminApproval ? (
              <Text style={{ color: theme.colors.accent, fontSize: 12, marginTop: 4 }}>
                Requires admin approval (overtime present)
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </Modal>
    </Portal>
  );
}
