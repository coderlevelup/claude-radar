#!/bin/bash
# Called by Claude Code hooks — reads JSON from stdin, POSTs activity to kanban server.
# Usage: notify-activity.sh <event>
# Event is passed as $1 since hooks can't easily parameterize the stdin JSON.
EVENT="${1:-unknown}"
SESSION_ID=$(jq -r '.session_id // empty' 2>/dev/null)
[ -z "$SESSION_ID" ] && exit 0
curl -s -X POST "http://localhost:6767/api/activity" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"${SESSION_ID}\",\"event\":\"${EVENT}\"}" \
  >/dev/null 2>&1 || true
