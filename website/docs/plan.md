# Skin Tyee website — build plan (headless WordPress + Next.js)

Rebuild of skintyee.ca as a **headless** site: WordPress as the content CMS, a
**Next.js + React** public frontend that **reuses the app's API client** to show
the same community data (events, notifications, meetings) the mobile app shows.

Status: scaffold + this plan landed on `feature/wordpress-headless`. Phases below.

---

## 1. Architecture

```
                     ┌─────────────────────────────┐
   skintyee.ca  ───▶ │  website/web  (Next.js)      │
   (public)          │  - pages/news      → WP REST │──▶ WordPress (headless CMS)
                     │  - events/notifs/  → api/    │     posts + pages, base theme
                     │    meetings (shared client)  │──▶ api/ (NestJS) → Azure DB
                     │  - Entra sign-in (NextAuth)  │
                     └─────────────────────────────┘
```

Two backends, one frontend:
- **WordPress** (`website/`, Docker) — editorial content: **Pages** + **News posts**.
  Served as JSON via the built-in **REST API** (`/wp-json/wp/v2`). Base block theme.
- **`api/`** (the NestJS API Server) — the **same** events / notifications /
  meetings / feed the app consumes, via the **shared `ApiService`**.

### Shared API client (decision: extract shared packages)
The app's `app/src/services/api` (`ApiService` interface + portable
`HttpApiService` + `MockApiService`) and `app/src/models` move into workspace
packages, imported by **both** the app and the website:

- **`packages/models`** → `@skintyee/models` (domain types)
- **`packages/api-client`** → `@skintyee/api-client` (`ApiService` + Http/Mock impls)
- **`website/web`** becomes a **pnpm workspace member** so it can import them.

`HttpApiService` is already framework-agnostic (`fetch` + injected auth getters
`getRole / getAccessToken / getUpn`), so it runs server-side in Next.js unchanged.
The app's imports (`skintyee/models`, `skintyee/services/api`) get re-pointed to
the packages; **verify the app still typechecks** after the move.

---

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Frontend | **Next.js (App Router) + React + TypeScript**, SSG/ISR (SEO) |
| WP backend | **Fresh base-theme WordPress** (Twenty Twenty-Five); Elementor build archived to `legacy/` + WXR reference |
| Shared client | **Extract `@skintyee/api-client` + `@skintyee/models`**; `web/` joins the pnpm workspace |
| Site auth | **Wire Microsoft Entra sign-in now** — NextAuth.js + Entra ID provider |
| CSS library | **Tailwind CSS** (sane, standard for Next.js) |
| Banner carousel | **Swiper** (plug-and-play: autoplay, dots, touch, bundled CSS) |
| Calendar view | **FullCalendar (React)** — month/week, like the app's calendar |
| wp-admin SSO | **OpenID Connect Generic** plugin → Entra (free; group→role via snippet) |

---

## 3. Existing taxonomies (reuse — do not reinvent)

These come from the app/`api/` and the original WP importer
(`legacy/importer/setup-categories.php`). The fresh WordPress must register the
**same** category taxonomy so notifications/news line up app ↔ website.

### Notification categories — `app/src/models/index.ts` (`NotificationCategory`)
Mirror the skintyee.ca WordPress taxonomy:

- **Top-level:** `Events` · `Programs` · `News` · `Announcements`
- **Announcements sub-categories:** `Health` · `Safety` · `Council`

(e.g. a Water Boil Advisory → **Health**; a wildfire notice → **Safety**;
agenda posted → **Council**.) Authoritative WP setup:
`legacy/importer/setup-categories.php`.

### Meeting types — `MeetingTypeSlug` (`api/src/skintyee-meeting-types.ts`)
`band-meeting` · `council-meeting` · `staff-meeting` · `public-event` ·
`closed-session`. Derived server-side from the M365 event's Outlook category.

### Events — `CommunityEvent`
Carries a **`public: boolean`** flag (+ `cancelled?`, optional `lat/lng` map pin).

### Public Records categories — `PublicRecord`
`Bylaw` · `Notice` · `Report` · `Form`.

### Program areas (transparency / planner `categoryLabels`)
Housing · Public Works · Education · Health · Social Assistance ·
Child & Family Services · IT · Administration · Forestry · Council.

---

## 4. Public vs private gating

The public website is anonymous-first; it must only surface **public** items, and
show more once a user signs in (Entra). Rules:

- **Events:** show where `public === true`. (Signed-in members may see band-only.)
- **Meetings:** show `public-event` / `band-meeting`; **never** `closed-session`
  to anonymous visitors.
