#!/usr/bin/env bash
# Tests for the Shiftbook guardrail hooks. Runs every hook against a throwaway git repo.
# Usage: bash .claude/hooks/tests/run.sh
# Secret-shaped test values are assembled at run time so none is ever stored in a file.
set -uo pipefail

HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export CLAUDE_PROJECT_DIR="$T"
git -C "$T" init -q -b claude/test-branch
git -C "$T" config user.email t@example.invalid
git -C "$T" config user.name test
git -C "$T" commit -q --allow-empty -m init

PASS=0 FAIL=0
run() { # hook json -> sets RC, ERR, OUT
  OUT="$(printf '%s' "$2" | bash "$HOOKS/$1" 2>"$T/.err")"
  RC=$?
  ERR="$(cat "$T/.err")"
}
expect() { # expected_rc description hook json
  run "$3" "$4"
  if [ "$RC" = "$1" ]; then
    PASS=$((PASS + 1)); printf 'ok   %s\n' "$2"
  else
    FAIL=$((FAIL + 1)); printf 'FAIL %s (expected exit %s, got %s) %s\n' "$2" "$1" "$RC" "$ERR"
  fi
}
write_json() { jq -n --arg f "$T/$1" --arg c "$2" '{tool_name:"Write",tool_input:{file_path:$f,content:$c}}'; }
edit_json() { jq -n --arg f "$T/$1" --arg c "$2" '{tool_name:"Edit",tool_input:{file_path:$f,old_string:"x",new_string:$c}}'; }
bash_json() { jq -n --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}'; }
mkpattern() { # path [omit]
  mkdir -p "$(dirname "$T/$1")"
  {
    echo "# Pattern"
    [ "${2:-}" = no-url ] || echo "Source URL: https://example.com/help/screen"
    if [ "${2:-}" != no-hierarchy ]; then printf '## Hierarchy\n1. Header\n'; fi
    echo "## Interactions"
    echo "- click"
    [ "${2:-}" = no-deviations ] || echo "Deviations allowed: none"
  } >"$T/$1"
}

# Secret-shaped values built at run time.
BAD_SSN="$((120 + 3))-$((40 + 5))-$((6000 + 789))"
BAD_SSN_SPACED="$((120 + 3)) $((40 + 5)) $((6000 + 789))"
OK_SSN="$((900 + 12))-$((30 + 4))-$((5000 + 678))"
FAKE_ANTHROPIC="sk-""ant-api03-$(printf 'Ab9%.0s' {1..15})"
FAKE_AWS="AKI""A$(printf 'Z%.0s' {1..16})"
FAKE_PRIVATE="-----BEGIN RSA PRIVATE"" KEY-----"
REMOTE_DB="postgres://app:hunter""2@ep-x.example-cloud.io/db"
LOCAL_DB="postgres://postgres:postgres@localhost:5432/shiftbook"

echo "== guard-write: pattern files =="
expect 2 "page without pattern file is blocked" guard-write.sh "$(write_json 'src/app/[locale]/(app)/convert/page.tsx' 'x')"
mkpattern docs/patterns/convert.md
expect 0 "page with valid pattern file is allowed" guard-write.sh "$(write_json 'src/app/[locale]/(app)/convert/page.tsx' 'x')"
expect 2 "dynamic route needs docs/patterns/invoices/[id].md" guard-write.sh "$(write_json 'src/app/[locale]/(app)/invoices/[id]/page.tsx' 'x')"
mkpattern 'docs/patterns/invoices/[id].md'
expect 0 "dynamic route allowed once its pattern exists" guard-write.sh "$(write_json 'src/app/[locale]/(app)/invoices/[id]/page.tsx' 'x')"
expect 2 "root page needs docs/patterns/home.md" guard-write.sh "$(write_json 'src/app/[locale]/page.tsx' 'x')"
expect 2 "loading.tsx is guarded like its page" guard-write.sh "$(write_json 'src/app/[locale]/(app)/review/loading.tsx' 'x')"
mkpattern docs/patterns/review.md no-url
expect 2 "pattern without Source URL is rejected" guard-write.sh "$(write_json 'src/app/[locale]/(app)/review/page.tsx' 'x')"
mkpattern docs/patterns/review.md no-hierarchy
expect 2 "pattern without Hierarchy section is rejected" guard-write.sh "$(write_json 'src/app/[locale]/(app)/review/page.tsx' 'x')"
mkpattern docs/patterns/review.md no-deviations
expect 2 "pattern without 'Deviations allowed: none' is rejected" guard-write.sh "$(write_json 'src/app/[locale]/(app)/review/page.tsx' 'x')"
expect 2 "group layout needs docs/patterns/_layouts/app.md" guard-write.sh "$(write_json 'src/app/[locale]/(app)/layout.tsx' 'x')"
mkpattern docs/patterns/_layouts/app.md
expect 0 "group layout allowed once its pattern exists" guard-write.sh "$(write_json 'src/app/[locale]/(app)/layout.tsx' 'x')"
expect 2 "root layout needs docs/patterns/_layouts/root.md" guard-write.sh "$(write_json 'src/app/[locale]/layout.tsx' 'x')"
expect 2 "PDF template needs docs/patterns/_documents/invoice.md" guard-write.sh "$(write_json 'src/pdf/templates/invoice.tsx' 'x')"
expect 0 "ordinary component file is not guarded" guard-write.sh "$(write_json 'src/components/ui/button.tsx' 'x')"
expect 0 "API route file is not guarded" guard-write.sh "$(write_json 'src/app/api/upload/route.ts' 'x')"

