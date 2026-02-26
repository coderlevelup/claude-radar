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

// System artifacts injected by Claude Code that aren't real user prompts
const ARTIFACT_PREFIXES = [
  '[Request interrupted',
  '<local-command-',
  '<command-name>',
];

function isArtifact(text) {
  const t = text.trimStart();
  return !t || ARTIFACT_PREFIXES.some(p => t.startsWith(p));
}

// Read first user prompt, parent session ID, and estimated message count from a
// .jsonl file.  Only reads the first ~32KB — enough for prompt/parent detection.
// Message count is estimated from file size (avg ~1.5KB per message turn) to avoid
// scanning potentially huge (100MB+) files.
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
  let parentSessionId = '';
  let messageCount = 0;

  const sessionId = path.basename(filePath, '.jsonl');

  try {
    const fd = fs.openSync(filePath, 'r');
    const fileSize = fs.fstatSync(fd).size;
    const headSize = Math.min(32768, fileSize);
    const headBuf = Buffer.alloc(headSize);
    fs.readSync(fd, headBuf, 0, headSize, 0);
    fs.closeSync(fd);

    const head = headBuf.toString('utf-8');
    const headLines = head.split('\n');

    let hasMessages = false;
    for (const line of headLines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.type === 'user' || obj.type === 'assistant') hasMessages = true;
      if (obj.type === 'user') {
        if (!parentSessionId && obj.sessionId && obj.sessionId !== sessionId) {
          parentSessionId = obj.sessionId;
        }
        if (!firstPrompt) {
          const msg = obj.message;
          if (msg && typeof msg === 'object') {
            const ct = msg.content;
            let text = '';
            if (Array.isArray(ct)) {
              for (const c of ct) {
                if (c && c.type === 'text' && c.text) { text = c.text; break; }
              }
            } else if (typeof ct === 'string') {
              text = ct;
            }
            if (text && !isArtifact(text)) {
              firstPrompt = text.slice(0, 200);
            }
          }
        }
      }
      if (firstPrompt && parentSessionId) break;
    }

    // Estimate message count from file size (~1.5KB per message turn on average)
    // Mark as 0 if the head contained no user/assistant messages (empty session)
    messageCount = hasMessages ? Math.max(1, Math.round(fileSize / 1500)) : 0;
  } catch {
    // Unreadable file
  }

  const data = { firstPrompt, messageCount, parentSessionId };
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

    const rawSessions = [];
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

      // Always parse the file for parentSessionId and message count
      const parsed = parseSessionFile(filePath);
      const parentSessionId = parsed ? parsed.parentSessionId : '';

      const indexed = indexedById.get(sessionId);

      let summary, firstPrompt, messageCount, gitBranch, created, isSidechain, status;

      if (indexed) {
        summary = indexed.summary || '';
        firstPrompt = indexed.firstPrompt || '';
        messageCount = indexed.messageCount || (parsed ? parsed.messageCount : 0);
        gitBranch = indexed.gitBranch || '';
        created = indexed.created;
        isSidechain = indexed.isSidechain || false;
        status = detectSessionStatus(sessionId, filePath, lastActivity);
        if (!projectPath) projectPath = indexed.projectPath || '';
      } else {
        firstPrompt = parsed ? parsed.firstPrompt : '';
        messageCount = parsed ? parsed.messageCount : 0;
        status = detectSessionStatus(sessionId, filePath, lastActivity);
        summary = '';
        gitBranch = '';
        created = new Date(fileCreated).toISOString();
        isSidechain = false;
      }

      // Skip empty sessions (e.g. started and immediately abandoned)
      if (messageCount === 0 && !firstPrompt) continue;

      if (lastActivity > mostRecent) mostRecent = lastActivity;

      rawSessions.push({
        sessionId,
        parentSessionId,
        summary: summary || firstPrompt.slice(0, 80) || '(no summary)',
        firstPrompt: firstPrompt || '',
        messageCount,
        gitBranch,
        status,
        created: created || new Date(fileCreated).toISOString(),
        lastActivity,
        modified: new Date(lastActivity).toISOString(),
        isSidechain,
      });
    }

    // Merge continuation chains: collapse parent→child sequences into one entry.
    // The latest session in each chain inherits the root's created time and
    // accumulates message counts. Previous sessions are kept in an array.
    const byId = new Map();
    for (const s of rawSessions) byId.set(s.sessionId, s);

    // Find which sessions are parents (have a child pointing to them)
    const isParent = new Set();
    for (const s of rawSessions) {
      if (s.parentSessionId && byId.has(s.parentSessionId)) {
        isParent.add(s.parentSessionId);
      }
    }

    const sessions = [];
    for (const s of rawSessions) {
      if (isParent.has(s.sessionId)) continue; // skip — will be folded into child

      // Walk back through parent chain
      const chain = [];
      let cur = s;
      while (cur.parentSessionId && byId.has(cur.parentSessionId)) {
        const parent = byId.get(cur.parentSessionId);
        chain.unshift(parent);
        cur = parent;
      }

      if (chain.length > 0) {
        // Use root session's created time
        s.created = chain[0].created;
        // Aggregate message counts
        s.messageCount = chain.reduce((sum, p) => sum + p.messageCount, 0) + s.messageCount;
        // Use root's summary/firstPrompt if current one is generic
        if (chain[0].firstPrompt && (!s.firstPrompt || s.summary === '(no summary)')) {
          s.firstPrompt = chain[0].firstPrompt;
          s.summary = chain[0].summary;
        }
        // Attach previous sessions for the UI
        s.previousSessions = chain.map(p => ({
          sessionId: p.sessionId,
          created: p.created,
          modified: p.modified,
          messageCount: p.messageCount,
          summary: p.summary,
        }));
      }

      delete s.parentSessionId;
      sessions.push(s);
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

// Live reload: track mtime of static files, clients poll for changes
const PUBLIC_DIR = path.join(__dirname, 'public');
let staticHash = '';

function computeStaticHash() {
  try {
    const files = fs.readdirSync(PUBLIC_DIR);
    const mtimes = files.map(f => {
      try { return fs.statSync(path.join(PUBLIC_DIR, f)).mtimeMs; } catch { return 0; }
    });
    return mtimes.join(',');
  } catch { return ''; }
}
staticHash = computeStaticHash();

app.get('/api/livereload', (req, res) => {
  const current = computeStaticHash();
  if (current !== staticHash) {
    staticHash = current;
    return res.json({ reload: true });
  }
  res.json({ reload: false });
});

app.listen(PORT, () => {
  console.log(`Claude Kanban → http://localhost:${PORT}`);
});
