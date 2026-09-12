<script lang="ts">
	import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CloudOff, HardDrive, PanelLeft, PencilLine, X } from '@lucide/svelte';
	import { formatShortcut, type KeyboardShortcuts, type PrimaryModifier } from '$lib';
	import type { InlinePreviewBehavior } from './settings-dialog.svelte';
	import type { PaneLayout, PaneOrder, SaveState, TransferState } from './app-types';
	import { outputViews, type OutputView } from './output-views';

	interface Props {
		storageNotice: string;
		storageError: string;
		outputPaneVisible: boolean;
		renderedPaneVisible: boolean;
		paneLayout: PaneLayout;
		paneOrder: PaneOrder;
		outputView: OutputView;
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
		onDismissStorageNotice: () => void;
		onToggleSidebar: () => void;
		splitRatio: number;
		contentWidth: number;
		onToggleOutputPane: () => void;
		onOutputViewChange: (view: OutputView) => void;
		onToggleRenderedPane: () => void;
		onResize: (ratio: number) => void;
		onResizeEnd: () => void;
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
		storageNotice, storageError, outputPaneVisible, renderedPaneVisible, paneLayout, paneOrder, outputView, renderedReadOnly, inlinePreviewBehavior, markdown, markdownLines, liveLine,
		saveState, transferState, hasContent, renderedMarkdown, shortcuts, primaryModifier,
		editor = $bindable(), liveEditor = $bindable(), liveEditorContainer = $bindable(), onRetryStorage, onDismissStorageNotice, onToggleSidebar,
		splitRatio, contentWidth, onToggleOutputPane, onOutputViewChange, onToggleRenderedPane, onResize, onResizeEnd, onReload, onMarkdownChange, onSourceFocus, onLiveLineFocus, onRenderedLineInput,
		onRenderedLineKeydown, onLiveLineChange, onLiveLineKeydown, onActivateLiveLine,
		renderEditableLine, renderLiveLine, liveLineKind
	}: Props = $props();

	let shell = $state<HTMLElement>();
	let resizing = $state(false);
	let bothPanesVisible = $derived(outputPaneVisible && renderedPaneVisible);
	let stacked = $derived(paneLayout === 'rows');
	let swapped = $derived(paneOrder === 'rendered-first');
	// The divider handles follow the visual arrangement rather than a fixed pane.
	let firstPane = $derived(swapped ? 'page' : 'output');
	let secondPane = $derived(swapped ? 'output' : 'page');
	let firstPaneVisible = $derived(swapped ? renderedPaneVisible : outputPaneVisible);
	let secondPaneVisible = $derived(swapped ? outputPaneVisible : renderedPaneVisible);
	let toggleFirstPane = $derived(swapped ? onToggleRenderedPane : onToggleOutputPane);
	let toggleSecondPane = $derived(swapped ? onToggleOutputPane : onToggleRenderedPane);
	let towardsStart = $derived(stacked ? ChevronUp : ChevronLeft);
	let towardsEnd = $derived(stacked ? ChevronDown : ChevronRight);

	function resizeTo(event: PointerEvent): void {
		const bounds = shell?.getBoundingClientRect();
		if (!bounds) return;
		const span = stacked ? bounds.height : bounds.width;
		if (!span) return;
		const offset = stacked ? event.clientY - bounds.top : event.clientX - bounds.left;
		onResize((offset / span) * 100);
	}

	function startResize(event: PointerEvent): void {
		if (!bothPanesVisible) return;
		event.preventDefault();
		resizing = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function trackResize(event: PointerEvent): void {
		if (resizing) resizeTo(event);
	}

	function endResize(event: PointerEvent): void {
		if (!resizing) return;
		resizing = false;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		onResizeEnd();
	}

	function nudgeResize(event: KeyboardEvent): void {
		if (!bothPanesVisible) return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') onResize(splitRatio - 2);
		else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') onResize(splitRatio + 2);
		else if (event.key === 'Home' || event.key === 'End') onResize(event.key === 'Home' ? 20 : 80);
		else return;
		event.preventDefault();
		onResizeEnd();
	}

	function resetSplit(): void {
		if (!bothPanesVisible) return;
		onResize(50);
		onResizeEnd();
	}
</script>

<main class="workspace">
	<button class="collapsed-sidebar-toggle" aria-label="Show notes sidebar" title={`Show sidebar (${formatShortcut(shortcuts.toggleSidebar, primaryModifier)})`} onclick={onToggleSidebar}><PanelLeft size={19} /></button>
	{#if storageNotice}
		<div class="storage-notice" role="status"><HardDrive size={16} /><span>{storageNotice}</span><button class="storage-dismiss" aria-label="Dismiss storage warning" title="Dismiss" onclick={onDismissStorageNotice}><X size={14} /></button></div>
	{/if}
	{#if storageError}
		<div class="storage-error" role="alert">
			<CloudOff size={16} />
			<span>{storageError} Your current text stays open, but it may be lost when this tab closes. Copy it somewhere safe if the retry keeps failing.</span>
			<button onclick={onRetryStorage}>Try again</button>
			<button onclick={onReload}>Reload</button>
		</div>
	{/if}

	<section bind:this={shell} class="editor-shell" class:output-hidden={!outputPaneVisible} class:rendered-hidden={!renderedPaneVisible} class:panes-stacked={stacked} class:panes-swapped={swapped} class:first-hidden={!firstPaneVisible} class:second-hidden={!secondPaneVisible} class:resizing style={`--split: ${splitRatio}%; --content-width: ${contentWidth}px`}>
		<div class="output-pane">
			<div class="output-toolbar">
				<div class="output-views" role="tablist" aria-label="Output view">
					{#each outputViews as view (view.id)}
						<button role="tab" class:active={outputView === view.id} aria-selected={outputView === view.id} title={view.description} onclick={() => onOutputViewChange(view.id)}><view.icon size={14} /><span>{view.label}</span></button>
					{/each}
				</div>
			</div>
			<div class="output-body">
				<textarea bind:this={editor} value={markdown} onfocus={onSourceFocus} oninput={(event) => onMarkdownChange(event.currentTarget.value)} aria-label="Markdown editor" placeholder={'# Start with a title\n\nThen write. Onyx saves to this device as you go.'} spellcheck="true" disabled={saveState === 'loading' || transferState === 'working'}></textarea>
			</div>
		</div>
		<div class="pane-divider">
			<button type="button" class="pane-resize" class:enabled={bothPanesVisible} aria-label={`Resize the panes, the ${firstPane} pane takes ${Math.round(splitRatio)} percent`} title="Drag to resize, double-click to even out" tabindex={bothPanesVisible ? 0 : -1} onpointerdown={startResize} onpointermove={trackResize} onpointerup={endResize} onpointercancel={endResize} onkeydown={nudgeResize} ondblclick={resetSplit}></button>
			{#if secondPaneVisible}
				{@const label = `${firstPaneVisible ? 'Hide' : 'Show'} the ${firstPane} pane`}
				{@const Icon = firstPaneVisible ? towardsStart : towardsEnd}
				<button class="pane-handle pane-handle-start" title={label} aria-label={label} aria-expanded={firstPaneVisible} onclick={toggleFirstPane}><Icon size={15} /></button>
			{/if}
			{#if firstPaneVisible}
				{@const label = `${secondPaneVisible ? 'Hide' : 'Show'} the ${secondPane} pane`}
				{@const Icon = secondPaneVisible ? towardsEnd : towardsStart}
				<button class="pane-handle pane-handle-end" title={label} aria-label={label} aria-expanded={secondPaneVisible} onclick={toggleSecondPane}><Icon size={15} /></button>
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
