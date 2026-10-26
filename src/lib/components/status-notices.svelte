<script lang="ts">
	import { ExternalLink, X } from '@lucide/svelte';
	import type { BackupState } from './app-types';

	interface Props {
		backupMessage: string;
		backupState: BackupState;
		backupCommitUrl: string;
		transferMessage: string;
		onDismissBackup: () => void;
		onDismissTransfer: () => void;
	}

	let { backupMessage, backupState, backupCommitUrl, transferMessage, onDismissBackup, onDismissTransfer }: Props = $props();
</script>

{#if backupMessage || transferMessage}
	<div class="status-notices">
		{#if transferMessage}
			<div class="backup-notice error" role="alert">
				<span>{transferMessage}</span>
				<button aria-label="Dismiss import and export status" onclick={onDismissTransfer}><X size={14} /></button>
			</div>
		{/if}
		{#if backupMessage}
			<div class="backup-notice" class:error={backupState === 'error'} role={backupState === 'error' ? 'alert' : 'status'}>
				<span>{backupMessage}</span>
				{#if backupCommitUrl}<a href={backupCommitUrl} target="_blank" rel="noreferrer">View commit <ExternalLink size={13} /></a>{/if}
				<button aria-label="Dismiss backup status" onclick={onDismissBackup}><X size={14} /></button>
			</div>
		{/if}
	</div>
{/if}
