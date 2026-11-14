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
  <form class="settings-field [&_label]:block [&_label]:mb-3.25 [&_label]:text-ink-soft [&_label]:text-ui-12 [&_label]:font-semibold [&_input]:block [&_input]:w-full [&_input]:h-9 [&_input]:mt-1.5 [&_input]:py-0 [&_input]:px-2.25 [&_input]:border [&_input]:border-line [&_input]:rounded-md [&_input]:bg-surface [&_input]:text-ink [&_input]:text-ui-13 [&_input]:font-normal [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50" onsubmit={(event) => { event.preventDefault(); save(); }}>
    <label>Templates folder<input bind:value={draft.templatesFolder} required /></label>
    <label>Daily notes folder<input bind:value={draft.dailyFolder} required /></label>
    <label>Daily note template<input bind:value={draft.dailyTemplate} placeholder="Templates/Daily.md (optional)" /></label>
    <button type="submit">Save note creation preferences</button>
    {#if message}<p class="mt-2 mb-0 text-muted text-ui-12" role="status">{message}</p>{/if}
  </form>
</section>
