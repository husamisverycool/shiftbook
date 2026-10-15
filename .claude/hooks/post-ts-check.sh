#!/usr/bin/env bash
# PostToolUse — Write | Edit | MultiEdit
# After any TypeScript edit: lint that file and typecheck the project. Failures go to Claude
# (exit 2 + stderr). Silent until the project has been scaffolded and dependencies installed.
source "$(dirname "$0")/lib.sh"

FILE="$(jget '.tool_input.file_path // .tool_input.notebook_path')"
[ -z "$FILE" ] && exit 0
REL="$(relpath "$FILE")"
case "$REL" in ../*) exit 0 ;; esac
case "$REL" in *.ts | *.tsx | *.mts | *.cts) ;; *) exit 0 ;; esac
cd "$PROJECT_DIR" || exit 0
[ -x node_modules/.bin/tsc ] || exit 0

REPORT=""
if [ -x node_modules/.bin/eslint ] && [ -f "$REL" ]; then
  if ! LINT="$(timeout 90 node_modules/.bin/eslint --max-warnings=0 --no-warn-ignored "$REL" 2>&1)"; then
    REPORT+=$'--- lint: '"$REL"$' ---\n'"$LINT"$'\n'
  fi
fi
mkdir -p node_modules/.cache
if ! TSC="$(timeout 150 node_modules/.bin/tsc --noEmit -p tsconfig.json --incremental --tsBuildInfoFile node_modules/.cache/hook-tsc.tsbuildinfo 2>&1)"; then
  REPORT+=$'--- typecheck (whole project) ---\n'"$TSC"$'\n'
fi

if [ -n "$REPORT" ]; then
  printf 'Lint/typecheck failed after editing %s. Fix these before moving on:\n%s\n' "$REL" "$(printf '%s' "$REPORT" | head -n 80)" >&2
  exit 2
fi
exit 0
