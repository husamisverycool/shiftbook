#!/usr/bin/env bash
# SessionStart — get a fresh cloud container ready: install dependencies and start the local
# database, once the project has been scaffolded. Does nothing before that.
source "$(dirname "$0")/lib.sh"
cd "$PROJECT_DIR" || exit 0
[ -f package.json ] || exit 0

if [ ! -d node_modules ]; then
  if [ -f pnpm-lock.yaml ]; then
    pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1
  else
    npm install >/dev/null 2>&1
  fi
fi
if [ -x scripts/dev-db.sh ]; then
  scripts/dev-db.sh start >/dev/null 2>&1 || echo "[Shiftbook] local database did not start; run scripts/dev-db.sh start"
fi
exit 0
