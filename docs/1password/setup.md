# 1Password — setup & user management

How Skin Tyee's 1Password (Business) account is organized, and how we add,
provision, and remove users. Companion to [`pricing.md`](pricing.md).

> **End-user view:** if you're a *new staff member* trying to *use* 1Password
> rather than administer it, follow
> [`docs/onboarding/1password.md`](../onboarding/1password.md) instead.
> That walks through accepting the invite, saving the Emergency Kit, installing
> on every device, and joining shared vaults.

> 1Password is a core **security control**: credentials live in encrypted
> **vaults** with per-team/per-role access, so staff never email passwords and
> access can be cut off instantly when someone leaves.

## How it's organized

- **Account** — one 1Password **Business** account for the Nation
  (`skintyeenation.1password.ca` / `.com`), managed by **Owner/Administrator** users.
- **Vaults** — credentials are grouped into vaults by team/role, e.g.:

  | Vault | Holds | Access (group) |
  |---|---|---|
  | **Administration** | Band office logins, M365 admin, domain/DNS, vendors | Admin / IT |
  | **Finance** | Banking, accounting (Adagio/Sage), payroll | Finance + Chief |
  | **IT / Infrastructure** | Azure, GitHub, hosting, API keys, the website | IT |
  | **Council & Chief** | Governance accounts | Council |
  | **Programs** (Housing, Forestry, Lands, Health, …) | Program-specific logins | the relevant team |
  | **Everyone / Shared** | Org-wide, low-sensitivity logins | All staff |

- **Private vault** — each person has their own private vault for work logins
  only they use.

> Principle: **least privilege** — put a credential in the most specific vault,
> and grant access by **group**, not person-by-person, so adding/removing people
> is one step.

## Add a user (provision)

1. 1Password admin (sign in at the org URL) → **People → Invite people**.
2. Enter the person's **name + work email** (`@skintyee.ca`) → send invite.
3. They accept, create their account, and save their **Secret Key / Emergency
   Kit** (needed to sign in on new devices).
4. **Add them to the right group(s)** (People → the user → Groups, or Groups →
   add member). Group membership is what grants vault access — see below.
5. Confirm they've enabled **two-factor authentication**.

> Each Business member also gets a **free linked 1Password Families** account
> for personal use — keeps work and personal separate.

## Grant access (via groups + vaults)

- **Groups** map to teams/roles (Admin, Finance, IT, Council, Programs, All staff).
- Grant a **group** access to a **vault** with the right permission:
  - **Admin → Groups →** select group **→ Vaults →** add vault, set permission
    (View / Edit items, or Manage), **or**
  - **Admin → Vaults →** select vault **→ Manage access →** add the group.
- Permission levels: **View** (read/use), **Edit** (add/change items),
  **Manage** (control who has access). Give the minimum needed.

## Recovery

- Admins / the **Recovery group** can **recover** a user who lost their account
  (begin recovery → user re-confirms) so vault data isn't lost.
- This is also how you retrieve a departed employee's private-vault items if
  needed during offboarding.

## Entra ID SSO

**Unlock with SSO** lets staff sign in to 1Password using their
`@skintyee.ca` Entra ID account instead of a Master Password. After
the integration is set up, the new-user flow becomes:

1. Admin invites the user in Entra ID (via the **1Password Users**
   group) → SCIM provisioning auto-creates their 1Password account.
2. User signs in to 1Password via Entra ID — no Master Password
   creation step at all.
3. MFA, password resets, and de-provisioning are all centralised in
   Entra ID; 1Password follows.

