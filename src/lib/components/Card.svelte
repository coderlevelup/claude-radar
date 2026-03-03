<script>
  import { relativeTime } from '../utils/time.js';
  import { ui } from '../stores/ui.svelte.js';
  import CardThread from './CardThread.svelte';

  let { session, dirName } = $props();

  const statusLabels = {
    working: '\u25cf working',
    waiting: '\u25cf waiting',
    idle: '\u00b7 idle',
  };

  let expanded = $derived(ui.expandedSessionId === session.sessionId);

  function toggle(e) {
    e.stopPropagation();
    if (expanded) {
      ui.expandedSessionId = null;
    } else {
      ui.expandedSessionId = session.sessionId;
    }
  }

  let statusKey = $derived(session.status || 'idle');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="card"
  class:expanded
  data-status={statusKey}
  onclick={toggle}
>
  <div class="card-title">{session.title}</div>

  {#if session.blurb && !expanded}
    <div class="card-blurb">{session.blurb}</div>
  {/if}

  {#if expanded}
    <div class="card-expanded">
      {#if session.blurb}
        <div class="card-blurb-full">{session.blurb}</div>
      {/if}
      <CardThread {dirName} {session} sessionId={session.sessionId} status={statusKey} />
    </div>
  {/if}

  <div class="card-footer">
    <div class="card-badges">
      <span class="badge badge-status-{statusKey}">{statusLabels[statusKey] || statusLabels.idle}</span>
      <span class="badge badge-messages">{session.messageCount} msgs</span>
      {#if session.gitBranch}
        <span class="badge badge-branch" title={session.gitBranch}>{session.gitBranch}</span>
      {/if}
      {#if session.isSidechain}
        <span class="badge badge-sidechain">sidechain</span>
      {/if}
    </div>
    <div class="card-time">
      <span data-label="active ">{relativeTime(session.modified)}</span>
      <span data-label="created ">{relativeTime(session.created)}</span>
    </div>
  </div>
</div>
