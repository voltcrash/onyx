<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronDown, ChevronRight, Copy, Download, FilePlus2, FileText, Folder, FolderPlus, HardDrive, LoaderCircle, Lock, LockOpen, LogOut, PanelLeft, PanelRight, Pencil, Plus, Search, Settings, Trash2, Type } from '@lucide/svelte';
	import { formatShortcut, type KeyboardShortcuts, type PrimaryModifier } from '$lib/keyboard-shortcuts';
	import type { GithubUser } from '$lib/github';
	import type { VaultDescriptor } from '$lib/storage/registry';
	import type { FolderMetadata, VaultSearchResult } from '$lib/storage/types';
	import GithubIcon from './github-icon.svelte';
	import VaultSwitcher from './vault-switcher.svelte';
	import FindReplace from './find-replace.svelte';
	import CommandPalette, { type PaletteControl, type PaletteItem } from './command-palette.svelte';
	import type { GithubState, SaveState, TransferState } from './app-types';
	import { noteFormats, type NoteFormat } from './note-formats';

	interface Props {
		vaults: VaultDescriptor[];
		activeVaultId: string;
		activeNoteId: string;
		results: VaultSearchResult[];
		visibleResults: VaultSearchResult[];
		folders: FolderMetadata[];
		searchQuery: string;
		findOpen: boolean;
		findQuery: string;
		findReplacement: string;
		findMatchCase: boolean;
		findWholeWord: boolean;
		findMatchCount: number;
		activeFindMatch: number;
		findCanEdit: boolean;
		notePage: number;
		notePageCount: number;
		saveState: SaveState;
		notesLoaded: boolean;
		transferState: TransferState;
		paletteOpen: boolean;
		searchPending: boolean;
		settingsOpen: boolean;
		isOnline: boolean;
		githubState: GithubState;
		githubUser?: GithubUser;
		githubMessage: string;
		shortcuts: KeyboardShortcuts;
		primaryModifier: PrimaryModifier;
		storageError: string;
		wordCount: number;
		readingMinutes: number;
		contentWidth: number;
		paletteItems: PaletteItem[];
		searchInput?: HTMLInputElement;
		findInput?: HTMLInputElement;
		findReplaceInput?: HTMLInputElement;
		noteList?: HTMLElement;
		onToggleSidebar: () => void;
		onSidebarDragStart: (event: PointerEvent) => void;
		sidebarSide: 'left' | 'right';
		onSidebarSideChange: (side: 'left' | 'right') => void;
		onSelectVault: (id: string) => void;
		onCreateVault: () => void;
		onRenameVault: (id: string, name: string) => void;
		onCreateNote: () => void;
		onCreateFile: (folderPath: string, name: string) => void;
		onCreateFolder: (parentPath: string, name: string) => void;
		onRenameFile: (id: string, name: string) => void;
		onRenameFolder: (path: string, name: string) => void;
		onMoveFile: (id: string, folderPath: string) => void;
		onMoveFolder: (path: string, parentPath: string) => void;
		onDeleteFile: (id: string) => void;
		onDeleteFolder: (path: string) => void;
		onCopyFilePath: (path: string) => void;
		onCopyFileAs: (id: string, format: Exclude<NoteFormat, 'pdf'>) => void;
		onExportFileAs: (id: string, format: NoteFormat) => void;
		onSearch: (value: string) => void;
		onFindQueryChange: (value: string) => void;
		onFindReplacementChange: (value: string) => void;
		onFindMatchCaseChange: (value: boolean) => void;
		onFindWholeWordChange: (value: boolean) => void;
		onFindPrevious: () => void;
		onFindNext: () => void;
		onFindReplace: () => void;
		onFindReplaceAll: () => void;
		onCloseFind: () => void;
		onOpenPalette: () => void;
		onClosePalette: () => void;
		onOpenSettings: () => void;
		onOpenStorageSettings: () => void;
		onDisconnectGithub: () => void;
		onMoveNoteFocus: (event: KeyboardEvent) => void;
		onSelectNote: (id: string) => void;
		onChangePage: (page: number) => void;
		onContentWidthChange: (value: number) => void;
	}

	let {
		vaults, activeVaultId, activeNoteId, results, visibleResults, folders, searchQuery, findOpen, findQuery, findReplacement, findMatchCase, findWholeWord, findMatchCount, activeFindMatch, findCanEdit, notePage, notePageCount, saveState, notesLoaded, paletteOpen, searchPending, paletteItems, settingsOpen,
		isOnline, githubState, githubUser, githubMessage, transferState, storageError, shortcuts, primaryModifier, wordCount, readingMinutes, contentWidth,
		searchInput = $bindable(), findInput = $bindable(), findReplaceInput = $bindable(), noteList = $bindable(), onToggleSidebar, onSidebarDragStart, sidebarSide, onSidebarSideChange, onSelectVault, onCreateVault, onRenameVault, onCreateNote, onCreateFile, onCreateFolder, onRenameFile, onRenameFolder, onMoveFile, onMoveFolder, onDeleteFile, onDeleteFolder, onCopyFilePath, onCopyFileAs, onExportFileAs, onSearch,
		onFindQueryChange, onFindReplacementChange, onFindMatchCaseChange, onFindWholeWordChange, onFindPrevious, onFindNext, onFindReplace, onFindReplaceAll, onCloseFind,
		onOpenPalette, onClosePalette, onOpenSettings, onOpenStorageSettings, onDisconnectGithub, onMoveNoteFocus, onSelectNote, onChangePage,
		onContentWidthChange
	}: Props = $props();

	const paletteControls = $derived<PaletteControl[]>([
		{
			id: 'content-width',
			group: 'View',
			label: 'Content width',
			keywords: 'page text reading width',
			icon: Type,
			control: 'range',
			value: contentWidth,
			min: 480,
			max: 1200,
			step: 20,
			onChange: onContentWidthChange,
		},
	]);
	type TreeRow =
		| { kind: 'folder'; key: string; path: string; label: string; depth: number; expanded: boolean; hasChildren: boolean }
		| { kind: 'file'; key: string; path: string; label: string; depth: number; result: VaultSearchResult };
	type ContextMenu =
		| { kind: 'root'; x: number; y: number }
		| { kind: 'sidebar'; x: number; y: number }
		| { kind: 'folder'; path: string; x: number; y: number }
		| { kind: 'file'; id: string; path: string; x: number; y: number };
	type NamingState =
		| { action: 'create-file'; parentPath: string }
		| { action: 'create-folder'; parentPath: string }
		| { action: 'rename-file'; id: string }
		| { action: 'rename-folder'; path: string };
	type DraggedEntry =
		| { kind: 'file'; id: string; path: string }
		| { kind: 'folder'; path: string };

	let collapsedFolders = $state<Set<string>>(new Set());
	let contextMenu = $state<ContextMenu>();
	let contextSubmenu = $state<'export' | 'copy'>();
	let naming = $state<NamingState>();
	let draftName = $state('');
	let namingInput = $state<HTMLInputElement>();
	let draggedEntry = $state<DraggedEntry>();
	let dropTargetPath = $state<string>();

	function pathParts(path: string): string[] {
		return path.split('/').filter(Boolean);
	}

	function parentPath(path: string): string {
		return pathParts(path).slice(0, -1).join('/');
	}

	function basename(path: string): string {
		return pathParts(path).at(-1) ?? '';
	}

	function joinPath(parent: string, name: string): string {
		return [...pathParts(parent), name].join('/');
	}

	function notePath(result: VaultSearchResult): string {
		return result.note.sourcePath?.trim() || `${result.note.title || 'Untitled'}.md`;
	}

	function noteFolder(result: VaultSearchResult): string {
		return parentPath(notePath(result));
	}

	function noteLabel(result: VaultSearchResult): string {
		return result.note.title || basename(notePath(result)).replace(/\.(?:md|markdown)$/i, '') || 'Untitled';
	}

	function folderLabel(path: string): string {
		return basename(path) || path;
	}

	function buildTreeRows(): TreeRow[] {
		const folderPaths = new Set<string>();
		const notesByFolder = new Map<string, VaultSearchResult[]>();
		const addFolder = (path: string): void => {
			let current = '';
			for (const part of pathParts(path)) {
				current = joinPath(current, part);
				folderPaths.add(current);
			}
		};
		for (const folder of folders) addFolder(folder.path);
		for (const result of visibleResults) {
			const folder = noteFolder(result);
			if (folder) addFolder(folder);
			const notes = notesByFolder.get(folder) ?? [];
			notes.push(result);
			notesByFolder.set(folder, notes);
		}

		const rows: TreeRow[] = [];
		const visit = (parent: string, depth: number): void => {
			const childFolders = [...folderPaths]
				.filter((path) => parentPath(path) === parent)
				.sort((left, right) => folderLabel(left).localeCompare(folderLabel(right), undefined, { sensitivity: 'base' }));
			for (const path of childFolders) {
				const hasChildren = [...folderPaths].some((candidate) => parentPath(candidate) === path) || Boolean(notesByFolder.get(path)?.length);
				const expanded = !collapsedFolders.has(path);
				rows.push({ kind: 'folder', key: `folder:${path}`, path, label: folderLabel(path), depth, expanded, hasChildren });
				if (expanded) visit(path, depth + 1);
			}
			const childNotes = (notesByFolder.get(parent) ?? []).toSorted((left, right) =>
				noteLabel(left).localeCompare(noteLabel(right), undefined, { sensitivity: 'base' }),
			);
			for (const result of childNotes) {
				rows.push({ kind: 'file', key: `file:${result.note.id}`, path: notePath(result), label: noteLabel(result), depth, result });
			}
		};
		visit('', 0);
		return rows;
	}

	let treeRows = $derived(buildTreeRows());

	function menuPosition(event: MouseEvent): { x: number; y: number } {
		const width = 210;
		const height = 285;
		return {
			x: Math.max(8, Math.min(event.clientX, globalThis.innerWidth - width - 8)),
			y: Math.max(8, Math.min(event.clientY, globalThis.innerHeight - height - 8)),
		};
	}

	function openRootContextMenu(event: MouseEvent): void {
		event.preventDefault();
		contextMenu = { kind: 'root', ...menuPosition(event) };
	}

	function openSidebarContextMenu(event: MouseEvent): void {
		if (event.defaultPrevented) return;
		const target = event.target as Element | null;
		if (target?.closest('button, a, input, textarea, select, [contenteditable], [role="menu"], [role="listbox"]')) return;
		event.preventDefault();
		contextMenu = { kind: 'sidebar', ...menuPosition(event) };
	}

	function contextSetSidebarSide(side: 'left' | 'right'): void {
		contextAction(() => onSidebarSideChange(side));
	}

	function openFolderContextMenu(event: MouseEvent, path: string): void {
		event.preventDefault();
		event.stopPropagation();
		contextMenu = { kind: 'folder', path, ...menuPosition(event) };
	}

	function openFileContextMenu(event: MouseEvent, result: VaultSearchResult): void {
		event.preventDefault();
		event.stopPropagation();
		contextMenu = { kind: 'file', id: result.note.id, path: notePath(result), ...menuPosition(event) };
	}

	function closeContextMenu(): void {
		contextMenu = undefined;
		contextSubmenu = undefined;
	}

	async function beginNaming(state: NamingState): Promise<void> {
		closeContextMenu();
		naming = state;
		const target = state.action === 'rename-file'
			? visibleResults.find((result) => result.note.id === state.id) ?? results.find((result) => result.note.id === state.id)
			: undefined;
		draftName = state.action === 'create-file'
			? 'Untitled.md'
			: state.action === 'create-folder'
				? 'New folder'
				: state.action === 'rename-file'
					? target ? noteLabel(target) : 'Untitled.md'
					: folderLabel(state.path);
		if ('parentPath' in state && state.parentPath) {
			const next = new Set(collapsedFolders);
			next.delete(state.parentPath);
			collapsedFolders = next;
		}
		await tick();
		namingInput?.focus();
		namingInput?.select();
	}

	function cancelNaming(): void {
		naming = undefined;
		draftName = '';
	}

	function commitNaming(): void {
		const state = naming;
		const name = draftName.trim();
		if (!state || !name) {
			cancelNaming();
			return;
		}
		cancelNaming();
		if (state.action === 'create-file') onCreateFile(state.parentPath, name);
		else if (state.action === 'create-folder') onCreateFolder(state.parentPath, name);
		else if (state.action === 'rename-file') onRenameFile(state.id, name);
		else onRenameFolder(state.path, name);
	}

	function handleNamingKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitNaming();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelNaming();
		}
	}

	function toggleFolder(path: string): void {
		const next = new Set(collapsedFolders);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		collapsedFolders = next;
	}

	function canDropOn(entry: DraggedEntry, targetPath: string): boolean {
		if (entry.kind === 'file') return parentPath(entry.path) !== targetPath;
		return entry.path !== targetPath && !targetPath.startsWith(`${entry.path}/`) && parentPath(entry.path) !== targetPath;
	}

	function startDrag(event: DragEvent, entry: DraggedEntry): void {
		if (transferState === 'working') {
			event.preventDefault();
			return;
		}
		draggedEntry = entry;
		event.dataTransfer?.setData('application/x-onyx-file-tree', JSON.stringify(entry));
		event.dataTransfer?.setData('text/plain', entry.path);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function endDrag(): void {
		draggedEntry = undefined;
		dropTargetPath = undefined;
	}

	function isFileTreeRow(target: EventTarget | null): boolean {
		return target instanceof HTMLElement && Boolean(target.closest('.file-tree-row'));
	}

	function keepDropTarget(event: DragEvent, path: string): void {
		const entry = draggedEntry;
		if (!entry || !canDropOn(entry, path)) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		dropTargetPath = path;
	}

	function clearDropTarget(event: DragEvent, path: string): void {
		const currentTarget = event.currentTarget;
		const relatedTarget = event.relatedTarget;
		if (currentTarget instanceof HTMLElement && relatedTarget instanceof HTMLElement && currentTarget.contains(relatedTarget)) return;
		if (dropTargetPath === path) dropTargetPath = undefined;
	}

	function dropOnFolder(event: DragEvent, path: string): void {
		const entry = draggedEntry;
		if (!entry || !canDropOn(entry, path)) return;
		event.preventDefault();
		event.stopPropagation();
		endDrag();
		if (entry.kind === 'file') onMoveFile(entry.id, path);
		else onMoveFolder(entry.path, path);
	}

	function keepRootDropTarget(event: DragEvent): void {
		if (!draggedEntry || isFileTreeRow(event.target)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		dropTargetPath = '';
	}

	function clearRootDropTarget(event: DragEvent): void {
		const currentTarget = event.currentTarget;
		const relatedTarget = event.relatedTarget;
		if (currentTarget instanceof HTMLElement && relatedTarget instanceof HTMLElement && currentTarget.contains(relatedTarget)) return;
		if (dropTargetPath === '') dropTargetPath = undefined;
	}

	function dropOnRoot(event: DragEvent): void {
		const entry = draggedEntry;
		if (!entry || isFileTreeRow(event.target)) return;
		event.preventDefault();
		endDrag();
		if (entry.kind === 'file') onMoveFile(entry.id, '');
		else onMoveFolder(entry.path, '');
	}

	function contextAction(action: () => void): void {
		closeContextMenu();
		action();
	}

	function contextExportAs(format: NoteFormat): void {
		const menu = contextMenu;
		if (menu?.kind !== 'file') return;
		contextAction(() => onExportFileAs(menu.id, format));
	}

	function contextCopyAs(format: NoteFormat): void {
		const menu = contextMenu;
		if (menu?.kind !== 'file' || format === 'pdf') return;
		contextAction(() => onCopyFileAs(menu.id, format));
	}

	function contextCreateFile(): void {
		const menu = contextMenu;
		if (!menu) return;
		contextAction(() => void beginNaming({ action: 'create-file', parentPath: menu.kind === 'folder' ? menu.path : '' }));
	}

	function contextCreateFolder(): void {
		const menu = contextMenu;
		if (!menu) return;
		contextAction(() => void beginNaming({ action: 'create-folder', parentPath: menu.kind === 'folder' ? menu.path : '' }));
	}

	function contextRenameFolder(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'folder') return;
		contextAction(() => void beginNaming({ action: 'rename-folder', path: menu.path }));
	}

	function contextCopyPath(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'folder' && menu?.kind !== 'file') return;
		contextAction(() => onCopyFilePath(menu.path));
	}

	function contextDeleteFolder(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'folder') return;
		contextAction(() => onDeleteFolder(menu.path));
	}

	function contextOpenFile(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'file') return;
		contextAction(() => onSelectNote(menu.id));
	}

	function contextRenameFile(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'file') return;
		contextAction(() => void beginNaming({ action: 'rename-file', id: menu.id }));
	}

	function contextDeleteFile(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'file') return;
		contextAction(() => onDeleteFile(menu.id));
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			if (contextMenu) closeContextMenu();
			else if (naming) cancelNaming();
		}
	}

