# Access gates (pre-launch / band publicity policy)

Until the **Band Council Resolution (BCR)** approves public release, the site is
access-restricted. There are **two independent gates** — they protect different
hosts and work in different layers. Don't confuse them.

## 1. `skintyee.ca` — the public Next.js site (app-level gate)

- **What:** a full-page "preview / not yet public" block that replaces the whole
  site when the visitor isn't signed in. Shows the BCR notice, an **Entra sign-in**
  button, and a **request-demo-access** form (forwards to `it@skintyee.ca` + the
  Band Manager).
- **Where:** `web-prod` Container App. Code: `components/AccessGate.tsx` +
  `RequestAccessForm.tsx`, rendered from `app/layout.tsx` when gated.
- **Toggle:** `FEATURES.accessGate` in `lib/featureFlags.ts`, driven by the
  **runtime** env **`ACCESS_GATE`** (`on`/`off`). NOT `NEXT_PUBLIC_` — that gets
  inlined at build and can't be flipped on a running container. The gate decision
  is server-side (root layout), so a plain runtime env is correct.
  - Local preview: `ACCESS_GATE=on` in `website/web/.env.local`.
  - Prod: `az containerapp update -n web-prod -g skintyee-prod-rg --set-env-vars ACCESS_GATE=on`
- **Sign-in:** next-auth v5 (`auth.ts`) with the **Microsoft Entra** provider.
  web-prod env: `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID/_SECRET/_ISSUER`,
  `AUTH_URL=https://skintyee.ca`, `AUTH_TRUST_HOST=true`. App registration:
  **"Skin Tyee Website (skintyee.ca)"** (single-tenant), redirect URIs
  `https://skintyee.ca|www.skintyee.ca|localhost:3000` + `/api/auth/callback/microsoft-entra-id`.
- **Important:** only turn `ACCESS_GATE=on` once Entra sign-in works, or nobody
  (including admins) can get past it.

## 2. `cms.skintyee.ca` — WordPress (edge gate, Easy Auth)

- **What:** Azure Container Apps **built-in authentication (Easy Auth)** with the
  Entra provider in front of the whole WordPress container — `wp-admin`,
  `wp-login`, and the WP front-end require an Entra login (unauthenticated → 401 /
  browser redirect to the Entra login).
- **Critical exclusion:** `globalValidation.excludedPaths = ["/wp-json", "/wp-json/*"]`
  so the **headless REST API stays open** — `web-prod` reads content from
  `cms.skintyee.ca/wp-json`, and gating that would break News/Programs/etc. on the
  public site. (We learned this the hard way: the default Easy Auth setup gates
  `/wp-json` too and immediately broke the frontend.)
- **Where:** `cms-prod` Container App `authConfigs/current` (set via `az rest PUT`,
  api-version `2024-03-01`). App registration: **"Skin Tyee CMS gate
  (cms.skintyee.ca)"** (single-tenant), redirect `https://cms.skintyee.ca/.auth/login/aad/callback`,
  client secret stored as the container-app secret `microsoft-provider-authentication-secret`.
- **Toggle:** `az containerapp auth update -n cms-prod -g skintyee-prod-rg
  --unauthenticated-client-action AllowAnonymous` (off) /
  `RedirectToLoginPage` (on).

## Summary

| | Host | Layer | Toggle | Frontend impact |
|---|---|---|---|---|
| Gate 1 | `skintyee.ca` | Next.js app (layout) | `ACCESS_GATE` env on web-prod | n/a (this *is* the frontend) |
| Gate 2 | `cms.skintyee.ca` | Container Apps Easy Auth | `auth update` action on cms-prod | safe — `/wp-json` excluded |

Both use single-tenant Entra app registrations, so only `@skintyeenation`/M365
accounts can sign in.
