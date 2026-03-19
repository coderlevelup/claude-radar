<script>
  import Card from './Card.svelte';

  let { label, sessions = [], dirName, projectName = '', projectPath = '' } = $props();
</script>

<div class="column">
  <div class="column-header">
    <span class="column-label">{label}</span>
    <span class="column-count">{sessions.length}</span>
  </div>
  {#if sessions.length === 0}
    <div class="empty-col">No sessions</div>
  {:else}
    {#each sessions as session (session.sessionId)}
      <Card {session} {dirName} {projectName} {projectPath} />
    {/each}
  {/if}
</div>
