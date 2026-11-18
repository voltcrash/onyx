<script lang="ts">
  import type { BackupNoteChange } from '#lib/backup-merge.ts';
  import { LockedBackupError, unlockBackupKey } from '#lib/backup-crypto.ts';
  import { noteFilePath } from '#lib/paths.ts';

  let { load }: { load: () => Promise<BackupNoteChange[]> } = $props();
  let retry = $state.raw<Promise<BackupNoteChange[]>>();
  const preview = $derived(retry ?? load());
  let passphrase = $state('');
  let unlockError = $state('');
  let unlocking = $state(false);

  async function unlock(error: LockedBackupError) {
    unlocking = true;
    unlockError = '';
    try {
      await unlockBackupKey(error.encryption, passphrase);
      retry = load();
    } catch (cause) {
      unlockError = cause instanceof Error ? cause.message : 'Could not unlock the backup.';
    } finally {
      passphrase = '';
      unlocking = false;
    }
  }
</script>

<section aria-label="Note changes" class="mx-5.5 mb-4 rounded-md border border-line p-3 text-ui-12">
  {#await preview}
    <p role="status">Comparing notes…</p>
  {:then changes}
    <h3 class="font-semibold">{#if changes.length}{changes.length} {changes.length === 1 ? 'note differs' : 'notes differ'} between this device and GitHub{:else}Notes match. Attachments and folders may still differ.{/if}</h3>
    <ul class="mt-2 grid gap-2">
      {#each changes as change (change.id)}
        <li class="border-t border-line pt-2 break-words">
          <strong>{change.path}</strong>
          <p class="text-muted">Local · {change.localChange} / GitHub · {change.remoteChange}</p>
          {#if change.versions}
            <details class="mt-1">
              <summary class="cursor-pointer text-accent">Compare versions</summary>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                {#each change.versions as version, index}
                  <div class="min-w-0 rounded-md bg-subtle p-2">
                    <h4 class="font-semibold">{index === 0 ? 'Local version' : 'GitHub version'}</h4>
                    {#if version.note}
                      <p>{version.note.title} · {noteFilePath(version.note)}{version.note.pinned ? ' · Pinned' : ''}</p>
                      <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{version.markdown || '(Empty note)'}</pre>
                    {:else}
                      <p>Deleted</p>
                    {/if}
                  </div>
                {/each}
              </div>
            </details>
          {/if}
        </li>
      {/each}
    </ul>
  {:catch error}
    {#if error instanceof LockedBackupError}
      <form onsubmit={(event) => { event.preventDefault(); void unlock(error); }}>
        <label>Backup passphrase to preview encrypted notes
          <input class="block rounded border border-line p-1" type="password" autocomplete="off" bind:value={passphrase} />
        </label>
        <button class="mt-2 text-accent" type="submit" disabled={!passphrase || unlocking}>Unlock preview</button>
        {#if unlockError}<p role="alert">{unlockError}</p>{/if}
      </form>
    {:else}
      <p role="status">Could not compare notes. {error instanceof Error ? error.message : ''}</p>
    {/if}
  {/await}
</section>
