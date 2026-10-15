#!/usr/bin/env bash
# Local Postgres for development, demo and tests. Data lives in .pgdata/ (ignored by git).
# Usage: scripts/dev-db.sh start|stop|status|reset
#
# Roles:
#   shiftbook_owner — owns the schema, runs migrations and seeds (BYPASSRLS)
#   shiftbook_app   — what the app connects as; row-level security fences it to one agency
# Databases: shiftbook (dev + demo), shiftbook_test (integration tests, rebuilt per run)
# Local connections use trust auth on 127.0.0.1 only, so there are no passwords to manage.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGDATA="$ROOT/.pgdata/data"
SOCKDIR="$ROOT/.pgdata/run"
PORT="${SHIFTBOOK_PG_PORT:-54329}"

as_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

psql_super() { "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

init_cluster() {
  mkdir -p "$PGDATA" "$SOCKDIR"
  [ "$(id -u)" = "0" ] && chown -R postgres:postgres "$ROOT/.pgdata"
  as_pg "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
  cat >>"$PGDATA/postgresql.conf" <<CONF
listen_addresses = '127.0.0.1'
port = $PORT
unix_socket_directories = '$SOCKDIR'
fsync = off
synchronous_commit = off
full_page_writes = off
CONF
}

bootstrap_roles() {
  psql_super -d postgres <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shiftbook_owner') THEN
    CREATE ROLE shiftbook_owner LOGIN BYPASSRLS CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shiftbook_app') THEN
    CREATE ROLE shiftbook_app LOGIN NOBYPASSRLS;
  END IF;
END $$;
SQL
  for db in shiftbook shiftbook_test; do
    if [ -z "$(psql_super -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" ]; then
      psql_super -d postgres -c "CREATE DATABASE $db OWNER shiftbook_owner"
    fi
    psql_super -d "$db" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto"
  done
}

start() {
  [ -f "$PGDATA/PG_VERSION" ] || init_cluster
  if ! as_pg "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    as_pg "$PGBIN/pg_ctl" -D "$PGDATA" -l "$ROOT/.pgdata/server.log" -w start >/dev/null
  fi
  bootstrap_roles
  echo "postgres ready on 127.0.0.1:$PORT"
}

stop() {
  [ -f "$PGDATA/PG_VERSION" ] && as_pg "$PGBIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
  echo "postgres stopped"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) as_pg "$PGBIN/pg_ctl" -D "$PGDATA" status ;;
  reset) stop; rm -rf "$ROOT/.pgdata"; start ;;
  *) echo "usage: $0 start|stop|status|reset" >&2; exit 1 ;;
esac