</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#snippet sidebarPositionItems()}
	<button role="menuitemradio" aria-checked={sidebarSide === 'left'} onclick={() => contextSetSidebarSide('left')}><PanelLeft size={15} /><span>Sidebar on the left</span></button>
	<button role="menuitemradio" aria-checked={sidebarSide === 'right'} onclick={() => contextSetSidebarSide('right')}><PanelRight size={15} /><span>Sidebar on the right</span></button>
{/snippet}

{#snippet formatSubmenu(kind: 'export' | 'copy', label: string, formats: typeof noteFormats)}
	<div class="file-context-group" role="none" onmouseenter={() => (contextSubmenu = kind)} onmouseleave={() => (contextSubmenu = undefined)}>
		<button role="menuitem" aria-haspopup="menu" aria-expanded={contextSubmenu === kind} disabled={transferState === 'working'} onclick={() => (contextSubmenu = contextSubmenu === kind ? undefined : kind)}>
			{#if kind === 'export'}<Download size={15} />{:else}<Copy size={15} />{/if}<span>{label}</span><ChevronRight size={14} />
		</button>
		{#if contextSubmenu === kind}
			<div class="file-context-menu file-context-submenu" role="menu" aria-label={label}>
				{#each formats as format (format.id)}
					<button role="menuitem" onclick={() => (kind === 'export' ? contextExportAs(format.id) : contextCopyAs(format.id))}><span>{format.label}</span></button>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<aside class="sidebar" aria-label="Notes" oncontextmenu={openSidebarContextMenu}>
	<div class="notes-heading"><div class="notes-title"><VaultSwitcher {vaults} {activeVaultId} disabled={transferState === 'working'} {onSelectVault} {onCreateVault} {onRenameVault} /></div><div class="notes-actions"><button class="icon-button search-palette-button" type="button" aria-label="Open the command palette" aria-haspopup="listbox" aria-expanded={paletteOpen} aria-controls="command-palette" title={`Search notes and commands (${formatShortcut(shortcuts.commandPalette, primaryModifier)})`} onclick={onOpenPalette}><Search size={19} aria-hidden="true" /></button><button class="icon-button sidebar-toggle" onpointerdown={onSidebarDragStart} aria-label="Hide notes sidebar" title={`Toggle sidebar (${formatShortcut(shortcuts.toggleSidebar, primaryModifier)})`} onclick={onToggleSidebar}><PanelLeft size={19} /></button></div></div>
	{#if paletteOpen}
		<CommandPalette items={paletteItems} controls={paletteControls} query={searchQuery} loading={searchPending} bind:searchInput onQueryChange={onSearch} onClose={onClosePalette} />
	{:else if findOpen}
		<FindReplace
			query={findQuery}
			replacement={findReplacement}
			matchCase={findMatchCase}
			wholeWord={findWholeWord}
			matchCount={findMatchCount}
			activeMatch={activeFindMatch}
			canEdit={findCanEdit}
			{primaryModifier}
			bind:findInput
			bind:replaceInput={findReplaceInput}
			onQueryChange={onFindQueryChange}
			onReplacementChange={onFindReplacementChange}
			onMatchCaseChange={onFindMatchCaseChange}
			onWholeWordChange={onFindWholeWordChange}
			onPrevious={onFindPrevious}
			onNext={onFindNext}
			onReplace={onFindReplace}
			onReplaceAll={onFindReplaceAll}
			onClose={onCloseFind}
		/>
	{:else}
		<div class="sidebar-panel files-panel">
			<div class="file-toolbar">
				<div class="result-count" aria-live="polite">{results.length} {results.length === 1 ? 'note' : 'notes'}</div>
				<div class="file-actions" aria-label="File actions">
					<button class="file-action" aria-label="New file" title="New file" disabled={transferState === 'working'} onclick={() => void beginNaming({ action: 'create-file', parentPath: '' })}><FilePlus2 size={16} /></button>
					<button class="file-action" aria-label="New folder" title="New folder" disabled={transferState === 'working'} onclick={() => void beginNaming({ action: 'create-folder', parentPath: '' })}><FolderPlus size={16} /></button>
				</div>
			</div>
			<nav class="note-list" class:drop-target={dropTargetPath === ''} bind:this={noteList} oncontextmenu={openRootContextMenu} ondragover={keepRootDropTarget} ondragleave={(event) => clearRootDropTarget(event)} ondrop={dropOnRoot}>
				{#if naming && (naming.action === 'create-file' || naming.action === 'create-folder')}
					<div class="file-naming-row" style={`--tree-depth: ${naming.parentPath ? 1 : 0}`}>
						{#if naming.action === 'create-folder'}<Folder size={16} />{:else}<FileText size={16} />{/if}
						<input bind:this={namingInput} bind:value={draftName} aria-label={naming.action === 'create-folder' ? 'Folder name' : 'File name'} spellcheck="false" onblur={commitNaming} onkeydown={handleNamingKeydown} />
					</div>
				{/if}
				{#if treeRows.length === 0 && !(naming && (naming.action === 'create-file' || naming.action === 'create-folder'))}
					{#if !notesLoaded && !storageError}
						<div class="empty-results"><LoaderCircle class="spin" size={20} /><strong>Opening your vault…</strong><span>Notes are read from this device.</span></div>
					{:else}
						<div class="empty-results"><FileText size={20} /><strong>No notes yet</strong><span>Your first note is one keystroke away.</span><button onclick={onCreateNote}><Plus size={13} /> New note</button></div>
					{/if}
				{:else}
					{#each treeRows as row (row.key)}
						{#if row.kind === 'folder'}
							<button class="file-tree-row folder-row" class:drop-target={dropTargetPath === row.path} class:dragging={draggedEntry?.kind === 'folder' && draggedEntry.path === row.path} data-folder-path={row.path} style={`--tree-depth: ${row.depth}`} aria-expanded={row.expanded} title="Drag to move folder" draggable="true" disabled={transferState === 'working'} onclick={() => toggleFolder(row.path)} oncontextmenu={(event) => openFolderContextMenu(event, row.path)} ondragstart={(event) => startDrag(event, { kind: 'folder', path: row.path })} ondragend={endDrag} ondragover={(event) => keepDropTarget(event, row.path)} ondragleave={(event) => clearDropTarget(event, row.path)} ondrop={(event) => dropOnFolder(event, row.path)}>
								<span class="file-tree-caret">{#if row.hasChildren}{#if row.expanded}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}{:else}<span></span>{/if}</span><Folder size={16} /><span class="file-tree-name">{row.label}</span>
							</button>
						{:else}
							<button class="file file-tree-row" class:active={row.result.note.id === activeNoteId} class:dragging={draggedEntry?.kind === 'file' && draggedEntry.id === row.result.note.id} data-file-path={row.path} style={`--tree-depth: ${row.depth}`} aria-current={row.result.note.id === activeNoteId ? 'true' : undefined} title="Drag to move file" draggable="true" disabled={transferState === 'working'} onkeydown={onMoveNoteFocus} onclick={() => onSelectNote(row.result.note.id)} oncontextmenu={(event) => openFileContextMenu(event, row.result)} ondragstart={(event) => startDrag(event, { kind: 'file', id: row.result.note.id, path: row.path })} ondragend={endDrag}>
												<FileText size={16} /><span>{#if naming?.action === 'rename-file' && naming.id === row.result.note.id}<input class="file-inline-input" bind:this={namingInput} bind:value={draftName} aria-label="File name" spellcheck="false" onblur={commitNaming} onkeydown={handleNamingKeydown} />{:else}<strong>{row.label}</strong>{/if}</span>{#if row.result.note.id === activeNoteId}<i></i>{/if}
							</button>
						{/if}
					{/each}
				{/if}
			</nav>
			{#if contextMenu}
				<button class="file-context-backdrop" aria-label="Close file menu" onclick={closeContextMenu}></button>
				<div class="file-context-menu" role="menu" aria-label={contextMenu.kind === 'sidebar' ? 'Sidebar actions' : 'File actions'} style={`top: ${contextMenu.y}px; left: ${contextMenu.x}px`}>
					{#if contextMenu.kind === 'sidebar'}
						{@render sidebarPositionItems()}
					{:else if contextMenu.kind === 'root' || contextMenu.kind === 'folder'}
						<button role="menuitem" disabled={transferState === 'working'} onclick={contextCreateFile}><FilePlus2 size={15} /><span>New file</span></button>
						<button role="menuitem" disabled={transferState === 'working'} onclick={contextCreateFolder}><FolderPlus size={15} /><span>New folder</span></button>
						{#if contextMenu.kind === 'folder'}
							<div class="file-context-divider"></div>
							<button role="menuitem" disabled={transferState === 'working'} onclick={contextRenameFolder}><Pencil size={15} /><span>Rename</span></button>
							<button role="menuitem" onclick={contextCopyPath}><Copy size={15} /><span>Copy relative path</span></button>
							<button role="menuitem" class="danger" disabled={transferState === 'working'} onclick={contextDeleteFolder}><Trash2 size={15} /><span>Delete</span></button>
						{:else}
							<div class="file-context-divider"></div>
							{@render sidebarPositionItems()}
						{/if}
					{:else}
						<button role="menuitem" disabled={transferState === 'working'} onclick={contextOpenFile}><FileText size={15} /><span>Open</span></button>
						<button role="menuitem" disabled={transferState === 'working'} onclick={contextRenameFile}><Pencil size={15} /><span>Rename</span></button>
						<button role="menuitem" onclick={contextCopyPath}><Copy size={15} /><span>Copy relative path</span></button>
						<div class="file-context-divider"></div>
						{@render formatSubmenu('export', 'Export as', noteFormats)}
						{@render formatSubmenu('copy', 'Copy as', noteFormats.filter((format) => format.copyable))}
						<div class="file-context-divider"></div>
						<button role="menuitem" class="danger" disabled={transferState === 'working'} onclick={contextDeleteFile}><Trash2 size={15} /><span>Delete</span></button>
					{/if}
				</div>
			{/if}
			{#if notePageCount > 1}
				<div class="note-pagination" aria-label="Note list pages">
					<button disabled={notePage === 0} onclick={() => onChangePage(notePage - 1)}>Previous</button>
					<span>Page {notePage + 1} of {notePageCount}</span>
					<button disabled={notePage === notePageCount - 1} onclick={() => onChangePage(notePage + 1)}>Next</button>
				</div>
			{/if}
			<section class="document-details">
				<h2>Document</h2>
				<div><span>Words</span><strong>{wordCount}</strong></div>
				<div><span>Reading time</span><strong>{readingMinutes} min</strong></div>
				<div><span>Status</span><strong>{saveState === 'loading' ? 'Opening' : saveState === 'error' ? 'Save failed' : 'Saved locally'}</strong></div>
			</section>
		</div>
	{/if}
	<div class="sidebar-footer">
		{#if githubState === 'connected' && githubUser}
			<div class="github-account" class:offline={!isOnline} title={isOnline ? `GitHub sync enabled as ${githubUser.login}` : `Signed in as ${githubUser.login}; sync is paused offline`}><span class="github-avatar" aria-hidden="true">{githubUser.login.slice(0, 1)}</span><span class="github-login">@{githubUser.login}</span><button aria-label="Turn off GitHub sync" title={isOnline ? 'Turn off GitHub sync' : 'GitHub sync is unavailable offline'} disabled={!isOnline} onclick={onDisconnectGithub}><LogOut size={14} /></button></div>
		{:else}
			<button class="github-connect" class:error={githubState === 'error'} title={githubMessage || 'Notes are saved on this device'} aria-label="Open local storage settings" onclick={onOpenStorageSettings}><HardDrive size={16} /><span>Saved locally</span></button>
		{/if}
		<button class="icon-button" aria-label="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls="settings-dialog" title="Settings" onclick={onOpenSettings}><Settings size={18} /></button>
	</div>
</aside>
