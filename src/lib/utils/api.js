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

export async function saveSwimlaneConfig(swimlaneKey, { name, valkeyUrl, valkeyPassword } = {}) {
  const body = { swimlaneKey };
  if (name !== undefined) body.name = name;
  if (valkeyUrl !== undefined) body.valkeyUrl = valkeyUrl;
  if (valkeyPassword !== undefined) body.valkeyPassword = valkeyPassword;
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
