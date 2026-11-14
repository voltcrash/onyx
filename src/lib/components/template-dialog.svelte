<script lang="ts">
  import * as Dialog from '#lib/components/ui/dialog/index.js';
  import { noteFilePath } from '#lib/paths.ts';
  import type { createNoteCreationController } from '../../routes/note-creation-controller.svelte.ts';
  let { creation }: { creation: ReturnType<typeof createNoteCreationController> } = $props();
</script>
<Dialog.Root open onOpenChange={(open) => { if (!open && !creation.busy) creation.close(); }}>
  <Dialog.Content interactOutsideBehavior="ignore" class="template-dialog-surface [width:min(100%,_410px)] overflow-hidden border border-line-strong rounded-xl bg-paper [box-shadow:var(--shadow-lg)]" aria-label="New note from template" onEscapeKeydown={(event) => { if (creation.busy) event.preventDefault(); }}>
    <div class="modal-title pt-5.5 px-5.5 pb-4.5 [border-bottom:1px_solid_var(--line-soft)]"><h2 id="template-title" class="m-0 [font-family:'Newsreader_Variable',_Georgia,_serif] text-ui-24 font-medium [letter-spacing:-0.025em]">New note from template</h2></div>
    <form onsubmit={(event) => { event.preventDefault(); void creation.createFromTemplate(); }}>
      <div class="grid gap-3.25 py-4.5 px-5.5 [&_label]:block [&_label]:text-ink-soft [&_label]:text-ui-12 [&_label]:font-semibold [&_input]:block [&_input]:w-full [&_input]:h-9 [&_input]:mt-1.5 [&_input]:py-0 [&_input]:px-2.25 [&_input]:border [&_input]:border-line [&_input]:rounded-md [&_input]:bg-surface [&_input]:text-ink [&_input]:text-ui-13 [&_input]:font-normal [&_select]:block [&_select]:w-full [&_select]:h-9 [&_select]:mt-1.5 [&_select]:py-0 [&_select]:px-2.25 [&_select]:border [&_select]:border-line [&_select]:rounded-md [&_select]:bg-surface [&_select]:text-ink [&_select]:text-ui-13 [&_select]:font-normal [&_p]:m-0 [&_p]:text-muted [&_p]:text-ui-12 [&_p]:[line-height:1.55] [&_p[role=alert]]:text-danger">
        <div><label for="note-template">Template</label><select id="note-template" bind:value={creation.selectedId} disabled={creation.busy}>{#each creation.templates as note}<option value={note.id}>{noteFilePath(note)}</option>{/each}</select></div>
        {#if !creation.templates.length}<p>Add a note to your templates folder first.</p>{/if}
        <label>New note path<input bind:value={creation.path} placeholder="Projects/Meeting.md" required disabled={creation.busy} /></label>
        {#if creation.error}<p role="alert">{creation.error}</p>{/if}
      </div>
      <div class="modal-actions flex justify-end gap-2 pt-3.5 px-5.5 pb-4.5 [border-top:1px_solid_var(--line-soft)] [&_button]:h-8.5 [&_button]:flex [&_button]:items-center [&_button]:gap-1.75 [&_button]:py-0 [&_button]:px-3 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-55"><button type="button" onclick={() => creation.close()} disabled={creation.busy}>Cancel</button><button type="submit" class="primary [.modal-actions_button&]:border-solid-bg [.modal-actions_button&]:bg-solid-bg [.modal-actions_button&]:text-on-solid" disabled={creation.busy || !creation.templates.length}>Create from template</button></div>
    </form>
  </Dialog.Content>
</Dialog.Root>
