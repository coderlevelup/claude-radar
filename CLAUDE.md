# Claude Kanban

A local web dashboard that displays Claude Code sessions as a kanban board.

## Stack

- **Backend**: Node.js + Express (no build step)
- **Frontend**: Vanilla JS, CSS — served as static files
- **Service**: macOS launchd (see `SERVICE.md`)

## Architecture

The server reads session data from `~/.claude/projects/`, where Claude Code stores `.jsonl` conversation files and `sessions-index.json` indexes. The frontend polls `GET /api/sessions` every 5 seconds.

Sessions are grouped by project (swimlanes) and bucketed into time columns: Today, This Week, Older.

### Session State Detection

Each session has a `status` field (`working`, `waiting`, `idle`) determined by reading the tail ~8KB of the `.jsonl` file:

- **working** — file modified <30s ago AND last message indicates active tool use or streaming
- **waiting** — last assistant message has `stop_reason: end_turn` and file modified <1 hour ago
- **idle** — same as waiting but file is >1 hour old

## File Structure

```
server.js          — Express server, session parsing, status detection
public/
  index.html       — Single-page shell
  app.js           — Frontend: polling, rendering, panel
  styles.css       — All styles (dark theme)
logs/              — stdout/stderr from launchd
SERVICE.md         — Launchd service setup and management
```

## API Endpoints

- `GET /api/sessions` — All projects and sessions with metadata + status
- `GET /api/session/:dirName/:sessionId` — Full parsed conversation for one session
