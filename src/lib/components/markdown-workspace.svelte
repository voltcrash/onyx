<script lang="ts">
	import { Bold, CloudOff, Code2, Columns2, Eye, HardDrive, Heading2, Italic, Link, List, LoaderCircle, PanelLeft, PencilLine, Quote, WifiOff } from '@lucide/svelte';
	import type { InlinePreviewBehavior } from './settings-dialog.svelte';
	import type { SaveState, TransferState, ViewMode } from './app-types';

	interface Props {
		storageNotice: string;
		storageError: string;
		isOnline: boolean;
		viewMode: ViewMode;
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
		editor?: HTMLTextAreaElement;
		liveEditor?: HTMLTextAreaElement;
		liveEditorContainer?: HTMLDivElement;
		onRetryStorage: () => void;
		onToggleSidebar: () => void;
		onReload: () => void;
		onInsertSyntax: (before: string, after?: string, placeholder?: string) => void;
		onPrefixLine: (prefix: string) => void;
		onViewModeChange: (mode: ViewMode) => void;
		onOpenInlinePreview: () => void;
		onMarkdownChange: (value: string) => void;
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
		storageNotice, storageError, isOnline, viewMode, inlinePreviewBehavior, markdown, markdownLines, liveLine,
		saveState, transferState, wordCount, readingMinutes, hasContent, renderedMarkdown,
		editor = $bindable(), liveEditor = $bindable(), liveEditorContainer = $bindable(), onRetryStorage, onToggleSidebar,
		onReload, onInsertSyntax, onPrefixLine, onViewModeChange, onOpenInlinePreview, onMarkdownChange, onLiveLineFocus, onRenderedLineInput,
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

	<section class="editor-shell" class:edit-only={viewMode === 'edit' || viewMode === 'live'} class:live-only={viewMode === 'live'} class:preview-only={viewMode === 'preview'}>
		<div class="formatting-bar" aria-label="Formatting and view tools">
			<button class="collapsed-sidebar-toggle" aria-label="Show notes sidebar" title="Show sidebar (⌘\\)" onclick={onToggleSidebar}><PanelLeft size={19} /></button>
			<div class="view-switcher" aria-label="View mode">
				<button class:active={viewMode === 'edit'} aria-pressed={viewMode === 'edit'} onclick={() => onViewModeChange('edit')} aria-label="Editor only" title="Editor only"><PencilLine size={16} /><span>Edit</span></button>
				<button class:active={viewMode === 'live'} aria-pressed={viewMode === 'live'} onclick={onOpenInlinePreview} aria-label="Inline preview" title="Inline preview"><Eye size={16} /><span>Inline</span></button>
				<button class:active={viewMode === 'split'} aria-pressed={viewMode === 'split'} onclick={() => onViewModeChange('split')} aria-label="Split view" title="Split view"><Columns2 size={16} /><span>Split</span></button>
				<button class:active={viewMode === 'preview'} aria-pressed={viewMode === 'preview'} onclick={() => onViewModeChange('preview')} aria-label="Preview only" title="Preview only"><Eye size={16} /><span>Preview</span></button>
			</div>
			<span></span>
			<button onclick={() => onInsertSyntax('**', '**', 'bold text')} title="Bold (⌘B)" aria-label="Bold"><Bold size={16} /></button><button onclick={() => onInsertSyntax('_', '_', 'italic text')} title="Italic (⌘I)" aria-label="Italic"><Italic size={16} /></button><span></span><button onclick={() => onPrefixLine('## ')} title="Heading" aria-label="Heading"><Heading2 size={17} /></button><button onclick={() => onPrefixLine('- ')} title="Bulleted list" aria-label="Bulleted list"><List size={17} /></button><button onclick={() => onPrefixLine('> ')} title="Quote" aria-label="Quote"><Quote size={16} /></button><button onclick={() => onInsertSyntax('`', '`', 'code')} title="Inline code" aria-label="Inline code"><Code2 size={17} /></button><button onclick={() => onInsertSyntax('[', '](https://)', 'link text')} title="Link" aria-label="Link"><Link size={16} /></button>
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
			{#if viewMode === 'live'}
				<div class="live-editor" bind:this={liveEditorContainer} aria-label="Inline preview editor">
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
			{:else}
				<textarea bind:this={editor} value={markdown} oninput={(event) => onMarkdownChange(event.currentTarget.value)} aria-label="Markdown editor" placeholder={'# Start with a title\n\nThen write. Onyx saves to this device as you go.'} spellcheck="true" disabled={saveState === 'loading' || transferState === 'working'}></textarea>
			{/if}
			<div class="editor-footer"><span>{wordCount} words&nbsp;&nbsp;&nbsp;{readingMinutes} min read</span></div>
		</div>
		<div class="preview-pane">
			<div class="preview-label"><Eye size={14} /> Preview</div>
			{#if hasContent}
				<article class="prose">{@html renderedMarkdown}</article>
			{:else}
				<div class="preview-empty"><PencilLine size={26} /><strong>Nothing to preview yet</strong><span>Whatever you type in the editor is rendered here as you write.</span></div>
			{/if}
		</div>
	</section>
</main>
