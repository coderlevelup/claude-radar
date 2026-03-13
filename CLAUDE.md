# Claude Radar

A local web dashboard for monitoring Claude Code sessions.

## Stack

- **Backend**: Node.js + Express (no build step)
- **Frontend**: Svelte 5 + Vite (built to `public/`)
- **Service**: macOS launchd (see `SERVICE.md`)

## Architecture

The server reads session data from `~/.claude/projects/`, where Claude Code stores `.jsonl` conversation files and `sessions-index.json` indexes. The frontend polls `GET /api/sessions` every 5 seconds.

Sessions are grouped by project (swimlanes) and bucketed into time columns: Today, This Week, Older.

### Session State Detection

Each session has a `status` field (`working`, `waiting`, `idle`) determined by reading the tail ~8KB of the `.jsonl` file:

- **working** — file modified <30s ago AND last message indicates active tool use or streaming
- **waiting** — last assistant message has `stop_reason: end_turn` and file modified <1 hour ago
- **idle** — same as waiting but file is >1 hour old

### Picture-in-Picture Mode

Uses the Document Picture-in-Picture API (Chrome 116+) to open a compact floating window for monitoring active sessions while working in other apps.

- **Toggle**: PiP button in the header (only shown in supported browsers)
- **Content**: Shows working/waiting sessions + today's idle, grouped by project (`PipView.svelte`)
- **Shared state**: The PiP Svelte mount shares the same `$state()` singletons (`sessions.svelte.js`, `ui.svelte.js`) — no message passing needed
- **Auto-resize**: A `ResizeObserver` on `.pip-container` resizes the PiP window to fit content (120–800px)
- **View full session**: Clicking the link in PiP calls `ui.openPanel()` which also focuses the main window via `ui.mainWindow`
- **Lifecycle**: `Header.svelte` manages open/mount/close. Stylesheets are cloned into the PiP `<head>`. Cleanup runs on the `pagehide` event.

## File Structure

```
server.js              — Express server, session parsing, status detection
src/
  App.svelte           — Root component
  lib/
    components/
      Header.svelte    — Top bar, view toggle, PiP toggle
      Board.svelte     — Radar board (swimlanes × time columns)
      Card.svelte      — Session card (inline expand, thread)
      CardThread.svelte— Recent messages + "view full session" link
      Panel.svelte     — Full session overlay panel
      Timeline.svelte  — Timeline view
      PipView.svelte   — Compact card list for PiP window
    stores/
      sessions.svelte.js — Polling + session data ($state singleton)
      ui.svelte.js     — UI state: panel, collapse, view, PiP mainWindow ref
    utils/
      api.js           — Fetch helpers
      time.js          — Time bucketing (today/week/older)
  styles/
    global.css         — All styles (dark theme, PiP styles)
public/                — Vite build output (served by Express)
logs/                  — stdout/stderr from launchd
SERVICE.md             — Launchd service setup and management
```

## API Endpoints

- `GET /api/sessions` — All projects and sessions with metadata + status
- `GET /api/session/:dirName/:sessionId` — Full parsed conversation for one session
