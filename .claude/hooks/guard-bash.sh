#!/usr/bin/env bash
# PreToolUse — Bash
#  1. No SSNs outside 9xx, API keys, private keys or remote DB credentials in commands.
#  2. Nothing that touches production, --prod, a production database URL, or a deploy. The owner deploys.
#  3. No pushing to main/master.
#  4. .env files and secret environment variables are never printed.
#  5. No snapshot/golden "update" flags.
#  6. Protected paths (approved goldens, hooks, settings, hook state) are not written from the shell,
#     except restoring them from git; commits may not include unapproved changes to them.
source "$(dirname "$0")/lib.sh"

CMD="$(jget .tool_input.command)"
[ -z "$CMD" ] && exit 0
LC="$(printf '%s' "$CMD" | tr '[:upper:]' '[:lower:]')"
has() { printf '%s' "$1" | grep -Pq -- "$2"; }

# 1. secrets
SECRET="$(secret_problem "$CMD")"
[ -n "$SECRET" ] && block "this command contains $SECRET."

# 2. production and deploys
if has "$LC" '(--prod\b|--production\b|\bproduction\b|\bprod\b)'; then
  block "the command mentions production. Production and deploys belong to the owner."
fi
if has "$LC" '(neon\.tech|supabase\.co\b|supabase\.com|rds\.amazonaws\.com|\bprod(uction)?_database_url\b|\bdatabase_url_prod)'; then
  block "the command references a hosted (production) database. Only the local database may be used."
fi
DEPLOY='(\bvercel\b\s*($|[;&|)])|\bvercel\s+(deploy|--prod|promote|alias|redeploy|rollback|env|link|pull|domains|dns|secrets|login|git|project|teams|build)\b|\bnetlify\s+(deploy|link|env|login)\b|\bfly(ctl)?\s+(deploy|launch|secrets)\b|\brailway\s+(up|deploy|link)\b|\bheroku\b|\bwrangler\s+(deploy|publish|secret)\b|\bsupabase\s+(db\s+push|link|functions\s+deploy|secrets|login)\b|\bneonctl\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?deploy\b|\bkubectl\b|\bterraform\s+apply\b|\bserverless\s+deploy\b|\bsst\s+deploy\b|\bamplify\s+publish\b)'
if has "$LC" "$DEPLOY"; then
  block "the command deploys or links to a hosting provider. The owner deploys; I only prepare the code and the steps."
fi

# 3. pushing to main/master
if has "$LC" '\bgit\b[^;&|]*\bpush\b'; then
  if has "$LC" '\bpush\b[^;&|]*(\s|:|/)(main|master)(\s|$|[;&|])|\bpush\b[^;&|]*\s--(all|mirror)\b'; then
    block "pushing to main/master (or all branches) is not allowed. Push only the feature branch."
  fi
  BRANCH="$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  case "$BRANCH" in main | master) block "the current branch is $BRANCH. Push only the feature branch." ;; esac
fi

# 4. .env files and secret environment variables
if has "$CMD" '(^|[\s/"'"'"'=<(])\.env(\.(?!example\b|sample\b|template\b)[\w.-]+)?(?=$|[\s"'"'"';|&)<>])'; then
  if ! has "$CMD" '^\s*(ls|test\s+-[efs]|\[\s+-[efs])\s'; then
    block "the command touches a .env file, which holds secrets. Do not read or print it; write it only through the setup script."
  fi
fi
if has "$CMD" '(^|[;&|(]\s*)(printenv|env|export\s+-p|declare\s+-x|set)\s*($|[;&|)])|/proc/[^\s]*/environ|\$\{?[A-Za-z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASSWD|DATABASE_URL|CREDENTIAL)'; then
  block "the command could print secret environment variables."
fi

# 5. golden / snapshot update flags
if has "$CMD" '\b(vitest|test|test:[\w-]+)\b[^;&|]*(\s-u\b|\s--update\b|\s--update-snapshots?\b)|\bUPDATE_GOLDENS?\b'; then
  block "updating snapshots or goldens from the test runner is not allowed. Propose changes in tests/goldens/_proposed/."
fi

# 6. protected paths
PROTECTED='tests/goldens(/(?!_proposed\b)|(?=$|[\s"'"'"'*;|&)]))|\.claude/(hooks|state)\b|\.claude/settings(\.local)?\.json|settings\.local\.json'
if has "$CMD" "$PROTECTED"; then
  RESTORE='^\s*git\s+(checkout\s+(HEAD\s+)?--\s|restore\s(?!.*(--source|\s-s\b|--staged))|clean\s+-[a-z]*f[a-z]*\s)[^;&|><`$]*$'
  WRITES='(?<![0-9&])>(?!\s*&|\s*/dev/null)|\btee\b|\bsed\b[^;&|]*\s-[a-zA-Z]*i|\bperl\b[^;&|]*\s-[a-zA-Z]*i|\b(cp|mv|rm|rmdir|ln|chmod|chown|touch|truncate|dd|install|rsync|unzip|patch|mkdir|tar)\b|\bgit\s+(apply|am|checkout|restore|reset|stash|clean|mv|rm|merge|pull|rebase|cherry-pick|revert|switch)\b|\b(python3?|node|ruby|bun|deno|php|awk)\b'
  if ! has "$CMD" "$RESTORE" && has "$CMD" "$WRITES"; then
    if has "$CMD" '\.claude/state\b'; then
      block "the command writes guardrail state, which only hooks may write."
    fi
    if has "$CMD" '\.claude/(hooks)\b|\.claude/settings(\.local)?\.json|settings\.local\.json' && ! hooks_unlocked; then
      block "the command changes locked guardrail files. Ask the owner, in one sentence, to type 'unlock hooks' if a change is really needed."
    fi
    while IFS= read -r gp; do
      [ -z "$gp" ] && continue
      gp="${gp%/}"
      [ "$gp" = "tests/goldens" ] && gp="tests/goldens/*"
      is_golden_path "$gp" || continue
      golden_approved "$gp" && continue
      block "the command changes the approved golden $gp. Goldens are read-only; propose cases in tests/goldens/_proposed/ and ask the owner to type 'approve golden <name>'."
    done < <(printf '%s' "$CMD" | grep -Po 'tests/goldens[^\s"'"'"';|&)<>]*')
  fi
fi

# 6b. commits may not carry unapproved changes to goldens or locked guardrail files
if has "$LC" '\bgit\b[^;&|]*\bcommit\b'; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if is_golden_path "$f" && ! golden_approved "$f"; then
      block "the commit would include an unapproved change to golden $f. Restore it with: git checkout -- $f"
    fi
    if is_hook_config_path "$f" && ! hooks_unlocked; then
      block "the commit would include a change to locked guardrail file $f without the owner's 'unlock hooks'."
    fi
  done < <(git -C "$PROJECT_DIR" status --porcelain --untracked-files=all 2>/dev/null | cut -c4- | sed 's/.* -> //')
fi

exit 0
