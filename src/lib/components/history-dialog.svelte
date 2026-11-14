<script lang="ts">
  import * as Dialog from '#lib/components/ui/dialog/index.js';
  import type { createHistoryController } from '../../routes/history-controller.svelte.ts';
  let { history }: { history: ReturnType<typeof createHistoryController> } = $props();
</script>

<Dialog.Root open onOpenChange={(open) => { if (!open && !history.busy) history.close(); }}>
  <Dialog.Content interactOutsideBehavior="ignore" class="history-dialog-surface [width:min(100%,_410px)] overflow-hidden border border-line-strong rounded-xl bg-paper [box-shadow:var(--shadow-lg)]" aria-labelledby="history-title" onEscapeKeydown={(event) => { if (history.busy) event.preventDefault(); }}>
    <h2 id="history-title">Note history</h2>
    <p>Local snapshots, saved at most every five minutes. Rewrites and restores preserve the prior text.</p>
    <nav class="flex flex-wrap gap-2" aria-label="Snapshots">
      {#each history.snapshots as snapshot (snapshot.id)}
        <button aria-pressed={history.selected?.id === snapshot.id} onclick={() => history.select(snapshot)}>{new Date(snapshot.createdAt).toLocaleString()}</button>
      {:else}<p>No snapshots yet.</p>{/each}
    </nav>
    {#if history.selected}<pre class="whitespace-pre-wrap overflow-auto max-h-[40vh]" aria-label="Snapshot preview">{history.selected.markdown}</pre>{/if}
    {#if history.error}<p role="alert">{history.error}</p>{/if}
    <div class="modal-actions flex justify-end gap-2 pt-3.5 px-5.5 pb-4.5 [border-top:1px_solid_var(--line-soft)] [&_button]:h-8.5 [&_button]:flex [&_button]:items-center [&_button]:gap-1.75 [&_button]:py-0 [&_button]:px-3 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-55">
      <button disabled={history.busy} onclick={() => history.close()}>Close history</button>
      <button class="primary [.modal-actions_button&]:border-solid-bg [.modal-actions_button&]:bg-solid-bg [.modal-actions_button&]:text-on-solid" disabled={!history.selected || history.busy} onclick={() => void history.restore()}>Restore snapshot</button>
    </div>
  </Dialog.Content>
</Dialog.Root>
