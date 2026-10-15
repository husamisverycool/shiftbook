#!/usr/bin/env bash
# Stop — Claude may not end its turn while any of these hold:
#  A. a page/layout/PDF/email file exists without a valid pattern file (catches shell-created files)
#  B. approved goldens have uncommitted changes the owner did not approve this turn
#  C. hook files/settings have uncommitted changes without the owner's "unlock hooks"
#  D. the rules or export golden tests fail (`test:goldens` script)
# Safety valve: after 5 blocked stops in a row the turn may end, but the owner is warned
# (systemMessage now, and again at the start of the next turn).
source "$(dirname "$0")/lib.sh"
cd "$PROJECT_DIR" || exit 0

PROBLEMS=()

# A. pattern files
while IFS= read -r f; do
  [ -z "$f" ] && continue
  pat="$(pattern_for "$f")"
  [ -z "$pat" ] && continue
  p="$(pattern_problems "$pat")"
  [ -n "$p" ] && PROBLEMS+=("$f has no valid pattern file: $p")
done < <(git ls-files -co --exclude-standard -- src/app app src/pdf/templates src/emails 2>/dev/null)

# B. goldens
while IFS= read -r f; do
  [ -z "$f" ] && continue
  is_golden_path "$f" || continue
  golden_approved "$f" && continue
  PROBLEMS+=("unapproved change to golden $f — restore it (git checkout -- $f, or git clean -f -- $f if new)")
done < <(git status --porcelain --untracked-files=all -- tests/goldens 2>/dev/null | cut -c4- | sed 's/.* -> //')

# C. hooks and settings
if ! hooks_unlocked; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    PROBLEMS+=("locked guardrail file $f changed without 'unlock hooks' — restore it with git checkout -- $f")
  done < <(git status --porcelain --untracked-files=all -- .claude/hooks .claude/settings.json 2>/dev/null | cut -c4- | sed 's/.* -> //')
fi

# D. golden tests (rules + exports)
if [ -f package.json ]; then
  PM=npm
  [ -f pnpm-lock.yaml ] && PM=pnpm
  if ! jq -e '.scripts["test:goldens"]' package.json >/dev/null 2>&1; then
    PROBLEMS+=("package.json has no \"test:goldens\" script (rules + export golden tests)")
  elif [ ! -d node_modules ]; then
    PROBLEMS+=("dependencies are not installed, so the golden tests cannot run — install them and run test:goldens")
  elif ! OUT="$(timeout 480 "$PM" run -s test:goldens 2>&1)"; then
    PROBLEMS+=("rules/export golden tests are FAILING:"$'\n'"$(printf '%s' "$OUT" | tail -n 60)")
  fi
fi

clear_turn_state() {
  rm -f "$STATE_DIR/golden-approvals" "$STATE_DIR/hooks-unlocked" "$STATE_DIR/stop-blocks"
}

if [ ${#PROBLEMS[@]} -eq 0 ]; then
  clear_turn_state
  exit 0
fi

COUNT=$(($(cat "$STATE_DIR/stop-blocks" 2>/dev/null || echo 0) + 1))
SUMMARY="$(printf '%s\n' "${PROBLEMS[@]}" | head -n 1 | cut -c1-200)"
if [ "$COUNT" -gt 5 ]; then
  clear_turn_state
  printf '%s\n' "$SUMMARY" >"$STATE_DIR/last-turn-forced-stop"
  jq -n --arg m "Shiftbook guardrail warning: Claude could not get the required checks passing after 5 attempts and stopped anyway. Problem: $SUMMARY" \
    '{systemMessage: $m}'
  exit 0
fi
echo "$COUNT" >"$STATE_DIR/stop-blocks"
{
  printf 'You cannot end the turn yet (attempt %s of 5). Fix these first:\n' "$COUNT"
  printf -- '- %s\n' "${PROBLEMS[@]}"
} >&2
exit 2
