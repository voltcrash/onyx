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
  <h3 class="settings-group-heading [.settings-panel_h3&]:mt-7 [.settings-panel_h3&]:mx-0 [.settings-panel_h3&]:mb-2">Templates and daily notes</h3>
  <p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Use {'{{title}}'}, {'{{date}}'}, and {'{{time}}'} in template notes. Preferences apply to this vault in this browser.</p>
  <form onsubmit={(event) => { event.preventDefault(); save(); }}>
    <label>Templates folder<input bind:value={draft.templatesFolder} required /></label>
    <label>Daily notes folder<input bind:value={draft.dailyFolder} required /></label>
    <label>Daily note template<input bind:value={draft.dailyTemplate} placeholder="Templates/Daily.md (optional)" /></label>
    <button type="submit">Save note creation preferences</button>
    {#if message}<p role="status">{message}</p>{/if}
  </form>
</section>
