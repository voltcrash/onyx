<script lang="ts">
	import { FileText, LoaderCircle, LogOut, PanelLeftClose, Plus, Search, Settings, WifiOff, X } from '@lucide/svelte';
	import { formatShortcut, type GithubUser, type KeyboardShortcuts, type PrimaryModifier, type VaultSearchResult } from '$lib';
	import GithubIcon from './github-icon.svelte';
	import type { GithubState, SaveState, TransferState } from './app-types';

	interface Props {
		activeNoteId: string;
		results: VaultSearchResult[];
		visibleResults: VaultSearchResult[];
		searchQuery: string;
		notePage: number;
		notePageCount: number;
		saveState: SaveState;
		notesLoaded: boolean;
		transferState: TransferState;
		paletteOpen: boolean;
		settingsOpen: boolean;
		isOnline: boolean;
		githubState: GithubState;
		githubUser?: GithubUser;
		githubMessage: string;
		shortcuts: KeyboardShortcuts;
		primaryModifier: PrimaryModifier;
		storageError: string;
		searchInput?: HTMLInputElement;
		noteList?: HTMLElement;
		onToggleSidebar: () => void;
		onCreateNote: () => void;
		onSearch: (value: string) => void;
		onOpenPalette: () => void;
		onOpenSettings: () => void;
		onDisconnectGithub: () => void;
		onMoveNoteFocus: (event: KeyboardEvent) => void;
		onSelectNote: (id: string) => void;
		onChangePage: (page: number) => void;
	}

	let {
		activeNoteId, results, visibleResults, searchQuery, notePage, notePageCount, saveState, notesLoaded, paletteOpen, settingsOpen,
		isOnline, githubState, githubUser, githubMessage, transferState, storageError, shortcuts, primaryModifier,
		searchInput = $bindable(), noteList = $bindable(), onToggleSidebar, onCreateNote, onSearch,
		onOpenPalette, onOpenSettings, onDisconnectGithub, onMoveNoteFocus, onSelectNote, onChangePage
	}: Props = $props();
</script>

<aside class="sidebar" aria-label="Notes">
	<div class="notes-heading"><div class="notes-title"><button class="icon-button sidebar-toggle" aria-label="Hide notes sidebar" title={`Toggle sidebar (${formatShortcut(shortcuts.toggleSidebar, primaryModifier)})`} onclick={onToggleSidebar}><PanelLeftClose size={19} /></button><h1>Notes</h1></div><div class="notes-actions"><button class="new-note" aria-label="New note" title="New note" disabled={transferState === 'working'} onclick={onCreateNote}><Plus size={17} /></button></div></div>
	<label class="search-box"><Search size={15} /><input bind:this={searchInput} type="search" placeholder="Search all notes" value={searchQuery} oninput={(event) => onSearch(event.currentTarget.value)} /><button type="button" aria-label="Open the command palette" aria-haspopup="dialog" aria-expanded={paletteOpen} aria-controls="command-palette" title={`Run a command (${formatShortcut(shortcuts.commandPalette, primaryModifier)})`} onclick={onOpenPalette}><kbd>{formatShortcut(shortcuts.commandPalette, primaryModifier).replaceAll(' ', '')}</kbd></button></label>
	<div class="result-count" aria-live="polite">{searchQuery ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : `${results.length} ${results.length === 1 ? 'note' : 'notes'}`}</div>
	<nav class="note-list" bind:this={noteList}>
		{#each visibleResults as result (result.note.id)}
			<button class="file" class:active={result.note.id === activeNoteId} aria-current={result.note.id === activeNoteId ? 'true' : undefined} disabled={transferState === 'working'} onkeydown={onMoveNoteFocus} onclick={() => onSelectNote(result.note.id)}>
				<FileText size={16} /><span><strong>{result.note.title}</strong>{#if searchQuery}<small>{result.excerpt || 'Title match'}</small>{/if}</span>{#if result.note.id === activeNoteId}<i></i>{/if}
			</button>
		{:else}
			{#if !notesLoaded && !storageError}
				<div class="empty-results"><LoaderCircle class="spin" size={20} /><strong>Opening your vault…</strong><span>Notes are read from this device.</span></div>
			{:else if searchQuery}
				<div class="empty-results"><Search size={20} /><strong>No notes match “{searchQuery}”</strong><span>Search covers every title and every word.</span><button onclick={() => onSearch('')}><X size={13} /> Clear search</button></div>
			{:else}
				<div class="empty-results"><FileText size={20} /><strong>No notes yet</strong><span>Your first note is one keystroke away.</span><button onclick={onCreateNote}><Plus size={13} /> New note</button></div>
			{/if}
		{/each}
	</nav>
	{#if notePageCount > 1}
		<div class="note-pagination" aria-label="Note list pages">
			<button disabled={notePage === 0} onclick={() => onChangePage(notePage - 1)}>Previous</button>
			<span>Page {notePage + 1} of {notePageCount}</span>
			<button disabled={notePage === notePageCount - 1} onclick={() => onChangePage(notePage + 1)}>Next</button>
		</div>
	{/if}
	<div class="sidebar-footer">
		{#if githubState === 'connected' && githubUser}
			<div class="github-account" class:offline={!isOnline} title={isOnline ? `Connected as ${githubUser.login}` : `Connected as ${githubUser.login}; GitHub is unavailable offline`}><span class="github-avatar" aria-hidden="true">{githubUser.login.slice(0, 1)}</span><span class="github-login">@{githubUser.login}</span><button aria-label="Disconnect GitHub" title={isOnline ? 'Disconnect GitHub' : 'Disconnect is unavailable offline'} disabled={!isOnline} onclick={onDisconnectGithub}><LogOut size={14} /></button></div>
		{:else if !isOnline}
			<button class="github-connect offline" disabled title="GitHub features are unavailable offline" aria-label="GitHub unavailable offline"><WifiOff size={16} /><span>GitHub unavailable</span></button>
		{:else}
			<a class="github-connect" class:error={githubState === 'error'} href="/auth/github/start" title={githubMessage || 'Connect GitHub for direct, private backups'} aria-label="Connect GitHub">{#if githubState === 'loading'}<LoaderCircle class="spin" size={15} />{:else}<GithubIcon size={16} />{/if}<span>{githubState === 'loading' ? 'Checking…' : 'Connect GitHub'}</span></a>
		{/if}
		<button class="icon-button" aria-label="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls="settings-dialog" title="Settings" onclick={onOpenSettings}><Settings size={18} /></button>
	</div>
</aside>
