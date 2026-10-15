#!/usr/bin/env bash
# UserPromptSubmit — turns the owner's own typed words into one-turn unlocks.
#   "approve golden <name>[, <name> ...]"  → those golden cases may be written this turn
#   "approve all goldens"                   → every golden may be written this turn
#   "unlock hooks"                          → hooks/settings may be edited this turn
# Unlocks are cleared when the turn ends (stop-gate.sh). Only hooks write .claude/state.
source "$(dirname "$0")/lib.sh"

PROMPT="$(jget .prompt)"
rm -f "$STATE_DIR/stop-blocks"
NOTES=()

if [ -f "$STATE_DIR/last-turn-forced-stop" ]; then
  NOTES+=("WARNING: the previous turn ended while the guardrail checks were failing: $(cat "$STATE_DIR/last-turn-forced-stop"). Tell the owner this first, in plain words, and fix it before anything else.")
  rm -f "$STATE_DIR/last-turn-forced-stop"
fi

if printf '%s\n' "$PROMPT" | grep -Piq '^\s*approve\s+all\s+goldens?\s*[.!]?\s*$'; then
  echo '*' >>"$STATE_DIR/golden-approvals"
  NOTES+=("The owner approved ALL proposed golden cases for this turn only.")
else
  while IFS= read -r line; do
    names="$(printf '%s' "$line" | sed -E 's/^[[:space:]]*approve[[:space:]]+goldens?[[:space:]:]+//I')"
    for n in $(printf '%s' "$names" | tr ',;' '  '); do
      n="${n%.}"
      if [[ ${#n} -ge 3 && "$n" =~ ^[A-Za-z0-9._/-]+$ && "$n" != *..* ]]; then
        echo "$n" >>"$STATE_DIR/golden-approvals"
        NOTES+=("The owner approved the golden case '$n' for this turn only.")
      fi
    done
  done < <(printf '%s\n' "$PROMPT" | grep -Pi '^\s*approve\s+goldens?[\s:]+(?!all\b)\S')
fi

if printf '%s\n' "$PROMPT" | grep -Piq '^\s*unlock\s+hooks\s*[.!]?\s*$'; then
  touch "$STATE_DIR/hooks-unlocked"
  NOTES+=("The owner unlocked the hook scripts and .claude/settings.json for this turn only.")
fi

if [ ${#NOTES[@]} -gt 0 ]; then
  printf '[Shiftbook guardrails] %s\n' "${NOTES[@]}"
fi
exit 0
