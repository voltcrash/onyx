<script lang="ts">
  import { compareSidebarNotes } from "#lib/sidebar-sort.ts";
  import type { SidebarSort } from "#lib/browser-storage.ts";
	import { onDestroy, tick, untrack } from 'svelte';
	import { Archive, BriefcaseBusiness, CalendarDays, Camera, ChevronDown, ChevronRight, Code2, Copy, Download, ExternalLink, FilePlus2, FileText, Folder, FolderPlus, HardDrive, Heart, House, Image, Lightbulb, LoaderCircle, Lock, LockOpen, LogOut, Music2, Palette, Paperclip, PanelLeft, PanelRight, Pencil, Pin, Plane, Plus, Rocket, Search, Settings, Sparkles, Star, Tag, Trash2, Type, Undo2, X, type LucideIcon } from '@lucide/svelte';
	import { formatShortcut, type KeyboardShortcuts, type PrimaryModifier } from '#lib/keyboard-shortcuts.ts';
	import { folderIconOptions, isFolderIcon, type FolderIcon } from '#lib/folder-icons.ts';
	import type { GithubUser } from '#lib/github.ts';
	import type { VaultDescriptor } from '#lib/storage/registry.ts';
	import type { AttachmentMetadata, FolderMetadata, NoteMetadata, VaultSearchResult } from '#lib/storage/types.ts';
	import GithubIcon from './github-icon.svelte';
	import VaultSwitcher from './vault-switcher.svelte';
	import FindReplace from './find-replace.svelte';
	import type { PaletteControl, PaletteItem } from './command-palette.svelte';
	import type { MenuEntry } from './file-context-menu.svelte';
	import type { GithubState, SaveState, TransferState } from './app-types';
	import { noteFormats, type NoteFormat } from './note-formats';

	interface Props {
    sidebarSort: SidebarSort;
    onSidebarSort: (value: SidebarSort) => void;
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
		onOpenAttachmentInNewTab: (id: string) => void;
		onDeleteAttachment: (id: string) => void;
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
		searchError: string;
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
		onRenameVault: (id: string, name: string) => Promise<void>;
		onCreateNote: () => void;
		onCreateFile: (folderPath: string, name: string) => Promise<void>;
		onCreateFolder: (parentPath: string, name: string) => Promise<void>;
		onRenameFile: (id: string, name: string) => Promise<void>;
		onRenameFolder: (path: string, name: string) => Promise<void>;
		onSetFolderIcon: (path: string, icon?: FolderIcon) => void;
		onSetFolderPinned: (path: string, pinned: boolean) => void;
		onSetNotePinned: (id: string, pinned: boolean) => void;
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

	let { sidebarSort, onSidebarSort,
		vaults, activeVaultId, activeNoteId, results, visibleResults, folders, attachments, attachmentFolder, attachmentsHidden, onOpenAttachment, onOpenAttachmentInNewTab, onDeleteAttachment, searchQuery, findOpen, findQuery, findReplacement, findMatchCase, findWholeWord, findMatchCount, activeFindMatch, findCanEdit, notePage, notePageCount, saveState, notesLoaded, paletteOpen, searchPending, searchError, paletteItems, settingsOpen,
		isOnline, githubState, githubUser, githubMessage, transferState, storageError, shortcuts, primaryModifier, wordCount, readingMinutes, contentWidth,
		searchInput = $bindable(), findInput = $bindable(), findReplaceInput = $bindable(), noteList = $bindable(), onToggleSidebar, onSidebarDragStart, sidebarSide, onSidebarSideChange, onSelectVault, onCreateVault, onRenameVault, onCreateNote, onCreateFile, onCreateFolder, onRenameFile, onRenameFolder, onSetFolderIcon, onSetFolderPinned, onMoveFile, onMoveFolder, onDeleteFile, onDeleteFolder, trashedNotes, trashOpen, onToggleTrash, onRestoreFile, onPurgeFile, onEmptyTrash, onCopyFilePath, onCopyFileAs, onExportFileAs, onSearch,
		onSetNotePinned,
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
		| { kind: 'folder'; key: string; path: string; label: string; depth: number; expanded: boolean; hasChildren: boolean; attachments: boolean; pinned: boolean; icon?: FolderIcon | 'paperclip' }
		| { kind: 'attachment'; key: string; path: string; label: string; depth: number; attachment: AttachmentMetadata }
		| { kind: 'file'; key: string; path: string; label: string; depth: number; result: VaultSearchResult };
	type ContextMenu =
		| { kind: 'root'; x: number; y: number }
		| { kind: 'sidebar'; x: number; y: number }
		| { kind: 'folder'; path: string; x: number; y: number }
		| { kind: 'attachment'; id: string; path: string; x: number; y: number }
		| { kind: 'file'; id: string; path: string; pinned: boolean; x: number; y: number };
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
	const folderIconComponents: Record<FolderIcon, LucideIcon> = {
		archive: Archive,
		briefcase: BriefcaseBusiness,
		calendar: CalendarDays,
		camera: Camera,
		code: Code2,
		heart: Heart,
		home: House,
		lightbulb: Lightbulb,
		music: Music2,
		palette: Palette,
		plane: Plane,
		rocket: Rocket,
		sparkles: Sparkles,
		star: Star,
		tag: Tag,
	};


	let naming = $state<NamingState>();
	let namingBusy = $state(false);
	let namingError = $state('');
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

	function folderIconForPath(path: string): FolderIcon | undefined {
		const icon = folders.find((folder) => folder.path === path)?.icon;
		return isFolderIcon(icon) ? icon : undefined;
	}

	function folderPinnedForPath(path: string): boolean {
		return folders.find((folder) => folder.path === path)?.pinned === true;
	}

	function folderIconComponent(icon: FolderIcon | 'paperclip' | undefined): LucideIcon {
		return icon === 'paperclip' ? Paperclip : icon ? folderIconComponents[icon] : Folder;
	}

	function buildTreeRows(): TreeRow[] {
		const folderPaths = new Set<string>();
		const folderIcons = new Map(folders.map((folder) => [folder.path, folder.icon]));
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
				.sort((left, right) =>
					Number(folderPinnedForPath(right)) - Number(folderPinnedForPath(left)) ||
					folderLabel(left).localeCompare(folderLabel(right), undefined, { sensitivity: 'base' }),
				);
			for (const path of childFolders) {
				const hasChildren = [...folderPaths].some((candidate) => parentPath(candidate) === path) || Boolean(notesByFolder.get(path)?.length) || Boolean(attachmentsByFolder.get(path)?.length);
				const expanded = !collapsedFolders.has(path);
				const customIcon = folderIcons.get(path);
				rows.push({ kind: 'folder', key: `folder:${path}`, path, label: folderLabel(path), depth, expanded, hasChildren, attachments: isAttachmentPath(path), pinned: folderPinnedForPath(path), icon: isFolderIcon(customIcon) ? customIcon : isAttachmentPath(path) ? 'paperclip' : undefined });
				if (expanded) visit(path, depth + 1);
			}
			const childNotes = (notesByFolder.get(parent) ?? []).toSorted((left, right) =>
				compareSidebarNotes(left.note, right.note, sidebarSort),
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
                : saveState === 'unsaved' ? 'Unsaved changes'
                : saveState === 'saving' ? 'Saving…'
				: githubState === 'connected' && githubUser
					? `@${githubUser.login}`
					: githubState === 'connected'
						? 'Synced'
						: 'Saved locally',
	);
	const docStatusTone = $derived(saveState === 'error' || githubState === 'error' ? 'error' : saveState === 'loading' ? 'busy' : 'ok');

	function menuPosition(event: MouseEvent): { x: number; y: number } {
    return { x: event.clientX, y: event.clientY };
  }

	function showFolderContextMenu(path: string, x: number, y: number): void {
		contextMenu = { kind: 'folder', path, x, y };
	}

	function showAttachmentContextMenu(attachment: AttachmentMetadata, x: number, y: number): void {
		if (!attachment.type.startsWith('image/')) return;
		contextMenu = {
			kind: 'attachment',
			id: attachment.id,
			path: attachment.sourcePath ?? attachment.name,
			x, y,
		};
	}

	function showFileContextMenu(result: VaultSearchResult, x: number, y: number): void {
		contextMenu = { kind: 'file', id: result.note.id, path: notePath(result), pinned: result.note.pinned === true, x, y };
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
		showFolderContextMenu(path, event.clientX, event.clientY);
	}

	function openAttachmentContextMenu(event: MouseEvent, attachment: AttachmentMetadata): void {
		if (!attachment.type.startsWith('image/')) return;
		event.preventDefault();
		event.stopPropagation();
		showAttachmentContextMenu(attachment, event.clientX, event.clientY);
	}

	function openFileContextMenu(event: MouseEvent, result: VaultSearchResult): void {
		event.preventDefault();
		event.stopPropagation();
		showFileContextMenu(result, event.clientX, event.clientY);
	}

	const LONG_PRESS_MS = 500;
	const LONG_PRESS_MOVE_PX = 10;
	let longPressTimer: ReturnType<typeof setTimeout> | undefined;
	let longPressStart: { x: number; y: number } | undefined;
	let suppressRowClickUntil = 0;

	function clearLongPress(): void {
		if (longPressTimer !== undefined) clearTimeout(longPressTimer);
		longPressTimer = undefined;
		longPressStart = undefined;
	}

	function handleRowTouchStart(event: TouchEvent, onLongPress: (x: number, y: number) => void): void {
		if (event.touches.length !== 1) {
			clearLongPress();
			return;
		}
		const touch = event.touches[0];
		const x = touch.clientX;
		const y = touch.clientY;
		clearLongPress();
		longPressStart = { x, y };
		longPressTimer = setTimeout(() => {
			longPressTimer = undefined;
			longPressStart = undefined;
			touchStart = undefined;
			suppressRowClickUntil = Date.now() + 1000;
			try {
				navigator.vibrate?.(10);
			} catch {
				// Haptics are best-effort.
			}
			onLongPress(x, y);
		}, LONG_PRESS_MS);
	}

	function handleRowTouchMove(event: TouchEvent): void {
		if (event.touches.length !== 1) { clearLongPress(); touchStart = undefined; return; }
		const start = longPressStart;
		if (!start || longPressTimer === undefined) return;
		const touch = event.touches[0] ?? event.changedTouches[0];
		if (!touch) return;
		if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > LONG_PRESS_MOVE_PX) clearLongPress();
	}

	function handleRowTouchEnd(): void {
		clearLongPress();
	}

	function shouldSuppressRowClick(): boolean {
		if (Date.now() < suppressRowClickUntil) {
			suppressRowClickUntil = 0;
			return true;
		}
		return false;
	}

	function handleFileRowClick(id: string): void {
		if (shouldSuppressRowClick()) return;
		onSelectNote(id);
	}

	function handleFolderRowClick(path: string): void {
		if (shouldSuppressRowClick()) return;
		toggleFolder(path);
	}

	function closeContextMenu(): void {
		contextMenu = undefined;
	}

	async function beginNaming(state: NamingState): Promise<void> {
		closeContextMenu();
		if (namingBusy) return;
		naming = state;
		namingError = '';
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
		namingBusy = false;
		namingError = '';
		draftName = '';
	}

	async function commitNaming(): Promise<void> {
		if (namingBusy) return;
		const state = naming;
		const name = draftName.trim();
		if (!state || !name) { cancelNaming(); return; }
		namingBusy = true;
		namingError = '';
		try {
			if (state.action === 'create-file') await onCreateFile(state.parentPath, name);
			else if (state.action === 'create-folder') await onCreateFolder(state.parentPath, name);
			else if (state.action === 'rename-file') await onRenameFile(state.id, name);
			else await onRenameFolder(state.path, name);
			if (naming === state) cancelNaming();
		} catch (error) {
			if (naming === state) namingError = error instanceof Error ? error.message : 'The name could not be saved.';
		} finally {
			if (naming === state) {
				namingBusy = false;
				await tick();
				if (naming === state) namingInput?.focus();
			}
		}
	}

	function handleNamingKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitNaming();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			if (!namingBusy) cancelNaming();
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
		if (menu?.kind !== 'folder' && menu?.kind !== 'file' && menu?.kind !== 'attachment') return;
		contextAction(() => onCopyFilePath(menu.path));
	}

	function contextDeleteFolder(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'folder') return;
		contextAction(() => onDeleteFolder(menu.path));
	}

	function contextSetFolderIcon(icon?: FolderIcon): void {
		const menu = contextMenu;
		if (menu?.kind !== 'folder') return;
		contextAction(() => onSetFolderIcon(menu.path, icon));
	}

	function contextToggleFolderPinned(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'folder') return;
		contextAction(() => onSetFolderPinned(menu.path, !folderPinnedForPath(menu.path)));
	}

	function contextToggleNotePinned(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'file') return;
		contextAction(() => onSetNotePinned(menu.id, !menu.pinned));
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

	function contextOpenAttachment(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'attachment') return;
		contextAction(() => onOpenAttachmentInNewTab(menu.id));
	}

	function contextDeleteAttachment(): void {
		const menu = contextMenu;
		if (menu?.kind !== 'attachment') return;
		contextAction(() => onDeleteAttachment(menu.id));
	}

	const SWIPE_WHEEL_THRESHOLD = 60;
	const SWIPE_TOUCH_THRESHOLD = 50;
	const SWIPE_GESTURE_IDLE_MS = 240;
	const SWIPE_ANIMATION_MS = 300;
	const SWIPE_ANIMATION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
	let sidebarElement = $state<HTMLElement>();
	let swipePanel = $state<HTMLElement>();
	let wheelDistance = 0;
	let wheelLocked = false;
	let lastSwipeStep: 1 | -1 | undefined;
	let wheelIdleTimer: ReturnType<typeof setTimeout> | undefined;
	let swipeAnimation: Animation | undefined;
	// The vault on screen, which trails activeVaultId until its swipe transition starts.
	let shownVaultId = untrack(() => activeVaultId);
	let touchStart: { x: number; y: number } | undefined;

	function isSwipeExempt(target: EventTarget | null): boolean {
		return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable], [role="menu"], .file-context-menu'));
	}

	function prefersReducedMotion(): boolean {
		return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
	}

	// The transition runs after the new vault renders, so the incoming workspace
	// slides in instead of the outgoing one flashing mid-swap.
	function playSwipeTransition(step: 1 | -1): void {
		const panel = swipePanel;
		if (!panel || prefersReducedMotion()) return;
		swipeAnimation?.cancel();
		void tick().then(() => {
			if (!panel.isConnected) return;
			swipeAnimation?.cancel();
			swipeAnimation = panel.animate(
				[
					{ transform: `translateX(${step * 48}px)`, opacity: 0.25 },
					{ transform: 'translateX(0)', opacity: 1 },
				],
				{ duration: SWIPE_ANIMATION_MS, easing: SWIPE_ANIMATION_EASING },
			);
			swipeAnimation.onfinish = () => {
				if (swipeAnimation?.playState === 'finished') swipeAnimation = undefined;
			};
		});
	}

	// Any vault change (swipe, dots, menu) glides in from the direction of travel.
	$effect(() => {
		const current = activeVaultId;
		const previous = shownVaultId;
		if (current === previous) return;
		untrack(() => {
			closeContextMenu();
			cancelNaming();
			endDrag();
			clearLongPress();
			collapsedFolders = new Set();
			touchStart = undefined;
		});
		const from = vaults.findIndex((vault) => vault.id === previous);
		const to = vaults.findIndex((vault) => vault.id === current);
		shownVaultId = current;
		if (from === -1 || to === -1 || from === to) return;
		playSwipeTransition(to > from ? 1 : -1);
	});

	function resetSwipeGesture(): void {
		wheelDistance = 0;
		wheelLocked = false;
		lastSwipeStep = undefined;
	}

	function switchVaultBy(step: 1 | -1): boolean {
		if (transferState === 'working' || vaults.length < 2) return false;
		const index = vaults.findIndex((vault) => vault.id === activeVaultId);
		const next = vaults[index + step];
		if (!next) return false;
		onSelectVault(next.id);
		return true;
	}

	function handleSidebarWheel(event: WheelEvent): void {
		if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || isSwipeExempt(event.target)) return;
		event.preventDefault();
		const direction = event.deltaX > 0 ? 1 : -1;
		// Reversing direction starts a fresh gesture and lifts the single-switch
		// lock, so swiping straight back in the same trackpad stream switches back.
		if (wheelDistance !== 0 && Math.sign(wheelDistance) !== direction) {
			wheelDistance = 0;
			wheelLocked = false;
		} else if (wheelLocked && lastSwipeStep !== undefined && direction !== lastSwipeStep) {
			wheelLocked = false;
			wheelDistance = 0;
		}
		// One trackpad swipe emits a stream of wheel events plus inertia; allow one
		// switch per direction per stream, resetting after the stream settles.
		clearTimeout(wheelIdleTimer);
		wheelIdleTimer = setTimeout(resetSwipeGesture, SWIPE_GESTURE_IDLE_MS);
		if (wheelLocked) return;
		wheelDistance += event.deltaX;
		if (Math.abs(wheelDistance) < SWIPE_WHEEL_THRESHOLD) return;
		const step = wheelDistance > 0 ? 1 : -1;
		// A fresh accumulator means the opposite swipe needs only its own threshold.
		wheelDistance = 0;
		if (!switchVaultBy(step)) return;
		lastSwipeStep = step;
		wheelLocked = true;
	}

	// Svelte registers onwheel as passive; preventDefault is needed to stop browser history swipes.
	$effect(() => {
		const element = sidebarElement;
		if (!element) return;
		element.addEventListener('wheel', handleSidebarWheel, { passive: false });
		return () => {
			element.removeEventListener('wheel', handleSidebarWheel);
			clearTimeout(wheelIdleTimer);
			swipeAnimation?.cancel();
			swipeAnimation = undefined;
		};
	});

	// Side buttons on multi-button mice (back = 3, forward = 4) step between
	// workspaces, mirroring the swipe gesture for mouse users.
	function handleSidebarMouseButton(event: MouseEvent): void {
		if (event.button !== 3 && event.button !== 4) return;
		if (isSwipeExempt(event.target)) return;
		// History navigation is the default action of the press on some
		// platforms and of the release on others, so suppress every stage and
		// only switch on mousedown to avoid double-stepping.
		event.preventDefault();
		if (event.type !== 'mousedown') return;
		if (switchVaultBy(event.button === 4 ? 1 : -1)) resetSwipeGesture();
	}

	// Capture every stage of the side-button press; the navigation default can
	// fire on pointerdown (before mousedown bubbles), and Svelte's delegated
	// bubble listeners are too late to suppress it.
	$effect(() => {
		const element = sidebarElement;
		if (!element) return;
		const types = ['pointerdown', 'mousedown', 'mouseup', 'auxclick'] as const;
		const listener = handleSidebarMouseButton as EventListener;
		for (const type of types) element.addEventListener(type, listener, { passive: false, capture: true });
		return () => {
			for (const type of types) element.removeEventListener(type, listener, { capture: true });
		};
	});

	function handleSidebarTouchStart(event: TouchEvent): void {
		touchStart = event.touches.length === 1 && !isSwipeExempt(event.target) ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : undefined;
	}

	onDestroy(clearLongPress);

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

  function contextEntries(): MenuEntry[] {
    const menu = contextMenu;
    if (!menu) return [];
    const disabled = transferState === 'working';
    const position: MenuEntry[] = [
      { label: 'Sidebar on the left', icon: PanelLeft, checked: sidebarSide === 'left', radio: true, action: () => contextSetSidebarSide('left') },
      { label: 'Sidebar on the right', icon: PanelRight, checked: sidebarSide === 'right', radio: true, action: () => contextSetSidebarSide('right') },
    ];
    const copyPath: MenuEntry = { label: 'Copy relative path', icon: Copy, action: contextCopyPath };
    if (menu.kind === 'sidebar') return position;
    if (menu.kind === 'root' || menu.kind === 'folder') {
      const entries: MenuEntry[] = [
        { label: 'New file', icon: FilePlus2, disabled, action: contextCreateFile },
        { label: 'New folder', icon: FolderPlus, disabled, action: contextCreateFolder }, {},
      ];
      if (menu.kind === 'root') return [...entries, ...position];
      const pinned = folderPinnedForPath(menu.path);
      entries.push(
        { label: pinned ? 'Unpin folder' : 'Pin folder', icon: Pin, checked: pinned, disabled, action: contextToggleFolderPinned },
        { label: 'Rename', icon: Pencil, disabled, action: contextRenameFolder },
      );
      if (!isAttachmentPath(menu.path)) entries.push({
        label: 'Set icon', icon: Folder, disabled, iconGrid: true, children: [
          { label: 'Default folder icon', icon: Folder, checked: !folderIconForPath(menu.path), radio: true, action: () => contextSetFolderIcon() },
          ...folderIconOptions.map(option => ({ label: option.label, icon: folderIconComponents[option.id],
            checked: folderIconForPath(menu.path) === option.id, radio: true, action: () => contextSetFolderIcon(option.id) })),
        ],
      });
      return [...entries, copyPath, { label: 'Delete', icon: Trash2, danger: true, disabled, action: contextDeleteFolder }];
    }
    if (menu.kind === 'attachment') return [
      { label: 'Open in new tab', icon: ExternalLink, disabled, action: contextOpenAttachment }, copyPath, {},
      { label: 'Delete', icon: Trash2, danger: true, disabled, action: contextDeleteAttachment },
    ];
    return [
      { label: 'Open', icon: FileText, disabled, action: contextOpenFile },
      { label: menu.pinned ? 'Unpin file' : 'Pin file', icon: Pin, checked: menu.pinned, disabled, action: contextToggleNotePinned },
      { label: 'Rename', icon: Pencil, disabled, action: contextRenameFile }, copyPath, {},
      { label: 'Export as', icon: Download, disabled, children: noteFormats.map(format => ({ label: format.label, action: () => contextExportAs(format.id) })) },
      { label: 'Copy as', icon: Copy, disabled, children: noteFormats.filter(format => format.copyable).map(format => ({ label: format.label, action: () => contextCopyAs(format.id) })) }, {},
      { label: 'Delete', icon: Trash2, danger: true, disabled, action: contextDeleteFile },
    ];
  }

	function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]'))) return;
    if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) && event.target instanceof HTMLElement && event.target.matches('[data-folder-path], [data-file-path], [data-attachment-path]')) {
      event.preventDefault();
      const bounds = event.target.getBoundingClientRect();
      event.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: bounds.left + 12, clientY: bounds.bottom }));
      return;
    }

		if (event.key === 'Escape') {
			if (contextMenu) closeContextMenu();
			else if (naming && !namingBusy) cancelNaming();
			else if (trashOpen && !paletteOpen && !findOpen) onToggleTrash();
		}
	}

