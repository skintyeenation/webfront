import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { Button, Card, Chip, Divider, HelperText, IconButton, Menu, Modal, Portal, SegmentedButtons, Text, TouchableRipple } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, NoContent, useConfirm } from 'skintyee/components/layout';
import { useAppSelector } from 'skintyee/store';
import { apiFactory } from 'skintyee/store/apis';
import { ExpenseClaim, ExpensePeriod, ExpenseTag } from 'skintyee/models';
import { theme } from 'skintyee/styles';

// ----------------------------------------------------------------------------
// Expenses — the reimbursement twin of Time Keeping. Two role-gated modes on a
// tab:
//
//   • My expenses  — current claim for the period + history dropdown.
//   • Approvals    — workers' submitted claims for a period. Visible to
//                    FINANCE (BandMember.bandGroups includes 'finance')
//                    and admins. Finance/admin approve/reject/reopen.
//
// Each claim is a batch of receipt items (amount/vendor/date/tag), AI-prefilled
// by Claude on upload. Lives on Postgres via /v1/expenses. Mirrors the
// timesheet lifecycle (draft → submitted → approved | rejected + reopen).
// See docs/features/expenses.md.
// ----------------------------------------------------------------------------

type Tab = 'mine' | 'approvals';

const statusColor = (s?: string) =>
  s === 'approved' ? theme.colors.success
  : s === 'rejected' ? theme.colors.error
  : s === 'submitted' ? theme.colors.accent
  : theme.colors.secondary;

const statusLabel = (s?: string) => (s || 'draft').toUpperCase();

export const money = (n?: number, cur = 'CAD') =>
  `${cur === 'CAD' ? '$' : cur + ' '}${(Number(n) || 0).toFixed(2)}`;

