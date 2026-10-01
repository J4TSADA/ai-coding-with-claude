#!/usr/bin/env bash
# Shared by the PreToolUse hooks. Prints tool_input.<field> from the hook JSON on stdin.
# Uses node, not jq: node is already needed for this repo, jq is often missing on Windows.
# Exits 1 if the input cannot be read, so callers can block instead of silently allowing.
node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try {
    const v = JSON.parse(s).tool_input?.[process.argv[1]]
    if (typeof v === "string") process.stdout.write(v)
  } catch {
    process.exit(1)
  }
})' "$1"
