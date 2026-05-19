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

## Exporting for production (skintyee.ca)

Once the local site looks right, export a WXR file you can import into the production WordPress at skintyee.ca:

```bash
docker compose run --rm wpcli export --dir=/var/www/html/exports
```

The WXR file will appear in `wp-data/exports/`.

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
