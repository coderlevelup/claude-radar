import { fetchSessions } from '../utils/api.js';

let data = $state({ totalProjects: 0, totalSessions: 0, projects: [] });
let connected = $state(true);
let fetching = $state(false);
let lastJson = '';
let intervalId = null;

// Track most-recent timestamps for activity detection
const lastMostRecent = new Map();

async function poll() {
  fetching = true;
  try {
    const res = await fetch('/api/sessions');
    const json = await res.text();
    connected = true;
    if (json !== lastJson) {
      lastJson = json;
      data = JSON.parse(json);
    }
  } catch {
    connected = false;
  } finally {
    // Clear fetching after a brief delay for the pulse animation
    setTimeout(() => { fetching = false; }, 300);
  }
}

export function startPolling() {
  if (intervalId) return;
  poll();
  intervalId = setInterval(poll, 1000);
}

export function stopPolling() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export const sessions = {
  get data() { return data; },
  get connected() { return connected; },
  get fetching() { return fetching; },
  get lastMostRecent() { return lastMostRecent; },
};
