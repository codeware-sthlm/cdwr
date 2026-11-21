#!/bin/zsh
# The only upload an implement-only session may run: PUT a snapshot PNG from a ticket worktree's
# .showcase-images/ to the signed URL prepare_attachment_upload returned, with its signed headers
# verbatim. implement.sh allows this script and no raw curl, which could send any file anywhere.
#   linear-upload.sh <png> <signed url> [<header: value>...]
set -euo pipefail
setopt extended_glob

usage() { print -ru2 -- "usage: linear-upload.sh <png> <signed url> [<header: value>...]"; exit 2 }
(( $# >= 2 )) || usage

file="${1:A}"; url="$2"; shift 2
[[ "$file" == */codeware-cod-<->/.showcase-images/*.png && -f "$file" ]] \
  || { print -ru2 -- "linear-upload.sh: not a snapshot PNG in a ticket worktree: $file"; exit 2; }
# Linear signs uploads for Google Cloud Storage
[[ "$url" == https://storage.googleapis.com/* ]] \
  || { print -ru2 -- "linear-upload.sh: not a Linear signed upload url: $url"; exit 2; }

# `Name: value` only; curl reads a header argument starting with @ as a file
headers=()
for h in "$@"; do
  [[ "$h" == [A-Za-z0-9-]##:\ * ]] || { print -ru2 -- "linear-upload.sh: not a header: $h"; exit 2; }
  headers+=(-H "$h")
done
curl -fsS -X PUT --data-binary "@$file" "${headers[@]}" "$url"
