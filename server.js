const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const app = express();
const PORT = 6767;
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// Cache parsed session files so we don't re-read unchanged files every poll
const fileCache = new Map(); // key: filePath, value: { mtime, data }

// Activity map — populated by hook-based POST /api/activity events.
// key: sessionId, value: { event, timestamp }
const activityMap = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Hook endpoint — receives activity events from Claude Code hooks
app.post('/api/activity', (req, res) => {
  const { sessionId, event } = req.body || {};
  if (!sessionId || !event) return res.status(400).json({ error: 'missing sessionId or event' });
  activityMap.set(sessionId, { event, timestamp: Date.now() });
  res.json({ ok: true });
});

// Determine session status. Uses hook-reported activity when available,
// falls back to file-tail heuristics for sessions without hook data.
function detectSessionStatus(sessionId, filePath, mtimeMs) {
  const now = Date.now();

  // Check hook-reported activity first
  const activity = activityMap.get(sessionId);
  if (activity) {
    const ageMs = now - activity.timestamp;

    if (activity.event === 'working' || activity.event === 'prompt') {
      // Hook says working/prompt — trust it if recent
      if (ageMs < 60000) return 'working';   // 60s grace for tool execution
      if (ageMs < 3600000) return 'waiting';  // stale working → waiting
      return 'idle';
    }
    if (activity.event === 'stop') {
      if (ageMs < 3600000) return 'waiting';
      return 'idle';
    }
    if (activity.event === 'idle') {
      return 'idle';
    }
  }

  // Fallback: file-based heuristic for sessions without hook data
  const fileAge = now - mtimeMs;

  let tail = '';
  try {
    const fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    const readSize = Math.min(8192, size);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, size - readSize);
    fs.closeSync(fd);
    tail = buf.toString('utf-8');
  } catch {
    return 'idle';
  }

  const lines = tail.split('\n').filter(l => l.trim());
  let lastMsg = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj.type === 'assistant' || obj.type === 'user') {
        lastMsg = obj;
        break;
      }
    } catch { /* partial line */ }
  }

  if (!lastMsg) return 'idle';

  if (fileAge < 30000) {
    if (lastMsg.type === 'assistant') {
      const stopReason = (lastMsg.message || {}).stop_reason || null;
      if (stopReason === null || stopReason === 'tool_use') return 'working';
    }
    if (lastMsg.type === 'user') {
      const content = lastMsg.message && lastMsg.message.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c && c.type === 'tool_result') return 'working';
        }
      }
      return 'working';
    }
  }

  if (fileAge < 3600000) return 'waiting';
  return 'idle';
}

// Read first user prompt and message count from a .jsonl session file.
// Uses cache to avoid re-reading unchanged files.
function parseSessionFile(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }

  const mtimeMs = stat.mtimeMs;
  const cached = fileCache.get(filePath);
  if (cached && cached.mtime === mtimeMs) return cached.data;

  let firstPrompt = '';
  let messageCount = 0;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      const type = obj.type || '';
      if (type === 'user' || type === 'assistant') messageCount++;
      if (type === 'user' && !firstPrompt) {
        const msg = obj.message;
        if (msg && typeof msg === 'object') {
          const content = msg.content;
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c && c.type === 'text' && c.text) {
                firstPrompt = c.text.slice(0, 200);
                break;
              }
            }
          } else if (typeof content === 'string') {
            firstPrompt = content.slice(0, 200);
          }
        }
      }
    }
  } catch {
    // Unreadable file
  }

  const data = { firstPrompt, messageCount };
  fileCache.set(filePath, { mtime: mtimeMs, data });
  return data;
}

