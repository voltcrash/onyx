<script lang="ts">
  import { manageModalFocus } from '#lib/modal-focus.ts';
  import type { createHistoryController } from '../../routes/history-controller.svelte.ts';
  let { history }: { history: ReturnType<typeof createHistoryController> } = $props();
</script>

<div class="modal-backdrop" role="presentation">
  <div class="shortcut-modal" role="dialog" aria-modal="true" aria-labelledby="history-title" tabindex="-1" use:manageModalFocus onkeydown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); history.close(); } }}>
    <h2 id="history-title">Note history</h2>
    <p>Local snapshots, saved at most every five minutes. Rewrites and restores preserve the prior text.</p>
    <nav aria-label="Snapshots">
      {#each history.snapshots as snapshot (snapshot.id)}
        <button aria-pressed={history.selected?.id === snapshot.id} onclick={() => history.select(snapshot)}>{new Date(snapshot.createdAt).toLocaleString()}</button>
      {:else}<p>No snapshots yet.</p>{/each}
    </nav>
    {#if history.selected}<pre aria-label="Snapshot preview">{history.selected.markdown}</pre>{/if}
    {#if history.error}<p role="alert">{history.error}</p>{/if}
    <div class="modal-actions">
      <button disabled={history.busy} onclick={() => history.close()}>Close history</button>
      <button class="primary" disabled={!history.selected || history.busy} onclick={() => void history.restore()}>Restore snapshot</button>
    </div>
  </div>
</div>

<style>
  nav { display: flex; flex-wrap: wrap; gap: .5rem; }
  pre { white-space: pre-wrap; overflow: auto; max-height: 40vh; }
</style>
