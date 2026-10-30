# syntax = docker/dockerfile:1

# Build from the repository root:
#   docker build -f apps/agent-host/Dockerfile .

FROM node:22.22.2-bookworm-slim@sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e

ARG TARGETARCH
ARG GH_VERSION=2.102.0
ARG INFISICAL_VERSION=0.44.2

# build-essential and python3 build node-pty when a ticket worktree installs
RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    jq \
    openssl \
    procps \
    python3 \
    zsh \
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

RUN npm install -g pnpm@11.23.0 @anthropic-ai/claude-code@2.1.302

# The base image's uid 1000 becomes the agent
RUN usermod -l agent -d /home/agent -m node \
  && groupmod -n agent node \
  && mkdir -p /work /pnpm-store /home/agent/.cdwr/agent-queue /home/agent/.claude \
  && chown -R agent:agent /work /pnpm-store /home/agent

COPY --chmod=755 tools/cdwr/agent-queue/run.sh \
  tools/cdwr/agent-queue/lib.sh \
  tools/cdwr/agent-queue/waits.sh \
  tools/cdwr/agent-queue/implement.sh \
  tools/cdwr/agent-queue/github-app.sh \
  tools/cdwr/agent-queue/notify.sh \
  tools/cdwr/agent-queue/checkin.sh \
  tools/cdwr/agent-queue/telemetry.sh \
  tools/cdwr/agent-queue/watch.jq \
  /opt/agent-queue/
COPY --chmod=755 apps/agent-host/secrets.sh apps/agent-host/entrypoint.sh apps/agent-host/git-credential-app.sh /opt/agent-host/

ENV AGENT_QUEUE_HOST=container \
    AGENT_QUEUE_HOME=/home/agent/.cdwr/agent-queue \
    AGENT_QUEUE_REPO=/work/codeware-agent \
    AGENT_QUEUE_LINEAR_KEY_FILE=/run/agent/linear.key \
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
