# Azure DevOps → GitHub mirror push

Goal: every push to `master` on Azure DevOps automatically mirrors to
GitHub (`github.com/skintyeenation/webfront`) within ~1 minute, with
no manual intervention. Azure remains the source of truth; GitHub is
a read-only backup + public-discoverability mirror.

> Set up [`azure-devops-setup.md`](./azure-devops-setup.md) first.
> This doc assumes the Azure repo exists and contains current
> `master`.

## What we're building

```
        ┌─────────────────────────────────┐
developer   git push origin master
        └─────────────────┬───────────────┘
                          ▼
        ┌─────────────────────────────────┐
        │  Azure DevOps                   │
        │  dev.azure.com/skintyeenation   │
        │  /devops/_git/webfront          │
        └─────────────────┬───────────────┘
                          │  Pipeline trigger
                          │  on push to master
                          ▼
        ┌─────────────────────────────────┐
        │  azure-pipelines/                │
        │   mirror-to-github.yml          │
        │                                 │
        │   git push github --mirror      │
        └─────────────────┬───────────────┘
                          ▼
        ┌─────────────────────────────────┐
        │  GitHub                          │
        │  github.com/skintyeenation       │
        │  /webfront                       │
        │  (read-only mirror)              │
        └─────────────────────────────────┘
```

## One-time setup

### 1. Generate a GitHub deploy key (write access, repo-scoped)

A **deploy key** is an SSH key bound to a single repo — strictly safer
than a Personal Access Token, which would grant access to all the user's
repos.

```bash
# Generate the key locally (ed25519, no passphrase — runs in CI)
ssh-keygen -t ed25519 -f /tmp/mirror-key -N '' -C 'ado-mirror@skintyee.ca'

# Show the public key — copy it into the GitHub deploy keys page
cat /tmp/mirror-key.pub
```

In GitHub:

1. <https://github.com/skintyeenation/webfront/settings/keys> →
   **Add deploy key**.
2. **Title:** `ado-mirror`. **Key:** paste the `.pub` value above.
   **Allow write access:** ✅ ON. **Add key**.

In ADO:

1. **Project Settings → Pipelines → Library → Secure files →
   + Secure file** → upload `/tmp/mirror-key` (the *private* key,
   not the .pub). Name it exactly `github-mirror-deploy-key`.
2. **Pipeline permissions** → **+** → grant access to the
   pipeline you'll create in step 3.

Wipe the local copy:

```bash
rm /tmp/mirror-key /tmp/mirror-key.pub
```

### 2. Add `github` as a known SSH host fingerprint

To avoid the pipeline failing on first-run host-key prompts, store
GitHub's known SSH fingerprints as a pipeline variable group:

1. <https://docs.github.com/en/authentication/keys-from-the-known-hosts-file-for-github>
   — copy the published fingerprints. (Or run
   `ssh-keyscan github.com` locally and use that output.)
