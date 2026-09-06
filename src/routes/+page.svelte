<script lang="ts">
	import {
		CloudDownload, CloudUpload, Columns2, Download, Eye, FileArchive, FilePlus2, FileText,
		FolderInput, FolderOutput, HardDrive, Keyboard, Monitor, Moon, PanelLeft, PencilLine, Save,
		Search, Settings, Sun
	} from '@lucide/svelte';
	import AppHeader from '$lib/components/app-header.svelte';
	import MarkdownWorkspace from '$lib/components/markdown-workspace.svelte';
	import NotesSidebar from '$lib/components/notes-sidebar.svelte';
	import RestoreDialog from '$lib/components/restore-dialog.svelte';
	import ShortcutsDialog from '$lib/components/shortcuts-dialog.svelte';
	import StatusNotices from '$lib/components/status-notices.svelte';
	import type { BackupState, GithubState, RestoreState, SaveState, TransferState, ViewMode } from '$lib/components/app-types';
	import CommandPalette, { type PaletteItem } from '$lib/components/command-palette.svelte';
	import SettingsDialog, { type InlinePreviewBehavior, type SettingsSection } from '$lib/components/settings-dialog.svelte';
	import { renderMarkdown, resolveLocalAttachmentUrl, type LocalAttachmentUrl } from '$lib/markdown';
	import {
		applyTheme, backupVaultToGithub, createPrivateGithubRepository, disconnectGithub, GithubRequestError,
		browserStorageWarnings, detectBrowserStorageSupport, createMarkdownExport, createMarkdownZip,
		importMarkdownFiles, listGithubBackupCommits, nextThemePreference, readLocalStorage,
		readMarkdownFolder, readMarkdownZip, readThemePreference, restoreGithubSession,
		restoreVaultFromGithub, validateGithubBackupRepository, Vault, watchSystemTheme,
		writeLocalStorage, writeMarkdownFolder, type GithubBackupCommit, type GithubBackupState,
		type GithubUser, type NoteMetadata, type ThemePreference, type VaultSearchResult
	} from '$lib';
	import { onMount, tick } from 'svelte';

	const NOTE_PAGE_SIZE = 100;
	const PREVIEW_DELAY_MS = 120;
	const INITIAL_MARKDOWN = `# Welcome to Onyx

Onyx is a quiet place to think in Markdown. Your work stays on this device and saves automatically as you write.

## Find anything quickly

Create as many notes as you need. Search checks every title and every word, while the index stays on this device.

> Good tools disappear into the work.

### Today’s notes

- [x] Open a fresh page
- [ ] Capture the next idea
- [ ] Shape it into something useful

Press \`⌘ K\` for the command palette, \`⌘ S\` to save now, or \`⌘ ⇧ P\` to toggle preview. Press \`?\` for every shortcut.`;

	let vault = $state<Vault>();
	let activeNoteId = $state('');
	let markdown = $state(INITIAL_MARKDOWN);
	let previewMarkdown = $state(INITIAL_MARKDOWN);
	let lastSavedMarkdown = $state(INITIAL_MARKDOWN);
	let results = $state<VaultSearchResult[]>([]);
	let notePage = $state(0);
	let searchQuery = $state('');
	let viewMode = $state<ViewMode>('split');
	let saveState = $state<SaveState>('loading');
	let saveTimer: number | undefined = $state();
	let saveRun: Promise<boolean> | undefined;
	let saveRequested = false;
	let searchTimer: number | undefined = $state();
	let previewTimer: number | undefined = $state();
	let searchSequence = 0;
	let editor: HTMLTextAreaElement | undefined = $state();
	let liveEditor: HTMLTextAreaElement | undefined = $state();
	let liveEditorContainer: HTMLDivElement | undefined = $state();
	let liveLine = $state(0);
	let inlinePreviewBehavior = $state<InlinePreviewBehavior>('rendered');
	let searchInput: HTMLInputElement | undefined = $state();
	let shortcutsOpen = $state(false);
	let sidebarOpen = $state(false);
	let storageError = $state('');
	let storageNotice = $state('');
	let isOnline = $state(true);
	let githubUser = $state<GithubUser>();
	let githubState = $state<GithubState>('loading');
	let githubMessage = $state('');
	let githubBackup = $state<GithubBackupState>();
	let backupState = $state<BackupState>('idle');
	let backupMessage = $state('');
	let backupCommitUrl = $state('');
	let settingsOpen = $state(false);
	let settingsSection = $state<SettingsSection>('github');
	let pendingBackupCount = $state(0);
	let restoreModalOpen = $state(false);
	let restoreState = $state<RestoreState>('idle');
	let restoreMessage = $state('');
	let restoreCommits = $state<GithubBackupCommit[]>([]);
	let selectedRestoreSha = $state('');
	let restoreOwner = $state('');
	let restoreRepository = $state('onyx-vault');
	let restoreBranch = $state('main');
	let restoreDirectory = $state('vault');
	let transferState = $state<TransferState>('idle');
	let transferMessage = $state('');
	let folderInput: HTMLInputElement | undefined = $state();
	let zipInput: HTMLInputElement | undefined = $state();
	let theme = $state<ThemePreference>('system');
	let paletteOpen = $state(false);
	let paletteNotes = $state<NoteMetadata[]>([]);
	let sidebarCollapsed = $state(false);
	let noteList: HTMLElement | undefined = $state();
	let activeNoteSourcePath: string | undefined = $state();
	let localAttachmentUrls = $state<LocalAttachmentUrl[]>([]);
	let noteLoadSequence = 0;
	const liveRenderCache = new Map<string, string>();

	const wordCount = $derived(markdown.trim() ? markdown.trim().split(/\s+/).length : 0);
	const readingMinutes = $derived(Math.max(1, Math.ceil(wordCount / 220)));
	const renderedMarkdown = $derived(renderMarkdown(previewMarkdown, resolveAttachmentUrl));
	const markdownLines = $derived(markdown.split('\n'));
	const liveCodeLines = $derived.by(() => {
		let inCode = false;
		return markdownLines.map((line) => {
			const codeLine = inCode || line.startsWith('```');
			if (line.startsWith('```')) inCode = !inCode;
			return codeLine;
		});
	});
	const notePageCount = $derived(Math.max(1, Math.ceil(results.length / NOTE_PAGE_SIZE)));
	const visibleResults = $derived(results.slice(notePage * NOTE_PAGE_SIZE, (notePage + 1) * NOTE_PAGE_SIZE));
	const hasContent = $derived(markdown.trim().length > 0);
	const themeLabel = $derived(theme === 'system' ? 'Match system' : theme === 'dark' ? 'Dark' : 'Light');
	const paletteItems = $derived<PaletteItem[]>([
		...paletteNotes.map((note) => ({
			id: `note-${note.id}`,
			group: 'Notes',
			label: note.title,
			hint: note.id === activeNoteId ? 'Open note' : formatNoteDate(note.updatedAt),
			icon: FileText,
			keywords: 'note open jump',
			run: () => void selectNote(note.id)
		})),
		{ id: 'new-note', group: 'Actions', label: 'New note', shortcut: '⌘ ⏎', icon: FilePlus2, keywords: 'create add page', disabled: transferState === 'working', run: () => void createNote() },
		{ id: 'save', group: 'Actions', label: 'Save note', shortcut: '⌘ S', icon: Save, keywords: 'write store', disabled: saveState === 'saving' || transferState === 'working', run: () => void saveDraft() },
		{ id: 'search', group: 'Actions', label: 'Search all notes', shortcut: '⌘ ⇧ F', icon: Search, keywords: 'find full text', run: () => focusSearch() },
		{ id: 'view-edit', group: 'View', label: 'Editor only', shortcut: '⌘ ⇧ P', icon: PencilLine, keywords: 'write markdown pane', run: () => (viewMode = 'edit') },
		{ id: 'view-live', group: 'View', label: 'Inline preview', icon: Eye, keywords: 'live inline rendered edit obsidian', run: () => openInlinePreview() },
		{ id: 'view-split', group: 'View', label: 'Split view', icon: Columns2, keywords: 'side by side pane', run: () => (viewMode = 'split') },
		{ id: 'view-preview', group: 'View', label: 'Preview only', icon: Eye, keywords: 'rendered read pane', run: () => (viewMode = 'preview') },
		{ id: 'toggle-sidebar', group: 'View', label: sidebarCollapsed ? 'Show the notes sidebar' : 'Hide the notes sidebar', shortcut: '⌘ \\', icon: PanelLeft, keywords: 'panel files list', run: () => toggleSidebar() },
		{ id: 'theme-light', group: 'Appearance', label: 'Theme: Light', icon: Sun, keywords: 'bright day colour color', disabled: theme === 'light', run: () => setTheme('light') },
		{ id: 'theme-dark', group: 'Appearance', label: 'Theme: Dark', icon: Moon, keywords: 'night colour color', disabled: theme === 'dark', run: () => setTheme('dark') },
		{ id: 'theme-system', group: 'Appearance', label: 'Theme: Match system', icon: Monitor, keywords: 'auto os colour color', disabled: theme === 'system', run: () => setTheme('system') },
		{ id: 'backup', group: 'GitHub', label: 'Back up to GitHub', icon: CloudUpload, keywords: 'commit push sync', disabled: !isOnline || githubState !== 'connected', run: () => void beginBackup() },
		{ id: 'restore', group: 'GitHub', label: 'Restore from a GitHub commit', icon: CloudDownload, keywords: 'download history rollback', disabled: !isOnline || githubState !== 'connected', run: () => void openRestore() },
		{ id: 'import-folder', group: 'Transfer', label: 'Import a Markdown folder', icon: FolderInput, keywords: 'open files load', run: () => folderInput?.click() },
		{ id: 'import-zip', group: 'Transfer', label: 'Import a ZIP archive', icon: FileArchive, keywords: 'open files load', run: () => zipInput?.click() },
		{ id: 'export-folder', group: 'Transfer', label: 'Export to a folder', icon: FolderOutput, keywords: 'save files write', run: () => void exportFolder() },
		{ id: 'export-zip', group: 'Transfer', label: 'Export a ZIP archive', icon: Download, keywords: 'save download backup', run: () => void exportZip() },
		{ id: 'settings', group: 'Onyx', label: 'Open settings', icon: Settings, keywords: 'preferences options github storage', run: () => openSettings(githubState === 'connected' ? 'backup' : 'appearance') },
		{ id: 'storage', group: 'Onyx', label: 'Storage on this device', icon: HardDrive, keywords: 'space quota usage persistent', run: () => openSettings('storage') },
		{ id: 'shortcuts', group: 'Onyx', label: 'Keyboard shortcuts', shortcut: '?', icon: Keyboard, keywords: 'help keys reference', run: () => (shortcutsOpen = true) }
	]);

	onMount(() => {
		isOnline = navigator.onLine;
		const storageSupport = detectBrowserStorageSupport();
		storageNotice = browserStorageWarnings(storageSupport).join(' ');
		inlinePreviewBehavior = readLocalStorage('onyx:inline-preview-behavior') === 'source-line' ? 'source-line' : 'rendered';
		theme = readThemePreference();
		applyTheme(theme);
		const stopThemeWatch = watchSystemTheme(() => applyTheme(theme));
		void openVault().finally(() => registerServiceWorker());
		if (isOnline) void restoreGitHub();
		else githubState = 'disconnected';
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (markdown === lastSavedMarkdown) return;
			event.preventDefault();
		};
		const onKeydown = (event: KeyboardEvent) => handleShortcut(event);
		const onOnline = () => {
			isOnline = true;
			void restoreGitHub();
		};
		const onOffline = () => {
			isOnline = false;
			restoreModalOpen = false;
		};
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden' && markdown !== lastSavedMarkdown) void saveDraft();
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		window.addEventListener('keydown', onKeydown);
		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOffline);
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			window.removeEventListener('beforeunload', onBeforeUnload);
			window.removeEventListener('keydown', onKeydown);
			window.removeEventListener('online', onOnline);
			window.removeEventListener('offline', onOffline);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			stopThemeWatch();
			if (saveTimer) window.clearTimeout(saveTimer);
			if (searchTimer) window.clearTimeout(searchTimer);
			if (previewTimer) window.clearTimeout(previewTimer);
			releaseLocalAttachmentUrls();
			vault?.close();
		};
	});

	function registerServiceWorker(): void {
		if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/service-worker.js').catch(() => undefined);
	}

	async function restoreGitHub(): Promise<void> {
		const result = new URLSearchParams(location.search).get('github');
		if (result) history.replaceState(history.state, '', location.pathname + location.hash);
		if (result && result !== 'connected') {
			githubMessage = result === 'configuration'
				? 'GitHub authentication has not been configured for this deployment.'
				: result === 'denied'
					? 'GitHub authorization was cancelled.'
					: result === 'invalid'
						? 'The GitHub authorization response could not be verified. Please try again.'
						: 'GitHub authentication failed. Please try again.';
		}
		if (!isOnline) {
			githubState = githubUser ? 'connected' : 'disconnected';
			return;
		}
		githubState = 'loading';
		try {
			githubUser = await restoreGithubSession();
			githubState = githubUser ? 'connected' : githubMessage ? 'error' : 'disconnected';
		} catch (error) {
			githubState = 'error';
			githubMessage = error instanceof Error ? error.message : 'GitHub authentication failed.';
		}
	}

	async function disconnectGitHub(): Promise<void> {
		if (!isOnline) return;
		try {
			await disconnectGithub();
			githubUser = undefined;
			githubState = 'disconnected';
			githubMessage = '';
		} catch (error) {
			githubState = 'error';
			githubMessage = error instanceof Error ? error.message : 'GitHub could not be disconnected.';
		}
	}

	async function beginBackup(): Promise<void> {
		if (!isOnline || !vault || backupState === 'backing-up') return;
		if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
		if (!githubBackup) {
			openSettings('repository');
			return;
		}
		await runBackup(githubBackup);
	}

	function openSettings(target: SettingsSection = 'github'): void {
		settingsSection = target;
		settingsOpen = true;
	}

	async function selectBackupRepository(state: Omit<GithubBackupState, 'updatedAt'>): Promise<void> {
		if (!vault) return;
		try {
			await validateGithubBackupRepository({ ...state, updatedAt: new Date().toISOString() });
			await vault.saveGithubBackupState(state);
			githubBackup = await vault.getGithubBackupState();
			backupState = 'idle';
			backupCommitUrl = '';
			backupMessage = `Backups now target ${state.owner}/${state.repository}.`;
			settingsSection = 'backup';
		} catch (error) {
			showBackupError(error);
		}
	}

	async function forgetBackupRepository(): Promise<void> {
		if (!vault) return;
		try {
			await vault.clearGithubBackupState();
			githubBackup = undefined;
			backupCommitUrl = '';
			backupState = 'idle';
			backupMessage = 'Onyx is no longer backing up to a repository.';
		} catch (error) {
			showBackupError(error);
		}
	}

	async function reloadVault(): Promise<void> {
		if (!vault) return;
		if (saveTimer) window.clearTimeout(saveTimer);
		saveTimer = undefined;
		let notes = await vault.listNotes();
		if (notes.length === 0) {
			notes = [await vault.saveNote({ title: titleFromMarkdown(INITIAL_MARKDOWN), markdown: INITIAL_MARKDOWN })];
		}
		searchQuery = '';
		await loadNote(notes[0].id);
		await runSearch('');
		pendingBackupCount = (await vault.getPendingBackupOperations()).length;
	}

	async function createBackupRepository(name: string): Promise<void> {
		if (!isOnline || !vault || !name.trim()) return;
		backupState = 'backing-up';
		backupMessage = 'Creating your private repository…';
		settingsOpen = false;
		try {
			const configuration = await createPrivateGithubRepository(name);
			await vault.saveGithubBackupState(configuration);
			githubBackup = configuration;
			await runBackup(configuration);
		} catch (error) {
			showBackupError(error);
		}
	}

	async function runBackup(configuration: GithubBackupState): Promise<void> {
		if (!isOnline || !vault) return;
		backupState = 'backing-up';
		backupMessage = 'Preparing one GitHub commit…';
		backupCommitUrl = '';
		try {
			const result = await backupVaultToGithub(vault, configuration);
			githubBackup = result.state;
			pendingBackupCount = (await vault.getPendingBackupOperations()).length;
			backupState = 'success';
			backupCommitUrl = result.commitUrl ?? '';
			backupMessage = result.commitUrl
				? `Backed up ${result.fileCount} ${result.fileCount === 1 ? 'file' : 'files'} in one commit.`
				: 'Your GitHub backup is already up to date.';
		} catch (error) {
			showBackupError(error);
		}
	}

	function showBackupError(error: unknown): void {
		backupState = 'error';
		backupMessage = error instanceof GithubRequestError && error.status === 422
			? 'GitHub could not create that repository or update its branch. Check the name and try again.'
			: error instanceof Error ? error.message : 'The GitHub backup failed.';
	}

	async function openRestore(): Promise<void> {
		if (!isOnline || !githubUser || restoreState === 'restoring') return;
		restoreOwner = githubBackup?.owner ?? githubUser.login;
		restoreRepository = githubBackup?.repository ?? 'onyx-vault';
		restoreBranch = githubBackup?.branch ?? 'main';
		restoreDirectory = githubBackup?.directory ?? 'vault';
		restoreCommits = [];
		selectedRestoreSha = '';
		restoreMessage = '';
		restoreModalOpen = true;
		await loadRestoreCommits();
	}

	function restoreConfiguration(): GithubBackupState {
		if (!githubUser) throw new Error('Connect GitHub before restoring a backup');
		return {
			githubAccountId: githubUser.id,
			githubAccountLogin: githubUser.login,
			owner: restoreOwner.trim(),
			repository: restoreRepository.trim(),
			branch: restoreBranch.trim(),
			directory: restoreDirectory.trim().replace(/^\/+|\/+$/g, ''),
			updatedAt: new Date().toISOString()
		};
	}

	async function loadRestoreCommits(): Promise<void> {
		if (!isOnline || !restoreOwner.trim() || !restoreRepository.trim() || !restoreBranch.trim()) return;
		restoreState = 'loading';
		restoreMessage = '';
		selectedRestoreSha = '';
		try {
			restoreCommits = await listGithubBackupCommits(restoreConfiguration());
			selectedRestoreSha = restoreCommits[0]?.sha ?? '';
			restoreMessage = restoreCommits.length === 0 ? 'No backup commits were found in this repository and directory.' : '';
			restoreState = 'idle';
		} catch (error) {
			restoreCommits = [];
			restoreState = 'error';
			restoreMessage = error instanceof Error ? error.message : 'GitHub backups could not be loaded.';
		}
	}

	async function restoreSelectedCommit(): Promise<void> {
		if (!isOnline || !vault || !selectedRestoreSha || restoreState === 'restoring') return;
		const previousSaveState = saveState;
		if (saveTimer) window.clearTimeout(saveTimer);
		if (searchTimer) window.clearTimeout(searchTimer);
		saveTimer = undefined;
		searchTimer = undefined;
		searchSequence += 1;
		saveState = 'loading';
		restoreState = 'restoring';
		restoreMessage = 'Downloading and rebuilding your local vault…';
		try {
			const result = await restoreVaultFromGithub(vault, restoreConfiguration(), selectedRestoreSha);
			githubBackup = result.state;
			pendingBackupCount = (await vault.getPendingBackupOperations()).length;
			const notes = await vault.listNotes();
			searchQuery = '';
			await loadNote(notes[0].id);
			await runSearch('');
			restoreModalOpen = false;
			restoreState = 'idle';
			backupState = 'success';
			backupMessage = `Restored ${result.noteCount} ${result.noteCount === 1 ? 'note' : 'notes'} and ${result.attachmentCount} ${result.attachmentCount === 1 ? 'attachment' : 'attachments'} from GitHub.`;
			backupCommitUrl = restoreCommits.find((commit) => commit.sha === selectedRestoreSha)?.url ?? '';
		} catch (error) {
			saveState = previousSaveState;
			restoreState = 'error';
			restoreMessage = error instanceof Error ? error.message : 'The GitHub backup could not be restored.';
		}
	}

	function formatNoteDate(value: string): string {
		if (!value) return '';
		return `Edited ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))}`;
	}

	function formatCommitDate(value: string): string {
		if (!value) return 'Unknown date';
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
	}

	async function openVault(): Promise<void> {
		storageError = '';
		saveState = 'loading';
		try {
			vault = await Vault.open();
			let notes = await vault.listNotes();
			if (notes.length === 0) {
				const legacyDraft = await readLegacyDraft();
				const contents = legacyDraft || INITIAL_MARKDOWN;
				const firstNote = await vault.saveNote({ title: titleFromMarkdown(contents), markdown: contents });
				notes = [firstNote];
			}
			await loadNote(notes[0].id);
			await runSearch('');
			githubBackup = await vault.getGithubBackupState();
			pendingBackupCount = (await vault.getPendingBackupOperations()).length;
			if (detectBrowserStorageSupport().persistentStorage) {
				void vault.requestPersistentStorage().then((granted) => {
					if (!granted) appendStorageNotice('Persistent storage was not granted, so keep a backup of important notes.');
				});
			}
		} catch (error) {
			storageError = error instanceof Error ? error.message : 'Your notes could not be opened.';
			saveState = 'error';
		}
	}

	function appendStorageNotice(message: string): void {
		if (storageNotice.includes(message)) return;
		storageNotice = storageNotice ? `${storageNotice} ${message}` : message;
	}

	async function readLegacyDraft(): Promise<string> {
		try {
			const root = await navigator.storage.getDirectory();
			const directory = await root.getDirectoryHandle('onyx');
			const handle = await directory.getFileHandle('welcome-to-onyx.md');
			return await (await handle.getFile()).text();
		} catch {
			return '';
		}
	}

	async function loadNote(id: string): Promise<void> {
		if (!vault) return;
		const sequence = ++noteLoadSequence;
		const note = await vault.getNote(id);
		if (!note) return;
		const attachments = await Promise.all(
			(await vault.listAttachments(note.id)).map((attachment) => vault?.getAttachment(attachment.id))
		);
		const nextUrls = attachments.flatMap((attachment): LocalAttachmentUrl[] => attachment ? [{
			name: attachment.metadata.name,
			sourcePath: attachment.metadata.sourcePath,
			url: URL.createObjectURL(attachment.file)
		}] : []);
		if (sequence !== noteLoadSequence) {
			for (const attachment of nextUrls) URL.revokeObjectURL(attachment.url);
			return;
		}
		releaseLocalAttachmentUrls();
		localAttachmentUrls = nextUrls;
		liveRenderCache.clear();
		activeNoteSourcePath = note.sourcePath;
		activeNoteId = note.id;
		markdown = note.markdown;
		updatePreviewImmediately(note.markdown);
		lastSavedMarkdown = note.markdown;
		saveState = 'saved';
		storageError = '';
		sidebarOpen = false;
	}

	function resolveAttachmentUrl(destination: string): string | undefined {
		return resolveLocalAttachmentUrl(destination, activeNoteSourcePath, localAttachmentUrls);
	}

	function releaseLocalAttachmentUrls(): void {
		for (const attachment of localAttachmentUrls) URL.revokeObjectURL(attachment.url);
		localAttachmentUrls = [];
	}

	async function selectNote(id: string): Promise<void> {
		if (id === activeNoteId || transferState === 'working') return;
		if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
		await loadNote(id);
	}

	async function createNote(): Promise<void> {
		if (!vault || transferState === 'working') return;
		saveState = 'loading';
		if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
		try {
			const note = await vault.saveNote({ title: 'Untitled', markdown: '' });
			searchQuery = '';
			await loadNote(note.id);
			await runSearch('');
			requestAnimationFrame(() => editor?.focus());
		} catch (error) {
			storageError = error instanceof Error ? error.message : 'A new note could not be created.';
			saveState = 'error';
		}
	}

	async function importFolder(files: FileList | null): Promise<void> {
		if (!files?.length) return;
		await runImport(readMarkdownFolder(files));
		if (folderInput) folderInput.value = '';
	}

	async function importZip(files: FileList | null): Promise<void> {
		const file = files?.[0];
		if (!file) return;
		transferState = 'working';
		transferMessage = 'Reading ZIP archive…';
		try {
			const entries = await readMarkdownZip(file);
			transferState = 'idle';
			await runImport(entries);
		} catch (error) {
			showTransferError(error, 'The ZIP archive could not be imported.');
		} finally {
			if (zipInput) zipInput.value = '';
		}
	}

	async function runImport(files: ReturnType<typeof readMarkdownFolder>): Promise<void> {
		if (!vault || transferState === 'working') return;
		transferState = 'working';
		transferMessage = 'Importing Markdown and attachments…';
		if (!(await settleDraft())) {
			transferState = 'idle';
			transferMessage = '';
			return;
		}
		try {
			const result = await importMarkdownFiles(vault, files);
			searchQuery = '';
			const notes = await vault.listNotes();
			await loadNote(notes[0].id);
			await runSearch('');
			pendingBackupCount = (await vault.getPendingBackupOperations()).length;
			transferState = 'idle';
			transferMessage = `Imported ${result.noteCount} ${result.noteCount === 1 ? 'note' : 'notes'} and ${result.attachmentCount} ${result.attachmentCount === 1 ? 'attachment' : 'attachments'}.`;
		} catch (error) {
			showTransferError(error, 'The Markdown folder could not be imported.');
		}
	}

	async function exportZip(): Promise<void> {
		if (!vault || transferState === 'working') return;
		transferState = 'working';
		transferMessage = 'Building ZIP archive…';
		if (!(await settleDraft())) {
			transferState = 'idle';
			transferMessage = '';
			return;
		}
		try {
			const files = await createMarkdownExport(vault);
			const archive = await createMarkdownZip(files);
			const url = URL.createObjectURL(archive);
			const link = document.createElement('a');
			link.href = url;
			link.download = `onyx-markdown-${new Date().toISOString().slice(0, 10)}.zip`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 0);
			transferState = 'idle';
			transferMessage = `Exported ${files.length} ${files.length === 1 ? 'file' : 'files'} to ZIP.`;
		} catch (error) {
			showTransferError(error, 'The ZIP archive could not be exported.');
		}
	}

	async function exportFolder(): Promise<void> {
		if (!vault || transferState === 'working') return;
		const picker = (window as Window & { showDirectoryPicker?: (options?: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
		if (!picker) {
			transferState = 'error';
			transferMessage = 'Folder export is not supported by this browser. Use ZIP export instead.';
			return;
		}
		try {
			const directory = await picker.call(window, { mode: 'readwrite' });
			transferState = 'working';
			transferMessage = 'Writing Markdown folder…';
			if (!(await settleDraft())) {
				transferState = 'idle';
				transferMessage = '';
				return;
			}
			const files = await createMarkdownExport(vault);
			await writeMarkdownFolder(directory, files);
			transferState = 'idle';
			transferMessage = `Exported ${files.length} ${files.length === 1 ? 'file' : 'files'} to the selected folder.`;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			showTransferError(error, 'The Markdown folder could not be exported.');
		}
	}

	function showTransferError(error: unknown, fallback: string): void {
		transferState = 'error';
		transferMessage = error instanceof Error ? error.message : fallback;
	}

	async function settleDraft(): Promise<boolean> {
		if (markdown !== lastSavedMarkdown) return saveDraft();
		if (saveTimer) window.clearTimeout(saveTimer);
		saveTimer = undefined;
		return saveRun ? await saveRun : true;
	}

	function queueSave(): void {
		saveState = 'unsaved';
		if (saveTimer) window.clearTimeout(saveTimer);
		saveTimer = window.setTimeout(() => void saveDraft(), 700);
	}

	async function saveDraft(): Promise<boolean> {
		if (!vault || !activeNoteId) return false;
		if (saveTimer) window.clearTimeout(saveTimer);
		saveTimer = undefined;
		saveRequested = true;
		if (saveRun) return saveRun;
		const run = flushDrafts();
		saveRun = run;
		try {
			return await run;
		} finally {
			if (saveRun === run) saveRun = undefined;
		}
	}

	async function flushDrafts(): Promise<boolean> {
		while (saveRequested) {
			saveRequested = false;
			if (!vault || !activeNoteId) return false;
			const noteId = activeNoteId;
			const contents = markdown;
			saveState = 'saving';
			try {
				await vault.saveNote({ id: noteId, title: titleFromMarkdown(contents), markdown: contents });
				if (activeNoteId === noteId) {
					lastSavedMarkdown = contents;
					saveState = markdown === contents ? 'saved' : 'unsaved';
					storageError = '';
				}
				await runSearch(searchQuery);
				pendingBackupCount = (await vault.getPendingBackupOperations()).length;
			} catch (error) {
				saveRequested = false;
				if (activeNoteId === noteId) {
					storageError = error instanceof Error ? error.message : 'Autosave failed.';
					saveState = 'error';
				}
				return false;
			}
		}
		return true;
	}

	function updateMarkdown(value: string): void {
		markdown = value;
		queuePreview(value);
		queueSave();
	}

	function queuePreview(value: string): void {
		if (previewTimer) window.clearTimeout(previewTimer);
		previewTimer = window.setTimeout(() => {
			previewTimer = undefined;
			previewMarkdown = value;
		}, PREVIEW_DELAY_MS);
	}

	function updatePreviewImmediately(value: string): void {
		if (previewTimer) window.clearTimeout(previewTimer);
		previewTimer = undefined;
		previewMarkdown = value;
	}

	function openInlinePreview(line = liveLine): void {
		viewMode = 'live';
		liveLine = Math.min(Math.max(line, 0), markdownLines.length - 1);
		requestAnimationFrame(() => inlinePreviewBehavior === 'rendered' ? focusRenderedLine(liveLine) : liveEditor?.focus());
	}

	function activateLiveLine(line: number, position?: number): void {
		liveLine = line;
		if (inlinePreviewBehavior === 'rendered') {
			requestAnimationFrame(() => focusRenderedLine(line, position));
			return;
		}
		requestAnimationFrame(() => {
			liveEditor?.focus();
			const cursor = position ?? liveEditor?.value.length ?? 0;
			liveEditor?.setSelectionRange(cursor, cursor);
		});
	}

	function setInlinePreviewBehavior(behavior: InlinePreviewBehavior): void {
		inlinePreviewBehavior = behavior;
		writeLocalStorage('onyx:inline-preview-behavior', behavior);
		if (viewMode === 'live') requestAnimationFrame(() => behavior === 'rendered' ? focusRenderedLine(liveLine) : liveEditor?.focus());
	}

	function updateRenderedLine(line: number, element: HTMLElement): void {
		const position = getCaretOffset(element);
		updateLiveLine(line, element.textContent ?? '');
		void tick().then(() => focusRenderedLine(liveLine, position));
	}

	function handleRenderedLineKeydown(event: KeyboardEvent, line: number): void {
		const element = event.currentTarget as HTMLElement;
		const selection = getSourceSelection(element);
		if (!selection) return;
		const value = element.textContent ?? '';
		if (event.key === 'Enter') {
			event.preventDefault();
			const before = value.slice(0, selection.start);
			const after = value.slice(selection.end);
			const marker = before.match(/^(\s*(?:[-*]\s+(?:\[[ xX]\]\s+)?|>\s+))/)?.[1] ?? '';
			const continuation = marker && before.trim() !== marker.trim() ? marker : '';
			const lines = [...markdownLines];
			lines.splice(line, 1, before, `${continuation}${after}`);
			updateMarkdown(lines.join('\n'));
			liveLine = line + 1;
			requestAnimationFrame(() => focusRenderedLine(line + 1, continuation.length));
		} else if (event.key === 'Backspace' && selection.start === 0 && selection.end === 0 && line > 0) {
			event.preventDefault();
			const lines = [...markdownLines];
			const previousLength = lines[line - 1].length;
			lines.splice(line - 1, 2, `${lines[line - 1]}${value}`);
			updateMarkdown(lines.join('\n'));
			liveLine = line - 1;
			requestAnimationFrame(() => focusRenderedLine(line - 1, previousLength));
		} else if (event.key === 'ArrowUp' && line > 0) {
			event.preventDefault();
			activateLiveLine(line - 1, Math.min(selection.start, markdownLines[line - 1].length));
		} else if (event.key === 'ArrowDown' && line < markdownLines.length - 1) {
			event.preventDefault();
			activateLiveLine(line + 1, Math.min(selection.start, markdownLines[line + 1].length));
		}
	}

	function getSourceSelection(element: HTMLElement): { start: number; end: number } | undefined {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !element.contains(selection.anchorNode)) return;
		const range = selection.getRangeAt(0);
		const start = range.cloneRange();
		start.selectNodeContents(element);
		start.setEnd(range.startContainer, range.startOffset);
		const end = range.cloneRange();
		end.selectNodeContents(element);
		end.setEnd(range.endContainer, range.endOffset);
		return {
			start: start.cloneContents().textContent?.length ?? 0,
			end: end.cloneContents().textContent?.length ?? 0
		};
	}

	function getCaretOffset(element: HTMLElement): number {
		return getSourceSelection(element)?.end ?? (element.textContent?.length ?? 0);
	}

	function focusRenderedLine(line: number, position?: number): void {
		const element = liveEditorContainer?.querySelector<HTMLElement>(`[data-live-line="${line}"]`);
		if (!element) return;
		element.focus();
		const target = Math.min(position ?? element.textContent?.length ?? 0, element.textContent?.length ?? 0);
		setRenderedSelection(element, target, target);
	}

	function setRenderedSelection(element: HTMLElement, start: number, end: number): void {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let remaining = start;
		let node = walker.nextNode();
		while (node && remaining >= (node.textContent?.length ?? 0)) {
			remaining -= node.textContent?.length ?? 0;
			node = walker.nextNode();
		}
		const range = document.createRange();
		if (node) range.setStart(node, remaining);
		else {
			range.selectNodeContents(element);
			range.collapse(false);
		}
		if (end === start) range.collapse(true);
		else {
			const endWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
			let endRemaining = end;
			let endNode = endWalker.nextNode();
			while (endNode && endRemaining >= (endNode.textContent?.length ?? 0)) {
				endRemaining -= endNode.textContent?.length ?? 0;
				endNode = endWalker.nextNode();
			}
			if (endNode) range.setEnd(endNode, endRemaining);
			else range.setEndAfter(element.lastChild ?? element);
		}
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	function updateLiveLine(line: number, value: string): void {
		const lines = [...markdownLines];
		const replacement = value.split('\n');
		lines.splice(line, 1, ...replacement);
		liveLine = line + replacement.length - 1;
		updateMarkdown(lines.join('\n'));
		if (replacement.length > 1) activateLiveLine(liveLine, replacement.at(-1)?.length ?? 0);
	}

	function handleLiveLineKeydown(event: KeyboardEvent, line: number): void {
		if (!liveEditor) return;
		const start = liveEditor.selectionStart;
		const end = liveEditor.selectionEnd;
		const value = liveEditor.value;
		if (event.key === 'Enter') {
			event.preventDefault();
			const before = value.slice(0, start);
			const after = value.slice(end);
			const marker = before.match(/^(\s*(?:[-*]\s+(?:\[[ xX]\]\s+)?|>\s+))/)?.[1] ?? '';
			const continuation = marker && before.trim() !== marker.trim() ? marker : '';
			const lines = [...markdownLines];
			lines.splice(line, 1, before, `${continuation}${after}`);
			updateMarkdown(lines.join('\n'));
			activateLiveLine(line + 1, continuation.length);
		} else if (event.key === 'Backspace' && start === 0 && end === 0 && line > 0) {
			event.preventDefault();
			const lines = [...markdownLines];
			const previousLength = lines[line - 1].length;
			lines.splice(line - 1, 2, `${lines[line - 1]}${value}`);
			updateMarkdown(lines.join('\n'));
			activateLiveLine(line - 1, previousLength);
		} else if (event.key === 'ArrowUp' && start === 0 && end === 0 && line > 0) {
			event.preventDefault();
			activateLiveLine(line - 1);
		} else if (event.key === 'ArrowDown' && start === value.length && end === value.length && line < markdownLines.length - 1) {
			event.preventDefault();
			activateLiveLine(line + 1, 0);
		}
	}

	function queueSearch(value: string): void {
		searchQuery = value;
		notePage = 0;
		if (searchTimer) window.clearTimeout(searchTimer);
		searchTimer = window.setTimeout(() => void runSearch(value), 120);
	}

	async function runSearch(query: string): Promise<void> {
		if (!vault) return;
		const sequence = ++searchSequence;
		const nextResults = await vault.search(query);
		if (sequence === searchSequence) {
			results = nextResults;
			notePage = 0;
		}
	}

	function changeNotePage(page: number): void {
		notePage = Math.min(Math.max(page, 0), notePageCount - 1);
		noteList?.scrollTo({ top: 0 });
	}

	function insertSyntax(before: string, after = before, placeholder = 'text'): void {
		if (viewMode === 'live' && inlinePreviewBehavior === 'rendered') {
			const target = liveEditorContainer?.querySelector<HTMLElement>(`[data-live-line="${liveLine}"]`);
			const selection = target && getSourceSelection(target);
			if (!target || !selection) return;
			const lineOffset = markdownLines.slice(0, liveLine).reduce((total, line) => total + line.length + 1, 0);
			const start = lineOffset + selection.start;
			const end = lineOffset + selection.end;
			const selected = markdown.slice(start, end) || placeholder;
			updateMarkdown(`${markdown.slice(0, start)}${before}${selected}${after}${markdown.slice(end)}`);
			requestAnimationFrame(() => {
				focusRenderedLine(liveLine, selection.start + before.length);
				const element = liveEditorContainer?.querySelector<HTMLElement>(`[data-live-line="${liveLine}"]`);
				if (element) setRenderedSelection(element, selection.start + before.length, selection.start + before.length + selected.length);
			});
			return;
		}
		const target = viewMode === 'live' ? liveEditor : editor;
		if (!target) return;
		const relativeStart = target.selectionStart;
		const lineOffset = viewMode === 'live'
			? markdownLines.slice(0, liveLine).reduce((total, line) => total + line.length + 1, 0)
			: 0;
		const start = lineOffset + relativeStart;
		const end = lineOffset + target.selectionEnd;
		const selection = markdown.slice(start, end) || placeholder;
		updateMarkdown(`${markdown.slice(0, start)}${before}${selection}${after}${markdown.slice(end)}`);
		requestAnimationFrame(() => {
			target.focus();
			const selectionStart = relativeStart + before.length;
			target.setSelectionRange(selectionStart, selectionStart + selection.length);
		});
	}

	function prefixLine(prefix: string): void {
		if (viewMode === 'live' && inlinePreviewBehavior === 'rendered') {
			const target = liveEditorContainer?.querySelector<HTMLElement>(`[data-live-line="${liveLine}"]`);
			const selection = target && getSourceSelection(target);
			if (!target || !selection) return;
			const lineOffset = markdownLines.slice(0, liveLine).reduce((total, line) => total + line.length + 1, 0);
			updateMarkdown(`${markdown.slice(0, lineOffset)}${prefix}${markdown.slice(lineOffset)}`);
			requestAnimationFrame(() => focusRenderedLine(liveLine, selection.start + prefix.length));
			return;
		}
		const target = viewMode === 'live' ? liveEditor : editor;
		if (!target) return;
		const relativeCursor = target.selectionStart;
		const lineOffset = viewMode === 'live'
			? markdownLines.slice(0, liveLine).reduce((total, line) => total + line.length + 1, 0)
			: 0;
		const cursor = lineOffset + relativeCursor;
		const start = markdown.lastIndexOf('\n', cursor - 1) + 1;
		updateMarkdown(`${markdown.slice(0, start)}${prefix}${markdown.slice(start)}`);
		requestAnimationFrame(() => {
			target.focus();
			const nextCursor = relativeCursor + prefix.length;
			target.setSelectionRange(nextCursor, nextCursor);
		});
	}

	function handleShortcut(event: KeyboardEvent): void {
		const command = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();
		if (command && key === 'k') {
			event.preventDefault();
			togglePalette();
			return;
		}
		if (paletteOpen) return;
		if (command && key === 's') {
			event.preventDefault();
			if (transferState !== 'working') void saveDraft();
		} else if (command && key === 'enter') {
			event.preventDefault();
			if (transferState !== 'working') void createNote();
		} else if (command && event.shiftKey && key === 'f') {
			event.preventDefault();
			focusSearch();
		} else if (command && event.shiftKey && key === 'l') {
			event.preventDefault();
			setTheme(nextThemePreference(theme));
		} else if (command && key === '\\') {
			event.preventDefault();
			toggleSidebar();
		} else if (command && key === 'b') {
			event.preventDefault();
			insertSyntax('**', '**', 'bold text');
		} else if (command && key === 'i') {
			event.preventDefault();
			insertSyntax('_', '_', 'italic text');
		} else if (command && event.shiftKey && key === 'p') {
			event.preventDefault();
			viewMode = viewMode === 'preview' ? 'edit' : 'preview';
		} else if (event.key === '?' && !isTypingTarget(event.target)) {
			shortcutsOpen = true;
		} else if (event.key === '/' && !isTypingTarget(event.target)) {
			event.preventDefault();
			focusSearch();
		} else if (event.key === 'Escape') {
			if (restoreModalOpen && restoreState !== 'restoring') restoreModalOpen = false;
			else if (shortcutsOpen) shortcutsOpen = false;
			else if (settingsOpen) settingsOpen = false;
			else if (sidebarOpen) sidebarOpen = false;
			else if (searchQuery) {
				queueSearch('');
				searchInput?.blur();
			}
		}
	}

	function isTypingTarget(target: EventTarget | null): boolean {
		return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLElement && target.isContentEditable;
	}

	function focusSearch(): void {
		sidebarCollapsed = false;
		if (window.innerWidth <= 900) sidebarOpen = true;
		requestAnimationFrame(() => {
			searchInput?.focus();
			searchInput?.select();
		});
	}

	function toggleSidebar(): void {
		if (window.innerWidth <= 900) sidebarOpen = !sidebarOpen;
		else sidebarCollapsed = !sidebarCollapsed;
	}

	function setTheme(preference: ThemePreference): void {
		theme = preference;
		applyTheme(preference);
	}

	function togglePalette(): void {
		if (paletteOpen) {
			paletteOpen = false;
			return;
		}
		void openPalette();
	}

	async function openPalette(): Promise<void> {
		paletteNotes = vault ? await vault.listNotes() : [];
		paletteOpen = true;
	}

	function moveNoteFocus(event: KeyboardEvent): void {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		const files = [...(noteList?.querySelectorAll<HTMLButtonElement>('.file') ?? [])];
		const current = files.indexOf(document.activeElement as HTMLButtonElement);
		if (files.length === 0) return;
		event.preventDefault();
		const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
		files[(next + files.length) % files.length]?.focus();
	}

	function titleFromMarkdown(value: string): string {
		const firstLine = value.split('\n').find((line) => line.trim())?.trim() ?? '';
		const title = firstLine.replace(/^#{1,6}\s*/, '').replace(/[*_`~[\]]/g, '').trim();
		return title.slice(0, 80) || 'Untitled';
	}

	function renderLiveLine(line: string, index: number): string {
		const inCode = liveCodeLines[index] && !line.startsWith('```');
		const cacheKey = `${inCode ? 'code' : 'markdown'}\0${line}`;
		const cached = liveRenderCache.get(cacheKey);
		if (cached !== undefined) return cached;
		const rendered = inCode
			? `<pre><code>${escapeHtml(line) || ' '}</code></pre>`
			: renderMarkdown(line, resolveAttachmentUrl);
		if (liveRenderCache.size >= 1_000) liveRenderCache.delete(liveRenderCache.keys().next().value ?? '');
		liveRenderCache.set(cacheKey, rendered);
		return rendered;
	}

	function liveLineKind(line: string, index: number): string {
		if (liveCodeLines[index]) return 'code-line';
		const heading = line.match(/^(#{1,3})\s+/);
		if (heading) return `heading-${heading[1].length}`;
		if (/^>\s+/.test(line)) return 'quote-line';
		if (/^[-*]\s+/.test(line)) return 'list-line';
		return '';
	}

	function renderEditableLine(line: string, index: number): string {
		if (!line) return '<br>';
		const kind = liveLineKind(line, index);
		if (kind === 'code-line') {
			const fence = line.match(/^(```)(.*)$/);
			return fence ? `<span class="md-syntax">${fence[1]}</span>${escapeHtml(fence[2])}` : escapeHtml(line);
		}
		const heading = line.match(/^(#{1,3}\s+)(.*)$/);
		if (heading) return `<span class="md-syntax">${escapeHtml(heading[1])}</span>${editableInlineMarkdown(heading[2])}`;
		const task = line.match(/^([-*]\s+)(\[([ xX])\]\s+)(.*)$/);
		if (task) return `<span class="md-syntax">${escapeHtml(task[1])}</span><span class="live-task-check ${task[3] !== ' ' ? 'done' : ''}"></span><span class="md-syntax">${escapeHtml(task[2])}</span>${editableInlineMarkdown(task[4])}`;
		const list = line.match(/^([-*]\s+)(.*)$/);
		if (list) return `<span class="md-syntax">${escapeHtml(list[1])}</span><span class="live-list-marker"></span>${editableInlineMarkdown(list[2])}`;
		const quote = line.match(/^(>\s+)(.*)$/);
		if (quote) return `<span class="md-syntax">${escapeHtml(quote[1])}</span>${editableInlineMarkdown(quote[2])}`;
		return editableInlineMarkdown(line);
	}

	function editableInlineMarkdown(value: string): string {
		return escapeHtml(value)
			.replace(/`([^`]+)`/g, '<span class="md-syntax">`</span><code>$1</code><span class="md-syntax">`</span>')
			.replace(/\*\*([^*]+)\*\*/g, '<span class="md-syntax">**</span><strong>$1</strong><span class="md-syntax">**</span>')
			.replace(/_([^_]+)_/g, '<span class="md-syntax">_</span><em>$1</em><span class="md-syntax">_</span>')
			.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<span class="md-syntax">[</span><a>$1</a><span class="md-syntax">]($2)</span>');
	}

	function escapeHtml(value: string): string {
		return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
	}
</script>

<svelte:head><title>Onyx — Markdown notes</title><meta name="description" content="A fast, local-first Markdown editor with full-text search that works offline." /></svelte:head>

<div class="app" class:sidebar-open={sidebarOpen} class:sidebar-collapsed={sidebarCollapsed} inert={paletteOpen || settingsOpen || restoreModalOpen || shortcutsOpen}>
	<AppHeader
		{viewMode} {isOnline} {saveState} {transferState} {paletteOpen} {theme} {themeLabel}
		{settingsOpen} {githubState} {githubUser} {githubMessage} {githubBackup} {backupState}
		{pendingBackupCount} {restoreModalOpen} {restoreState} {shortcutsOpen} {vault}
		onToggleSidebar={toggleSidebar}
		onViewModeChange={(mode) => (viewMode = mode)}
		onOpenInlinePreview={() => openInlinePreview()}
		onSave={() => void saveDraft()}
		onOpenPalette={() => void openPalette()}
		onCycleTheme={() => setTheme(nextThemePreference(theme))}
		onOpenSettings={() => openSettings(githubState === 'connected' ? 'backup' : 'github')}
		onBackup={() => void beginBackup()}
		onRestore={() => void openRestore()}
		onDisconnectGithub={() => void disconnectGitHub()}
		onOpenShortcuts={() => (shortcutsOpen = true)}
	/>
	<NotesSidebar
		{activeNoteId} {results} {visibleResults} {searchQuery} {notePage} {notePageCount}
		{saveState} {transferState} {storageError} bind:searchInput bind:noteList
		onToggleSidebar={toggleSidebar}
		onCreateNote={() => void createNote()}
		onSearch={queueSearch}
		onMoveNoteFocus={moveNoteFocus}
		onSelectNote={(id) => void selectNote(id)}
		onChangePage={changeNotePage}
	/>
	<MarkdownWorkspace
		{storageNotice} {storageError} {viewMode} {inlinePreviewBehavior} {markdown} {markdownLines}
		{liveLine} {saveState} {transferState} {wordCount} {readingMinutes} {hasContent}
		{renderedMarkdown} bind:editor bind:liveEditor bind:liveEditorContainer
		onRetryStorage={() => void (vault ? saveDraft() : openVault())}
		onReload={() => location.reload()}
		onInsertSyntax={insertSyntax}
		onPrefixLine={prefixLine}
		onMarkdownChange={updateMarkdown}
		onLiveLineFocus={(line) => (liveLine = line)}
		onRenderedLineInput={updateRenderedLine}
		onRenderedLineKeydown={handleRenderedLineKeydown}
		onLiveLineChange={updateLiveLine}
		onLiveLineKeydown={handleLiveLineKeydown}
		onActivateLiveLine={activateLiveLine}
		{renderEditableLine} {renderLiveLine} {liveLineKind}
	/>
</div>

<StatusNotices
	{backupMessage} {backupState} {backupCommitUrl} {transferMessage} {transferState}
	onDismissBackup={() => (backupMessage = '')}
	onDismissTransfer={() => (transferMessage = '')}
/>

{#if paletteOpen}
	<CommandPalette items={paletteItems} onClose={() => (paletteOpen = false)} />
{/if}

{#if settingsOpen}
	<SettingsDialog
		{vault}
		{isOnline}
		{githubUser}
		{githubState}
		{githubMessage}
		{githubBackup}
		{pendingBackupCount}
		{backupState}
		{backupMessage}
		{backupCommitUrl}
		{transferState}
		{theme}
		{inlinePreviewBehavior}
		onThemeChange={setTheme}
		onInlinePreviewBehaviorChange={setInlinePreviewBehavior}
		bind:section={settingsSection}
		onClose={() => (settingsOpen = false)}
		onDisconnectGithub={() => void disconnectGitHub()}
		onCreateRepository={(name) => void createBackupRepository(name)}
		onSelectRepository={(state) => void selectBackupRepository(state)}
		onForgetRepository={() => void forgetBackupRepository()}
		onBackup={() => void beginBackup()}
		onRestore={() => { settingsOpen = false; void openRestore(); }}
		onImportFolder={() => folderInput?.click()}
		onImportZip={() => zipInput?.click()}
		onExportFolder={() => void exportFolder()}
		onExportZip={() => void exportZip()}
		onVaultCleared={() => void reloadVault()}
	/>
{/if}

<input class="transfer-input" bind:this={folderInput} type="file" webkitdirectory multiple onchange={(event) => void importFolder(event.currentTarget.files)} />
<input class="transfer-input" bind:this={zipInput} type="file" accept=".zip,application/zip" onchange={(event) => void importZip(event.currentTarget.files)} />

{#if restoreModalOpen}
	<RestoreDialog
		{isOnline} {restoreState} {restoreMessage} {restoreCommits}
		bind:selectedRestoreSha bind:restoreOwner bind:restoreRepository bind:restoreBranch bind:restoreDirectory
		onClose={() => (restoreModalOpen = false)}
		onLoadCommits={() => void loadRestoreCommits()}
		onRestore={() => void restoreSelectedCommit()}
		{formatCommitDate}
	/>
{/if}

{#if shortcutsOpen}
	<ShortcutsDialog onClose={() => (shortcutsOpen = false)} />
{/if}
