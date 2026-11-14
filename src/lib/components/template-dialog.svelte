<script lang="ts">
  import { manageModalFocus } from '#lib/modal-focus.ts';
  import { noteFilePath } from '#lib/paths.ts';
  import type { createNoteCreationController } from '../../routes/note-creation-controller.svelte.ts';
  let { creation }: { creation: ReturnType<typeof createNoteCreationController> } = $props();
</script>
<div class="modal-backdrop" role="presentation">
  <div class="shortcut-modal" role="dialog" aria-modal="true" aria-label="New note from template" tabindex="-1" use:manageModalFocus onkeydown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); creation.close(); } }}>
    <h2 id="template-title">New note from template</h2>
    <form onsubmit={(event) => { event.preventDefault(); void creation.createFromTemplate(); }}>
      <label for="note-template">Template</label><select id="note-template" bind:value={creation.selectedId} disabled={creation.busy}>{#each creation.templates as note}<option value={note.id}>{noteFilePath(note)}</option>{/each}</select>
      {#if !creation.templates.length}<p>Add a note to your templates folder first.</p>{/if}
      <label>New note path<input bind:value={creation.path} placeholder="Projects/Meeting.md" required disabled={creation.busy} /></label>
      {#if creation.error}<p role="alert">{creation.error}</p>{/if}
      <div class="modal-actions"><button type="button" onclick={() => creation.close()} disabled={creation.busy}>Cancel</button><button type="submit" class="primary" disabled={creation.busy || !creation.templates.length}>Create from template</button></div>
    </form>
  </div>
</div>
