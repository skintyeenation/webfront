import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ActivityIndicator as Spinner, Button, Card, Chip, HelperText, IconButton, Menu, Snackbar, Text, TextInput } from 'react-native-paper';
import dayjs from 'dayjs';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppSelector } from 'skintyee/store';
import { apiFactory } from 'skintyee/store/apis';
import { ExpenseClaim, ExpenseItem, ExpensePeriod, ExpenseTag } from 'skintyee/models';
import { theme } from 'skintyee/styles';
import { takePhoto, pickImage, pickFile, PickedReceipt } from 'skintyee/core/receiptCapture';

// ----------------------------------------------------------------------------
// Add / edit an expense claim for a period — the reimbursement twin of
// AddTimesheet. A claim is a batch of receipt items. Unlike the timesheet
// (which batches all entries on save), each receipt PERSISTS the moment it's
// uploaded: the api/ stores the file, runs Claude vision to pre-fill
// amount/vendor/date + suggest a tag, and returns the saved ExpenseItem.
//
// The worker then reviews/corrects each field (persisted on blur) and re-tags
// from the catalog. Claim-level Notes + Submit live at the bottom. Admin/finance
// land here in edit mode from the Approvals tab; approved claims are read-only.
// ----------------------------------------------------------------------------

const money = (n?: number, cur = 'CAD') => `${cur === 'CAD' ? '$' : cur + ' '}${(Number(n) || 0).toFixed(2)}`;

