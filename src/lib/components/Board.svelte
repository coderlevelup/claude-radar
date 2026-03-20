<script>
  import { untrack } from 'svelte';
  import Swimlane from './Swimlane.svelte';
  import { sessions } from '../stores/sessions.svelte.js';
  import { ui } from '../stores/ui.svelte.js';
  import { timeColumn } from '../utils/time.js';

  let dragSrcDir = $state(null);
  let dragOverDir = $state(null);

  // Expand collapsed projects that have new activity
  $effect(() => {
    const projects = sessions.data.projects;
    if (!projects) return;
    // Read/write collapsed state untracked to avoid circular dependency
    untrack(() => {
      for (const p of projects) {
        const prev = sessions.lastMostRecent.get(p.swimlaneKey);
        if (prev !== undefined && p.mostRecent > prev && ui.isCollapsed(p.swimlaneKey)) {
          ui.toggleCollapsed(p.swimlaneKey);
        }
        sessions.lastMostRecent.set(p.swimlaneKey, p.mostRecent);
      }
    });
  });

  // Sort projects — side effect on projectOrder, so also in $effect
  let sorted = $state([]);

  $effect(() => {
    const projects = sessions.data.projects;
    if (!projects || projects.length === 0) {
      sorted = [];
      return;
    }

    // Filter out projects with no visible sessions when not showing older
    const filtered = ui.showOlder ? projects : projects.filter(p => {
      return p.sessions.some(s => {
        const col = timeColumn(s);
        return col === 'today' || col === 'week';
      });
    });

    sorted = ui.sortProjects(filtered);
  });
</script>

{#each sorted as project (project.swimlaneKey)}
  <Swimlane
    {project}
    dragging={dragSrcDir === project.swimlaneKey}
    dragOver={dragOverDir === project.swimlaneKey && dragSrcDir !== project.swimlaneKey}
    ondragstart={(key) => { dragSrcDir = key; }}
    ondragend={() => { dragSrcDir = null; dragOverDir = null; }}
    ondragover={(key) => { if (dragSrcDir && dragSrcDir !== key) dragOverDir = key; }}
    ondrop={(key) => {
      if (dragSrcDir && dragSrcDir !== key) {
        ui.reorder(dragSrcDir, key);
      }
      dragSrcDir = null;
      dragOverDir = null;
    }}
  />
{/each}
