import React, { useEffect, useMemo, useState } from 'react';
import { View, TouchableOpacity, Linking, useWindowDimensions } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import { allDeadlines, FUNDING_PROGRAMS } from '@skintyee/models';
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

// The app is read-only for funding — applying / reporting happens on the website,
// which has the full programs + apply portal (same @skintyee/models data behind it).
const FUNDING_WEB_URL = 'https://skintyee.ca/funding';

type DeadlineRowX = ReturnType<typeof allDeadlines>[number] & { date?: moment.Moment | null };
type FundingProgramX = (typeof FUNDING_PROGRAMS)[number];

// Relative-due status — the per-entry "status" chip (urgency), mirroring how the website
// surfaces deadline state.
function dueStatus(date?: moment.Moment | null): { label: string; color: string } {
  if (!date) return { label: 'Ongoing', color: '#9AA0A6' };
  const days = date.clone().startOf('day').diff(moment().startOf('day'), 'days');
  if (days < 0) return { label: 'Past', color: '#9AA0A6' };
  if (days === 0) return { label: 'Due today', color: REPORT_COLOR };
  if (days === 1) return { label: 'Due tomorrow', color: REPORT_COLOR };
  if (days <= 30) return { label: `Due in ${days} days`, color: REPORT_COLOR };
  return { label: `Due in ${days} days`, color: APPLY_COLOR };
}

// One funding deadline in the day/ongoing list — like a website entry: program + name, a
// kind (PAW/DCI) chip + a status chip, and (tap to expand) the full details + an apply link
// to the website (the app is read-only).
function DeadlineEntry({ r, program }: { r: DeadlineRowX; program?: FundingProgramX }) {
  const [open, setOpen] = useState(false);
  const isApply = r.kind.startsWith('Application');
  const color = isApply ? APPLY_COLOR : REPORT_COLOR;
  const status = dueStatus(r.date);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.secondary, borderLeftWidth: 3, borderLeftColor: color, paddingLeft: 10, paddingVertical: 8 }}>
      <TouchableOpacity onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 13 }}>
              {r.program} · <Text style={{ color: theme.colors.textDarker }}>{r.name}</Text>
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
              <Chip compact style={{ backgroundColor: `${color}22`, marginRight: 4, height: 22 }} textStyle={{ fontSize: 9, color, marginVertical: 0 }}>
                {isApply ? 'Apply (PAW)' : 'Report (DCI)'}
              </Chip>
              <Chip compact style={{ backgroundColor: `${status.color}22`, marginRight: 6, height: 22 }} textStyle={{ fontSize: 9, color: status.color, marginVertical: 0 }}>
                {status.label}
              </Chip>
              <Text style={{ color: theme.colors.textDarker, fontSize: 10 }}>
                {r.ref ? `#${r.ref} ` : ''}{r.due ? `· ${r.due}` : ''}
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textDarker} style={{ marginTop: 2 }} />
        </View>
      </TouchableOpacity>

      {open ? (
        <View style={{ marginLeft: 16, marginTop: 6 }}>
          {program?.summary ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginBottom: 6 }}>{program.summary}</Text>
          ) : null}
          {program?.eligibility ? (
            <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginBottom: 8 }}>
              <Text style={{ color: theme.colors.text }}>Eligibility: </Text>{program.eligibility}
            </Text>
          ) : null}
          <TouchableOpacity onPress={() => Linking.openURL(FUNDING_WEB_URL)} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name="open-in-new" size={14} color={theme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: theme.colors.primary, fontSize: 12 }}>{isApply ? 'Apply' : 'Report'} on skintyee.ca</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

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
  const [open, setOpen] = useState(false); // collapsed by default

  const selectedRows = dated.filter((r) => r.date!.format('YYYY-MM-DD') === selected);

  const { width } = useWindowDimensions();
  const split = width >= 768; // calendar left · list right on tablet/desktop, stacked on phone

  // Full program (summary / eligibility) for an entry, keyed like allDeadlines (acronym ?? name).
  const programByKey = useMemo(() => new Map(FUNDING_PROGRAMS.map((p) => [p.acronym ?? p.name, p])), []);
  const progFor = (r: DeadlineRowX) => programByKey.get(r.program);

  const dayList = (
    <View>
      <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>
        {moment(selected).format('dddd, MMMM D').toUpperCase()}
      </Text>
      {selectedRows.length ? (
        selectedRows.map((r, i) => <DeadlineEntry key={`s${i}`} r={r} program={progFor(r)} />)
      ) : (
        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>No funding deadlines on this day.</Text>
      )}
      {undated.length ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.secondary, paddingTop: 10 }}>
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>ONGOING / NO FIXED DATE</Text>
          {undated.map((r, i) => <DeadlineEntry key={`u${i}`} r={r} program={progFor(r)} />)}
        </View>
      ) : null}
    </View>
  );

  return (
    <Card style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: theme.colors.primary }}>
      <Card.Content>
        <TouchableOpacity onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* calendar-clock is in the bundled icon set (used in the timekeeping card) — unlike
                cash-clock, which rendered as a '?'. */}
            <MaterialCommunityIcons name="calendar-clock" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>Funding deadlines</Text>
            <Chip compact style={{ backgroundColor: theme.colors.secondary }} textStyle={{ fontSize: 10 }}>Governance</Chip>
            <MaterialCommunityIcons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={22}
              color={theme.colors.textDarker}
              style={{ marginLeft: 6 }}
            />
          </View>
        </TouchableOpacity>

        {open ? (
          <>
            <View style={{ flexDirection: 'row', marginTop: 10, marginBottom: 10 }}>
              <Chip compact icon="circle" style={{ marginRight: 6, backgroundColor: 'transparent' }} textStyle={{ fontSize: 10, color: APPLY_COLOR }}>Apply</Chip>
              <Chip compact icon="circle" style={{ backgroundColor: 'transparent' }} textStyle={{ fontSize: 10, color: REPORT_COLOR }}>Report</Chip>
            </View>

            {split ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <MonthCalendar marks={marks} selected={selected} onSelect={setSelected} initialMonth={selected} showCount />
                </View>
                <View style={{ flex: 1 }}>{dayList}</View>
              </View>
            ) : (
              <>
                <MonthCalendar marks={marks} selected={selected} onSelect={setSelected} initialMonth={selected} showCount />
                <View style={{ marginTop: 12 }}>{dayList}</View>
              </>
            )}

            {/* App is read-only — browse all programs / apply on the website. */}
            <TouchableOpacity
              onPress={() => Linking.openURL(FUNDING_WEB_URL)}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.secondary, paddingTop: 12 }}
            >
              <MaterialCommunityIcons name="open-in-new" size={16} color={theme.colors.primary} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.colors.primary, fontSize: 13 }}>All funding programs on skintyee.ca</Text>
            </TouchableOpacity>
          </>
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
