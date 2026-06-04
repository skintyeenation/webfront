# Staff Auth — two sign-in paths

**Status:** Proposed. **Companion ADR:** ADR-16 (to be drafted alongside).

The app needs to let two distinct populations sign in:

1. **Band-member staff** — entitled to a Microsoft 365 license and an Entra
   identity. They sign in via Microsoft Entra SSO (the existing path).
2. **Everyone else who needs access** — non-band-member staff, contractors,
   externals. They are tracked as `Person` rows with no linked `BandMember`,
   have no Entra identity, and sign in via an email + password the app
   manages itself.

The discriminator is "do you have an Entra account?" The data model says it
plainly: a `Person` with `bandMemberId != null` is Entra-backed; a `Person`
with `bandMemberId == null` is not. The auth path follows the data — no
flags, no overlap.

### UPN vs. email — the identifier split

This split is also why `BandMember` carries a **UPN** (`bob@skintyee.ca`)
while `Person` carries an **email** (`bob@example.com`, `jane@gmail.com`,
anything):

- **UPN** is the Entra identity. It's `firstname.lastname@skintyee.ca`
  by convention, controlled by the tenant, and the thing the Microsoft
  sign-in flow keys off. BandMembers always have one.
- **Email** is the contact + password-login identifier for non-Entra
  staff. Can be the staff member's personal address, their employer's
  address, or whatever the admin records. Not tenant-controlled and
  doesn't have to end in `@skintyee.ca` (in practice, it never will —
  the only `@skintyee.ca` addresses live in the M365 tenant, which means
  they have a UPN, which means they're a BandMember, not a Person-only
  row).

Concretely: an admin creates a contractor named Bob with
`email = bob@example.com`, picks "Create app sign-in", and gets back a
one-time password to share. Bob then signs in at the Account page using
`bob@example.com + password` — completely independent of Entra, because
Bob has no Entra account to begin with.

If Bob ever becomes a band member later, his BandMember row gets a UPN
(`bob.smith@skintyee.ca`) and his existing Person row is linked
(`bandMemberId` set). At that point the password on the Person row
becomes dormant (see "Schema validation" below — passwords aren't valid
once a BandMember is linked) and Bob signs in via Microsoft Entra from
then on. The Person record persists for onboarding history.

## Identity matrix

|                          | Band member                                                     | Not band member                                  |
|--------------------------|-----------------------------------------------------------------|--------------------------------------------------|
| **Staff**                | M365 + Entra + Person linked → **Microsoft sign-in**            | Person only, password set → **password sign-in** |
| **Not staff (community)**| No M365, no Entra, Person only (optional) → **password sign-in**| No app access (public/web only)                  |

### M365 eligibility vs. M365 grant — two different things

**Eligibility:** "you have an Entra account" = "you appear in the
Management Directory in the app" = "you are a `BandMember`". That's the
capability gate — only people in the directory CAN receive an M365
license, because licensing requires an Entra user to assign to. People
without an Entra account (`Person` with `bandMemberId == null`) are not
eligible at all.

**Grant:** which eligible users actually get licensed is an
**administrative decision**, made at AddMember/EditMember time (Slice 3
of `member-provisioning.md` — currently deferred pending Graph consent
for `LicenseAssignment.ReadWrite.All` + `Organization.Read.All`). Policy
today: licenses go to band-member staff, but the system doesn't enforce
that — admins choose per-user.

The "Skin Tyee Staff" Entra security group (slug `staff`, added to the
`SKINTYEE_SECURITY_GROUPS` catalog) is a **role marker**, not a
licensing gate. Its purpose:

- Drives `appRole = 'staff'` derivation cleanly (today the derivation
  infers staff from management/it/finance/title heuristics; the
  explicit `staff` slug becomes the highest-precedence signal).
- Makes "who counts as staff" visible in one place (the Entra group's
  membership list) instead of scattered across job titles and other
  group memberships.
