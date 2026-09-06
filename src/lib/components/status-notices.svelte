<script lang="ts">
	import { ExternalLink, LoaderCircle, X } from '@lucide/svelte';
	import type { BackupState, TransferState } from './app-types';

	interface Props {
		backupMessage: string;
		backupState: BackupState;
		backupCommitUrl: string;
		transferMessage: string;
		transferState: TransferState;
		onDismissBackup: () => void;
		onDismissTransfer: () => void;
	}

	let { backupMessage, backupState, backupCommitUrl, transferMessage, transferState, onDismissBackup, onDismissTransfer }: Props = $props();
</script>

{#if backupMessage}
	<div class="backup-notice" class:error={backupState === 'error'} role={backupState === 'error' ? 'alert' : 'status'}>
		<span>{backupMessage}</span>
		{#if backupCommitUrl}<a href={backupCommitUrl} target="_blank" rel="noreferrer">View commit <ExternalLink size={13} /></a>{/if}
		<button aria-label="Dismiss backup status" onclick={onDismissBackup}><X size={14} /></button>
	</div>
{/if}

{#if transferMessage}
	<div class="backup-notice transfer-notice" class:error={transferState === 'error'} role={transferState === 'error' ? 'alert' : 'status'}>
		{#if transferState === 'working'}<LoaderCircle class="spin" size={14} />{/if}
		<span>{transferMessage}</span>
		<button aria-label="Dismiss import or export status" onclick={onDismissTransfer}><X size={14} /></button>
	</div>
{/if}
