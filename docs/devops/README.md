# Azure DevOps

The Nation runs its source control + CI/CD on **Azure DevOps**, with
Azure as the **primary** Git host and GitHub mirrored as a read-only
**secondary** for backup and public discoverability.

This section covers the setup once, plus the day-to-day "I need to
do X" runbooks.

## Why Azure DevOps as primary

- **One Microsoft identity for everything.** Same Entra ID
  `firstname.lastname@skintyee.ca` account signs into Outlook,
  Azure portal, the Skin Tyee app, *and* Azure DevOps. No separate
  GitHub login to provision/deprovision when staff turn over —
  Entra ID is the single off-switch.
- **Single billing surface.** ADO Pipelines minutes, hosted agents,
  artifact storage, and Azure subscriptions all roll up under the
  same Microsoft account as Microsoft 365 + Azure. One invoice, one
  tax record, simpler NGO accounting.
- **First-class Azure deployment.** ADO Pipelines + service
  connections give clean federated-credentials access to Azure
  Container Apps, Azure DNS, Azure Storage, Azure DB for MySQL/PostgreSQL
  — all the targets the platform already uses (the website's
  `azure-pipelines.yml` is in production today on this pattern).
- **Self-hosted agents.** The `props-agents` repo in the same
  workspace already runs ADO build agents in Docker — we can reuse
  the operational model for Skin Tyee work.

GitHub stays as a read-only mirror so the code is **publicly
discoverable** (good for the NGO transparency posture and for
youth/school collaboration noted in `/README.md § Purpose`), but
the canonical source of truth is Azure.

## What's in this section

| Doc | When you need it |
|---|---|
| [azure-devops-setup.md](./azure-devops-setup.md) | **One-time** — create the `skintyeenation` org + the `devops` project + the repo. Push existing Git history. |
| [azure-primary-github-mirror.md](./azure-primary-github-mirror.md) | **One-time** — wire the Azure → GitHub mirror push so every Azure-side merge appears on GitHub within minutes. |
| [migrate-ci-workflows.md](./migrate-ci-workflows.md) | **One-time per workflow** — port the SharePoint docs publisher (and any future GitHub Actions) into an Azure Pipeline. |
| [agents.md](./agents.md) | When ADO Pipelines minutes get expensive or you need a runner with access to the band's internal network. |

## Architectural records

- [`../architecture-decisions.md § ADR-8`](../architecture-decisions.md)
  documents the original "GitHub Actions over Azure DevOps" choice for
  the SharePoint docs publisher.
- **ADR-9** (added with this section) records the reversal —
  why we're moving the canonical repo to Azure now, and what stays
  on GitHub.

## Day-to-day after setup

Most of the time, this section is invisible: developers `git push`
to Azure, the SharePoint docs publisher runs via Azure Pipelines,
GitHub auto-mirrors. You only come back here when:

- **A new project starts** — create a new repo in the same
  `skintyeenation` org (`azure-devops-setup.md § Adding a second repo`).
- **A pipeline breaks** — debug in the ADO Pipelines UI; if the
  agent itself is the problem, see `agents.md`.
- **Onboarding a new dev** — Entra ID grants Azure DevOps access
  via the M365 group `skintyee-developers` (set up in
  `azure-devops-setup.md § Granting access to staff`).
