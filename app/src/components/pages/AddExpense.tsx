import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator as Spinner, Button, Card, Chip, HelperText, IconButton, Menu, Modal, Portal, Text, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import dayjs from 'dayjs';
import { PageContainer, PageContent, useToast, useConfirm } from 'skintyee/components/layout';
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
  // Currency support — base + FX table from the api (defaults if not loaded).
  const [fx, setFx] = useState<{ base: string; supported: string[]; toCad: Record<string, number> }>({ base: 'CAD', supported: ['CAD', 'USD'], toCad: { CAD: 1, USD: 1.45 } });
  const toCad = (amt: number, cur?: string | null) => (Number(amt) || 0) * (fx.toCad[(cur || 'CAD').toUpperCase()] ?? 1);
  const [notes, setNotes] = useState('');
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [eligibleUpn, setEligibleUpn] = useState('');

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submittedMode, setSubmittedMode] = useState<'draft' | 'submit' | null>(null);
  const [error, setError] = useState<string | undefined>();
  const { showToast, toastNode } = useToast(5000); // a bit longer so AI status messages are readable
  const { confirm, ConfirmHost } = useConfirm();
  // Receipts uploaded this session but not yet committed via Save/Submit.
  // If the user leaves without saving, these (file + row) are purged so we
  // never leave orphaned uploads behind. Cleared on a successful Save/Submit.
  const uncommittedRef = React.useRef<Set<string>>(new Set());

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
          if ((periods as any).fx) setFx((periods as any).fx);
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
          if ((periods as any).fx) setFx((periods as any).fx);
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
  // Claim total in CAD (base): convert each receipt from its own currency.
  const total = useMemo(() => items.reduce((s, it) => s + toCad(it.amount, it.currency), 0), [items, fx]);
  const hasForeign = useMemo(() => items.some((it) => (it.currency || 'CAD').toUpperCase() !== 'CAD'), [items]);

  const addReceipt = async (pick: () => Promise<PickedReceipt | null>) => {
    setAddMenuOpen(false);
    if (!claim) return;
    setError(undefined);
    try {
      const file = await pick();
      if (!file) return;
      setUploading(true);
      const { item, ai } = await apiFactory().expenses.addReceipt(claim.id, file, {});
      uncommittedRef.current.add(item.id);
      setItems((prev) => [...prev, item]);
      // Tell the submitter what the AI did — or why it didn't (not set up, out
      // of credits, unreadable, …) — instead of silently adding an empty row.
      if (item.aiExtracted) {
        showToast('Receipt read by AI — review the details');
      } else if (ai?.message) {
        showToast(ai.message, 'error');
      } else {
        showToast('AI couldn’t find details on this receipt — enter them manually.', 'error');
      }
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
      uncommittedRef.current.add(item.id);
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
      uncommittedRef.current.delete(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };
  // Always confirm before removing a receipt — it deletes the row + its file.
  const askRemoveItem = (it: ExpenseItem) =>
    confirm({
      title: 'Remove receipt?',
      message: `${it.vendor || 'This receipt'} (${money(it.amount, it.currency || claim?.currency)}) will be permanently removed from the claim.`,
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => removeItem(it.id),
    });

  // Purge uncommitted uploads only when the user actually NAVIGATES AWAY from
  // the screen without saving — via React Navigation's 'beforeRemove'. (A plain
  // unmount effect also fired on hot-reload / incidental re-renders, which
  // deleted in-progress receipts and left stale 404s.) Cleared on Save/Submit,
  // so a saved draft keeps its receipts. Fire-and-forget; deleteItem also
  // removes the stored file, so nothing is orphaned.
  useEffect(() => {
    const unsub = navigation?.addListener?.('beforeRemove', () => {
      const ids = Array.from(uncommittedRef.current);
      if (ids.length === 0) return;
      const api = apiFactory();
      for (const id of ids) api.expenses.deleteItem(id).catch(() => {});
      uncommittedRef.current.clear();
    });
    return unsub;
  }, [navigation]);

  const persist = async (mode: 'draft' | 'submit') => {
    if (!claim) return;
    setSaving(true); setError(undefined); setSubmittedMode(mode);
    try {
      const api = apiFactory();
      const updated = await api.expenses.updateClaim(claim.id, { notes: notes.trim() || undefined });
      setClaim(updated);
      // Saved/submitted → these receipts are now committed; don't purge them.
      uncommittedRef.current.clear();
      if (mode === 'submit' && !adminEditMode) {
        if (items.length === 0) throw new Error('Add at least one receipt before submitting.');
        const submitted = await api.expenses.submit(claim.id);
        setClaim(submitted);
        showToast('Submitted for approval');
        setTimeout(() => navigation?.goBack?.(), 900);
      } else {
        showToast(adminEditMode ? 'Edits saved' : 'Saved');
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

        {!locked ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, paddingLeft: 2 }}>
            <MaterialCommunityIcons name="camera-outline" size={14} color={theme.colors.textDarker} style={{ marginTop: 1, marginRight: 6 }} />
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, flex: 1 }}>
              For best results, scan the receipt — the clearer the photo, the better the AI reads the
              amount, tax, vendor, date and line items.
            </Text>
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
              currencies={fx.supported}
              onPatch={(p) => patchItem(it.id, p)}
              onPersist={(p) => persistItem(it.id, p)}
              onRemove={() => askRemoveItem(it)}
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

        {/* Total — always in CAD (foreign receipts converted). */}
        <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12 }}>
          <Card.Content>
            <Text style={{ color: theme.colors.primary, fontSize: 24 }}>{money(total, 'CAD')}</Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
              Claim total (CAD) · {items.length} receipt{items.length === 1 ? '' : 's'}
              {hasForeign ? ' · foreign receipts converted' : ''}
            </Text>
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

        {toastNode}
        <ConfirmHost />
      </PageContent>
    </PageContainer>
  );
}

