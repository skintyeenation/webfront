# DNS hosting — GoDaddy vs Azure DNS (decision)

> **Decision (2026-05-26): DNS stays at GoDaddy through the POC.**
> No migration to Azure DNS is planned right now. See "Triggers to
> reconsider" below for the conditions that would change this.

The architecture diagram + earlier docs described Azure DNS as the
target, but the actual setup hasn't moved. This doc captures the
trade-off we walked through and the decision to defer.

## Current state

```text
$ dig +short NS skintyee.ca
ns25.domaincontrol.com.   ← GoDaddy
ns26.domaincontrol.com.
```

Authoritative DNS for `skintyee.ca` is at **GoDaddy**. Email setup
(MX / SPF / DKIM / DMARC / autodiscover) is done by adding records
in GoDaddy's DNS panel — see
[`../365/setup-skintyee-ca-email.md`](../365/setup-skintyee-ca-email.md)
for the step-by-step.

## The trade-off

| | **GoDaddy (chosen)** | **Azure DNS (deferred)** |
|---|---|---|
| **Cost** | $0 (included with the domain registration) | ~$0.50 USD/mo per zone + $0.40 per million queries ≈ **~$7/yr** |
| **Where records are added** | GoDaddy DNS panel (web UI), or GoDaddy API for the bold | Azure portal, `az network dns record-set`, Bicep / Terraform |
| **Subdomain frequency at our scale** | ~5–10/year (`api`, `app`, `lookup`, `lookup-app`, future...) — small enough to live with manual clicks | Same number, but scriptable / IaC-managed |
| **Custom-domain cert validation (Container Apps / SWA)** | Print "add this TXT record in GoDaddy" → user adds manually | Same flow today (deploy scripts print instructions either way); *could* be upgraded to `az network dns record-set txt add-record` for full automation |
| **Consolidation** | DNS at GoDaddy, everything else (Azure subscription, M365 tenant) is Microsoft | DNS + subscription + tenant all under one Microsoft bill, identity, audit log |
| **Migration risk** | None (already there) | Email-cutover window 30 s – 48 h *if* email is in flight (currently it isn't — see "Why now is actually safe" below) |
| **Rollback path** | n/a (nothing to roll back) | Keep GoDaddy DNS records intact 2 weeks post-cutover, revert nameservers if needed |
| **IaC** | Not really (no good Terraform / Bicep provider story) | Yes — first-class `az` + Bicep / Terraform |
| **Audit log** | GoDaddy's basic change history | Azure Activity Log on the zone |
| **Front Door / Traffic Manager integration** | Manual CNAME wrangling | Native — alias records, instant updates |

## Why now would *actually* be safe to migrate (but we're still not)

The usual reason "don't move DNS yet" is the **bounced-mail window**
during the nameserver propagation. That doesn't apply right now:
`dig +short MX skintyee.ca` returns empty — no mail is flowing
through the domain yet. So the migration would be effectively
zero-risk on the email side.

Other risks (cert validation, subdomain interruptions) are also
minimal today — only the SharePoint publisher pipeline is using
the tenant, and it doesn't depend on `skintyee.ca` DNS records.

So technically: today is a great day to move. We're choosing not to
because the trade-off math still doesn't favour it at POC scale —
not because we *can't*.

## Why we're not doing it

For a 3-month proof-of-concept with **5–10 DNS edits expected over
the engagement**, the value of moving is:

- **Programmatic record management** — but the deploy scripts
  currently print "add this in GoDaddy" instructions; they don't
  call any DNS API. Either way the operator does the same work.
- **IaC** — but we're not managing DNS as code today. Adding that
  later (with or without Azure DNS) is the actual blocker, not
  where DNS lives.
- **~$7/year saved** — irrelevant at NGO budget scale.

And the cost is:

- **A migration step** to run (small)
- **A 2-week dual-DNS-records period** to maintain (small but adds
  friction)
- **A new Azure resource to remember** (RG, zone, RBAC)
- **A new failure mode** (Azure DNS goes down, or our subscription
  has an issue, and now DNS is part of that surface)

The math doesn't pay off until either subdomain count grows
significantly, DNS-as-IaC becomes a real requirement, or we want
the deploy scripts to fully automate custom-domain validation.

## Triggers to reconsider

Revisit this decision when **any** of these become true:

1. We're adding more than ~10 subdomains/year and the manual
   GoDaddy clicks are annoying.
2. We start managing infra as code (Bicep / Terraform) and want
   DNS records in the same model.
3. We adopt **Azure Front Door** or **Traffic Manager** — both
   integrate tightly with Azure DNS via alias records.
4. M365 email troubleshooting gets hard and we want Azure's better
   per-record audit log.
5. We need GoDaddy itself to stop being a vendor (security
   incident, business reasons) — at which point we'd move *both*
   the registrar and DNS, with DNS to Azure as the easier of the
   two moves.
6. The DNS-as-IaC enhancement to the deploy scripts (replacing
   "print manual step" with `az network dns record-set ... add`)
   becomes a desired feature.

If any of these become true, the migration runbook (the version
of this doc that pre-dated this decision; available via
`git log -p docs/godaddy/dns-hosting-tradeoff.md`) walks through:
inventory current GoDaddy records → pre-populate Azure DNS →
verify with `dig` against Azure NS → flip GoDaddy nameservers →
2-week rollback window → decommission GoDaddy records.

## What we're doing instead

1. **Complete M365 email setup at GoDaddy.** Add the missing MX +
   SPF + DKIM + DMARC + autodiscover records there. Walkthrough:
   [`../365/setup-skintyee-ca-email.md`](../365/setup-skintyee-ca-email.md).
2. **Add new subdomains in GoDaddy** as services come online. Each
   service's setup script prints the exact CNAME / TXT to add.
3. **Keep the registrar at GoDaddy.** Auto-renew ON. 2FA ON.
   Registrant contact verified per CIRA. Same as today.

## See also

- [`domains.md`](./domains.md) — current GoDaddy domain inventory + registrar-account practices
- [`../365/setup-skintyee-ca-email.md`](../365/setup-skintyee-ca-email.md) — step-by-step for completing M365 email at GoDaddy
- [`../365/entra-usage.md`](../365/entra-usage.md) — current usage map; DNS records live outside this picture
- Earlier versions of this file (via `git log -p`) contain the migration runbook in case the decision flips later
