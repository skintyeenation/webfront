import React, { useCallback, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, HelperText, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import Config from 'skintyee/config';
import { apiFactory } from 'skintyee/store/apis';
import { TimesheetReportSummary } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

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
  const [error, setError] = useState<string | undefined>();

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

  const openPdf = async (r: TimesheetReportSummary) => {
    if (!r.hasData) return;
    if (r.reportUrl) {
      Linking.openURL(r.reportUrl);
      return;
    }
    setBusy(r.payPeriodId);
    try {
      const fresh = await apiFactory().timekeeping.reports.generate(r.payPeriodId);
      setReports((prev) => prev.map((x) => (x.payPeriodId === r.payPeriodId ? fresh : x)));
      if (fresh.reportUrl) Linking.openURL(fresh.reportUrl);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const regenerate = async (r: TimesheetReportSummary) => {
    setBusy(r.payPeriodId);
    try {
      const fresh = await apiFactory().timekeeping.reports.generate(r.payPeriodId);
      setReports((prev) => prev.map((x) => (x.payPeriodId === r.payPeriodId ? fresh : x)));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const downloadCsv = (r: TimesheetReportSummary) => {
    if (!r.hasData) return;
    // Direct browser download. Server sets Content-Disposition so the
    // file lands in the user's Downloads folder.
    const path = `/v1/timekeeping/reports/${encodeURIComponent(r.payPeriodId)}/csv`;
    const base = Config.apiServer === 'mock' ? '' : Config.apiServer.replace(/\/+$/, '');
    Linking.openURL(base + path);
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
                      loading={isBusy && !r.reportUrl}
                      disabled={isBusy}
                    >
                      {r.reportUrl ? 'Open PDF' : 'Generate PDF'}
                    </Button>
                    <Button
                      compact mode="outlined" icon="file-delimited"
                      textColor={theme.colors.text}
                      onPress={() => downloadCsv(r)}
                      style={{ marginLeft: 6 }}
                      disabled={isBusy}
                    >
                      Download CSV
                    </Button>
                    <View style={{ flex: 1 }} />
                    {r.reportUrl ? (
                      <Button
                        compact mode="text" icon="refresh"
                        textColor={theme.colors.textDarker}
                        onPress={() => regenerate(r)}
                        loading={isBusy}
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
      </PageContent>
    </PageContainer>
  );
}
