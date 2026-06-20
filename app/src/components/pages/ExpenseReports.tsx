import React, { useCallback, useState } from 'react';
import { Platform, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, HelperText, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent, useToast } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { ExpenseReportSummary } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// Open a Blob in a new tab on web (object URL). Native sharing is a TODO,
// mirroring TimekeepingReports.
function openBlob(blob: Blob) {
  if (Platform.OS === 'web' && typeof URL !== 'undefined') {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
function saveBlob(blob: Blob, filename: string) {
  if (Platform.OS === 'web' && typeof URL !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
}

// ----------------------------------------------------------------------------
// ExpenseReports — finance/admin landing for the per-period PDFs + CSVs, the
// reimbursement twin of TimekeepingReports. Each recent period gets a row.
// Periods with no claims render greyed-out. PDFs carry the band letterhead +
// a cover page + one page per claim (built on demand by the api/; there's no
// persisted report row, so no regenerate button).
// ----------------------------------------------------------------------------

export default function ExpenseReports() {
  const [reports, setReports] = useState<ExpenseReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | undefined>();
  const [busyAction, setBusyAction] = useState<'open' | 'save' | 'csv' | 'byuser' | undefined>();
  const [error, setError] = useState<string | undefined>();
  const { showToast, toastNode } = useToast();

  const load = useCallback(async () => {
    setError(undefined); setLoading(true);
    try {
      setReports(await apiFactory().expenses.reports.list(12));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openPdf = async (r: ExpenseReportSummary) => {
    if (!r.hasData) return;
    setBusy(r.payPeriodId); setBusyAction('open'); setError(undefined);
    try {
      const { blob } = await apiFactory().expenses.reports.fetchPdf(r.payPeriodId);
      openBlob(blob);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(undefined); setBusyAction(undefined); }
  };
  const savePdf = async (r: ExpenseReportSummary) => {
    if (!r.hasData) return;
    setBusy(r.payPeriodId); setBusyAction('save'); setError(undefined);
    try {
      const { blob, filename } = await apiFactory().expenses.reports.fetchPdf(r.payPeriodId, { download: true });
      saveBlob(blob, filename);
      showToast('PDF saved to Downloads');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(undefined); setBusyAction(undefined); }
  };
  const openByUser = async (r: ExpenseReportSummary) => {
    if (!r.hasData) return;
    setBusy(r.payPeriodId); setBusyAction('byuser'); setError(undefined);
    try {
      const { blob } = await apiFactory().expenses.reports.fetchByUserPdf(r.payPeriodId);
      openBlob(blob);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(undefined); setBusyAction(undefined); }
  };
  const downloadCsv = async (r: ExpenseReportSummary) => {
    if (!r.hasData) return;
    setBusy(r.payPeriodId); setBusyAction('csv'); setError(undefined);
    try {
      const { blob, filename } = await apiFactory().expenses.reports.fetchCsv(r.payPeriodId);
      saveBlob(blob, filename);
      showToast('CSV saved to Downloads');
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setBusy(undefined); setBusyAction(undefined); }
  };

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
          Each period has a printable PDF compiling every worker's expense claim (band letterhead,
          a cover summary, and one page of receipts per claim), plus a CSV for spreadsheet pivots.
          Periods with no claims are greyed out.
        </Text>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}
        {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}

        {reports.map((r) => {
          const isBusy = busy === r.payPeriodId;
          return (
            <Card key={r.payPeriodId} style={{ marginTop: 10, backgroundColor: theme.colors.darkDefault, opacity: r.hasData ? 1 : 0.4 }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 15 }}>{r.periodLabel}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 2 }}>
                      Cutoff Fri {dayjs(r.endISO).format('MMM D')} · Reimburse Fri {dayjs(r.payDateISO).format('MMM D')}
                    </Text>
                  </View>
                  {r.hasData ? (
                    <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                      {r.claimCount} claim{r.claimCount === 1 ? '' : 's'} · ${r.totalAmount.toFixed(2)}
                    </Chip>
                  ) : (
                    <Chip compact style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} textStyle={{ color: theme.colors.textDarker, fontSize: 10 }}>
                      No data
                    </Chip>
                  )}
                </View>

                {r.hasData ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                    <Button compact mode="contained" icon="file-pdf-box" buttonColor={theme.colors.primary} textColor="#fff"
                      onPress={() => openPdf(r)} loading={isBusy && busyAction === 'open'} disabled={isBusy}>
                      Open PDF
                    </Button>
                    <Button compact mode="outlined" icon="download" textColor={theme.colors.text}
                      onPress={() => savePdf(r)} loading={isBusy && busyAction === 'save'} disabled={isBusy} style={{ marginLeft: 6 }}>
                      Save PDF
                    </Button>
                    <Button compact mode="outlined" icon="file-delimited" textColor={theme.colors.text}
                      onPress={() => downloadCsv(r)} loading={isBusy && busyAction === 'csv'} disabled={isBusy} style={{ marginLeft: 6 }}>
                      CSV
                    </Button>
                    <Button compact mode="outlined" icon="account-details" textColor={theme.colors.text}
                      onPress={() => openByUser(r)} loading={isBusy && busyAction === 'byuser'} disabled={isBusy} style={{ marginLeft: 6, marginTop: 6 }}>
                      By user + receipts
                    </Button>
                  </View>
                ) : null}
              </Card.Content>
            </Card>
          );
        })}

        {toastNode}
      </PageContent>
    </PageContainer>
  );
}
