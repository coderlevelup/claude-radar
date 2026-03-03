export function relativeTime(iso) {
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

export function timeColumn(session) {
  const now = new Date();
  const ts = new Date(session.modified);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  if (ts >= startOfToday) return 'today';
  if (ts >= startOfWeek) return 'week';
  return 'older';
}

export function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function formatWeekLabel(date) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `Week of ${months[date.getMonth()]} ${date.getDate()}`;
}

export function formatTimelineWeekHeader(date) {
  const wk = getISOWeek(date);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `W${String(wk).padStart(2, '0')} \u00b7 ${months[date.getMonth()]} ${date.getDate()}`;
}

export function groupOlderByWeek(sessions) {
  const weekMap = new Map();
  for (const s of sessions) {
    const ts = new Date(s.modified);
    const ws = getWeekStart(ts);
    const key = ws.toISOString();
    if (!weekMap.has(key)) {
      weekMap.set(key, { label: formatWeekLabel(ws), weekStart: ws, sessions: [] });
    }
    weekMap.get(key).sessions.push(s);
  }
  const weeks = Array.from(weekMap.values());
  weeks.sort((a, b) => b.weekStart - a.weekStart);
  for (const w of weeks) {
    w.sessions.sort((a, b) => new Date(b.created) - new Date(a.created));
  }
  return weeks;
}
