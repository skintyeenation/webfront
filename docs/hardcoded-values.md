# Hardcoded values — known sites of duplication

Single-source places where a runtime value (a GUID, a slug, a mail address, a
group display name) is **hardcoded in more than one file** because there's no
shared module pulling it from one canonical source yet. Every entry here is a
potential drift bug — if you change one site you must change every other site
listed alongside it, or the app will silently disagree with itself.

The goal is to **shrink this list over time** by either (a) lifting the
hardcoded value into a shared package both sides import, (b) deriving one side
from the other at runtime via Microsoft Graph, or (c) removing the duplication
when the feature it supports is retired.

When you find a new pair of files that hardcode the same thing, add it here.
When you fix one (consolidate, derive, or remove), strike it through and keep
the entry as a record so future searches still find the migration.

---

## Active hardcodes

### 1. Skin Tyee security group catalog — slugs, GUIDs, display names

**Canonical source:** [`api/src/skintyee-groups.ts`](../api/src/skintyee-groups.ts) (`SKINTYEE_SECURITY_GROUPS`)

**Duplicated in:**

| File | What it hardcodes | Why it's duplicated |
|---|---|---|
| `app/src/components/pages/Directory.tsx` (`BAND_GROUP_LABELS`) | slug → human label for chip rendering | App doesn't have an admin API roundtrip just to render labels |
| `app/src/components/pages/MemberDetail.tsx` (`BAND_GROUP_LABELS`) | slug → human label for chip rendering | Same as above; will be lifted into a shared `groups` util |

**Drift symptom:** Add a new group in `api/src/skintyee-groups.ts` but forget to add the matching `BAND_GROUP_LABELS` entry — the chip renders the kebab-case slug as a fallback title (`'new-group' → "New Group"`) instead of its real display name.

**Last drift caught:** 2026-06-04 — when adding the `staff` slug for the staff-auth feature (`docs/features/staff-auth.md`), both `BAND_GROUP_LABELS` maps had to be updated alongside the catalog. Confirmed by hand; once the consolidation in "Fix path" below lands this won't be necessary.

**Fix path:** lift `BAND_GROUP_LABELS` into `app/src/services/api/groupCatalog.ts` that pulls from `apiFactory().admin.securityGroups()` once and caches it; remove both inline maps.

---

### 2. M365 group slug → mail address

**Canonical source:** [`api/src/skintyee-groups.ts`](../api/src/skintyee-groups.ts) — each M365 group entry already has a `mail` field

**Duplicated in:**

| File | What it hardcodes |
|---|---|
| `app/src/components/pages/Directory.tsx` (`M365_SLUG_TO_MAIL`) | `'management-m365': 'management@skintyee.ca'`, etc. |
| `app/src/components/pages/MemberDetail.tsx` (`M365_SLUG_TO_MAIL`) | same map, copy-pasted |

**Why it exists:** the chip-dedup logic (introduced 2026-06-04 — every M365 group surfaces twice in the directory feed: once in `bandGroups` from the catalog walk, once in `mailboxMemberships` from the all-mail-groups walk) needs to know which mailbox UPN corresponds to which M365 group slug, so it can hide the mailbox chip when the M365 group chip is already shown.

**Drift symptom:** Add a fifth M365 group (`finance-m365` say) to `skintyee-groups.ts`, but forget to add it to both `M365_SLUG_TO_MAIL` tables — Betty (or whoever's in that group) shows two chips on her row again.

**Fix path:** extend `/v1/admin/security-groups` to include the `mail` field for M365 entries (already in the source catalog), then cache that catalog client-side and derive the map. Same migration as #1 — both go away together.

---

### 3. Shared mailbox inventory — the 13 UPNs

**Canonical source:** Microsoft 365 itself (queried via Graph at seed time)

**Duplicated in:**

| File | What it hardcodes |
|---|---|
| `api/src/graph-feed.service.ts` line 684 | comment listing all 13 mailbox UPNs as part of the account-type classifier rationale |
| `docs/365/shared-mailboxes.md` | the inventory itself + PowerShell audit script |
| `docs/architecture-decisions.md` (ADR-?) | listed when discussing the seed strategy |

**Drift symptom:** A new shared mailbox is created in EXO but the comment in `graph-feed.service.ts` stays stale. Cosmetic, not functional — the classifier itself works from `assignedLicenses.length === 0`, not the inventory.

**Fix path:** the comment is documentation, not logic. Acceptable; just review when the inventory changes.

---

### 4. Microsoft Graph permission GUIDs

**Canonical source:** [Microsoft Graph permissions reference](https://learn.microsoft.com/graph/permissions-reference)

**Duplicated in:**

| File | What it hardcodes |
|---|---|
| `scripts/setup-app-graph.sh` (`PERMS` array) | application permission GUIDs for `User.ReadWrite.All`, `Group.ReadWrite.All`, `Tasks.Read.All`, `LicenseAssignment.ReadWrite.All`, `Organization.Read.All` |
| `docs/features/member-provisioning.md` | references the same GUIDs by name + GUID |
| Memory file `feedback_graph_permission_guid_pitfalls.md` | the "Microsoft Graph appId is `...000` not `...046`" warning |

**Drift symptom:** Microsoft swaps a GUID (rare but documented). Easier failure mode: a delegated-vs-application permission name collision — both have the same display name but different GUIDs, so the wrong copy-paste grants the wrong permission and `az ad app permission grant` silently consents to a permission that's never queried.

**Fix path:** keep the cross-referenced doc + memory; verify GUIDs with `az ad sp list --filter "appId eq '00000003-0000-0000-c000-000000000046'"` before any rotation.

---

## Conventions

- **Always link to the canonical source** at the top of each entry — if a reader knows the slug they should reach the source-of-truth in one click.
- **List every duplicate site**, including doc files. A stale comment isn't load-bearing but it costs reading time when you hit it.
- **Drift symptom** — describe what breaks when the sites disagree, so a future reader skimming this doc can decide whether their bug matches.
- **Fix path** — if there's a path to consolidate, name it. If the duplication is inherent (e.g. an offline mock can't import a server-only module), say that.

---

## Removed (kept as migration receipts)

*Nothing yet. Add entries here as duplications are eliminated so future searches still find the original site and the fix.*
