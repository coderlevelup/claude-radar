<script>
  import { sessions } from '../stores/sessions.svelte.js';
  import { ui } from '../stores/ui.svelte.js';
  import { getWeekStart, getISOWeek, formatTimelineWeekHeader } from '../utils/time.js';

  // Collect all sessions with project metadata
  let allSessions = $derived.by(() => {
    const all = [];
    for (const project of sessions.data.projects) {
      for (const s of project.sessions) {
        all.push({ ...s, dirName: project.dirName, projectName: project.projectName });
      }
    }
    return all;
  });

  // Compute date range and week columns
  let timelineData = $derived.by(() => {
    if (allSessions.length === 0) return null;

    let earliest = Infinity, latest = -Infinity;
    for (const s of allSessions) {
      const created = new Date(s.created).getTime();
      const modified = new Date(s.modified).getTime();
      if (created < earliest) earliest = created;
      if (modified > latest) latest = modified;
    }
    const now = Date.now();
    if (now > latest) latest = now;

    // Build week columns
    const weeks = [];
    let ws = getWeekStart(new Date(earliest));
    const endWs = getWeekStart(new Date(latest));
    while (ws <= endWs) {
      weeks.push(new Date(ws));
      ws = new Date(ws);
      ws.setDate(ws.getDate() + 7);
    }
    weeks.reverse();

    const currentWeekStart = getWeekStart(new Date()).getTime();

    const timelineOldest = weeks[weeks.length - 1].getTime();
    const timelineNewest = new Date(weeks[0]);
    timelineNewest.setDate(timelineNewest.getDate() + 7);
    const totalMs = timelineNewest.getTime() - timelineOldest;
    const colWidthPct = 100 / weeks.length;

    return { weeks, currentWeekStart, timelineNewest, totalMs, colWidthPct };
  });

  function getBarStyle(session) {
    if (!timelineData) return '';
    const { timelineNewest, totalMs } = timelineData;
    const cTime = new Date(session.created).getTime();
    const mTime = new Date(session.modified).getTime();
    const widthPct = Math.max(((mTime - cTime) / totalMs) * 100, 0.5);
    const leftPct = ((timelineNewest.getTime() - mTime) / totalMs) * 100;
    return `left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%`;
  }

  function getGradient(project) {
    if (!timelineData) return '';
    const { weeks, colWidthPct } = timelineData;
    const stops = [];
    for (let i = 1; i < weeks.length; i++) {
      const posBefore = Math.max(colWidthPct * i - 0.08, 0).toFixed(2);
      const pos = (colWidthPct * i).toFixed(2);
      stops.push(`transparent ${posBefore}%, var(--border-subtle) ${posBefore}%, var(--border-subtle) ${pos}%, transparent ${pos}%`);
    }
    return stops.length ? `background-image: linear-gradient(to right, ${stops.join(', ')});` : '';
  }

  function handleBarClick(dirName, sessionId) {
    const project = sessions.data.projects.find(p => p.dirName === dirName);
    if (!project) return;
    const session = project.sessions.find(s => s.sessionId === sessionId);
    if (session) ui.openPanel(dirName, session);
  }
</script>

{#if !timelineData}
  <div class="empty-col" style="padding:40px">No sessions</div>
{:else}
  <div class="timeline">
    <table class="timeline-table">
      <thead>
        <tr>
          <th class="timeline-project-label" style="background:var(--surface)">Project</th>
          {#each timelineData.weeks as w}
            <th
              class="timeline-header-cell"
              class:current-week={w.getTime() === timelineData.currentWeekStart}
            >{formatTimelineWeekHeader(w)}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each sessions.data.projects as project}
          {#if project.sessions.length > 0}
            {@const bars = project.sessions
              .map(s => ({
                session: s,
                style: getBarStyle(s),
                status: s.status || 'idle',
              }))
              .sort((a, b) => {
                const aLeft = parseFloat(a.style.match(/left:([\d.]+)/)?.[1] || '0');
                const bLeft = parseFloat(b.style.match(/left:([\d.]+)/)?.[1] || '0');
                return aLeft - bLeft;
              })
            }
            <tr>
              <td class="timeline-project-label" title={project.projectPath}>{project.projectName}</td>
              <td
                colspan={timelineData.weeks.length}
                class="timeline-cell"
                style="position:relative;height:{Math.max(bars.length * 26 + 6, 40)}px;{getGradient(project)}"
              >
                {#each bars as bar, i}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="timeline-span-bar status-{bar.status}"
                    style="{bar.style};top:{i * 26 + 3}px;"
                    title="{bar.session.title} &middot; {bar.session.messageCount} msgs"
                    onclick={() => handleBarClick(project.dirName, bar.session.sessionId)}
                  >
                    {bar.session.title}
                  </div>
                {/each}
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
{/if}
