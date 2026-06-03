import React, { useCallback, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, HelperText, Snackbar, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { apiFactory } from 'skintyee/store/apis';
import { TimesheetReportSummary } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// Open a Blob in a new tab on web (object URL). On native, hand off to
// platform sharing. Pure web for now per Lucas; native path is a TODO.
function openBlob(blob: Blob, _filename: string) {
  if (Platform.OS === 'web' && typeof URL !== 'undefined') {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Don't revoke immediately — the new tab still needs the URL alive
    // to render the PDF. Revoke after a generous delay so tab keeps it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

// Save a Blob via the platform's native save flow. Web: anchor with
// the `download` attribute → goes to the Downloads folder.
function saveBlob(blob: Blob, filename: string) {
  if (Platform.OS === 'web' && typeof URL !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
}

// ----------------------------------------------------------------------------
// TimekeepingReports — admin landing for the per-period PDFs + CSVs.
//
// Every recent pay period gets a row. Periods with no timesheets render
// greyed-out (no actions). Periods with data show:
//   - "Open PDF" → opens the persisted report. First click on an
//     ungenerated period generates it on the fly.
//   - "Download CSV" → direct download from the api/.
//   - Regenerate icon to force a fresh PDF (e.g. after a late
//     approval flipped the period's totals).
// ----------------------------------------------------------------------------

export default function TimekeepingReports({ navigation }: any) {
  const [reports, setReports] = useState<TimesheetReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | undefined>();
  const [busyAction, setBusyAction] = useState<'open' | 'save' | 'csv' | 'regen' | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      setReports(await apiFactory().timekeeping.reports.list(12));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const ensureGenerated = async (r: TimesheetReportSummary): Promise<TimesheetReportSummary> => {
    if (r.reportUrl) return r;
    const fresh = await apiFactory().timekeeping.reports.generate(r.payPeriodId);
    setReports((prev) => prev.map((x) => (x.payPeriodId === r.payPeriodId ? fresh : x)));
    return fresh;
  };

  const openPdf = async (r: TimesheetReportSummary) => {
    if (!r.hasData) return;
    setBusy(r.payPeriodId); setBusyAction('open'); setError(undefined);
    try {
      await ensureGenerated(r);
      const { blob, filename } = await apiFactory().timekeeping.reports.fetchPdf(r.payPeriodId);
      openBlob(blob, filename);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally { setBusy(undefined); setBusyAction(undefined); }
  };

  const savePdf = async (r: TimesheetReportSummary) => {
    if (!r.hasData) return;
    setBusy(r.payPeriodId); setBusyAction('save'); setError(undefined);
    try {
      await ensureGenerated(r);
      const { blob, filename } = await apiFactory().timekeeping.reports.fetchPdf(r.payPeriodId, { download: true });
      saveBlob(blob, filename);
      setToast('PDF saved to Downloads');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally { setBusy(undefined); setBusyAction(undefined); }
  };

  const regenerate = async (r: TimesheetReportSummary) => {
    setBusy(r.payPeriodId); setBusyAction('regen'); setError(undefined);
    try {
      const fresh = await apiFactory().timekeeping.reports.generate(r.payPeriodId);
      setReports((prev) => prev.map((x) => (x.payPeriodId === r.payPeriodId ? fresh : x)));
      setToast('Regenerated');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally { setBusy(undefined); setBusyAction(undefined); }
  };

  const downloadCsv = async (r: TimesheetReportSummary) => {
    if (!r.hasData) return;
    setBusy(r.payPeriodId); setBusyAction('csv'); setError(undefined);
    try {
      const { blob, filename } = await apiFactory().timekeeping.reports.fetchCsv(r.payPeriodId);
      saveBlob(blob, filename);
      setToast('CSV saved to Downloads');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally { setBusy(undefined); setBusyAction(undefined); }
  };

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
          Each pay period has a printable PDF report compiling every worker's timesheet,
          plus a CSV for spreadsheet pivots. Periods with no submissions are greyed out.
        </Text>

        {error ? <HelperText type="error" visible>{error}</HelperText> : null}
        {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}

        {reports.map((r) => {
          const isBusy = busy === r.payPeriodId;
          return (
            <Card
              key={r.payPeriodId}
              style={{
                marginTop: 10,
                backgroundColor: theme.colors.darkDefault,
                opacity: r.hasData ? 1 : 0.4,
              }}
            >
              <Card.Content>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 15 }}>{r.periodLabel}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 2 }}>
                      Cutoff Fri {dayjs(r.endISO).format('MMM D')} · Pay Fri {dayjs(r.payDateISO).format('MMM D')}
                    </Text>
                  </View>
                  {r.hasData ? (
                    <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ color: theme.colors.text, fontSize: 10 }}>
                      {r.workerCount} worker{r.workerCount === 1 ? '' : 's'} · {r.totalHours}h
                    </Chip>
                  ) : (
                    <Chip compact style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} textStyle={{ color: theme.colors.textDarker, fontSize: 10 }}>
                      No data
                    </Chip>
                  )}
                </View>

                {r.reportGeneratedAt ? (
                  <Text style={{ color: theme.colors.textDarker, fontSize: 10, marginTop: 4 }}>
                    PDF generated {dayjs(r.reportGeneratedAt).format('MMM D, YYYY HH:mm')}
                    {r.reportSizeBytes ? ` · ${Math.round(r.reportSizeBytes / 1024)} KB` : ''}
                  </Text>
                ) : null}

                {r.hasData ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                    <Button
                      compact mode="contained" icon="file-pdf-box"
                      buttonColor={theme.colors.primary} textColor="#fff"
                      onPress={() => openPdf(r)}
                      loading={isBusy && busyAction === 'open'}
                      disabled={isBusy}
                    >
                      {r.reportUrl ? 'Open PDF' : 'Generate PDF'}
                    </Button>
                    <Button
                      compact mode="outlined" icon="download"
                      textColor={theme.colors.text}
                      onPress={() => savePdf(r)}
                      loading={isBusy && busyAction === 'save'}
                      disabled={isBusy}
                      style={{ marginLeft: 6 }}
                    >
                      Save PDF
                    </Button>
                    <Button
                      compact mode="outlined" icon="file-delimited"
                      textColor={theme.colors.text}
                      onPress={() => downloadCsv(r)}
                      loading={isBusy && busyAction === 'csv'}
                      disabled={isBusy}
                      style={{ marginLeft: 6 }}
                    >
                      CSV
                    </Button>
                    <View style={{ flex: 1 }} />
                    {r.reportUrl ? (
                      <Button
                        compact mode="text" icon="refresh"
                        textColor={theme.colors.textDarker}
                        onPress={() => regenerate(r)}
                        loading={isBusy && busyAction === 'regen'}
                        disabled={isBusy}
                      >
                        Regenerate
                      </Button>
                    ) : null}
                  </View>
                ) : null}
              </Card.Content>
            </Card>
          );
        })}

        <Snackbar
          visible={toast !== null}
          onDismiss={() => setToast(null)}
          duration={1800}
          wrapperStyle={{ alignItems: 'center' }}
          style={{ backgroundColor: theme.colors.success, alignSelf: 'center', width: '100%', maxWidth: 420 }}
        >
          <Text style={{ color: '#000', textAlign: 'center', width: '100%' }}>{toast ?? ''}</Text>
        </Snackbar>
      </PageContent>
    </PageContainer>
  );
}
