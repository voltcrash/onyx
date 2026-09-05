<script lang="ts">
	import { Bold, Check, ChevronRight, CloudOff, Code2, Columns2, Eye, FileText, Heading2, HelpCircle, Italic, Link, List, LoaderCircle, PanelLeft, PencilLine, Quote, RotateCcw, Save, X } from '@lucide/svelte';
	import { onMount } from 'svelte';

	type ViewMode = 'edit' | 'split' | 'preview';
	type SaveState = 'loading' | 'saved' | 'saving' | 'unsaved' | 'error';
	const FILE_NAME = 'welcome-to-onyx.md';
	const INITIAL_MARKDOWN = `# Welcome to Onyx

Onyx is a quiet place to think in Markdown. Your work stays on this device and saves automatically as you write.

## A focused writing space

The editor keeps the tools you need close by, without getting in the way. Try selecting some text and making it **bold**, or switch to preview to see the finished document.

> Good tools disappear into the work.

### Today’s notes

- [x] Open a fresh page
- [ ] Capture the next idea
- [ ] Shape it into something useful

Use \`⌘ S\` to save now, or \`⌘ ⇧ P\` to toggle preview.`;

	let markdown = $state(INITIAL_MARKDOWN);
	let lastSavedMarkdown = $state(INITIAL_MARKDOWN);
	let viewMode = $state<ViewMode>('split');
	let saveState = $state<SaveState>('loading');
	let saveTimer: number | undefined = $state();
	let editor: HTMLTextAreaElement | undefined = $state();
	let shortcutsOpen = $state(false);
	let sidebarOpen = $state(false);
	let storageError = $state('');

	const wordCount = $derived(markdown.trim() ? markdown.trim().split(/\s+/).length : 0);
	const characterCount = $derived(markdown.length);
	const readingMinutes = $derived(Math.max(1, Math.ceil(wordCount / 220)));
	const renderedMarkdown = $derived(renderMarkdown(markdown));

	onMount(() => {
		void loadDraft();
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
		};
	});

	async function getDraftFile(): Promise<FileSystemFileHandle> {
		if (!navigator.storage?.getDirectory) throw new Error('OPFS is not supported by this browser.');
		const root = await navigator.storage.getDirectory();
		const drafts = await root.getDirectoryHandle('onyx', { create: true });
		return drafts.getFileHandle(FILE_NAME, { create: true });
	}

	async function loadDraft(): Promise<void> {
		try {
			const handle = await getDraftFile();
			const file = await handle.getFile();
			if (file.size > 0) markdown = await file.text();
			lastSavedMarkdown = markdown;
			saveState = 'saved';
			void navigator.storage.persist?.();
			if (file.size === 0) await saveDraft();
		} catch (error) {
			storageError = error instanceof Error ? error.message : 'This draft could not be opened.';
			saveState = 'error';
		}
	}

	function queueSave(): void {
		saveState = 'unsaved';
		if (saveTimer) window.clearTimeout(saveTimer);
		saveTimer = window.setTimeout(() => void saveDraft(), 700);
	}

	async function saveDraft(): Promise<void> {
		if (saveTimer) window.clearTimeout(saveTimer);
		saveTimer = undefined;
		saveState = 'saving';
		try {
			const handle = await getDraftFile();
			const writable = await handle.createWritable();
			await writable.write(markdown);
			await writable.close();
			lastSavedMarkdown = markdown;
			saveState = 'saved';
			storageError = '';
		} catch (error) {
			storageError = error instanceof Error ? error.message : 'Autosave failed.';
			saveState = 'error';
		}
	}

	function updateMarkdown(value: string): void { markdown = value; queueSave(); }

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
		requestAnimationFrame(() => { editor?.focus(); editor?.setSelectionRange(cursor + prefix.length, cursor + prefix.length); });
	}

	function handleShortcut(event: KeyboardEvent): void {
		const command = event.metaKey || event.ctrlKey;
		if (command && event.key.toLowerCase() === 's') { event.preventDefault(); void saveDraft(); }
		else if (command && event.key.toLowerCase() === 'b') { event.preventDefault(); insertSyntax('**', '**', 'bold text'); }
		else if (command && event.key.toLowerCase() === 'i') { event.preventDefault(); insertSyntax('_', '_', 'italic text'); }
		else if (command && event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); viewMode = viewMode === 'preview' ? 'edit' : 'preview'; }
		else if (event.key === '?' && !isTypingTarget(event.target)) shortcutsOpen = true;
		else if (event.key === 'Escape') shortcutsOpen = false;
	}

	function isTypingTarget(target: EventTarget | null): boolean { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement; }
	function restoreSaved(): void { markdown = lastSavedMarkdown; saveState = 'saved'; if (saveTimer) window.clearTimeout(saveTimer); }

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

	function escapeHtml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
