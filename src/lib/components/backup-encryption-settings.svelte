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
  <p class="settings-hint">Encrypt note and attachment contents before upload. Keep your passphrase: it cannot be recovered. File names and note metadata remain visible in the manifest. Existing commits keep their original encryption.</p>
  <label>Encryption passphrase<input type="password" autocomplete="new-password" bind:value={passphrase} disabled={busy || working} /></label>
  {#if !enabled}<label>Confirm encryption passphrase<input type="password" autocomplete="new-password" bind:value={confirmation} disabled={busy || working} /></label>{/if}
  <div class="settings-actions">
    <button disabled={busy || working || !passphrase.trim()} onclick={() => void configure(true)}>{enabled ? 'Unlock encrypted backups' : 'Enable encrypted backups'}</button>
    {#if enabled}<button disabled={busy || working} onclick={() => void configure(false)}>Use unencrypted backups</button>{/if}
  </div>
  {#if message}<p role="status">{message}</p>{/if}
</section>
