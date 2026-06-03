# Timesheets

Bi-weekly pay-period timesheets for Skin Tyee staff. Workers submit one
timesheet covering a 14-day period; the cutoff is the **Friday at the
end of the period** and paycheques follow on **the next Friday**.

## Quick map

| | |
|---|---|
| Period length | 14 days |
| Period start day | Saturday |
| Period end day | Friday (cutoff date) |
| Pay date | Friday + 7 days (i.e. the next Friday) |
| Overtime threshold | 40 hours / week |
| Approval roles | `admin` appRole OR `band-manager` bandGroup |
| Submission roles | Anyone with the `staff` appRole or above |
| Config source | `api/src/skintyee-pay-periods.ts` (TS catalog, not env) |

## Why a TS config (not env)

Same model as `skintyee-meeting-types.ts` and `skintyee-groups.ts`. Code
is reviewable, deploys atomically, and the same constants drive the
Dashboard's pay-cycle countdown so the UI and the timesheet engine
never disagree.

Edit `PAY_PERIOD_CONFIG.anchorISO` when the cycle shifts; everything
else (next cutoff, history, OT) recomputes from that one Friday.

## Domain model

```
                                  Worker submits  ┌─────────────────┐
                                  one of these    │  Timesheet      │
                                  per period      │  per worker,    │
                                                  │  per period     │
                                                  └────────┬────────┘
                                                           │
                                                  contains many  ▼
                                                  ┌─────────────────┐
                                                  │  TimeEntry      │
                                                  │  one per day    │
                                                  │  (date, hours,  │
                                                  │   task)         │
                                                  └─────────────────┘
```

### Timesheet

```ts
{
  id:           string,            // <workerUpn>:<payPeriodId>
  workerUpn:    string,
  workerName:   string,
  payPeriodId:  string,            // YYYY-MM-DD of the cutoff
  entries:      TimeEntry[],       // 14 days × N tasks; sparse OK
  totalHours:   number,            // computed
  week1Hours:   number,            // computed (days 1-7)
  week2Hours:   number,            // computed (days 8-14)
  overtimeHours: number,           // computed: max(0, w1-40) + max(0, w2-40)
  status:       'draft' | 'submitted' | 'approved' | 'rejected',
  submittedAt:  string | null,
  approvedBy:   string | null,     // approver's UPN
  approvedAt:   string | null,
  notes:        string | null,
}
```

### TimeEntry

```ts
{
  id:      string,
  date:    string,                 // ISO YYYY-MM-DD within the period
  hours:   number,                 // decimal hours, e.g. 7.5
  timeIn?: string,                 // "HH:mm" 24h optional clock-in
  timeOut?: string,                // "HH:mm" 24h optional clock-out
  task:    string,                 // free-text or category
}
```

**Hours auto-compute:** when `timeIn` AND `timeOut` are present, `hours`
is recomputed from them (server-side authority; UI mirrors this for
live tallies). Examples:

```
08:00 → 16:30   ⇒  8.5h
07:00 → 15:45   ⇒  8.75h
09:00 → 09:00   ⇒  0h (no negative spans, no midnight wrap; split into two entries instead)
```

If only `hours` is set (no times), workers entered a flat number — e.g.
contractor billing or a remembered total. Both modes persist; the UI
will default to time-in/out with a per-row "just enter hours" toggle.

## Submission flow (worker)

1. Worker opens **Time Keeping** tab → defaults to the **current pay
   period** with an empty/draft timesheet.
