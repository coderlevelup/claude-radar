(() => {
  const board = document.getElementById('board');
  const stats = document.getElementById('stats');
  const panel = document.getElementById('panel');
  const panelOverlay = document.getElementById('panel-overlay');
  const panelTitle = document.getElementById('panel-title');
  const panelMeta = document.getElementById('panel-meta');
  const panelBlurb = document.getElementById('panel-blurb');
  const panelMessages = document.getElementById('panel-messages');
  const panelClose = document.getElementById('panel-close');
  const showOlderCheckbox = document.getElementById('show-older');
  const olderToggleLabel = document.getElementById('older-toggle');
  const viewBoardBtn = document.getElementById('view-board');
  const viewTimelineBtn = document.getElementById('view-timeline');

  let lastJson = '';
  let lastData = null;
  let showOlder = false;
  let currentView = 'board';
  let expandedSessionId = null;

  // ── Persistent state (localStorage) ─────────────────
  const STORAGE_ORDER = 'radar-project-order';
  const STORAGE_COLLAPSED = 'radar-collapsed';

  let projectOrder = JSON.parse(localStorage.getItem(STORAGE_ORDER) || '[]');
  const collapsed = new Set(JSON.parse(localStorage.getItem(STORAGE_COLLAPSED) || '[]'));
  const lastMostRecent = new Map(); // dirName → mostRecent timestamp for activity detection

  function saveOrder() {
    localStorage.setItem(STORAGE_ORDER, JSON.stringify(projectOrder));
  }
  function saveCollapsed() {
    localStorage.setItem(STORAGE_COLLAPSED, JSON.stringify([...collapsed]));
  }

  // Sort projects: stored order first, new projects at top sorted by mostRecent
  function sortProjects(projects) {
    const orderIndex = new Map();
    projectOrder.forEach((dir, i) => orderIndex.set(dir, i));

    const known = [];
    const unknown = [];
    for (const p of projects) {
      if (orderIndex.has(p.dirName)) {
        known.push(p);
      } else {
        unknown.push(p);
      }
    }
    known.sort((a, b) => orderIndex.get(a.dirName) - orderIndex.get(b.dirName));
    unknown.sort((a, b) => b.mostRecent - a.mostRecent);

    const sorted = [...unknown, ...known];

    // Update stored order to include new projects
    projectOrder = sorted.map(p => p.dirName);
    saveOrder();

    return sorted;
  }

  // Detect new activity on collapsed projects and expand them
  function expandOnActivity(projects) {
    for (const p of projects) {
      const prev = lastMostRecent.get(p.dirName);
      if (prev !== undefined && p.mostRecent > prev && collapsed.has(p.dirName)) {
        collapsed.delete(p.dirName);
        saveCollapsed();
      }
      lastMostRecent.set(p.dirName, p.mostRecent);
    }
  }

  // ── Time helpers ──────────────────────────────────────
  function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  function timeColumn(session) {
    const now = new Date();
    const ts = session.lastActivity ? new Date(session.lastActivity) : new Date(session.modified);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    if (ts >= startOfToday) return 'today';
    if (ts >= startOfWeek) return 'week';
    return 'older';
  }

  // Get the Monday (ISO start) of the week containing a date
  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday = start
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Get ISO week number
  function getISOWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const yearStart = new Date(d.getFullYear(), 0, 4);
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  // Format: "Week of Feb 10"
  function formatWeekLabel(date) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `Week of ${months[date.getMonth()]} ${date.getDate()}`;
  }

  // Short format for timeline headers: "W05 · Jan 27"
  function formatTimelineWeekHeader(date) {
    const wk = getISOWeek(date);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `W${String(wk).padStart(2, '0')} · ${months[date.getMonth()]} ${date.getDate()}`;
  }

  // Group older sessions by week, returns array of { label, weekStart, sessions } sorted newest first
  function groupOlderByWeek(sessions) {
    const weekMap = new Map();
    for (const s of sessions) {
      const ts = s.lastActivity ? new Date(s.lastActivity) : new Date(s.modified);
      const ws = getWeekStart(ts);
      const key = ws.toISOString();
      if (!weekMap.has(key)) {
        weekMap.set(key, { label: formatWeekLabel(ws), weekStart: ws, sessions: [] });
      }
      weekMap.get(key).sessions.push(s);
    }
    // Sort newest week first
    const weeks = Array.from(weekMap.values());
    weeks.sort((a, b) => b.weekStart - a.weekStart);
    // Sort sessions within each week
    for (const w of weeks) {
      w.sessions.sort((a, b) => new Date(b.created) - new Date(a.created));
    }
    return weeks;
  }

  // ── Panel ─────────────────────────────────────────────
  function openPanel(dirName, session) {
    panel.classList.remove('hidden');
    panelOverlay.classList.remove('hidden');
    panel.offsetHeight;
    panel.classList.add('open');

    panelTitle.textContent = session.title;

    const badges = [];
    badges.push(`<span class="badge badge-messages">${session.messageCount} msgs</span>`);
    if (session.gitBranch) {
      badges.push(`<span class="badge badge-branch">${esc(session.gitBranch)}</span>`);
    }
    panelMeta.innerHTML = badges.join('');

    panelBlurb.textContent = session.blurb || '';

    const sessionUrl = `/api/session/${encodeURIComponent(dirName)}/${encodeURIComponent(session.sessionId)}`;
    panelMessages.innerHTML = `<a class="panel-view-link" href="${sessionUrl}" data-dir="${esc(dirName)}" data-session="${esc(session.sessionId)}">View full session</a>`;

    panelMessages.querySelector('.panel-view-link').addEventListener('click', (e) => {
      e.preventDefault();
      const link = e.currentTarget;
      link.textContent = 'Loading...';
      fetch(sessionUrl)
        .then(r => r.json())
        .then(data => renderMessages(data.messages))
        .catch(() => {
          panelMessages.innerHTML = '<div class="panel-loading">Failed to load session</div>';
        });
    });
  }

  function closePanel() {
    panel.classList.remove('open');
    panelOverlay.classList.add('hidden');
    setTimeout(() => panel.classList.add('hidden'), 250);
  }

  panelClose.addEventListener('click', closePanel);
  panelOverlay.addEventListener('click', closePanel);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

  function renderMessages(messages) {
    if (!messages || messages.length === 0) {
      panelMessages.innerHTML = '<div class="panel-loading">No messages in this session</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    for (const msg of messages) {
      const div = document.createElement('div');
      div.className = `msg msg-${msg.role}`;

      const roleName = msg.role === 'assistant' ? 'Claude' : ':David';
      let html = `<span class="msg-role">${roleName}</span>`;

      for (const part of msg.parts) {
        if (part.type === 'text') {
          html += `<div class="msg-text">${escAndFormat(part.text)}</div>`;
        } else if (part.type === 'tool_use') {
          html += `<span class="msg-tool">${esc(part.name)}</span>`;
        } else if (part.type === 'tool_result') {
          html += `<div class="msg-tool-result">${esc(part.text)}</div>`;
        }
      }

      div.innerHTML = html;
      frag.appendChild(div);
    }

    panelMessages.innerHTML = '';
    panelMessages.appendChild(frag);
    panelMessages.scrollTop = panelMessages.scrollHeight;
  }

  function escAndFormat(text) {
    let s = esc(text);
    s = s.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre>$2</pre>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }

  // ── Card thread (recent messages) ──────────────────────
  function loadThread(card) {
    const thread = card.querySelector('.card-thread');
    if (!thread) return;
    const dir = card.dataset.dir;
    const sid = card.dataset.sessionId;
    if (!thread.hasChildNodes()) {
      thread.innerHTML = '<div class="thread-loading">Loading...</div>';
    }

    fetch(`/api/session/${encodeURIComponent(dir)}/${encodeURIComponent(sid)}/recent`)
      .then(r => r.json())
      .then(data => {
        if (!data.messages || data.messages.length === 0) {
          thread.innerHTML = '';
          return;
        }
        const html = data.messages.map(msg => {
          const role = msg.role === 'assistant' ? 'claude' : 'user';
          const parts = msg.parts.map(p => {
            if (p.type === 'text') return `<div class="thread-text">${escAndFormat(p.text)}</div>`;
            if (p.type === 'tool_use') return `<span class="thread-tool">${esc(p.name)}</span>`;
            return '';
          }).join('');
          return `<div class="thread-msg thread-${role}">${parts}</div>`;
        }).join('');
        // Only update DOM if content changed
        if (thread.innerHTML !== html) {
          const wasAtBottom = thread.scrollTop + thread.clientHeight >= thread.scrollHeight - 10;
          thread.innerHTML = html;
          if (wasAtBottom) thread.scrollTop = thread.scrollHeight;
        }
      })
      .catch(() => {});
  }

  // ── Toggle handlers ─────────────────────────────────────
  showOlderCheckbox.addEventListener('change', () => {
    showOlder = showOlderCheckbox.checked;
    if (lastData) dispatchRender();
  });

  viewBoardBtn.addEventListener('click', () => {
    if (currentView === 'board') return;
    currentView = 'board';
    viewBoardBtn.classList.add('active');
    viewTimelineBtn.classList.remove('active');
    olderToggleLabel.style.display = '';
    if (lastData) dispatchRender();
  });

  viewTimelineBtn.addEventListener('click', () => {
    if (currentView === 'timeline') return;
    currentView = 'timeline';
    viewTimelineBtn.classList.add('active');
    viewBoardBtn.classList.remove('active');
    olderToggleLabel.style.display = 'none';
    if (lastData) dispatchRender();
  });

  function dispatchRender() {
    if (currentView === 'board') {
      renderBoard(lastData);
    } else {
      renderTimeline(lastData);
    }
  }

  // ── Drag state ──────────────────────────────────────────
  let dragSrcDir = null;

  // ── Board Render ────────────────────────────────────────
  function renderBoard(data) {
    lastData = data;

    expandOnActivity(data.projects);
    const sorted = sortProjects(data.projects);

    stats.textContent = `${data.totalProjects} projects · ${data.totalSessions} sessions`;

    const frag = document.createDocumentFragment();

    for (const project of sorted) {
      // Group sessions into columns
      const groups = { today: [], week: [], older: [] };
      for (const s of project.sessions) {
        groups[timeColumn(s)].push(s);
      }
      for (const key of Object.keys(groups)) {
        groups[key].sort((a, b) => new Date(b.created) - new Date(a.created));
      }

      // Skip projects with no visible sessions
      if (!showOlder && groups.today.length === 0 && groups.week.length === 0) continue;

      const lane = document.createElement('div');
      lane.className = 'swimlane'
        + (collapsed.has(project.dirName) ? ' collapsed' : '')
        + (groups.today.length === 0 ? ' no-today' : '');
      lane.dataset.dir = project.dirName;

      let columnsHtml = '';
      let colCount = 2;

      columnsHtml += renderColumn('Today', groups.today, project.dirName);
      columnsHtml += renderColumn('This Week', groups.week, project.dirName);

      if (showOlder) {
        const olderWeeks = groupOlderByWeek(groups.older);
        if (olderWeeks.length > 0) {
          for (const w of olderWeeks) {
            columnsHtml += renderColumn(w.label, w.sessions, project.dirName);
            colCount++;
          }
        } else {
          columnsHtml += renderColumn('Older', [], project.dirName);
          colCount++;
        }
      }

      lane.innerHTML = `
        <div class="swimlane-header" draggable="true" data-lane="${project.dirName}">
          <div class="swimlane-title">
            <span class="swimlane-drag">\u2261</span>
            <span class="swimlane-chevron">\u25BC</span>
            <span class="swimlane-name">${esc(project.projectName)}</span>
            <span class="swimlane-path">${esc(project.projectPath)}</span>
          </div>
          <span class="swimlane-count">${project.sessions.length} sessions</span>
        </div>
        <div class="swimlane-body" style="grid-template-columns: repeat(${colCount}, 1fr)">
          ${columnsHtml}
        </div>
      `;

      const header = lane.querySelector('.swimlane-header');

      // Collapse/expand on click (but not during drag)
      header.addEventListener('click', (e) => {
        if (e.target.closest('.swimlane-drag')) return; // don't toggle when grabbing handle
        const key = project.dirName;
        if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
        saveCollapsed();
        lane.classList.toggle('collapsed');
      });

      // Drag-and-drop
      header.addEventListener('dragstart', (e) => {
        dragSrcDir = project.dirName;
        lane.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      header.addEventListener('dragend', () => {
        dragSrcDir = null;
        lane.classList.remove('dragging');
        board.querySelectorAll('.swimlane').forEach(el => el.classList.remove('drag-over'));
      });
      lane.addEventListener('dragover', (e) => {
        if (!dragSrcDir || dragSrcDir === project.dirName) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        board.querySelectorAll('.swimlane').forEach(el => el.classList.remove('drag-over'));
        lane.classList.add('drag-over');
      });
      lane.addEventListener('dragleave', () => {
        lane.classList.remove('drag-over');
      });
      lane.addEventListener('drop', (e) => {
        e.preventDefault();
        lane.classList.remove('drag-over');
        if (!dragSrcDir || dragSrcDir === project.dirName) return;

        const fromIdx = projectOrder.indexOf(dragSrcDir);
        const toIdx = projectOrder.indexOf(project.dirName);
        if (fromIdx === -1 || toIdx === -1) return;

        projectOrder.splice(fromIdx, 1);
        projectOrder.splice(toIdx, 0, dragSrcDir);
        saveOrder();
        dispatchRender();
      });

      lane.querySelector('.swimlane-body').addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        if (!card) return;
        e.stopPropagation();
        const sid = card.dataset.sessionId;
        const wasExpanded = sid === expandedSessionId;
        // Collapse any other expanded cards
        board.querySelectorAll('.card.expanded').forEach(el => el.classList.remove('expanded'));
        if (!wasExpanded) {
          expandedSessionId = sid;
          card.classList.add('expanded');
          loadThread(card);
        } else {
          expandedSessionId = null;
        }
      });

      frag.appendChild(lane);
    }

    board.innerHTML = '';
    board.appendChild(frag);

    // Restore expanded card
    if (expandedSessionId) {
      const card = board.querySelector(`.card[data-session-id="${expandedSessionId}"]`);
      if (card) {
        card.classList.add('expanded');
        loadThread(card);
      }
    }
  }

  function renderColumn(label, sessions, dirName) {
    const cards = sessions.length
      ? sessions.map(s => renderCard(s, dirName)).join('')
      : '<div class="empty-col">No sessions</div>';

    return `
      <div class="column">
        <div class="column-header">
          <span class="column-label">${label}</span>
          <span class="column-count">${sessions.length}</span>
        </div>
        ${cards}
      </div>
    `;
  }

  function renderCard(s, dirName) {
    const statusLabels = { working: '\u25cf working', waiting: '\u25cf waiting', idle: '\u00b7 idle' };
    const statusKey = s.status || 'idle';

    const badges = [];
    badges.push(`<span class="badge badge-status-${statusKey}">${statusLabels[statusKey] || statusLabels.idle}</span>`);
    badges.push(`<span class="badge badge-messages">${s.messageCount} msgs</span>`);
    if (s.gitBranch) {
      badges.push(`<span class="badge badge-branch" title="${esc(s.gitBranch)}">${esc(s.gitBranch)}</span>`);
    }
    if (s.isSidechain) {
      badges.push(`<span class="badge badge-sidechain">sidechain</span>`);
    }

    return `
      <div class="card" data-session-id="${s.sessionId}" data-dir="${esc(dirName)}" data-status="${statusKey}">
        <div class="card-title">${esc(s.title)}</div>
        ${s.blurb ? `<div class="card-blurb">${esc(s.blurb)}</div>` : ''}
        <div class="card-expanded">
          <div class="card-blurb-full">${esc(s.blurb)}</div>
          <div class="card-thread"></div>
        </div>
        <div class="card-footer">
          <div class="card-badges">${badges.join('')}</div>
          <div class="card-time">
            <span data-label="active ">${relativeTime(s.modified)}</span>
            <span data-label="created ">${relativeTime(s.created)}</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Timeline / Gantt Render ─────────────────────────────
  function renderTimeline(data) {
    lastData = data;
    stats.textContent = `${data.totalProjects} projects · ${data.totalSessions} sessions`;

    // Collect all sessions to find date range
    const allSessions = [];
    for (const project of data.projects) {
      for (const s of project.sessions) {
        allSessions.push({ ...s, dirName: project.dirName, projectName: project.projectName });
      }
    }

    if (allSessions.length === 0) {
      board.innerHTML = '<div class="empty-col" style="padding:40px">No sessions</div>';
      return;
    }

    // Find date range
    let earliest = Infinity, latest = -Infinity;
    for (const s of allSessions) {
      const created = new Date(s.created).getTime();
      const modified = new Date(s.modified).getTime();
      if (created < earliest) earliest = created;
      if (modified > latest) latest = modified;
    }
    // Extend latest to now if any session is active
    const now = Date.now();
    if (now > latest) latest = now;

    // Build week columns from earliest to latest, then reverse so newest is first (left)
    const weeks = [];
    let ws = getWeekStart(new Date(earliest));
    const endWs = getWeekStart(new Date(latest));
    while (ws <= endWs) {
      weeks.push(new Date(ws));
      ws = new Date(ws);
      ws.setDate(ws.getDate() + 7);
    }
    weeks.reverse(); // newest week on the left

    const currentWeekStart = getWeekStart(new Date()).getTime();

    // Total timeline span in ms for positioning (oldest → newest for math)
    const timelineOldest = weeks[weeks.length - 1].getTime();
    const timelineNewest = new Date(weeks[0]);
    timelineNewest.setDate(timelineNewest.getDate() + 7);
    const totalMs = timelineNewest.getTime() - timelineOldest;

    // Build table headers — weeks already newest-first
    let headerCells = `<th class="timeline-project-label" style="background:var(--surface)">Project</th>`;
    for (const w of weeks) {
      const isCurrent = w.getTime() === currentWeekStart;
      headerCells += `<th class="timeline-header-cell${isCurrent ? ' current-week' : ''}">${formatTimelineWeekHeader(w)}</th>`;
    }

    // Column width percentage for CSS grid dividers
    const colWidthPct = 100 / weeks.length;

    let rows = '';
    for (const project of data.projects) {
      if (project.sessions.length === 0) continue;

      // Build bars for this project — mirrored so newest is on the left
      const bars = [];
      for (const s of project.sessions) {
        const cTime = new Date(s.created).getTime();
        const mTime = new Date(s.modified).getTime();
        const widthPct = Math.max(((mTime - cTime) / totalMs) * 100, 0.5);
        const leftPct = ((timelineNewest.getTime() - mTime) / totalMs) * 100;
        const status = s.status || 'idle';
        bars.push({ session: s, leftPct, widthPct, status });
      }

      // Sort bars by most recent first
      bars.sort((a, b) => a.leftPct - b.leftPct);

      // Build CSS gradient for column dividers
      const dividers = [];
      for (let i = 1; i < weeks.length; i++) {
        const pos = (colWidthPct * i).toFixed(2);
        dividers.push(`var(--border-subtle) ${pos}%, transparent ${pos}%`);
        // 1px line: also add a stop just before
        const posBefore = (colWidthPct * i - 0.1).toFixed(2);
        dividers.push(`transparent ${posBefore}%`);
      }
      // Reorder so each divider is: transparent up to line, line color, transparent after
      const gradientStops = [];
      for (let i = 1; i < weeks.length; i++) {
        const posBefore = Math.max(colWidthPct * i - 0.08, 0).toFixed(2);
        const pos = (colWidthPct * i).toFixed(2);
        gradientStops.push(`transparent ${posBefore}%, var(--border-subtle) ${posBefore}%, var(--border-subtle) ${pos}%, transparent ${pos}%`);
      }
      const bgGradient = gradientStops.length
        ? `background-image: linear-gradient(to right, ${gradientStops.join(', ')});`
        : '';

      const rowHeight = Math.max(bars.length * 26 + 6, 40);
      let barsHtml = '';
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];
        const tooltipText = esc(bar.session.title) + ' &middot; ' + bar.session.messageCount + ' msgs';
        barsHtml += `
          <div class="timeline-span-bar status-${bar.status}"
               data-session-id="${bar.session.sessionId}"
               data-dir="${esc(project.dirName)}"
               style="left:${bar.leftPct.toFixed(2)}%;width:${bar.widthPct.toFixed(2)}%;top:${i * 26 + 3}px;"
               title="${tooltipText}">
            ${esc(bar.session.title)}
          </div>`;
      }

      rows += `
        <tr data-dir="${esc(project.dirName)}">
          <td class="timeline-project-label" title="${esc(project.projectPath)}">${esc(project.projectName)}</td>
          <td colspan="${weeks.length}" class="timeline-cell" style="position:relative;height:${rowHeight}px;${bgGradient}">
            ${barsHtml}
          </td>
        </tr>`;
    }

    const html = `
      <div class="timeline">
        <table class="timeline-table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    board.innerHTML = html;

    // Click handler for timeline bars
    board.querySelector('.timeline-table').addEventListener('click', (e) => {
      const bar = e.target.closest('.timeline-span-bar');
      if (!bar) return;
      const sid = bar.dataset.sessionId;
      const dirName = bar.dataset.dir;
      const project = data.projects.find(p => p.dirName === dirName);
      if (!project) return;
      const session = project.sessions.find(s => s.sessionId === sid);
      if (session) openPanel(dirName, session);
    });
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ── Poll ──────────────────────────────────────────────
  const pulse = document.getElementById('pulse');

  async function poll() {
    pulse.classList.add('fetching');
    try {
      const res = await fetch('/api/sessions');
      const json = await res.text();
      pulse.classList.remove('disconnected');
      if (json !== lastJson) {
        lastJson = json;
        lastData = JSON.parse(json);
        dispatchRender();
      }
    } catch (err) {
      pulse.classList.add('disconnected');
      console.error('Poll failed:', err);
    } finally {
      setTimeout(() => pulse.classList.remove('fetching'), 300);
    }
  }

  poll();
  setInterval(poll, 1000);

  // Live reload: check if static files changed
  setInterval(async () => {
    try {
      const res = await fetch('/api/livereload');
      const data = await res.json();
      if (data.reload) location.reload();
    } catch {}
  }, 2000);
})();
