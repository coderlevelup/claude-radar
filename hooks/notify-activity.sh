#!/bin/bash
# Called by Claude Code hooks — reads JSON from stdin, POSTs activity to kanban server.
# Usage: notify-activity.sh <event>
# Event is passed as $1 since hooks can't easily parameterize the stdin JSON.
EVENT="${1:-unknown}"

# Read only the first 1KB of stdin — session_id is near the top and we don't need
# the full tool output (which can be megabytes). Avoids jq parsing huge payloads.
HEAD=$(head -c 1024 2>/dev/null)
SESSION_ID=$(echo "$HEAD" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)

[ -z "$SESSION_ID" ] && exit 0
curl -s -X POST "http://localhost:6767/api/activity" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"${SESSION_ID}\",\"event\":\"${EVENT}\"}" \
  >/dev/null 2>&1 || true
