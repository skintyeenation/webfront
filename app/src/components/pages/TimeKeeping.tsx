import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { Badge, Button, Card, Chip, Divider, HelperText, IconButton, Menu, Modal, Portal, SegmentedButtons, Text, TouchableRipple } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent, useConfirm } from 'skintyee/components/layout';
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
  // Approvals are admin-only. Staff (incl. band-managers) submit their
  // own hours but don't sign off on others'. We keep myBandGroups in
  // scope because it's still consumed for related role-aware rendering
  // (just not for the approval gate any more).
  void myBandGroups;
  const canApprove = role === 'admin';

  const [tab, setTab] = useState<Tab>('mine');
  const [recent, setRecent] = useState<PayPeriod[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<PayPeriod | undefined>();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>();
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);

  const [myCurrent, setMyCurrent] = useState<Timesheet | null>(null);
  const [myHistory, setMyHistory] = useState<Timesheet[]>([]);
  const [allTimesheets, setAllTimesheets] = useState<Timesheet[]>([]);
  // Roster of every timesheets-enabled Person — drives the "Not started"
  // bucket on the Approvals tab so admin sees the full team regardless
  // of who's submitted yet.
  const [eligiblePeople, setEligiblePeople] = useState<Array<{ personId: string; workerUpn: string; workerName: string; isBandMember: boolean }>>([]);
  // Worker-side eligibility for the signed-in user — gates whether
  // "My timesheet" tab is even visible. An admin who isn't enabled for
  // their own timesheets still gets Approvals.
  const [meEligibleNow, setMeEligibleNow] = useState<boolean | null>(null);

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
        const [periods, me] = await Promise.all([
          api.timekeeping.payPeriods(),
          api.timekeeping.meEligible().catch(() => ({ eligible: false, upn: '' })),
        ]);
        if (cancelled) return;
        setRecent(periods.recent);
        setCurrentPeriod(periods.current);
        setSelectedPeriodId((prev) => prev ?? periods.current.id);
        setMeEligibleNow(!!me.eligible);
        // Default tab logic:
        //   - admin who isn't a worker  → Approvals (their only job)
        //   - non-admin worker         → My timesheet (only thing they see)
        //   - non-admin non-worker     → My timesheet (renders the gate)
        // Approvals is never the default for non-admins.
        if (!me.eligible && canApprove) setTab('approvals');
        else if (!canApprove) setTab('mine');
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
            const [all, roster] = await Promise.all([
              api.timekeeping.allTimesheets(selectedPeriodId),
              api.timekeeping.eligiblePeople().catch(() => []),
            ]);
            if (cancelled) return;
            setAllTimesheets(all);
            setEligiblePeople(roster);
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
  const onDelete = async (t: Timesheet) => {
    setActingOn(t.id);
    setError(undefined);
    try {
      await apiFactory().timekeeping.deleteTimesheet(t.id);
      setAllTimesheets((prev) => prev.filter((x) => x.id !== t.id));
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
  // Unlock an approved timesheet for correction (→ back to 'submitted').
  const onReopen = async (id: string) => {
    setActingOn(id);
    setError(undefined);
    try {
      const updated = await apiFactory().timekeeping.reopen(id);
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
        {/* Tab switcher — only when the user is BOTH an approver AND an
            enabled worker. An approver who's not also an enabled worker
            (e.g. a System Admin without Person.timesheetsEnabled) jumps
            straight to Approvals; their own timesheet view is hidden so
            they don't see a draft from before they were disabled. */}
        {canApprove && meEligibleNow ? (
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

        {/* Pay period dropdown — Cutoff / Pay date text now sits BELOW
            the dropdown row instead of inline, so the right column is
            free for the Approvals tab's "Open Reports" CTA. */}
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
            <View style={{ flex: 1 }} />
            {tab === 'approvals' ? (
              <Button
                mode="contained"
                icon="file-chart"
                buttonColor={theme.colors.primary}
                textColor="#fff"
                onPress={() => navigation.navigate('timekeepingReports')}
              >
                Open Reports
              </Button>
            ) : null}
          </View>
          {selectedPeriod ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 6 }}>
              Cutoff Fri {dayjs(selectedPeriod.endISO).format('MMM D')} · Pay Fri {dayjs(selectedPeriod.payDateISO).format('MMM D')}
            </Text>
          ) : null}
        </View>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        {tab === 'mine' || !canApprove ? (
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
            eligiblePeople={eligiblePeople}
            selectedPeriodId={selectedPeriodId}
            actingOn={actingOn}
            onApprove={onApprove}
            onReject={onReject}
            onReopen={onReopen}
            onDelete={onDelete}
            canDelete={role === 'admin'}
            navigation={navigation}
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
  // Modal state for the summary card's read-only View action. Editable
  // periods route to AddTimesheet via navigation instead.
  const [summaryOpen, setSummaryOpen] = useState(false);

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
            // Approved timesheets are frozen — view-only. Pop the
            // summary modal instead of routing to the editor. Everything
            // else (current draft, rejected, historical non-approved)
            // still goes to AddTimesheet which respects its own editable
            // state when rendering.
            onPress={() => {
              if (current?.status === 'approved') {
                setSummaryOpen(true);
              } else {
                navigation.navigate('timesheetCreate', { periodId: period.id });
              }
            }}
            style={{ marginTop: 12, alignSelf: 'flex-start', borderColor: theme.colors.secondary }}
          >
            {editable ? 'Edit / submit' : 'View'}
          </Button>
        </Card.Content>
      </Card>

      {current ? (
        <TimesheetDetailModal
          visible={summaryOpen}
          timesheet={current}
          onDismiss={() => setSummaryOpen(false)}
        />
      ) : null}

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
  timesheets, eligiblePeople, selectedPeriodId, actingOn, onApprove, onReject, onReopen, onDelete, canDelete, navigation,
}: {
  timesheets: Timesheet[];
  eligiblePeople: Array<{ personId: string; workerUpn: string; workerName: string; isBandMember: boolean }>;
  selectedPeriodId?: string;
  actingOn?: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReopen: (id: string) => void;
  onDelete: (t: Timesheet) => void;
  canDelete: boolean;
  navigation: any;
}) {
  const { confirm, ConfirmHost } = useConfirm();
  const [startingFor, setStartingFor] = useState<string | undefined>();

  // Open AddTimesheet in admin-edit mode for this sheet. Cap-gated by
  // status — approved sheets can't be edited (delete + re-submit only).
  const openEdit = (t: Timesheet) => {
    navigation?.navigate?.('timesheetCreate', {
      adminEditId: t.id,
      workerLabel: t.workerName,
    });
  };

  // Admin starts a timesheet for a person who hasn't created one yet.
  // Lands on AddTimesheet in admin-edit mode pointed at the new draft.
  const startFor = async (person: { personId: string; workerName: string }) => {
    if (!selectedPeriodId) return;
    setStartingFor(person.personId);
    try {
      const sheet = await apiFactory().timekeeping.adminStartTimesheet({
        personId: person.personId,
        periodId: selectedPeriodId,
      });
      navigation?.navigate?.('timesheetCreate', {
        adminEditId: sheet.id,
        workerLabel: person.workerName,
      });
    } catch (e: any) {
      // Inline error surface on the row — fallback to a stub for now.
      // eslint-disable-next-line no-console
      console.warn('adminStartTimesheet failed', e);
    } finally {
      setStartingFor(undefined);
    }
  };

  // Wrap the bare onDelete with a confirm dialog. Inline so it can reach
  // the hook above and lives next to the cards that trigger it.
  const askDelete = (t: Timesheet) =>
    confirm({
      title: 'Delete timesheet?',
      message: `${t.workerName}'s ${t.totalHours}h timesheet for ${t.payPeriodId} will be permanently removed.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => onDelete(t),
    });

  // Four buckets:
  //   - notStarted : enabled person, no sheet yet — admin can start one.
  //   - drafts     : not yet submitted; admin can peek + edit, no approve.
  //   - submitted  : awaiting review.
  //   - done       : already approved or rejected.
  // Drafts used to fall into `done` (status !== 'submitted') which is
  // why a draft landed under Already Decided — fixed by partitioning
  // explicitly. Not-started uses the eligible-people roster + filters
  // out anyone who already has a sheet this period.
  const drafts    = timesheets.filter((t) => t.status === 'draft');
  const submitted = timesheets.filter((t) => t.status === 'submitted');
  const done      = timesheets.filter((t) => t.status === 'approved' || t.status === 'rejected');
  const accountedFor = new Set(timesheets.map((t) => t.workerUpn));
  const notStarted = eligiblePeople.filter((p) => !accountedFor.has(p.workerUpn));

  if (timesheets.length === 0 && notStarted.length === 0) {
    return <NoContent message="No people enabled for timesheets. Add one under People with Timesheets enabled." />;
  }

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
          <ApprovalCard
            key={t.id} t={t} actingOn={actingOn}
            onApprove={onApprove} onReject={onReject}
            onDelete={canDelete ? askDelete : undefined}
            onEdit={canDelete ? () => openEdit(t) : undefined}
          />
        ))
      )}

      {notStarted.length > 0 && canDelete ? (
        <>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 6 }}>
            NOT STARTED ({notStarted.length})
          </Text>
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 6 }}>
            People enabled for timesheets who don't have one for this period yet.
          </Text>
          {notStarted.map((p) => (
            <Card key={p.personId} style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 6 }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text }}>{p.workerName}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{p.workerUpn}</Text>
                  </View>
                  <Button
                    compact mode="contained" icon="plus"
                    buttonColor={theme.colors.primary} textColor="#fff"
                    onPress={() => startFor(p)}
                    loading={startingFor === p.personId}
                    disabled={!!startingFor}
                  >
                    Add timesheet
                  </Button>
                </View>
              </Card.Content>
            </Card>
          ))}
        </>
      ) : null}

      {drafts.length > 0 ? (
        <>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 6 }}>
            DRAFTS IN PROGRESS ({drafts.length})
          </Text>
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 6 }}>
            Not submitted yet — worker is still editing. No approval action available.
          </Text>
          {drafts.map((t) => (
            <DecidedRow
              key={t.id} t={t}
              actingOn={actingOn}
              canEdit={canDelete}
              canDelete={canDelete}
              onEdit={() => openEdit(t)}
              onDelete={() => askDelete(t)}
            />
          ))}
        </>
      ) : null}

      {done.length > 0 ? (
        <>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 6 }}>
            ALREADY DECIDED ({done.length})
          </Text>
          {done.map((t) => (
            <DecidedRow
              key={t.id} t={t}
              actingOn={actingOn}
              canEdit={canDelete && t.status !== 'approved'}
              canDelete={canDelete}
              onEdit={() => openEdit(t)}
              onDelete={() => askDelete(t)}
              onReopen={canDelete ? () => onReopen(t.id) : undefined}
            />
          ))}
        </>
      ) : null}

      <ConfirmHost />
    </View>
  );
}

// Tappable row used by both DRAFTS IN PROGRESS and ALREADY DECIDED.
// Tap anywhere on the card → opens the read-only summary modal. The
// edit / delete IconButtons stop propagation so a tap on those doesn't
// also open the modal.
function DecidedRow({
  t, actingOn, canEdit, canDelete, onEdit, onDelete, onReopen,
}: {
  t: Timesheet;
  actingOn?: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReopen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const busy = actingOn === t.id;
  return (
    <>
      <TouchableRipple onPress={() => setOpen(true)} borderless={false} style={{ borderRadius: 4, marginBottom: 6 }}>
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: theme.colors.text, flex: 1 }}>{t.workerName}</Text>
              <Text style={{ color: theme.colors.textDarker, marginRight: 8 }}>{t.totalHours}h</Text>
              <Chip compact style={{ backgroundColor: statusColor(t.status) }} textStyle={{ color: '#000', fontSize: 10 }}>
                {statusLabel(t.status)}
              </Chip>
              {onReopen && t.status === 'approved' ? (
                <IconButton
                  icon="lock-open-variant" size={18}
                  iconColor={theme.colors.accent}
                  disabled={busy}
                  onPress={(e: any) => { e?.stopPropagation?.(); onReopen(); }}
                  accessibilityLabel="Reopen timesheet"
                />
              ) : null}
              {canEdit ? (
                <IconButton
                  icon="pencil" size={18}
                  iconColor={theme.colors.textDarker}
                  disabled={busy}
                  // Stop the ripple's onPress from re-firing the modal.
                  onPress={(e: any) => { e?.stopPropagation?.(); onEdit(); }}
                  accessibilityLabel="Edit timesheet"
                />
              ) : null}
              {canDelete ? (
                <IconButton
                  icon="delete" size={18}
                  iconColor={theme.colors.textDarker}
                  disabled={busy}
                  onPress={(e: any) => { e?.stopPropagation?.(); onDelete(); }}
                  accessibilityLabel="Delete timesheet"
                />
              ) : null}
            </View>
          </Card.Content>
        </Card>
      </TouchableRipple>
      <TimesheetDetailModal
        visible={open}
        timesheet={t}
        onDismiss={() => setOpen(false)}
      />
    </>
  );
}

function ApprovalCard({
  t, actingOn, onApprove, onReject, onDelete, onEdit,
}: {
  t: Timesheet;
  actingOn?: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete?: (t: Timesheet) => void;
  onEdit?: () => void;
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
          {onEdit ? (
            <IconButton
              icon="pencil"
              size={18}
              iconColor={theme.colors.textDarker}
              disabled={busy}
              onPress={onEdit}
              accessibilityLabel="Edit timesheet"
            />
          ) : null}
          {onDelete ? (
            <IconButton
              icon="delete"
              size={18}
              iconColor={theme.colors.textDarker}
              disabled={busy}
              onPress={() => onDelete(t)}
              accessibilityLabel="Delete timesheet"
            />
          ) : null}
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
        // Full-screen overlay — fills the viewport with margin: 0 +
        // height/width 100% and no maxHeight cap. Inner ScrollView
        // handles overflow.
        contentContainerStyle={{
          backgroundColor: theme.colors.background,
          margin: 0,
          flex: 1,
          width: '100%',
          height: '100%',
          borderRadius: 0,
        }}
        style={{ margin: 0 }}
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
