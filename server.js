import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 6767;
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

const bedrock = new AnthropicBedrock({ aws_region: process.env.AWS_REGION || 'eu-west-1' });

// Cache parsed session files so we don't re-read unchanged files every poll
const fileCache = new Map(); // key: filePath, value: { mtime, data }

// Activity map — populated by hook-based POST /api/activity events.
// key: sessionId, value: { event, timestamp }
const activityMap = new Map();

// Persistent cache helper: stores { value: string, fileSize: number } per session
function createPersistentCache(filePath) {
  const map = new Map();
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const [id, entry] of Object.entries(data)) {
      // Migrate old { title, fileSize } format
      if (entry.value === undefined && entry.title !== undefined) {
        map.set(id, { value: entry.title, fileSize: entry.fileSize });
      } else {
        map.set(id, entry);
      }
    }
  } catch {}
  return {
    get(id) { return map.get(id); },
    has(id) { return map.has(id); },
    set(id, value, fileSize) {
      map.set(id, { value, fileSize });
      const obj = Object.fromEntries(map);
      fs.writeFileSync(filePath, JSON.stringify(obj), 'utf-8');
    },
    needsRefresh(id, sessionFilePath) {
      const cached = map.get(id);
      if (!cached || !cached.value) return true;
      try {
        const currentSize = fs.statSync(sessionFilePath).size;
        return currentSize - cached.fileSize >= 10240;
      } catch { return false; }
    },
  };
}

const titleCache = createPersistentCache(path.join(__dirname, 'titles.json'));
const blurbCache = createPersistentCache(path.join(__dirname, 'blurbs.json'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Find the .jsonl file for a session ID by scanning project dirs
function findSessionFile(sessionId) {
  try {
    for (const dir of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const fp = path.join(PROJECTS_DIR, dir.name, sessionId + '.jsonl');
      if (fs.existsSync(fp)) return fp;
    }
  } catch {}
  return null;
}

// Read recent conversation from session tail for summarization
function readRecentConversation(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    const tailSize = Math.min(16384, stat.size);
    const buf = Buffer.alloc(tailSize);
    fs.readSync(fd, buf, 0, tailSize, stat.size - tailSize);
    fs.closeSync(fd);

    const lines = buf.toString('utf-8').split('\n').filter(l => l.trim());
    const turns = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type !== 'user' && obj.type !== 'assistant') continue;
        const content = obj.message && obj.message.content;
        let text = '';
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter(c => c && c.type === 'text' && c.text)
            .map(c => c.text)
            .join(' ');
        }
        if (text.trim()) {
          turns.push({ role: obj.type, text: text.slice(0, 500) });
        }
      } catch {}
    }
    return turns.slice(-8); // last ~8 turns
  } catch {}
  return [];
}

// Detect Haiku refusal/meta-responses (e.g. "I don't have a coding session...")
function isHaikuRefusal(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return (t.startsWith('i don') || t.startsWith('i can') || t.startsWith('i need')
    || t.startsWith('there') || t.startsWith('no coding')
    || t.includes('coding session') || t.includes('to summarize'));
}

// Generate a tweet-length blurb via Haiku
async function generateBlurb(sessionId) {
  const filePath = findSessionFile(sessionId);
  if (!filePath) return;

  let fileSize = 0;
  try { fileSize = fs.statSync(filePath).size; } catch { return; }

  const turns = readRecentConversation(filePath);
  if (turns.length === 0) {
    blurbCache.set(sessionId, '', fileSize);
    return;
  }

  const convo = turns.map(t => `${t.role}: ${t.text}`).join('\n\n');

  try {
    const resp = await bedrock.messages.create({
      model: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: `Summarize this coding session in one sentence (under 200 chars), like a tweet. Focus on what was accomplished or is in progress. No hashtags or emoji. Just the substance.\n\n${convo}`,
      }],
    });
    let blurb = (resp.content[0] && resp.content[0].text || '').trim();
    if (isHaikuRefusal(blurb)) blurb = '';
    blurbCache.set(sessionId, blurb, fileSize);
  } catch (err) {
    console.error('Blurb generation failed:', err.message);
    blurbCache.set(sessionId, '', fileSize);
  }
}

// needsTitle/needsBlurb are just wrappers around the cache's needsRefresh
function needsTitle(sessionId, filePath) {
  return titleCache.needsRefresh(sessionId, filePath);
}

