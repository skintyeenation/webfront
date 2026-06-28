import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import { allDeadlines } from '@skintyee/models';
import { MonthCalendar } from './MonthCalendar';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadDirectory } from 'skintyee/store/modules/directory';
import { theme } from 'skintyee/styles';

// Parse a funding due-date string into the NEXT occurrence. Handles the common
// "MMM D" forms (incl. "of the following fiscal year"); returns null for "Ongoing",
// month-only, or range strings — those show in a dateless list instead of on the grid.
function parseDue(due?: string): moment.Moment | null {
  if (!due) return null;
  const m = due.match(/\b([A-Z][a-z]{2})\.?\s+(\d{1,2})\b/);
  if (!m) return null;
  const d = moment(`${m[1]} ${m[2]}`, 'MMM D');
  if (!d.isValid()) return null;
  d.year(moment().year()).startOf('day');
  if (d.isBefore(moment(), 'day')) d.add(1, 'year');
  if (/following fiscal year/i.test(due)) d.add(1, 'year');
  return d;
}

const APPLY_COLOR = '#00B8EC'; // PAW — apply
const REPORT_COLOR = '#EC6A37'; // DCI — report

// Governance "Funding deadlines" calendar — PAW (apply) + DCI (report) due dates
// for the band's ISC funding, sourced from @skintyee/models. Gated to council /
// finance / system-admin at the call site; this component just renders.
export function FundingDeadlines() {
  const rows = useMemo(
    () => allDeadlines().map((d) => ({ ...d, date: parseDue(d.due) })),
    [],
  );
  const dated = useMemo(
    () => rows.filter((r) => r.date).sort((a, b) => a.date!.valueOf() - b.date!.valueOf()),
    [rows],
  );
  const undated = useMemo(() => rows.filter((r) => !r.date), [rows]);

  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    dated.forEach((r) => {
      const k = r.date!.format('YYYY-MM-DD');
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [dated]);

  const firstUpcoming = dated.find((r) => r.date!.isSameOrAfter(moment(), 'day'));
  const [selected, setSelected] = useState(
    (firstUpcoming ?? dated[0])?.date?.format('YYYY-MM-DD') ?? moment().format('YYYY-MM-DD'),
  );

  const selectedRows = dated.filter((r) => r.date!.format('YYYY-MM-DD') === selected);

  const row = (r: (typeof rows)[number], i: number) => {
    const isApply = r.kind.startsWith('Application');
    return (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 8, backgroundColor: isApply ? APPLY_COLOR : REPORT_COLOR }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontSize: 13 }}>
            {r.program} · <Text style={{ color: theme.colors.textDarker }}>{r.name}</Text>
          </Text>
          <Text style={{ color: isApply ? APPLY_COLOR : REPORT_COLOR, fontSize: 11 }}>
            {isApply ? 'Apply (PAW)' : 'Report (DCI)'}{r.ref ? ` · ${r.ref}` : ''}{r.due ? ` · due ${r.due}` : ''}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: theme.colors.primary }}>
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <MaterialCommunityIcons name="cash-clock" size={20} color={theme.colors.primary} style={{ marginRight: 8 }} />
          <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>Funding deadlines</Text>
          <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ fontSize: 10 }}>Governance</Chip>
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
          <Chip compact icon="circle" style={{ marginRight: 6, backgroundColor: 'transparent' }} textStyle={{ fontSize: 10, color: APPLY_COLOR }}>Apply</Chip>
          <Chip compact icon="circle" style={{ backgroundColor: 'transparent' }} textStyle={{ fontSize: 10, color: REPORT_COLOR }}>Report</Chip>
        </View>

        <MonthCalendar marks={marks} selected={selected} onSelect={setSelected} initialMonth={selected} />

        <View style={{ marginTop: 12 }}>
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>
            {moment(selected).format('dddd, MMMM D').toUpperCase()}
          </Text>
          {selectedRows.length ? selectedRows.map(row) : (
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>No funding deadlines on this day.</Text>
          )}
        </View>

        {undated.length ? (
          <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.secondary, paddingTop: 10 }}>
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>
              ONGOING / NO FIXED DATE
            </Text>
            {undated.map(row)}
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );
}

// Band groups that may see the governance funding calendar (the people who manage
// funding cycles). Any `admin` role also qualifies.
const FUNDING_GROUPS = ['council', 'finance', 'system-admin', 'band-manager'];

// Gated wrapper — renders the Funding deadlines calendar ONLY for council /
// finance / system-admin / band-manager (or any admin). Loads the directory if
// needed to read the signed-in user's band groups; renders nothing otherwise.
export function GovernanceFundingDeadlines() {
  const dispatch = useAppDispatch();
  const role = useAppSelector((s) => s.auth.role);
  const upn = (useAppSelector((s) => s.auth.user?.upn) ?? '').toLowerCase();
  const directory = useAppSelector((s) => s.directory.entities);

  useEffect(() => {
    if (upn && directory.length === 0) dispatch(loadDirectory());
  }, [upn, directory.length, dispatch]);

  const me = upn ? directory.find((m: any) => (m.upn ?? '').toLowerCase() === upn) : undefined;
  const groups: string[] = (me as any)?.bandGroups ?? [];
  const canSee = role === 'admin' || groups.some((g) => FUNDING_GROUPS.includes(g));
  if (!canSee) return null;
  return <FundingDeadlines />;
}
