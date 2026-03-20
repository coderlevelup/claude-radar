<script>
  import Column from './Column.svelte';
  import { ui } from '../stores/ui.svelte.js';
  import { timeColumn, groupOlderByWeek } from '../utils/time.js';

  let { project, dragging = false, dragOver = false, ondragstart, ondragend, ondragover, ondrop } = $props();

  let isCollapsed = $derived(ui.isCollapsed(project.swimlaneKey));

  // Group sessions into columns
  let groups = $derived.by(() => {
    const g = { today: [], week: [], older: [] };
    for (const s of project.sessions) {
      g[timeColumn(s)].push(s);
    }
    for (const key of Object.keys(g)) {
      g[key].sort((a, b) => new Date(b.created) - new Date(a.created));
    }
    return g;
  });

  let hasToday = $derived(groups.today.length > 0);

  // Build column list
  let columns = $derived.by(() => {
    const cols = [
      { label: 'Today', sessions: groups.today },
      { label: 'This Week', sessions: groups.week },
    ];
    if (ui.showOlder) {
      const olderWeeks = groupOlderByWeek(groups.older);
      if (olderWeeks.length > 0) {
        for (const w of olderWeeks) {
          cols.push({ label: w.label, sessions: w.sessions });
        }
      } else {
        cols.push({ label: 'Older', sessions: [] });
      }
    }
    return cols;
  });

  function handleHeaderClick(e) {
    if (e.target.closest('.swimlane-drag')) return;
    ui.toggleCollapsed(project.swimlaneKey);
  }

  function handleDragStart(e) {
    e.dataTransfer.effectAllowed = 'move';
    ondragstart?.(project.swimlaneKey);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="swimlane"
  class:collapsed={isCollapsed}
  class:no-today={!hasToday}
  class:dragging
  class:drag-over={dragOver}
  ondragover={(e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    ondragover?.(project.swimlaneKey);
  }}
  ondragleave={() => {}}
  ondrop={(e) => {
    e.preventDefault();
    ondrop?.(project.swimlaneKey);
  }}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="swimlane-header"
    draggable="true"
    ondragstart={handleDragStart}
    ondragend={() => ondragend?.()}
    onclick={handleHeaderClick}
  >
    <div class="swimlane-title">
      <span class="swimlane-drag">&equiv;</span>
      <span class="swimlane-chevron">&#9660;</span>
      {#if project.swimlaneUrl}
        <a class="swimlane-name swimlane-link" href={project.swimlaneUrl}
           target="_blank" onclick={(e) => e.stopPropagation()}>
          {project.projectName}{project.branch ? `/${project.branch}` : ''}
        </a>
      {:else}
        <span class="swimlane-name">{project.projectPath}</span>
      {/if}
    </div>
    <span class="swimlane-count">{project.sessions.length} sessions</span>
  </div>

  {#if !isCollapsed}
    <div class="swimlane-body" style="grid-template-columns: repeat({columns.length}, 1fr)">
      {#each columns as col}
        <Column label={col.label} sessions={col.sessions} dirName={project.dirName} projectName={project.projectName} projectPath={project.projectPath} />
      {/each}
    </div>
  {/if}
</div>
