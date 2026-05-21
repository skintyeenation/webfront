# WordPress site — runbook (local dev)

The skintyee.ca site is a Dockerized WordPress stack in [`website/`](../website).
This is how to run it, recover it, and re-shoot the walkthrough.

## Start it

```bash
pnpm website:up        # = website/recover.sh — brings the stack up AND self-heals
# site:  http://localhost:8080
# admin: http://localhost:8080/wp-admin   (admin / admin — local dev only)
```

Containers (`website/docker-compose.yml`): `db` (MySQL 8, data in `./db-data`),
`wordpress` (docroot bind-mounted to `./wp-data`), `wpcli` (WP-CLI).

## ⚠️ Why the site sometimes "breaks" — and the fix

`wp-data/` and `db-data/` are **gitignored bind mounts** (runtime data, not in
git). If `wp-data/` is emptied — a stray `rm -rf`, `docker compose down -v`, or
a tool clearing the dir — the site goes **403 / blank / install screen**, because
WordPress core, the **Astra theme**, **Elementor**, the custom **mu-plugins**, and
all **uploads (logo + images)** live there.

**Recover with one command:**

```bash
./website/recover.sh      # idempotent
```

It: brings the stack up (WP core re-copies into empty `wp-data`); if the DB has
no tables, **restores the latest `./backups` snapshot**; restores the custom
**mu-plugins** from `wp-plugins/` (version-controlled); **re-places media** from
`scraped/media/` into `wp-content/uploads/<YYYY/MM>/` (filenames are content-
addressed `<sha1>.<ext>`, so they match the DB's attachment paths); **regenerates
all thumbnail sizes** (`wp media regenerate` — posts/leadership cards reference
generated sizes, not just originals); fixes ownership; flushes Elementor CSS.

If there's **no backup and no scraped media**, do a full rebuild from source:

```bash
cd website
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python scraper/crawl.py          # re-fetch pages + media from skintyeefirstnation.org
./importer/import.sh             # re-import content, media, logo, theme, mu-plugins
```

> Caveat: the `wpcli` container can fall back to the wrong DB if its env doesn't
> resolve — if `wp` reports "not installed" while the site works, the DB is fine
> but wp-cli isn't connected; recover.sh works around it by restoring + using the
> `db` container directly.

## Back up / restore

```bash
./website/backup.sh                  # -> backups/db-<ts>.sql + wp-content-<ts>.tar.gz
./website/restore.sh latest          # or a specific <ts>
./website/wipe.sh                    # DESTROY + rebuild — snapshots first (safe)
```

`backup.sh` runs automatically before `import.sh` and `wipe.sh`. **Take a backup
after any meaningful change** — backups are the only thing that brings uploads
back without a re-scrape. (Backups stay on disk; they're gitignored.)

## Re-shoot the visual walkthrough

Full-page screenshots of every page → [`media/website/`](media/website), embedded
in [`website-walkthrough.md`](website-walkthrough.md). Posts (news/announcement
articles) are excluded. Uses puppeteer-core driving the installed Chrome:

```bash
# 1. list published pages -> /tmp/pages.json (slug + url)
docker compose -f website/docker-compose.yml run --rm wpcli \
  post list --post_type=page --post_status=publish --fields=url --format=csv \
  | tail -n +2 | sort -u | python3 docs/scripts/mklist.py
# 2. capture full-page PNGs
node docs/scripts/shoot.mjs
```

(Both helper scripts are in [`scripts/`](scripts).)