export default function Expenses({ navigation }: any) {
  const role = useAppSelector((s) => s.auth.role);
  const myUpn = (useAppSelector((s) => s.auth.user?.upn) || '').toLowerCase();
  const directoryEntities = useAppSelector((s) => s.directory.entities);
  const me = (directoryEntities as any[]).find((m) => (m.upn ?? '').toLowerCase() === myUpn);
  const myBandGroups: string[] = (me?.bandGroups ?? []) as string[];
  // Finance OR admin can approve expenses (mirrors the api/ assertCanApprove).
  const canApprove = role === 'admin' || myBandGroups.includes('finance');

  const [tab, setTab] = useState<Tab>('mine');
  const [recent, setRecent] = useState<ExpensePeriod[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<ExpensePeriod | undefined>();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>();
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);

  const [myCurrent, setMyCurrent] = useState<ExpenseClaim | null>(null);
  const [myHistory, setMyHistory] = useState<ExpenseClaim[]>([]);
  const [allClaims, setAllClaims] = useState<ExpenseClaim[]>([]);
  const [eligiblePeople, setEligiblePeople] = useState<Array<{ personId: string; workerUpn: string; workerName: string; isBandMember: boolean }>>([]);
  const [tags, setTags] = useState<ExpenseTag[]>([]);
  const [meEligibleNow, setMeEligibleNow] = useState<boolean | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [actingOn, setActingOn] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const api = apiFactory();
        const [periods, eligible, tagList] = await Promise.all([
          api.expenses.periods(),
          api.expenses.meEligible().catch(() => ({ eligible: false, upn: '' })),
          api.expenses.tags().catch(() => []),
        ]);
        if (cancelled) return;
        setRecent(periods.recent);
        setCurrentPeriod(periods.current);
        setSelectedPeriodId((prev) => prev ?? periods.current.id);
        setMeEligibleNow(!!eligible.eligible);
        setTags(tagList);
        if (!eligible.eligible && canApprove) setTab('approvals');
        else if (!canApprove) setTab('mine');
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!selectedPeriodId) return;
      let cancelled = false;
      (async () => {
        setError(undefined);
        try {
          const api = apiFactory();
          if (tab === 'mine') {
            const my = await api.expenses.myClaims(selectedPeriodId);
            if (cancelled) return;
            setMyCurrent(my.current);
            setMyHistory(my.history);
          } else {
            const [all, roster] = await Promise.all([
              api.expenses.allClaims(selectedPeriodId),
              api.expenses.eligiblePeople().catch(() => []),
            ]);
            if (cancelled) return;
            setAllClaims(all);
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
  const pendingCount = useMemo(() => allClaims.filter((c) => c.status === 'submitted').length, [allClaims]);

  const act = async (fn: () => Promise<ExpenseClaim>, id: string) => {
    setActingOn(id); setError(undefined);
    try {
      const updated = await fn();
      setAllClaims((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setActingOn(undefined); }
  };
  const onApprove = (id: string) => act(() => apiFactory().expenses.approve(id), id);
  const onReject = (id: string) => act(() => apiFactory().expenses.reject(id), id);
  const onReopen = (id: string) => act(() => apiFactory().expenses.reopen(id), id);
  const onDelete = async (c: ExpenseClaim) => {
    setActingOn(c.id); setError(undefined);
    try {
      await apiFactory().expenses.deleteClaim(c.id);
      setAllClaims((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setActingOn(undefined); }
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
        {canApprove && meEligibleNow ? (
          <SegmentedButtons
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            style={{ marginBottom: 12 }}
            density="small"
            buttons={[
              { value: 'mine', label: 'My expenses', icon: 'receipt' },
              { value: 'approvals', label: `Approvals${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: 'check-decagram' },
            ]}
          />
        ) : null}

        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Menu
              visible={periodMenuOpen}
              onDismiss={() => setPeriodMenuOpen(false)}
              anchor={
                <Button
                  mode="outlined" icon="calendar-range"
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
                  onPress={() => { setSelectedPeriodId(p.id); setPeriodMenuOpen(false); }}
                />
              ))}
            </Menu>
            <View style={{ flex: 1 }} />
            {tab === 'approvals' ? (
              <Button
                mode="contained" icon="file-chart"
                buttonColor={theme.colors.primary} textColor="#fff"
                onPress={() => navigation.navigate('expenseReports')}
              >
                Open Reports
              </Button>
            ) : null}
          </View>
          {selectedPeriod ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 6 }}>
              Cutoff Fri {dayjs(selectedPeriod.endISO).format('MMM D')} · Reimburse by Fri {dayjs(selectedPeriod.payDateISO).format('MMM D')}
            </Text>
          ) : null}
        </View>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        {tab === 'mine' || !canApprove ? (
          <MyExpensesView
            navigation={navigation}
            period={selectedPeriod}
            current={myCurrent}
            history={myHistory}
            currentPeriodId={currentPeriod?.id}
            tags={tags}
          />
        ) : (
          <ApprovalsView
            claims={allClaims}
            eligiblePeople={eligiblePeople}
            tags={tags}
            actingOn={actingOn}
            onApprove={onApprove}
            onReject={onReject}
            onReopen={onReopen}
            onDelete={onDelete}
            canDelete={role === 'admin'}
            canManageTags={role === 'admin'}
            navigation={navigation}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}

// ---- My expenses view ------------------------------------------------------
function MyExpensesView({
  navigation, period, current, history, currentPeriodId, tags,
}: {
  navigation: any;
  period?: ExpensePeriod;
  current: ExpenseClaim | null;
  history: ExpenseClaim[];
  currentPeriodId?: string;
  tags: ExpenseTag[];
}) {
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
              <Text style={{ color: theme.colors.primary, fontSize: 22 }}>{money(current?.totalAmount, current?.currency)}</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Claimed</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 22 }}>{current?.items?.length ?? 0}</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Receipts</Text>
            </View>
          </View>

          {current?.rejectedReason ? (
            <Text style={{ color: theme.colors.error, fontSize: 12, marginTop: 8 }}>Rejected: {current.rejectedReason}</Text>
          ) : null}

          <Button
            mode={editable ? 'contained' : 'outlined'}
            icon={editable ? 'pencil' : 'eye-outline'}
            buttonColor={editable ? theme.colors.primary : undefined}
            textColor={editable ? '#000' : theme.colors.text}
            onPress={() => {
              if (current?.status === 'approved') setSummaryOpen(true);
              else navigation.navigate('expenseCreate', { periodId: period.id });
            }}
            style={{ marginTop: 12, alignSelf: 'flex-start', borderColor: theme.colors.secondary }}
          >
            {editable ? 'Edit / submit' : 'View'}
          </Button>
        </Card.Content>
      </Card>

      {current ? (
        <ClaimDetailModal visible={summaryOpen} claim={current} tags={tags} onDismiss={() => setSummaryOpen(false)} />
      ) : null}

      {history.length > 0 ? (
        <View>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 8, marginBottom: 6 }}>HISTORY</Text>
          {history.map((c) => (
            <HistoryRow key={c.id} c={c} tags={tags} navigation={navigation} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---- Approvals view --------------------------------------------------------
function ApprovalsView({
  claims, eligiblePeople, tags, actingOn, onApprove, onReject, onReopen, onDelete, canDelete, canManageTags, navigation,
}: {
  claims: ExpenseClaim[];
  eligiblePeople: Array<{ personId: string; workerUpn: string; workerName: string; isBandMember: boolean }>;
  tags: ExpenseTag[];
  actingOn?: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReopen: (id: string) => void;
  onDelete: (c: ExpenseClaim) => void;
  canDelete: boolean;
  canManageTags: boolean;
  navigation: any;
}) {
  const { confirm, ConfirmHost } = useConfirm();
  const openEdit = (c: ExpenseClaim) =>
    navigation?.navigate?.('expenseCreate', { adminEditId: c.id, workerLabel: c.submitterName });

  const askDelete = (c: ExpenseClaim) =>
    confirm({
      title: 'Delete claim?',
      message: `${c.submitterName}'s ${money(c.totalAmount, c.currency)} claim for ${c.payPeriodId} will be permanently removed.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => onDelete(c),
    });

  const drafts    = claims.filter((c) => c.status === 'draft');
  const submitted = claims.filter((c) => c.status === 'submitted');
  const done      = claims.filter((c) => c.status === 'approved' || c.status === 'rejected');
  const accountedFor = new Set(claims.map((c) => c.submitterUpn));
  const notStarted = eligiblePeople.filter((p) => !accountedFor.has(p.workerUpn));

  return (
    <View>
      {canManageTags ? (
        <Button
          compact mode="text" icon="tag-multiple"
          textColor={theme.colors.primary}
          onPress={() => navigation.navigate('expenseTags')}
          style={{ alignSelf: 'flex-start', marginBottom: 4 }}
        >
          Manage expense tags
        </Button>
      ) : null}

      {claims.length === 0 && notStarted.length === 0 ? (
        <NoContent message="No people enabled for expenses. Enable it under People (Expenses toggle)." />
      ) : null}

      <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
        PENDING ({submitted.length})
      </Text>
      {submitted.length === 0 ? (
        <Text style={{ color: theme.colors.textDarker, marginBottom: 12, fontSize: 12 }}>Nothing waiting. Inbox zero.</Text>
      ) : (
        submitted.map((c) => (
          <ApprovalCard
            key={c.id} c={c} tags={tags} actingOn={actingOn}
            onApprove={onApprove} onReject={onReject}
            onDelete={canDelete ? askDelete : undefined}
            onEdit={canDelete ? () => openEdit(c) : undefined}
          />
        ))
      )}

      {notStarted.length > 0 && canDelete ? (
        <>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 6 }}>
            NOT STARTED ({notStarted.length})
          </Text>
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 6 }}>
            People enabled for expenses without a claim this period yet.
          </Text>
          {notStarted.map((p) => (
            <Card key={p.personId} style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 6 }}>
              <Card.Content>
                <Text style={{ color: theme.colors.text }}>{p.workerName}</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{p.workerUpn}</Text>
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
          {drafts.map((c) => (
            <DecidedRow
              key={c.id} c={c} tags={tags} actingOn={actingOn}
              canEdit={canDelete} canDelete={canDelete}
              onEdit={() => openEdit(c)} onDelete={() => askDelete(c)}
            />
          ))}
        </>
      ) : null}

      {done.length > 0 ? (
        <>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 6 }}>
            ALREADY DECIDED ({done.length})
          </Text>
          {done.map((c) => (
            <DecidedRow
              key={c.id} c={c} tags={tags} actingOn={actingOn}
              canEdit={canDelete && c.status !== 'approved'} canDelete={canDelete}
              onEdit={() => openEdit(c)} onDelete={() => askDelete(c)}
              onReopen={canDelete ? () => onReopen(c.id) : undefined}
            />
          ))}
        </>
      ) : null}

      <ConfirmHost />
    </View>
  );
}

function DecidedRow({
  c, tags, actingOn, canEdit, canDelete, onEdit, onDelete, onReopen,
}: {
  c: ExpenseClaim; tags: ExpenseTag[]; actingOn?: string;
  canEdit: boolean; canDelete: boolean;
  onEdit: () => void; onDelete: () => void; onReopen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const busy = actingOn === c.id;
  return (
    <>
      <TouchableRipple onPress={() => setOpen(true)} borderless={false} style={{ borderRadius: 4, marginBottom: 6 }}>
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: theme.colors.text, flex: 1 }}>{c.submitterName}</Text>
              <Text style={{ color: theme.colors.textDarker, marginRight: 8 }}>{money(c.totalAmount, c.currency)}</Text>
              <Chip compact style={{ backgroundColor: statusColor(c.status) }} textStyle={{ color: '#000', fontSize: 10 }}>
                {statusLabel(c.status)}
              </Chip>
              {onReopen && c.status === 'approved' ? (
                <IconButton icon="lock-open-variant" size={18} iconColor={theme.colors.accent} disabled={busy}
                  onPress={(e: any) => { e?.stopPropagation?.(); onReopen(); }} accessibilityLabel="Reopen claim" />
              ) : null}
              {canEdit ? (
                <IconButton icon="pencil" size={18} iconColor={theme.colors.textDarker} disabled={busy}
                  onPress={(e: any) => { e?.stopPropagation?.(); onEdit(); }} accessibilityLabel="Edit claim" />
              ) : null}
              {canDelete ? (
                <IconButton icon="delete" size={18} iconColor={theme.colors.textDarker} disabled={busy}
                  onPress={(e: any) => { e?.stopPropagation?.(); onDelete(); }} accessibilityLabel="Delete claim" />
              ) : null}
            </View>
          </Card.Content>
        </Card>
      </TouchableRipple>
      <ClaimDetailModal visible={open} claim={c} tags={tags} onDismiss={() => setOpen(false)} />
    </>
  );
}

function ApprovalCard({
  c, tags, actingOn, onApprove, onReject, onDelete, onEdit,
}: {
  c: ExpenseClaim; tags: ExpenseTag[]; actingOn?: string;
  onApprove: (id: string) => void; onReject: (id: string) => void;
  onDelete?: (c: ExpenseClaim) => void; onEdit?: () => void;
}) {
  const busy = actingOn === c.id;
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: theme.colors.accent }}>
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>{c.submitterName}</Text>
          <Chip compact icon="receipt" style={{ backgroundColor: theme.colors.secondary, marginRight: 6 }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
            {c.items?.length ?? 0}
          </Chip>
          <Text style={{ color: theme.colors.textDarker }}>{money(c.totalAmount, c.currency)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Button mode="contained" compact icon="check" buttonColor={theme.colors.success} textColor="#000"
            disabled={busy} loading={busy} onPress={() => onApprove(c.id)} style={{ marginRight: 8 }}>
            Approve
          </Button>
          <Button mode="outlined" compact icon="close" textColor={theme.colors.error}
            disabled={busy} onPress={() => onReject(c.id)} style={{ borderColor: theme.colors.error, marginRight: 8 }}>
            Reject
          </Button>
          <IconButton icon="information-outline" size={20} iconColor={theme.colors.textDarker} onPress={() => setDetailOpen(true)} />
          {onEdit ? (
            <IconButton icon="pencil" size={18} iconColor={theme.colors.textDarker} disabled={busy} onPress={onEdit} accessibilityLabel="Edit claim" />
          ) : null}
          {onDelete ? (
            <IconButton icon="delete" size={18} iconColor={theme.colors.textDarker} disabled={busy} onPress={() => onDelete(c)} accessibilityLabel="Delete claim" />
          ) : null}
        </View>
        <ClaimDetailModal visible={detailOpen} claim={c} tags={tags} onDismiss={() => setDetailOpen(false)} />
      </Card.Content>
    </Card>
  );
}

function HistoryRow({ c, tags, navigation }: { c: ExpenseClaim; tags: ExpenseTag[]; navigation: any }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 6 }}>
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => setOpen(true)}>
            <Text style={{ color: theme.colors.text, flex: 1 }}>{dayjs(c.payPeriodId).format('MMM D, YYYY')}</Text>
            <Text style={{ color: theme.colors.textDarker, marginRight: 8 }}>{money(c.totalAmount, c.currency)}</Text>
            <Chip compact style={{ backgroundColor: statusColor(c.status) }} textStyle={{ color: '#000', fontSize: 10 }}>
              {statusLabel(c.status)}
            </Chip>
          </TouchableOpacity>
          <IconButton icon="information-outline" size={18} iconColor={theme.colors.textDarker} onPress={() => setOpen(true)} />
        </View>
      </Card.Content>
      <ClaimDetailModal visible={open} claim={c} tags={tags} onDismiss={() => setOpen(false)} />
    </Card>
  );
}

