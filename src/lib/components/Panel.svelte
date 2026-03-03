<script>
  import { ui } from '../stores/ui.svelte.js';
  import { fetchSession } from '../utils/api.js';
  import { onMount } from 'svelte';

  let messages = $state(null);
  let loading = $state(false);
  let loadError = $state(false);
  let showLink = $state(true);

  // Reset state when session changes
  $effect(() => {
    if (ui.panelSession) {
      messages = null;
      loading = false;
      loadError = false;
      showLink = true;
    }
  });

  // Close on Escape
  onMount(() => {
    function handleKey(e) {
      if (e.key === 'Escape') ui.closePanel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  async function loadMessages() {
    if (!ui.panelSession) return;
    showLink = false;
    loading = true;
    loadError = false;
    try {
      const data = await fetchSession(ui.panelDirName, ui.panelSession.sessionId);
      messages = data.messages || [];
    } catch {
      loadError = true;
    } finally {
      loading = false;
    }
  }

  function escAndFormat(text) {
    let s = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    s = s.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre>$2</pre>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }

  let session = $derived(ui.panelSession);
  let messagesEl;

  // Scroll to bottom when messages load
  $effect(() => {
    if (messages && messagesEl) {
      requestAnimationFrame(() => {
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      });
    }
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="panel-overlay"
  class:hidden={!ui.panelOpen}
  onclick={() => ui.closePanel()}
></div>

<aside class="panel" class:open={ui.panelOpen} class:hidden={!ui.panelOpen}>
  {#if session}
    <div class="panel-header">
      <div class="panel-title-row">
        <h2 class="panel-title">{session.title}</h2>
        <button class="panel-close" onclick={() => ui.closePanel()}>&times;</button>
      </div>
      <div class="panel-meta">
        <span class="badge badge-messages">{session.messageCount} msgs</span>
        {#if session.gitBranch}
          <span class="badge badge-branch">{session.gitBranch}</span>
        {/if}
      </div>
      {#if session.blurb}
        <div class="panel-blurb">{session.blurb}</div>
      {/if}
    </div>

    <div class="panel-messages" bind:this={messagesEl}>
      {#if showLink}
        <button class="panel-view-link" onclick={loadMessages}>
          View full session
        </button>
      {/if}

      {#if loading}
        <div class="panel-loading">Loading...</div>
      {:else if loadError}
        <div class="panel-loading">Failed to load session</div>
      {:else if messages !== null}
        {#if messages.length === 0}
          <div class="panel-loading">No messages in this session</div>
        {:else}
          {#each messages as msg}
            <div class="msg msg-{msg.role}">
              <span class="msg-role">{msg.role === 'assistant' ? 'Claude' : 'David'}</span>
              {#each msg.parts as part}
                {#if part.type === 'text'}
                  <div class="msg-text">{@html escAndFormat(part.text)}</div>
                {:else if part.type === 'tool_use'}
                  <span class="msg-tool">{part.name}</span>
                {:else if part.type === 'tool_result'}
                  <div class="msg-tool-result">{part.text}</div>
                {/if}
              {/each}
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  {/if}
</aside>

<style>
  .panel-view-link {
    display: block;
    text-align: center;
    color: var(--accent);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 16px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.15s;
  }
  .panel-view-link:hover {
    background: var(--surface-hover);
  }
  .panel-blurb {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 8px;
    line-height: 1.5;
  }
</style>
