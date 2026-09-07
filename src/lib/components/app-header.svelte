<script lang="ts">
	import {
		CloudDownload, CloudOff, CloudUpload, HelpCircle, LoaderCircle, PanelLeft, WifiOff
	} from '@lucide/svelte';
	import type { GithubBackupState, GithubUser, Vault } from '$lib';
	import type { BackupState, GithubState, RestoreState, SaveState } from './app-types';

	interface Props {
		isOnline: boolean;
		saveState: SaveState;
		githubState: GithubState;
		githubUser?: GithubUser;
		githubBackup?: GithubBackupState;
		backupState: BackupState;
		pendingBackupCount: number;
		restoreModalOpen: boolean;
		restoreState: RestoreState;
		shortcutsOpen: boolean;
		vault?: Vault;
		onToggleSidebar: () => void;
		onBackup: () => void;
		onRestore: () => void;
		onOpenShortcuts: () => void;
	}

	let {
		isOnline, saveState,
		githubState, githubUser, githubBackup, backupState, pendingBackupCount,
		restoreModalOpen, restoreState, shortcutsOpen, vault, onToggleSidebar,
		onBackup, onRestore, onOpenShortcuts
	}: Props = $props();
</script>

<header class="topbar">
	<button class="icon-button collapsed-sidebar-toggle" aria-label="Show notes sidebar" title="Show sidebar (⌘\\)" onclick={onToggleSidebar}><PanelLeft size={19} /></button>
	<div class="top-actions">
		{#if !isOnline}<div class="offline-status" role="status" title="GitHub features are paused until your connection returns"><WifiOff size={14} /><span>Offline</span></div>{/if}
		{#if saveState === 'loading' || saveState === 'error'}
			<div class="save-status" class:error={saveState === 'error'} aria-live="polite">
				{#if saveState === 'loading'}<LoaderCircle class="spin" size={15} />{:else}<CloudOff size={15} />{/if}
				{saveState === 'loading' ? 'Opening…' : 'Save failed'}
			</div>
		{/if}
		{#if githubState === 'connected' && githubUser}
			<button class="backup-button" class:success={backupState === 'success'} class:error={backupState === 'error'} onclick={onBackup} disabled={!isOnline || !vault || backupState === 'backing-up'} title={!isOnline ? 'GitHub backup is unavailable offline' : githubBackup ? `Back up to ${githubBackup.owner}/${githubBackup.repository}` : 'Create a private repository and back up the vault'}>
				{#if backupState === 'backing-up'}<LoaderCircle class="spin" size={15} />{:else}<CloudUpload size={16} />{/if}
				<span>{backupState === 'backing-up' ? 'Backing up…' : 'Back up'}</span>
				{#if pendingBackupCount > 0}<i>{pendingBackupCount}</i>{/if}
			</button>
			<button class="backup-button restore-button" aria-haspopup="dialog" aria-expanded={restoreModalOpen} aria-controls="restore-dialog" onclick={onRestore} disabled={!isOnline || !vault || restoreState === 'restoring'} title={isOnline ? 'Restore a GitHub backup commit' : 'GitHub restore is unavailable offline'}>
				{#if restoreState === 'restoring'}<LoaderCircle class="spin" size={15} />{:else}<CloudDownload size={16} />{/if}
				<span>{restoreState === 'restoring' ? 'Restoring…' : 'Restore'}</span>
			</button>
		{/if}
		<button class="icon-button optional" aria-label="Keyboard shortcuts" aria-haspopup="dialog" aria-expanded={shortcutsOpen} aria-controls="shortcuts-dialog" title="Keyboard shortcuts (?)" onclick={onOpenShortcuts}><HelpCircle size={18} /></button>
	</div>
</header>
