#!/usr/bin/env bash
# ConfigChange — settings changes made during a session only apply when the owner typed
# "unlock hooks" this turn (or while the guardrails are first being set up).
source "$(dirname "$0")/lib.sh"

hooks_unlocked && exit 0
block "settings changed without the owner's 'unlock hooks'; the change was not applied."
