<script lang="ts">
	import { CloudDownload, GitCommitHorizontal, LoaderCircle, X } from '@lucide/svelte';
	import type { GithubBackupCommit } from '#lib/github.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { RestoreState } from './app-types';

	interface Props {
		isOnline: boolean;
    mergeUnlock: boolean;
    onUnlock: () => void;
		restoreState: RestoreState;
		restoreMessage: string;
		restoreCommits: GithubBackupCommit[];
		pendingBackupCount: number;
		selectedRestoreSha: string;
		restoreOwner: string;
		restoreRepository: string;
		restoreBranch: string;
		restoreDirectory: string;
    restorePassphrase: string;
		onClose: () => void;
		onLoadCommits: () => void;
		onRestore: () => void;
		formatCommitDate: (value: string) => string;
	}

	let {
		isOnline, mergeUnlock, onUnlock, restoreState, restoreMessage, restoreCommits, pendingBackupCount,
		selectedRestoreSha = $bindable(), restoreOwner = $bindable(), restoreRepository = $bindable(),
		restoreBranch = $bindable(), restoreDirectory = $bindable(), restorePassphrase = $bindable(), onClose, onLoadCommits, onRestore,
		formatCommitDate
	}: Props = $props();

	let confirmation = $state('');
	const identity = $derived(JSON.stringify([restoreOwner,restoreRepository,restoreBranch,restoreDirectory,selectedRestoreSha,pendingBackupCount]));
	const pendingChangesConfirmed = $derived(confirmation === identity);

	function requestRestore(): void {
		if (pendingBackupCount > 0 && !pendingChangesConfirmed) {
			confirmation = identity;
			return;
		}
		onRestore();
	}
</script>

