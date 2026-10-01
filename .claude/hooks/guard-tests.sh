#!/usr/bin/env bash
# PreToolUse hook: stop Claude from editing test files
FILE_PATH=$(bash "$(dirname "$0")/read-input.sh" file_path) || { echo "blocked: hook could not read its input" >&2; exit 2; }
FILE_PATH="${FILE_PATH//\\//}"   # Windows paths arrive with backslashes

case "$FILE_PATH" in
  *.test.* | *.spec.* | *_test.go | */tests/* | */__tests__/*)
    echo "blocked: tests are the spec. Ask the human to change them." >&2
    exit 2 ;;
esac
exit 0
