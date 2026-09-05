<script lang="ts">
	import {
		Bold, Check, ChevronRight, CloudDownload, CloudOff, Code2, Columns2, Eye, FileText, Heading2,
		CloudUpload, Download, ExternalLink, FileArchive, FolderInput, FolderOutput, GitCommitHorizontal, HelpCircle, Italic, Link, List, LoaderCircle, LogOut, PanelLeft,
		PencilLine, Plus, Quote, RotateCcw, Save, Search, X
	} from '@lucide/svelte';
	import {
		backupVaultToGithub, createPrivateGithubRepository, disconnectGithub, GithubRequestError,
		createMarkdownExport, createMarkdownZip, importMarkdownFiles, listGithubBackupCommits,
		readMarkdownFolder, readMarkdownZip, restoreGithubSession, restoreVaultFromGithub, Vault, writeMarkdownFolder,
		type GithubBackupCommit, type GithubBackupState, type GithubUser, type VaultSearchResult
	} from '$lib';
	import { onMount } from 'svelte';

	type ViewMode = 'edit' | 'split' | 'preview';
	type SaveState = 'loading' | 'saved' | 'saving' | 'unsaved' | 'error';
	const INITIAL_MARKDOWN = `# Welcome to Onyx

Onyx is a quiet place to think in Markdown. Your work stays on this device and saves automatically as you write.

## Find anything quickly

Create as many notes as you need. Search checks every title and every word, while the index stays on this device.

> Good tools disappear into the work.

### Today’s notes

- [x] Open a fresh page
- [ ] Capture the next idea
- [ ] Shape it into something useful

Use \`⌘ S\` to save now, \`⌘ K\` to search, or \`⌘ ⇧ P\` to toggle preview.`;

	let vault = $state<Vault>();
	let activeNoteId = $state('');
	let markdown = $state(INITIAL_MARKDOWN);
	let lastSavedMarkdown = $state(INITIAL_MARKDOWN);
	let noteTitle = $state('Welcome to Onyx');
	let results = $state<VaultSearchResult[]>([]);
	let searchQuery = $state('');
	let viewMode = $state<ViewMode>('split');
	let saveState = $state<SaveState>('loading');
	let saveTimer: number | undefined = $state();
	let searchTimer: number | undefined = $state();
	let searchSequence = 0;
	let editor: HTMLTextAreaElement | undefined = $state();
	let searchInput: HTMLInputElement | undefined = $state();
	let shortcutsOpen = $state(false);
	let sidebarOpen = $state(false);
	let storageError = $state('');
	let githubUser = $state<GithubUser>();
	let githubState = $state<'loading' | 'connected' | 'disconnected' | 'error'>('loading');
	let githubMessage = $state('');
	let githubBackup = $state<GithubBackupState>();
	let backupState = $state<'idle' | 'backing-up' | 'success' | 'error'>('idle');
	let backupMessage = $state('');
	let backupCommitUrl = $state('');
	let backupModalOpen = $state(false);
	let repositoryName = $state('onyx-vault');
	let pendingBackupCount = $state(0);
	let restoreModalOpen = $state(false);
	let restoreState = $state<'idle' | 'loading' | 'restoring' | 'error'>('idle');
	let restoreMessage = $state('');
	let restoreCommits = $state<GithubBackupCommit[]>([]);
	let selectedRestoreSha = $state('');
	let restoreOwner = $state('');
	let restoreRepository = $state('onyx-vault');
	let restoreBranch = $state('main');
	let restoreDirectory = $state('vault');
	let transferModalOpen = $state(false);
	let transferState = $state<'idle' | 'working' | 'error'>('idle');
	let transferMessage = $state('');
	let folderInput: HTMLInputElement | undefined = $state();
	let zipInput: HTMLInputElement | undefined = $state();

	const wordCount = $derived(markdown.trim() ? markdown.trim().split(/\s+/).length : 0);
	const characterCount = $derived(markdown.length);
	const readingMinutes = $derived(Math.max(1, Math.ceil(wordCount / 220)));
	const renderedMarkdown = $derived(renderMarkdown(markdown));

	onMount(() => {
		void openVault();
		void restoreGitHub();
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (markdown === lastSavedMarkdown) return;
			event.preventDefault();
		};
		const onKeydown = (event: KeyboardEvent) => handleShortcut(event);
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden' && markdown !== lastSavedMarkdown) void saveDraft();
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		window.addEventListener('keydown', onKeydown);
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			window.removeEventListener('beforeunload', onBeforeUnload);
			window.removeEventListener('keydown', onKeydown);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			if (saveTimer) window.clearTimeout(saveTimer);
			if (searchTimer) window.clearTimeout(searchTimer);
			vault?.close();
		};
	});

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
		try {
			githubUser = await restoreGithubSession();
			githubState = githubUser ? 'connected' : githubMessage ? 'error' : 'disconnected';
		} catch (error) {
			githubState = 'error';
			githubMessage = error instanceof Error ? error.message : 'GitHub authentication failed.';
		}
	}

	async function disconnectGitHub(): Promise<void> {
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
		if (!vault || backupState === 'backing-up') return;
		if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
		if (!githubBackup) {
			backupModalOpen = true;
			return;
		}
		await runBackup(githubBackup);
	}

	async function createBackupRepository(): Promise<void> {
		if (!vault || !repositoryName.trim()) return;
		backupState = 'backing-up';
		backupMessage = 'Creating your private repository…';
		backupModalOpen = false;
		try {
			const configuration = await createPrivateGithubRepository(repositoryName);
			await vault.saveGithubBackupState(configuration);
			githubBackup = configuration;
			await runBackup(configuration);
		} catch (error) {
			showBackupError(error);
		}
	}

	async function runBackup(configuration: GithubBackupState): Promise<void> {
		if (!vault) return;
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
		if (!githubUser || restoreState === 'restoring') return;
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
		return {
			owner: restoreOwner.trim(),
			repository: restoreRepository.trim(),
			branch: restoreBranch.trim(),
			directory: restoreDirectory.trim().replace(/^\/+|\/+$/g, ''),
			updatedAt: new Date().toISOString()
		};
	}

	async function loadRestoreCommits(): Promise<void> {
		if (!restoreOwner.trim() || !restoreRepository.trim() || !restoreBranch.trim()) return;
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
		if (!vault || !selectedRestoreSha || restoreState === 'restoring') return;
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

	function formatCommitDate(value: string): string {
		if (!value) return 'Unknown date';
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
	}

	async function openVault(): Promise<void> {
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
			void vault.requestPersistentStorage();
		} catch (error) {
			storageError = error instanceof Error ? error.message : 'Your notes could not be opened.';
			saveState = 'error';
		}
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
		const note = await vault.getNote(id);
		if (!note) return;
		activeNoteId = note.id;
		markdown = note.markdown;
		lastSavedMarkdown = note.markdown;
		noteTitle = note.title;
		saveState = 'saved';
		storageError = '';
		sidebarOpen = false;
	}

	async function selectNote(id: string): Promise<void> {
		if (id === activeNoteId) return;
		if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
		await loadNote(id);
	}

	async function createNote(): Promise<void> {
		if (!vault) return;
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
		if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
		transferState = 'working';
		transferMessage = 'Importing Markdown and attachments…';
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
		if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
		transferState = 'working';
		transferMessage = 'Building ZIP archive…';
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
		if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
		try {
			const directory = await picker.call(window, { mode: 'readwrite' });
			transferState = 'working';
			transferMessage = 'Writing Markdown folder…';
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

	function queueSave(): void {
		saveState = 'unsaved';
		if (saveTimer) window.clearTimeout(saveTimer);
		saveTimer = window.setTimeout(() => void saveDraft(), 700);
	}

	async function saveDraft(): Promise<boolean> {
		if (!vault || !activeNoteId) return false;
		if (saveTimer) window.clearTimeout(saveTimer);
		saveTimer = undefined;
		saveState = 'saving';
		const contents = markdown;
		try {
			const note = await vault.saveNote({ id: activeNoteId, title: titleFromMarkdown(contents), markdown: contents });
			lastSavedMarkdown = contents;
			noteTitle = note.title;
			saveState = markdown === contents ? 'saved' : 'unsaved';
			storageError = '';
			await runSearch(searchQuery);
			pendingBackupCount = (await vault.getPendingBackupOperations()).length;
			return true;
		} catch (error) {
			storageError = error instanceof Error ? error.message : 'Autosave failed.';
			saveState = 'error';
			return false;
		}
	}

	function updateMarkdown(value: string): void {
		markdown = value;
		noteTitle = titleFromMarkdown(value);
		queueSave();
	}

	function queueSearch(value: string): void {
		searchQuery = value;
		if (searchTimer) window.clearTimeout(searchTimer);
		searchTimer = window.setTimeout(() => void runSearch(value), 120);
	}

	async function runSearch(query: string): Promise<void> {
		if (!vault) return;
		const sequence = ++searchSequence;
		const nextResults = await vault.search(query);
		if (sequence === searchSequence) results = nextResults;
	}

	function insertSyntax(before: string, after = before, placeholder = 'text'): void {
		if (!editor) return;
		const start = editor.selectionStart;
		const end = editor.selectionEnd;
		const selection = markdown.slice(start, end) || placeholder;
		markdown = `${markdown.slice(0, start)}${before}${selection}${after}${markdown.slice(end)}`;
		queueSave();
		requestAnimationFrame(() => {
			editor?.focus();
			editor?.setSelectionRange(start + before.length, start + before.length + selection.length);
		});
	}

	function prefixLine(prefix: string): void {
		if (!editor) return;
		const cursor = editor.selectionStart;
		const start = markdown.lastIndexOf('\n', cursor - 1) + 1;
		markdown = `${markdown.slice(0, start)}${prefix}${markdown.slice(start)}`;
		queueSave();
		requestAnimationFrame(() => {
			editor?.focus();
			editor?.setSelectionRange(cursor + prefix.length, cursor + prefix.length);
		});
	}

	function handleShortcut(event: KeyboardEvent): void {
		const command = event.metaKey || event.ctrlKey;
		if (command && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			searchInput?.focus();
			searchInput?.select();
		} else if (command && event.key.toLowerCase() === 's') {
			event.preventDefault();
			void saveDraft();
		} else if (command && event.key.toLowerCase() === 'b') {
			event.preventDefault();
			insertSyntax('**', '**', 'bold text');
		} else if (command && event.key.toLowerCase() === 'i') {
			event.preventDefault();
			insertSyntax('_', '_', 'italic text');
		} else if (command && event.shiftKey && event.key.toLowerCase() === 'p') {
			event.preventDefault();
			viewMode = viewMode === 'preview' ? 'edit' : 'preview';
		} else if (event.key === '?' && !isTypingTarget(event.target)) {
			shortcutsOpen = true;
		} else if (event.key === 'Escape') {
			if (searchQuery) {
				queueSearch('');
				searchInput?.blur();
			} else shortcutsOpen = false;
		}
	}

	function isTypingTarget(target: EventTarget | null): boolean {
		return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
	}

	function restoreSaved(): void {
		markdown = lastSavedMarkdown;
		noteTitle = titleFromMarkdown(markdown);
		saveState = 'saved';
		if (saveTimer) window.clearTimeout(saveTimer);
	}

	function titleFromMarkdown(value: string): string {
		const firstLine = value.split('\n').find((line) => line.trim())?.trim() ?? '';
		const title = firstLine.replace(/^#{1,6}\s*/, '').replace(/[*_`~[\]]/g, '').trim();
		return title.slice(0, 80) || 'Untitled';
	}

	function renderMarkdown(source: string): string {
		const lines = escapeHtml(source).split('\n');
		const output: string[] = [];
		let inCode = false;
		let inList = false;
		for (const line of lines) {
			if (line.startsWith('```')) {
				if (inList) { output.push('</ul>'); inList = false; }
				output.push(inCode ? '</code></pre>' : '<pre><code>');
				inCode = !inCode;
				continue;
			}
			if (inCode) { output.push(`${line}\n`); continue; }
			const heading = line.match(/^(#{1,3})\s+(.*)$/);
			if (heading) {
				if (inList) { output.push('</ul>'); inList = false; }
				const level = heading[1].length;
				output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
				continue;
			}
			const item = line.match(/^[-*]\s+(.*)$/);
			if (item) {
				if (!inList) { output.push('<ul>'); inList = true; }
				const task = item[1].match(/^\[([ xX])\]\s+(.*)$/);
				output.push(task ? `<li class="task"><span class="check ${task[1] !== ' ' ? 'done' : ''}">${task[1] !== ' ' ? '✓' : ''}</span>${inlineMarkdown(task[2])}</li>` : `<li>${inlineMarkdown(item[1])}</li>`);
				continue;
			}
			if (inList) { output.push('</ul>'); inList = false; }
			if (line.startsWith('&gt; ')) output.push(`<blockquote>${inlineMarkdown(line.slice(5))}</blockquote>`);
			else if (line.trim()) output.push(`<p>${inlineMarkdown(line)}</p>`);
			else output.push('<div class="spacer"></div>');
		}
		if (inList) output.push('</ul>');
		if (inCode) output.push('</code></pre>');
		return output.join('');
	}

	function inlineMarkdown(value: string): string {
		return value.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/_([^_]+)_/g, '<em>$1</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
	}

	function escapeHtml(value: string): string {
		return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
	}
</script>

<svelte:head><title>Onyx — Markdown notes</title><meta name="description" content="A fast, local-first Markdown editor with full-text search." /></svelte:head>

<div class="app" class:sidebar-open={sidebarOpen}>
	<header class="topbar">
		<div class="brand"><button class="mobile-menu icon-button" aria-label="Open files" onclick={() => (sidebarOpen = true)}><PanelLeft size={19} /></button><div class="brand-mark">O</div><span>Onyx</span></div>
		<div class="document-path" aria-label="Current document"><span>Notes</span><ChevronRight size={14} /><strong>{noteTitle}.md</strong></div>
		<div class="top-actions">
			<div class="save-status" class:error={saveState === 'error'} aria-live="polite">
				{#if saveState === 'loading' || saveState === 'saving'}<LoaderCircle class="spin" size={15} />{:else if saveState === 'error'}<CloudOff size={15} />{:else}<span class:unsaved={saveState === 'unsaved'}></span>{/if}
				{saveState === 'loading' ? 'Opening…' : saveState === 'saving' ? 'Saving…' : saveState === 'unsaved' ? 'Unsaved' : saveState === 'error' ? 'Save failed' : 'Saved to this device'}
			</div>
			<button class="save-button" onclick={() => void saveDraft()} disabled={saveState === 'saving'}><Save size={16} /><span>Save</span><kbd>⌘S</kbd></button>
			<button class="icon-button" aria-label="Import or export Markdown" title="Import or export Markdown" onclick={() => (transferModalOpen = true)}><FileArchive size={18} /></button>
			{#if githubState === 'connected' && githubUser}
				<button class="backup-button" class:success={backupState === 'success'} class:error={backupState === 'error'} onclick={() => void beginBackup()} disabled={!vault || backupState === 'backing-up'} title={githubBackup ? `Back up to ${githubBackup.owner}/${githubBackup.repository}` : 'Create a private repository and back up the vault'}>
					{#if backupState === 'backing-up'}<LoaderCircle class="spin" size={15} />{:else}<CloudUpload size={16} />{/if}
					<span>{backupState === 'backing-up' ? 'Backing up…' : 'Back up'}</span>
					{#if pendingBackupCount > 0}<i>{pendingBackupCount}</i>{/if}
				</button>
				<button class="backup-button restore-button" onclick={() => void openRestore()} disabled={!vault || restoreState === 'restoring'} title="Restore a GitHub backup commit">
					{#if restoreState === 'restoring'}<LoaderCircle class="spin" size={15} />{:else}<CloudDownload size={16} />{/if}
					<span>{restoreState === 'restoring' ? 'Restoring…' : 'Restore'}</span>
				</button>
				<div class="github-account" title={`Connected as ${githubUser.login}`}><img src={githubUser.avatarUrl} alt="" /><span>@{githubUser.login}</span><button aria-label="Disconnect GitHub" title="Disconnect GitHub" onclick={() => void disconnectGitHub()}><LogOut size={14} /></button></div>
			{:else}
				<a class="github-connect" class:error={githubState === 'error'} href="/auth/github/start" title={githubMessage || 'Connect GitHub for direct, private backups'} aria-label="Connect GitHub">{#if githubState === 'loading'}<LoaderCircle class="spin" size={15} />{:else}<CloudUpload size={16} />{/if}<span>{githubState === 'loading' ? 'Checking…' : 'Connect GitHub'}</span></a>
			{/if}
			<button class="icon-button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onclick={() => (shortcutsOpen = true)}><HelpCircle size={18} /></button>
		</div>
	</header>

	<aside class="sidebar" aria-label="Notes">
		<div class="sidebar-heading"><span>Workspace</span><button class="icon-button mobile-close" aria-label="Close files" onclick={() => (sidebarOpen = false)}><X size={18} /></button></div>
		<div class="notes-heading"><h1>Notes</h1><button class="new-note" aria-label="New note" title="New note" onclick={() => void createNote()}><Plus size={17} /></button></div>
		<label class="search-box"><Search size={15} /><input bind:this={searchInput} type="search" placeholder="Search all notes" value={searchQuery} oninput={(event) => queueSearch(event.currentTarget.value)} /><kbd>⌘K</kbd></label>
		<div class="result-count" aria-live="polite">{searchQuery ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : `${results.length} ${results.length === 1 ? 'note' : 'notes'}`}</div>
		<nav class="note-list">
			{#each results as result (result.note.id)}
				<button class="file" class:active={result.note.id === activeNoteId} onclick={() => void selectNote(result.note.id)}>
					<FileText size={16} /><span><strong>{result.note.title}</strong>{#if searchQuery}<small>{result.excerpt || 'Title match'}</small>{/if}</span>{#if result.note.id === activeNoteId}<i></i>{/if}
				</button>
			{:else}
				<div class="empty-results"><Search size={20} /><strong>No notes found</strong><span>Try a different word or phrase.</span></div>
			{/each}
		</nav>
		<div class="local-note"><span class="local-icon"><Check size={14} /></span><div><strong>Private by default</strong><p>Notes stay on this device. Backups go directly from your browser to GitHub.</p></div></div>
	</aside>

	<main class="workspace">
		<div class="document-bar">
			<div class="document-info"><FileText size={17} /><span>{noteTitle}.md</span></div>
			<div class="view-switcher" aria-label="View mode">
				<button class:active={viewMode === 'edit'} onclick={() => (viewMode = 'edit')} aria-label="Editor only" title="Editor only"><PencilLine size={16} /><span>Edit</span></button>
				<button class:active={viewMode === 'split'} onclick={() => (viewMode = 'split')} aria-label="Split view" title="Split view"><Columns2 size={16} /><span>Split</span></button>
				<button class:active={viewMode === 'preview'} onclick={() => (viewMode = 'preview')} aria-label="Preview only" title="Preview only"><Eye size={16} /><span>Preview</span></button>
			</div>
			<div class="document-stats"><span>{wordCount} words</span><span>{readingMinutes} min read</span></div>
		</div>

		{#if storageError}<div class="storage-error"><CloudOff size={16} /><span>{storageError} Your current text will remain open, but it may be lost when this tab closes.</span><button onclick={() => void saveDraft()}>Try again</button></div>{/if}

		<section class="editor-shell" class:edit-only={viewMode === 'edit'} class:preview-only={viewMode === 'preview'}>
			<div class="editor-pane" aria-hidden={viewMode === 'preview'}>
				<div class="formatting-bar" aria-label="Formatting tools">
					<button onclick={() => insertSyntax('**', '**', 'bold text')} title="Bold (⌘B)" aria-label="Bold"><Bold size={16} /></button><button onclick={() => insertSyntax('_', '_', 'italic text')} title="Italic (⌘I)" aria-label="Italic"><Italic size={16} /></button><span></span><button onclick={() => prefixLine('## ')} title="Heading" aria-label="Heading"><Heading2 size={17} /></button><button onclick={() => prefixLine('- ')} title="Bulleted list" aria-label="Bulleted list"><List size={17} /></button><button onclick={() => prefixLine('> ')} title="Quote" aria-label="Quote"><Quote size={16} /></button><button onclick={() => insertSyntax('`', '`', 'code')} title="Inline code" aria-label="Inline code"><Code2 size={17} /></button><button onclick={() => insertSyntax('[', '](https://)', 'link text')} title="Link" aria-label="Link"><Link size={16} /></button>
				</div>
				<textarea bind:this={editor} value={markdown} oninput={(event) => updateMarkdown(event.currentTarget.value)} aria-label="Markdown editor" spellcheck="true" disabled={saveState === 'loading'}></textarea>
				<div class="editor-footer"><span>Markdown</span><span>{characterCount.toLocaleString()} characters</span></div>
			</div>
			<div class="preview-pane" aria-hidden={viewMode === 'edit'}><div class="preview-label"><Eye size={14} /> Preview</div><article class="prose">{@html renderedMarkdown}</article></div>
		</section>
	</main>
</div>

{#if saveState === 'unsaved'}<div class="unsaved-bar" aria-live="polite"><span><i></i>Changes haven’t been saved yet</span><button onclick={restoreSaved}><RotateCcw size={14} /> Revert</button><button class="bar-save" onclick={() => void saveDraft()}><Save size={14} /> Save now</button></div>{/if}

{#if backupMessage}
	<div class="backup-notice" class:error={backupState === 'error'} role="status">
		<span>{backupMessage}</span>
		{#if backupCommitUrl}<a href={backupCommitUrl} target="_blank" rel="noreferrer">View commit <ExternalLink size={13} /></a>{/if}
		<button aria-label="Dismiss backup status" onclick={() => (backupMessage = '')}><X size={14} /></button>
	</div>
{/if}

{#if transferMessage}
	<div class="backup-notice transfer-notice" class:error={transferState === 'error'} role="status">
		{#if transferState === 'working'}<LoaderCircle class="spin" size={14} />{/if}
		<span>{transferMessage}</span>
		<button aria-label="Dismiss import or export status" onclick={() => (transferMessage = '')}><X size={14} /></button>
	</div>
{/if}

{#if transferModalOpen}
	<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget && transferState !== 'working') transferModalOpen = false; }}>
		<div class="shortcut-modal transfer-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
			<div class="modal-title"><div><span>Portable Markdown</span><h2 id="transfer-title">Import or export</h2></div><button class="icon-button" aria-label="Close import and export" disabled={transferState === 'working'} onclick={() => (transferModalOpen = false)}><X size={18} /></button></div>
			<div class="transfer-options">
				<section><div><FolderInput size={20} /><span><strong>Import folder</strong><small>Add every Markdown file and its attachments.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={() => folderInput?.click()}>Choose folder</button></section>
				<section><div><FileArchive size={20} /><span><strong>Import ZIP</strong><small>Unpack a Markdown archive without flattening paths.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={() => zipInput?.click()}>Choose ZIP</button></section>
				<section><div><FolderOutput size={20} /><span><strong>Export folder</strong><small>Write notes and attachments into their original folders.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={() => void exportFolder()}>Choose folder</button></section>
				<section><div><Download size={20} /><span><strong>Export ZIP</strong><small>Download a portable archive of the entire vault.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={() => void exportZip()}>Download ZIP</button></section>
			</div>
			<input class="transfer-input" bind:this={folderInput} type="file" webkitdirectory multiple onchange={(event) => void importFolder(event.currentTarget.files)} />
			<input class="transfer-input" bind:this={zipInput} type="file" accept=".zip,application/zip" onchange={(event) => void importZip(event.currentTarget.files)} />
			<p>Existing notes stay in your vault. Imported paths are retained for the next folder or ZIP export.</p>
		</div>
	</div>
{/if}

{#if backupModalOpen}
	<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) backupModalOpen = false; }}>
		<form class="shortcut-modal backup-modal" onsubmit={(event) => { event.preventDefault(); void createBackupRepository(); }}>
			<div class="modal-title"><div><span>GitHub backup</span><h2>Create a private repository</h2></div><button type="button" class="icon-button" aria-label="Close GitHub backup" onclick={() => (backupModalOpen = false)}><X size={18} /></button></div>
			<div class="backup-form">
				<label for="repository-name">Repository name</label>
				<div class="repository-field"><span>{githubUser?.login}/</span><input id="repository-name" bind:value={repositoryName} required pattern="[A-Za-z0-9._-]+" autocomplete="off" /></div>
				<p>Onyx will create this repository as private. Each manual backup sends all pending file changes together in one commit.</p>
			</div>
			<div class="modal-actions"><button type="button" onclick={() => (backupModalOpen = false)}>Cancel</button><button class="primary" type="submit"><CloudUpload size={15} /> Create and back up</button></div>
		</form>
	</div>
{/if}

{#if restoreModalOpen}
	<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget && restoreState !== 'restoring') restoreModalOpen = false; }}>
		<div class="shortcut-modal restore-modal" role="dialog" aria-modal="true" aria-labelledby="restore-title">
			<div class="modal-title"><div><span>GitHub restore</span><h2 id="restore-title">Choose a backup commit</h2></div><button type="button" class="icon-button" aria-label="Close GitHub restore" disabled={restoreState === 'restoring'} onclick={() => (restoreModalOpen = false)}><X size={18} /></button></div>
			<form class="restore-source" onsubmit={(event) => { event.preventDefault(); void loadRestoreCommits(); }}>
				<label>Owner<input bind:value={restoreOwner} required autocomplete="off" /></label>
				<label>Repository<input bind:value={restoreRepository} required autocomplete="off" /></label>
				<label>Branch<input bind:value={restoreBranch} required autocomplete="off" /></label>
				<label>Directory<input bind:value={restoreDirectory} autocomplete="off" /></label>
				<button type="submit" disabled={restoreState === 'loading' || restoreState === 'restoring'}>{#if restoreState === 'loading'}<LoaderCircle class="spin" size={14} />{/if} Load commits</button>
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
			<div class="restore-warning"><strong>This replaces the local vault.</strong> Notes and attachments currently on this device will be removed and replaced by the selected commit.</div>
			<div class="modal-actions"><button type="button" disabled={restoreState === 'restoring'} onclick={() => (restoreModalOpen = false)}>Cancel</button><button class="primary danger" type="button" disabled={!selectedRestoreSha || restoreState === 'restoring'} onclick={() => void restoreSelectedCommit()}>{#if restoreState === 'restoring'}<LoaderCircle class="spin" size={15} />{:else}<CloudDownload size={15} />{/if} {restoreState === 'restoring' ? 'Restoring…' : 'Restore selected'}</button></div>
		</div>
	</div>
{/if}

{#if shortcutsOpen}
	<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) shortcutsOpen = false; }}>
		<div class="shortcut-modal" role="dialog" aria-modal="true" aria-labelledby="shortcut-title">
			<div class="modal-title"><div><span>Reference</span><h2 id="shortcut-title">Keyboard shortcuts</h2></div><button class="icon-button" aria-label="Close shortcuts" onclick={() => (shortcutsOpen = false)}><X size={18} /></button></div>
			<div class="shortcut-list"><div><span>Search notes</span><kbd>⌘ K</kbd></div><div><span>Save document</span><kbd>⌘ S</kbd></div><div><span>Bold selection</span><kbd>⌘ B</kbd></div><div><span>Italic selection</span><kbd>⌘ I</kbd></div><div><span>Toggle preview</span><kbd>⌘ ⇧ P</kbd></div><div><span>Close this panel</span><kbd>Esc</kbd></div></div>
			<p>Use Ctrl instead of ⌘ on Windows and Linux.</p>
		</div>
	</div>
{/if}