app.get('/api/sessions', (req, res) => {
  const projects = [];

  let dirEntries;
  try {
    dirEntries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return res.json({ projects: [] });
  }

  for (const dirent of dirEntries) {
    if (!dirent.isDirectory()) continue;

    const projectDir = path.join(PROJECTS_DIR, dirent.name);

    // Read the index if it exists
    let indexData = { entries: [] };
    try {
      const raw = fs.readFileSync(path.join(projectDir, 'sessions-index.json'), 'utf-8');
      indexData = JSON.parse(raw);
    } catch {
      // No index — we'll still scan for .jsonl files
    }

    // Build a map of indexed sessions by ID
    const indexedById = new Map();
    for (const entry of (indexData.entries || [])) {
      indexedById.set(entry.sessionId, entry);
    }

    // Scan for all .jsonl session files in this project directory
    let files;
    try {
      files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    if (files.length === 0 && indexedById.size === 0) continue;

    const sessions = [];
    let projectPath = '';
    let mostRecent = 0;

    for (const file of files) {
      const sessionId = path.basename(file, '.jsonl');
      const filePath = path.join(projectDir, file);

      // Get actual file timestamps
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }

      const lastActivity = stat.mtimeMs;
      const fileCreated = stat.birthtimeMs || stat.ctimeMs;

      const indexed = indexedById.get(sessionId);

      let summary, firstPrompt, messageCount, gitBranch, created, isSidechain, status;

      if (indexed) {
        summary = indexed.summary || '';
        firstPrompt = indexed.firstPrompt || '';
        messageCount = indexed.messageCount || 0;
        gitBranch = indexed.gitBranch || '';
        created = indexed.created;
        isSidechain = indexed.isSidechain || false;
        status = detectSessionStatus(sessionId, filePath, lastActivity);
        if (!projectPath) projectPath = indexed.projectPath || '';
      } else {
        // Not in index — parse the file directly
        const parsed = parseSessionFile(filePath);
        firstPrompt = parsed ? parsed.firstPrompt : '';
        messageCount = parsed ? parsed.messageCount : 0;
        status = detectSessionStatus(sessionId, filePath, lastActivity);
        summary = ''; // no summary available
        gitBranch = '';
        created = new Date(fileCreated).toISOString();
        isSidechain = false;
      }

      if (lastActivity > mostRecent) mostRecent = lastActivity;

      sessions.push({
        sessionId,
        summary: summary || firstPrompt.slice(0, 80) || '(no summary)',
        firstPrompt: firstPrompt || '',
        messageCount,
        gitBranch,
        status,
        created: created || new Date(fileCreated).toISOString(),
        lastActivity, // actual file mtime in ms — used for column grouping
        modified: new Date(lastActivity).toISOString(),
        isSidechain,
      });
    }

    if (sessions.length === 0) continue;

    const projectName = projectPath ? path.basename(projectPath) : dirent.name;

    projects.push({
      dirName: dirent.name,
      projectName,
      projectPath,
      mostRecent,
      sessions,
    });
  }

  projects.sort((a, b) => b.mostRecent - a.mostRecent);

  const totalProjects = projects.length;
  const totalSessions = projects.reduce((sum, p) => sum + p.sessions.length, 0);

  res.json({ totalProjects, totalSessions, projects });
});

// Return parsed conversation for a single session
app.get('/api/session/:dirName/:sessionId', (req, res) => {
  const { dirName, sessionId } = req.params;
  const filePath = path.join(PROJECTS_DIR, dirName, sessionId + '.jsonl');

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return res.status(404).json({ error: 'Session not found' });
  }

  const messages = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    const type = obj.type;
    if (type !== 'user' && type !== 'assistant') continue;

    const msg = obj.message;
    if (!msg) continue;

    const role = msg.role || type;
    const content = msg.content;
    const parts = [];

    if (typeof content === 'string') {
      if (content) parts.push({ type: 'text', text: content });
    } else if (Array.isArray(content)) {
      for (const c of content) {
        if (!c || typeof c !== 'object') continue;
        if (c.type === 'text' && c.text) {
          parts.push({ type: 'text', text: c.text });
        } else if (c.type === 'tool_use') {
          parts.push({ type: 'tool_use', name: c.name || '', id: c.id || '' });
        } else if (c.type === 'tool_result') {
          // Extract text from tool results
          let resultText = '';
          if (typeof c.content === 'string') {
            resultText = c.content;
          } else if (Array.isArray(c.content)) {
            for (const r of c.content) {
              if (r && r.type === 'text' && r.text) resultText += r.text + '\n';
            }
          }
          if (resultText) {
            parts.push({ type: 'tool_result', name: c.tool_use_id || '', text: resultText.slice(0, 2000) });
          }
        }
        // Skip thinking blocks
      }
    }

    if (parts.length > 0) {
      messages.push({ role, parts });
    }
  }

  res.json({ messages });
});

app.listen(PORT, () => {
  console.log(`Claude Kanban → http://localhost:${PORT}`);
});
