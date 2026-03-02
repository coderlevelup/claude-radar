#!/bin/bash
# Called by Claude Code hooks — reads JSON from stdin, POSTs activity to kanban server.
# Usage: notify-activity.sh <event>
# Event is passed as $1 since hooks can't easily parameterize the stdin JSON.
EVENT="${1:-unknown}"

# Read first 1KB for session_id, then drain the rest to avoid broken pipe
# signals back to Claude Code (stdin can be megabytes for large tool outputs).
SESSION_ID=$({ head -c 1024; cat > /dev/null; } 2>/dev/null | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)

[ -z "$SESSION_ID" ] && exit 0
curl -s -X POST "http://localhost:6767/api/activity" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"${SESSION_ID}\",\"event\":\"${EVENT}\"}" \
  >/dev/null 2>&1 || true
