# Azure DevOps — org, project, and repo setup

One-time setup for the Nation's Azure DevOps tenant. Result: a new
`dev.azure.com/skintyeenation` organization with a `webfront` project
containing the `webfront` Git repo, modelled on the existing
`dev.azure.com/dotproperties` org.

> **Two ways to do this** — both end up at the same place:
>
> - **Script (recommended).** `scripts/setup-azure-devops.sh`
>   (or `.ps1` for Windows) does steps 2-7 below idempotently in
>   ~2 minutes. You still do step 1 (create the org) interactively
>   because Microsoft only allows org creation through the web.
> - **Manual.** Click through the ADO UI for every step. Documented
>   below as the fallback / "what the script is actually doing".

## Prerequisites

- A Microsoft 365 admin account on the Skin Tyee tenant
  (`admin@skintyeenation.onmicrosoft.com` or your delegated admin).
  See [`../365/entra-id.md`](../365/entra-id.md).
- **Azure CLI** installed locally — `az` 2.50 or newer.
  - macOS: `brew install azure-cli`
  - Windows: <https://aka.ms/installazurecliwindows>
  - Linux: <https://docs.microsoft.com/cli/azure/install-azure-cli-linux>
- **(Windows only)** PowerShell 7 if you want to use the
  `.ps1` mirror script: <https://aka.ms/install-pwsh>.
- A local clone of the `webfront` repo with your current history.

## Step 1 — Create the `skintyeenation` Azure DevOps organization

Microsoft doesn't expose an API for creating new ADO orgs — you must
use the web UI.

1. Open <https://aka.ms/AzureDevOpsAccountCreate>.
2. Sign in with your Skin Tyee admin account
   (`firstname.lastname@skintyee.ca`).
3. **Organization name:** `skintyeenation`. The URL ends up at
   `https://dev.azure.com/skintyeenation`.
4. **Region:** Canada Central (data residency in Canada — matches the
   M365 + Azure DB regions we already use; this is the NGO
   accountability + privacy posture from
   [`../architecture-decisions.md`](../architecture-decisions.md)).
5. Click **Continue**. The org is created; you land on its dashboard.

## Step 2 — Run the setup script

From the `webfront` repo root:

```bash
bash scripts/setup-azure-devops.sh
```

(Or `pwsh scripts/setup-azure-devops.ps1` on Windows-first machines.)

The script is idempotent — re-running is safe. It will:

| Step | What | When skipped |
|---|---|---|
| 2.1 | Verify Azure CLI + `azure-devops` extension installed | n/a — exits if missing |
| 2.2 | `az login` if not already signed in | already signed in |
| 2.3 | Confirm `skintyeenation` org is reachable | re-prompts you to do step 1 |
| 2.4 | Create the `webfront` project | already exists |
| 2.5 | Create the `webfront` repo | already exists |
| 2.6 | Add `azure` remote to your local clone | already configured |
| 2.7 | Push every branch + tag via `git push azure --mirror` | remote already has commits |
| 2.8 | Set a branch policy on `master` (require PR, no force-push) | policy already exists |

End state: <https://dev.azure.com/skintyeenation/webfront/_git/webfront>
contains the same commit history as GitHub, with `master` protected.

### What if I want to do it manually?

The same steps via the ADO UI:

**2.4 — Create the project**
1. <https://dev.azure.com/skintyeenation> → **New project**.
2. **Name:** `webfront`. **Visibility:** Private. **Process:** Agile.
   **Version control:** Git. **Create**.

**2.5 — Create the repo**
The project comes with an empty default repo named `webfront`. If you
need a different name, use **Repos → … → New repository**.

**2.6-2.7 — Push history**
In your local clone:

```bash
git remote add azure https://dev.azure.com/skintyeenation/webfront/_git/webfront
git push azure --mirror     # seeds the empty repo with every branch + tag
```

(`--mirror` is one-shot. After this, normal `git push azure master`.)

**2.8 — Branch policy**
**Project Settings → Repositories → webfront → Policies → master →
Branch Policies**:
- **Require a minimum number of reviewers** → **1** (allow request
  authors to vote until the team grows).
