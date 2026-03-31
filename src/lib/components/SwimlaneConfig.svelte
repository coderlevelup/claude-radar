<script>
  import { saveSwimlaneConfig } from '../utils/api.js';

  let { project } = $props();

  let name = $state(project.projectName || '');
  let nameError = $state('');
  let nameSaving = $state(false);

  let slug = $state(project.slug || '');
  let slugDirty = $state(false);

  // Push targets list — initialised from project.valkeyPush
  let targets = $state((project.valkeyPush || []).map(t => ({ ...t })));

  // Add-target form
  let addUrl = $state('');
  let addSwimlane = $state('');
  let addPassword = $state('');
  let addError = $state('');
  let addSaving = $state(false);

  function stopProp(e) { e.stopPropagation(); }

  async function saveName(e) {
    e.stopPropagation();
    if (!name.trim()) return;
    nameSaving = true;
    nameError = '';
    try {
      const body = { name: name.trim() };
      if (slugDirty) body.slug = slug.trim() || null;
      const r = await saveSwimlaneConfig(project.swimlaneKey, body);
      if (r.error) nameError = r.error;
      else slugDirty = false;
    } catch (err) { nameError = err.message; }
    finally { nameSaving = false; }
  }

  async function addTarget(e) {
    e.stopPropagation();
    if (!addUrl.trim()) return;
    addSaving = true;
    addError = '';
    try {
      const newTargets = [
        ...targets.map(t => ({ url: t.url, swimlane: t.swimlane })),
        { url: addUrl.trim(), swimlane: addSwimlane.trim() || 'default', ...(addPassword ? { password: addPassword } : {}) },
      ];
      const r = await saveSwimlaneConfig(project.swimlaneKey, { push: newTargets });
      if (r.error) { addError = r.error; return; }
      targets = r.valkeyPush || newTargets.map(t => ({ ...t, connected: false }));
      addUrl = '';
      addSwimlane = '';
      addPassword = '';
    } catch (err) { addError = err.message; }
    finally { addSaving = false; }
  }

  async function removeTarget(e, idx) {
    e.stopPropagation();
    const newTargets = targets.filter((_, i) => i !== idx).map(t => ({ url: t.url, swimlane: t.swimlane }));
    try {
      const r = await saveSwimlaneConfig(project.swimlaneKey, { push: newTargets });
      if (!r.error) targets = r.valkeyPush || newTargets.map(t => ({ ...t, connected: false }));
    } catch {}
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="swimlane-config" onclick={stopProp}>

  <!-- Name row -->
  <div class="swimlane-config-row">
    <label class="swimlane-config-label">Name</label>
    <input class="swimlane-config-input" type="text" bind:value={name}
      placeholder={project.projectName} onclick={stopProp} />
    <button class="swimlane-config-btn" onclick={saveName} disabled={nameSaving}>
      {nameSaving ? '…' : 'Save'}
    </button>
  </div>
  <!-- Slug row -->
  <div class="swimlane-config-row">
    <label class="swimlane-config-label">Slug</label>
    <input class="swimlane-config-input" type="text" bind:value={slug}
      placeholder={project.slug || '(auto)'}
      oninput={() => slugDirty = true}
      onclick={stopProp} />
    {#if !slugDirty}<span class="swimlane-config-hint">auto</span>{/if}
  </div>
  {#if nameError}<div class="swimlane-config-msg error">{nameError}</div>{/if}

  <!-- Existing push targets -->
  {#if targets.length > 0}
    <div class="swimlane-config-section">Push targets</div>
    {#each targets as t, i}
      <div class="swimlane-config-target">
        <span class="swimlane-valkey-dot {t.connected ? 'connected' : 'disconnected'}"></span>
        <span class="swimlane-config-target-url">{t.url}</span>
        <span class="swimlane-config-target-lane">{t.swimlane}</span>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="swimlane-config-remove" onclick={(e) => removeTarget(e, i)} title="Remove">✕</span>
      </div>
    {/each}
  {/if}

  <!-- Add target form -->
  <div class="swimlane-config-section">{targets.length > 0 ? 'Add target' : 'Push targets'}</div>
  <div class="swimlane-config-row">
    <label class="swimlane-config-label">URL</label>
    <input class="swimlane-config-input" type="text" bind:value={addUrl}
      placeholder="redis://host:6379" onclick={stopProp} />
  </div>
  <div class="swimlane-config-row">
    <label class="swimlane-config-label">Swimlane</label>
    <input class="swimlane-config-input" type="text" bind:value={addSwimlane}
      placeholder="default" onclick={stopProp} />
  </div>
  <div class="swimlane-config-row">
    <label class="swimlane-config-label">Password</label>
    <input class="swimlane-config-input" type="password" bind:value={addPassword}
      placeholder="optional" onclick={stopProp} />
  </div>
  <div class="swimlane-config-footer">
    {#if addError}<span class="swimlane-config-msg error">{addError}</span>{:else}<span></span>{/if}
    <button class="swimlane-config-btn" onclick={addTarget} disabled={addSaving || !addUrl.trim()}>
      {addSaving ? 'Adding…' : 'Add target'}
    </button>
  </div>

</div>