- **Notifications/news:** show public categories; gate sensitive ones to signed-in.
- **Band management & roles:** the public page is the **governance / administration
  roster** — Chief & Council plus band management / department leads and their
  **roles** (name · title · role · photo only). This is public-appropriate. But
  the underlying `BandMember` model is **sensitive** (Entra objectIds, UPNs,
  mailboxes, licences), so `api/` returns only the curated public fields to the
  `public` role. The **full member directory** stays gated behind Entra sign-in
  (app/internal). Never expose raw `BandMember` fields publicly.
- The site calls the shared `ApiService` with the **`public` role** (the api/'s
  `x-role` / RolesGuard), so filtering happens **server-side**. `feed.get({ role })`
  already takes a role; **events/meetings need a public-visibility filter added in
  `api/`** (follow-up — see §8).

---

## 5. Pages & features

### Home (`/`)
1. **Hero banner carousel** (Swiper) up top — editorial slides (image + headline + link).
2. **Notifications** strip — latest public alerts, colour-coded by category.
3. **Upcoming events** — public events (cards + the calendar below).
4. **Meetings** — upcoming public/band meetings (respect `closed-session`).
5. **Calendar view** (FullCalendar) — combined events + notifications + meetings,
   filterable by category/type, like the app's calendar.
6. **Onboarding CTA** — shown **only when signed in** → onboarding (SharePoint URL
   placeholder for now).

### Navigation
- Content pages from WordPress (`/<slug>`), News (`/posts/<slug>`).
- **Onboarding link in the menu when signed in** (→ SharePoint later).

### Content
- `/` news list, `/posts/<slug>` post, `/<slug>` WP page — via WP REST (`web/lib/wp.ts`).

### Band management & roles (`/governance`)
Public governance/administration page — **Chief & Council** and **band management /
department leads** with their **roles** (name · title · role · photo). Sourced from
the shared `ApiService.directory` at the **`public` role** (curated public fields
only — see §4); grouped by role (`Chief` / `Council` / management / department).
The full member directory stays internal (signed-in / app only).

---

## 6. Auth

- **Frontend (readers/members):** **NextAuth.js + Microsoft Entra ID provider** —
  its own OIDC session, independent of WordPress. Drives "logged in" → onboarding
  link/CTA and any gated content. The signed-in user's role/token feeds the shared
  `ApiService` auth getters (`getRole/getAccessToken/getUpn`).
- **wp-admin (editors):** **OpenID Connect Generic** plugin against the same Entra
  tenant; Entra group/App-Role → WP role via a free mu-plugin snippet. Keep a
  break-glass local admin. Stay on the patched 3.11.x. (Headless ⇒ SSO only needs
  to cover wp-admin.)

---

## 7. Theming (logo colours + green)

Tailwind theme tokens from the Skin Tyee logo palette (`app/src/styles.tsx`) **plus
green**:

| Token | Hex | Use |
|---|---|---|
| `primary` (cyan) | `#00B8EC` | links, primary actions |
| `accent` (orange) | `#EC6A37` | highlights, hover |
| `success` (green) | `#9ECD3B` | **added** — success, nature/land accents |
| `ink` | `#1D1D1D` | text / dark surfaces |

Consistent with the app theme and the Vaultwarden skin already shipped.

---

## 8. Phasing

1. **Foundation** — extract `@skintyee/models` + `@skintyee/api-client`; add
   `website/web` to the pnpm workspace; verify the app still builds. Tailwind set
   up with the palette.
2. **Content** — WP REST pages/news wired (done in scaffold); base theme + the
   shared category taxonomy registered in the fresh WP.
3. **Community data** — home sections (notifications/events/meetings) via the
   shared client, **public-role**; FullCalendar view; **`/governance` band
   management & roles** page. *(needs api/ public filters — events/meetings +
   directory projection)*
4. **Banner** — Swiper hero carousel (editable slides; source TBD — WP or a simple
   config).
5. **Auth** — NextAuth + Entra; onboarding menu link + home CTA gated on sign-in.
6. **wp-admin SSO** — OpenID Connect Generic + Entra group→role snippet.
7. **Deploy** — CMS + Next.js build pipeline (reuse `legacy/azure-pipelines.yml`
   WP-over-SSH bits as reference).

---

## 9. Open items / follow-ups

- **`api/` public-visibility filter** for events + meetings (so the `public` role
  returns only public items). `feed.get({ role })` already exists.
- **`api/` curated public directory projection** — at the `public` role, `directory`
  must return only governance/management roster fields (name/title/role/photo) and
  drop Entra internals (objectId/UPN/mailboxes/licences). Powers `/governance`.
- **Banner slide source** — WordPress (a "slides" CPT/ACF) vs a simple committed
  config. Decide in Phase 4.
