<script lang="ts">
  let { enabled, busy, onConfigure }: { enabled: boolean; busy: boolean; onConfigure: (passphrase: string, enabled?: boolean) => Promise<void> } = $props();
  let passphrase = $state('');
  let confirmation = $state('');
  let working = $state(false);
  let message = $state('');
  async function configure(enable: boolean): Promise<void> {
    if (enable && !enabled && passphrase !== confirmation) { message = 'Passphrases do not match.'; return; }
    working = true;
    const value = passphrase;
    passphrase = ''; confirmation = '';
    try { await onConfigure(value, enable); message = enable ? 'Encryption unlocked for this session.' : 'Encryption disabled for future backups.'; }
    catch (cause) { message = cause instanceof Error ? cause.message : 'Encryption could not be configured.'; }
    finally { working = false; }
  }
</script>

<section aria-label="Backup encryption">
  <h3>End-to-end encrypted backups</h3>
  <p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Encrypt note and attachment contents before upload. Keep your passphrase: it cannot be recovered. File names and note metadata remain visible in the manifest. Existing commits keep their original encryption.</p>
  <label>Encryption passphrase<input type="password" autocomplete="new-password" bind:value={passphrase} disabled={busy || working} /></label>
  {#if !enabled}<label>Confirm encryption passphrase<input type="password" autocomplete="new-password" bind:value={confirmation} disabled={busy || working} /></label>{/if}
  <div class="settings-actions [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex flex-wrap gap-2 mt-1 [.settings-storage-option_>_&]:mt-0">
    <button disabled={busy || working || !passphrase.trim()} onclick={() => void configure(true)}>{enabled ? 'Unlock encrypted backups' : 'Enable encrypted backups'}</button>
    {#if enabled}<button disabled={busy || working} onclick={() => void configure(false)}>Use unencrypted backups</button>{/if}
  </div>
  {#if message}<p role="status">{message}</p>{/if}
</section>
