<script>
  import Header from './lib/components/Header.svelte';
  import Board from './lib/components/Board.svelte';
  import Timeline from './lib/components/Timeline.svelte';
  import Panel from './lib/components/Panel.svelte';
  import { sessions } from './lib/stores/sessions.svelte.js';
  import { ui } from './lib/stores/ui.svelte.js';
</script>

<Header />

<main id="board">
  {#if ui.currentView === 'board'}
    <Board />
  {:else}
    <Timeline />
  {/if}
</main>

<Panel />