// ---- One receipt line — editable fields persisted on blur ------------------
function ReceiptRow({
  item, tags, currency, currencies, locked, onPatch, onPersist, onRemove,
}: {
  item: ExpenseItem;
  tags: ExpenseTag[];
  currency: string;
  currencies: string[];
  locked: boolean;
  onPatch: (patch: Partial<ExpenseItem>) => void;
  onPersist: (patch: { date?: string; vendor?: string; amount?: number; taxAmount?: number | null; currency?: string | null; tagSlug?: string; description?: string; lineItems?: ExpenseItem['lineItems'] }) => void;
  onRemove: () => void;
}) {
  const [tagPicker, setTagPicker] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [curMenu, setCurMenu] = useState(false);
  const tagLabel = tags.find((t) => t.slug === item.tagSlug)?.label;
  const hasReceipt = !!(item.fileUrl || item.fileName || item.mimeType);
  // This receipt's own currency (CAD or USD).
  const cur = (item.currency || 'CAD').toUpperCase();

  // Amount/tax are edited as raw text so a trailing/partial decimal ("12." →
  // "12.5") survives keystrokes — parsing to a Number on every change stripped
  // the dot. We parse only for the live total (onPatch) and on blur (onPersist).
  const [amountText, setAmountText] = useState(item.amount != null ? String(item.amount) : '');
  const [taxText, setTaxText] = useState(item.taxAmount != null ? String(item.taxAmount) : '');
  const lineItems = item.lineItems ?? [];
  const hasLines = lineItems.length > 0;

  const cleanDecimal = (v: string) => {
    let c = v.replace(/[^0-9.]/g, '');
    const dot = c.indexOf('.');
    if (dot !== -1) c = c.slice(0, dot + 1) + c.slice(dot + 1).replace(/\./g, '');
    return c;
  };
  // Subtotal = sum of the real (non-summary) line items.
  const lineSubtotal = () => Math.round(lineItems.filter((l) => !isSummaryLine(l)).reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
  const onAmountChange = (v: string) => {
    const c = cleanDecimal(v);
    setAmountText(c);
    const amt = Number(c) || 0;
    const patch: Partial<ExpenseItem> = { amount: amt };
    // When itemised, editing the total recalculates tax = total − subtotal.
    if (hasLines) {
      const tax = Math.max(0, Math.round((amt - lineSubtotal()) * 100) / 100);
      setTaxText(String(tax));
      patch.taxAmount = tax;
    }
    onPatch(patch);
  };
  const onTaxChange = (v: string) => { const c = cleanDecimal(v); setTaxText(c); onPatch({ taxAmount: c === '' ? null : (Number(c) || 0) }); };

  // The claimed amount = sum of INCLUDED line items (real, non-summary, non-
  // subtotal) + tax (from the Tax form field). Summary rows never count.
  const recomputeFromLines = (lines: NonNullable<ExpenseItem['lineItems']>): number => {
    const sub = lines.filter((l) => !l.excluded && !isSummaryLine(l)).reduce((s, l) => s + (Number(l.amount) || 0), 0);
    return Math.round((sub + (Number(item.taxAmount) || 0)) * 100) / 100;
  };
  // Apply a line edit (include/exclude and/or price), recompute the claimed
  // total from the included items + tax, and persist.
  const applyLineEdit = (idx: number, patch: { excluded?: boolean; amount?: number | null; description?: string }) => {
    if (locked) return;
    const lines = lineItems.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    const newAmount = recomputeFromLines(lines);
    setAmountText(String(newAmount));
    onPatch({ lineItems: lines, amount: newAmount });
    onPersist({ lineItems: lines, amount: newAmount });
  };

  // Line-item editor modal: which line index is open (null = closed).
  const [editorIdx, setEditorIdx] = useState<number | null>(null);

  // Categorise: subtotal line(s) are shown + price-editable; tax/total summary
  // rows from the AI are HIDDEN (we render tax + total from the form fields, so
  // they don't duplicate). Real items are tappable to include/exclude/adjust.
  const isSubtotal = (li?: { description?: string } | null) => !!li && /sub[\s-]*total/i.test(li.description ?? '');
  const isHiddenSummary = (li?: { description?: string; isSummary?: boolean } | null) => isSummaryLine(li) && !isSubtotal(li);

  // Validation: the line items (as read) should add up to the subtotal line.
  const subtotalLine = lineItems.find((l) => isSubtotal(l));
  const itemsSum = Math.round(lineItems.filter((l) => !isSummaryLine(l)).reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
  const subtotalMismatch = subtotalLine && subtotalLine.amount != null
    && Math.abs(itemsSum - (Number(subtotalLine.amount) || 0)) > 0.01;

  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
      <Card.Content>
        {/* Header — tap the chevron to collapse the card to just vendor + amount. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: collapsed ? 0 : 4 }}>
          <TouchableOpacity
            onPress={() => setCollapsed((c) => !c)}
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minHeight: 32 }}
            accessibilityLabel={collapsed ? 'Expand receipt' : 'Collapse receipt'}
          >
            <MaterialCommunityIcons name={collapsed ? 'chevron-right' : 'chevron-down'} size={22} color={theme.colors.textDarker} />
            {collapsed ? (
              <>
                <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
                  {item.vendor || 'Receipt'}{item.aiExtracted ? '  ✨' : ''}
                </Text>
                <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginLeft: 8, marginRight: 14 }}>
                  {money(item.amount, cur)}
                </Text>
              </>
            ) : (
              <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, flex: 1 }}>
                RECEIPT{item.aiExtracted ? ' · ✨ AI-read' : ''}
              </Text>
            )}
          </TouchableOpacity>
          {hasReceipt ? <ReceiptAttachment item={item} /> : null}
          {!locked ? (
            <IconButton icon="delete" size={18} iconColor={theme.colors.textDarker} onPress={onRemove} accessibilityLabel="Remove receipt" />
          ) : null}
        </View>

        {collapsed ? null : (
        <>
        <View style={{ flexDirection: 'row' }}>
          <TextInput
            dense mode="outlined" label="Vendor" value={item.vendor ?? ''}
            editable={!locked}
            onChangeText={(v) => onPatch({ vendor: v })}
            onEndEditing={() => onPersist({ vendor: item.vendor ?? '' })}
            style={{ flex: 2, marginRight: 6 }}
          />
          <TextInput
            dense mode="outlined" label="Amount" value={amountText}
            editable={!locked}
            keyboardType="decimal-pad"
            left={<TextInput.Affix text={currencySymbol(cur)} />}
            onChangeText={onAmountChange}
            onEndEditing={() => {
              const amt = Number(amountText) || 0;
              // Persist the recalculated tax alongside the amount when itemised.
              if (hasLines) {
                const tax = Math.max(0, Math.round((amt - lineSubtotal()) * 100) / 100);
                onPersist({ amount: amt, taxAmount: tax });
              } else {
                onPersist({ amount: amt });
              }
            }}
            style={{ flex: 1 }}
          />
        </View>

        {/* Tax + currency */}
        <View style={{ flexDirection: 'row', marginTop: 6 }}>
          <TextInput
            dense mode="outlined" label="Tax" value={taxText}
            editable={!locked}
            keyboardType="decimal-pad"
            left={<TextInput.Affix text={currencySymbol(cur)} />}
            onChangeText={onTaxChange}
            onEndEditing={() => onPersist({ taxAmount: taxText === '' ? null : (Number(taxText) || 0) })}
            style={{ flex: 1, marginRight: 6 }}
          />
          {/* Currency dropdown (CAD / USD). USD receipts convert to CAD in the
              claim total + reports. */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 2 }}>Currency</Text>
            <Menu
              visible={curMenu}
              onDismiss={() => setCurMenu(false)}
              anchor={
                <Button
                  mode="outlined" compact icon="cash" textColor={theme.colors.text}
                  onPress={() => setCurMenu(true)} disabled={locked}
                  style={{ borderColor: theme.colors.secondary }}
                  contentStyle={{ justifyContent: 'flex-start' }}
                >
                  {cur}
                </Button>
              }
            >
              {currencies.map((c) => (
                <Menu.Item
                  key={c} title={c}
                  onPress={() => { setCurMenu(false); onPatch({ currency: c }); onPersist({ currency: c }); }}
                />
              ))}
            </Menu>
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'flex-start' }}>
          <DateField
            value={item.date ?? ''}
            disabled={locked}
            onChange={(d) => { onPatch({ date: d }); onPersist({ date: d }); }}
            style={{ flex: 1, marginRight: 6 }}
          />
          {/* Tag picker as a Portal modal (not a Menu) — a Menu anchored to a
              flex:1 Button inside this row mis-measures on web and wouldn't
              open. The modal is reliable cross-platform + shows GL accounts. */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 2 }}>Tag</Text>
            <Button
              mode="outlined" compact icon="tag" textColor={theme.colors.text}
              onPress={() => setTagPicker(true)} disabled={locked}
              style={{ borderColor: theme.colors.secondary }}
              contentStyle={{ justifyContent: 'flex-start' }}
            >
              {tagLabel ?? 'Choose…'}
            </Button>
          </View>
          <Portal>
            <Modal
              visible={tagPicker}
              onDismiss={() => setTagPicker(false)}
              contentContainerStyle={{ backgroundColor: theme.colors.darkDefault, marginHorizontal: 20, borderRadius: 8, alignSelf: 'center', width: '90%', maxWidth: 420, maxHeight: '80%', padding: 8 }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700', padding: 10 }}>Choose a tag</Text>
              {tags.length === 0 ? (
                <Text style={{ color: theme.colors.textDarker, padding: 10, fontStyle: 'italic' }}>
                  No expense tags yet. An admin can add them in Expenses → Manage expense tags.
                </Text>
              ) : (
                <ScrollView>
                  {tags.map((t) => {
                    const selected = t.slug === item.tagSlug;
                    return (
                      <TouchableOpacity
                        key={t.slug}
                        onPress={() => { setTagPicker(false); onPatch({ tagSlug: t.slug }); onPersist({ tagSlug: t.slug }); }}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, backgroundColor: selected ? 'rgba(0,188,212,0.12)' : 'transparent', borderRadius: 6 }}
                      >
                        <MaterialCommunityIcons name={selected ? 'check-circle' : 'tag-outline'} size={18} color={selected ? theme.colors.primary : theme.colors.textDarker} style={{ marginRight: 10 }} />
                        <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1 }}>{t.label}</Text>
                        {t.glAccount ? (
                          <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>GL {t.glAccount}</Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
              <Button mode="text" textColor={theme.colors.textDarker} onPress={() => setTagPicker(false)} style={{ alignSelf: 'flex-end' }}>Close</Button>
            </Modal>
          </Portal>
        </View>

        <TextInput
          dense mode="outlined" label="Description (optional)" value={item.description ?? ''}
          editable={!locked}
          onChangeText={(v) => onPatch({ description: v })}
          onEndEditing={() => onPersist({ description: item.description ?? '' })}
          style={{ marginTop: 6 }}
        />

        {/* AI-itemised line items. Tap a line to include/exclude or adjust its
            price. Tax + total come from the form fields above (not duplicated). */}
        {hasLines ? (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 6 }}>
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>
              DETAILS · ✨ {lineItems.filter((l) => !isHiddenSummary(l)).length} line{lineItems.filter((l) => !isHiddenSummary(l)).length === 1 ? '' : 's'}
              {!locked ? '  ·  tap to edit' : ''}
            </Text>
            {lineItems.map((li, i) => {
              if (isHiddenSummary(li)) return null; // tax/total shown from form fields below
              const ex = !!li.excluded;
              const sub = isSubtotal(li);
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => setEditorIdx(i)}
                  disabled={locked}
                  style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingVertical: 10, marginTop: sub ? 2 : 0, opacity: ex ? 0.5 : 1, borderTopWidth: sub ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}
                >
                  {!locked && !sub ? (
                    <MaterialCommunityIcons
                      name={ex ? 'checkbox-blank-circle-outline' : 'check-circle'}
                      size={20}
                      color={ex ? theme.colors.textDarker : theme.colors.success}
                      style={{ marginRight: 10 }}
                    />
                  ) : null}
                  <Text
                    style={{ color: sub ? theme.colors.textDarker : theme.colors.text, fontSize: sub ? 13 : 14, fontWeight: sub ? '600' : '400', flex: 1, textDecorationLine: ex ? 'line-through' : 'none' }}
                    numberOfLines={2}
                  >
                    {sub ? 'Subtotal' : `${li.qty && li.qty > 1 ? `${li.qty}× ` : ''}${li.description}`}
                  </Text>
                  {li.amount != null ? (
                    <Text style={{ color: theme.colors.textDarker, fontSize: sub ? 13 : 14, fontWeight: sub ? '600' : '400', marginLeft: 8, textDecorationLine: ex ? 'line-through' : 'none' }}>
                      {money(li.amount, cur)}
                    </Text>
                  ) : null}
                  {!locked ? (
                    <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.textDarker} style={{ marginLeft: 10 }} />
                  ) : null}
                </TouchableOpacity>
              );
            })}

            {/* Validation: line items should reconcile with the printed subtotal. */}
            {subtotalMismatch ? (
              <HelperText type="error" visible style={{ marginLeft: -8, marginTop: 2 }}>
                Line items add up to {money(itemsSum, cur)} but the subtotal reads {money(Number(subtotalLine!.amount) || 0, cur)}. Adjust a line or the subtotal.
              </HelperText>
            ) : null}

            {/* Tax + Total from the form fields (single source of truth). */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, marginTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
              <Text style={{ color: theme.colors.textDarker, fontSize: 13, flex: 1 }}>Tax</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 13 }}>{money(item.taxAmount ?? 0, cur)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
              <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1, fontWeight: '700' }}>Total</Text>
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>{money(item.amount, cur)}</Text>
            </View>
          </View>
        ) : null}
        </>
        )}

        {/* Line-item editor — include/exclude + adjust price. */}
        {editorIdx != null && lineItems[editorIdx] ? (
          <LineItemEditor
            line={lineItems[editorIdx]}
            isSubtotal={isSubtotal(lineItems[editorIdx])}
            currency={cur}
            onDismiss={() => setEditorIdx(null)}
            onSave={(patch) => { applyLineEdit(editorIdx, patch); setEditorIdx(null); }}
          />
        ) : null}
      </Card.Content>
    </Card>
  );
}

