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

### Swimlane Grouping and Titles

Sessions are grouped into swimlanes by `swimlaneKey`:
- With git: `repoUrl#branch` (merges multiple project dirs on the same repo+branch into one lane)
- Without git: `dirName` (the hashed project directory name)

Each project computes a `swimlaneTitle` markdown string rendered in the swimlane header. Resolution order:

1. `radarConfig.swimlane.title` from `.claude/radar.json` — supports `{branch}` placeholder
2. Auto-generated `[projectName/branch](swimlaneUrl)` if a git remote exists
3. Raw `projectPath` if no git

**Branch fallback for non-git dirs**: If a path has no `.git` (e.g. a worktree topic dir like `wip/ui-improvement`), the server looks for a `worktrees.json` in the parent directory and reads the `branch` field from the matching entry by folder name.

The frontend renders `swimlaneTitle` via `renderInlineLinks()` in `Swimlane.svelte` and `PipView.svelte` — HTML-escapes the string then converts `[text](url)` to `<a>` tags.

### Swimlane Sort Order

Applied server-side, then persisted client-side via `localStorage`:

1. **Time bucket** — Today (0) → This Week (1) → older weeks (2, 3, … most recent first)
2. **Named vs path** — named/github swimlanes before raw filesystem paths (`/…`) within each bucket
3. **Alphabetical** — by `projectName` within each group

The **reset sort button** (≡ icon in the header, board view only) clears `localStorage` order so the next poll restores the server default. Drag-and-drop reordering persists the custom order.

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
server.js              — Express server, session parsing, status detection, swimlane sorting
src/
  App.svelte           — Root component
  lib/
    components/
      Header.svelte    — Top bar, view toggle, reset sort button, PiP toggle
      Board.svelte     — Radar board (swimlanes × time columns)
      Swimlane.svelte  — Swimlane row; renders swimlaneTitle markdown as inline links
      Card.svelte      — Session card (inline expand, thread)
      CardThread.svelte— Recent messages + "view full session" link
      Panel.svelte     — Full session overlay panel
      Timeline.svelte  — Timeline view
      PipView.svelte   — Compact card list for PiP window; renders swimlaneTitle
    stores/
      sessions.svelte.js — Polling + session data ($state singleton)
      ui.svelte.js     — UI state: panel, collapse, view, sort order, PiP mainWindow ref
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

## radar.json Configuration

Place a `.claude/radar.json` file in a project directory to customise how it appears in the dashboard. Claude Code ignores this file; only the radar server reads it.

### Schema

```json
{
  "swimlane": {
    "name": "my-project",
    "title": "my-project/{branch} [repo](https://github.com/org/repo/tree/main)"
  }
}
```

| Field | Description |
|---|---|
| `name` | Display name for the project. Used in PiP labels and as `projectName`. Defaults to git repo basename or folder name. |
| `title` | Markdown string for the swimlane header. `{branch}` is replaced with the current git branch (or looked up from `worktrees.json` for non-git dirs). Supports `[text](url)` inline links. If absent, auto-generated from `name/branch`. |

### Multi-service systems (worktrees)

For systems with multiple service repos, `title` can link to all of them:

```json
{
  "swimlane": {
    "name": "my-platform",
    "title": "my-platform/{branch} [gitops](https://github.com/org/my-platform_gitops/tree/main) · [my-backend](https://github.com/org/my-platform_my-backend/tree/develop) · [my-frontend](https://github.com/org/my-platform_my-frontend/tree/develop)"
  }
}
```

Place the same `radar.json` in every directory within the system — the root, each service dir, and each worktree service dir. The `create.sh` worktree script copies it automatically. The source of truth is the system root's `.claude/radar.json`.