- **SharePoint onboarding URL** — placeholder until the SharePoint document
  library / onboarding flow is wired (ties to `docs/features/documents-and-onboarding.md`).
- **Entra app registration(s)** — one or two (frontend NextAuth vs wp-admin OIDC);
  redirect URIs per the SSO research.

---

## 10. Repo layout (target)

```
website/
  web/                 # Next.js app (pnpm workspace member)
    app/  lib/  components/
  docker-compose.yml   # fresh headless WordPress (cms)
  cms/bootstrap.sh     # install WP + base theme + taxonomy + sample content
  scraper/             # kept — original content ripper
  legacy/              # archived Elementor migration + reference/ WXR export
  docs/plan.md         # this file
packages/
  models/              # @skintyee/models   (shared)
  api-client/          # @skintyee/api-client (shared ApiService)
```

---

## 11. WordPress-side plugins & frontend components

The website needs work on **both** sides: custom WordPress plugins (server — where
WP is the source/curator) and reusable Next.js components (frontend rendering).

### Custom WordPress plugins (`website/cms/wp-plugins/` or mu-plugins)

| Plugin | Responsibility |
|---|---|
| `skintyee-carousel` | **Banner/carousel** — register a `slide` CPT (image, headline, link, order) + expose it via REST (`/wp-json/skintyee/v1/slides`) for the Swiper hero. |
| `skintyee-taxonomy` | Register the shared category taxonomy on the fresh WP — `Events · Programs · News · Announcements` + Announcements sub-cats `Health · Safety · Council` (mirrors `legacy/importer/setup-categories.php`) so WP news lines up with the app's `NotificationCategory`. |
| `skintyee-events` | **Events** authored/curated in WP (editorial events not in M365) — CPT + `public` flag, REST-exposed; merged with `api/` events on the frontend. |
| `skintyee-notifications` | **Notifications** WP can publish (news-style alerts) by category, REST-exposed; merged with `api/` notifications. |
| `skintyee-meetings` | **Meetings** WP-curated entries (public/band only — never `closed-session`), REST-exposed; complements `api/`/Graph meetings. |
| `skintyee-entra-sso` (mu-plugin) | **Entra** — configure **OpenID Connect Generic** against the tenant + the free **group/App-Role → WP-role** mapping snippet; force the Microsoft button, keep a break-glass admin. |

> Boundary note: events/notifications/meetings are **primarily** sourced from the
> `api/` server (M365/Graph) via the shared `ApiService`. These WP plugins cover
> the **editorial/curated** slice WP owns; the frontend **merges** both sources,
> applying public/private gating.

### Frontend components (`website/web/components/`)

`HeroCarousel` (Swiper) · `EventCard` · `NotificationItem` · `MeetingItem` ·
`CommunityCalendar` (FullCalendar) · `GovernanceRoster` + `RoleCard` (band
management & roles) · `OnboardingCta` (signed-in only) · `SignInButton`
(NextAuth/Entra). All typed against `@skintyee/models`.

---

## 12. Progress log

> Kept current as the build proceeds (per "document this plan as you go").

- **Phase 0 — scaffold (done):** Elementor build archived to `legacy/` + WXR
  reference; fresh headless WordPress (`docker-compose` + `cms/bootstrap.sh`,
  REST verified); Next.js skeleton (WP REST pages/posts).
- **Phase 1 — foundation (done):**
  - Extracted `@skintyee/models` + `@skintyee/api-client` to `packages/`; the app
    keeps its `skintyee/models` + `skintyee/services/api/*` imports via thin
    **re-export shims** (no rewrite of the 57 call sites).
  - `website/web` added to the pnpm workspace; consumes the shared client
    (`transpilePackages`); web resolves `@skintyee/api-client` ✓.
  - **Tailwind** wired with the logo palette + green (`primary #00B8EC`,
    `accent #EC6A37`, `success #9ECD3B`, `ink #1D1D1D`).
  - **Verified:** app typecheck shows **0 new errors** vs the pre-Phase-1 baseline
    (3 unrelated pre-existing `Directory.tsx` react-native-paper errors before and
    after).
  - **Gotcha (recorded):** adding `web` pulled a 2nd `@types/react` (18.3) that
    collided with the app's 18.0 → `TS2786` JSX errors. Fixed with a root
    `pnpm.overrides` pinning `@types/react`/`@types/react-dom` to the app's
    `18.0.38`. Keep React **types** aligned workspace-wide when adding JS packages.
- **Next — Phase 2/3:** register the shared taxonomy in WP; home sections
  (notifications/events/meetings) via the shared client at the `public` role +
  FullCalendar; **needs the `api/` public-visibility filter** (see §9).