// ---- Line-item editor modal — include/exclude + adjust price ---------------
function LineItemEditor({
  line, isSubtotal, currency, onDismiss, onSave,
}: {
  line: NonNullable<ExpenseItem['lineItems']>[number];
  isSubtotal: boolean;
  currency: string;
  onDismiss: () => void;
  onSave: (patch: { excluded?: boolean; amount?: number | null; description?: string }) => void;
}) {
  const [excluded, setExcluded] = useState(!!line.excluded);
  const [descText, setDescText] = useState(line.description ?? '');
  const [priceText, setPriceText] = useState(line.amount != null ? String(line.amount) : '');
  const onPriceChange = (v: string) => {
    let c = v.replace(/[^0-9.]/g, '');
    const dot = c.indexOf('.');
    if (dot !== -1) c = c.slice(0, dot + 1) + c.slice(dot + 1).replace(/\./g, '');
    setPriceText(c);
  };
  return (
    <Portal>
      <Modal
        visible
        onDismiss={onDismiss}
        contentContainerStyle={{ backgroundColor: theme.colors.darkDefault, marginHorizontal: 20, borderRadius: 8, alignSelf: 'center', width: '90%', maxWidth: 420, padding: 16 }}
      >
        <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700', marginBottom: 2 }} numberOfLines={2}>
          {isSubtotal ? 'Subtotal' : (line.description || 'Line item')}
        </Text>
        {line.qty && line.qty > 1 ? (
          <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>Qty {line.qty}</Text>
        ) : null}

        {/* Include / Exclude — not for the subtotal row. */}
        {!isSubtotal ? (
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <Button
              mode={excluded ? 'outlined' : 'contained'}
              icon={excluded ? 'check-circle-outline' : 'check-circle'}
              buttonColor={excluded ? undefined : theme.colors.success} textColor={excluded ? theme.colors.text : '#000'}
              onPress={() => setExcluded(false)}
              style={{ flex: 1, marginRight: 6, borderColor: theme.colors.secondary }}
            >
              Include
            </Button>
            <Button
              mode={excluded ? 'contained' : 'outlined'}
              icon={excluded ? 'close-circle' : 'close-circle-outline'}
              buttonColor={excluded ? theme.colors.error : undefined} textColor={excluded ? '#fff' : theme.colors.text}
              onPress={() => setExcluded(true)}
              style={{ flex: 1, borderColor: theme.colors.secondary }}
            >
              Exclude
            </Button>
          </View>
        ) : null}

        {/* Edit the line text — not for the subtotal row (fixed label). */}
        {!isSubtotal ? (
          <TextInput
            dense mode="outlined" label="Item" value={descText}
            autoCapitalize="none"
            onChangeText={setDescText}
            style={{ marginTop: 12 }}
          />
        ) : null}

        {/* Adjust price */}
        <TextInput
          dense mode="outlined" label="Price" value={priceText}
          keyboardType="decimal-pad"
          left={<TextInput.Affix text={currencySymbol(currency)} />}
          onChangeText={onPriceChange}
          style={{ marginTop: isSubtotal ? 12 : 8 }}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 }}>
          <Button mode="text" textColor={theme.colors.textDarker} onPress={onDismiss}>Cancel</Button>
          <Button
            mode="contained" buttonColor={theme.colors.primary} textColor="#fff"
            onPress={() => onSave({
              excluded: isSubtotal ? undefined : excluded,
              amount: priceText === '' ? null : (Number(priceText) || 0),
              description: isSubtotal ? undefined : (descText.trim() || line.description),
            })}
          >
            Save
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

