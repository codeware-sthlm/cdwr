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

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=${TARGETARCH} signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update -qq \
  && apt-get install -y --no-install-recommends gh=${GH_VERSION} \
  && rm -rf /var/lib/apt/lists/*

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
  tools/cdwr/agent-queue/watch.jq \
  /opt/agent-queue/
COPY --chmod=755 apps/agent-host/secrets.sh apps/agent-host/entrypoint.sh apps/agent-host/git-credential-app.sh /opt/agent-host/

ENV AGENT_QUEUE_HOST=container \
    AGENT_QUEUE_HOME=/home/agent/.cdwr/agent-queue \
    AGENT_QUEUE_REPO=/work/codeware-agent \
    RUN_INTERVAL_SECONDS=600 \
    pnpm_config_store_dir=/pnpm-store

USER agent
WORKDIR /work

ENTRYPOINT ["/opt/agent-host/secrets.sh"]
