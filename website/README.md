# Skin Tyee — website (headless WordPress + Next.js)

The skintyee.ca web presence, rebuilt as a **headless** site:

- **`cms/`** + **`docker-compose.yml`** — a fresh **WordPress** (base block theme,
  Twenty Twenty-Five) used purely as a content API. Posts + Pages are authored in
  `wp-admin` and served as JSON over the built-in **REST API** (`/wp-json/wp/v2`).
- **`web/`** — the public site: **Next.js (App Router) + React + TypeScript**,
  statically generated from the WP REST API (good SEO, no WPGraphQL/extra plugins).
- **`scraper/`** — kept from the original migration: the Python crawler that rips
  content off the old Site123 site (`crawl.py` → `scraped/`).
- **`legacy/`** — the previous Elementor-based migration tooling, archived. The
  content entered into that build is preserved as a portable reference at
  [`legacy/reference/skintyee-elementor-export.xml`](legacy/reference/skintyee-elementor-export.xml)
  (a WordPress WXR export — 9 pages + header/footer templates). The old running
  install (gitignored `wp-data/` + `db-data/`) is left untouched.

> **Why headless + fresh WP:** the old pages were built with Elementor, whose
> markup needs Elementor's own CSS/JS to render and is useless as headless JSON.
> A clean base-theme WordPress yields clean Posts/Pages data for React.

## Quick start

```bash
# 1. Headless WordPress (CMS) — installs WP, base theme, sample content
./cms/bootstrap.sh
#    → admin http://localhost:8080/wp-admin (admin/admin)  ·  REST /wp-json/wp/v2

# 2. Frontend
cd web
cp .env.example .env          # WP_API_URL=http://localhost:8080
pnpm install                  # (or npm install)
pnpm dev                      # → http://localhost:3000
```

## Routes (web/)

| Route | Source | File |
|---|---|---|
| `/` | latest posts | `app/page.tsx` |
| `/posts/<slug>` | a single post | `app/posts/[slug]/page.tsx` |
| `/<slug>` | a WordPress page | `app/[slug]/page.tsx` |

All data goes through the typed REST client in [`web/lib/wp.ts`](web/lib/wp.ts);
pages use `generateStaticParams` (SSG) + `revalidate = 60` (ISR).

## Conventions

Branches: `feature/*` → `master` with `git merge --no-ff` (see top-level
`CLAUDE.md`). Default branch is `master`.

## Deferred

Production deploy (a new pipeline for the CMS + the Next.js build) and content
migration from the WXR/scraper into the fresh WP are follow-ups — the old
`legacy/azure-pipelines.yml` is kept as a reference for the WP-over-SSH bits.