2. UI shows a **weekly grid** — two rows of 7 days each (Saturday
   through Friday), with one row per task. Tasks default to a single
   "Regular work" row; **+ Task** button adds more (e.g. "Council
   meeting", "Training").
3. Daily cell = a number input for hours. Decimal allowed (`7.5`).
4. Live tallies underneath the grid:
   - Per-day total
   - Per-week total (with `> 40 OT` badge if applicable)
   - Period total
5. Worker can **Save draft** at any time without submitting.
6. **Submit timesheet** sends to the api/; status flips to `submitted`.
7. Submitting a draft past the cutoff is still allowed but flagged late
   (cutoff is a target, not a hard wall) and approvers see the chip.

## Overtime — auto-flag for admin approval

Computed when a timesheet is submitted:

```ts
overtimeHours = max(0, week1Hours - 40) + max(0, week2Hours - 40)
```

If `overtimeHours > 0`:
- The timesheet is marked **`requiresAdminApproval: true`**
- Band-manager-only approvals are blocked; only `admin` appRole can
  approve.
- A red 🔥 chip surfaces in the approvals queue.

If `overtimeHours === 0`, either `admin` or `band-manager` can approve.

## Approval workflow

```
worker (staff)  ─submit─▶  status: submitted   ─approve─▶  approved
                                              ─reject──▶  rejected (returns to worker)
```

**Who can approve:**

| Role / group | Can submit own | Can approve others' (no OT) | Can approve others' (OT) |
|---|---|---|---|
| public / member | ✗ submit, ✗ view | ✗ | ✗ |
| staff (no group) | ✓ submit own | ✗ | ✗ |
| band-manager (bandGroup) | ✓ submit own | ✓ | ✗ — admin required |
| admin (appRole) | ✓ submit own | ✓ | ✓ |

The check happens **in the api/'s controller**, not the UI — a
non-approver hitting the approve endpoint gets 403.

## History feature

- **Default view**: current pay period (read/write for the worker).
- **History dropdown / picker**: choose any previous period within
  the last N (default 12 — 6 months). For approvers, the history
  view spans **all workers**.
- Periods are computed via `recentPayPeriods(count)` from
  `skintyee-pay-periods.ts`. No DB rows needed for periods themselves —
  they're a function of the anchor + length.

## API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/timekeeping/pay-periods` | any signed-in | Current + recent periods (drives the history dropdown + Dashboard countdown) |
| GET | `/v1/timekeeping/pay-periods/:id` | any signed-in | One period's metadata |
| GET | `/v1/timekeeping/timesheets` | staff+ | My timesheets (filterable `?period=YYYY-MM-DD`) |
| GET | `/v1/timekeeping/timesheets/all` | approver | All workers' timesheets in a period (approval queue) |
| POST | `/v1/timekeeping/timesheets/:periodId` | staff+ | Submit (or update if `status=draft`) my timesheet |
| PATCH | `/v1/timekeeping/timesheets/:periodId/draft` | staff+ | Save a draft without submitting |
| POST | `/v1/timekeeping/timesheets/:id/approve` | approver | Approve someone's submitted timesheet |
| POST | `/v1/timekeeping/timesheets/:id/reject` | approver | Reject (returns to `draft` for the worker) |

The api/'s RolesGuard enforces the appRole tier; the OT-vs-band-manager
rule is enforced inside the `approve` handler against the user's
`bandGroups`.

## DB (Prisma) — new tables

```prisma
model Timesheet {
  id          String   @id              // <workerUpn>:<payPeriodId>
  workerUpn   String
  workerName  String
  payPeriodId String                    // YYYY-MM-DD of the cutoff
  status      String   @default("draft")  // draft | submitted | approved | rejected
  notes       String?
  submittedAt DateTime?
  approvedBy  String?
  approvedAt  DateTime?
  rejectedReason String?
  entries     TimeEntry[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([workerUpn, payPeriodId])
  @@index([payPeriodId, status])
}

model TimeEntry {
  id          String   @id @default(cuid())
  timesheetId String
  timesheet   Timesheet @relation(fields: [timesheetId], references: [id], onDelete: Cascade)
  date        String   // YYYY-MM-DD within the period
  hours       Float
  task        String
  @@index([timesheetId, date])
}
```

The legacy single-row TimeEntry on the existing in-memory model stays
around for the current TimeKeeping page until the api/ side is wired —
then the page rewrites against Timesheet.

## UI surfaces

### `Time Keeping` page (worker view)

```
┌─────────────────────────────────────────────────────────┐
│  My timesheets                                          │
│  ◀  Current: May 30 – Jun 12 (cutoff Fri Jun 12)  ▶     │
│  Pay date Fri Jun 19    Status: Draft                   │
│                                                         │
│           Sa  Su  Mo  Tu  We  Th  Fr  | Sa  Su …  Fr   │
│  Regular  7   0   8   8   8   8   4   | 8   0   …  8   │
│  Council  0   0   0   2   0   0   0   | 0   0   …  0   │
│  + Task                                                 │
│                                                         │
│  Week 1: 43  ⚠ 3h OT     Week 2: 40                     │
│  Period total: 83 (3h overtime)                         │
│  [Save draft]              [Submit timesheet]           │
│                                                         │
│  History ▼                                              │
│   • May 16 – May 29  · approved (Niki Misfeldt)         │
│   • May 2  – May 15  · approved (Sandra Williams)       │
└─────────────────────────────────────────────────────────┘
```

### `Approvals` page (approver view)

```
┌─────────────────────────────────────────────────────────┐
│  Approvals · Pay period May 30 – Jun 12                 │
│  9 pending                                              │
│                                                         │
│  Lucas Lopatka       83h  🔥 3h OT  [Approve] [Reject]  │
│    Submitted Fri 4:20 pm                                │
│  Helen Michelle      80h           [Approve] [Reject]  │
│  Kim Pike            76h           [Approve] [Reject]  │
│  …                                                      │
│                                                         │
│  ▼ Recently approved                                    │
│   • Niki Misfeldt   80h   approved by you · Fri 4:51pm  │
└─────────────────────────────────────────────────────────┘
```

Approvers also see the standard worker view (their own timesheets).

## Implementation plan

### Phase 1 — config + cutoff endpoint  (this commit)

- ✅ `api/src/skintyee-pay-periods.ts` with `PAY_PERIOD_CONFIG`,
  `payPeriodFor()`, `recentPayPeriods()`
- ✅ This design doc
- next: expose `GET /v1/timekeeping/pay-periods` so the Dashboard's
  cut-off countdown stops hardcoding `2026-05-29`

### Phase 2 — schema + storage

- Add Prisma `Timesheet` + `TimeEntry` models above
- Migration / `db push`
- Drop the legacy `TimeEntry` from `DataService.timeEntries` once
  the api/ wired

### Phase 3 — submission API

- `GET /v1/timekeeping/timesheets?period=…`
- `PATCH /v1/timekeeping/timesheets/:periodId/draft`
- `POST  /v1/timekeeping/timesheets/:periodId` (submit)
- Server-side OT calc + `requiresAdminApproval` flag

### Phase 4 — approval API + role check

- `GET  /v1/timekeeping/timesheets/all?period=…&status=submitted`
- `POST /v1/timekeeping/timesheets/:id/approve`
- `POST /v1/timekeeping/timesheets/:id/reject`
- Approver gate: `appRole === 'admin' ||
  (appRole === 'staff' && bandGroups.includes('band-manager'))`
  AND `(requiresAdminApproval ? appRole === 'admin' : true)`

### Phase 5 — new AddTimesheet (weekly grid)

- Replace `AddTimesheet.tsx` with a 14-day grid component
- Live OT calc + tallies
- Save draft + submit buttons
- Empty rows tolerate sparse entries

### Phase 6 — TimeKeeping page split

- Worker view above (with history dropdown)
- Approver view above (with badge counts)
- Role-gated render

### Phase 7 — Dashboard wire-up

- Replace Dashboard's hardcoded `anchor='2026-05-29'` with a fetch
  from `/v1/timekeeping/pay-periods` (with a useMemo + 60-min cache)

## Tech-debt cleanup (separate task)

The app/ side still uses `moment` (~70KB) — officially in maintenance
mode. The api/ side now uses `dayjs` (~2KB, almost-identical API,
immutable by default). When the timesheet UI lands, migrate at the
same time:

```
moment(x)                  → dayjs(x)
moment().add(n, 'days')    → dayjs().add(n, 'day')   // unit is singular
m.clone()                  → drop (dayjs is immutable)
m.format('MMM D')          → same
m.diff(other, 'days')      → same (singular)
```

11 files import moment today; full sweep in a `chore(moment→dayjs)`
commit instead of one-at-a-time as we touch files.

## Open questions to revisit

- **Per-day task list** — should tasks be free-text or chosen from a
  short tenant catalog (Regular, Meeting, Travel, Training)?
- **Edit window after submit** — does a `submitted` timesheet stay
  editable by the worker until it's approved, or only after a
  reject?
- **Notifications** — do approvers want a push when something lands in
  their queue?
- **Pay calc** — out of scope here (Adagio/Sage integration); we only
  capture the source data.
