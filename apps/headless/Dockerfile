FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

RUN npm install -g pnpm@11.23.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
    libc6-dev \
    libvips-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile \
  && pnpm store prune \
  && STORE_PATH="$(pnpm store path --silent)" \
  && rm -rf "$STORE_PATH"

# Copy the dependencies to builder stage.
# Lock file is important for Nx to calculate a correct project graph.
FROM base AS builder

WORKDIR /app
COPY --from=deps /app/node_modules   ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY . .

# Build arguments for Sentry. DSN, project and release are per app and injected
# by the build action; org and auth token are shared across apps.
# Required by the Sentry vite plugin to upload source maps, and read by the
# client bundle (not persisted in final image)
ARG DEPLOY_ENV
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_RELEASE

ENV DEPLOY_ENV=$DEPLOY_ENV \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    SENTRY_RELEASE=$SENTRY_RELEASE \
    SENTRY_DSN=$SENTRY_DSN

ENV NX_NO_CLOUD=true
ENV NODE_OPTIONS=--max-old-space-size=4096

# The Sentry vite plugin skips source map upload entirely unless NODE_ENV is
# 'production'
RUN NODE_ENV=production npx nx build headless

# Production image. Nitro traces the server's dependencies into
# .output/server/node_modules, so nothing is installed here.
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

# Build metadata surfaced by the About UI (sha + build time are injected as
# build args on deploy).
ARG APP_SHA
ARG APP_BUILD_TIME
ENV APP_SHA=$APP_SHA \
    APP_BUILD_TIME=$APP_BUILD_TIME

COPY --from=builder --chown=node:node /app/apps/headless/.output ./.output

USER node

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", ".output/server/index.mjs"]