- Lets AddMember's existing "Also create staff record" switch seat the
  new user in the group automatically, so the role marker and the
  Person record land atomically.

Membership in the `staff` group does NOT automatically trigger license
assignment. The admin still picks license grant explicitly per user.
This separation keeps "who is staff" (an HR fact) decoupled from "who
has M365" (an IT cost decision).

## Catalog change

Add to `api/src/skintyee-groups.ts`:

```ts
{ id: '<paste objectId from Entra>', slug: 'staff', displayName: 'Skin Tyee Staff', kind: 'entra', description: 'Band members who are also staff — gates M365 licensing' },
```

Bumps the catalog from 16 Entra + 4 M365 to 17 + 4. Hardcoded sites that
reference the catalog stay in lockstep — see `docs/hardcoded-values.md`
(`BAND_GROUP_LABELS` in `Directory.tsx` + `MemberDetail.tsx`).

`role-derivation.ts` gains an explicit `staff` branch (today it derives
staff via management/it/finance/title-heuristic). Cleanest path: if the
`staff` slug is present in `bandGroupSlugs`, return `'staff'` immediately
— before the management/admin branches so the explicit signal wins.

## Schema additions

```prisma
model Person {
  // … existing fields …
  email          String?    // → make UNIQUE when present (allow null for
                            //   Persons with no auth need)
  passwordHash   String?    // null = no password set; can't sign in.
  passwordSetAt  DateTime?
  resetToken     String?    @unique
  resetTokenAt   DateTime?  // tokens valid for 1 hour
  lastSignInAt   DateTime?
  appRole        String?    @default("staff")
                            //   "staff" | "admin" override; null/staff
                            //   = the default for password-auth users.
                            //   "admin" is a deliberate promote-flag.
  @@unique([email])
}
```

Validation rules (server-enforced):

- `passwordHash` may only be set when `bandMemberId IS NULL`. Setting a
  password on an Entra-backed Person is rejected with 400 — they use SSO.
- `email` is REQUIRED when `passwordHash` is set (you can't reset what
  you can't email).
- `appRole` of `"admin"` requires admin to grant — exposed via a
  separate endpoint, not the AddPerson form.

### Lifecycle: password → linked to BandMember

When a `Person` that already has a `passwordHash` is later linked to a
`BandMember` (the admin sets `bandMemberId` on the row — e.g. Bob, who
started as a contractor, becomes a band member), two things happen
atomically inside the same transaction that writes `bandMemberId`:

1. `passwordHash`, `resetToken`, `resetTokenAt` are all set to `NULL`.
   The password path is dormant once Entra is the source of truth.
2. The next sign-in attempt by Bob has to use Microsoft Entra — he
   physically no longer has a password row to authenticate against.

The `POST /v1/auth/staff/login` endpoint also defensively rejects with
401 if `bandMemberId != NULL` on the matched Person, even if a
`passwordHash` somehow survives (e.g. a partial migration / a stale
row). Belt-and-braces — the link transaction should already have
cleared it.

The Person row itself stays — it owns onboarding-assignment history
and the staff-record state. Only the auth fields are wiped.

## Endpoints

### Public

```
POST /v1/auth/staff/login
  body:  { email, password }
  reply: 200 { token, person: { id, displayName, email, appRole } }
         401 { error: 'invalid_credentials' }

POST /v1/auth/staff/request-reset
  body:  { email }
  reply: 204 (always — don't leak whether the email is known)

POST /v1/auth/staff/reset-password
  body:  { token, newPassword }
  reply: 204 | 400 invalid/expired
```

### Admin

```
POST   /v1/admin/people/:id/set-password
  body:  { password? }  // server-generates if absent
  reply: { password }   // returned ONCE; admin must share with the user
  notes: Used for initial-credential issuance from the AddPerson form
         (when bandMember is not linked) and from EditPerson's "Reset
         password" button.

DELETE /v1/admin/people/:id/password
  reply: 204
  notes: Revokes app access without deleting the Person record.
```

`/v1/auth/staff/login` issues a **JWT** (HS256, 24h TTL) carrying
`{ sub: person.id, role: person.appRole, kind: 'staff' }`. The api/'s
existing `x-role` shim flows the role into role-gated controllers
exactly the same way Entra sign-in does today — so all the existing
gating works as-is. The api/ secret-keys the JWT signing material via
the Container App's existing secrets infrastructure (a new
`STAFF_AUTH_SECRET`).

