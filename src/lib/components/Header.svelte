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
      ui.mainWindow = window;

      // Auto-resize PiP window to fit content
      const PIP_WIDTH = 380;
      const PIP_MIN_H = 120;
      const PIP_MAX_H = screen.availHeight;
      const contentEl = pipWindow.document.querySelector('.pip-container');
      const resizeObserver = new ResizeObserver(() => {
        if (!contentEl) return;
        const contentH = contentEl.scrollHeight;
        const chrome = pipWindow.outerHeight - pipWindow.innerHeight;
        const targetH = Math.min(PIP_MAX_H, Math.max(PIP_MIN_H, contentH + chrome));
        if (Math.abs(pipWindow.outerHeight - targetH) > 4) {
          pipWindow.resizeTo(PIP_WIDTH, targetH);
        }
      });
      resizeObserver.observe(contentEl);

      // Clean up on PiP close
      pipWindow.addEventListener('pagehide', () => {
        resizeObserver.disconnect();
        if (pipInstance) {
          try { unmount(pipInstance); } catch {}
          pipInstance = null;
        }
        pipActive = false;
        ui.mainWindow = null;
      });
    } catch (e) {
      console.warn('PiP failed:', e);
    }
  }
</script>

<header>
  <div class="header-left">
    <h1><svg class="header-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.07,4.93L17.66,6.34C19.1,7.79 20,9.79 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12C4,7.92 7.05,4.56 11,4.07V6.09C8.16,6.57 6,9.03 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12C18,10.34 17.33,8.84 16.24,7.76L14.83,9.17C15.55,9.9 16,10.9 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12C8,10.14 9.28,8.59 11,8.14V10.28C10.4,10.63 10,11.26 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12C14,11.26 13.6,10.62 13,10.28V2H12A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,9.24 20.88,6.74 19.07,4.93Z"/></svg> Claude Radar</h1>
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
    {#if ui.currentView === 'board'}
      <button
        class="pip-btn"
        onclick={() => ui.resetOrder()}
        title="Reset swimlane order to default"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="3" width="12" height="1.5" rx="0.75"/>
          <rect x="2" y="7.25" width="8" height="1.5" rx="0.75"/>
          <rect x="2" y="11.5" width="5" height="1.5" rx="0.75"/>
        </svg>
      </button>
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
