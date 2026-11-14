<script lang="ts">
  import * as Dialog from '#lib/components/ui/dialog/index.js';
  import { noteFilePath } from '#lib/paths.ts';
  import type { createNoteCreationController } from '../../routes/note-creation-controller.svelte.ts';
  let { creation }: { creation: ReturnType<typeof createNoteCreationController> } = $props();
</script>
<Dialog.Root open onOpenChange={(open) => { if (!open && !creation.busy) creation.close(); }}>
  <Dialog.Content interactOutsideBehavior="ignore" class="template-dialog-surface [width:min(100%,_410px)] overflow-hidden border border-line-strong rounded-xl bg-paper [box-shadow:var(--shadow-lg)]" aria-label="New note from template" onEscapeKeydown={(event) => { if (creation.busy) event.preventDefault(); }}>
    <h2 id="template-title">New note from template</h2>
    <form onsubmit={(event) => { event.preventDefault(); void creation.createFromTemplate(); }}>
      <label for="note-template">Template</label><select id="note-template" bind:value={creation.selectedId} disabled={creation.busy}>{#each creation.templates as note}<option value={note.id}>{noteFilePath(note)}</option>{/each}</select>
      {#if !creation.templates.length}<p>Add a note to your templates folder first.</p>{/if}
      <label>New note path<input bind:value={creation.path} placeholder="Projects/Meeting.md" required disabled={creation.busy} /></label>
      {#if creation.error}<p role="alert">{creation.error}</p>{/if}
      <div class="modal-actions flex justify-end gap-2 pt-3.5 px-5.5 pb-4.5 [border-top:1px_solid_var(--line-soft)] [&_button]:h-8.5 [&_button]:flex [&_button]:items-center [&_button]:gap-1.75 [&_button]:py-0 [&_button]:px-3 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-55"><button type="button" onclick={() => creation.close()} disabled={creation.busy}>Cancel</button><button type="submit" class="primary [.modal-actions_button&]:border-solid-bg [.modal-actions_button&]:bg-solid-bg [.modal-actions_button&]:text-on-solid" disabled={creation.busy || !creation.templates.length}>Create from template</button></div>
    </form>
  </Dialog.Content>
</Dialog.Root>
