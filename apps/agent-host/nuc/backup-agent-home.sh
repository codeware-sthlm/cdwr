#!/bin/sh
# Nightly tarball of the agent-home volume; keeps the newest 14.
set -eu

VOLUME=cdwr-agent_agent-home
DEST=/var/backups/cdwr-agent
KEEP=14

mkdir -p "$DEST"
docker run --rm \
  -v "$VOLUME":/data:ro \
  -v "$DEST":/backup \
  alpine:3.20 \
  tar czf "/backup/agent-home-$(date +%F).tgz" -C /data .

# Names sort by date; drop all but the newest KEEP
ls -1 "$DEST"/agent-home-*.tgz | sort -r | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f -- "$old"
done