// Generate a short title via Haiku
async function generateTitle(sessionId) {
  const filePath = findSessionFile(sessionId);
  if (!filePath) return;

  let fileSize = 0;
  try { fileSize = fs.statSync(filePath).size; } catch { return; }

  const turns = readRecentConversation(filePath);
  if (turns.length === 0) {
    titleCache.set(sessionId, '', fileSize);
    return;
  }

  const convo = turns.map(t => `${t.role}: ${t.text}`).join('\n\n');

  try {
    const resp = await bedrock.messages.create({
      model: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
      max_tokens: 40,
      messages: [{
        role: 'user',
        content: `Summarize this coding session in 3-8 words as a title. No quotes, no punctuation, no preamble. Just the title.\n\n${convo}`,
      }],
    });
    let title = (resp.content[0] && resp.content[0].text || '').trim();
    // Discard Haiku refusals/meta-responses
    if (isHaikuRefusal(title)) title = '';
    titleCache.set(sessionId, title, fileSize);
  } catch (err) {
    console.error('Title generation failed:', err.message);
    titleCache.set(sessionId, '', fileSize);
  }
}

// Hook endpoint — receives activity events from Claude Code hooks
app.post('/api/activity', (req, res) => {
  const { sessionId, event } = req.body || {};
  if (!sessionId || !event) return res.status(400).json({ error: 'missing sessionId or event' });
  activityMap.set(sessionId, { event, timestamp: Date.now() });

  // Generate title and blurb on stop events (if stale)
  if (event === 'stop') {
    const filePath = findSessionFile(sessionId);
    if (filePath) {
      if (needsTitle(sessionId, filePath)) generateTitle(sessionId).catch(() => {});
      if (blurbCache.needsRefresh(sessionId, filePath)) generateBlurb(sessionId).catch(() => {});
    }
  }

  res.json({ ok: true });
});

// Determine session status. Uses hook-reported activity when available,
// falls back to file-tail heuristics for sessions without hook data.
// Read tail lines from a .jsonl file (shared helper)
function readTailLines(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    const readSize = Math.min(8192, size);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, size - readSize);
    fs.closeSync(fd);
    return buf.toString('utf-8').split('\n').filter(l => l.trim());
  } catch {}
  return [];
}

// Read the last message (any type) from the tail of a .jsonl file
function readLastMessage(filePath) {
  const lines = readTailLines(filePath);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj.type === 'assistant' || obj.type === 'user') return obj;
    } catch { /* partial line */ }
  }
  return null;
}

// Read the last assistant-only message from the tail of a .jsonl file
function readLastAssistantMessage(filePath) {
  const lines = readTailLines(filePath);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj.type === 'assistant') return obj;
    } catch { /* partial line */ }
  }
  return null;
}

// Check if the last assistant message is waiting for user input:
// - Contains AskUserQuestion or ExitPlanMode tool use
// - Last text block ends with a question mark
function isWaitingForInput(lastMsg) {
  if (!lastMsg || lastMsg.type !== 'assistant') return false;
  const content = (lastMsg.message || {}).content;
  if (!Array.isArray(content)) return false;

  let lastText = '';
  for (const c of content) {
    if (!c || typeof c !== 'object') continue;
    if (c.type === 'tool_use') {
      const name = (c.name || '').toLowerCase();
      if (name === 'askuserquestion' || name === 'exitplanmode') return true;
    }
    if (c.type === 'text' && c.text) {
      lastText = c.text;
    }
  }

  return lastText.trimEnd().endsWith('?');
}

