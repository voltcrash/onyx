<script lang="ts">
	import { ChevronLeft, ChevronRight, CloudOff, HardDrive, PanelLeft, PencilLine } from '@lucide/svelte';
	import { formatShortcut, type KeyboardShortcuts, type PrimaryModifier } from '$lib';
	import type { InlinePreviewBehavior } from './settings-dialog.svelte';
	import type { SaveState, TransferState } from './app-types';

	interface Props {
		storageNotice: string;
		storageError: string;
		sourcePaneVisible: boolean;
		renderedPaneVisible: boolean;
		renderedReadOnly: boolean;
		inlinePreviewBehavior: InlinePreviewBehavior;
		markdown: string;
		markdownLines: string[];
		liveLine: number;
		saveState: SaveState;
		transferState: TransferState;
		hasContent: boolean;
		renderedMarkdown: string;
		shortcuts: KeyboardShortcuts;
		primaryModifier: PrimaryModifier;
		editor?: HTMLTextAreaElement;
		liveEditor?: HTMLTextAreaElement;
		liveEditorContainer?: HTMLDivElement;
		onRetryStorage: () => void;
		onToggleSidebar: () => void;
		onToggleSourcePane: () => void;
		onToggleRenderedPane: () => void;
		onReload: () => void;
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
		storageNotice, storageError, sourcePaneVisible, renderedPaneVisible, renderedReadOnly, inlinePreviewBehavior, markdown, markdownLines, liveLine,
		saveState, transferState, hasContent, renderedMarkdown, shortcuts, primaryModifier,
		editor = $bindable(), liveEditor = $bindable(), liveEditorContainer = $bindable(), onRetryStorage, onToggleSidebar,
		onToggleSourcePane, onToggleRenderedPane, onReload, onMarkdownChange, onSourceFocus, onLiveLineFocus, onRenderedLineInput,
		onRenderedLineKeydown, onLiveLineChange, onLiveLineKeydown, onActivateLiveLine,
		renderEditableLine, renderLiveLine, liveLineKind
	}: Props = $props();
</script>

<main class="workspace">
	<button class="collapsed-sidebar-toggle" aria-label="Show notes sidebar" title={`Show sidebar (${formatShortcut(shortcuts.toggleSidebar, primaryModifier)})`} onclick={onToggleSidebar}><PanelLeft size={19} /></button>
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
		<div class="editor-pane">
			<textarea bind:this={editor} value={markdown} onfocus={onSourceFocus} oninput={(event) => onMarkdownChange(event.currentTarget.value)} aria-label="Markdown editor" placeholder={'# Start with a title\n\nThen write. Onyx saves to this device as you go.'} spellcheck="true" disabled={saveState === 'loading' || transferState === 'working'}></textarea>
		</div>
		<div class="pane-divider">
			{#if renderedPaneVisible}
				<button class="pane-handle pane-handle-top" title={sourcePaneVisible ? 'Hide the Markdown pane' : 'Show the Markdown pane'} aria-label={sourcePaneVisible ? 'Hide the Markdown pane' : 'Show the Markdown pane'} aria-expanded={sourcePaneVisible} onclick={onToggleSourcePane}>{#if sourcePaneVisible}<ChevronLeft size={15} />{:else}<ChevronRight size={15} />{/if}</button>
			{/if}
			{#if sourcePaneVisible}
				<button class="pane-handle pane-handle-bottom" title={renderedPaneVisible ? 'Hide the page pane' : 'Show the page pane'} aria-label={renderedPaneVisible ? 'Hide the page pane' : 'Show the page pane'} aria-expanded={renderedPaneVisible} onclick={onToggleRenderedPane}>{#if renderedPaneVisible}<ChevronRight size={15} />{:else}<ChevronLeft size={15} />{/if}</button>
			{/if}
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
