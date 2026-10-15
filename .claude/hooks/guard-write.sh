#!/usr/bin/env bash
# PreToolUse — Write | Edit | MultiEdit | NotebookEdit
#  1. .claude/state is written only by hooks.
#  2. Hooks and settings are locked unless the owner typed "unlock hooks" this turn.
#  3. Approved goldens (tests/goldens/** except _proposed) need "approve golden <name>" this turn.
#  4. Page / layout / PDF / email files need a valid pattern file first.
#  5. No SSNs outside 9xx, API keys, private keys or remote DB credentials in written content.
source "$(dirname "$0")/lib.sh"

FILE="$(jget '.tool_input.file_path // .tool_input.notebook_path // .tool_input.path')"
[ -z "$FILE" ] && exit 0
REL="$(relpath "$FILE")"

if is_state_path "$REL"; then
  block "$REL is guardrail state written only by hooks."
fi

if is_hook_config_path "$REL" && ! hooks_unlocked; then
  block "$REL is a locked guardrail file. Ask the owner, in one sentence, to type 'unlock hooks' if a change is really needed."
fi

if is_golden_path "$REL" && ! golden_approved "$REL"; then
  block "$REL is an approved golden and is read-only. Put the proposed case in tests/goldens/_proposed/ and ask the owner to type 'approve golden <name>'."
fi

PATTERN="$(pattern_for "$REL")"
if [ -n "$PATTERN" ]; then
  PROBLEM="$(pattern_problems "$PATTERN")"
  if [ -n "$PROBLEM" ]; then
    block "$REL is a screen/document file and needs its pattern file first: $PROBLEM. Write the pattern file (reference product + screen, Source URL, Hierarchy, Interactions, 'Deviations allowed: none') before touching this file."
  fi
fi

CONTENT="$(printf '%s' "$HOOK_INPUT" | jq -r '
  [ .tool_input.content,
    .tool_input.new_string,
    ((.tool_input.edits // []) | map(.new_string) | .[]),
    .tool_input.new_source ]
  | map(select(. != null)) | join("\n")' 2>/dev/null)"
SECRET="$(secret_problem "$CONTENT")"
if [ -n "$SECRET" ]; then
  block "the content written to $REL contains $SECRET. Never put real SSNs, keys or credentials in files."
fi

exit 0
