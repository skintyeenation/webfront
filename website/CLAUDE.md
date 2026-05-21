# Skintyee website — project instructions

## Branches

- **`master`** — long-lived default branch (not `main`).
- **`develop`** — integration branch for ongoing work.
- **`feature/<name>`** — short-lived branches for individual pieces of work.

All work is done on `feature/*` branches and merged into `develop` (never committed directly to `develop` or `master`).

## Merge commit format

When merging a feature branch into `develop`, **always** use a non-fast-forward merge with this exact message format:

```
Merge branch 'feature/my-branch' into 'develop'

<commit message describing the change>
```

The first line is the literal merge subject. The blank line and following lines are the description of what the feature actually does. Use `git merge --no-ff` to guarantee a merge commit is created even when fast-forward would be possible.

Example:

```bash
git checkout develop
git merge --no-ff feature/initial-scaffold -m "Merge branch 'feature/initial-scaffold' into 'develop'" -m "Add site crawler, Docker WordPress stack, and WP-CLI importer for the skintyeefirstnation.org -> skintyee.ca migration."
```

## Domains

- Source site (to migrate from): `skintyeefirstnation.org` (Site123)
- Target site (to migrate to): `skintyee.ca` (self-hosted WordPress)