ADR-7 noted that `x-role` is the stand-in for Entra JWT validation. This
work doesn't yet move the Entra path to JWT — only the new staff path
gets JWT-from-day-one because there's no SSO provider to defer to. When
the Entra side switches to JWT (planned, separate work), both paths
share the same middleware.

## Email sender

Reset links + initial credential delivery use **Microsoft Graph
`/users/{from}/sendMail`** from `info@skintyee.ca` via the existing
`skintyee-app-graph` Entra app. No new infrastructure: we already have
the app-only credential, the role permission `Mail.Send` adds cleanly
to `scripts/setup-app-graph.sh`, and there's no Mailgun account to wire
up. Sender mailbox is a known shared mailbox so bounce handling is
already in place.

Permission to add: `Mail.Send` (application — GUID
`b633e1c5-b582-4048-a93e-9f11b44c7e96`).

## UX

**Account page (signed-out, anyone):**

```
┌─────────────────────────────────┐
│   [Skin Tyee logo]              │
│                                 │
│   [ Sign in with Microsoft ]    │  ← existing path
│                                 │
│   — or —                        │
│                                 │
│   email     [_______________]   │  ← new path
│   password  [_______________]   │
│   [ Sign in ]                   │
│                                 │
│   Forgot password?              │
└─────────────────────────────────┘
```

Once signed in (either path), the app is identical — the Account page,
the role chips, the tabs all read from `auth.role` which lands the same
way regardless of source.

**AddPerson (admin):**

A new switch — "Create app sign-in" — appears when `bandMemberId` is
unset (a contractor row). When on, the form requires `email`, generates
a one-time password on save, and shows it in the success card the same
way AddMember does for M365 passwords today.

**EditPerson (admin):**

- "Reset password" button — analogous to EditMember's rotate-password
  panel. Shows new password ONCE on success.
- "Revoke access" button (red, confirm dialog) — sets `passwordHash =
  null`, leaving the Person record intact for onboarding history.

## Sequencing

Four slices, shipped in this order:

1. **Catalog + group sync** — add `staff` slug, deploy, run sync,
   confirm the staff Entra group's members show up in `bandGroups`.
   AddMember's "Also create staff record" switch starts seating the
   user in the Entra `staff` group too.
2. **Schema + password endpoints** — Person columns, login / reset /
   set-password endpoints, JWT middleware. No UI yet.
3. **AddPerson / EditPerson UI** — admin issues + rotates passwords;
   sign-in UI on Account.
4. **Forgot-password flow** — request-reset endpoint + email template +
   reset UI. Lower-priority; admins can reset until then.

Effort estimate:
- (1) — half a day (catalog + group walk already wired)
- (2) — 1-2 days (auth middleware is the substantive work)
- (3) — 1 day
- (4) — half a day plus Graph `Mail.Send` consent

## Locked-in decisions

Confirmed 2026-06-04. Recorded here so the implementation slices can
proceed without re-litigating each choice, and so a future reader who
wonders "why did they do X?" finds the rationale next to the choice.

### 1. Token mechanism — **JWT (HS256, 24-hour TTL)**

The api/ already runs as a single Container App revision per environment,
so a server-side opaque-session store would mean adding either an
in-memory map (lost on revision swap during deploys) or a Postgres
session table (extra write per request). JWT sidesteps both: signed
client-side, validated on every request via the same middleware Entra
JWT validation will eventually use (ADR-7). Refresh = re-login —
24h matches typical M365 token lifetimes so the UX is consistent.