function detectSessionStatus(sessionId, filePath, mtimeMs) {
  const now = Date.now();

  // Check hook-reported activity first
  const activity = activityMap.get(sessionId);
  if (activity) {
    const ageMs = now - activity.timestamp;

    if (activity.event === 'working' || activity.event === 'prompt') {
      if (ageMs < 60000) return 'working';
      return 'idle';
    }
    if (activity.event === 'stop') {
      if (ageMs < 3600000) {
        const lastMsg = readLastAssistantMessage(filePath);
        return isWaitingForInput(lastMsg) ? 'waiting' : 'idle';
      }
      return 'idle';
    }
    if (activity.event === 'idle') {
      // Don't downgrade to idle if the session is waiting for user input
      const lastMsg = readLastAssistantMessage(filePath);
      if (isWaitingForInput(lastMsg)) return 'waiting';
      return 'idle';
    }
  }

  // Fallback: file-based heuristic for sessions without hook data
  const fileAge = now - mtimeMs;

  if (fileAge < 30000) {
    const lastMsg = readLastMessage(filePath);
    if (!lastMsg) return 'idle';
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

  if (fileAge < 3600000) {
    const lastAssistant = readLastAssistantMessage(filePath);
    return isWaitingForInput(lastAssistant) ? 'waiting' : 'idle';
  }
  return 'idle';
}

// System artifacts injected by Claude Code that aren't real user prompts
const ARTIFACT_PREFIXES = [
  '[Request interrupted',
  '<local-command-',
  '<command-name>',
  '<command-message>',
  '<ide_opened_file>',
];

function isArtifact(text) {
  const t = text.trimStart();
  return !t || ARTIFACT_PREFIXES.some(p => t.startsWith(p));
}

// Clean a title string: strip plan boilerplate, collapse whitespace, trim length
function cleanTitle(text) {
  let t = text.replace(/^Implement the following plan:\s*/i, '');
  t = t.replace(/^#\s*Plan:\s*/i, '');
  t = t.replace(/<[^>]+>/g, ''); // strip XML-like tags
  // Cut at markdown headers or section breaks
  t = t.split(/\s*##\s/)[0];
  t = t.split(/\s*\n\s*\n/)[0];
  // Strip leading markdown header markers (e.g. "# Title" → "Title")
  t = t.replace(/^#+\s*/, '');
  t = t.replace(/\s+/g, ' ').trim();
  // Skip system-injected boilerplate
  if (t.startsWith('Base directory for this skill:')) t = '';
  if (t.startsWith('This session is being continued')) t = '';
  return t.slice(0, 80) || '';
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

  let summary = '';

  try {
    const fd = fs.openSync(filePath, 'r');
    const fileSize = fs.fstatSync(fd).size;
    const headSize = Math.min(32768, fileSize);
    const headBuf = Buffer.alloc(headSize);
    fs.readSync(fd, headBuf, 0, headSize, 0);

    // Also read tail for blurb extraction
    const tailSize = Math.min(16384, fileSize);
    const tailBuf = Buffer.alloc(tailSize);
    fs.readSync(fd, tailBuf, 0, tailSize, fileSize - tailSize);
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
            if (Array.isArray(ct)) {
              for (const c of ct) {
                if (c && c.type === 'text' && c.text && !isArtifact(c.text)) {
                  firstPrompt = c.text.slice(0, 200);
                  break;
                }
              }
            } else if (typeof ct === 'string' && !isArtifact(ct)) {
              firstPrompt = ct.slice(0, 200);
            }
          }
        }
      }
      if (firstPrompt && parentSessionId) break;
    }

    // Extract summary from the tail
    const tailLines = tailBuf.toString('utf-8').split('\n').filter(l => l.trim());
    for (let i = tailLines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(tailLines[i]);
        if (obj.type === 'summary' && obj.summary) {
          summary = obj.summary;
          break;
        }
      } catch { /* partial line */ }
    }

    // Estimate message count from file size (~1.5KB per message turn on average)
    // Mark as 0 if the head contained no user/assistant messages (empty session)
    messageCount = hasMessages ? Math.max(1, Math.round(fileSize / 1500)) : 0;
  } catch {
    // Unreadable file
  }

  const data = { firstPrompt, messageCount, parentSessionId, summary };
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

      let title, firstPrompt, messageCount, gitBranch, created, isSidechain, status;
      const blurbEntry = blurbCache.get(sessionId);
      const blurb = blurbEntry ? blurbEntry.value : '';
      const parsedSummary = parsed ? parsed.summary : '';

      const titleEntry = titleCache.get(sessionId);
      const cachedTitle = titleEntry ? titleEntry.value : '';

      if (indexed) {
        title = indexed.summary || cachedTitle || parsedSummary || '';
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
        title = cachedTitle || parsedSummary || '';
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
        title: cleanTitle(title || firstPrompt) || '(no title)',
        blurb: blurb || '',
        firstPrompt: firstPrompt || '',
        messageCount,
        gitBranch,
        status,
        created: created || new Date(fileCreated).toISOString(),
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
        // Use root's title/firstPrompt if current one is generic
        if (chain[0].firstPrompt && (!s.firstPrompt || s.title === '(no title)')) {
          s.firstPrompt = chain[0].firstPrompt;
          s.title = chain[0].title;
        }
        // Attach previous sessions for the UI
        s.previousSessions = chain.map(p => ({
          sessionId: p.sessionId,
          created: p.created,
          modified: p.modified,
          messageCount: p.messageCount,
          title: p.title,
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
      mostRecent: new Date(mostRecent).toISOString(),
      sessions,
    });
  }

  projects.sort((a, b) => new Date(b.mostRecent) - new Date(a.mostRecent));

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

// Return recent messages from the tail of a session (lightweight)
app.get('/api/session/:dirName/:sessionId/recent', (req, res) => {
  const { dirName, sessionId } = req.params;
  const filePath = path.join(PROJECTS_DIR, dirName, sessionId + '.jsonl');

  let stat;
  try { stat = fs.statSync(filePath); } catch {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    const fd = fs.openSync(filePath, 'r');
    const tailSize = Math.min(32768, stat.size);
    const buf = Buffer.alloc(tailSize);
    fs.readSync(fd, buf, 0, tailSize, stat.size - tailSize);
    fs.closeSync(fd);

    const lines = buf.toString('utf-8').split('\n').filter(l => l.trim());
    const messages = [];

    for (const line of lines) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.type !== 'user' && obj.type !== 'assistant') continue;
      const msg = obj.message;
      if (!msg) continue;

      const role = msg.role || obj.type;
      const content = msg.content;
      const parts = [];

      if (typeof content === 'string') {
        if (content.trim()) parts.push({ type: 'text', text: content.slice(0, 1000) });
      } else if (Array.isArray(content)) {
        for (const c of content) {
          if (!c || typeof c !== 'object') continue;
          if (c.type === 'text' && c.text && !isArtifact(c.text)) {
            parts.push({ type: 'text', text: c.text.slice(0, 1000) });
          } else if (c.type === 'tool_use') {
            parts.push({ type: 'tool_use', name: c.name || '' });
          }
        }
      }

      if (parts.length > 0) messages.push({ role, parts });
    }

    // Return last 10 messages
    res.json({ messages: messages.slice(-10) });
  } catch {
    res.status(500).json({ error: 'Failed to read session' });
  }
});

