# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.0] - 2026-03-31

### Added
- **Swimlane slug** — stable, portable swimlane identity (`swimlane.slug` in `radar.json`); auto-generated from `projectName + branch` if absent; used for cross-radar session merging
- **Session push to Valkey** — `GET /api/sessions` debounce-pushes current session metadata to every configured push target (`radar:{swimlane}:sessions` HASH) at most once every 30 s
- **Global subscriptions** — `~/.claude/radar.json` can declare `subscriptions: [{ valkey: {url, password?}, swimlane }]`; server pulls remote sessions every 30 s and merges them into the board by slug
- Remote sessions are merged into matching local swimlane (same slug) or appear as a new remote-only swimlane row
- Staleness correction on remote sessions: `working` → `idle` after 60 s, `waiting` → `idle` after 1 h
- Slug field in swimlane config UI — shows auto-computed value, editable to override; saved alongside name

### Changed
- `POST /api/swimlane-config` now accepts a `slug` field (written to `radar.json swimlane.slug`)

---

## [0.8.0] - 2026-03-27

### Added
- **Per-swimlane Valkey configuration** — each project's `.claude/radar.json` can now specify its own `swimlane.valkey { url, password }` block; multiple swimlanes can connect to independent Valkey instances simultaneously
- **Swimlane config UI** — gear button (⚙) on every swimlane header opens an inline config panel to set the swimlane name and Valkey connection without editing config files manually
- **Valkey connection status dot** — green/dim indicator on the gear button shows live connection state
- `POST /api/swimlane-config` endpoint writes `radar.json` for all paths in a swimlane and returns connection status
- `projectPaths`, `valkeyConfigured`, `valkeyConnected`, `valkeyUrl` fields on project objects in `GET /api/sessions`

### Changed
- **Valkey is now opt-in per project** — removed the global `VALKEY_URL` environment variable; the server always starts without Valkey and each swimlane connects independently
- `lib/valkey.js` rewritten as a URL-keyed connection pool (`getClient` / `isReady`) replacing the global singleton
- `createPersistentCache` simplified — always writes to local JSON; Valkey sync handled at call sites via `syncToValkey()`
- Session log: `escAndFormat` extracted to `sanitize.js` (shared between Panel and CardThread) with added bold and italic markdown rendering
- Session log: tool_use parts now show their primary argument — `● Bash(command)`, `● Edit(file_path)`, etc.
- Session log: tool-result-only user turns no longer show the `> username` prompt header or orange background tint
- Session log: `⎿` replaced with `└` to match Claude Code terminal output exactly
- Session log: panel background changed to pure black (`#000`) to match Claude Code dark mode

### Removed
- `VALKEY_URL` key from launchd plist (`com.claude-radar.plist`)

---

## [0.7.0] - 2026-03-25

### Added
- **GitHub identity** — username resolved via `gh api user` at startup (falls back to `git config github.user`, `GITHUB_USERNAME` env, OS login); avatar URL taken from GitHub API (`avatars.githubusercontent.com`) to bypass SSO redirect issues
- **Tweet-style cards** — 36px circular avatar on the left column, `@username` + relative time in the header row, content and badges below
- **Valkey integration** (global, superseded by 0.8.0) — titles, blurbs, and activity cached in Redis-compatible Valkey when `VALKEY_URL` is set; falls back to local JSON files
- Avatar proxy endpoint (`/api/avatar/:username`) for hotlink-safe image loading
- `avatarUrl` and `username` fields on session objects
- Terminal focus button and resume hint hidden for sessions belonging to other users

### Changed
- Panel: hardcoded user label `'David'` replaced with `session.username`
- Session log redesigned as a terminal transcript — monospace font, `>` prompt for user turns, `⏺`/`⎿` for tool calls/results, no chat bubbles

---

## [0.6.0] - 2026-03-20

### Added
- **Swimlane grouping by git repo + branch** — sessions from multiple project directories on the same `repoUrl#branch` are merged into one swimlane
- **`radar.json` configuration** — place `.claude/radar.json` in a project to override swimlane `name`, `title` (supports `{branch}` placeholder and `[text](url)` links), and `url`; supports multi-service systems
- **Green radar theme** replacing the previous purple accent
- Swimlane title rendered as inline markdown links (`renderInlineLinks`)
- Sort order: Today → This Week → older weeks; named/GitHub swimlanes before raw paths; alphabetical within groups
- Reset sort button (≡) in header clears localStorage order
- Drag-and-drop swimlane reordering persisted in localStorage
- `worktrees.json` branch lookup for non-git topic directories

### Changed
- `swimlaneKey` is now `repoUrl#branch` for git repos (was `dirName`)
- `swimlaneTitle` is a server-computed markdown string (was plain project name)
- Time column labels and bucket logic refined

---

## [0.5.0] - 2026-03-15

### Added
- Project renamed from `claude-kanban` to `claude-radar`
- `resolveProjectPath` — walks the filesystem to convert hyphenated `dirName` back to a real path, used for the terminal resume hint `cd` command
- PiP: dynamic max-height, scrollable container, auto-resize via `ResizeObserver`
- PiP: `view full session` link focuses the main window

### Changed
- `launchd` service label updated to `com.claude-radar`

---

## [0.4.0] - 2026-03-10

### Added
- **Picture-in-Picture mode** using the Document PiP API (Chrome 116+) — compact floating window shows working/waiting sessions while you work in other apps
- PiP toggle button in header (only shown in supported browsers)
- `PipView.svelte` component with per-project grouping and dismiss controls
- Stylesheet cloning into PiP `<head>`; lifecycle cleanup on `pagehide`

---

## [0.3.0] - 2026-03-05

### Added
- **AI-generated session titles** via Claude Haiku (AWS Bedrock) — generated on `stop` activity events and at server startup for stale sessions
- **AI-generated blurbs** — tweet-length session summaries shown on cards
- Persistent title and blurb caches (`titles.json`, `blurbs.json`) with file-size-based staleness detection (regenerates after 10KB of new content)
- Inline card expand — click a card to show the recent message thread (`CardThread.svelte`)
- `GET /api/session/:dirName/:sessionId/recent` — lightweight tail endpoint for card previews
- Haiku refusal detection — discards meta-responses like "I don't have a coding session"
- `cleanTitle` — strips plan boilerplate, markdown headers, XML tags from titles
- `waiting` session status — detected when the last assistant message ends with a question mark or uses `AskUserQuestion` / `ExitPlanMode` tools

### Changed
- `Panel.svelte` — full session view with formatted messages, tool calls, and tool results

---

## [0.2.0] - 2026-02-28

### Changed
- **Frontend migrated to Svelte 5 + Vite** — replacing the previous vanilla JS frontend with a component-based build
- `sessions.svelte.js` and `ui.svelte.js` stores using Svelte 5 `$state` / `$derived` runes
- `Board.svelte`, `Swimlane.svelte`, `Column.svelte`, `Card.svelte`, `Panel.svelte`, `Timeline.svelte` components
- All styles consolidated into `src/styles/global.css`

---

## [0.1.0] - 2026-02-20

### Added
- Initial Claude Radar dashboard — Express server reading `~/.claude/projects/` session files
- Radar board with swimlanes × time columns (Today / This Week / Older)
- Session status detection: `working`, `waiting`, `idle` via file tail heuristics
- Hook-based activity monitoring (`POST /api/activity`) — Claude Code hooks post `working`, `stop`, `idle` events
- Timeline view
- Connection indicator, `Show older` toggle
- `setup.sh` for portable installation
- macOS `launchd` service (`SERVICE.md`)
- PAN masking (`maskPANs`) for payment card number redaction in session content
