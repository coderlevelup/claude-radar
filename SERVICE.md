# Launchd Service Setup

## Quick Start

Run the setup script to automatically generate the plist and start the service:

```bash
bash setup.sh
```

This handles node path detection, plist generation, and service loading. The manual instructions below are for reference if you need to manage the service directly.

## Manual Setup

The radar dashboard runs as a macOS launchd service so it starts automatically on login.

## Plist Location

```
~/Library/LaunchAgents/com.claude-radar.plist
```

## Management Commands

```bash
# Load (start) the service
launchctl load ~/Library/LaunchAgents/com.claude-radar.plist

# Unload (stop) the service
launchctl unload ~/Library/LaunchAgents/com.claude-radar.plist

# Restart (unload + load)
launchctl unload ~/Library/LaunchAgents/com.claude-radar.plist && \
launchctl load ~/Library/LaunchAgents/com.claude-radar.plist

# Check if running
launchctl list | grep claude-radar
```

## Logs

```bash
# stdout
tail -f ~/clode/claude-radar/logs/stdout.log

# stderr
tail -f ~/clode/claude-radar/logs/stderr.log
```

## Troubleshooting

**Port 6767 already in use**
```bash
lsof -i :6767
# Kill the conflicting process, then restart the service
```

**Node not found**
The plist uses the node path detected at setup time. If your node location has changed, re-run `bash setup.sh` or manually update the `ProgramArguments` in the plist.

**Service won't start**
Check stderr log for errors. Ensure the `logs/` directory exists:
```bash
mkdir -p logs
```