`STAFF_AUTH_SECRET` lives as a Container App secret; rotation = update
the secret + invalidate all in-flight tokens (acceptable for a small
staff population).

### 2. Email sender — **Microsoft Graph from `info@skintyee.ca`**

We already have the app-only Graph credential (`skintyee-app-graph`),
the Container App already has its tenant + client id + secret wired,
and `info@skintyee.ca` is a known shared mailbox with bounce handling
configured. Adds one permission (`Mail.Send`, GUID
`b633e1c5-b582-4048-a93e-9f11b44c7e96`) to `scripts/setup-app-graph.sh`.

Mailgun was the alternative — rejected because it would require
provisioning a new account, paying for it, and managing yet another
credential. Graph is "we already have it; one consent grant".

### 3. Password complexity — **Entra default (8+ chars, 3 of 4 categories)**

Categories = uppercase, lowercase, digit, symbol. Identical to the
complexity Entra enforces on M365 users, which means:

- Admins explain password rules once across both auth paths.
- The server-side validation is a single shared helper.
- Users with one M365 password and one staff-auth password don't have to
  remember two different policy quirks.

Stricter (16+ char passphrases, breach-list checks) is future work if
the population grows enough to warrant it.

### 4. Failed-login lockout — **5 attempts → 15-min lockout per email, in-memory**

Single-instance api/ today (Container App with revisions, not multi-replica),
so an in-memory Map keyed by email-lowercase tracking (count, firstFailAt)
is sufficient. Distributed lockout (Redis, Postgres-backed counter) would
add a hard dependency for a problem we don't yet have — the staff
population is small enough that brute-force is observable in the API logs
long before it'd succeed against an 8+ char password.

Lockout window: 15 minutes. Auto-clears when the window expires. Admin
can force-clear by clearing+resetting the password.

### 5. Password-auth Person as admin — **Yes, via explicit `appRole` flip**

Not the default. The `Person.appRole` column has `@default("staff")` —
which is what every password-auth user gets. Promoting to admin requires
an existing admin to PATCH it explicitly through a separate endpoint
(rejected by the AddPerson form to avoid accidental self-grant via
form-field manipulation).

Rationale: rare but real — non-Entra accountants, external auditors, or
contractors who need admin-level access without provisioning an M365
seat. The cost of supporting this is one nullable column; the cost of
not supporting it is "every admin has to be in Entra forever," which
forecloses a legitimate workflow.

### 6. "Skin Tyee Staff" group population — **Manual in Entra + AddMember auto-seat**

Two paths, both end at the same place:

- **AddMember** with the "Also create staff record" switch flipped
  automatically calls `POST /groups/{staff-id}/members/$ref` so the new
  BandMember lands in the group as part of the create transaction.
- **Direct in Entra Admin Center** — admins managing existing band
  members tag them as staff by adding them to the group manually. The
  next directory sync picks the change up.

Both paths converge on `bandGroups` containing `staff` for the user,
which drives `appRole = 'staff'` via `role-derivation.ts`. No third
source of truth.

### 7. Existing over-licensed members — **Out of scope**

There are band members in the current M365 tenant who aren't staff and
shouldn't be licensed under the going-forward policy. De-licensing them
needs:

- a list (admin-curated — not derivable from the data we have today)
- a Graph `removeLicense` pipeline
- a comms plan ("you'll lose @skintyee.ca email on X date")

None of that is part of this feature. Treat it as a separate
"M365 right-sizing" workstream after the password auth path is live.

## Related

- ADR-7 — auth + `x-role` header (the JWT path here is the seed of
  replacing `x-role` end-to-end)
- ADR-15 — member provisioning via Graph (this builds on the AddMember
  endpoint by also seating users in the new `staff` group)
- `docs/features/member-provisioning.md` — the existing provisioning
  feature this extends
- `docs/hardcoded-values.md` — `BAND_GROUP_LABELS` needs a `staff`
  entry in lockstep with the catalog