<Dialog.Root open onOpenChange={(open) => { if (!open && restoreState !== 'restoring') onClose(); }}>
	<Dialog.Content id="restore-dialog" class="restore-dialog-surface restore-modal overflow-hidden border border-line-strong rounded-xl bg-paper [box-shadow:var(--shadow-lg)] [width:min(100%,_650px)]" aria-labelledby="restore-title" aria-describedby="restore-warning" aria-busy={restoreState === 'loading' || restoreState === 'restoring'} onEscapeKeydown={(event) => { if (restoreState === 'restoring') event.preventDefault(); }} onInteractOutside={(event) => { if (restoreState === 'restoring') event.preventDefault(); }}>
		<div class="modal-title flex items-start justify-between pt-5.5 px-5.5 pb-4.5 [border-bottom:1px_solid_var(--line-soft)] [&_span]:text-accent [&_span]:text-ui-10 [&_span]:font-bold [&_span]:[letter-spacing:0.13em] [&_span]:uppercase [&_h2]:mt-1.25 [&_h2]:mx-0 [&_h2]:mb-0 [&_h2]:[font-family:'Newsreader_Variable',_Georgia,_serif] [&_h2]:text-ui-24 [&_h2]:font-medium [&_h2]:[letter-spacing:-0.025em] [.settings-modal_&_h2]:mt-0"><div><span>GitHub {mergeUnlock ? 'merge' : 'restore'}</span><h2 id="restore-title">{mergeUnlock ? 'Unlock backup to merge' : 'Choose a backup commit'}</h2></div><button type="button" class="icon-button border-0 bg-transparent cursor-pointer w-8.5 h-8.5 grid place-items-center rounded-md text-muted [transition:background_0.15s_ease,_color_0.15s_ease] [&:hover]:bg-subtle-strong [&:hover]:text-ink [.sidebar-footer_&]:w-7 [.sidebar-footer_&]:h-7" aria-label="Close GitHub restore" disabled={restoreState === 'restoring'} onclick={onClose}><X size={18} /></button></div>
    {#if !mergeUnlock}
		<form class="restore-source [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-55 grid [grid-template-columns:1fr_1.4fr_0.8fr_0.8fr_auto] gap-2 py-3.75 px-4.5 [border-bottom:1px_solid_var(--line-soft)] bg-sidebar [&_label]:min-w-0 [&_label]:text-faint [&_label]:text-ui-10 [&_label]:[font-weight:650] [&_label]:[letter-spacing:0.08em] [&_label]:uppercase [&_input]:w-full [&_input]:h-8.25 [&_input]:mt-1.25 [&_input]:py-0 [&_input]:px-2 [&_input]:border [&_input]:border-line [&_input]:rounded-md [&_input]:bg-surface [&_input]:text-ink [&_input]:text-ui-11 [&_button]:[align-self:end] [&_button]:h-8.25 [&_button]:flex [&_button]:items-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.5 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:cursor-pointer [&_button]:text-ui-11 [&_button]:whitespace-nowrap [@media((max-width:_700px))]:[grid-template-columns:1fr_1fr]! [@media((max-width:_700px))]:[&_button]:[grid-column:1_/_-1]! [@media((max-width:_700px))]:[&_button]:justify-center!" onsubmit={(event) => { event.preventDefault(); onLoadCommits(); }}>
			<label>Owner<input disabled={restoreState === 'restoring'} bind:value={restoreOwner} required autocomplete="off" /></label>
			<label>Repository<input disabled={restoreState === 'restoring'} bind:value={restoreRepository} required autocomplete="off" /></label>
			<label>Branch<input disabled={restoreState === 'restoring'} bind:value={restoreBranch} required autocomplete="off" /></label>
			<label>Directory<input disabled={restoreState === 'restoring'} bind:value={restoreDirectory} autocomplete="off" /></label>
			<button type="submit" disabled={!isOnline || restoreState === 'loading' || restoreState === 'restoring'}>{#if restoreState === 'loading'}<LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={14} />{/if} Load commits</button>
		</form>
		<div class="restore-list max-h-70 overflow-y-auto py-2 px-3 [&_>_label]:flex [&_>_label]:items-center [&_>_label]:gap-2.5 [&_>_label]:py-2.75 [&_>_label]:px-2.5 [&_>_label]:[border:1px_solid_transparent] [&_>_label]:rounded-md [&_>_label]:text-muted [&_>_label]:cursor-pointer [&_>_label:hover]:bg-subtle [&_>_label.selected]:border-accent-border [&_>_label.selected]:bg-accent-bg-strong [&_>_label.selected]:text-accent [&_>_label_input]:[accent-color:var(--accent)] [&_>_label_>_span]:min-w-0 [&_strong]:block [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-ink [&_strong]:text-ui-12 [&_strong]:font-semibold [&_small]:block [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_small]:mt-1 [&_small]:text-faint [&_small]:text-ui-10" aria-live="polite">
			{#if restoreState === 'loading'}
				<div class="restore-placeholder flex items-center justify-center gap-2 min-h-22.5 p-4 text-muted text-ui-12 text-center"><LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={20} /> Loading backup history…</div>
			{:else}
				{#each restoreCommits as commit (commit.sha)}
					<label class:selected={selectedRestoreSha === commit.sha}>
						<input disabled={restoreState === 'restoring'} type="radio" name="restore-commit" value={commit.sha} bind:group={selectedRestoreSha} />
						<GitCommitHorizontal size={17} />
						<span><strong>{commit.message}</strong><small>{formatCommitDate(commit.committedAt)} · {commit.author} · {commit.sha.slice(0, 7)}</small></span>
					</label>
				{/each}
				{#if restoreMessage}<div class="restore-placeholder flex items-center justify-center gap-2 min-h-22.5 p-4 text-muted text-ui-12 text-center [.restore-placeholder&.error]:[color:var(--danger-strong)]" class:error={restoreState === 'error'}>{restoreMessage}</div>{/if}
			{/if}
		</div>
    {:else if restoreMessage}<div class="restore-placeholder flex items-center justify-center gap-2 min-h-22.5 p-4 text-muted text-ui-12 text-center [.restore-placeholder&.error]:[color:var(--danger-strong)]" class:error={restoreState === 'error'}>{restoreMessage}</div>{/if}
		<label>Backup passphrase (encrypted backups only)<input type="password" autocomplete="off" bind:value={restorePassphrase} disabled={restoreState === "restoring"} /></label>
    {#if mergeUnlock}
    <div id="restore-warning" class="restore-warning py-3 px-5.5 [border-top:1px_solid_var(--danger-border)] bg-danger-bg text-danger-strong text-ui-11 [line-height:1.5] [&_strong]:text-danger-deep">Unlocking lets Onyx combine both backups while preserving conflicting notes.</div>
    <div class="modal-actions flex justify-end gap-2 pt-3.5 px-5.5 pb-4.5 [border-top:1px_solid_var(--line-soft)] [&_button]:h-8.5 [&_button]:flex [&_button]:items-center [&_button]:gap-1.75 [&_button]:py-0 [&_button]:px-3 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-55"><button type="button" disabled={restoreState === 'restoring'} onclick={onClose}>Cancel</button><button class="primary [.modal-actions_button&]:border-solid-bg [.modal-actions_button&]:bg-solid-bg [.modal-actions_button&]:text-on-solid" type="button" disabled={!restorePassphrase || restoreState === 'restoring'} onclick={onUnlock}>{restoreState === 'restoring' ? 'Unlocking…' : 'Unlock and merge'}</button></div>
    {:else}
    <div id="restore-warning" class="restore-warning py-3 px-5.5 [border-top:1px_solid_var(--danger-border)] bg-danger-bg text-danger-strong text-ui-11 [line-height:1.5] [&_strong]:text-danger-deep"><strong>This replaces the local vault.</strong> Notes and attachments currently on this device will be removed and replaced by the selected commit.{#if pendingBackupCount > 0} {pendingBackupCount} pending {pendingBackupCount === 1 ? 'change has' : 'changes have'} not been backed up to GitHub.{/if}</div>
		<div class="modal-actions flex justify-end gap-2 pt-3.5 px-5.5 pb-4.5 [border-top:1px_solid_var(--line-soft)] [&_button]:h-8.5 [&_button]:flex [&_button]:items-center [&_button]:gap-1.75 [&_button]:py-0 [&_button]:px-3 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-55"><button type="button" disabled={restoreState === 'restoring'} onclick={onClose}>Cancel</button><button class="primary danger [.modal-actions_button&]:border-solid-bg [.modal-actions_button&]:bg-solid-bg [.modal-actions_button&]:text-on-solid [.file-context-menu_button&]:text-danger [.file-context-menu_button&:hover:not(:disabled)]:bg-danger-bg [.file-context-menu_button&:hover:not(:disabled)]:text-danger [.trash-icon-button&:hover:not(:disabled)]:bg-danger-bg [.trash-icon-button&:hover:not(:disabled)]:text-danger [.settings-danger_button&]:border-danger-border [.settings-danger_button&]:bg-surface [.settings-danger_button&]:text-danger [.settings-danger_button&:hover]:border-accent-strong [.settings-danger_button&:hover]:text-danger-strong [.modal-actions_button&]:border-danger-solid [.modal-actions_button&]:bg-danger-solid [.modal-actions_button&]:[color:#fff]" type="button" disabled={!isOnline || !selectedRestoreSha || restoreState === 'restoring'} onclick={requestRestore}>{#if restoreState === 'restoring'}<LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={15} />{:else}<CloudDownload size={15} />{/if} {restoreState === 'restoring' ? 'Restoring…' : pendingChangesConfirmed ? 'Confirm restore' : 'Restore selected'}</button></div>
    {/if}
	</Dialog.Content>
</Dialog.Root>
