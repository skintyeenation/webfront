# syntax=docker/dockerfile:1.7
#
# Skin Tyee API (NestJS) — Docker image for Azure Container Apps.
#
# Two-stage build:
#   1. `builder`  — pulls all deps (incl. typescript + types), compiles
#                   src/ to dist/.
#   2. `runtime`  — copies just dist/, openapi.yaml, and production-only
#                   node_modules into a slim node:22-alpine base.
#                   Runs as the non-root `node` user.
#
# Local build:
#     docker build -t skintyee-api .
#     docker run --rm -p 4000:4000 skintyee-api
#
# Production build is done by Azure Pipelines via `az acr build` —
# see azure-pipelines/Deployments/deploy-api.yml.

# ---------- builder ----------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests + install ALL deps (dev included — we need tsc).
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable pnpm && pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Copy source + the OpenAPI contract (read at runtime) + Prisma schema.
COPY tsconfig.json ./
COPY src ./src
COPY openapi.yaml ./
COPY prisma ./prisma

# Generate the Prisma client BEFORE compiling — tsc needs the generated
# types from @prisma/client at compile time. The generated client is
# emitted into node_modules/@prisma/client (engine binaries + types).
RUN npx prisma generate

# Compile TypeScript → dist/.
RUN npx tsc -p tsconfig.json

# Strip dev deps so the runtime stage only copies production node_modules.
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm prune --prod; \
    else \
      npm prune --omit=dev; \
    fi


# ---------- runtime ----------------------------------------------------------
FROM node:22-alpine AS runtime

# Add wget for the container's HEALTHCHECK (alpine doesn't ship it).
RUN apk add --no-cache wget

WORKDIR /app

# Run as the non-root `node` user that node:22-alpine ships pre-created.
USER node

# Copy compiled artefacts + runtime-required files.
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/openapi.yaml ./openapi.yaml
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/prisma ./prisma

ENV NODE_ENV=production \
    PORT=4000 \
    # Disable npm's update-check noise + telemetry.
    NPM_CONFIG_UPDATE_NOTIFIER=false

EXPOSE 4000

# Container Apps treats this as the readiness signal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/v1/health" >/dev/null 2>&1 || exit 1

CMD ["node", "dist/main.js"]
