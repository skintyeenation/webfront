# 1Password — setup & user management

How Skin Tyee's 1Password (Business) account is organized, and how we add,
provision, and remove users. Companion to [`pricing.md`](pricing.md).

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

## Remove a user (offboarding)

Security-critical and a cost item — **do it the moment someone leaves/terminates.**
Full steps in [`pricing.md`](pricing.md#️-offboarding--deprovision-departed-staff-immediately):

1. **Suspend** the user (revokes access immediately; suspended users aren't billed).
2. **Recover/reassign** anything they owned, then **remove** them (frees the seat).
3. **Rotate every shared secret** they could see (passwords, keys, banking/vendor logins).
4. Do the **Microsoft 365 offboarding** at the same time ([`../365/pricing.md`](../365/pricing.md)).

> Reference screenshots can be added under `docs/1password/media/` (like
> `docs/365/media/`) and embedded here.
