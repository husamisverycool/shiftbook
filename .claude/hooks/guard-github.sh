#!/usr/bin/env bash
# PreToolUse — mcp__github__*
# Merging, auto-merge, and writing straight to main/master are deploys in disguise
# (a hosting provider deploys main). The owner deploys.
source "$(dirname "$0")/lib.sh"

TOOL="$(jget .tool_name)"
case "$TOOL" in
  mcp__github__merge_pull_request | mcp__github__enable_pr_auto_merge)
    block "$TOOL would merge into the deployed branch. The owner merges and deploys."
    ;;
  mcp__github__push_files | mcp__github__create_or_update_file | mcp__github__delete_file)
    BRANCH="$(jget .tool_input.branch)"
    case "$BRANCH" in
      main | master | production | prod | "") block "$TOOL may only write to the feature branch (got '${BRANCH:-default branch}')." ;;
    esac
    ;;
esac

exit 0
