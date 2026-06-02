# Meeting types — Outlook categories as the typing signal

The Skin Tyee app's Band Meetings page is backed by real Microsoft 365
calendars. Each event surfaces with a **type** chip that comes from an
Outlook **category** applied by the organizer when scheduling.

## The five types

Defined in [`api/src/skintyee-meeting-types.ts`](../../api/src/skintyee-meeting-types.ts):

| Slug | Display name | Outlook category | Description |
|---|---|---|---|
| `band-meeting` | Band Meeting | `Band Meeting` | General band membership meeting |
| `council-meeting` | Council Meeting | `Council Meeting` | Council-only / governance meeting |
| `staff-meeting` | Staff Meeting | `Staff Meeting` | Staff / management operational meeting |
| `public-event` | Public Event | `Public Event` | Open to the wider community |
| `closed-session` | Closed Session | `Closed Session` | In-camera / confidential council session |

The **category text matters** — the api/ filters events by exact-string
match against these categories (case-insensitive). Misspelled categories
won't surface.

## Source calendars

The api/ pulls from three calendars in parallel (also in the catalog):

1. **`bandmanager@skintyee.ca`** — shared inbox calendar; the default
   scheduling target for general band activities
2. **Skin Tyee Council (M365 group)** — `council@skintyee.ca`;
   council-organized meetings auto-show on the group's calendar
3. **Skin Tyee Management (M365 group)** —
   `management@skintyeenation.onmicrosoft.com`; staff / leadership

Events are de-duplicated by Graph event ID and sorted by start time.

## Why Outlook categories (not separate calendars per type)

- Organizers schedule from their existing Outlook flow — one click on
  Categorize tags the event
- A single event can be `Council Meeting` AND `Closed Session` if both
  apply (first catalog match wins on the read path)
- Visible to organizers as a colored label in Outlook's calendar UI
- Doesn't require maintaining 5 separate shared calendars

The alternative — a dedicated calendar per type — was rejected because
it forces organizers to switch calendars and prevents cross-typing.

## Architecture

```
                    ┌──────────────────────┐
   Schedule from    │  Outlook / Teams /   │
   the app  ───────▶│  app's CreateMeeting │───────────────┐
                    │  screen              │               │
                    └──────────────────────┘               │
                                                            ▼
                                          ┌──────────────────────────┐
                                          │  POST /v1/meetings       │
                                          │  body:                   │
                                          │    typeSlug              │
                                          │    sourceIndex (0/1/2)   │
                                          │    title, startsAt, ...  │
                                          └─────────┬────────────────┘
                                                    │
                              ┌─────────────────────┴──────────────────────┐
                              │  GraphFeedService.createBandMeeting()      │
                              │  - looks up MeetingType by slug            │
                              │  - POST /users/{upn}/events                │
                              │    or /groups/{groupId}/events             │
                              │    body.categories = [type.category]       │
                              │  - returns { id, webLink, typeSlug, source}│
                              └─────────────────┬──────────────────────────┘
                                                ▼
                                  ┌─────────────────────────────────┐
                                  │  Microsoft Graph                │
                                  │  → bandmanager@ calendar  OR    │
                                  │    Skin Tyee Council (M365)  OR │
                                  │    Skin Tyee Management (M365)  │
                                  └─────────────────────────────────┘

                              ┌────────── Reads ───────────┐
                              │
                              ▼
                    ┌──────────────────────┐
   Display in       │  GET /v1/meetings    │
   app's Meetings   │  ?type=<slug>?       │
   page  ◀─────────┤  → calendarView       │
                    │     on all 3 sources │
                    │     filter by         │
                    │     categories[]      │
                    └──────────────────────┘
```

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/meetings` | member+ | List meetings (`?type=<slug>` filter) |
| GET | `/v1/meetings/types` | member+ | Catalog: types + sources |
| POST | `/v1/meetings` | admin | Create real M365 event with category |
| PATCH | `/v1/meetings/:id` | admin | Edit (in-memory only; Graph update path TODO) |
| DELETE | `/v1/meetings/:id` | admin | Remove (in-memory only; Graph delete TODO) |

## App UI

- **Meetings page** (`app/src/components/pages/Meetings.tsx`): each card
  shows a type chip (`Band Meeting` / `Council` / etc.) + a source chip
  (`Band Manager` / `Skin Tyee Council (M365)` / `Skin Tyee Management (M365)`)
- **Schedule Meeting** (`app/src/components/pages/CreateMeeting.tsx`):
  - Type chip selector — pick one of the 5
  - Source calendar chip selector — pick one of the 3
  - "Create a Teams join link" toggle (`isOnlineMeeting: true` → Graph
    creates an `onlineMeeting.joinUrl`)
  - Submit → posts to `/v1/meetings`, real event lands in the chosen
    calendar tagged with the right category

## Required Graph permissions

| Permission | What for |
|---|---|
| `Calendars.ReadWrite` (Application) | Read calendar events + create new ones |
| `Group.ReadWrite.All` (Application) | Read M365 group calendars (council@ + management@) |

Granted by `scripts/setup-app-graph.sh`. **Gotcha:** the script's
`admin-consent` step doesn't auto-revoke older Calendars.Read once
you swap in ReadWrite — see [feedback_graph_permission_guid_pitfalls.md]
in memory. The api/'s token cache also persists for 50min so a restart
is needed after the consent change.

## Adding a new type

1. Add an entry to `SKINTYEE_MEETING_TYPES` in
   `api/src/skintyee-meeting-types.ts` with a unique slug and category
2. Update `MEETING_TYPE_LABELS` + `MEETING_TYPE_ICONS` (and the model's
   `MeetingTypeSlug` union) in `app/src/components/pages/Meetings.tsx`
   and `CreateMeeting.tsx` and `app/src/models/index.ts`
3. Restart api/ — endpoint reflects the new type immediately

No tenant-side provisioning needed. The category gets auto-created in
the organizer's mailbox the first time it's used.

## Adding a new source calendar

Add to `MEETING_SOURCE_CALENDARS` with the calendar's owner (user UPN
or M365 group object id) + a display name. The pull loop walks it on
the next request; create() can target it by index.

## Known limitations

- **Recurring events** — `calendarView` does expand them, so each
  occurrence shows up as a separate row. We don't preserve the
  recurrence relationship in `BandMeeting`. Editing one occurrence
  through the app would only modify that occurrence.
- **Time zones** — currently using UTC in the create body. If we want
  organizer-local time we need to add a `timeZone` field to the schedule
  screen.
- **PATCH/DELETE through Graph** — the api/'s `PATCH/DELETE /v1/meetings/:id`
  still operate on the in-memory fixture only. Wire to Graph
  `PATCH /users/{upn}/events/{id}` + DELETE when needed.
- **No tenant-wide category list** — each mailbox gets its own master
  category list when first used. To force consistent colors, push via
  Exchange Online PowerShell `New-MailboxFolderPermission` / category
  management cmdlets (out of scope for now).
