#!/usr/bin/env bash
# PreToolUse hook: only a human deploys
CMD=$(bash "$(dirname "$0")/read-input.sh" command) || { echo "blocked: hook could not read its input" >&2; exit 2; }

if [[ "$CMD" =~ wrangler[[:space:]]+(deploy|delete|rollback|versions[[:space:]]+deploy) ]]; then
  echo "blocked: deploy is a human step. Print the command for the human to run." >&2
  exit 2
fi
exit 0
