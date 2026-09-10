<script lang="ts">
	import { Bold, CloudOff, Code2, HardDrive, Heading2, Italic, Link, List, LoaderCircle, Lock, LockOpen, PanelLeft, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PencilLine, Quote, WifiOff } from '@lucide/svelte';
	import { formatShortcut, type KeyboardShortcuts, type PrimaryModifier } from '$lib';
	import type { InlinePreviewBehavior } from './settings-dialog.svelte';
	import type { SaveState, TransferState } from './app-types';

	interface Props {
		storageNotice: string;
		storageError: string;
		isOnline: boolean;
		sourcePaneVisible: boolean;
		renderedPaneVisible: boolean;
		renderedReadOnly: boolean;
		inlinePreviewBehavior: InlinePreviewBehavior;
		markdown: string;
		markdownLines: string[];
		liveLine: number;
		saveState: SaveState;
		transferState: TransferState;
		wordCount: number;
		readingMinutes: number;
		hasContent: boolean;
		renderedMarkdown: string;
		shortcuts: KeyboardShortcuts;
		primaryModifier: PrimaryModifier;
		editor?: HTMLTextAreaElement;
		liveEditor?: HTMLTextAreaElement;
		liveEditorContainer?: HTMLDivElement;
		onRetryStorage: () => void;
		onToggleSidebar: () => void;
		onReload: () => void;
		onInsertSyntax: (before: string, after?: string, placeholder?: string) => void;
		onPrefixLine: (prefix: string) => void;
		onToggleSourcePane: () => void;
		onToggleRenderedPane: () => void;
		onToggleRenderedReadOnly: () => void;
		onMarkdownChange: (value: string) => void;
		onSourceFocus: () => void;
		onLiveLineFocus: (line: number) => void;
		onRenderedLineInput: (line: number, element: HTMLElement) => void;
		onRenderedLineKeydown: (event: KeyboardEvent, line: number) => void;
		onLiveLineChange: (line: number, value: string) => void;
		onLiveLineKeydown: (event: KeyboardEvent, line: number) => void;
		onActivateLiveLine: (line: number) => void;
		renderEditableLine: (line: string, index: number) => string;
		renderLiveLine: (line: string, index: number) => string;
		liveLineKind: (line: string, index: number) => string;
	}

	let {
		storageNotice, storageError, isOnline, sourcePaneVisible, renderedPaneVisible, renderedReadOnly, inlinePreviewBehavior, markdown, markdownLines, liveLine,
		saveState, transferState, wordCount, readingMinutes, hasContent, renderedMarkdown, shortcuts, primaryModifier,
		editor = $bindable(), liveEditor = $bindable(), liveEditorContainer = $bindable(), onRetryStorage, onToggleSidebar,
		onReload, onInsertSyntax, onPrefixLine, onToggleSourcePane, onToggleRenderedPane, onToggleRenderedReadOnly, onMarkdownChange, onSourceFocus, onLiveLineFocus, onRenderedLineInput,
		onRenderedLineKeydown, onLiveLineChange, onLiveLineKeydown, onActivateLiveLine,
		renderEditableLine, renderLiveLine, liveLineKind
	}: Props = $props();
</script>

