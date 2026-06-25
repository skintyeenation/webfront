# Password policy — Skin Tyee (Entra ID + on-prem AD)

What password rules apply to Skin Tyee accounts, where they come from, and the
**live values** read from the tenant. Companion to
[`password-reset-sspr.md`](password-reset-sspr.md) (self-service reset) and
[`entra-connect.md`](entra-connect.md) (hybrid identity).

> **Last verified:** 2026-06-25, via Microsoft Graph as
> `admin@skintyeenation.onmicrosoft.com` (tenant `ee46daed-…-203a4bec`).
> Re-check after any Entra "Password protection" or on-prem GPO change.

## Which policy applies (it depends on the account type)

Skin Tyee is **hybrid** — on-prem AD (`STFN.local`) synced **up** to Entra via
**Password Hash Sync** (ADR-16). So two policies coexist:

| | **Managed staff** (synced from on-prem AD) | **Cloud-only** (app members / contractors, Graph-provisioned — ADR-15; the `admin@…onmicrosoft.com` break-glass) |
|---|---|---|
| **Source of truth** | **On-prem AD Default Domain Policy (GPO)** | **Entra cloud password policy** |
| Length / complexity / expiry | Set by the on-prem GPO | Entra defaults (below) |
| Where they change it | On a domain PC / on-prem | `aka.ms/sspr`, Outlook, etc. |

## Entra cloud password policy (cloud-only accounts)

These rules are **fixed by Microsoft and not configurable**:

| Property | Value |
|---|---|
| **Length** | 8–256 characters (minimum **8**) |
| **Complexity** | At least **3 of 4**: lowercase `a–z`, uppercase `A–Z`, number `0–9`, symbol (`@ # $ % ^ & * - _ ! + =` … or space) |
| **Banned passwords** | Global banned-password list **always on**; **custom** banned list available (tenant has Entra ID **P1**) |
| **History** | Cannot reuse the **current** password on change |
| **Expiration** | **Configurable** — see live value below |
| **Smart lockout** | On by default — see live value below |

### Live values (read from the tenant, 2026-06-25)

- **Password expiration: NEVER EXPIRE.** All three verified domains report
  `passwordValidityPeriodInDays = 2147483647` (Microsoft's "never-expire"
  sentinel): `skintyeenation.onmicrosoft.com`, `skintyee.ca`,
  `skintyeenation.mail.onmicrosoft.com`. Notification window 14 days (moot while
  never-expire). This is Microsoft's modern recommended setting.
- **Per-user overrides: none.** Sampled users return an empty `passwordPolicies`
  attribute → everyone uses the default policy (no per-user "never expire"/"no
  complexity" exceptions).
- **Smart lockout / custom banned list:** not readable via the Graph `v1.0`
  endpoint (portal-managed). **Assume Entra defaults unless changed in the
  portal:** lockout threshold **10** failed attempts → **60-second** lockout,
  escalating. ⚠️ **Verify/record** at Entra admin center → **Protection →
  Authentication methods → Password protection** (lockout threshold + duration +
  custom banned-password list).

> **Expiry nuance with PHS:** synced managed-staff passwords expire per the
> **on-prem GPO**, not Entra, unless
> `EnforceCloudPasswordPolicyForPasswordSyncedUsers` is enabled (it is not).
> The cloud "never-expire" above governs **cloud-only** accounts.

## On-prem AD policy (managed staff) — TO BE RECORDED

The managed-staff password rules live in the **Default Domain Policy GPO** on
`STFN.local` and are **not yet captured here**. Windows defaults (unless the band
customized them): min length **7**, complexity **enabled** (3 of 5 categories,
can't contain the user's name), max age **42 days**, history **24**. *Record the
actual GPO values here* (run `Get-ADDefaultDomainPasswordPolicy` on a DC, or read
the Default Domain Policy in Group Policy Management).

## Recommendation

Because cloud passwords **never expire**, set them strong once: a **14–16+
character passphrase using all four character types** (e.g. four random words + a
number + a symbol). That clears both the Entra cloud rule and any on-prem GPO, and
length beats forced rotation. **Pair every account with MFA** (SSPR/P1 is in
place) — that's the real protection on a non-expiring password.

## How to check / change the policy

```bash
# Cloud password expiry + notification window (per verified domain)
az rest --resource https://graph.microsoft.com \
  --url 'https://graph.microsoft.com/v1.0/domains' \
  --query "value[].{domain:id, validityDays:passwordValidityPeriodInDays, notifyDays:passwordNotificationWindowInDays}" -o table

# Per-user override flags (DisablePasswordExpiration / DisableStrongPassword)
az rest --resource https://graph.microsoft.com \
  --url "https://graph.microsoft.com/v1.0/users?\$select=userPrincipalName,passwordPolicies" \
  --query "value[].{upn:userPrincipalName, policy:passwordPolicies}" -o table
```

- **Set cloud expiry** (e.g. never-expire): Microsoft 365 admin center → Settings
  → Org settings → Security & privacy → **Password expiration policy** (or
  `Update-MgDomain -PasswordValidityPeriodInDays 2147483647`).
- **Smart lockout + custom banned passwords:** Entra admin center → Protection →
  Authentication methods → **Password protection**.
- **On-prem GPO:** Group Policy Management → Default Domain Policy → Computer
  Config → Policies → Windows Settings → Security Settings → **Account Policies →
  Password Policy**.