The end-user view of switching an existing account to Unlock with SSO
is in [`../onboarding/1password.md → Step 6`](../onboarding/1password.md#step-6--connect-1password-to-entra-id-unlock-with-sso).
This section is the admin-side one-time setup.

### Why we do this

- **Single password to roll** when a credential is compromised — the
  Entra ID one, which is already protected by Conditional Access,
  MFA, and Microsoft's risk engine.
- **Immediate deprovisioning** — disabling an account in Entra ID
  cuts 1Password access in seconds (was: separate manual suspend
  step).
- **SCIM auto-provisioning** — adding a staffer to the Entra group
  creates their 1Password account automatically. One workflow for
  IT onboarding/offboarding instead of two.
- **Zero-knowledge property is preserved.** SSO authenticates the
  user; the Secret Key still encrypts the vault locally on each
  device. Microsoft can't read 1Password vault contents.

### One-time setup (~60 min, admin does once)

You need:

- 1Password Business plan (we have this — see [`pricing.md`](pricing.md)).
- Entra ID admin role (Global admin or Application admin).
- Two browser tabs: the 1Password org admin and the Entra ID portal.

**Step 1 — Start the integration in 1Password**

1. Sign in at <https://skintyee.1password.ca/> as Owner.
2. **Policies → Sign-in & Recovery → Set up Unlock with SSO**.
3. Choose **Microsoft Entra ID** as the identity provider.
4. 1Password shows three values you'll need on the Entra side:
   - **Redirect URI** (a `https://*.1password.ca/oidc/callback` URL).
   - **Sign-out URI** (similar).
   - **Audience / Client ID placeholder** — leave this tab open;
     you'll come back.

**Step 2 — Register the 1Password app in Entra ID**

1. <https://entra.microsoft.com> → **Enterprise applications** →
   **New application** → **Create your own application** → name it
   **1Password** → **Integrate any other application you don't find
   in the gallery (Non-gallery)** → **Create**.
2. On the new app's **Single sign-on** page → **OIDC** (NOT SAML).
   You may need to set this via **App registrations → 1Password →
   Authentication** if the wizard doesn't surface it.
3. Under **App registrations → 1Password → Authentication**:
   - **Platform configuration → Web** → add the **Redirect URI**
     1Password gave you.
   - Add the **Front-channel logout URL** (the Sign-out URI).
   - **Implicit grant**: leave both checkboxes unchecked.
4. Under **API permissions** → ensure these Microsoft Graph
   *delegated* permissions are granted with admin consent:
   - `openid`
   - `profile`
   - `email`
   - `User.Read`
5. Under **Certificates & secrets** → **New client secret** →
   description "1Password SSO" → expires 24 months → **copy the
   Value column immediately** (only shown once).
6. Note the app's:
   - **Application (client) ID** (overview page)
   - **Directory (tenant) ID** (overview page)
   - **Client secret value** (from step 5)

**Step 3 — Finish the integration in 1Password**

Back on the 1Password tab from step 1:

1. Paste the **tenant ID**, **client ID**, and **client secret**.
2. Click **Test connection**. Sign in with your `@skintyee.ca`
   account at the redirect prompt. The test should land back in
   1Password with a "Connection successful" banner.
3. **Save**. The integration is now active org-wide.

**Step 4 — Assign users to the Enterprise app**

In Entra ID **Enterprise applications → 1Password → Users and
groups → Add user/group**:

- Add the **1Password Users** group (create it if it doesn't exist —
  it should contain every staffer who has a 1Password account).
- Anyone in this group can now use Unlock with SSO. Anyone not in
  the group still has a 1Password account but signs in with their
  Master Password.

**Step 5 — (Recommended) Enable SCIM provisioning**

Auto-creates 1Password accounts when Entra ID adds someone to the
group:

1. In 1Password: **Integrations → SCIM bridge** → **Get started**.
   You either deploy the SCIM bridge to your own infrastructure or
   use 1Password's hosted option (the latter is included in our
   Business plan).
2. 1Password gives you a **SCIM bridge URL** and a **bearer token**.
3. In Entra ID → **Enterprise applications → 1Password →
   Provisioning** → mode **Automatic** → paste the SCIM URL +
   bearer token → **Test connection** → **Save**.
4. Configure **Mappings** (defaults are fine — `userPrincipalName`
   → `userName` is the key field).
5. Set **Provisioning status** to **On**. New users in the
   `1Password Users` Entra group are now invited to 1Password
   automatically within ~10 minutes.

### Day-to-day after SSO is set up

- **New staffer** — admin adds them to the `1Password Users` Entra
  group. SCIM creates the 1Password account. The staffer follows
  [`../onboarding/1password.md → Step 6`](../onboarding/1password.md#step-6--connect-1password-to-entra-id-unlock-with-sso)
  (which collapses Steps 1-5 since their account is pre-provisioned
  to use SSO).
- **Departed staffer** — admin disables their Entra ID account.
  Their 1Password sessions invalidate within seconds; SCIM marks
  their 1Password account suspended within ~10 minutes. Rotate any
  secrets they could see (same as the manual offboarding section
  below).
- **Existing staffer flipping to SSO** — they follow the end-user
  doc; no admin action needed.

### Caveats

- The **Owner** account on 1Password (initial admin) cannot use
  SSO — by design, to avoid a circular dependency if Entra ID is
  down. Keep the Owner's Master Password and Emergency Kit in the
  break-glass envelope alongside the M365 admin credentials (see
  [`../365/entra-id.md → Break-glass account`](../365/entra-id.md#treat-it-as-a-break-glass-account-)).
- The **client secret rotates every 24 months.** Set a calendar
  reminder 60 days before expiry. When it expires, SSO sign-in
  starts failing for everyone; users fall back to their Master
  Password if they still have one, or are locked out if they're
  SSO-only.
- Switching an existing user from Master Password to SSO is
  generally one-way. To revert, the admin resets the user's
  account (loses Private vault contents). Plan onboarding to
  enable SSO from day one for new staff.

## Remove a user (offboarding)

Security-critical and a cost item — **do it the moment someone leaves/terminates.**
Full steps in [`pricing.md`](pricing.md#️-offboarding--deprovision-departed-staff-immediately):

1. **Suspend** the user (revokes access immediately; suspended users aren't billed).
2. **Recover/reassign** anything they owned, then **remove** them (frees the seat).
3. **Rotate every shared secret** they could see (passwords, keys, banking/vendor logins).
4. Do the **Microsoft 365 offboarding** at the same time ([`../365/pricing.md`](../365/pricing.md)).

> Reference screenshots can be added under `docs/1password/media/` (like
> `docs/365/media/`) and embedded here.