</script>

<svelte:window onkeydown={handleWindowKeydown} />

<aside class="sidebar [overscroll-behavior-x:none] [grid-row:1_/_-1] [grid-column:1] flex flex-col min-h-0 pt-3 px-3 pb-2 [border-right:1px_solid_var(--line)] bg-sidebar [.sidebar-collapsed_&]:hidden [&_h1]:m-0 [&_h1]:[font-family:'Newsreader_Variable',_Georgia,_'Times_New_Roman',_serif] [&_h1]:text-ui-24 [&_h1]:font-medium [&_h1]:[letter-spacing:-0.035em] [.sidebar-right_&]:[grid-column:2] [.sidebar-right_&]:[border-right:0] [.sidebar-right_&]:[border-left:1px_solid_var(--line)] [@media((max-width:_900px))]:fixed! [@media((max-width:_900px))]:[inset:0_auto_0_0]! [@media((max-width:_900px))]:z-20! [@media((max-width:_900px))]:flex! [@media((max-width:_900px))]:w-64.5! [@media((max-width:_900px))]:[box-shadow:var(--shadow-panel)]! [@media((max-width:_900px))]:[transform:translateX(-105%)]! [@media((max-width:_900px))]:[transition:transform_0.22s_ease]! [@media((max-width:_900px))]:[.sidebar-collapsed_&]:fixed! [@media((max-width:_900px))]:[.sidebar-collapsed_&]:[inset:0_auto_0_0]! [@media((max-width:_900px))]:[.sidebar-collapsed_&]:z-20! [@media((max-width:_900px))]:[.sidebar-collapsed_&]:flex! [@media((max-width:_900px))]:[.sidebar-collapsed_&]:w-64.5! [@media((max-width:_900px))]:[.sidebar-collapsed_&]:[box-shadow:var(--shadow-panel)]! [@media((max-width:_900px))]:[.sidebar-collapsed_&]:[transform:translateX(-105%)]! [@media((max-width:_900px))]:[.sidebar-collapsed_&]:[transition:transform_0.22s_ease]! [@media((max-width:_900px))]:[.sidebar-right_&]:[inset:0_0_0_auto]! [@media((max-width:_900px))]:[.sidebar-right_&]:[transform:translateX(105%)]! [@media((max-width:_900px))]:[.sidebar-right.sidebar-collapsed_&]:[inset:0_0_0_auto]! [@media((max-width:_900px))]:[.sidebar-right.sidebar-collapsed_&]:[transform:translateX(105%)]! [@media((max-width:_900px))]:[.sidebar-open_&]:[transform:translateX(0)]! [@media((max-width:_900px))]:[.sidebar-right.sidebar-open_&]:[transform:translateX(0)]!" aria-label="Notes" oncontextmenu={openSidebarContextMenu} bind:this={sidebarElement} ontouchstart={handleSidebarTouchStart} ontouchend={handleSidebarTouchEnd} ontouchcancel={() => (touchStart = undefined)}>
	<div class="notes-heading flex items-center justify-between gap-1.5 mt-0 mr-1.75 mb-3 ml-1.75"><div class="notes-title flex items-center min-w-0 gap-1.75"><VaultSwitcher {vaults} {activeVaultId} disabled={transferState === 'working'} {onSelectVault} {onCreateVault} {onRenameVault} /></div><div class="notes-actions flex items-center gap-1.5"><button class="icon-button search-palette-button border-0 bg-transparent cursor-pointer w-8.5 h-8.5 grid place-items-center rounded-md text-muted [transition:background_0.15s_ease,_color_0.15s_ease] [&:hover]:bg-subtle-strong [&:hover]:text-ink [.sidebar-footer_&]:w-7 [.sidebar-footer_&]:h-7" type="button" aria-label="Open the command palette" aria-haspopup="listbox" aria-expanded={paletteOpen} aria-controls="command-palette" title={`Search notes and commands (${formatShortcut(shortcuts.commandPalette, primaryModifier)})`} onclick={onOpenPalette}><Search size={19} aria-hidden="true" /></button><button class="icon-button sidebar-toggle border-0 bg-transparent cursor-pointer w-8.5 h-8.5 grid place-items-center rounded-md text-muted [transition:background_0.15s_ease,_color_0.15s_ease] [&:hover]:bg-subtle-strong [&:hover]:text-ink [.sidebar-footer_&]:w-7 [.sidebar-footer_&]:h-7 [touch-action:none] [-webkit-touch-callout:none] select-none" onpointerdown={onSidebarDragStart} aria-label="Hide notes sidebar" title={`Toggle sidebar (${formatShortcut(shortcuts.toggleSidebar, primaryModifier)})`} onclick={onToggleSidebar}><PanelLeft size={19} /></button></div></div>
	{#if paletteOpen}
		{#await Promise.all([import('./command-palette.svelte'), import('#lib/lazy-styles.ts').then((styles) => styles.loadMenuStyles())]) then [{ default: CommandPalette }]}
		<CommandPalette items={paletteItems} controls={paletteControls} query={searchQuery} loading={searchPending} error={searchError} bind:searchInput onQueryChange={onSearch} onClose={onClosePalette} />
		{/await}
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
		<div class="sidebar-panel trash-panel flex-1 min-h-0 flex flex-col overflow-y-auto [scrollbar-width:thin]" aria-label="Trash">
			<div class="trash-panel-header flex items-start justify-between gap-2 pt-2.75 pr-1 pb-1.5 pl-2.5">
				<div class="trash-panel-title flex flex-col gap-0.5 [&_>_strong]:text-ink [&_>_strong]:text-ui-13 [&_>_strong]:[font-weight:650] [&_>_span]:text-faint [&_>_span]:text-ui-11"><strong>Trash</strong><span>Deleted notes stay here for 30 days.</span></div>
				<button class="icon-button border-0 bg-transparent cursor-pointer w-8.5 h-8.5 grid place-items-center rounded-md text-muted [transition:background_0.15s_ease,_color_0.15s_ease] [&:hover]:bg-subtle-strong [&:hover]:text-ink [.sidebar-footer_&]:w-7 [.sidebar-footer_&]:h-7" type="button" aria-label="Close trash" title={`Close trash (${formatShortcut(shortcuts.openTrash, primaryModifier)})`} onclick={onToggleTrash}><X size={17} /></button>
			</div>
			{#if trashedNotes.length === 0}
				<div class="trash-empty py-1.5 px-2.5 text-faint text-ui-11">Trash is empty.</div>
			{:else}
				<ul class="trash-list flex-1 min-h-0 flex flex-col gap-0.5 m-0 pt-0 pr-1 pb-0 pl-0 overflow-y-auto [list-style:none] [scrollbar-width:thin]">
					{#each trashedNotes as trashed (trashed.id)}
						<li class="trash-row flex items-center gap-0.5 pt-0.5 pr-1 pb-0.5 pl-2.5 rounded-md [&:hover]:bg-subtle" title={trashedNoteDeletedLabel(trashed)}>
							<button class="trash-name min-w-0 flex-1 flex items-center gap-2 py-1.5 px-1 border-0 bg-transparent text-ink-soft cursor-pointer text-ui-12 text-left [&_>_span]:min-w-0 [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap [&:hover]:text-ink" onclick={() => onRestoreFile(trashed.id)} title={`Restore ${trashedNoteLabel(trashed)}`}>
								<FileText size={15} /><span>{trashedNoteLabel(trashed)}</span>
							</button>
							<button class="trash-icon-button grid flex-none place-items-center w-6.5 h-6.5 border-0 rounded-md bg-transparent text-faint cursor-pointer [&:hover:not(:disabled)]:bg-subtle-strong [&:hover:not(:disabled)]:text-ink [&:disabled]:opacity-45 [&:disabled]:cursor-not-allowed" aria-label={`Restore ${trashedNoteLabel(trashed)}`} title="Restore" disabled={transferState === 'working'} onclick={() => onRestoreFile(trashed.id)}><Undo2 size={14} /></button>
							<button class="trash-icon-button danger grid flex-none place-items-center w-6.5 h-6.5 border-0 rounded-md bg-transparent text-faint cursor-pointer [&:hover:not(:disabled)]:bg-subtle-strong [&:hover:not(:disabled)]:text-ink [&:disabled]:opacity-45 [&:disabled]:cursor-not-allowed [.file-context-menu_button&]:text-danger [.file-context-menu_button&:hover:not(:disabled)]:bg-danger-bg [.file-context-menu_button&:hover:not(:disabled)]:text-danger [.trash-icon-button&:hover:not(:disabled)]:bg-danger-bg [.trash-icon-button&:hover:not(:disabled)]:text-danger [.settings-danger_button&]:border-danger-border [.settings-danger_button&]:bg-surface [.settings-danger_button&]:text-danger [.settings-danger_button&:hover]:border-accent-strong [.settings-danger_button&:hover]:text-danger-strong [.modal-actions_button&]:border-danger-solid [.modal-actions_button&]:bg-danger-solid [.modal-actions_button&]:[color:#fff]" aria-label={`Delete ${trashedNoteLabel(trashed)} forever`} title="Delete forever" disabled={transferState === 'working'} onclick={() => onPurgeFile(trashed.id)}><X size={14} /></button>
						</li>
					{/each}
				</ul>
				<button class="trash-empty-button [align-self:flex-start] mt-0.5 mr-0 mb-0.5 ml-2.5 py-1.25 px-2.25 border border-line rounded-md bg-transparent text-danger cursor-pointer text-ui-11 [&:hover:not(:disabled)]:bg-danger-bg [&:disabled]:opacity-45 [&:disabled]:cursor-not-allowed" disabled={transferState === 'working'} onclick={onEmptyTrash}>Empty trash</button>
			{/if}
		</div>
	{:else}
		<div class="sidebar-panel files-panel flex-1 min-h-0 flex flex-col" bind:this={swipePanel}>
			<div class="file-toolbar flex items-center justify-between gap-2 min-h-7.75 pt-1 px-1.5 pb-0.75">
				<div class="result-count [.file-toolbar_&]:p-0 pt-2.75 px-2.5 pb-1.5 text-faint text-ui-10 [font-weight:650] [letter-spacing:0.1em] uppercase" aria-live="polite">{results.length} {results.length === 1 ? 'note' : 'notes'}</div>
				<div class="file-actions flex items-center gap-0.5" aria-label="File actions">
					<button class="file-action w-6.75 h-6.75 grid place-items-center border-0 rounded-md bg-transparent text-muted cursor-pointer [&:hover:not(:disabled)]:bg-subtle-strong [&:hover:not(:disabled)]:text-ink [&:disabled]:text-faint [&:disabled]:cursor-not-allowed" aria-label="New file" title="New file" disabled={transferState === 'working'} onclick={() => void beginNaming({ action: 'create-file', parentPath: '' })}><FilePlus2 size={16} /></button>
					<button class="file-action w-6.75 h-6.75 grid place-items-center border-0 rounded-md bg-transparent text-muted cursor-pointer [&:hover:not(:disabled)]:bg-subtle-strong [&:hover:not(:disabled)]:text-ink [&:disabled]:text-faint [&:disabled]:cursor-not-allowed" aria-label="New folder" title="New folder" disabled={transferState === 'working'} onclick={() => void beginNaming({ action: 'create-folder', parentPath: '' })}><FolderPlus size={16} /></button>
				</div>
			</div>
			<div class="sidebar-sort flex gap-1.5 py-1.5 px-3 [&_select]:min-w-0 [&_select]:flex-1 [&_select]:border [&_select]:border-line [&_select]:rounded-md [&_select]:p-1 [&_select]:bg-surface [&_select]:text-muted [&_select]:text-ui-11">
        <select aria-label="Sort notes by" value={sidebarSort.by} onchange={(event) => onSidebarSort({ ...sidebarSort, by: event.currentTarget.value as SidebarSort['by'] })}>
          <option value="name">Name</option><option value="updatedAt">Modified date</option><option value="createdAt">Created date</option>
        </select>
        <select aria-label="Sort direction" value={sidebarSort.direction} onchange={(event) => onSidebarSort({ ...sidebarSort, direction: event.currentTarget.value as SidebarSort['direction'] })}>
          <option value="asc">Ascending</option><option value="desc">Descending</option>
        </select>
      </div>
      <nav class="note-list [.sidebar_&]:flex-1 [.sidebar_&]:min-h-0 [.sidebar_&]:flex [.sidebar_&]:flex-col [.sidebar_&]:gap-0.5 [.sidebar_&]:[margin-inline:-5px] [.sidebar_&]:pt-0.5 [.sidebar_&]:px-0 [.sidebar_&]:pb-2 [.sidebar_&]:overflow-y-auto [.sidebar_&]:[scrollbar-width:thin] [.sidebar_&.drop-target]:[outline:1px_dashed_var(--focus-border)] [.sidebar_&.drop-target]:[outline-offset:-2px] [.sidebar_&.drop-target]:rounded-lg [.sidebar_&.drop-target]:bg-subtle" class:drop-target={dropTargetPath === ''} bind:this={noteList} oncontextmenu={openRootContextMenu} ondragover={keepRootDropTarget} ondragleave={(event) => clearRootDropTarget(event)} ondrop={dropOnRoot}>
				{#if naming && (naming.action === 'create-file' || naming.action === 'create-folder')}
					<div class="file-naming-row [&_input]:min-w-0 [&_input]:w-full [&_input]:h-6 [&_input]:py-0.5 [&_input]:px-1.5 [&_input]:border [&_input]:border-focus-border [&_input]:rounded-sm [&_input]:outline-none [&_input]:bg-surface [&_input]:text-ink [&_input]:text-ui-12 [&_input]:flex-1 flex items-center gap-2.25 min-h-8.5 py-1.25 px-2.5 [padding-left:calc(10px_+_(var(--tree-depth)_*_14px))] text-accent-quiet" style={`--tree-depth: ${naming.parentPath ? 1 : 0}`}>
						{#if naming.action === 'create-folder'}<Folder size={16} />{:else}<FileText size={16} />{/if}
						<input bind:this={namingInput} bind:value={draftName} aria-label={naming.action === 'create-folder' ? 'Folder name' : 'File name'} spellcheck="false" disabled={namingBusy} aria-invalid={Boolean(namingError)} title={namingError || undefined} onblur={commitNaming} onkeydown={handleNamingKeydown} />
					</div>
				{/if}
				{#if treeRows.length === 0 && !(naming && (naming.action === 'create-file' || naming.action === 'create-folder'))}
					{#if !notesLoaded && !storageError}
						<div class="empty-results flex flex-col items-center py-7.5 px-3 text-faint text-center [&_svg]:text-faint [&_strong]:mt-2.25 [&_strong]:text-muted [&_strong]:text-ui-12 [&_span]:mt-1 [&_span]:text-ui-10 [&_span]:[line-height:1.4] [&_button]:mt-3 [&_button]:h-7.25 [&_button]:inline-flex [&_button]:items-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.5 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-11 [&_button:hover]:border-line-hover [&_button:hover]:text-ink"><LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={20} /><strong>Opening your vault…</strong><span>Notes are read from this device.</span></div>
					{:else}
						<div class="empty-results flex flex-col items-center py-7.5 px-3 text-faint text-center [&_svg]:text-faint [&_strong]:mt-2.25 [&_strong]:text-muted [&_strong]:text-ui-12 [&_span]:mt-1 [&_span]:text-ui-10 [&_span]:[line-height:1.4] [&_button]:mt-3 [&_button]:h-7.25 [&_button]:inline-flex [&_button]:items-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.5 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-11 [&_button:hover]:border-line-hover [&_button:hover]:text-ink"><FileText size={20} /><strong>No notes yet</strong><span>Your first note is one keystroke away.</span><button onclick={onCreateNote}><Plus size={13} /> New note</button></div>
					{/if}
				{:else}
					{#each treeRows as row (row.key)}
						{#if row.kind === 'folder' && row.attachments}
							{@const Icon = folderIconComponent(row.icon)}
							<button class="file-tree-row folder-row attachment-folder-row [--tree-depth:0] [-webkit-touch-callout:none] [-webkit-user-select:none] select-none [touch-action:manipulation] [&[draggable='true']]:cursor-grab [&[draggable='true']:active]:cursor-grabbing [&.dragging]:opacity-45 [&.drop-target]:bg-selected [&.drop-target]:[box-shadow:inset_0_0_0_1px_var(--focus-border)] [.file&]:[padding-left:calc(10px_+_(var(--tree-depth)_*_14px))] w-full flex items-center gap-1.75 min-h-8.5 py-1.75 px-2.5 [padding-left:calc(10px_+_(var(--tree-depth)_*_14px))] border-0 rounded-md bg-transparent text-ink-soft cursor-pointer text-ui-12 text-left [&:hover:not(:disabled)]:bg-subtle [&:hover:not(:disabled)]:text-ink [&.drop-target:hover:not(:disabled)]:bg-selected [&.drop-target:hover:not(:disabled)]:[box-shadow:inset_0_0_0_1px_var(--focus-border)] [&:disabled]:cursor-not-allowed [&_>_svg]:text-accent-quiet" data-folder-path={row.path} data-folder-icon={row.icon ?? 'paperclip'} style={`--tree-depth: ${row.depth}`} aria-expanded={row.expanded} title="Attachments — right-click or long-press to rename or delete" onclick={() => handleFolderRowClick(row.path)} oncontextmenu={(event) => openFolderContextMenu(event, row.path)} ontouchstart={(event) => { const path = row.path; handleRowTouchStart(event, (x, y) => showFolderContextMenu(path, x, y)); }} ontouchmove={handleRowTouchMove} ontouchend={handleRowTouchEnd} ontouchcancel={handleRowTouchEnd}>
								<span class="file-tree-caret w-3.25 h-4 grid [flex:0_0_13px] place-items-center text-faint [&_>_span]:w-0.75 [&_>_span]:h-0.75 [&_>_span]:rounded-full [&_>_span]:bg-faint">{#if row.hasChildren}{#if row.expanded}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}{:else}<span></span>{/if}</span><Icon size={16} /><span class="file-tree-name flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{row.label}</span>{#if row.pinned}<Pin class="folder-pin-indicator [.folder-row_>_&]:flex-none [.folder-row_>_&]:ml-auto [.folder-row_>_&]:text-accent" size={13} aria-label="Pinned" />{/if}
							</button>
						{:else if row.kind === 'attachment'}
							<button class="file file-tree-row attachment-row relative w-full flex items-center gap-2.25 py-2.25 px-2.5 border-0 rounded-md bg-transparent text-ink-soft cursor-pointer text-ui-13 text-left [&:hover]:bg-subtle [&.active]:bg-selected [&.active]:text-ink [&.active]:[font-weight:550] [&.active::before]:[content:''] [&.active::before]:absolute [&.active::before]:left-0 [&.active::before]:w-0.5 [&.active::before]:h-4.5 [&.active::before]:rounded-sm [&.active::before]:bg-accent [&_svg]:text-faint [&_span]:min-w-0 [&_span]:block [&_span]:flex-1 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_strong]:block [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-ui-12 [&_strong]:[font-weight:560] [&_small]:block [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_small]:mt-0.75 [&_small]:text-faint [&_small]:text-ui-10 [&_small]:[font-weight:400] [--tree-depth:0] [-webkit-touch-callout:none] [-webkit-user-select:none] select-none [touch-action:manipulation] [&[draggable='true']]:cursor-grab [&[draggable='true']:active]:cursor-grabbing [&.dragging]:opacity-45 [&.drop-target]:bg-selected [&.drop-target]:[box-shadow:inset_0_0_0_1px_var(--focus-border)] [.file&]:[padding-left:calc(10px_+_(var(--tree-depth)_*_14px))]" data-attachment-path={row.path} style={`--tree-depth: ${row.depth}`} title={`Open ${row.label}`} onclick={() => onOpenAttachment(row.attachment.id)} oncontextmenu={(event) => openAttachmentContextMenu(event, row.attachment)}>
								{#if row.attachment.type.startsWith('image/')}<Image size={16} />{:else}<Paperclip size={16} />{/if}<span><strong>{row.label}</strong></span>
							</button>
						{:else if row.kind === 'folder'}
							{@const Icon = folderIconComponent(row.icon)}
							<button class="file-tree-row folder-row [--tree-depth:0] [-webkit-touch-callout:none] [-webkit-user-select:none] select-none [touch-action:manipulation] [&[draggable='true']]:cursor-grab [&[draggable='true']:active]:cursor-grabbing [&.dragging]:opacity-45 [&.drop-target]:bg-selected [&.drop-target]:[box-shadow:inset_0_0_0_1px_var(--focus-border)] [.file&]:[padding-left:calc(10px_+_(var(--tree-depth)_*_14px))] w-full flex items-center gap-1.75 min-h-8.5 py-1.75 px-2.5 [padding-left:calc(10px_+_(var(--tree-depth)_*_14px))] border-0 rounded-md bg-transparent text-ink-soft cursor-pointer text-ui-12 text-left [&:hover:not(:disabled)]:bg-subtle [&:hover:not(:disabled)]:text-ink [&.drop-target:hover:not(:disabled)]:bg-selected [&.drop-target:hover:not(:disabled)]:[box-shadow:inset_0_0_0_1px_var(--focus-border)] [&:disabled]:cursor-not-allowed [&_>_svg]:text-accent-quiet" class:drop-target={dropTargetPath === row.path} class:dragging={draggedEntry?.kind === 'folder' && draggedEntry.path === row.path} data-folder-path={row.path} data-folder-icon={row.icon ?? 'folder'} style={`--tree-depth: ${row.depth}`} aria-expanded={row.expanded} title="Drag to move folder — right-click or long-press for options" draggable="true" disabled={transferState === 'working'} onclick={() => handleFolderRowClick(row.path)} oncontextmenu={(event) => openFolderContextMenu(event, row.path)} ontouchstart={(event) => { const path = row.path; handleRowTouchStart(event, (x, y) => showFolderContextMenu(path, x, y)); }} ontouchmove={handleRowTouchMove} ontouchend={handleRowTouchEnd} ontouchcancel={handleRowTouchEnd} ondragstart={(event) => startDrag(event, { kind: 'folder', path: row.path })} ondragend={endDrag} ondragover={(event) => keepDropTarget(event, row.path)} ondragleave={(event) => clearDropTarget(event, row.path)} ondrop={(event) => dropOnFolder(event, row.path)}>
								<span class="file-tree-caret w-3.25 h-4 grid [flex:0_0_13px] place-items-center text-faint [&_>_span]:w-0.75 [&_>_span]:h-0.75 [&_>_span]:rounded-full [&_>_span]:bg-faint">{#if row.hasChildren}{#if row.expanded}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}{:else}<span></span>{/if}</span><Icon size={16} /><span class="file-tree-name flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{row.label}</span>{#if row.pinned}<Pin class="folder-pin-indicator [.folder-row_>_&]:flex-none [.folder-row_>_&]:ml-auto [.folder-row_>_&]:text-accent" size={13} aria-label="Pinned" />{/if}
							</button>
						{:else}
							<button class="file file-tree-row relative w-full flex items-center gap-2.25 py-2.25 px-2.5 border-0 rounded-md bg-transparent text-ink-soft cursor-pointer text-ui-13 text-left [&:hover]:bg-subtle [&.active]:bg-selected [&.active]:text-ink [&.active]:[font-weight:550] [&.active::before]:[content:''] [&.active::before]:absolute [&.active::before]:left-0 [&.active::before]:w-0.5 [&.active::before]:h-4.5 [&.active::before]:rounded-sm [&.active::before]:bg-accent [&_svg]:text-faint [&_span]:min-w-0 [&_span]:block [&_span]:flex-1 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_strong]:block [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-ui-12 [&_strong]:[font-weight:560] [&_small]:block [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_small]:mt-0.75 [&_small]:text-faint [&_small]:text-ui-10 [&_small]:[font-weight:400] [--tree-depth:0] [-webkit-touch-callout:none] [-webkit-user-select:none] select-none [touch-action:manipulation] [&[draggable='true']]:cursor-grab [&[draggable='true']:active]:cursor-grabbing [&.dragging]:opacity-45 [&.drop-target]:bg-selected [&.drop-target]:[box-shadow:inset_0_0_0_1px_var(--focus-border)] [.file&]:[padding-left:calc(10px_+_(var(--tree-depth)_*_14px))]" class:active={row.result.note.id === activeNoteId} class:dragging={draggedEntry?.kind === 'file' && draggedEntry.id === row.result.note.id} data-file-path={row.path} data-file-pinned={row.result.note.pinned ? 'true' : undefined} style={`--tree-depth: ${row.depth}`} aria-current={row.result.note.id === activeNoteId ? 'true' : undefined} title="Drag to move file — right-click or long-press for options" draggable="true" disabled={transferState === 'working'} onkeydown={onMoveNoteFocus} onclick={() => handleFileRowClick(row.result.note.id)} oncontextmenu={(event) => openFileContextMenu(event, row.result)} ontouchstart={(event) => { const result = row.result; handleRowTouchStart(event, (x, y) => showFileContextMenu(result, x, y)); }} ontouchmove={handleRowTouchMove} ontouchend={handleRowTouchEnd} ontouchcancel={handleRowTouchEnd} ondragstart={(event) => startDrag(event, { kind: 'file', id: row.result.note.id, path: row.path })} ondragend={endDrag}>
								<FileText size={16} /><span>{#if naming?.action === 'rename-file' && naming.id === row.result.note.id}<input class="file-inline-input min-w-0 w-full h-6 py-0.5 px-1.5 border border-focus-border rounded-sm outline-none bg-surface text-ink text-ui-12" bind:this={namingInput} bind:value={draftName} aria-label="File name" spellcheck="false" disabled={namingBusy} aria-invalid={Boolean(namingError)} title={namingError || undefined} onblur={commitNaming} onkeydown={handleNamingKeydown} />{:else}<strong>{row.label}</strong>{/if}</span>{#if row.result.note.pinned}<Pin class="file-pin-indicator [.file_>_&]:flex-none [.file_>_&]:text-accent" size={13} aria-label="Pinned" />{/if}
							</button>
					{/if}
					{/each}
				{/if}
			</nav>
            {#if contextMenu}
              {#await Promise.all([import('./file-context-menu.svelte'), import('#lib/lazy-styles.ts').then((styles) => styles.loadMenuStyles())]) then [{ default: FileContextMenu }]}
                {#key contextMenu}
                  <FileContextMenu x={contextMenu.x} y={contextMenu.y} label={contextMenu.kind === 'sidebar' ? 'Sidebar actions' : 'File actions'} entries={contextEntries()} onClose={closeContextMenu} />
                {/key}
              {/await}
            {/if}
			{#if notePageCount > 1}
				<div class="note-pagination flex items-center justify-between gap-1.5 pt-2.25 px-1 pb-0 [border-top:1px_solid_var(--line-soft)] text-faint text-ui-10 [&_button]:py-1.25 [&_button]:px-1.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:text-muted [&_button]:cursor-pointer [&_button]:text-ui-10 [&_button:hover:not(:disabled)]:border-line-hover [&_button:hover:not(:disabled)]:text-ink [&_button:disabled]:opacity-45 [&_button:disabled]:cursor-not-allowed" aria-label="Note list pages">
					<button disabled={notePage === 0} onclick={() => onChangePage(notePage - 1)}>Previous</button>
					<span>Page {notePage + 1} of {notePageCount}</span>
					<button disabled={notePage === notePageCount - 1} onclick={() => onChangePage(notePage + 1)}>Next</button>
				</div>
			{/if}
		</div>
	{/if}
	{#if vaults.length > 1 && !paletteOpen}
		<div class="vault-dots flex justify-center gap-0.5 pt-2 px-1 pb-1 [&_button]:grid [&_button]:place-items-center [&_button]:w-4 [&_button]:h-4 [&_button]:p-0 [&_button]:border-0 [&_button]:[background:none] [&_button]:cursor-pointer [&_button::after]:[content:''] [&_button::after]:w-1.5 [&_button::after]:h-1.5 [&_button::after]:rounded-3xl [&_button::after]:bg-line-soft [&_button::after]:[transition:background_150ms,_transform_150ms] [&_button:hover::after]:bg-faint [&_button.active::after]:bg-faint [&_button.active::after]:[transform:scale(1.25)]" role="tablist" aria-label="Repositories (swipe the sidebar, or use the mouse back and forward buttons, to switch)">
			{#each vaults as vault (vault.id)}
				<button role="tab" aria-selected={vault.id === activeVaultId} aria-label={vault.name} title={vault.name} class:active={vault.id === activeVaultId} disabled={transferState === 'working'} onclick={() => { if (vault.id !== activeVaultId) onSelectVault(vault.id); }}></button>
			{/each}
		</div>
	{/if}
	<div class="sidebar-footer flex items-center gap-1.75 mt-1 pt-2 px-1 pb-0 [&_>_:first-child]:min-w-0 [&_>_:first-child]:flex-1 [&_.github-account]:overflow-hidden [&_.github-account_>_span]:flex-1">
		<button
			class="doc-status h-7 flex items-center gap-1.75 border-0 rounded-md bg-transparent text-faint text-ui-11 whitespace-nowrap pt-0 pr-2 pb-0 pl-1 cursor-pointer no-underline [&:hover]:bg-subtle [&:hover]:text-muted [&[data-tone='error']]:text-danger [&.offline]:text-muted [.sidebar-footer_&]:overflow-hidden [@media((max-width:_700px))]:[&_>_span]:hidden! [@media((max-width:_700px))]:w-8.5! [@media((max-width:_700px))]:justify-center! [@media((max-width:_700px))]:p-0!"
			data-tone={docStatusTone}
			class:offline={!isOnline}
			title={githubState === 'connected' && githubUser ? `Synced as @${githubUser.login}` : githubMessage || 'Notes are saved on this device'}
			aria-label={`${wordCount} words, ${readingMinutes} minute reading time, ${docStatusLabel}. Open local storage settings.`}
			onclick={onOpenStorageSettings}
		><span class="doc-status-text min-w-0 overflow-hidden text-ellipsis">{wordCount} {wordCount === 1 ? 'word' : 'words'} · {readingMinutes} min · {docStatusLabel}</span><i class="doc-status-dot w-1.25 h-1.25 flex-none rounded-full bg-faint opacity-70 [.doc-status[data-tone='ok']_&]:[background:var(--ok,_#4caf7d)] [.doc-status[data-tone='ok']_&]:opacity-100 [.doc-status[data-tone='busy']_&]:[background:var(--warn,_#d9a13b)] [.doc-status[data-tone='busy']_&]:opacity-100 [.doc-status[data-tone='error']_&]:bg-danger [.doc-status[data-tone='error']_&]:opacity-100" aria-hidden="true"></i></button>
		<button class="icon-button border-0 bg-transparent cursor-pointer w-8.5 h-8.5 grid place-items-center rounded-md text-muted [transition:background_0.15s_ease,_color_0.15s_ease] [&:hover]:bg-subtle-strong [&:hover]:text-ink [.sidebar-footer_&]:w-7 [.sidebar-footer_&]:h-7" aria-label="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls="settings-dialog" title="Settings" onclick={onOpenSettings}><Settings size={18} /></button>
	</div>
</aside>