// Inline date-only field. Web: a real native <input type="date"> calendar
// picker (no extra dep, mirrors DateTimeField's web path) emitting YYYY-MM-DD
// directly. Native: a TextInput fallback. Kept date-only so it round-trips the
// receipt's `date` string unchanged (no ISO/time coupling).
function DateField({ value, disabled, onChange, style }: { value: string; disabled?: boolean; onChange: (d: string) => void; style?: any }) {
  if (Platform.OS === 'web') {
    return (
      // minWidth:0 lets this flex child shrink below the date input's intrinsic
      // min-content width — without it the input overflowed and overlapped the
      // Tag on narrow screens.
      <View style={[style, { minWidth: 0 }]}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 2 }}>Date</Text>
        {React.createElement('input', {
          type: 'date',
          value: value || '',
          disabled,
          style: {
            colorScheme: 'dark',
            backgroundColor: theme.colors.darkDefault,
            color: theme.colors.text,
            border: '1px solid rgba(255,255,255,0.29)',
            borderRadius: 4,
            // Fixed height to match the compact Tag button beside it; horizontal
            // padding only since height centers the value.
            height: 36,
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 9,
            paddingRight: 9,
            fontSize: 14,
            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
          },
          onChange: (e: any) => onChange(e.target.value),
        })}
      </View>
    );
  }
  return (
    <TextInput
      dense mode="outlined" label="Date (YYYY-MM-DD)" value={value}
      editable={!disabled}
      placeholder="2026-06-15"
      onChangeText={onChange}
      style={style}
    />
  );
}