echo "== guard-write: secrets =="
expect 2 "SSN outside 9xx is blocked (Write)" guard-write.sh "$(write_json 'tests/fixture.json' "{\"ssn\":\"$BAD_SSN\"}")"
expect 2 "SSN outside 9xx is blocked (Edit)" guard-write.sh "$(edit_json 'src/x.ts' "const s = '$BAD_SSN'")"
expect 2 "space-separated SSN outside 9xx is blocked" guard-write.sh "$(write_json 'notes.txt' "ssn $BAD_SSN_SPACED")"
expect 0 "9xx test SSN is allowed" guard-write.sh "$(write_json 'tests/fixture.json' "{\"ssn\":\"$OK_SSN\"}")"
expect 0 "dates and phone numbers are not SSNs" guard-write.sh "$(write_json 'a.txt' 'on 2026-10-15 call 555-123-4567')"
expect 2 "Anthropic key is blocked" guard-write.sh "$(write_json 'src/x.ts' "const k = '$FAKE_ANTHROPIC'")"
expect 2 "AWS key is blocked" guard-write.sh "$(write_json 'src/x.ts' "$FAKE_AWS")"
expect 2 "private key is blocked" guard-write.sh "$(write_json 'key.txt' "$FAKE_PRIVATE")"
expect 2 "remote DB URL with password is blocked" guard-write.sh "$(write_json 'src/db.ts' "$REMOTE_DB")"
expect 0 "local DB URL is allowed" guard-write.sh "$(write_json 'src/db.ts' "$LOCAL_DB")"

echo "== guard-write: goldens and locked files =="
expect 2 "approved golden is read-only" guard-write.sh "$(write_json 'tests/goldens/rules/ca-seventh-day.json' '{}')"
expect 0 "proposed golden is writable" guard-write.sh "$(write_json 'tests/goldens/_proposed/rules/ca-seventh-day.json' '{}')"
expect 2 "hook state is never writable" guard-write.sh "$(write_json '.claude/state/hooks-unlocked' '')"
expect 0 "hooks editable while guardrails are being set up" guard-write.sh "$(write_json '.claude/hooks/x.sh' 'echo')"
mkdir -p "$T/.claude" && echo '{}' >"$T/.claude/settings.json" && git -C "$T" add .claude/settings.json && git -C "$T" commit -q -m settings
expect 2 "hooks locked once settings are committed" guard-write.sh "$(write_json '.claude/hooks/x.sh' 'echo')"
expect 2 "settings.json locked once committed" guard-write.sh "$(write_json '.claude/settings.json' '{}')"

echo "== prompt-approvals =="
expect 0 "owner phrase 'approve golden ca-seventh-day' is recorded" prompt-approvals.sh '{"prompt":"approve golden ca-seventh-day"}'
expect 0 "approved golden is now writable" guard-write.sh "$(write_json 'tests/goldens/rules/ca-seventh-day.json' '{}')"
expect 2 "a different golden is still read-only" guard-write.sh "$(write_json 'tests/goldens/rules/il-720.json' '{}')"
expect 0 "owner phrase 'unlock hooks' is recorded" prompt-approvals.sh '{"prompt":"unlock hooks"}'
expect 0 "hooks editable after unlock" guard-write.sh "$(write_json '.claude/hooks/x.sh' 'echo')"
expect 0 "a sentence merely containing the phrase does not unlock" prompt-approvals.sh '{"prompt":"please do not unlock hooks yet"}'
rm -f "$T/.claude/state/golden-approvals" "$T/.claude/state/hooks-unlocked"
expect 2 "unlocks are gone after the turn" guard-write.sh "$(write_json '.claude/hooks/x.sh' 'echo')"

