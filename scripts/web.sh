#!/usr/bin/env bash
# This worktree's website, for Shawn to try a change on the web before it
# merges (docs/web-testing.md). It runs on the worktree's Portless origin,
# https://<worktree>.www.freemail.local, on this Mac.
#
#   scripts/web.sh up       start the proxy and the website, print the link
#   scripts/web.sh link     print the link again
#   scripts/web.sh status   whether it's running, and which backend it uses
#   scripts/web.sh down     stop the website
#
# The local website never shows Shawn's real mail: production only trusts
# mail.rodgers.dev. It uses this worktree's isolated backend
# (scripts/backend.sh isolate) when there is one, otherwise the shared
# development deployment, both with fake mail and a test owner that the
# login page's "Sign in as test owner" button signs in as.
#
# Only the website runs (`pnpm -F @freemail/web dev`), never `pnpm dev` or
# `pnpm dev:web`, which also run `convex dev` and push this branch's
# functions to the development deployment every worktree shares.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
STATE_DIR="$ROOT/.cache/web"
PID_FILE="$STATE_DIR/web.pid"
LOG="$STATE_DIR/web.log"
mkdir -p "$STATE_DIR"

origin() {
  echo "https://$("$ROOT/scripts/portless-app-name.sh" www.freemail).local"
}

running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

backend() {
  local state
  state="$("$ROOT/scripts/backend.sh" status 2>/dev/null || true)"
  if [[ "$state" == isolated* ]]; then
    echo "this worktree's isolated backend: fake mail, with this branch's Convex functions"
  else
    echo "the shared development backend: fake mail, with main's Convex functions"
  fi
}

link() {
  echo "---- send Shawn this as it is ----"
  echo "- [Open this worktree's website]($(origin))"
  echo
  echo "On this Mac. Sign in with **Sign in as test owner**; it shows $(backend)."
  echo "---- end ----"
}

up() {
  (cd "$ROOT" && pnpm exec portless proxy start --lan >/dev/null 2>&1) || true
  if ! running; then
    (
      cd "$ROOT"
      node - "$LOG" >"$PID_FILE" <<'JS'
const { spawn } = require("node:child_process");
const { openSync, closeSync } = require("node:fs");
const [log] = process.argv.slice(2);
const output = openSync(log, "w");
const child = spawn("pnpm", ["-F", "@freemail/web", "dev"], {
  detached: true,
  stdio: ["ignore", output, output],
});
child.unref();
closeSync(output);
console.log(child.pid);
JS
    )
  fi
  for _ in $(seq 1 90); do
    if curl -fsSk -o /dev/null "$(origin)/login" 2>/dev/null; then
      link
      return
    fi
    sleep 1
  done
  echo "the website didn't start; see $LOG" >&2
  exit 1
}

down() {
  if running; then
    local pid
    pid="$(cat "$PID_FILE")"
    pkill -TERM -g "$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "website stopped"
}

status() {
  if running; then
    echo "website: $(origin) (running)"
  else
    echo "website: not running"
  fi
  echo "backend: $(backend)"
}

case "${1:-status}" in
  up) up ;;
  link) link ;;
  status) status ;;
  down) down ;;
  *)
    echo "usage: scripts/web.sh up|link|status|down" >&2
    exit 1
    ;;
esac
