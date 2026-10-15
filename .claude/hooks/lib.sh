#!/usr/bin/env bash
# Shared helpers for Shiftbook hooks. Sourced by the other scripts, never run directly.
# Exit code 2 = block (stderr goes to Claude). Exit 0 = allow.
set -uo pipefail

HOOK_INPUT="$(cat)"

jget() { printf '%s' "$HOOK_INPUT" | jq -r "$1 // empty" 2>/dev/null; }

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-}"
[ -z "$PROJECT_DIR" ] && PROJECT_DIR="$(jget .cwd)"
[ -z "$PROJECT_DIR" ] && PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATE_DIR="$PROJECT_DIR/.claude/state"
mkdir -p "$STATE_DIR" 2>/dev/null || true

block() {
  printf 'BLOCKED by a Shiftbook guardrail hook: %s\n' "$*" >&2
  exit 2
}

# Path relative to the project root ("../..." when outside it).
relpath() {
  realpath -m --relative-to="$PROJECT_DIR" "$1" 2>/dev/null || printf '%s' "$1"
}

# ---------- one-turn unlocks written by prompt-approvals.sh (owner's typed words) ----------

# Before .claude/settings.json is committed, hooks are still being set up and may be edited.
bootstrap_mode() { ! git -C "$PROJECT_DIR" cat-file -e HEAD:.claude/settings.json 2>/dev/null; }
hooks_unlocked() { [ -f "$STATE_DIR/hooks-unlocked" ] || bootstrap_mode; }

# 0 if the owner approved this golden path this turn ("approve golden <name>" / "approve all goldens").
golden_approved() {
  local p="/$1" f="$STATE_DIR/golden-approvals" name
  [ -f "$f" ] || return 1
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    [ "$name" = "*" ] && return 0
    case "$p" in
      */"$name" | */"$name"/* | */"$name".*) return 0 ;;
    esac
  done <"$f"
  return 1
}

# ---------- path classes ----------

is_golden_path() { # approved goldens: tests/goldens/** except tests/goldens/_proposed/**
  case "$1" in
    tests/goldens/_proposed | tests/goldens/_proposed/*) return 1 ;;
    tests/goldens | tests/goldens/*) return 0 ;;
  esac
  return 1
}

is_state_path() { case "$1" in .claude/state | .claude/state/*) return 0 ;; esac; return 1; }

is_hook_config_path() {
  case "$1" in
    .claude/hooks | .claude/hooks/* | .claude/settings.json | .claude/settings.local.json) return 0 ;;
    */.claude/settings.json | */.claude/settings.local.json) return 0 ;;
  esac
  return 1
}

# ---------- design rule: page / layout / PDF / email files need a pattern file ----------

# Prints the pattern file a UI file needs, or nothing if the file is not guarded.
pattern_for() {
  local p="$1" dir s out
  local -a parts segs=()
  local re_page='^(src/)?app/(.*/)?(page|loading|error|not-found|template|default)\.(tsx|ts|jsx|js|mdx)$'
  local re_layout='^(src/)?app/(.*/)?layout\.(tsx|ts|jsx|js)$'
  local re_pdf='^src/pdf/templates/(.+)\.(tsx|ts|jsx|js)$'
  local re_email='^src/emails/(.+)\.(tsx|ts|jsx|js)$'
  if [[ "$p" =~ $re_page ]]; then
    dir="${BASH_REMATCH[2]}"
    IFS='/' read -ra parts <<<"$dir"
    for s in "${parts[@]}"; do
      [[ -z "$s" || "$s" == "[locale]" || "$s" == @* ]] && continue
      [[ "$s" == \(*\) ]] && continue
      segs+=("$s")
    done
    out="$(IFS=/; printf '%s' "${segs[*]-}")"
    printf 'docs/patterns/%s.md' "${out:-home}"
  elif [[ "$p" =~ $re_layout ]]; then
    dir="${BASH_REMATCH[2]}"
    IFS='/' read -ra parts <<<"$dir"
    for s in "${parts[@]}"; do
      [[ -z "$s" || "$s" == "[locale]" || "$s" == @* ]] && continue
      s="${s//[\[\]\(\)]/}"
      segs+=("$s")
    done
    out="$(IFS=-; printf '%s' "${segs[*]-}")"
    printf 'docs/patterns/_layouts/%s.md' "${out:-root}"
  elif [[ "$p" =~ $re_pdf ]]; then
    printf 'docs/patterns/_documents/%s.md' "${BASH_REMATCH[1]//\//-}"
  elif [[ "$p" =~ $re_email ]]; then
    printf 'docs/patterns/_emails/%s.md' "${BASH_REMATCH[1]//\//-}"
  fi
}

