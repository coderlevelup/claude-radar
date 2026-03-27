<script>
  import { fetchRecent } from '../utils/api.js';
  import { ui } from '../stores/ui.svelte.js';
  import { escAndFormat } from '../utils/sanitize.js';

  let { dirName, sessionId, status, session } = $props();

  let messages = $state([]);
  let loading = $state(true);
  let threadEl;

  // Auto-fetch when visible, and re-fetch when status changes (for live sessions)
  $effect(() => {
    // Reference status to re-run when it changes
    void status;
    let cancelled = false;

    fetchRecent(dirName, sessionId).then(data => {
      if (cancelled) return;
      messages = data.messages || [];
      loading = false;
    }).catch(() => {
      if (!cancelled) loading = false;
    });

    return () => { cancelled = true; };
  });

  // Auto-refresh for working sessions
  $effect(() => {
    if (status !== 'working') return;
    const interval = setInterval(async () => {
      try {
        const data = await fetchRecent(dirName, sessionId);
        messages = data.messages || [];
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  });

  // Scroll to bottom when messages update
  $effect(() => {
    if (threadEl && messages.length) {
      // Check if near bottom before updating
      const wasAtBottom = threadEl.scrollTop + threadEl.clientHeight >= threadEl.scrollHeight - 10;
      // Use tick-like delay to let DOM update
      requestAnimationFrame(() => {
        if (wasAtBottom && threadEl) threadEl.scrollTop = threadEl.scrollHeight;
      });
    }
  });


</script>

{#if loading}
  <div class="card-thread">
    <div class="thread-loading">Loading...</div>
  </div>
{:else if messages.length > 0}
  <div class="card-thread" bind:this={threadEl}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="thread-more" onclick={(e) => { e.stopPropagation(); ui.openPanel(dirName, session); }}>
      &hellip; <span class="thread-more-link">view full session</span>
    </div>
    {#each messages as msg}
      <div class="thread-msg thread-{msg.role === 'assistant' ? 'claude' : 'user'}">
        {#each msg.parts as part}
          {#if part.type === 'text'}
            <div class="thread-text">{@html escAndFormat(part.text)}</div>
          {:else if part.type === 'tool_use'}
            <span class="thread-tool">{part.name}</span>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
{/if}
