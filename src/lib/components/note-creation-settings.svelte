<script lang="ts">
  import { untrack } from 'svelte';
  import type { NoteCreationPreferences } from '#lib/note-creation.ts';
  let { preferences, onSave }: { preferences: NoteCreationPreferences; onSave: (value: NoteCreationPreferences) => void } = $props();
  let draft = $state(untrack(() => ({ ...preferences })));
  let message = $state('');
  function save(): void {
    try { onSave(draft); message = 'Note creation preferences saved.'; }
    catch (cause) { message = cause instanceof Error ? cause.message : 'Preferences could not be saved.'; }
  }
</script>
<section aria-label="Templates and daily notes">
  <h3 class="settings-group-heading">Templates and daily notes</h3>
  <p class="settings-hint">Use {'{{title}}'}, {'{{date}}'}, and {'{{time}}'} in template notes. Preferences apply to this vault in this browser.</p>
  <form onsubmit={(event) => { event.preventDefault(); save(); }}>
    <label>Templates folder<input bind:value={draft.templatesFolder} required /></label>
    <label>Daily notes folder<input bind:value={draft.dailyFolder} required /></label>
    <label>Daily note template<input bind:value={draft.dailyTemplate} placeholder="Templates/Daily.md (optional)" /></label>
    <button type="submit">Save note creation preferences</button>
    {#if message}<p role="status">{message}</p>{/if}
  </form>
</section>