// A receipt line is a "summary" row (subtotal/total/tax/balance/change/…) when
// the backend flagged it OR its label looks like one — so it never gets counted
// into the claimed amount and can't be toggled, even for older/unflagged data.
const SUMMARY_RE = /^\s*(sub[\s-]*total|total|balance(\s*due)?|amount\s*due|change|tax|gst|hst|pst|qst|tip|gratuity|rounding|cash|visa|mastercard|debit|credit|payment|due)\b/i;
function isSummaryLine(li?: { description?: string; isSummary?: boolean } | null): boolean {
  if (!li) return false;
  if (li.isSummary) return true;
  return SUMMARY_RE.test(li.description ?? '');
}

function currencySymbol(cur?: string): string {
  switch ((cur ?? 'CAD').toUpperCase()) {
    case 'CAD': case 'USD': case 'AUD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    default: return (cur ?? '') + ' ';
  }
}

// ---- Receipt attachment — thumbnail chip + full-screen lightbox ------------
// The thumbnail/preview bytes are streamed from the api/ with auth (the stored
// URL can be a non-loadable mem:// in dev or a presigned URL <img> can't carry
// headers to), turned into an object URL on web. Tapping opens the full image;
// PDFs open in a new tab / external viewer.
function ReceiptAttachment({ item }: { item: ExpenseItem }) {
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const isPdf = !!item.mimeType?.includes('pdf');

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { blob } = await apiFactory().expenses.fetchReceipt(item.id);
        if (cancelled) return;
        if (typeof URL !== 'undefined' && URL.createObjectURL) {
          url = URL.createObjectURL(blob);
          setSrc(url);
        } else if (item.fileUrl) {
          setSrc(item.fileUrl); // native fallback: a real presigned URL
        }
      } catch {
        if (!cancelled && item.fileUrl) setSrc(item.fileUrl);
      }
    })();
    return () => {
      cancelled = true;
      if (url && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(url);
    };
  }, [item.id]);

  const onPress = () => {
    if (isPdf) {
      if (Platform.OS === 'web' && src) window.open(src, '_blank');
      else if (src) Linking.openURL(src).catch(() => {});
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      {/* Same badge holds the thumbnail + paperclip + label, and is tappable. */}
      <TouchableOpacity
        onPress={onPress}
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.secondary, borderRadius: 14, paddingRight: 8, paddingLeft: src && !isPdf ? 2 : 8, paddingVertical: 2, marginRight: 4 }}
        accessibilityLabel="View receipt"
      >
        {src && !isPdf ? (
          <Image source={{ uri: src }} style={{ width: 24, height: 24, borderRadius: 12, marginRight: 5 }} resizeMode="cover" />
        ) : null}
        <MaterialCommunityIcons name="paperclip" size={12} color={theme.colors.text} style={{ marginRight: 3 }} />
        <Text style={{ color: theme.colors.text, fontSize: 10 }}>{isPdf ? 'PDF' : 'Image'}</Text>
      </TouchableOpacity>

      <Portal>
        <Modal
          visible={open}
          onDismiss={() => setOpen(false)}
          contentContainerStyle={{ backgroundColor: '#000', margin: 0, flex: 1, width: '100%', height: '100%' }}
          style={{ margin: 0 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
            <Text style={{ color: '#fff', flex: 1, marginLeft: 8 }} numberOfLines={1}>{item.vendor || item.fileName || 'Receipt'}</Text>
            <IconButton icon="close" size={24} iconColor="#fff" onPress={() => setOpen(false)} />
          </View>
          {src ? (
            <Image source={{ uri: src }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Spinner />
            </View>
          )}
        </Modal>
      </Portal>
    </>
  );
}