export default function AddExpense({ navigation, route }: any) {
  const isSignedIn = useAppSelector((s) => s.auth.signedIn);
  const targetPeriodId: string | undefined = route?.params?.periodId;
  const adminEditId: string | undefined = route?.params?.adminEditId;
  const adminEditFor: string | undefined = route?.params?.workerLabel;
  const adminEditMode = !!adminEditId;

  useEffect(() => {
    navigation?.setOptions?.({
      title: adminEditMode ? (adminEditFor ? `Edit claim · ${adminEditFor}` : 'Edit claim') : 'Expense claim',
    });
  }, [navigation, adminEditMode, adminEditFor]);

  const [period, setPeriod] = useState<ExpensePeriod | undefined>();
  const [claim, setClaim] = useState<ExpenseClaim | null>(null);
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [tags, setTags] = useState<ExpenseTag[]>([]);
  const [notes, setNotes] = useState('');
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [eligibleUpn, setEligibleUpn] = useState('');

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submittedMode, setSubmittedMode] = useState<'draft' | 'submit' | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const api = apiFactory();
        const tagList = await api.expenses.tags(true).catch(() => [] as ExpenseTag[]);
        if (cancelled) return;
        setTags(tagList);

        if (adminEditMode && adminEditId) {
          setEligible(true); // admin-edit bypasses the worker gate
          const [periods, c] = await Promise.all([api.expenses.periods(), api.expenses.adminGetClaim(adminEditId)]);
          if (cancelled) return;
          setPeriod(periods.recent.find((p) => p.id === c.payPeriodId) ?? periods.current);
          setClaim(c); setItems(c.items ?? []); setNotes(c.notes ?? '');
        } else {
          const elig = await api.expenses.meEligible().catch(() => ({ eligible: true, upn: '' }));
          if (cancelled) return;
          setEligible(elig.eligible); setEligibleUpn(elig.upn);
          if (!elig.eligible) {
            const periods = await api.expenses.periods();
            if (!cancelled) setPeriod(periods.current);
            return;
          }
          // Idempotently get-or-create the caller's draft claim for the period.
          const c = await api.expenses.start(targetPeriodId);
          const periods = await api.expenses.periods();
          if (cancelled) return;
          setPeriod(periods.recent.find((p) => p.id === c.payPeriodId) ?? periods.current);
          setClaim(c); setItems(c.items ?? []); setNotes(c.notes ?? '');
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [targetPeriodId, adminEditMode, adminEditId]);

  const locked = !adminEditMode && claim?.status === 'approved';
  const total = useMemo(() => items.reduce((s, it) => s + (Number(it.amount) || 0), 0), [items]);

  const addReceipt = async (pick: () => Promise<PickedReceipt | null>) => {
    setAddMenuOpen(false);
    if (!claim) return;
    setError(undefined);
    try {
      const file = await pick();
      if (!file) return;
      setUploading(true);
      const { item } = await apiFactory().expenses.addReceipt(claim.id, file, {});
      setItems((prev) => [...prev, item]);
      setToast(item.aiExtracted ? 'Receipt read by AI — review the details' : 'Receipt added');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  };

  // Manual line (no file) — for cash items with a lost receipt.
  const addManual = async () => {
    setAddMenuOpen(false);
    if (!claim) return;
    setError(undefined);
    try {
      setUploading(true);
      const { item } = await apiFactory().expenses.addReceipt(claim.id, null, { amount: 0 });
      setItems((prev) => [...prev, item]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  };

  const patchItem = (id: string, patch: Partial<ExpenseItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const persistItem = async (id: string, patch: { date?: string; vendor?: string; amount?: number; tagSlug?: string; description?: string }) => {
    try {
      const saved = await apiFactory().expenses.updateItem(id, patch);
      patchItem(id, saved);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const removeItem = async (id: string) => {
    setError(undefined);
    try {
      await apiFactory().expenses.deleteItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const persist = async (mode: 'draft' | 'submit') => {
    if (!claim) return;
    setSaving(true); setError(undefined); setSubmittedMode(mode);
    try {
      const api = apiFactory();
      const updated = await api.expenses.updateClaim(claim.id, { notes: notes.trim() || undefined });
      setClaim(updated);
      if (mode === 'submit' && !adminEditMode) {
        if (items.length === 0) throw new Error('Add at least one receipt before submitting.');
        const submitted = await api.expenses.submit(claim.id);
        setClaim(submitted);
        setToast('Submitted for approval');
        setTimeout(() => navigation?.goBack?.(), 900);
      } else {
        setToast(adminEditMode ? 'Edits saved' : 'Saved');
        if (adminEditMode) setTimeout(() => navigation?.goBack?.(), 900);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
      if (mode === 'draft') setSubmittedMode(null);
    }
  };

  if (!isSignedIn) {
    return (<PageContainer><PageContent><Text style={{ color: theme.colors.text }}>Sign in to submit expenses.</Text></PageContent></PageContainer>);
  }
  if (!adminEditMode && eligible === false) {
    return (
      <PageContainer><PageContent>
        <Text style={{ color: theme.colors.text, fontSize: 16 }}>Not enabled for expenses</Text>
        <HelperText type="info" visible style={{ marginLeft: -8, marginTop: 6 }}>
          Your account ({eligibleUpn || 'unknown'}) isn't enabled for expenses. Ask an admin to enable it
          under People with the "Enable Expenses" toggle on.
        </HelperText>
      </PageContent></PageContainer>
    );
  }
  if (loading || !period || !claim) {
    return (<PageContainer><PageContent><ActivityIndicator style={{ marginVertical: 24 }} /></PageContent></PageContainer>);
  }

  const statusColor = (s?: string) =>
    s === 'approved' ? theme.colors.success : s === 'rejected' ? theme.colors.error
    : s === 'submitted' ? theme.colors.accent : theme.colors.secondary;

  // Submit opens on cutoff Friday or after (mirrors the timesheet gate).
  const today = dayjs().startOf('day');
  const cutoff = dayjs(period.endISO).startOf('day');
  const submitOpen = today.isSame(cutoff) || today.isAfter(cutoff);

  return (
    <PageContainer>
      <PageContent>
        {/* Period + status header */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 16 }}>Period {period.label}</Text>
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>
                  Cutoff Fri {dayjs(period.endISO).format('MMM D')} · Reimburse Fri {dayjs(period.payDateISO).format('MMM D')}
                </Text>
              </View>
              <Chip compact style={{ backgroundColor: statusColor(claim.status) }} textStyle={{ color: '#000', fontSize: 11 }}>
                {claim.status}
              </Chip>
            </View>
            {claim.rejectedReason ? (
              <Text style={{ color: theme.colors.error, fontSize: 12, marginTop: 8 }}>Rejected: {claim.rejectedReason}</Text>
            ) : null}
          </Card.Content>
        </Card>

        {/* Add-receipt CTA */}
        {!locked ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Menu
              visible={addMenuOpen}
              onDismiss={() => setAddMenuOpen(false)}
              anchor={
                <Button
                  mode="contained" icon="camera-plus"
                  buttonColor={theme.colors.primary} textColor="#fff"
                  onPress={() => setAddMenuOpen(true)}
                  disabled={uploading}
                >
                  Add receipt
                </Button>
              }
            >
              <Menu.Item leadingIcon="camera" title="Take photo" onPress={() => addReceipt(takePhoto)} />
              <Menu.Item leadingIcon="image-multiple" title="Choose from library" onPress={() => addReceipt(pickImage)} />
              <Menu.Item leadingIcon="file-document" title="Pick a file (PDF/image)" onPress={() => addReceipt(pickFile)} />
              <Menu.Item leadingIcon="pencil-plus" title="Add manual line (no receipt)" onPress={addManual} />
            </Menu>
            {uploading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
                <Spinner size={16} />
                <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginLeft: 6 }}>Reading receipt…</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Receipt items */}
        {items.length === 0 ? (
          <Text style={{ color: theme.colors.textDarker, fontStyle: 'italic', marginBottom: 12 }}>
            No receipts yet. Tap “Add receipt” to photograph one — Claude reads the amount, vendor and date for you.
          </Text>
        ) : (
          items.map((it) => (
            <ReceiptRow
              key={it.id} item={it} tags={tags} currency={claim.currency} locked={locked}
              onPatch={(p) => patchItem(it.id, p)}
              onPersist={(p) => persistItem(it.id, p)}
              onRemove={() => removeItem(it.id)}
            />
          ))
        )}

        {/* Notes */}
        <TextInput
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          editable={!locked}
          mode="outlined"
          multiline numberOfLines={3}
          style={{ marginTop: 12, marginBottom: 12 }}
        />

        {/* Total */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
          <Card.Content>
            <Text style={{ color: theme.colors.primary, fontSize: 24 }}>{money(total, claim.currency)}</Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Claim total · {items.length} receipt{items.length === 1 ? '' : 's'}</Text>
          </Card.Content>
        </Card>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}

        {/* Actions */}
        {locked ? (
          <HelperText type="info" visible style={{ marginLeft: -8, marginTop: 8 }}>
            This claim is approved and locked. Ask finance/an admin to reopen it if a change is needed.
          </HelperText>
        ) : adminEditMode ? (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button mode="contained" icon="content-save" buttonColor={theme.colors.primary} textColor="#fff"
              onPress={() => persist('draft')} disabled={saving} loading={saving}>
              Save edits
            </Button>
          </View>
        ) : (
          <>
            {!submitOpen ? (
              <HelperText type="info" visible style={{ marginLeft: -8 }}>
                Submit opens on cutoff day · Fri {cutoff.format('MMM D')} ({cutoff.diff(today, 'day')} days away). Save your draft any time.
              </HelperText>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap' }}>
              <Button mode="outlined" icon="content-save-outline" onPress={() => persist('draft')}
                disabled={saving} loading={saving && submittedMode === 'draft'} textColor={theme.colors.text} style={{ marginBottom: 6 }}>
                Save
              </Button>
              <Button mode="contained" icon="send" buttonColor={theme.colors.primary} textColor="#000"
                onPress={() => persist('submit')}
                disabled={saving || items.length === 0 || !submitOpen}
                loading={saving && submittedMode === 'submit'} style={{ marginBottom: 6 }}>
                Submit
              </Button>
            </View>
          </>
        )}

        <Snackbar
          visible={toast !== null}
          onDismiss={() => setToast(null)}
          duration={2200}
          wrapperStyle={{ alignItems: 'center' }}
          style={{ backgroundColor: theme.colors.success, alignSelf: 'center', width: '100%', maxWidth: 420 }}
        >
          <Text style={{ color: '#000', textAlign: 'center', width: '100%' }}>{toast ?? ''}</Text>
        </Snackbar>
      </PageContent>
    </PageContainer>
  );
}

// ---- One receipt line — editable fields persisted on blur ------------------
function ReceiptRow({
  item, tags, currency, locked, onPatch, onPersist, onRemove,
}: {
  item: ExpenseItem;
  tags: ExpenseTag[];
  currency: string;
  locked: boolean;
  onPatch: (patch: Partial<ExpenseItem>) => void;
  onPersist: (patch: { date?: string; vendor?: string; amount?: number; tagSlug?: string; description?: string }) => void;
  onRemove: () => void;
}) {
  const [tagMenu, setTagMenu] = useState(false);
  const tagLabel = tags.find((t) => t.slug === item.tagSlug)?.label;
  const amountStr = item.amount != null ? String(item.amount) : '';

  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 8 }}>
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, flex: 1 }}>
            RECEIPT{item.aiExtracted ? ' · ✨ AI-read' : ''}
          </Text>
          {item.fileUrl ? (
            <Chip compact icon="paperclip" style={{ backgroundColor: theme.colors.secondary, marginRight: 4 }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
              {item.mimeType?.includes('pdf') ? 'PDF' : 'Image'}
            </Chip>
          ) : null}
          {!locked ? (
            <IconButton icon="delete" size={18} iconColor={theme.colors.textDarker} onPress={onRemove} accessibilityLabel="Remove receipt" />
          ) : null}
        </View>

        <View style={{ flexDirection: 'row' }}>
          <TextInput
            dense mode="outlined" label="Vendor" value={item.vendor ?? ''}
            editable={!locked}
            onChangeText={(v) => onPatch({ vendor: v })}
            onEndEditing={() => onPersist({ vendor: item.vendor ?? '' })}
            style={{ flex: 2, marginRight: 6 }}
          />
          <TextInput
            dense mode="outlined" label={`Amount (${currency})`} value={amountStr}
            editable={!locked}
            keyboardType="decimal-pad"
            onChangeText={(v) => onPatch({ amount: Number(v.replace(/[^0-9.]/g, '')) || 0 })}
            onEndEditing={() => onPersist({ amount: Number(item.amount) || 0 })}
            style={{ flex: 1 }}
          />
        </View>

        <View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'center' }}>
          <TextInput
            dense mode="outlined" label="Date (YYYY-MM-DD)" value={item.date ?? ''}
            editable={!locked}
            placeholder="2026-06-15"
            onChangeText={(v) => onPatch({ date: v })}
            onEndEditing={() => onPersist({ date: item.date ?? '' })}
            style={{ flex: 1, marginRight: 6 }}
          />
          <Menu
            visible={tagMenu}
            onDismiss={() => setTagMenu(false)}
            anchor={
              <Button
                mode="outlined" compact icon="tag" textColor={theme.colors.text}
                onPress={() => setTagMenu(true)} disabled={locked}
                style={{ borderColor: theme.colors.secondary, flex: 1 }}
              >
                {tagLabel ?? 'Tag'}
              </Button>
            }
          >
            {tags.map((t) => (
              <Menu.Item
                key={t.slug} title={t.glAccount ? `${t.label}  ·  GL ${t.glAccount}` : t.label}
                onPress={() => { setTagMenu(false); onPatch({ tagSlug: t.slug }); onPersist({ tagSlug: t.slug }); }}
              />
            ))}
          </Menu>
        </View>

        <TextInput
          dense mode="outlined" label="Description (optional)" value={item.description ?? ''}
          editable={!locked}
          onChangeText={(v) => onPatch({ description: v })}
          onEndEditing={() => onPersist({ description: item.description ?? '' })}
          style={{ marginTop: 6 }}
        />
      </Card.Content>
    </Card>
  );
}
