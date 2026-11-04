# syntax = docker/dockerfile:1

# The Agent Desk as a static site, for the NUC to serve on the tailnet (apps/agent-host/compose.yaml,
# the `desk` service); .github/workflows/desk-image.yml builds it on main. Build from the
# repository root:
#   docker build -f apps/desk/Dockerfile --build-arg VITE_DESK_SHA=$(git rev-parse HEAD) .

ARG NODE_VERSION=22.22.2
# The output is static, so the build runs once, on the builder's own platform; only the nginx
# stage below is per target platform
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-slim AS build

RUN npm install -g pnpm@11.23.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# The workspace's one lockfile: the desk's build needs vite and the tauri api package, which
# are root dependencies, so the install is the root's. No postinstall scripts: nothing the
# desk builds with needs one, and the rest of the workspace's (sharp, node-pty) is not wanted
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

# What the desk shows as its own version (src/build-info.ts)
ARG VITE_DESK_SHA
ENV VITE_DESK_SHA=$VITE_DESK_SHA

# vite itself, not `nx build desk`: nx wants the whole workspace's project graph (its local
# plugins included), which the context leaves out on purpose
RUN node_modules/.bin/vite build --config apps/desk/vite.config.mts

FROM nginx:1.29-alpine

COPY apps/desk/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/apps/desk /usr/share/nginx/html

EXPOSE 80
