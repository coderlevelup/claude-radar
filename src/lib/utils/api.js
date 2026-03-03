export async function fetchSessions() {
  const res = await fetch('/api/sessions');
  return res.json();
}

export async function fetchSession(dirName, sessionId) {
  const res = await fetch(`/api/session/${encodeURIComponent(dirName)}/${encodeURIComponent(sessionId)}`);
  return res.json();
}

export async function fetchRecent(dirName, sessionId) {
  const res = await fetch(`/api/session/${encodeURIComponent(dirName)}/${encodeURIComponent(sessionId)}/recent`);
  return res.json();
}
