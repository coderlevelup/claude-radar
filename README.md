# Claude Kanban

A local web dashboard that displays your Claude Code sessions as a kanban board. Sessions are grouped by project (swimlanes) and bucketed into time columns (Today, This Week, Older). A timeline view shows session activity over time. Live status indicators show whether each session is actively working, waiting for input, or idle.

## Prerequisites

- **Node.js** (v18+)
- **macOS** (uses launchd for the background service)
- **jq** (`brew install jq`) -- used by the activity hooks

## Quick Start

```bash
git clone <repo-url> claude-kanban
cd claude-kanban
bash setup.sh
```

`setup.sh` does the following:

1. Runs `npm install`
2. Creates the `logs/` directory
3. Generates a launchd plist and starts the background service on port 6767
4. Patches `~/.claude/settings.json` with hooks so Claude Code reports session activity in real time

After setup, open http://localhost:6767 in your browser.

## Usage

**Board view** -- the default. Projects appear as horizontal swimlanes. Sessions are cards sorted into Today / This Week / Older columns. Each card shows a status dot:

- Green (pulsing) = working
- Yellow = waiting for input
- Grey = idle

**Timeline view** -- toggle with the "Timeline" button. Shows sessions as horizontal bars on a time axis, grouped by project.

**Show Older** -- by default only Today and This Week are shown. Click "Show Older" to reveal older sessions.

**Session panel** -- click any session card to open a side panel with the full parsed conversation.

## Manual Configuration

### Changing the port

Edit the `PORT` constant in `server.js`, then regenerate the plist:

```bash
bash setup.sh
```

Or manually update `~/Library/LaunchAgents/com.claude-kanban.plist` and restart the service (see [SERVICE.md](SERVICE.md)).

### Uninstalling

```bash
# Stop and remove the service
launchctl unload ~/Library/LaunchAgents/com.claude-kanban.plist
rm ~/Library/LaunchAgents/com.claude-kanban.plist

# Remove hooks from ~/.claude/settings.json
# Delete the "hooks" key (or just the 4 kanban events: PostToolUse, UserPromptSubmit, Stop, Notification)
```

## Architecture

The server reads session data from `~/.claude/projects/`, where Claude Code stores `.jsonl` conversation files and `sessions-index.json` indexes. The frontend polls `GET /api/sessions` every 5 seconds.

Session status is determined by two mechanisms:

1. **Hook-based** (preferred) -- Claude Code hooks POST activity events (`working`, `prompt`, `stop`, `idle`) to `/api/activity`. The server uses these to determine status in real time.
2. **File-based fallback** -- for sessions without hook data, the server reads the tail of the `.jsonl` file and applies heuristics based on file age and the last message type.

See [SERVICE.md](SERVICE.md) for launchd service management details.
