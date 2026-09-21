<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronDown, ChevronRight, Copy, Download, FilePlus2, FileText, Folder, FolderPlus, Image, Paperclip, HardDrive, LoaderCircle, Lock, LockOpen, LogOut, PanelLeft, PanelRight, Pencil, Plus, Search, Settings, Trash2, Type, Undo2, X } from '@lucide/svelte';
	import { formatShortcut, type KeyboardShortcuts, type PrimaryModifier } from '$lib/keyboard-shortcuts';
	import type { GithubUser } from '$lib/github';
	import type { VaultDescriptor } from '$lib/storage/registry';
	import type { AttachmentMetadata, FolderMetadata, NoteMetadata, VaultSearchResult } from '$lib/storage/types';
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
		attachments: AttachmentMetadata[];
		attachmentFolder: string;
		attachmentsHidden: boolean;
		onOpenAttachment: (id: string) => void;
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
		trashedNotes: NoteMetadata[];
		trashOpen: boolean;
		onToggleTrash: () => void;
		onRestoreFile: (id: string) => void;
		onPurgeFile: (id: string) => void;
		onEmptyTrash: () => void;
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
		onMoveNoteFocus: (event: KeyboardEvent) => void;
		onSelectNote: (id: string) => void;
		onChangePage: (page: number) => void;
		onContentWidthChange: (value: number) => void;
	}

	let {
		vaults, activeVaultId, activeNoteId, results, visibleResults, folders, attachments, attachmentFolder, attachmentsHidden, onOpenAttachment, searchQuery, findOpen, findQuery, findReplacement, findMatchCase, findWholeWord, findMatchCount, activeFindMatch, findCanEdit, notePage, notePageCount, saveState, notesLoaded, paletteOpen, searchPending, paletteItems, settingsOpen,
		isOnline, githubState, githubUser, githubMessage, transferState, storageError, shortcuts, primaryModifier, wordCount, readingMinutes, contentWidth,
		searchInput = $bindable(), findInput = $bindable(), findReplaceInput = $bindable(), noteList = $bindable(), onToggleSidebar, onSidebarDragStart, sidebarSide, onSidebarSideChange, onSelectVault, onCreateVault, onRenameVault, onCreateNote, onCreateFile, onCreateFolder, onRenameFile, onRenameFolder, onMoveFile, onMoveFolder, onDeleteFile, onDeleteFolder, trashedNotes, trashOpen, onToggleTrash, onRestoreFile, onPurgeFile, onEmptyTrash, onCopyFilePath, onCopyFileAs, onExportFileAs, onSearch,
		onFindQueryChange, onFindReplacementChange, onFindMatchCaseChange, onFindWholeWordChange, onFindPrevious, onFindNext, onFindReplace, onFindReplaceAll, onCloseFind,
		onOpenPalette, onClosePalette, onOpenSettings, onOpenStorageSettings, onMoveNoteFocus, onSelectNote, onChangePage,
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
		| { kind: 'folder'; key: string; path: string; label: string; depth: number; expanded: boolean; hasChildren: boolean; attachments: boolean }
		| { kind: 'attachment'; key: string; path: string; label: string; depth: number; attachment: AttachmentMetadata }
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

	function trashedNoteLabel(note: NoteMetadata): string {
		const path = note.sourcePath?.trim() || `${note.title || 'Untitled'}.md`;
		return note.title || basename(path).replace(/\.(?:md|markdown)$/i, '') || 'Untitled';
	}

	function trashedNoteDeletedLabel(note: NoteMetadata): string {
		if (!note.deletedAt) return 'In trash';
		try {
			return `Deleted ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(note.deletedAt))}`;
		} catch {
			return 'In trash';
		}
	}

	function isAttachmentPath(path: string): boolean {
		return path === attachmentFolder || path.startsWith(`${attachmentFolder}/`);
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
		const attachmentsByFolder = new Map<string, AttachmentMetadata[]>();
		// Search narrows the tree to matching notes, so attachments only show beside an unfiltered list.
		if (!attachmentsHidden && !searchQuery.trim()) {
			for (const attachment of attachments) {
				const path = attachment.sourcePath;
				if (!path || !isAttachmentPath(path)) continue;
				const folder = parentPath(path);
				addFolder(folder);
				const owned = attachmentsByFolder.get(folder) ?? [];
				owned.push(attachment);
				attachmentsByFolder.set(folder, owned);
			}
		}
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
				const hasChildren = [...folderPaths].some((candidate) => parentPath(candidate) === path) || Boolean(notesByFolder.get(path)?.length) || Boolean(attachmentsByFolder.get(path)?.length);
				const expanded = !collapsedFolders.has(path);
				rows.push({ kind: 'folder', key: `folder:${path}`, path, label: folderLabel(path), depth, expanded, hasChildren, attachments: isAttachmentPath(path) });
				if (expanded) visit(path, depth + 1);
			}
			const childNotes = (notesByFolder.get(parent) ?? []).toSorted((left, right) =>
				noteLabel(left).localeCompare(noteLabel(right), undefined, { sensitivity: 'base' }),
			);
			for (const result of childNotes) {
				rows.push({ kind: 'file', key: `file:${result.note.id}`, path: notePath(result), label: noteLabel(result), depth, result });
			}
			const childAttachments = (attachmentsByFolder.get(parent) ?? []).toSorted((left, right) =>
				left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
			);
			for (const attachment of childAttachments) {
				rows.push({ kind: 'attachment', key: `attachment:${attachment.id}`, path: attachment.sourcePath ?? attachment.name, label: basename(attachment.sourcePath ?? attachment.name), depth, attachment });
			}
		};
		visit('', 0);
		return rows;
	}

	let treeRows = $derived(buildTreeRows());

	const docStatusLabel = $derived(
		saveState === 'loading'
			? 'Opening…'
			: saveState === 'error'
				? 'Save failed'
				: githubState === 'connected' && githubUser
					? `@${githubUser.login}`
					: githubState === 'connected'
						? 'Synced'
						: 'Saved locally',
	);
	const docStatusTone = $derived(saveState === 'error' || githubState === 'error' ? 'error' : saveState === 'loading' ? 'busy' : 'ok');

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

	const SWIPE_WHEEL_THRESHOLD = 60;
	const SWIPE_TOUCH_THRESHOLD = 50;
	const SWIPE_GESTURE_IDLE_MS = 180;
	let sidebarElement = $state<HTMLElement>();
	let swipePanel = $state<HTMLElement>();
	let wheelDistance = 0;
	let wheelLocked = false;
	let wheelIdleTimer: ReturnType<typeof setTimeout> | undefined;
	let touchStart: { x: number; y: number } | undefined;

	function isSwipeExempt(target: EventTarget | null): boolean {
		return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable], [role="menu"], .file-context-menu'));
	}

	function switchVaultBy(step: 1 | -1): void {
		if (transferState === 'working' || vaults.length < 2) return;
		const index = vaults.findIndex((vault) => vault.id === activeVaultId);
		const next = vaults[index + step];
		if (!next) return;
		onSelectVault(next.id);
		if (!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
			swipePanel?.animate(
				[{ transform: `translateX(${step * 28}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
				{ duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
			);
		}
	}

	function handleSidebarWheel(event: WheelEvent): void {
		if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || isSwipeExempt(event.target)) return;
		event.preventDefault();
		// One trackpad swipe emits a stream of wheel events plus inertia; switch once per stream.
		clearTimeout(wheelIdleTimer);
		wheelIdleTimer = setTimeout(() => {
			wheelDistance = 0;
			wheelLocked = false;
		}, SWIPE_GESTURE_IDLE_MS);
		if (wheelLocked) return;
		wheelDistance += event.deltaX;
		if (Math.abs(wheelDistance) < SWIPE_WHEEL_THRESHOLD) return;
		wheelLocked = true;
		switchVaultBy(wheelDistance > 0 ? 1 : -1);
	}

	// Svelte registers onwheel as passive; preventDefault is needed to stop browser history swipes.
	$effect(() => {
		const element = sidebarElement;
		if (!element) return;
		element.addEventListener('wheel', handleSidebarWheel, { passive: false });
		return () => {
			element.removeEventListener('wheel', handleSidebarWheel);
			clearTimeout(wheelIdleTimer);
		};
	});

	function handleSidebarTouchStart(event: TouchEvent): void {
		touchStart = event.touches.length === 1 && !isSwipeExempt(event.target) ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : undefined;
	}

	function handleSidebarTouchEnd(event: TouchEvent): void {
		const start = touchStart;
		touchStart = undefined;
		const touch = event.changedTouches[0];
		if (!start || !touch) return;
		const dx = touch.clientX - start.x;
		const dy = touch.clientY - start.y;
		if (Math.abs(dx) < SWIPE_TOUCH_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
		switchVaultBy(dx < 0 ? 1 : -1);
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			if (contextMenu) closeContextMenu();
			else if (naming) cancelNaming();
			else if (trashOpen && !paletteOpen && !findOpen) onToggleTrash();
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

<aside class="sidebar" aria-label="Notes" oncontextmenu={openSidebarContextMenu} bind:this={sidebarElement} ontouchstart={handleSidebarTouchStart} ontouchend={handleSidebarTouchEnd} ontouchcancel={() => (touchStart = undefined)}>
	<div class="notes-heading"><div class="notes-title"><VaultSwitcher {vaults} {activeVaultId} disabled={transferState === 'working'} {onSelectVault} {onCreateVault} {onRenameVault} /></div><div class="notes-actions"><button class="icon-button search-palette-button" type="button" aria-label="Open the command palette" aria-haspopup="listbox" aria-expanded={paletteOpen} aria-controls="command-palette" title={`Search notes and commands (${formatShortcut(shortcuts.commandPalette, primaryModifier)})`} onclick={onOpenPalette}><Search size={19} aria-hidden="true" /></button><button class="icon-button trash-button" type="button" aria-label={trashedNotes.length ? `Trash, ${trashedNotes.length} ${trashedNotes.length === 1 ? 'note' : 'notes'}` : 'Trash, empty'} aria-expanded={trashOpen} title="Open trash" disabled={transferState === 'working'} onclick={onToggleTrash}><Trash2 size={19} aria-hidden="true" />{#if trashedNotes.length}<span class="trash-badge" aria-hidden="true">{trashedNotes.length > 99 ? '99+' : trashedNotes.length}</span>{/if}</button><button class="icon-button sidebar-toggle" onpointerdown={onSidebarDragStart} aria-label="Hide notes sidebar" title={`Toggle sidebar (${formatShortcut(shortcuts.toggleSidebar, primaryModifier)})`} onclick={onToggleSidebar}><PanelLeft size={19} /></button></div></div>
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
	{:else if trashOpen}
		<div class="sidebar-panel trash-panel" aria-label="Trash">
			<div class="trash-panel-header">
				<div class="trash-panel-title"><strong>Trash</strong><span>Deleted notes stay here for 30 days.</span></div>
				<button class="icon-button" type="button" aria-label="Close trash" title="Close trash" onclick={onToggleTrash}><X size={17} /></button>
			</div>
			{#if trashedNotes.length === 0}
				<div class="trash-empty">Trash is empty.</div>
			{:else}
				<ul class="trash-list">
					{#each trashedNotes as trashed (trashed.id)}
						<li class="trash-row" title={trashedNoteDeletedLabel(trashed)}>
							<button class="trash-name" onclick={() => onRestoreFile(trashed.id)} title={`Restore ${trashedNoteLabel(trashed)}`}>
								<FileText size={15} /><span>{trashedNoteLabel(trashed)}</span>
							</button>
							<button class="trash-icon-button" aria-label={`Restore ${trashedNoteLabel(trashed)}`} title="Restore" disabled={transferState === 'working'} onclick={() => onRestoreFile(trashed.id)}><Undo2 size={14} /></button>
							<button class="trash-icon-button danger" aria-label={`Delete ${trashedNoteLabel(trashed)} forever`} title="Delete forever" disabled={transferState === 'working'} onclick={() => onPurgeFile(trashed.id)}><X size={14} /></button>
						</li>
					{/each}
				</ul>
				<button class="trash-empty-button" disabled={transferState === 'working'} onclick={onEmptyTrash}>Empty trash</button>
			{/if}
		</div>
	{:else}
		<div class="sidebar-panel files-panel" bind:this={swipePanel}>
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
						{#if row.kind === 'folder' && row.attachments}
							<button class="file-tree-row folder-row attachment-folder-row" data-folder-path={row.path} style={`--tree-depth: ${row.depth}`} aria-expanded={row.expanded} title="Attachments — right-click to rename or delete" onclick={() => toggleFolder(row.path)} oncontextmenu={(event) => openFolderContextMenu(event, row.path)}>
								<span class="file-tree-caret">{#if row.hasChildren}{#if row.expanded}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}{:else}<span></span>{/if}</span><Paperclip size={16} /><span class="file-tree-name">{row.label}</span>
							</button>
						{:else if row.kind === 'attachment'}
							<button class="file file-tree-row attachment-row" data-attachment-path={row.path} style={`--tree-depth: ${row.depth}`} title={`Open ${row.label}`} onclick={() => onOpenAttachment(row.attachment.id)}>
								{#if row.attachment.type.startsWith('image/')}<Image size={16} />{:else}<Paperclip size={16} />{/if}<span><strong>{row.label}</strong></span>
							</button>
						{:else if row.kind === 'folder'}
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
		</div>
	{/if}
	{#if vaults.length > 1 && !paletteOpen}
		<div class="vault-dots" role="tablist" aria-label="Repositories (swipe the sidebar to switch)">
			{#each vaults as vault (vault.id)}
				<button role="tab" aria-selected={vault.id === activeVaultId} aria-label={vault.name} title={vault.name} class:active={vault.id === activeVaultId} disabled={transferState === 'working'} onclick={() => { if (vault.id !== activeVaultId) onSelectVault(vault.id); }}></button>
			{/each}
		</div>
	{/if}
	<div class="sidebar-footer">
		<button
			class="doc-status"
			data-tone={docStatusTone}
			class:offline={!isOnline}
			title={githubState === 'connected' && githubUser ? `Synced as @${githubUser.login}` : githubMessage || 'Notes are saved on this device'}
			aria-label={`${wordCount} words, ${readingMinutes} minute reading time, ${docStatusLabel}. Open local storage settings.`}
			onclick={onOpenStorageSettings}
		><span class="doc-status-text">{wordCount} {wordCount === 1 ? 'word' : 'words'} · {readingMinutes} min · {docStatusLabel}</span><i class="doc-status-dot" aria-hidden="true"></i></button>
		<button class="icon-button" aria-label="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls="settings-dialog" title="Settings" onclick={onOpenSettings}><Settings size={18} /></button>
	</div>
</aside>
