# syntax = docker/dockerfile:1

# Build from the repository root:
#   docker build -f apps/agent-host/Dockerfile .

FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

ARG TARGETARCH
ARG GH_VERSION=2.102.0
ARG INFISICAL_VERSION=0.44.2
ARG FLYCTL_VERSION=0.5.4
ARG JQ_VERSION=1.7.1
ARG PG_CLIENT_MAJOR=17

# build-essential and python3 build node-pty when a ticket worktree installs
RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    openssl \
    procps \
    python3 \
    sudo \
    zsh \
  && rm -rf /var/lib/apt/lists/*

# psql and pg_dump from PGDG, not bookworm's 15: pg_dump refuses a server of a newer major, and a
# newer pg_dump dumps an older server. The major is pinned; PGDG keeps only the newest minor of it.
RUN install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update -qq \
  && apt-get install -y --no-install-recommends "postgresql-client-${PG_CLIENT_MAJOR}" \
  && rm -rf /var/lib/apt/lists/*

# From the release, not GitHub's apt repo: that keeps only the latest gh, so a pin breaks on the next release
RUN curl -fsSL -o /tmp/gh.deb \
    "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${TARGETARCH}.deb" \
  && dpkg -i /tmp/gh.deb \
  && rm /tmp/gh.deb

RUN curl -fsSL -o /tmp/infisical.deb \
    "https://github.com/Infisical/cli/releases/download/v${INFISICAL_VERSION}/infisical_${INFISICAL_VERSION}_linux_${TARGETARCH}.deb" \
  && dpkg -i /tmp/infisical.deb \
  && rm /tmp/infisical.deb

# flyctl releases name the arch x86_64 or arm64, not the deb arch
RUN case "${TARGETARCH}" in amd64) fly_arch=x86_64 ;; *) fly_arch=arm64 ;; esac \
  && curl -fsSL "https://github.com/superfly/flyctl/releases/download/v${FLYCTL_VERSION}/flyctl_${FLYCTL_VERSION}_Linux_${fly_arch}.tar.gz" \
    | tar -xz -C /usr/local/bin flyctl \
  && ln -s flyctl /usr/local/bin/fly

# bookworm's jq 1.6 exits 0 on empty input under -e; the queue scripts' `jq -e` guards need it to fail
# The checksums are the release's sha256sum.txt for JQ_VERSION; a bump updates both
RUN case "${TARGETARCH}" in \
    amd64) jq_sha=5942c9b0934e510ee61eb3e30273f1b3fe2590df93933a93d7c58b81d19c8ff5 ;; \
    *) jq_sha=4dd2d8a0661df0b22f1bb9a1f9830f06b6f3b8f7d91211a1ef5d7c4f06a8b4a5 ;; \
  esac \
  && curl -fsSL -o /usr/local/bin/jq \
    "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-linux-${TARGETARCH}" \
  && echo "${jq_sha}  /usr/local/bin/jq" | sha256sum -c - \
  && chmod 0755 /usr/local/bin/jq

RUN npm install -g pnpm@11.23.0 @anthropic-ai/claude-code@2.1.302

# The base image's uid 1000 becomes the agent, the queue's user. The implement sessions run as
# session (uid 1001), and the queue group is what the two share: the sessions dir, the queue
# home's reads and /work. The session's claude home is group-writable, so the entrypoint can seed
# its memory. The two crossings between the users are the sudoers file below.
RUN usermod -l agent -d /home/agent -m node \
  && groupmod -n agent node \
  && groupadd --gid 1002 queue \
  && useradd --uid 1001 --user-group --create-home --home-dir /home/session --shell /bin/zsh session \
  && usermod -aG queue agent \
  && usermod -aG queue session \
  && mkdir -p /work /pnpm-store /home/agent/.cdwr/agent-queue /home/agent/.claude \
    /home/session/.claude /session-pnpm-store \
  && chown -R agent:agent /work /pnpm-store /home/agent \
  && chown -R session:queue /home/session /session-pnpm-store \
  && chmod 750 /home/session \
  && chmod 2770 /home/session/.claude

COPY --chmod=755 tools/cdwr/agent-queue/run.sh \
  tools/cdwr/agent-queue/lib.sh \
  tools/cdwr/agent-queue/waits.sh \
  tools/cdwr/agent-queue/implement.sh \
  tools/cdwr/agent-queue/github-app.sh \
  tools/cdwr/agent-queue/notify.sh \
  tools/cdwr/agent-queue/checkin.sh \
  tools/cdwr/agent-queue/telemetry.sh \
  tools/cdwr/agent-queue/deploy-gate.sh \
  tools/cdwr/agent-queue/watch.jq \
  tools/cdwr/agent-queue/guard.jq \
  tools/cdwr/agent-queue/linear-tools.txt \
  tools/cdwr/agent-queue/hold-paths.txt \
  /opt/agent-queue/
COPY --chmod=755 apps/agent-host/secrets.sh apps/agent-host/entrypoint.sh apps/agent-host/git-credential-app.sh \
  apps/agent-host/with-gh-token.sh \
  apps/agent-host/session-launch.sh apps/agent-host/session-stop.sh apps/agent-host/devlog-cms.sh \
  apps/agent-host/linear-mcp-proxy.mjs /opt/agent-host/
COPY --chmod=440 apps/agent-host/sudoers /etc/sudoers.d/agent-host
RUN visudo -cf /etc/sudoers.d/agent-host

ENV AGENT_QUEUE_HOST=container \
    AGENT_QUEUE_HOME=/home/agent/.cdwr/agent-queue \
    AGENT_QUEUE_REPO=/work/codeware-agent \
    AGENT_QUEUE_LINEAR_KEY_FILE=/run/agent/linear.key \
    AGENT_QUEUE_LINEAR_APP_FILE=/run/agent/linear-app.env \
    AGENT_QUEUE_LINEAR_TOKEN_FILE=/run/agent/linear.token \
    AGENT_QUEUE_VAULT_FILE=/run/agent/vault.env \
    AGENT_QUEUE_LINEAR_PROXY_PORT=8790 \
    RUN_INTERVAL_SECONDS=600 \
    RUN_FALLBACK_SECONDS=3600 \
    HOST_METRICS_INTERVAL_SECONDS=60 \
    pnpm_config_store_dir=/pnpm-store

USER agent
WORKDIR /work

# The commit the image was built from, which job_line reports as `image sha-<7>`; empty for a local
# build. Last, so a new commit busts no layer above it.
ARG AGENT_IMAGE_SHA=
ENV AGENT_IMAGE_SHA=$AGENT_IMAGE_SHA

ENTRYPOINT ["/opt/agent-host/secrets.sh"]
