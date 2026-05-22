# webfront

Web presence for **Skin Tyee First Nation** — the public website (`skintyee.ca`)
and the community **app**, managed together as a pnpm workspace.

The site is a self-hosted WordPress install migrated from the previous
Site123-hosted `skintyeefirstnation.org`. The app is a React Native + Expo
proof-of-concept built for the proposal.

## Purpose

Give Skin Tyee First Nation a **modern, self-owned digital platform** —
website, community app, email, and admin tooling — built on the Nation's own
**Microsoft 365 + Azure** tenant rather than rented third-party services. The
goals below guide it.

### One identity for everything

The backbone is **Microsoft Entra ID** (Azure AD): a **single identity** that
ties together Microsoft 365 (email/Teams/Office), the **Azure** subscription
(website, DNS, database), the **app's** sign-in and roles, and — over time —
**workstation and server access** via SSO. One account per person, one place to
grant or revoke access. (Details: [`docs/365/entra-id.md`](docs/365/entra-id.md).)

### The app as the friendly admin front-end

The **app becomes the front-end for that identity**: band admins add a member,
assign a role, or offboard someone **once in the app**, and it
provisions/deprovisions them across Entra ID and Microsoft 365 (license, groups,
shared mailboxes) behind the scenes — no admin-center expertise needed.

### Transparent band management

The app makes the Nation's finances visible to members: **band expenditures by
program area** (Housing, Public Works, Education, Health, Social Assistance, …)
with **budget-vs-actual** and drill-down breakdowns of *how much was spent and
where*, plus **major capital projects** — sourced from the band's financial
system (Ferrus ASAP / Adagio / Sage). Open books build trust and accountability.

### Keeping the community informed & engaged

One place for **push notifications** (health & safety alerts like water
advisories or wildfire notices, and council announcements), **band meetings**
(agendas, schedules, minutes), **community events**, and **polling & voting on
issues** — so members hear about what matters and have a say, with notifications
categorized to match the skintyee.ca website.

### Website integration (publish to the public)

The app and the **skintyee.ca** website share data: public-facing content
entered/managed in the app — **community events, band meetings (and notes),
public records/transparency, and announcements** — is **auto-published to the
WordPress site** so the general public sees it without needing the app.

**Enter it once.** Staff manage this content in the app and it flows to the
website automatically — **no separate website updates, no double data entry,
and no keeping WordPress in sync by hand.** The app is the single source of
truth; the public site stays current on its own. Notification categories already
mirror the website's taxonomy (Health / Safety / Council / Events / …), so one
update reaches both audiences. (The diagram's *Auto-Publish* flow — see
[`docs/SkinTyee.drawio.pdf`](docs/SkinTyee.drawio.pdf).)

### NGO priorities

As an NGO, the priorities are **easy backups, auditability, and clear,
tax-deductible operating costs** over minimizing spend.

### Education & open source

By embracing **open-source technology** and **partnering with the community and
local schools**, the platform is also a learning opportunity. Transparent,
open processes improve **education about band management and governance** — and
because the project is open source and serves the Nation directly, it gives
**youth real, hands-on opportunities in tech**: students can learn from and
**contribute to** a live project that matters to their own community. The aim is
to **build capacity in-community**, not just buy software.

> **Not everything is open source — by design.** The **financial / ERP systems
> (Sage 300, Adagio, Ferrus ASAP)** are intentionally **closed-source**,
> commercial, First-Nations-specific software, kept that way for **security**
> around sensitive financial and member data. Open source is embraced for the
> **public-facing platform** (website + app); the **books run on established,
> supported, audited systems**, which the app *integrates with* rather than
> replaces.

## Architecture

The platform at a glance — actors (Public / Band Members / Admins & Staff), the
app and its features, the website, the API server + Azure Cloud DB, and the
ERP / band-delegation pieces. Full detail in
[`docs/SkinTyee.drawio.pdf`](docs/SkinTyee.drawio.pdf).

[<img src="docs/SkinTyee.png" width="520">](docs/SkinTyee.drawio.pdf)

## Visual walkthroughs

**App** — the Skin Tyee community app:

[<img src="docs/media/dashboard.png" width="220"> <img src="docs/media/public-records-transparency.png" width="220"> <img src="docs/media/schedule-meeting-map.png" width="220">](docs/walkthrough.md)

📱 **[See the full app walkthrough →](docs/walkthrough.md)** — dashboard & charts, events, notifications (list + calendar), directory, meetings, polls/voting, transparency, time keeping, and the admin tools.

**Website** — the skintyee.ca WordPress site:

[<img src="docs/media/website/home.png" width="220"> <img src="docs/media/website/skin-tyee-nation-leadership.png" width="220"> <img src="docs/media/website/news.png" width="220">](docs/website-walkthrough.md)

🌐 **[See the full website walkthrough →](docs/website-walkthrough.md)** — home, about, history, leadership, community, projects, news, announcements, gallery, and more (full-page screenshots of every page).

## Layout