// Focus a terminal window matching project + session title
app.post('/api/focus-terminal', (req, res) => {
  const { projectName, title } = req.body || {};
  if (!projectName || !title) return res.status(400).json({ error: 'missing projectName or title' });

  const titleSnippet = title.slice(0, 40).replace(/[\\"`]/g, '');
  const projName = projectName.replace(/[\\"`]/g, '');

  // AppleScript: search windows in Terminal.app, then iTerm2
  const script = `
    on findWindow(appName, proj, snippet)
      try
        tell application "System Events"
          if not (exists process appName) then return false
        end tell
        tell application appName
          repeat with w in windows
            set t to name of w
            if t contains proj and t contains snippet then
              set index of w to 1
              activate
              return true
            end if
          end repeat
        end tell
      end try
      return false
    end findWindow

    if findWindow("Terminal", "${projName}", "${titleSnippet}") then return "found"
    if findWindow("iTerm2", "${projName}", "${titleSnippet}") then return "found"
    return "not_found"
  `;

  execFile('osascript', ['-e', script], { timeout: 5000 }, (err, stdout) => {
    const found = (stdout || '').trim() === 'found';
    res.json({ found });
  });
});

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// On startup, refresh titles and blurbs for sessions that need them.
// Processes sequentially with a small delay to avoid hammering Bedrock.
async function refreshCaches() {
  let dirEntries;
  try {
    dirEntries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  } catch { return; }

  const titleQueue = [];
  const blurbQueue = [];

  for (const dirent of dirEntries) {
    if (!dirent.isDirectory()) continue;
    const projectDir = path.join(PROJECTS_DIR, dirent.name);

    // Check for indexed summaries (title not needed for these)
    let indexedSummaries = new Map();
    try {
      const raw = fs.readFileSync(path.join(projectDir, 'sessions-index.json'), 'utf-8');
      const indexData = JSON.parse(raw);
      for (const entry of (indexData.entries || [])) {
        if (entry.summary) indexedSummaries.set(entry.sessionId, true);
      }
    } catch {}

    let files;
    try {
      files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
    } catch { continue; }

    for (const file of files) {
      const sessionId = path.basename(file, '.jsonl');
      const filePath = path.join(projectDir, file);

      const parsed = parseSessionFile(filePath);
      if (!parsed || !parsed.firstPrompt) continue; // empty session

      const needsTitleRefresh = !indexedSummaries.has(sessionId)
        && !(parsed && parsed.summary)
        && needsTitle(sessionId, filePath);
      if (needsTitleRefresh) titleQueue.push(sessionId);

      if (blurbCache.needsRefresh(sessionId, filePath)) blurbQueue.push(sessionId);
    }
  }

  if (titleQueue.length > 0) {
    console.log(`Generating titles for ${titleQueue.length} sessions...`);
    for (const sessionId of titleQueue) {
      try { await generateTitle(sessionId); } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`Title generation complete.`);
  }

  if (blurbQueue.length > 0) {
    console.log(`Generating blurbs for ${blurbQueue.length} sessions...`);
    for (const sessionId of blurbQueue) {
      try { await generateBlurb(sessionId); } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`Blurb generation complete.`);
  }
}

app.listen(PORT, () => {
  console.log(`Claude Radar → http://localhost:${PORT}`);
  refreshCaches().catch(err => console.error('refreshCaches failed:', err.message));
});