- **Check for linked work items** → off (low-ceremony for now).
- **Check for comment resolution** → on.
- **Limit merge types** → squash + merge commit (no rebase, no
  fast-forward — we use the `--no-ff` convention).

## Step 3 — Verify it worked

```bash
git fetch azure
git log azure/master --oneline | head -5
# Should match your local master:
git log master --oneline | head -5
```

If the two outputs agree, the history is in place. From now on you
can `git push azure master` instead of (or in addition to)
`git push origin master`.

## Step 4 — Make `azure` the default remote (optional but recommended)

To complete the "Azure is canonical, GitHub is the mirror" intent:

```bash
git remote rename origin github
git remote rename azure  origin
git push -u origin master   # set origin/master as the upstream tracking branch
```

Now plain `git push` goes to Azure. The GitHub mirror push is set up
separately — see [`azure-primary-github-mirror.md`](./azure-primary-github-mirror.md).

## Step 5 — Grant access to staff

Azure DevOps inherits identity from Entra ID, so staff can sign in
with their `firstname.lastname@skintyee.ca` accounts immediately.
Access is controlled by **project membership** + Entra ID groups.

### One-time — create an Entra ID group

This is the same `1Password Users`-style pattern from
[`../1password/setup.md § Entra ID SSO`](../1password/setup.md#entra-id-sso).

1. <https://entra.microsoft.com> → **Groups → New group**.
2. **Type:** Security. **Name:** `skintyee-developers`. **Description:**
   "Staff who can read + contribute to the webfront repo."
3. Add the people who need ADO access.

### Connect the group to ADO

In ADO:
**Project Settings → Permissions → Contributors** group →
**Add → Search for `skintyee-developers`** → **Add**.

Anyone in the Entra group now has Contributor access (read + push to
non-policy-protected branches; PRs into `master`).

### Day-to-day onboarding/offboarding

| Action | Effect |
|---|---|
| Admin adds user to `skintyee-developers` in Entra ID | User can `git clone https://dev.azure.com/skintyeenation/webfront/_git/webfront` within 5 min |
| Admin removes user from `skintyee-developers` | Push/clone fails immediately |
| Admin disables the user's Entra ID account entirely | All M365 + Azure + ADO access cut off in one move |

Documented as part of the staff offboarding runbook in
[`../365/pricing.md § Offboarding`](../365/pricing.md#offboarding--deprovision-departed-staff-immediately).

## Adding a second repo

For a future project (e.g. a separate band-internal repo that should
not be public on GitHub):

```bash
ORG=skintyeenation \
PROJECT=webfront \
REPO=internal-finance \
bash scripts/setup-azure-devops.sh
```

The same script with a different `REPO=` creates an additional repo
inside the existing project. Step 1 (create org) is skipped; step
2.4 (create project) is skipped if `webfront` already exists; steps
2.5-2.8 run for the new repo.

For an entirely separate project (e.g. `band-app` with multiple repos
of its own), pass `PROJECT=band-app` instead — the script creates
the project on first run.

## Troubleshooting

**`az : command not found`**
- Install per the prerequisites section.

**Script says "can't reach $ORG_URL"** even after step 1
- Wait ~30 seconds. ADO org creation has a propagation delay before
  the API surface returns 200.
- Re-run the script.

**`git push azure --mirror` says "remote already has X branches"**
- The script handles this — it falls back to `git push azure master`.
  Means someone (or an earlier run) already seeded the repo.

**Branch policy `409 Conflict` on re-run**
- Expected — the script logs "approver-count policy already exists
  (skipped)" and moves on. ADO returns 409 if the policy is already
  in place; nothing to fix.

**Trouble signing in to ADO**
- Use the **M365 admin** account, not a personal Microsoft account.
  ADO will tie the org to whichever tenant the signing-in user
  belongs to.
- If you see "this account doesn't have access to any Azure DevOps
  organization", you signed in with a personal account by mistake.
  Sign out and re-sign-in with `firstname.lastname@skintyee.ca`.
