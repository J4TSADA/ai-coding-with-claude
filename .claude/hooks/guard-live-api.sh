#!/usr/bin/env bash
# PreToolUse hook: never write to the live Flood Watch map (a real disaster map)
CMD=$(jq -r '.tool_input.command // empty')

if [[ "$CMD" == *flood-api.rooptanjai.com* ]] &&
   [[ "$CMD" =~ (-X|--request)[[:space:]]*(POST|PUT|PATCH|DELETE)|(^|[[:space:]])(-d|-F|--data[a-z-]*|--form|--json)([[:space:]=]|$) ]]; then
  echo "blocked: flood-api.rooptanjai.com is a live disaster map. Read-only GET only." >&2
  exit 2
fi
exit 0
