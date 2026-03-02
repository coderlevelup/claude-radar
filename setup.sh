#!/bin/bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_LABEL="com.claude-kanban"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
SETTINGS_FILE="$HOME/.claude/settings.json"
PORT=6767

echo "=== Claude Kanban Setup ==="
echo "Repo: $REPO_DIR"
echo ""

# 1. Install dependencies
echo "Installing npm dependencies..."
cd "$REPO_DIR"
npm install
echo ""

# 2. Create logs directory
mkdir -p "$REPO_DIR/logs"

# 3. Generate and load launchd plist
NODE_PATH="$(which node)"
echo "Using node: $NODE_PATH"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${REPO_DIR}/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${REPO_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${REPO_DIR}/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${REPO_DIR}/logs/stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$(dirname "$NODE_PATH"):/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>${HOME}</string>
        <key>AWS_PROFILE</key>
        <string>${AWS_PROFILE:-default}</string>
        <key>AWS_REGION</key>
        <string>${AWS_REGION:-us-east-1}</string>
    </dict>
</dict>
</plist>
EOF

echo "Generated $PLIST_PATH"

# Unload existing service if present
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# Load the new plist
launchctl load "$PLIST_PATH"
echo "Service loaded."
echo ""

# 4. Patch ~/.claude/settings.json with hooks
HOOK_SCRIPT="$REPO_DIR/hooks/notify-activity.sh"
chmod +x "$HOOK_SCRIPT"

echo "Patching $SETTINGS_FILE with hooks..."

if [ ! -f "$SETTINGS_FILE" ]; then
    mkdir -p "$(dirname "$SETTINGS_FILE")"
    cat > "$SETTINGS_FILE" <<SETTINGSEOF
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${HOOK_SCRIPT} working",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${HOOK_SCRIPT} prompt",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${HOOK_SCRIPT} stop",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${HOOK_SCRIPT} stop",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "${HOOK_SCRIPT} idle",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
SETTINGSEOF
    echo "Created $SETTINGS_FILE with hooks."
else
    node -e "
const fs = require('fs');
const settingsPath = process.argv[1];
const hookScript = process.argv[2];

const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

const kanbanHooks = {
  PostToolUse: [
    {
      hooks: [
        {
          type: 'command',
          command: hookScript + ' working',
          async: true,
          timeout: 5
        }
      ]
    }
  ],
  UserPromptSubmit: [
    {
      hooks: [
        {
          type: 'command',
          command: hookScript + ' prompt',
          async: true,
          timeout: 5
        }
      ]
    }
  ],
  Stop: [
    {
      hooks: [
        {
          type: 'command',
          command: hookScript + ' stop',
          async: true,
          timeout: 5
        }
      ]
    }
  ],
  SubagentStop: [
    {
      hooks: [
        {
          type: 'command',
          command: hookScript + ' stop',
          async: true,
          timeout: 5
        }
      ]
    }
  ],
  Notification: [
    {
      matcher: 'idle_prompt',
      hooks: [
        {
          type: 'command',
          command: hookScript + ' idle',
          async: true,
          timeout: 5
        }
      ]
    }
  ]
};

if (!settings.hooks) {
  settings.hooks = {};
}

// Merge: overwrite the 4 kanban hook events, preserve any others
for (const [event, value] of Object.entries(kanbanHooks)) {
  settings.hooks[event] = value;
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
" "$SETTINGS_FILE" "$HOOK_SCRIPT"
    echo "Merged hooks into existing $SETTINGS_FILE."
fi
echo ""

# 5. Verify
echo "Verifying server..."
sleep 1

if curl -s "http://localhost:${PORT}/api/sessions" >/dev/null 2>&1; then
    echo "Server is running at http://localhost:${PORT}"
else
    echo "Server not responding yet. Check logs:"
    echo "  tail -f $REPO_DIR/logs/stderr.log"
fi

echo ""
echo "=== Setup complete ==="
echo "Open http://localhost:${PORT} in your browser."
