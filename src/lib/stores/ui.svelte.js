import { untrack } from 'svelte';

const STORAGE_ORDER = 'radar-project-order';
const STORAGE_COLLAPSED = 'radar-collapsed';
const STORAGE_VIEW = 'radar-view';
const STORAGE_OLDER = 'radar-show-older';

let expandedSessionId = $state(null);
let projectOrder = $state(JSON.parse(localStorage.getItem(STORAGE_ORDER) || '[]'));
let collapsed = $state(new Set(JSON.parse(localStorage.getItem(STORAGE_COLLAPSED) || '[]')));
let showOlder = $state(localStorage.getItem(STORAGE_OLDER) === 'true');
let currentView = $state(localStorage.getItem(STORAGE_VIEW) || 'board');

// Panel state
let panelOpen = $state(false);
let panelSession = $state(null);
let panelDirName = $state('');

// Reference to main window (set when PiP is active)
let mainWindow = null;

// PiP-only state (transient, no localStorage)
let pipCollapsed = $state(new Set());
let pipDismissed = $state(new Map()); // sessionId → modified timestamp at dismissal

// Persist to localStorage reactively
$effect.root(() => {
  $effect(() => {
    localStorage.setItem(STORAGE_ORDER, JSON.stringify(projectOrder));
  });
  $effect(() => {
    localStorage.setItem(STORAGE_COLLAPSED, JSON.stringify([...collapsed]));
  });
  $effect(() => {
    localStorage.setItem(STORAGE_VIEW, currentView);
  });
  $effect(() => {
    localStorage.setItem(STORAGE_OLDER, String(showOlder));
  });
});

export const ui = {
  get expandedSessionId() { return expandedSessionId; },
  set expandedSessionId(v) { expandedSessionId = v; },

  get projectOrder() { return projectOrder; },
  set projectOrder(v) { projectOrder = v; },

  get collapsed() { return collapsed; },
  set collapsed(v) { collapsed = v; },

  get showOlder() { return showOlder; },
  set showOlder(v) { showOlder = v; },

  get currentView() { return currentView; },
  set currentView(v) { currentView = v; },

  get panelOpen() { return panelOpen; },
  set panelOpen(v) { panelOpen = v; },

  get panelSession() { return panelSession; },
  set panelSession(v) { panelSession = v; },

  get panelDirName() { return panelDirName; },
  set panelDirName(v) { panelDirName = v; },

  toggleCollapsed(dirName) {
    const next = new Set(collapsed);
    if (next.has(dirName)) next.delete(dirName); else next.add(dirName);
    collapsed = next;
  },

  isCollapsed(dirName) {
    return collapsed.has(dirName);
  },

  get mainWindow() { return mainWindow; },
  set mainWindow(v) { mainWindow = v; },

  togglePipCollapsed(dirName) {
    const next = new Set(pipCollapsed);
    if (next.has(dirName)) next.delete(dirName); else next.add(dirName);
    pipCollapsed = next;
  },

  isPipCollapsed(dirName) {
    return pipCollapsed.has(dirName);
  },

  dismissSession(sessionId, modified) {
    const next = new Map(pipDismissed);
    next.set(sessionId, modified);
    pipDismissed = next;
  },

  isDismissed(sessionId, modified) {
    if (!pipDismissed.has(sessionId)) return false;
    return pipDismissed.get(sessionId) === modified;
  },

  openPanel(dirName, session) {
    panelDirName = dirName;
    panelSession = session;
    panelOpen = true;
    // If called from PiP, bring main window to front
    if (mainWindow) mainWindow.focus();
  },

  closePanel() {
    panelOpen = false;
  },

  sortProjects(projects) {
    // Read order without tracking to avoid circular dependency in $effect
    const order = untrack(() => projectOrder);
    const orderIndex = new Map();
    order.forEach((dir, i) => orderIndex.set(dir, i));

    const known = [];
    const unknown = [];
    for (const p of projects) {
      if (orderIndex.has(p.dirName)) known.push(p);
      else unknown.push(p);
    }
    known.sort((a, b) => orderIndex.get(a.dirName) - orderIndex.get(b.dirName));
    unknown.sort((a, b) => (b.mostRecent > a.mostRecent ? 1 : b.mostRecent < a.mostRecent ? -1 : 0));

    const sorted = [...unknown, ...known];
    const newOrder = sorted.map(p => p.dirName);
    // Defer the write to avoid mutating state during $effect
    queueMicrotask(() => { projectOrder = newOrder; });
    return sorted;
  },

  reorder(fromDir, toDir) {
    const order = [...projectOrder];
    const fromIdx = order.indexOf(fromDir);
    const toIdx = order.indexOf(toDir);
    if (fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, fromDir);
    projectOrder = order;
  },
};