echo "== guard-bash =="
expect 2 "vercel --prod is blocked" guard-bash.sh "$(bash_json 'npx vercel --prod')"
expect 2 "vercel deploy is blocked" guard-bash.sh "$(bash_json 'vercel deploy')"
expect 2 "bare vercel is blocked" guard-bash.sh "$(bash_json 'npx vercel')"
expect 2 "npm run deploy is blocked" guard-bash.sh "$(bash_json 'pnpm run deploy')"
expect 2 "the word production is blocked" guard-bash.sh "$(bash_json 'NODE_ENV=production pnpm start')"
expect 2 "hosted database host is blocked" guard-bash.sh "$(bash_json 'psql "host=ep-1.us-east-2.aws.neon.tech"')"
expect 2 "remote DB URL with password is blocked" guard-bash.sh "$(bash_json "psql '$REMOTE_DB'")"
expect 0 "installing a vercel-scoped package is allowed" guard-bash.sh "$(bash_json 'pnpm add @vercel/blob')"
expect 0 "pushing the feature branch is allowed" guard-bash.sh "$(bash_json 'git push -u origin claude/feature-x')"
expect 2 "pushing main is blocked" guard-bash.sh "$(bash_json 'git push origin main')"
expect 2 "pushing HEAD:main is blocked" guard-bash.sh "$(bash_json 'git push origin HEAD:main')"
git -C "$T" checkout -q -b main
expect 2 "a bare push while on main is blocked" guard-bash.sh "$(bash_json 'git push')"
git -C "$T" checkout -q claude/test-branch
expect 2 "reading .env.local is blocked" guard-bash.sh "$(bash_json 'cat .env.local')"
expect 2 "grepping .env is blocked" guard-bash.sh "$(bash_json 'grep KEY .env')"
expect 0 "reading .env.example is allowed" guard-bash.sh "$(bash_json 'cat .env.example')"
expect 0 "checking .env.local exists is allowed" guard-bash.sh "$(bash_json 'test -f .env.local && echo yes')"
expect 2 "printenv is blocked" guard-bash.sh "$(bash_json 'printenv')"
expect 2 "echoing a key variable is blocked" guard-bash.sh "$(bash_json 'echo $ANTHROPIC_API_KEY')"
expect 2 "SSN in a command is blocked" guard-bash.sh "$(bash_json "echo $BAD_SSN")"
expect 2 "vitest -u is blocked" guard-bash.sh "$(bash_json 'pnpm vitest run -u')"
expect 0 "running golden tests is allowed" guard-bash.sh "$(bash_json 'pnpm vitest run tests/goldens/rules')"
expect 0 "reading a golden is allowed" guard-bash.sh "$(bash_json 'cat tests/goldens/rules/a.json')"
expect 2 "deleting a golden is blocked" guard-bash.sh "$(bash_json 'rm tests/goldens/rules/a.json')"
expect 2 "deleting the goldens folder is blocked" guard-bash.sh "$(bash_json 'rm -rf tests/goldens')"
expect 2 "redirecting into a golden is blocked" guard-bash.sh "$(bash_json 'echo {} > tests/goldens/exports/gusto.csv')"
expect 2 "sed -i on a golden is blocked" guard-bash.sh "$(bash_json 'sed -i s/1/2/ tests/goldens/exports/gusto.csv')"
expect 0 "writing a proposed golden is allowed" guard-bash.sh "$(bash_json 'cp out.csv tests/goldens/_proposed/exports/gusto.csv')"
expect 2 "promoting an unapproved proposal is blocked" guard-bash.sh "$(bash_json 'git mv tests/goldens/_proposed/rules/il-720.json tests/goldens/rules/il-720.json')"
expect 0 "restoring a golden from git is allowed" guard-bash.sh "$(bash_json 'git checkout -- tests/goldens/rules/a.json')"
expect 0 "owner approves il-720" prompt-approvals.sh '{"prompt":"approve golden il-720"}'
expect 0 "promoting an approved proposal is allowed" guard-bash.sh "$(bash_json 'git mv tests/goldens/_proposed/rules/il-720.json tests/goldens/rules/il-720.json')"
rm -f "$T/.claude/state/golden-approvals"
expect 2 "writing a hook from the shell is blocked" guard-bash.sh "$(bash_json 'echo x > .claude/hooks/x.sh')"
expect 2 "writing hook state from the shell is blocked" guard-bash.sh "$(bash_json 'touch .claude/state/hooks-unlocked')"
mkdir -p "$T/tests/goldens/rules" && echo '{}' >"$T/tests/goldens/rules/a.json"
expect 2 "commit with an unapproved golden is blocked" guard-bash.sh "$(bash_json 'git add -A && git commit -m wip')"
rm -rf "$T/tests"

