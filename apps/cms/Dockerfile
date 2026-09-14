FROM node:24-bookworm-slim AS base

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

# Build arguments for Next.js client-side environment variables
# These are embedded in the JavaScript bundle during build
ARG NEXT_PUBLIC_DEPLOY_ENV

# Build arguments for Sentry. DSN, project and release are per app and injected
# by the build action; org and auth token are shared across apps.
# Required by the Sentry webpack plugin during build (not persisted in final image)
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_RELEASE

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Comment the following line in case you want to enable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

# Convert Sentry ARGs to ENV so the webpack plugin can upload source maps and the
# client bundle gets its DSN and release.
# These are only in the builder stage, not in the final deployed image
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    SENTRY_RELEASE=$SENTRY_RELEASE \
    NEXT_PUBLIC_SENTRY_DSN=$SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_RELEASE=$SENTRY_RELEASE

ENV NX_NO_CLOUD=true
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN npx nx build cms

# Compile migration script into the standalone output.
# Bundles payload and db adapter directly into migrate.mjs so it is self-contained.
# The Next.js standalone node_modules does not include payload (webpack bundles it
# into server.js), so --packages=external would fail at runtime with ERR_MODULE_NOT_FOUND.
# The minimal migrate.config.ts avoids importing sharp or any Next.js-specific packages.
RUN ./node_modules/.bin/esbuild apps/cms/src/migrate.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --banner:js="import { createRequire as _createRequire } from 'module'; const require = _createRequire(import.meta.url);" \
  --loader:.css=empty \
  --loader:.svg=empty \
  --loader:.png=empty \
  --loader:.jpg=empty \
  --loader:.jpeg=empty \
  --loader:.gif=empty \
  --loader:.woff=empty \
  --loader:.woff2=empty \
  --loader:.ttf=empty \
  --outfile=apps/cms/.next/standalone/apps/cms/migrate.mjs \
  --tsconfig=apps/cms/tsconfig.json

# Production image, copy all the files and run next
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
# Disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

# Build metadata surfaced by the About UI (version is inlined from package.json
# at build time; sha + build time are injected as build args on deploy).
ARG APP_SHA
ARG APP_BUILD_TIME
ENV APP_SHA=$APP_SHA \
    APP_BUILD_TIME=$APP_BUILD_TIME

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/apps/cms/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/cms/.next/static     ./apps/cms/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/cms/public           ./apps/cms/public

# Set the correct ownership
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000

ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/cms/server.js"]
