# @skintyee/api — Skin Tyee API

The backend "API Server" from `SkinTyee.drawio.pdf` (→ Azure Cloud DB). This is
**contract-first**: [`openapi.yaml`](./openapi.yaml) is the source of truth and
the contract the app's `ApiService` is written against.

Right now this package ships:
- **`openapi.yaml`** — the proposed API contract (all app domains + admin CRUD).
- A **lightweight Express stub server** that serves Swagger UI and returns sample
  data, so the contract is browsable/runnable today while the real backend is built.

```bash
pnpm install
pnpm --filter @skintyee/api dev      # http://localhost:4000/docs (Swagger UI)
pnpm --filter @skintyee/api lint:openapi   # validate the spec
```

Endpoints (see the spec for full detail): `/directory`, `/events`, `/meetings`,
`/transparency/{expenditures,major-projects}`, `/financials`, `/timekeeping/*`,
`/polls` (+ `/vote`), `/notifications`, `/auth/me`.

---

## Recommended implementation (proposed)

> Decisive recommendation for the production API. See ADR-7 in
> [`../docs/architecture-decisions.md`](../docs/architecture-decisions.md).

| Concern | Recommendation | Why |
|---|---|---|
| **Language / framework** | **NestJS (TypeScript)** | Same language as the app; matches the ppt platform the team knows; first-class OpenAPI (`@nestjs/swagger`), DI, and **guards** for clean role-based auth. |
| **Auth** | **Microsoft Entra ID** (OIDC) via MSAL / `passport-azure-ad`; Nest **RolesGuard** maps Entra app roles/groups → `member`/`staff`/`admin` | Azure-native (ADR-1); role checks already specified per endpoint in the spec. |
| **Database** | **Azure Database for PostgreSQL – Flexible Server** with the **PostGIS** extension, via **Prisma** (migrations + typed client) | **PostGIS** gives first-class geospatial support for the diagram's **Land Allocation / GIS mapping** and the meeting/event map pins (lat/lng, spatial queries). Managed Postgres has auto backups + PITR (the NGO priority); SQL still aligns with the Ferrus/Adagio (Sage 300) data flows. (The WordPress site stays on MySQL — WordPress requires it.) |
| **Validation** | DTOs + `class-validator`, plus **request/response validation against `openapi.yaml`** in CI | Keeps code and contract in lock-step. |
| **GIS / mapping** | **PostGIS** geometry columns for parcels & pins; serve to the app as GeoJSON | Land allocation, GIS mapping, and map pins from the diagram. |
| **Financial data** | Integration service syncing **Ferrus ASAP Suite + Adagio / Sage 300** into the DB (read models for transparency/financials) | ADR-5. |
| **Notifications** | Persist + **push (Expo)**; optionally mirror to **skintyee.ca WordPress** by category | ADR-6. |
| **Packaging / hosting** | **Docker** image → **Azure Container Apps** (or App Service) behind `api.skintyee.ca`, Azure DNS + TLS | Matches the diagram and the website's Azure deployment. |
| **CI/CD** | **Azure DevOps** pipeline (build, test, `swagger-cli validate`, deploy) | Same org tooling as the website pipeline. |

**Contract-first workflow:** keep `openapi.yaml` authoritative. Generate the app's
typed client from it (e.g. `openapi-typescript`) to replace the hand-written
`ApiService` interface, and validate the NestJS implementation against it in CI.

**Migration path:** this Express stub stays as the mock/reference server for the
app and for front-end demos; the NestJS implementation grows alongside it and
takes over `api.skintyee.ca` in Phase 2 (see `../docs/roadmap.md`).

> POC note: the stub does not enforce auth/roles and returns in-memory sample
> data — see `../app/STUBS.md` for the full list of stubs.
