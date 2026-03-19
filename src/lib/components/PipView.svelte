<script>
  import Card from './Card.svelte';
  import { sessions } from '../stores/sessions.svelte.js';
  import { ui } from '../stores/ui.svelte.js';
  import { timeColumn } from '../utils/time.js';

  // Show working/waiting sessions + today's idle sessions, grouped by project
  // Exclude dismissed sessions (unless they have new activity)
  let groups = $derived.by(() => {
    const projects = sessions.data.projects;
    if (!projects) return [];

    const result = [];
    for (const p of projects) {
      const visible = p.sessions.filter(s => {
        if (s.status !== 'working' && s.status !== 'waiting') {
          if (!(s.status === 'idle' && timeColumn(s) === 'today')) return false;
        }
        if (ui.isDismissed(s.sessionId, s.modified)) return false;
        return true;
      });
      if (visible.length > 0) {
        // Sort: working first, then waiting, then idle
        const order = { working: 0, waiting: 1, idle: 2 };
        visible.sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
        result.push({ dirName: p.dirName, name: p.projectName, projectPath: p.projectPath, sessions: visible });
      }
    }
    return result;
  });

  let empty = $derived(groups.length === 0);

  function dismiss(e, sessionId, modified) {
    e.stopPropagation();
    ui.dismissSession(sessionId, modified);
  }
</script>

<div class="pip-container">
  {#if empty}
    <div class="pip-empty">No active sessions</div>
  {:else}
    {#each groups as group (group.dirName)}
      <div class="pip-group">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="pip-group-label" onclick={() => ui.togglePipCollapsed(group.dirName)}>
          <span class="pip-chevron" class:collapsed={ui.isPipCollapsed(group.dirName)}>&#9660;</span>
          <span>{group.name}</span>
          <span class="pip-group-count">{group.sessions.length}</span>
        </div>
        {#if !ui.isPipCollapsed(group.dirName)}
          {#each group.sessions as session (session.sessionId)}
            <div class="pip-card-wrap">
              <Card {session} dirName={group.dirName} projectName={group.name} projectPath={group.projectPath} />
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="pip-dismiss" onclick={(e) => dismiss(e, session.sessionId, session.modified)} title="Dismiss">&times;</div>
            </div>
          {/each}
        {/if}
      </div>
    {/each}
  {/if}
</div>
