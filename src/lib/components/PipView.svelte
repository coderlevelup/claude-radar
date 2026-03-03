<script>
  import Card from './Card.svelte';
  import { sessions } from '../stores/sessions.svelte.js';
  import { timeColumn } from '../utils/time.js';

  // Show working/waiting sessions + today's idle sessions, grouped by project
  let groups = $derived.by(() => {
    const projects = sessions.data.projects;
    if (!projects) return [];

    const result = [];
    for (const p of projects) {
      const visible = p.sessions.filter(s => {
        if (s.status === 'working' || s.status === 'waiting') return true;
        if (s.status === 'idle' && timeColumn(s) === 'today') return true;
        return false;
      });
      if (visible.length > 0) {
        // Sort: working first, then waiting, then idle
        const order = { working: 0, waiting: 1, idle: 2 };
        visible.sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
        result.push({ dirName: p.dirName, name: p.projectName, sessions: visible });
      }
    }
    return result;
  });

  let empty = $derived(groups.length === 0);
</script>

<div class="pip-container">
  {#if empty}
    <div class="pip-empty">No active sessions</div>
  {:else}
    {#each groups as group (group.dirName)}
      <div class="pip-group">
        <div class="pip-group-label">{group.name}</div>
        {#each group.sessions as session (session.sessionId)}
          <Card {session} dirName={group.dirName} />
        {/each}
      </div>
    {/each}
  {/if}
</div>
