<script lang="ts">
	import {
		CloudDownload, CloudOff, CloudUpload, Columns2, Eye, HelpCircle, LoaderCircle, LogOut,
		Monitor, Moon, PanelLeft, PencilLine, Save, Search, Settings, Sun, WifiOff
	} from '@lucide/svelte';
	import type { GithubBackupState, GithubUser, ThemePreference, Vault } from '$lib';
	import type { BackupState, GithubState, RestoreState, SaveState, TransferState, ViewMode } from './app-types';

	interface Props {
		viewMode: ViewMode;
		isOnline: boolean;
		saveState: SaveState;
		transferState: TransferState;
		paletteOpen: boolean;
		theme: ThemePreference;
		themeLabel: string;
		settingsOpen: boolean;
		githubState: GithubState;
		githubUser?: GithubUser;
		githubMessage: string;
		githubBackup?: GithubBackupState;
		backupState: BackupState;
		pendingBackupCount: number;
		restoreModalOpen: boolean;
		restoreState: RestoreState;
		shortcutsOpen: boolean;
		vault?: Vault;
		onToggleSidebar: () => void;
		onViewModeChange: (mode: ViewMode) => void;
		onOpenInlinePreview: () => void;
		onSave: () => void;
		onOpenPalette: () => void;
		onCycleTheme: () => void;
		onOpenSettings: () => void;
		onBackup: () => void;
		onRestore: () => void;
		onDisconnectGithub: () => void;
		onOpenShortcuts: () => void;
	}

	let {
		viewMode, isOnline, saveState, transferState, paletteOpen, theme, themeLabel, settingsOpen,
		githubState, githubUser, githubMessage, githubBackup, backupState, pendingBackupCount,
		restoreModalOpen, restoreState, shortcutsOpen, vault, onToggleSidebar, onViewModeChange,
		onOpenInlinePreview, onSave, onOpenPalette, onCycleTheme, onOpenSettings, onBackup, onRestore,
		onDisconnectGithub, onOpenShortcuts
	}: Props = $props();
</script>

<header class="topbar">
	<button class="icon-button collapsed-sidebar-toggle" aria-label="Show notes sidebar" title="Show sidebar (⌘\\)" onclick={onToggleSidebar}><PanelLeft size={19} /></button>
	<div class="topbar-view">
		<div class="view-switcher" aria-label="View mode">
			<button class:active={viewMode === 'edit'} aria-pressed={viewMode === 'edit'} onclick={() => onViewModeChange('edit')} aria-label="Editor only" title="Editor only"><PencilLine size={16} /><span>Edit</span></button>
			<button class:active={viewMode === 'live'} aria-pressed={viewMode === 'live'} onclick={onOpenInlinePreview} aria-label="Inline preview" title="Inline preview"><Eye size={16} /><span>Inline</span></button>
			<button class:active={viewMode === 'split'} aria-pressed={viewMode === 'split'} onclick={() => onViewModeChange('split')} aria-label="Split view" title="Split view"><Columns2 size={16} /><span>Split</span></button>
			<button class:active={viewMode === 'preview'} aria-pressed={viewMode === 'preview'} onclick={() => onViewModeChange('preview')} aria-label="Preview only" title="Preview only"><Eye size={16} /><span>Preview</span></button>
		</div>
	</div>
	<div class="top-actions">
		{#if !isOnline}<div class="offline-status" role="status" title="GitHub features are paused until your connection returns"><WifiOff size={14} /><span>Offline</span></div>{/if}
		{#if saveState === 'loading' || saveState === 'error'}
			<div class="save-status" class:error={saveState === 'error'} aria-live="polite">
				{#if saveState === 'loading'}<LoaderCircle class="spin" size={15} />{:else}<CloudOff size={15} />{/if}
				{saveState === 'loading' ? 'Opening…' : 'Save failed'}
			</div>
		{/if}
		<button class="save-button" onclick={onSave} disabled={saveState === 'saving' || transferState === 'working'}><Save size={16} /><span>Save</span><kbd>⌘S</kbd></button>
		<button class="palette-trigger" aria-label="Open the command palette" aria-haspopup="dialog" aria-expanded={paletteOpen} aria-controls="command-palette" title="Command palette (⌘K)" onclick={onOpenPalette}><Search size={15} /><span>Search or run…</span><kbd>⌘K</kbd></button>
		<button class="icon-button optional" aria-label={`Theme: ${themeLabel}. Change theme`} title={`Theme: ${themeLabel} (⌘⇧L)`} onclick={onCycleTheme}>
			{#if theme === 'system'}<Monitor size={18} />{:else if theme === 'dark'}<Moon size={18} />{:else}<Sun size={18} />{/if}
		</button>
		<button class="icon-button" aria-label="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls="settings-dialog" title="Settings" onclick={onOpenSettings}><Settings size={18} /></button>
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
			<div class="github-account" class:offline={!isOnline} title={isOnline ? `Connected as ${githubUser.login}` : `Connected as ${githubUser.login}; GitHub is unavailable offline`}><img src={githubUser.avatarUrl} alt="" /><span>@{githubUser.login}</span><button aria-label="Disconnect GitHub" title={isOnline ? 'Disconnect GitHub' : 'Disconnect is unavailable offline'} disabled={!isOnline} onclick={onDisconnectGithub}><LogOut size={14} /></button></div>
		{:else if !isOnline}
			<button class="github-connect offline" disabled title="GitHub features are unavailable offline" aria-label="GitHub unavailable offline"><WifiOff size={16} /><span>GitHub unavailable</span></button>
		{:else}
			<a class="github-connect" class:error={githubState === 'error'} href="/auth/github/start" title={githubMessage || 'Connect GitHub for direct, private backups'} aria-label="Connect GitHub">{#if githubState === 'loading'}<LoaderCircle class="spin" size={15} />{:else}<CloudUpload size={16} />{/if}<span>{githubState === 'loading' ? 'Checking…' : 'Connect GitHub'}</span></a>
		{/if}
		<button class="icon-button optional" aria-label="Keyboard shortcuts" aria-haspopup="dialog" aria-expanded={shortcutsOpen} aria-controls="shortcuts-dialog" title="Keyboard shortcuts (?)" onclick={onOpenShortcuts}><HelpCircle size={18} /></button>
	</div>
</header>