<main class="workspace">
	{#if storageNotice}
		<div class="storage-notice" role="status"><HardDrive size={16} /><span>{storageNotice}</span></div>
	{/if}
	{#if storageError}
		<div class="storage-error" role="alert">
			<CloudOff size={16} />
			<span>{storageError} Your current text stays open, but it may be lost when this tab closes. Copy it somewhere safe if the retry keeps failing.</span>
			<button onclick={onRetryStorage}>Try again</button>
			<button onclick={onReload}>Reload</button>
		</div>
	{/if}

	<section class="editor-shell" class:source-hidden={!sourcePaneVisible} class:rendered-hidden={!renderedPaneVisible}>
		<div class="formatting-bar" aria-label="Formatting and view tools">
			<button class="collapsed-sidebar-toggle" aria-label="Show notes sidebar" title={`Show sidebar (${formatShortcut(shortcuts.toggleSidebar, primaryModifier)})`} onclick={onToggleSidebar}><PanelLeft size={19} /></button>
			<div class="pane-switcher" aria-label="Pane controls">
				<button class:active={sourcePaneVisible} aria-pressed={sourcePaneVisible} onclick={onToggleSourcePane} aria-label={sourcePaneVisible ? 'Hide Markdown pane' : 'Show Markdown pane'} title={sourcePaneVisible ? 'Hide Markdown pane' : 'Show Markdown pane'}>
					{#if sourcePaneVisible}<PanelLeftClose size={16} />{:else}<PanelLeftOpen size={16} />{/if}<span>Markdown</span>
				</button>
				<button class:active={renderedPaneVisible} aria-pressed={renderedPaneVisible} onclick={onToggleRenderedPane} aria-label={renderedPaneVisible ? 'Hide page pane' : 'Show page pane'} title={renderedPaneVisible ? 'Hide page pane' : 'Show page pane'}>
					{#if renderedPaneVisible}<PanelRightClose size={16} />{:else}<PanelRightOpen size={16} />{/if}<span>Page</span>
				</button>
				<button class="read-only-toggle" class:active={renderedReadOnly} aria-pressed={renderedReadOnly} disabled={!renderedPaneVisible} onclick={onToggleRenderedReadOnly} aria-label={renderedReadOnly ? 'Enable page editing' : 'Turn on read-only'} title={renderedReadOnly ? 'Enable page editing' : 'Turn on read-only'}>
					{#if renderedReadOnly}<Lock size={15} /><span>Read only</span>{:else}<LockOpen size={15} /><span>Editing</span>{/if}
				</button>
			</div>
			<span></span>
			<button onclick={() => onInsertSyntax('**', '**', 'bold text')} title={`Bold (${formatShortcut(shortcuts.bold, primaryModifier)})`} aria-label="Bold"><Bold size={16} /></button><button onclick={() => onInsertSyntax('_', '_', 'italic text')} title={`Italic (${formatShortcut(shortcuts.italic, primaryModifier)})`} aria-label="Italic"><Italic size={16} /></button><span></span><button onclick={() => onPrefixLine('## ')} title="Heading" aria-label="Heading"><Heading2 size={17} /></button><button onclick={() => onPrefixLine('- ')} title="Bulleted list" aria-label="Bulleted list"><List size={17} /></button><button onclick={() => onPrefixLine('> ')} title="Quote" aria-label="Quote"><Quote size={16} /></button><button onclick={() => onInsertSyntax('`', '`', 'code')} title="Inline code" aria-label="Inline code"><Code2 size={17} /></button><button onclick={() => onInsertSyntax('[', '](https://)', 'link text')} title="Link" aria-label="Link"><Link size={16} /></button>
			<div class="toolbar-status">
				{#if !isOnline}<div class="offline-status" role="status" title="GitHub features are paused until your connection returns"><WifiOff size={14} /><span>Offline</span></div>{/if}
				{#if saveState === 'loading' || saveState === 'error'}
					<div class="save-status" class:error={saveState === 'error'} aria-live="polite">
						{#if saveState === 'loading'}<LoaderCircle class="spin" size={15} />{:else}<CloudOff size={15} />{/if}
						{saveState === 'loading' ? 'Opening…' : 'Save failed'}
					</div>
				{/if}
			</div>
		</div>
		<div class="editor-pane">
			<textarea bind:this={editor} value={markdown} onfocus={onSourceFocus} oninput={(event) => onMarkdownChange(event.currentTarget.value)} aria-label="Markdown editor" placeholder={'# Start with a title\n\nThen write. Onyx saves to this device as you go.'} spellcheck="true" disabled={saveState === 'loading' || transferState === 'working'}></textarea>
			<div class="editor-footer"><span>{wordCount} words&nbsp;&nbsp;&nbsp;{readingMinutes} min read</span></div>
		</div>
		<div class="preview-pane">
			{#if renderedReadOnly}
				{#if hasContent}
					<article class="prose">{@html renderedMarkdown}</article>
				{:else}
					<div class="preview-empty"><PencilLine size={26} /><strong>Nothing here yet</strong><span>Start writing in the other pane, or unlock this one to begin.</span></div>
				{/if}
			{:else}
				<div class="live-editor" bind:this={liveEditorContainer} aria-label="Page editor">
					{#each markdownLines as line, index}
						{#if inlinePreviewBehavior === 'rendered'}
							<div class="live-editable-line {liveLineKind(line, index)}" class:active={index === liveLine} contenteditable={saveState !== 'loading' && transferState !== 'working'} role="textbox" tabindex="0" aria-label={`Markdown line ${index + 1}`} aria-multiline="false" data-live-line={index} spellcheck="true" onfocus={() => onLiveLineFocus(index)} oninput={(event) => onRenderedLineInput(index, event.currentTarget)} onkeydown={(event) => onRenderedLineKeydown(event, index)}>{@html renderEditableLine(line, index)}</div>
						{:else if index === liveLine}
							<textarea class="live-source-line" bind:this={liveEditor} value={line} oninput={(event) => onLiveLineChange(index, event.currentTarget.value)} onkeydown={(event) => onLiveLineKeydown(event, index)} aria-label={`Markdown line ${index + 1}`} rows="1" spellcheck="true" disabled={saveState === 'loading' || transferState === 'working'}></textarea>
						{:else}
							<div class="live-rendered-line" class:blank={!line} role="button" tabindex="0" aria-label={`Edit line ${index + 1}`} onclick={() => onActivateLiveLine(index)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivateLiveLine(index); } }}>{@html renderLiveLine(line, index)}</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	</section>
</main>
