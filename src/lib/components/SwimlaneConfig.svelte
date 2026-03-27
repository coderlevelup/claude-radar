<script>
  import { saveSwimlaneConfig } from '../utils/api.js';

  let { project, onclose } = $props();

  let name = $state(project.projectName || '');
  let valkeyUrl = $state(project.valkeyUrl || '');
  let valkeyPassword = $state('');
  let saving = $state(false);
  let saved = $state(false);
  let error = $state('');
  let connected = $state(project.valkeyConnected);

  async function save(e) {
    e.stopPropagation();
    saving = true;
    error = '';
    try {
      const payload = { name: name.trim() || undefined, valkeyUrl: valkeyUrl.trim() };
      if (valkeyPassword) payload.valkeyPassword = valkeyPassword;
      else if (project.valkeyConfigured && !valkeyPassword) payload.valkeyPassword = undefined; // don't touch
      const result = await saveSwimlaneConfig(project.swimlaneKey, payload);
      if (result.error) { error = result.error; }
      else { saved = true; connected = result.valkeyConnected; setTimeout(() => saved = false, 2000); }
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  function stopProp(e) { e.stopPropagation(); }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="swimlane-config" onclick={stopProp}>
  <div class="swimlane-config-row">
    <label class="swimlane-config-label">Name</label>
    <input
      class="swimlane-config-input"
      type="text"
      bind:value={name}
      placeholder={project.projectName}
      onclick={stopProp}
    />
  </div>

  <div class="swimlane-config-row">
    <label class="swimlane-config-label">Valkey URL</label>
    <input
      class="swimlane-config-input"
      type="text"
      bind:value={valkeyUrl}
      placeholder="redis://host:6379"
      onclick={stopProp}
    />
  </div>

  {#if valkeyUrl}
    <div class="swimlane-config-row">
      <label class="swimlane-config-label">Password</label>
      <input
        class="swimlane-config-input"
        type="password"
        bind:value={valkeyPassword}
        placeholder={project.valkeyConfigured ? '(unchanged)' : 'optional'}
        onclick={stopProp}
      />
    </div>
  {/if}

  <div class="swimlane-config-footer">
    {#if error}
      <span class="swimlane-config-error">{error}</span>
    {:else if saved}
      <span class="swimlane-config-ok">{connected ? '● connected' : '● saved'}</span>
    {:else if valkeyUrl && connected}
      <span class="swimlane-config-status connected">● connected</span>
    {:else if valkeyUrl}
      <span class="swimlane-config-status">○ not connected</span>
    {:else}
      <span></span>
    {/if}
    <button class="swimlane-config-save" onclick={save} disabled={saving}>
      {saving ? 'Saving…' : 'Save'}
    </button>
  </div>
</div>
