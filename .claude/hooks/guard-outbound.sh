#!/usr/bin/env bash
# PreToolUse — Agent | Task | WebFetch | WebSearch | mcp__*
# Nothing SSN-shaped (outside 9xx), no API keys, private keys or DB credentials go into
# subagent prompts, web requests, or any connected service.
source "$(dirname "$0")/lib.sh"

TOOL="$(jget .tool_name)"
PAYLOAD="$(printf '%s' "$HOOK_INPUT" | jq -c '.tool_input // {}' 2>/dev/null)"
SECRET="$(secret_problem "$PAYLOAD")"
[ -n "$SECRET" ] && block "the input to $TOOL contains $SECRET. Never send SSNs, keys or credentials out."

exit 0
