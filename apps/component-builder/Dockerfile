# syntax = docker/dockerfile:1

# Build from the repository root:
#   docker build -f apps/component-builder/Dockerfile .

ARG NODE_VERSION=22.22.2
FROM node:${NODE_VERSION}-slim AS base

RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends \
   build-essential \
   node-gyp \
   pkg-config \
   python-is-python3 \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.23.0

FROM base

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# A build compiles with typescript, esbuild and the tailwind engine, which
# the workspace keeps as devDependencies, so the full install stays. tsx runs
# the service's source directly; there is no separate build step
RUN pnpm install --frozen-lockfile \
  && pnpm store prune \
  && STORE_PATH="$(pnpm store path --silent)" \
  && rm -rf "$STORE_PATH"

# Everything the kit and the theme reach lives in libs/; what the
# .dockerignore leaves out is the rest of the repo
COPY . .

ENV NODE_ENV=production \
    PORT=3002

# Where tsx finds the tsconfig path aliases, and where builds look for the
# workspace (found by walking up from here)
WORKDIR /app/apps/component-builder

EXPOSE 3002
CMD [ "../../node_modules/.bin/tsx", "src/main.ts" ]
