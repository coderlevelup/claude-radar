# Claude Radar

A local dashboard for monitoring your Claude Code sessions in real time.

## Features

- **Board view** — sessions grouped by project (swimlanes) and time (Today / This Week / Older)
- **Timeline view** — horizontal bars on a time axis showing session activity over time
- **Picture-in-Picture** — compact floating window for monitoring active sessions (Chrome 116+)
- **Session panel** — full parsed conversation viewer with inline expand and thread preview
- **Live status** — working (green), waiting for input (yellow), idle (grey) via Claude Code hooks
- **Swimlane titles** — project headers render as markdown links; multi-service systems show links to each repo
- **Sort order** — swimlanes sorted by recency then alphabetically; reset button restores default order
- **Drag to reorder** — drag swimlanes to a custom order, persisted across sessions

## Prerequisites

- **Node.js** (v18+)
- **macOS** (uses launchd for the background service)
- **jq** (`brew install jq`) — used by the activity hooks

## Quick Start

```bash
git clone https://github.com/your-org/claude-radar.git
cd claude-radar
bash setup.sh
```

`setup.sh` handles everything:

1. Installs npm dependencies
2. Builds the frontend (`npm run build`)
3. Generates a launchd plist and starts the background service on port 6767
4. Patches `~/.claude/settings.json` with hooks so Claude Code reports session activity in real time

Open http://localhost:6767 in your browser.

## Usage

**Board** — the default view. Projects appear as horizontal swimlanes sorted by most recent activity. Sessions are cards in time columns (Today / This Week / Older). Each card shows a status dot. Click to expand the thread inline, or open the full session panel.

**Timeline** — toggle with the "Timeline" button. Shows sessions as horizontal bars on a weekly time axis, grouped by project.

**PiP** — click the PiP button in the header to open a floating mini-window showing active sessions. Works while you're in other apps. Chrome 116+ only.

**Reset sort** — click the ≡ button to clear any drag-reordering and restore the default sort (recency → named before path-only → alphabetical).

**Session panel** — click any session card to open a side panel with the full parsed conversation.

## Architecture

The server reads session data from `~/.claude/projects/`, where Claude Code stores `.jsonl` conversation files. The frontend polls the API every 5 seconds.

Session status is determined by two mechanisms:

1. **Hook-based** (preferred) — Claude Code hooks POST activity events to `/api/activity`
2. **File-based fallback** — heuristics based on file modification time and last message type

See [CLAUDE.md](CLAUDE.md) for detailed architecture and file structure.

## Configuration

### Swimlane titles (`radar.json`)

Add a `.claude/radar.json` file to a project directory to control how it appears in the dashboard:

```json
{
  "swimlane": {
    "name": "my-project",
    "title": "my-project/{branch} [GitHub](https://github.com/org/my-project/tree/main)"
  }
}
```

- `name` — display name (defaults to git repo basename or folder name)
- `title` — markdown string for the swimlane header. `{branch}` is replaced with the current git branch. Supports `[text](url)` inline links.

For multi-service systems, link to multiple repos from a single title:

```json
{
  "swimlane": {
    "name": "my-system",
    "title": "my-system/{branch} [api](https://github.com/org/my-system_api/tree/develop) · [web](https://github.com/org/my-system_web/tree/develop)"
  }
}
```

Place the same file in every service directory and worktree within the system.

### Port

Edit the `PORT` constant in `server.js`, then re-run `bash setup.sh`.

### Uninstalling

```bash
launchctl unload ~/Library/LaunchAgents/com.claude-radar.plist
rm ~/Library/LaunchAgents/com.claude-radar.plist
```

Then remove the hook entries from `~/.claude/settings.json`.

See [SERVICE.md](SERVICE.md) for more service management details.

## License

[MIT](LICENSE)
