#!/usr/bin/env bash
# PreToolUse — Read
# .env files and private key files are never read into the conversation.
source "$(dirname "$0")/lib.sh"

FILE="$(jget .tool_input.file_path)"
[ -z "$FILE" ] && exit 0
BASE="$(basename "$FILE")"

case "$BASE" in
  .env.example | .env.sample | .env.template) exit 0 ;;
  .env | .env.*) block "$BASE holds secrets and is never read aloud. Use .env.example to see which variables exist." ;;
  *.pem | *.key | id_rsa* | id_ed25519*) block "$BASE looks like a private key file and is never read." ;;
esac

exit 0