2. ADO → **Library → Variable groups → + Variable group**:
   - **Name:** `mirror-github`
   - **Variables:**
     - `GITHUB_KNOWN_HOSTS` = paste the multiline fingerprints (mark
       as a secret only if it makes you happier — they're public).

### 3. Create the mirror pipeline

Add `azure-pipelines/mirror-to-github.yml` to the repo (this is what
you'll commit in the same change that adds the variable group):

```yaml
name: mirror-master-to-github

trigger:
  branches:
    include: [master]
  tags:
    include: ['*']
pr: none   # don't run for PRs — only the merged result mirrors

pool:
  vmImage: ubuntu-latest

variables:
  - group: mirror-github

jobs:
  - job: mirror
    displayName: Push to GitHub read-only mirror
    steps:
      - checkout: self
        persistCredentials: false
        fetchDepth: 0     # need all history for --mirror push
        clean: true

      - task: DownloadSecureFile@1
        name: deployKey
        inputs:
          secureFile: github-mirror-deploy-key

      - script: |
          set -euo pipefail
          mkdir -p ~/.ssh
          install -m 600 "$(deployKey.secureFilePath)" ~/.ssh/id_ed25519
          printf '%s\n' "$GITHUB_KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 644 ~/.ssh/known_hosts
        displayName: install SSH key

      - script: |
          set -euo pipefail
          git remote add github git@github.com:skintyeenation/webfront.git || \
            git remote set-url github git@github.com:skintyeenation/webfront.git
          # `--mirror` syncs every branch + tag and prunes anything not in
          # the source. That's what we want for a "GitHub follows Azure"
          # mirror — but it's destructive if someone has pushed directly to
          # GitHub. The deploy key + branch-protected GitHub configuration
          # in step 4 prevents that.
          git push --mirror github
        displayName: git push --mirror github
```

### 4. Lock down direct pushes to GitHub

Since GitHub is now read-only, prevent anyone from accidentally
pushing to it:

1. <https://github.com/skintyeenation/webfront/settings/branches> →
   **Add branch protection rule** for `master`:
   - **Restrict who can push to matching branches** → only allow
     the `ado-mirror` deploy key.
   - **Require linear history** off (the mirror pushes whatever
     Azure has).
   - **Allow force pushes** → "Specify who can force push" →
     `ado-mirror` only. (Force pushes are needed when a tag is
     deleted or history is rewritten on Azure; should be rare but
     must work.)

This means humans can't push to GitHub at all — they get a 403 from
the GitHub side. Only the ADO pipeline (using the deploy key) can.

## Verify

In your local clone:

```bash
git commit --allow-empty -m "test mirror sync"
git push origin master    # → goes to Azure
```

Within 60 seconds:

1. Watch the pipeline run in ADO → **Pipelines** →
   **mirror-master-to-github**.
2. Once green, check GitHub: the commit should appear on
   <https://github.com/skintyeenation/webfront/commits/master>.

`git push --mirror` is also called explicitly on tag pushes, so
release tags reach GitHub the same way without extra config.

## Day-to-day behaviour

- Push to Azure → mirror appears on GitHub in ~30-60 seconds.
- A pull request on Azure → no mirror activity until the PR merges
  to `master`; the merge commit then triggers the mirror.
- GitHub Releases / Issues / Wiki — none of these mirror back from
  GitHub to Azure. They live only on GitHub. Use ADO Boards for
  internal work tracking; GitHub Issues if you want external
  community contributions.

## Cost

- 1 ADO Pipeline run per push to master.
- Hosted-agent free tier on ADO is 1,800 minutes/month for private
  projects. The mirror job takes ~30 seconds, so 1,000 pushes/month
  would consume ~500 minutes. Realistically <100 pushes/month → cost
  is **$0**.
- No GitHub Actions minutes consumed (the GitHub side is just a
  receive endpoint).

## Troubleshooting

**Pipeline fails on `git push --mirror`**: most likely the deploy key
isn't recognised. Re-download `github-mirror-deploy-key` locally, run
`ssh -i /tmp/key -T git@github.com` — GitHub should reply "Hi
skintyeenation/webfront! You've successfully authenticated…". If it
says "permission denied", re-upload the key with **Allow write
access** on.

**GitHub branch protection blocks the mirror push**: confirm step 4's
"only allow `ado-mirror` to push" actually lists the deploy key, not
a username. Deploy keys appear in the dropdown under the title you
gave them (`ado-mirror`).

**Mirror runs but content is stale**: the pipeline triggers only on
`master` (+ tags). Pushes to other branches don't mirror until they
merge to master. That's intentional — GitHub mirror only reflects
released state, not in-progress work.

**Need to disable temporarily**: ADO → **Pipelines** →
**mirror-master-to-github** → **⋮** → **Disable pipeline**. Pushes
to Azure still succeed; GitHub just stops updating until you
re-enable.

## Removing the mirror

If you ever decide to drop the GitHub side:

1. Disable the pipeline (above).
2. Remove the deploy key from GitHub.
3. Delete the secure file from ADO.
4. Either archive `github.com/skintyeenation/webfront` (read-only
   permanent record) or transfer the repo back to be primary.
