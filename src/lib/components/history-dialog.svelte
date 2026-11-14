<script lang="ts">
  import * as Dialog from '#lib/components/ui/dialog/index.js';
  import type { createHistoryController } from '../../routes/history-controller.svelte.ts';
  let { history }: { history: ReturnType<typeof createHistoryController> } = $props();
</script>

<Dialog.Root open onOpenChange={(open) => { if (!open && !history.busy) history.close(); }}>
  <Dialog.Content interactOutsideBehavior="ignore" class="history-dialog-surface [width:min(100%,_410px)] overflow-hidden border border-line-strong rounded-xl bg-paper [box-shadow:var(--shadow-lg)]" aria-labelledby="history-title" onEscapeKeydown={(event) => { if (history.busy) event.preventDefault(); }}>
    <div class="modal-title pt-5.5 px-5.5 pb-4.5 [border-bottom:1px_solid_var(--line-soft)]"><h2 id="history-title" class="m-0 [font-family:'Newsreader_Variable',_Georgia,_serif] text-ui-24 font-medium [letter-spacing:-0.025em]">Note history</h2></div>
    <div class="grid gap-3.25 py-4.5 px-5.5 [&_p]:m-0 [&_p]:text-muted [&_p]:text-ui-12 [&_p]:[line-height:1.55] [&_p[role=alert]]:text-danger">
      <p>Local snapshots, saved at most every five minutes. Rewrites and restores preserve the prior text.</p>
      <nav class="flex flex-wrap gap-2 [&_button]:h-7.5 [&_button]:py-0 [&_button]:px-2.25 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-11 [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button[aria-pressed=true]]:border-accent-border [&_button[aria-pressed=true]]:bg-accent-bg [&_button[aria-pressed=true]]:text-ink" aria-label="Snapshots">
        {#each history.snapshots as snapshot (snapshot.id)}
          <button aria-pressed={history.selected?.id === snapshot.id} onclick={() => history.select(snapshot)}>{new Date(snapshot.createdAt).toLocaleString()}</button>
        {:else}<p>No snapshots yet.</p>{/each}
      </nav>
      {#if history.selected}<pre class="m-0 py-2.5 px-3 whitespace-pre-wrap overflow-auto max-h-[40vh] border border-line-soft rounded-md bg-surface text-ink-soft text-ui-12 [line-height:1.6] [font-family:var(--font-code)]" aria-label="Snapshot preview">{history.selected.markdown}</pre>{/if}
      {#if history.error}<p role="alert">{history.error}</p>{/if}
    </div>
    <div class="modal-actions flex justify-end gap-2 pt-3.5 px-5.5 pb-4.5 [border-top:1px_solid_var(--line-soft)] [&_button]:h-8.5 [&_button]:flex [&_button]:items-center [&_button]:gap-1.75 [&_button]:py-0 [&_button]:px-3 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-55">
      <button disabled={history.busy} onclick={() => history.close()}>Close history</button>
      <button class="primary [.modal-actions_button&]:border-solid-bg [.modal-actions_button&]:bg-solid-bg [.modal-actions_button&]:text-on-solid" disabled={!history.selected || history.busy} onclick={() => void history.restore()}>Restore snapshot</button>
    </div>
  </Dialog.Content>
</Dialog.Root>
