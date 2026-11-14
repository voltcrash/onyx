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
	<div class="status-notices fixed right-4.5 bottom-4.5 z-40 flex flex-col [align-items:flex-end] gap-2 [max-width:min(440px,_calc(100vw_-_36px))] [@media((max-width:_700px))]:right-3! [@media((max-width:_700px))]:left-3! [@media((max-width:_700px))]:items-stretch! [@media((max-width:_700px))]:[max-width:none]!">
		{#if transferMessage}
			<div class="backup-notice error flex items-center gap-2.5 pt-2.5 pr-2.5 pb-2.5 pl-3.25 border border-ok-border rounded-lg bg-ok-bg text-ok-text text-ui-12 [box-shadow:var(--shadow-md)] [animation:rise-corner_0.2s_ease-out] [&_span]:[line-height:1.4] [&_a]:flex [&_a]:items-center [&_a]:gap-1 [&_a]:[color:inherit] [&_a]:[font-weight:650] [&_a]:whitespace-nowrap [&_button]:w-6.25 [&_button]:h-6.25 [&_button]:grid [&_button]:place-items-center [&_button]:border-0 [&_button]:rounded-sm [&_button]:bg-transparent [&_button]:[color:inherit] [&_button]:cursor-pointer [.backup-notice&]:border-danger-border [.backup-notice&]:bg-danger-bg [.backup-notice&]:text-danger-strong [.settings-hint&]:text-danger [.restore-placeholder&]:text-danger-strong" role="alert">
				<span>{transferMessage}</span>
				<button aria-label="Dismiss import and export status" onclick={onDismissTransfer}><X size={14} /></button>
			</div>
		{/if}
		{#if backupMessage}
			<div class="backup-notice flex items-center gap-2.5 pt-2.5 pr-2.5 pb-2.5 pl-3.25 border border-ok-border rounded-lg bg-ok-bg text-ok-text text-ui-12 [box-shadow:var(--shadow-md)] [animation:rise-corner_0.2s_ease-out] [&_span]:[line-height:1.4] [&_a]:flex [&_a]:items-center [&_a]:gap-1 [&_a]:[color:inherit] [&_a]:[font-weight:650] [&_a]:whitespace-nowrap [&_button]:w-6.25 [&_button]:h-6.25 [&_button]:grid [&_button]:place-items-center [&_button]:border-0 [&_button]:rounded-sm [&_button]:bg-transparent [&_button]:[color:inherit] [&_button]:cursor-pointer [.backup-notice&.error]:[border-color:var(--danger-border)] [.backup-notice&.error]:[background:var(--danger-bg)] [.backup-notice&.error]:[color:var(--danger-strong)]" class:error={backupState === 'error'} role={backupState === 'error' ? 'alert' : 'status'}>
				<span>{backupMessage}</span>
				{#if backupCommitUrl}<a href={backupCommitUrl} target="_blank" rel="noreferrer">View commit <ExternalLink size={13} /></a>{/if}
				<button aria-label="Dismiss backup status" onclick={onDismissBackup}><X size={14} /></button>
			</div>
		{/if}
	</div>
{/if}
