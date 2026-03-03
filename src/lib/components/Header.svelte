<script>
  import { sessions, startPolling } from '../stores/sessions.svelte.js';
  import { ui } from '../stores/ui.svelte.js';
  import { onMount } from 'svelte';

  onMount(() => {
    startPolling();
  });
</script>

<header>
  <div class="header-left">
    <h1>Claude Kanban</h1>
  </div>
  <div class="header-right">
    <div class="view-toggle">
      <button
        class="view-btn"
        class:active={ui.currentView === 'board'}
        onclick={() => ui.currentView = 'board'}
      >Board</button>
      <button
        class="view-btn"
        class:active={ui.currentView === 'timeline'}
        onclick={() => ui.currentView = 'timeline'}
      >Timeline</button>
    </div>
    {#if ui.currentView === 'board'}
      <label class="older-toggle">
        <input type="checkbox" bind:checked={ui.showOlder}> Show older
      </label>
    {/if}
    <span class="stats">
      {sessions.data.totalProjects} projects &middot; {sessions.data.totalSessions} sessions
    </span>
    <span
      class="pulse"
      class:fetching={sessions.fetching}
      class:disconnected={!sessions.connected}
      title="Live"
    ></span>
  </div>
</header>
