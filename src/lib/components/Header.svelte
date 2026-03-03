<script>
  import { sessions, startPolling } from '../stores/sessions.svelte.js';
  import { ui } from '../stores/ui.svelte.js';
  import { mount, unmount } from 'svelte';
  import { onMount } from 'svelte';
  import PipView from './PipView.svelte';

  let pipSupported = $state(false);
  let pipActive = $state(false);
  let pipInstance = null;

  onMount(() => {
    startPolling();
    pipSupported = 'documentPictureInPicture' in window;
  });

  async function togglePip() {
    if (pipActive) {
      // Close the existing PiP window
      try { documentPictureInPicture.window?.close(); } catch {}
      return;
    }

    try {
      const pipWindow = await documentPictureInPicture.requestWindow({
        width: 380,
        height: 500,
      });

      // Copy stylesheets into PiP window
      for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        pipWindow.document.head.appendChild(link.cloneNode(true));
      }
      for (const style of document.querySelectorAll('style')) {
        pipWindow.document.head.appendChild(style.cloneNode(true));
      }

      // Set body class for PiP-specific styles
      pipWindow.document.body.classList.add('pip-body');

      // Mount PipView into the PiP window
      pipInstance = mount(PipView, { target: pipWindow.document.body });
      pipActive = true;

      // Clean up on PiP close
      pipWindow.addEventListener('pagehide', () => {
        if (pipInstance) {
          try { unmount(pipInstance); } catch {}
          pipInstance = null;
        }
        pipActive = false;
      });
    } catch (e) {
      console.warn('PiP failed:', e);
    }
  }
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
    {#if pipSupported}
      <button
        class="pip-btn"
        class:active={pipActive}
        onclick={togglePip}
        title={pipActive ? 'Close Picture-in-Picture' : 'Open Picture-in-Picture'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="2" width="14" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none"/>
          <rect x="8" y="7" width="6" height="5" rx="1" fill="currentColor"/>
        </svg>
      </button>
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