# Prints what is wrong with a pattern file (relative path), or nothing if it is valid.
pattern_problems() {
  local rel="$1" f="$PROJECT_DIR/$1"
  if [ ! -f "$f" ]; then
    printf '%s does not exist' "$rel"
    return
  fi
  local -a missing=()
  grep -Pq '^[\s>*_-]*\**Source URL\**\s*:.*https?://' "$f" || missing+=("a 'Source URL:' line with an http(s) link")
  awk '
    /^#{1,6}[ \t]+Hierarchy([ \t]|$)/ { inh = 1; next }
    inh && /^#{1,6}[ \t]/ { exit }
    inh && NF > 0 { found = 1; exit }
    END { exit found ? 0 : 1 }
  ' "$f" || missing+=("a non-empty '## Hierarchy' section")
  grep -Piq 'Deviations allowed\**\s*:\**\s*none' "$f" || missing+=("the line 'Deviations allowed: none'")
  if [ ${#missing[@]} -gt 0 ]; then
    local IFS=';'
    printf '%s is missing: %s' "$rel" "${missing[*]}"
  fi
}

# ---------- secrets: SSNs outside 9xx, API keys, private keys, remote DB credentials ----------

# Prints a description of the first secret-like thing in $1 (never the value itself), or nothing.
secret_problem() {
  local t="$1"
  [ -z "$t" ] && return
  if printf '%s' "$t" | grep -Pq '(?<![0-9])[0-8][0-9]{2}([- ])[0-9]{2}\1[0-9]{4}(?![0-9])'; then
    printf 'an SSN-shaped number outside the 9xx test range (test SSNs must look like 9xx-xx-xxxx)'
    return
  fi
  if printf '%s' "$t" | grep -Piq '(ssn|social[ _-]?security)[^0-9]{0,20}(?<![0-9])[0-8][0-9]{8}(?![0-9])'; then
    printf 'an unformatted SSN outside the 9xx test range'
    return
  fi
  if printf '%s' "$t" | grep -Pq -- '-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY-----'; then
    printf 'a private key'
    return
  fi
  local keys='sk-ant-[A-Za-z0-9_-]{20,}|\bsk-(proj-)?[A-Za-z0-9_-]{32,}|\b(AKIA|ASIA)[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}|\bxox[abposr]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{35}|\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{20,}|\bnpm_[A-Za-z0-9]{36}\b|\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
  if printf '%s' "$t" | grep -Pq -- "$keys"; then
    printf 'an API key or access token'
    return
  fi
  if printf '%s' "$t" | grep -Piq -- '(api[_-]?key|secret|token|passw(or)?d)["'"'"']?\s*[:=]\s*["'"'"'](?=[A-Za-z0-9_/+=-]*[0-9])(?=[A-Za-z0-9_/+=-]*[A-Za-z])[A-Za-z0-9_/+=-]{32,}["'"'"']'; then
    printf 'a hard-coded secret value'
    return
  fi
  if printf '%s' "$t" | grep -Piq -- '(postgres(ql)?|mysql|mongodb(\+srv)?|redis)://[^:/\s@]+:[^@\s]+@(?!(localhost|127\.0\.0\.1|\[::1\]|db|postgres)([:/]|$))'; then
    printf 'a database URL with a password for a non-local server'
    return
  fi
}
