# Skin Tyee app — visual walkthrough

A screen-by-screen tour of the Skin Tyee community app. Screenshots are from the
web build; the same screens render on iOS/Android.

> A few screens are still to be captured — they're listed with the filename to
> drop into [`media/`](media). After dropping a new PNG into `media/`, run
> `bash docs/scripts/resize-screenshots.sh` from the repo root to generate the
> 240px thumbnail in `media/thumbs/`. Then replace the _pending_ note with
> `![](media/thumbs/<name>.png)`. The thumb (not the original) is what
> renders in the table — Azure DevOps' file viewer doesn't support HTML
> `<img width=...>` tags, so we use pre-sized thumbnails referenced via
> plain markdown image syntax.

## Onboarding & navigation

| Screen | Preview | What it shows |
|---|---|---|
| Splash | ![](media/thumbs/splash.png) | Branded launch screen (Skin Tyee · First Nation). |
| Admin menu | ![](media/thumbs/admin-menu.png) | Overflow tab for admins — Admin tools (Time Keeping, Financials) + Community. |
| More menu (non-admin) | ![](media/thumbs/more-menu.png) | The overflow tab for public/members (Directory, Meetings, Polls, Account). |
| Account & role switcher | ![](media/thumbs/account.png) | Profile + dev role switcher and the **SPOOF ADMIN** badge. |

## Home (Dashboard)

| Screen | Preview | What it shows |
|---|---|---|
| Dashboard (admin, Year) | ![](media/thumbs/dashboard.png) | Admin overview, budget pie, spent-vs-allocated & per-member stats. |
| Dashboard (Month) | ![](media/thumbs/dashboard-month.png) | Same dashboard with the Month reporting toggle active. |
| Dashboard — major projects | ![](media/thumbs/dashboard-major-projects.png) | Spending bars + major projects (allocated vs spent, project-to-date). |

## Community

| Screen | Preview | What it shows |
|---|---|---|
| Community Events | ![](media/thumbs/community-events.png) | Event list with admin add/edit/cancel/delete. |
| Create / edit event | ![](media/thumbs/event-form.png) | Event form: date/time picker + draggable map pin + public toggle. |
| Event detail | 📸 _pending →_ `media/event-detail.png` | A single event's details. |
| Notifications (list) | ![](media/thumbs/notifications.png) | Feed with WordPress categories; admin post/edit/delete. |
| Notifications (calendar) | ![](media/thumbs/notifications-calendar.png) | Month calendar marking days with notifications. |
| Post / edit notification | ![](media/thumbs/notification-form.png) | Notification form with category chips. |
| Band Member Directory | ![](media/thumbs/directory.png) | The ~150-member directory list. |
| Member detail | ![](media/thumbs/member-detail.png) | Contact (member+); admin Edit / Remove. |
| Add member | ![](media/thumbs/member-form.png) | Add-member form (name, role, contact). |
| Edit member | ![](media/thumbs/member-edit.png) | Edit an existing member. |

## Governance

| Screen | Preview | What it shows |
|---|---|---|
| Band Meetings | ![](media/thumbs/band-meetings.png) | Meetings with admin add/edit/cancel/delete. |
| Schedule / edit meeting | ![](media/thumbs/schedule-meeting-map.png) | Meeting form with draggable map pin + date/time. |
| Polls — Surveys | ![](media/thumbs/polls.png) | Surveys tab of Polling + Surveys. |
| Polls — Vote on Issues | ![](media/thumbs/polls-votes.png) | Formal votes; "tap to cast your vote". |
| Poll detail | ![](media/thumbs/poll-detail.png) | Voting + live results bars. |

## Transparency & finance

| Screen | Preview | What it shows |
|---|---|---|
| Public Records · Transparency | ![](media/thumbs/public-records-transparency.png) | Band expenditures by area — pie + spent-vs-budget bars. |
| Records — areas & major projects | ![](media/thumbs/public-records-areas.png) | Per-area list (tap to drill in) + major projects. |
| Expenditure breakdown | ![](media/thumbs/expenditure-breakdown.png) | Drill-down: how much was spent and where. |
| Financial Records (admin) | ![](media/thumbs/financials.png) | Budgets, statements, grants, expenses. |

## Workforce (staff / admin)

| Screen | Preview | What it shows |
|---|---|---|
| Time Keeping | ![](media/thumbs/time-keeping.png) | All workers' hours; admin approvals. |
| Add timesheet | ![](media/thumbs/add-timesheet.png) | Staff/admin log hours (date, hours, task). |

## Shared

| Screen | Preview | What it shows |
|---|---|---|
| Confirmation modal | 📸 _pending →_ `media/confirm-modal.png` | Confirm dialog for cancel/delete actions. |
