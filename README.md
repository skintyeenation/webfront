# skintyee.ca migration

Tooling to scrape the existing Site123-hosted **skintyeefirstnation.org** and migrate it into a self-hosted WordPress install at **skintyee.ca**.

## Prerequisites

- Docker + Docker Compose
- Python 3.11+ (only needed for the crawler)

## Workflow

```bash
# 1. Scrape the source site (writes ./scraped/manifest.json + ./scraped/media/)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scraper/crawl.py

# 2. Start local WordPress
docker compose up -d

# 3. Import scraped content
./importer/import.sh
```

The local WP site lives at <http://localhost:8080>. Admin credentials: `admin` / `admin` (local dev only — rotate before any public deployment).

## Backup / restore

Before any destructive operation (wipe, theme swap, re-import) — take a snapshot:

```bash
./backup.sh
```

Writes a timestamped pair to `./backups/`:
- `db-<ts>.sql`           full MySQL dump (single-transaction)
- `wp-content-<ts>.tar.gz`  uploads + mu-plugins + themes + plugins

Old backups are pruned to the last 20 of each kind. `backups/` is gitignored.

Restore from a snapshot:

```bash
./restore.sh latest          # newest snapshot
./restore.sh 20260519-180532 # specific timestamp
```

This stops containers, wipes `wp-data` + `db-data`, brings the stack back up, pipes the SQL dump into MySQL, and extracts the tarball into `wp-data/`. Asks for confirmation before destroying anything.

## Exporting for production (skintyee.ca)

Once the local site looks right, export a WXR file you can import into the production WordPress at skintyee.ca:

```bash
./export.sh
```

Writes `exports/skintyee-export.xml`. Then on the target server:

1. Upload `wp-data/wp-content/uploads/` to the production server's matching directory.
2. In production WP admin: **Tools → Import → WordPress** (install the importer if prompted), then upload `exports/skintyee-export.xml`.
3. Run a search-replace on the imported content to swap `http://localhost:8080` for `https://skintyee.ca` (the "Better Search Replace" plugin handles this cleanly).

## Theming

The importer activates the **Astra** theme by default. Override with the `SKINTYEE_THEME` env var:

```bash
SKINTYEE_THEME=kadence ./importer/import.sh
```

The theme must be installable via `wp theme install` and should register a classic `primary` menu location for the imported nav to attach.

## Content split: pages vs posts

Most imported content lands as WordPress **pages** (hierarchical, no archive). Children of `/announcements/` and `/stay-informed/` are imported as **posts** with the parent slug as a category, so they get the date archive + category-archive listing treatment. Adjust `POST_PARENTS` in `importer/import.php` to change this.

## Layout

```
scraper/crawl.py        # Python crawler — builds scraped/manifest.json + scraped/media/
docker-compose.yml      # local WP + MySQL + WP-CLI
importer/import.sh      # entry point — installs WP and runs the PHP importer
importer/import.php     # PHP importer run inside the wpcli container
scraped/                # output of the crawler (gitignored)
wp-data/                # WordPress runtime files (gitignored)
db-data/                # MySQL data files (gitignored)
```

## Branches

See [`CLAUDE.md`](./CLAUDE.md). Short version: work on `feature/*`, merge into `develop` with `git merge --no-ff` using the message `Merge branch 'feature/<name>' into 'develop'`.
