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

// push: [{ url, password?, swimlane }] | null to clear all targets
export async function saveSwimlaneConfig(swimlaneKey, { name, push } = {}) {
  const body = { swimlaneKey };
  if (name !== undefined) body.name = name;
  if (push !== undefined) body.push = push;
  const res = await fetch('/api/swimlane-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function focusTerminal(projectName, title) {
  try {
    const res = await fetch('/api/focus-terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, title }),
    });
    return await res.json();
  } catch {
    return { found: false };
  }
}
