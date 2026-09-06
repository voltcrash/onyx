<script lang="ts">
	import { CloudDownload, GitCommitHorizontal, LoaderCircle, X } from '@lucide/svelte';
	import type { GithubBackupCommit } from '$lib';
	import { manageModalFocus } from '$lib/modal-focus';
	import type { RestoreState } from './app-types';

	interface Props {
		isOnline: boolean;
		restoreState: RestoreState;
		restoreMessage: string;
		restoreCommits: GithubBackupCommit[];
		selectedRestoreSha: string;
		restoreOwner: string;
		restoreRepository: string;
		restoreBranch: string;
		restoreDirectory: string;
		onClose: () => void;
		onLoadCommits: () => void;
		onRestore: () => void;
		formatCommitDate: (value: string) => string;
	}

	let {
		isOnline, restoreState, restoreMessage, restoreCommits,
		selectedRestoreSha = $bindable(), restoreOwner = $bindable(), restoreRepository = $bindable(),
		restoreBranch = $bindable(), restoreDirectory = $bindable(), onClose, onLoadCommits, onRestore,
		formatCommitDate
	}: Props = $props();
</script>

<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget && restoreState !== 'restoring') onClose(); }}>
	<div id="restore-dialog" class="shortcut-modal restore-modal" role="dialog" aria-modal="true" aria-labelledby="restore-title" aria-describedby="restore-warning" aria-busy={restoreState === 'loading' || restoreState === 'restoring'} tabindex="-1" use:manageModalFocus>
		<div class="modal-title"><div><span>GitHub restore</span><h2 id="restore-title">Choose a backup commit</h2></div><button type="button" class="icon-button" aria-label="Close GitHub restore" disabled={restoreState === 'restoring'} onclick={onClose}><X size={18} /></button></div>
		<form class="restore-source" onsubmit={(event) => { event.preventDefault(); onLoadCommits(); }}>
			<label>Owner<input bind:value={restoreOwner} required autocomplete="off" /></label>
			<label>Repository<input bind:value={restoreRepository} required autocomplete="off" /></label>
			<label>Branch<input bind:value={restoreBranch} required autocomplete="off" /></label>
			<label>Directory<input bind:value={restoreDirectory} autocomplete="off" /></label>
			<button type="submit" disabled={!isOnline || restoreState === 'loading' || restoreState === 'restoring'}>{#if restoreState === 'loading'}<LoaderCircle class="spin" size={14} />{/if} Load commits</button>
		</form>
		<div class="restore-list" aria-live="polite">
			{#if restoreState === 'loading'}
				<div class="restore-placeholder"><LoaderCircle class="spin" size={20} /> Loading backup history…</div>
			{:else}
				{#each restoreCommits as commit (commit.sha)}
					<label class:selected={selectedRestoreSha === commit.sha}>
						<input type="radio" name="restore-commit" value={commit.sha} bind:group={selectedRestoreSha} />
						<GitCommitHorizontal size={17} />
						<span><strong>{commit.message}</strong><small>{formatCommitDate(commit.committedAt)} · {commit.author} · {commit.sha.slice(0, 7)}</small></span>
					</label>
				{/each}
				{#if restoreMessage}<div class="restore-placeholder" class:error={restoreState === 'error'}>{restoreMessage}</div>{/if}
			{/if}
		</div>
		<div id="restore-warning" class="restore-warning"><strong>This replaces the local vault.</strong> Notes and attachments currently on this device will be removed and replaced by the selected commit.</div>
		<div class="modal-actions"><button type="button" disabled={restoreState === 'restoring'} onclick={onClose}>Cancel</button><button class="primary danger" type="button" disabled={!isOnline || !selectedRestoreSha || restoreState === 'restoring'} onclick={onRestore}>{#if restoreState === 'restoring'}<LoaderCircle class="spin" size={15} />{:else}<CloudDownload size={15} />{/if} {restoreState === 'restoring' ? 'Restoring…' : 'Restore selected'}</button></div>
	</div>
</div>
