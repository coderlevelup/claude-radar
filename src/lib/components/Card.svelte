<script>
  import { relativeTime } from '../utils/time.js';
  import { ui } from '../stores/ui.svelte.js';
  import { sessions } from '../stores/sessions.svelte.js';
  import { focusTerminal } from '../utils/api.js';
  import CardThread from './CardThread.svelte';

  let { session, dirName: dirNameProp, projectName = '', projectPath = '' } = $props();
  let dirName = $derived(session.dirName || dirNameProp);
  let isLocalSession = $derived(!session.username || session.username === sessions.currentUsername);

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
  let resumeHint = $state(null);

  async function handleFocus(e) {
    e.stopPropagation();
    const { found } = await focusTerminal(projectName, session.title);
    if (!found) {
      resumeHint = { path: projectPath, sessionId: session.sessionId };
    }
  }

  function closeHint(e) {
    e.stopPropagation();
    resumeHint = null;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="card"
  class:expanded
  data-status={statusKey}
  onclick={toggle}
>
  <div class="card-body">
    {#if session.avatarUrl}
      <div class="card-avatar-col">
        <img src={session.avatarUrl} alt="" class="card-avatar" onerror="this.style.display='none'" />
      </div>
    {/if}

    <div class="card-content">
      <div class="card-header">
        <div class="card-header-left">
          {#if session.username}
            <span class="card-username">@{session.username}</span>
          {/if}
          <span class="card-time-inline">{relativeTime(session.modified)}</span>
        </div>
        {#if isLocalSession}
          <button class="card-focus-btn" onclick={handleFocus} title="Focus terminal">&gt;_</button>
        {/if}
      </div>

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
        <span class="badge badge-status-{statusKey}">{statusLabels[statusKey] || statusLabels.idle}</span>
        <span class="badge badge-messages">{session.messageCount} msgs</span>
        {#if session.gitBranch}
          <span class="badge badge-branch" title={session.gitBranch}>{session.gitBranch}</span>
        {/if}
        {#if session.isSidechain}
          <span class="badge badge-sidechain">sidechain</span>
        {/if}
      </div>
    </div>
  </div>

  {#if resumeHint && isLocalSession}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="card-resume-hint" onclick={(e) => e.stopPropagation()}>
      <div class="card-resume-hint-header">
        <span>No terminal found. Resume with:</span>
        <button class="card-resume-hint-close" onclick={closeHint}>&times;</button>
      </div>
      <code class="card-resume-hint-cmd">cd {resumeHint.path}</code>
      <code class="card-resume-hint-cmd">claude -r {resumeHint.sessionId}</code>
    </div>
  {/if}
</div>