```
.                      # webfront repo root + pnpm workspace
├── app/               # @skintyee/app — Skin Tyee community app (React Native + Expo)
├── api/               # @skintyee/api — API contract (OpenAPI) + stub server
├── website/           # WordPress site + migration tooling (git subtree)
├── docs/              # project + app docs, architecture decisions, proposal deck
├── package.json       # pnpm workspace root
└── pnpm-workspace.yaml
```

`website/` is vendored as a **git subtree** (not an npm package). Pull/push it
with `git subtree pull|push --prefix=website <remote> <branch>`.

## app/ — Skin Tyee community app

A React Native + Expo app (iOS, Android, web) that reuses the proven "ppt"
app stack — **React Native Paper** (Material UI, dark theme), **Redux Toolkit**
(`createAsyncThunk`), **React Navigation 6**, TypeScript.

**Features** (role-gated for Public / Band Member / Admin+Staff, from
`docs/SkinTyee.drawio.pdf`):

- **Dashboard** — community stats + budget charts (pie summary, budget-vs-actual,
  major projects) with a **Month / Year** reporting toggle.
- **Public Records → Transparency** — public band expenditures by program area
  (Housing, Public Works, Education, Health, Social Assistance, Child & Family
  Services, IT, Administration…), with drill-down breakdowns of *how much was
  spent and where*, and major-project allocated-vs-spent tracking.
- **Directory** (~150 members), **Community Events**, **Band Meetings**,
  **Notifications** (categories mirror the skintyee.ca WordPress taxonomy —
  Health / Safety / Council / Events / Programs / News / Announcements),
  **Polling + Surveys / Vote on Issues**, **Time Keeping**, **Financial Records**.

> **Proof-of-concept.** Data is mocked behind a typed `ApiService`; auth is a dev
> role switcher. Intended real services are Azure: **Entra ID** (auth),
> **Azure Blob Storage** (files), **Azure Cloud DB** + an API Server, with
> financial data from the **Ferrus ASAP Suite + Adagio / Sage 300** integration.
> Every stub is catalogued in [`app/STUBS.md`](app/STUBS.md).

```bash
pnpm --filter @skintyee/app start    # Expo dev server (press w for web)
pnpm --filter @skintyee/app typecheck
```

## api/ — Skin Tyee API (proposed)

Contract-first backend (the "API Server" in the diagram). [`api/openapi.yaml`](api/openapi.yaml)
is the source of truth — the contract the app's `ApiService` targets. `api/`
also ships a lightweight Express **stub** server (Swagger UI + sample data).

**Recommended stack:** **NestJS + Prisma + Azure Database for PostgreSQL Flexible
Server (PostGIS)**, **Entra ID** auth (role guards), Dockerized to **Azure
Container Apps** behind `api.skintyee.ca`, Azure DevOps CI. PostGIS gives
geospatial support for land allocation / GIS mapping + map pins. Full rationale:
[`api/README.md`](api/README.md) and ADR-7 in [`docs/architecture-decisions.md`](docs/architecture-decisions.md).

```bash
pnpm --filter @skintyee/api dev       # http://localhost:4000/docs (Swagger UI)
```

## Getting started

```bash
pnpm install            # install workspace dependencies

# Run the app
pnpm --filter @skintyee/app start

# Browse the API contract (Swagger UI)
pnpm --filter @skintyee/api dev

# Run the WordPress site locally (Docker)
cd website && docker compose up -d   # http://localhost:8080  (admin/admin, dev only)
```

See [`website/README.md`](website/README.md) for the full scrape → import →
export migration workflow.

## Deployment

`website/azure-pipelines.yml` deploys the WordPress stack via Azure DevOps over
SSH (`develop` → staging, `master` → production), using a **managed Azure
Database for MySQL – Flexible Server** in production
([`website/docker-compose.prod.yml`](website/docker-compose.prod.yml)).

The app distributes via **EAS Build** to **TestFlight** (iOS) and **Google Play**
(Android) — see [`docs/testing-strategy.md`](docs/testing-strategy.md).

## Microsoft 365 integration

Email/identity run on **Microsoft 365** (the Outlook Cloud "Email Relay" in the
architecture diagram). Role addresses like `info@skintyee.ca`, `admin@skintyee.ca`,
and `chief@skintyee.ca` are **shared mailboxes** that licensed staff work from
with their own logins.

🆔 **[Entra ID, admin account & access →](docs/365/entra-id.md)** — the
`admin@…onmicrosoft.com` break-glass admin (governs 365 + Azure), Entra ID
Connect (hybrid identity), and how Entra ID drives SSO and workstation/server
access.

📬 **[Shared mailbox setup & adding users →](docs/365/shared-mailboxes.md)** —
how shared mailboxes are created in the M365 admin center and how individual
(licensed) users are granted access (Full Access / Send As / Send on Behalf),
with reference screenshots and the current mailbox/member list.

💲 **[Microsoft 365 pricing & tax →](docs/365/pricing.md)** — Business Standard
(with Teams) per-user cost, why it's 100% tax-deductible under Canadian law, and
the rule to **unlicense departed/terminated staff immediately**.

