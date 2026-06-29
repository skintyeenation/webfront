# syntax=docker/dockerfile:1
#
# Next.js frontend (website/web) built INSIDE the pnpm monorepo so the workspace
# packages (@skintyee/api-client, @skintyee/models) resolve.
#
#   BUILD CONTEXT = repo ROOT:
#     docker build -f website/web/Dockerfile -t skintyee-web .
#
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /repo

# Workspace manifests for every member — required so --frozen-lockfile validates
# the lockfile (even though we only install the web app's subtree).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY app/package.json ./app/
COPY api/package.json ./api/
COPY lookup/api/package.json ./lookup/api/
COPY lookup/app/package.json ./lookup/app/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/models/package.json ./packages/models/
COPY website/web/package.json ./website/web/

RUN pnpm install --frozen-lockfile --filter @skintyee/website-web...

# Sources the web build needs (shared packages + the app).
COPY packages ./packages
COPY website/web ./website/web

RUN pnpm --filter @skintyee/website-web build

# --- runner: the self-contained standalone server -------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone output mirrors the monorepo layout (outputFileTracingRoot = root).
COPY --from=builder /repo/website/web/.next/standalone ./
COPY --from=builder /repo/website/web/.next/static ./website/web/.next/static
COPY --from=builder /repo/website/web/public ./website/web/public

# The ISR/prerender cache must be writable by the runtime user — otherwise every
# `revalidate` page (e.g. /posts/[slug]) 500s with EACCES on .next/cache mkdir.
RUN mkdir -p website/web/.next/cache && chown -R nextjs:nodejs website/web/.next

USER nextjs
EXPOSE 3000
CMD ["node", "website/web/server.js"]