echo "== guard-read / guard-outbound / guard-github =="
expect 2 "Read .env.local is blocked" guard-read.sh "{\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"$T/.env.local\"}}"
expect 0 "Read .env.example is allowed" guard-read.sh "{\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"$T/.env.example\"}}"
expect 2 "SSN in a subagent prompt is blocked" guard-outbound.sh "$(jq -n --arg p "check $BAD_SSN" '{tool_name:"Agent",tool_input:{prompt:$p}}')"
expect 0 "clean subagent prompt is allowed" guard-outbound.sh '{"tool_name":"Agent","tool_input":{"prompt":"research Gusto CSV columns"}}'
expect 2 "merging a PR is blocked" guard-github.sh '{"tool_name":"mcp__github__merge_pull_request","tool_input":{"pullNumber":1}}'
expect 2 "writing files to main via GitHub is blocked" guard-github.sh '{"tool_name":"mcp__github__push_files","tool_input":{"branch":"main"}}'
expect 0 "writing files to the feature branch via GitHub is allowed" guard-github.sh '{"tool_name":"mcp__github__push_files","tool_input":{"branch":"claude/x"}}'

echo "== stop-gate =="
expect 0 "clean project may stop" stop-gate.sh '{"hook_event_name":"Stop","stop_hook_active":false}'
mkdir -p "$T/src/app/[locale]/(app)/orphan" && echo x >"$T/src/app/[locale]/(app)/orphan/page.tsx"
expect 2 "page created from the shell without a pattern blocks the stop" stop-gate.sh '{"hook_event_name":"Stop","stop_hook_active":false}'
for i in 2 3 4 5; do run stop-gate.sh '{"hook_event_name":"Stop","stop_hook_active":true}'; done
expect 0 "after 5 blocked stops the turn may end" stop-gate.sh '{"hook_event_name":"Stop","stop_hook_active":true}'
if printf '%s' "$OUT" | jq -e '.systemMessage | test("guardrail warning")' >/dev/null 2>&1; then
  PASS=$((PASS + 1)); echo "ok   ...and the owner sees a warning"
else
  FAIL=$((FAIL + 1)); echo "FAIL ...the owner should see a warning (got: $OUT)"
fi
run prompt-approvals.sh '{"prompt":"hello"}'
if printf '%s' "$OUT" | grep -q 'previous turn ended while the guardrail checks were failing'; then
  PASS=$((PASS + 1)); echo "ok   next turn starts with the warning for Claude to relay"
else
  FAIL=$((FAIL + 1)); echo "FAIL next turn should carry the warning (got: $OUT)"
fi
rm -rf "$T/src"
mkdir -p "$T/tests/goldens/rules" && echo '{}' >"$T/tests/goldens/rules/b.json"
expect 2 "unapproved golden change blocks the stop" stop-gate.sh '{"hook_event_name":"Stop","stop_hook_active":false}'
rm -rf "$T/tests"
echo '{"name":"x","scripts":{"test:goldens":"exit 1"}}' >"$T/package.json" && mkdir -p "$T/node_modules"
expect 2 "failing golden tests block the stop" stop-gate.sh '{"hook_event_name":"Stop","stop_hook_active":false}'
echo '{"name":"x","scripts":{"test:goldens":"exit 0"}}' >"$T/package.json"
expect 0 "passing golden tests allow the stop" stop-gate.sh '{"hook_event_name":"Stop","stop_hook_active":false}'
echo '{"name":"x","scripts":{}}' >"$T/package.json"
expect 2 "missing test:goldens script blocks the stop" stop-gate.sh '{"hook_event_name":"Stop","stop_hook_active":false}'
rm -rf "$T/package.json" "$T/node_modules" "$T/.claude/state/stop-blocks"

echo "== post-ts-check / config-change =="
expect 0 "lint/typecheck is silent before the project exists" post-ts-check.sh "$(write_json 'src/x.ts' 'x')"
expect 2 "settings change without unlock is rejected" config-change.sh '{"hook_event_name":"ConfigChange","source":"project_settings"}'
run prompt-approvals.sh '{"prompt":"unlock hooks"}'
expect 0 "settings change after unlock is accepted" config-change.sh '{"hook_event_name":"ConfigChange","source":"project_settings"}'

echo
echo "hook tests: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
