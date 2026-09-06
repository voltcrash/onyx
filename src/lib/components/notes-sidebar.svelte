<script lang="ts">
	import { FileText, LoaderCircle, PanelLeftClose, Plus, Search, X } from '@lucide/svelte';
	import type { VaultSearchResult } from '$lib';
	import type { SaveState, TransferState } from './app-types';

	interface Props {
		activeNoteId: string;
		results: VaultSearchResult[];
		visibleResults: VaultSearchResult[];
		searchQuery: string;
		notePage: number;
		notePageCount: number;
		saveState: SaveState;
		transferState: TransferState;
		storageError: string;
		searchInput?: HTMLInputElement;
		noteList?: HTMLElement;
		onToggleSidebar: () => void;
		onCreateNote: () => void;
		onSearch: (value: string) => void;
		onMoveNoteFocus: (event: KeyboardEvent) => void;
		onSelectNote: (id: string) => void;
		onChangePage: (page: number) => void;
	}

	let {
		activeNoteId, results, visibleResults, searchQuery, notePage, notePageCount, saveState,
		transferState, storageError, searchInput = $bindable(), noteList = $bindable(),
		onToggleSidebar, onCreateNote, onSearch, onMoveNoteFocus, onSelectNote, onChangePage
	}: Props = $props();
</script>

<aside class="sidebar" aria-label="Notes">
	<div class="notes-heading"><div class="notes-title"><button class="icon-button sidebar-toggle" aria-label="Hide notes sidebar" title="Toggle sidebar (⌘\\)" onclick={onToggleSidebar}><PanelLeftClose size={19} /></button><h1>Notes</h1></div><div class="notes-actions"><button class="new-note" aria-label="New note" title="New note" disabled={transferState === 'working'} onclick={onCreateNote}><Plus size={17} /></button></div></div>
	<label class="search-box"><Search size={15} /><input bind:this={searchInput} type="search" placeholder="Search all notes" value={searchQuery} oninput={(event) => onSearch(event.currentTarget.value)} /><kbd>⌘⇧F</kbd></label>
	<div class="result-count" aria-live="polite">{searchQuery ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : `${results.length} ${results.length === 1 ? 'note' : 'notes'}`}</div>
	<nav class="note-list" bind:this={noteList}>
		{#each visibleResults as result (result.note.id)}
			<button class="file" class:active={result.note.id === activeNoteId} aria-current={result.note.id === activeNoteId ? 'true' : undefined} disabled={transferState === 'working'} onkeydown={onMoveNoteFocus} onclick={() => onSelectNote(result.note.id)}>
				<FileText size={16} /><span><strong>{result.note.title}</strong>{#if searchQuery}<small>{result.excerpt || 'Title match'}</small>{/if}</span>{#if result.note.id === activeNoteId}<i></i>{/if}
			</button>
		{:else}
			{#if saveState === 'loading' && !storageError}
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
</aside>