</script>

<svelte:head><title>Onyx — Markdown editor</title><meta name="description" content="A focused, local-first Markdown editor with automatic saving." /></svelte:head>

<div class="app" class:sidebar-open={sidebarOpen}>
	<header class="topbar">
		<div class="brand"><button class="mobile-menu icon-button" aria-label="Open files" onclick={() => (sidebarOpen = true)}><PanelLeft size={19} /></button><div class="brand-mark">O</div><span>Onyx</span></div>
		<div class="document-path" aria-label="Current document"><span>Notes</span><ChevronRight size={14} /><strong>{FILE_NAME}</strong></div>
		<div class="top-actions">
			<div class="save-status" class:error={saveState === 'error'} aria-live="polite">
				{#if saveState === 'loading' || saveState === 'saving'}<LoaderCircle class="spin" size={15} />{:else if saveState === 'error'}<CloudOff size={15} />{:else}<span class:unsaved={saveState === 'unsaved'}></span>{/if}
				{saveState === 'loading' ? 'Opening…' : saveState === 'saving' ? 'Saving…' : saveState === 'unsaved' ? 'Unsaved' : saveState === 'error' ? 'Save failed' : 'Saved to this device'}
			</div>
			<button class="save-button" onclick={() => void saveDraft()} disabled={saveState === 'saving'}><Save size={16} /><span>Save</span><kbd>⌘S</kbd></button>
			<button class="icon-button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onclick={() => (shortcutsOpen = true)}><HelpCircle size={18} /></button>
		</div>
	</header>

	<aside class="sidebar" aria-label="Files">
		<div class="sidebar-heading"><span>Workspace</span><button class="icon-button mobile-close" aria-label="Close files" onclick={() => (sidebarOpen = false)}><X size={18} /></button></div>
		<h1>Notes</h1>
		<nav><button class="file active"><FileText size={17} /><span>{FILE_NAME.replace('.md', '')}</span><i></i></button></nav>
		<div class="local-note"><span class="local-icon"><Check size={14} /></span><div><strong>Private by default</strong><p>Stored in your browser’s private file system.</p></div></div>
	</aside>

	<main class="workspace">
		<div class="document-bar">
			<div class="document-info"><FileText size={17} /><span>{FILE_NAME}</span></div>
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
				<textarea bind:this={editor} value={markdown} oninput={(event) => updateMarkdown(event.currentTarget.value)} aria-label="Markdown editor" spellcheck="true"></textarea>
				<div class="editor-footer"><span>Markdown</span><span>{characterCount.toLocaleString()} characters</span></div>
			</div>
			<div class="preview-pane" aria-hidden={viewMode === 'edit'}><div class="preview-label"><Eye size={14} /> Preview</div><article class="prose">{@html renderedMarkdown}</article></div>
		</section>
	</main>
</div>

{#if saveState === 'unsaved'}<div class="unsaved-bar" aria-live="polite"><span><i></i>Changes haven’t been saved yet</span><button onclick={restoreSaved}><RotateCcw size={14} /> Revert</button><button class="bar-save" onclick={() => void saveDraft()}><Save size={14} /> Save now</button></div>{/if}

{#if shortcutsOpen}
	<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) shortcutsOpen = false; }}>
		<div class="shortcut-modal" role="dialog" aria-modal="true" aria-labelledby="shortcut-title">
			<div class="modal-title"><div><span>Reference</span><h2 id="shortcut-title">Keyboard shortcuts</h2></div><button class="icon-button" aria-label="Close shortcuts" onclick={() => (shortcutsOpen = false)}><X size={18} /></button></div>
			<div class="shortcut-list"><div><span>Save document</span><kbd>⌘ S</kbd></div><div><span>Bold selection</span><kbd>⌘ B</kbd></div><div><span>Italic selection</span><kbd>⌘ I</kbd></div><div><span>Toggle preview</span><kbd>⌘ ⇧ P</kbd></div><div><span>Close this panel</span><kbd>Esc</kbd></div></div>
			<p>Use Ctrl instead of ⌘ on Windows and Linux.</p>
		</div>
	</div>
{/if}
