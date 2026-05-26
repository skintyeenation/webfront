# syntax=docker/dockerfile:1.7
#
# Skin Tyee lookup-api — Docker image for Azure Container Apps.
#
# Unlike api/ (NestJS with a tsc build step), lookup-api runs TypeScript
# directly via tsx — there's no compile output. So this is a simpler
# single-stage image. The extra complication: lookup-api uses
# puppeteer-core for some scrapers, which needs Chromium installed in
# the image (puppeteer-core deliberately omits the bundled binary).
#
# Local build:
#     docker build -t skintyee-lookup-api lookup/api
#     docker run --rm -p 5050:5050 -e ANTHROPIC_API_KEY=sk-… skintyee-lookup-api
#
# Production build is done by Azure Pipelines via `az acr build` —
# see azure-pipelines/Deployments/deploy-lookup.yml.

FROM node:22-alpine

# Chromium + the minimum runtime libs puppeteer-core needs. Installing
# from alpine packages (vs downloading manually) keeps the image
# reasonably small and gets security updates via `apk upgrade`.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      wget \
    && rm -rf /var/cache/apk/*

# Tell puppeteer-core where Chromium lives (and don't try to download
# its own copy — puppeteer-core never does, but this is defence in
# depth in case a transitive dep flips to plain puppeteer).
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production \
    PORT=5050 \
    HOST=0.0.0.0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# Manifests first → better layer cache when source changes but deps don't.
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable pnpm && pnpm install --frozen-lockfile --prod=false; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Source + the typescript config (tsx reads tsconfig for path aliases etc.)
COPY tsconfig.json ./
COPY src ./src

# Pre-create the data + out dirs so the non-root user can write to them
# without needing chmod at runtime. At POC scale these are ephemeral
# (re-fetched on container start). Phase 2 mounts an Azure Files volume.
RUN mkdir -p /app/data /app/out && chown -R node:node /app

USER node

EXPOSE 5050

# Container Apps treats this as the readiness signal. lookup-api's
# serve.ts exposes /health (200 on success — see src/serve.ts ~line 119).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || exit 1

CMD ["npm", "run", "serve"]