// ---- Read-only detail modal — shared by every card ------------------------
function ClaimDetailModal({
  visible, claim, tags, onDismiss,
}: { visible: boolean; claim: ExpenseClaim; tags: ExpenseTag[]; onDismiss: () => void }) {
  const tagLabel = (slug?: string | null) => tags.find((t) => t.slug === slug)?.label ?? slug ?? '—';
  const items = (claim.items ?? []).slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{ backgroundColor: theme.colors.background, margin: 0, flex: 1, width: '100%', height: '100%', borderRadius: 0 }}
        style={{ margin: 0 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.secondary }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600' }}>{claim.submitterName}</Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
              Period {dayjs(claim.payPeriodId).format('MMM D, YYYY')}
            </Text>
          </View>
          <Chip compact style={{ backgroundColor: statusColor(claim.status), marginRight: 8 }} textStyle={{ color: '#000', fontSize: 10 }}>
            {statusLabel(claim.status)}
          </Chip>
          <IconButton icon="close" size={20} iconColor={theme.colors.text} onPress={onDismiss} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {claim.notes ? (
            <View style={{ marginBottom: 12, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: theme.colors.primary }}>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>NOTES</Text>
              <Text style={{ color: theme.colors.text, fontSize: 14 }}>{claim.notes}</Text>
            </View>
          ) : (
            <Text style={{ color: theme.colors.textDarker, fontStyle: 'italic', marginBottom: 12 }}>No notes.</Text>
          )}

          {claim.rejectedReason ? (
            <View style={{ marginBottom: 12, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: theme.colors.error }}>
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>REJECTION REASON</Text>
              <Text style={{ color: theme.colors.error, fontSize: 14 }}>{claim.rejectedReason}</Text>
            </View>
          ) : null}

          <Text style={{ color: theme.colors.primary, fontSize: 26, marginBottom: 12 }}>{money(claim.totalAmount, claim.currency)}</Text>

          <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>RECEIPTS ({items.length})</Text>
          {items.length === 0 ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>No receipts.</Text>
          ) : (
            items.map((it) => (
              <View key={it.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 13 }}>
                      {it.vendor || 'Unknown vendor'}
                      {it.aiExtracted ? '  ✨' : ''}
                    </Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>
                      {it.date ? dayjs(it.date).format('MMM D') : 'No date'} · {tagLabel(it.tagSlug)}
                      {it.description ? ` · ${it.description}` : ''}
                    </Text>
                  </View>
                  <Text style={{ color: theme.colors.text, fontSize: 13 }}>{money(it.amount, it.currency || claim.currency)}</Text>
                </View>
                {it.lineItems && it.lineItems.length > 0 ? (
                  <View style={{ marginTop: 4, paddingLeft: 10 }}>
                    {it.lineItems.map((li, i) => {
                      // Hide AI tax/total summary rows — tax + total come from the
                      // item fields below (no duplication). Keep subtotal + items.
                      const isSub = /sub[\s-]*total/i.test(li.description ?? '');
                      const isHiddenSummary = !isSub && /^\s*(total|balance(\s*due)?|amount\s*due|change|tax|gst|hst|pst|qst|tip|gratuity|rounding|cash|visa|mastercard|debit|credit|payment|due)\b/i.test(li.description ?? '');
                      if (isHiddenSummary) return null;
                      const ex = !!li.excluded;
                      return (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 1, opacity: ex ? 0.5 : 1 }}>
                          <Text style={{ color: theme.colors.textDarker, fontSize: 11, flex: 1, fontWeight: isSub ? '600' : '400', textDecorationLine: ex ? 'line-through' : 'none' }} numberOfLines={1}>
                            · {isSub ? 'Subtotal' : `${li.qty && li.qty > 1 ? `${li.qty}× ` : ''}${li.description}`}{ex ? ' (excluded)' : ''}
                          </Text>
                          {li.amount != null ? (
                            <Text style={{ color: theme.colors.textDarker, fontSize: 11, fontWeight: isSub ? '600' : '400', textDecorationLine: ex ? 'line-through' : 'none' }}>{money(li.amount, it.currency || claim.currency)}</Text>
                          ) : null}
                        </View>
                      );
                    })}
                    {it.taxAmount != null ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 1 }}>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 11, flex: 1 }}>· Tax</Text>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{money(it.taxAmount, it.currency || claim.currency)}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))
          )}

          <Divider style={{ marginVertical: 12 }} />
          {claim.submittedAt ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 4 }}>
              Submitted {dayjs(claim.submittedAt).format('ddd MMM D, YYYY · h:mm A')}
            </Text>
          ) : null}
          {claim.approvedBy && claim.approvedAt ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 4 }}>
              {claim.status === 'rejected' ? 'Rejected' : 'Approved'} by {claim.approvedBy} · {dayjs(claim.approvedAt).format('MMM D, h:mm A')}
            </Text>
          ) : null}
        </ScrollView>
      </Modal>
    </Portal>
  );
}