Related email services: **[ImprovMX](docs/improvmx/README.md)** (forwarding
aliases / secondary domains into M365) and **[Mailgun](docs/mailgun/README.md)**
(transactional / app-sent email).

## Password management (1Password)

Credentials and secrets live in **1Password (Business)** — encrypted vaults with
per-team/role access, so staff never email passwords and access is cut off
instantly when someone leaves.

🔐 **[1Password setup & user management →](docs/1password/setup.md)** — vaults,
groups, provisioning users, and offboarding.
💲 **[1Password pricing & tax →](docs/1password/pricing.md)** — per-user cost,
100% Canadian tax-deductibility, and immediate deprovisioning of departed staff.

## Domains (GoDaddy)

Domains are registered at **GoDaddy** — `skintyee.ca` (primary) plus
`skintyee.com` / `.org` / `.net` (defensive, forwarded to `.ca`) — with DNS in
**Azure DNS**. The foundation for the website, `app.skintyee.ca`, and
`@skintyee.ca` email.

🌐 **[Domains & DNS →](docs/godaddy/domains.md)** — registrar account, Azure DNS
delegation, the key records (web, app, M365 email), and renewal/safety.
💲 **[Domain pricing & tax →](docs/godaddy/pricing.md)** — annual cost, 100%
Canadian tax-deductibility, and "don't lose the domain".

## Developer tools

Tooling used to build/maintain the software: **JetBrains IntelliJ IDEA Ultimate**
(1 seat) and **Claude (Anthropic) Max** — the Claude Code AI assistant (1 seat).

🛠️ **[Developer tools & cost →](docs/developer-tools.md)** — IDE + AI assistant,
pricing, and 100% Canadian tax-deductibility.

## Costs

💰 **[Pricing overview →](docs/pricing-overview.md)** — all software/service
costs in one place — recurring and one-time (Microsoft 365, 1Password, GoDaddy,
Azure, the **Apple/Google app-store** accounts, and developer tools) — each
linking to its detailed cost record, with a worked example. All are 100%
tax-deductible operating expenses under Canadian law.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — workspace overview, conventions, and decisions
- [`docs/app-plan.md`](docs/app-plan.md) — app build plan
- [`docs/architecture-decisions.md`](docs/architecture-decisions.md) — service ADRs (Entra ID, Azure Blob, Ferrus/Adagio, WordPress categories)
- [`docs/roadmap.md`](docs/roadmap.md) — 3-month engagement timeline
- [`docs/pricing-overview.md`](docs/pricing-overview.md) — software/service costs summary, recurring + one-time (M365, 1Password, GoDaddy, Azure, app stores, dev tools) + tax
- [`docs/app-distribution-costs.md`](docs/app-distribution-costs.md) — Apple Developer + Google Play costs, tax deductibility
- [`docs/developer-tools.md`](docs/developer-tools.md) — developer tooling (IntelliJ IDEA Ultimate, Claude Max) + tax
- [`docs/testing-strategy.md`](docs/testing-strategy.md) — testing + TestFlight/Google Play
- [`api/openapi.yaml`](api/openapi.yaml) — proposed API contract · [`api/README.md`](api/README.md) — API stack recommendation
- [`docs/walkthrough.md`](docs/walkthrough.md) — app visual screen-by-screen walkthrough
- [`docs/website-walkthrough.md`](docs/website-walkthrough.md) — website (skintyee.ca) page-by-page screenshots
- [`docs/wordpress-runbook.md`](docs/wordpress-runbook.md) — run / recover / back up the WordPress site
- [`docs/365/entra-id.md`](docs/365/entra-id.md) — Entra ID, the admin account, Entra Connect, SSO + device/server access
- [`docs/365/shared-mailboxes.md`](docs/365/shared-mailboxes.md) — Microsoft 365 shared mailbox setup + adding users
- [`docs/365/pricing.md`](docs/365/pricing.md) — Microsoft 365 per-user pricing, tax deductibility, offboarding
- [`docs/improvmx/README.md`](docs/improvmx/README.md) — ImprovMX email forwarding + pricing
- [`docs/mailgun/README.md`](docs/mailgun/README.md) — Mailgun transactional email + pricing
- [`docs/1password/setup.md`](docs/1password/setup.md) — 1Password vaults, groups, user management
- [`docs/1password/pricing.md`](docs/1password/pricing.md) — 1Password per-user pricing, tax deductibility, offboarding
- [`docs/godaddy/domains.md`](docs/godaddy/domains.md) — GoDaddy domains + Azure DNS records
- [`docs/godaddy/pricing.md`](docs/godaddy/pricing.md) — domain pricing, tax deductibility
- [`docs/Skintyee-App-Proposal.pptx`](docs/Skintyee-App-Proposal.pptx) — proposal deck
- [`app/STUBS.md`](app/STUBS.md) — catalogue of POC stubs
- [`docs/hosting-costs.md`](docs/hosting-costs.md) — hosting cost basis + rationale
- [`website/README.md`](website/README.md) — WordPress migration tooling

## Conventions

Default branch is `master`. Work on `feature/*` branches and merge with
`git merge --no-ff` using the subject
`Merge branch 'feature/<name>' into '<target>'`.
