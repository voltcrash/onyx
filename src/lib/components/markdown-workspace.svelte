<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Copy, Download, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CloudOff, HardDrive, Lock, LockOpen, Moon, PanelLeft, PencilLine, Sun, X } from '@lucide/svelte';
	import { highlightFindMatches, type FindMatch } from '$lib/find-replace';
	import { formatShortcut, type KeyboardShortcuts, type PrimaryModifier } from '$lib/keyboard-shortcuts';
	import type { ColorTheme, ResolvedTheme } from '$lib/theme';
	import type { SourceLines } from '$lib/markdown-lite';
	import { elementAnchors, scrollAnchors, syncedScrollTop, textareaAnchors, type ScrollAnchor } from '$lib/scroll-sync';
	import type { PaneEdge, PaneLayout, PaneOrder, SaveState, TransferState } from './app-types';

	interface Props {
		storageNotice: string;
		storageError: string;
		outputPaneVisible: boolean;
		renderedPaneVisible: boolean;
		paneLayout: PaneLayout;
		paneOrder: PaneOrder;
		renderedBlockLines: (SourceLines | undefined)[];
		renderedReadOnly: boolean;
		scrollSync: boolean;
		markdown: string;
		markdownLines: string[];
		findOpen: boolean;
		findQuery: string;
		findMatches: FindMatch[];
		activeFindMatch: number;
		liveLine: number;
		saveState: SaveState;
		transferState: TransferState;
		hasContent: boolean;
		renderedMarkdown: string;
		shortcuts: KeyboardShortcuts;
		primaryModifier: PrimaryModifier;
		editor?: HTMLTextAreaElement;
		liveEditorContainer?: HTMLDivElement;
		onRetryStorage: () => void;
		onDismissStorageNotice: () => void;
		onToggleSidebar: () => void;
		onSidebarDragStart: (event: PointerEvent) => void;
		splitRatio: number;
		contentWidth: number;
		onToggleOutputPane: () => void;
		resolvedTheme: ResolvedTheme;
		colorTheme: ColorTheme;
		onCopy: () => void;
		onDownload: () => void;
		onToggleRenderedPane: () => void;
		onToggleRenderedReadOnly: () => void;
		onResize: (ratio: number) => void;
		onResizeEnd: () => void;
		onPlacePane: (pane: 'output' | 'rendered', edge: PaneEdge) => void;
		onReload: () => void;
		onMarkdownChange: (value: string) => void;
		onEditorBeforeInput: (event: InputEvent) => void;
		onEditorCopy: (event: ClipboardEvent) => void;
		onEditorCut: (event: ClipboardEvent) => void;
		onEditorPaste: (event: ClipboardEvent) => void;
		onEditorDragOver: (event: DragEvent) => void;
		onEditorDrop: (event: DragEvent) => void;
		onSourceFocus: () => void;
		onLiveLineFocus: (line: number) => void;
		onRenderedInput: (event: Event) => void;
		onRenderedLineKeydown: (event: KeyboardEvent) => void;
		onRenderedTaskClick: (event: MouseEvent) => void;
		renderEditableLine: (line: string, index: number) => string;
		liveLineKind: (line: string, index: number) => string;
		liveCodeLanguage: (index: number) => string;
	}

	let {
		storageNotice, storageError, outputPaneVisible, renderedPaneVisible, paneLayout, paneOrder, renderedBlockLines, renderedReadOnly, scrollSync, markdown, markdownLines, findOpen, findQuery, findMatches, activeFindMatch, liveLine,
		saveState, transferState, hasContent, renderedMarkdown, shortcuts, primaryModifier,
		editor = $bindable(), liveEditorContainer = $bindable(), onRetryStorage, onDismissStorageNotice, onToggleSidebar, onSidebarDragStart,
		splitRatio, contentWidth, onToggleOutputPane, resolvedTheme, colorTheme, onCopy, onDownload, onToggleRenderedPane, onToggleRenderedReadOnly, onResize, onResizeEnd, onPlacePane, onReload, onMarkdownChange, onEditorBeforeInput, onEditorCopy, onEditorCut, onEditorPaste, onEditorDragOver, onEditorDrop, onSourceFocus, onLiveLineFocus, onRenderedInput,
		onRenderedLineKeydown, onRenderedTaskClick, renderEditableLine, liveLineKind, liveCodeLanguage
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
	let outputTheme = $state<ResolvedTheme>();
	let activeOutputTheme = $derived(outputTheme ?? resolvedTheme);
	type LiveLineRect = { top: number; left: number; width: number; height: number };
	let liveLineRects = $state<LiveLineRect[]>([]);
	let sourceScrollTop = $state(0);
	let sourceScrollLeft = $state(0);
	let sourceFindActive = $derived(findOpen && Boolean(findQuery));
	let sourceFindMarkup = $derived(
		sourceFindActive ? highlightFindMatches(markdown, findMatches, activeFindMatch) : '',
	);

	function syncSourceFindLayer(event?: Event): void {
		const target = event?.currentTarget instanceof HTMLTextAreaElement ? event.currentTarget : editor;
		if (!target) return;
		sourceScrollTop = target.scrollTop;
		sourceScrollLeft = target.scrollLeft;
	}

	function toggleOutputTheme(): void {
		outputTheme = activeOutputTheme === 'dark' ? 'light' : 'dark';
	}

	function isFenceLine(line: string): boolean {
		return /^\s*(?:`{3,}|~{3,})/.test(line);
	}

	function isTableSeparatorLine(line: string): boolean {
		const trimmed = line.trim();
		if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
		return trimmed
			.slice(1, -1)
			.split(/(?<!\\)\|/)
			.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
	}

	function measureLiveLines(): void {
		const container = liveEditorContainer;
		if (!container || renderedReadOnly) {
			liveLineRects = [];
			return;
		}
		const renderedContent = container.querySelector<HTMLElement>('.live-rendered-content');
		if (!renderedContent) return;
		const containerRect = container.getBoundingClientRect();
		const rects: Array<LiveLineRect | undefined> = Array.from({ length: markdownLines.length });
		const renderedBlocks = [...renderedContent.children] as HTMLElement[];

		renderedBlocks.forEach((block, blockIndex) => {
			const lines = renderedBlockLines[blockIndex];
			if (!lines) return;
			const start = Math.max(0, lines.start);
			const end = Math.min(markdownLines.length, lines.end);
			if (start >= end) return;
			const blockRect = block.getBoundingClientRect();
			const top = blockRect.top - containerRect.top;
			const left = blockRect.left - containerRect.left;
			const width = blockRect.width;
			const blockHeight = blockRect.height;
			const blockLines = markdownLines.slice(start, end);
			const listItems = block.matches('ul, ol') ? [...block.querySelectorAll<HTMLElement>('li')] : [];
			if (listItems.length === end - start) {
				listItems.forEach((item, offset) => {
					const itemRect = item.getBoundingClientRect();
					rects[start + offset] = {
						top: itemRect.top - containerRect.top,
						left,
						width,
						height: itemRect.height,
					};
				});
				return;
			}
			const tableRows = block.tagName === 'TABLE' ? [...block.querySelectorAll<HTMLElement>('tr')] : [];
			if (tableRows.length) {
				const tableColumnWidths = [...tableRows[0].children]
					.filter((cell) => cell.matches('th, td'))
					.map((cell) => cell.getBoundingClientRect().width);
				let rowIndex = 0;
				blockLines.forEach((line, offset) => {
					const index = start + offset;
					const row = tableRows[rowIndex];
					if (isTableSeparatorLine(line)) {
						const rowRect = row?.getBoundingClientRect();
						rects[index] = {
							top: rowRect ? rowRect.top - containerRect.top : blockRect.bottom - containerRect.top,
							left: rowRect ? rowRect.left - containerRect.left : left,
							width: rowRect?.width ?? width,
							height: 0,
						};
						return;
					}
					if (!row) return;
					const rowRect = row.getBoundingClientRect();
					if (tableColumnWidths.length) {
						const overlayRow = container.querySelector<HTMLElement>(
							`[data-live-line="${index}"] .live-table-row`,
						);
						overlayRow?.style.setProperty(
							'grid-template-columns',
							tableColumnWidths.map((columnWidth) => `${columnWidth}px`).join(' '),
						);
					}
					rects[index] = {
						top: rowRect.top - containerRect.top,
						left: rowRect.left - containerRect.left,
						width: rowRect.width,
						height: rowRect.height,
					};
					rowIndex += 1;
				});
				return;
			}
			const contentLines = block.tagName === 'PRE' ? blockLines.filter((line) => !isFenceLine(line)) : [];

			if (contentLines.length) {
				const contentHeight = blockHeight / contentLines.length;
				let contentIndex = 0;
				blockLines.forEach((line, offset) => {
					const index = start + offset;
					if (isFenceLine(line)) {
						rects[index] = { top: offset === 0 ? top : top + blockHeight, left, width, height: 0 };
						return;
					}
					rects[index] = { top: top + contentIndex * contentHeight, left, width, height: contentHeight };
					contentIndex += 1;
				});
				return;
			}

			const lineHeight = blockHeight / (end - start);
			for (let index = start; index < end; index += 1) {
				rects[index] = { top: top + (index - start) * lineHeight, left, width, height: lineHeight };
			}
		});

		const contentRect = renderedContent.getBoundingClientRect();
		// An empty note renders no blocks, so give its lines a clickable height to type into.
		const fallback: LiveLineRect = renderedBlocks.length
			? { top: 0, left: 0, width: contentRect.width, height: 0 }
			: {
					top: contentRect.top - containerRect.top,
					left: contentRect.left - containerRect.left,
					width: contentRect.width,
					height: parseFloat(getComputedStyle(renderedContent).lineHeight) || renderedContent.offsetHeight || 30,
				};
		liveLineRects = rects.map(
			(rect, index) => rect ?? (renderedBlocks.length ? fallback : { ...fallback, top: fallback.top + index * fallback.height }),
		);
	}

	function liveLineStyle(index: number): string | undefined {
		const rect = liveLineRects[index];
		return rect
			? `top: ${rect.top}px; left: ${rect.left}px; width: ${rect.width}px; height: ${rect.height}px`
			: undefined;
	}

	function syncLiveSelectionDecorations(): void {
		if (!liveEditorContainer || renderedReadOnly) return;
		const selection = document.getSelection();
		const range = selection && !selection.isCollapsed && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined;
		const overlay = liveEditorContainer.querySelector<HTMLElement>('.live-editing-overlay');
		const selectionInOverlay = Boolean(
			range &&
			overlay &&
			overlay.contains(selection?.anchorNode ?? null) &&
			overlay.contains(selection?.focusNode ?? null),
		);
		liveEditorContainer.querySelectorAll<HTMLElement>('[data-live-line]').forEach((line) => {
			let selected = false;
			if (selectionInOverlay && range) {
				try {
					selected = range.intersectsNode(line);
				} catch {
					selected = false;
				}
			}
			line.classList.toggle('selection-active', selected);
		});
	}

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

	type Pane = 'output' | 'rendered';
	const DRAG_THRESHOLD = 5;
	const MOVE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
	const edgeKeys: Record<string, PaneEdge> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' };

	let outputPaneElement = $state<HTMLElement>();
	let renderedPaneElement = $state<HTMLElement>();
	let drag = $state<{ pane: Pane; pointerId: number; startX: number; startY: number; dx: number; dy: number; originX: number; originY: number; scale: number; edge: PaneEdge; moving: boolean }>();

	function paneEdge(pane: Pane): PaneEdge {
		const leads = (pane === 'rendered') === swapped;
		if (stacked) return leads ? 'top' : 'bottom';
		return leads ? 'left' : 'right';
	}

	// The moved pane keeps its share of the space, so the preview matches where it settles.
	let dropSlot = $derived.by(() => {
		if (!drag?.moving) return undefined;
		const size = paneEdge(drag.pane) === 'left' || paneEdge(drag.pane) === 'top' ? splitRatio : 100 - splitRatio;
		const horizontal = drag.edge === 'left' || drag.edge === 'right';
		return `--slot-left: ${drag.edge === 'right' ? 100 - size : 0}%; --slot-top: ${drag.edge === 'bottom' ? 100 - size : 0}%; --slot-width: ${horizontal ? size : 100}%; --slot-height: ${horizontal ? 100 : size}%`;
	});

	function nearestEdge(event: PointerEvent): PaneEdge {
		const bounds = shell!.getBoundingClientRect();
		const x = (event.clientX - bounds.left) / bounds.width;
		const y = (event.clientY - bounds.top) / bounds.height;
		const distances: [PaneEdge, number][] = [['left', x], ['right', 1 - x], ['top', y], ['bottom', 1 - y]];
		return distances.reduce((nearest, candidate) => (candidate[1] < nearest[1] ? candidate : nearest))[0];
	}

	function startPaneDrag(event: PointerEvent, pane: Pane): void {
		if (!bothPanesVisible || event.button !== 0 || drag) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		const bounds = (pane === 'output' ? outputPaneElement : renderedPaneElement)!.getBoundingClientRect();
		// The pane shrinks around the grab point, so it stays under the pointer and uncovers the drop slots.
		const scale = Math.min(0.7, 380 / bounds.width, 320 / bounds.height);
		drag = { pane, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, originX: event.clientX - bounds.left, originY: event.clientY - bounds.top, scale, edge: paneEdge(pane), moving: false };
	}

	function trackPaneDrag(event: PointerEvent): void {
		if (!drag || event.pointerId !== drag.pointerId) return;
		drag.dx = event.clientX - drag.startX;
		drag.dy = event.clientY - drag.startY;
		if (!drag.moving && Math.hypot(drag.dx, drag.dy) < DRAG_THRESHOLD) return;
		drag.moving = true;
		drag.edge = nearestEdge(event);
	}

	function endPaneDrag(event: PointerEvent): void {
		if (!drag || event.pointerId !== drag.pointerId) return;
		const { pane, edge, moving } = drag;
		if (event.type === 'pointerup' && moving) void movePane(pane, edge);
		else if (moving) void movePane(pane, paneEdge(pane));
		else drag = undefined;
	}

	function cancelPaneDrag(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !drag?.moving) return;
		event.preventDefault();
		void movePane(drag.pane, paneEdge(drag.pane));
	}

	function nudgePane(event: KeyboardEvent, pane: Pane): void {
		const edge = edgeKeys[event.key];
		if (!edge || !bothPanesVisible) return;
		event.preventDefault();
		void movePane(pane, edge);
	}

	// Each pane glides from where it was drawn to its new track instead of jumping there.
	async function movePane(pane: Pane, edge: PaneEdge): Promise<void> {
		const panes = [outputPaneElement, renderedPaneElement].filter((element): element is HTMLElement => Boolean(element));
		const before = panes.map((element) => element.getBoundingClientRect());
		const moved = pane === 'output' ? outputPaneElement : renderedPaneElement;
		if (edge !== paneEdge(pane)) onPlacePane(pane, edge);
		drag = undefined;
		await tick();
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		panes.forEach((element, index) => {
			const from = before[index];
			const to = element.getBoundingClientRect();
			if (Math.abs(from.left - to.left) < 1 && Math.abs(from.top - to.top) < 1 && Math.abs(from.width - to.width) < 1 && Math.abs(from.height - to.height) < 1) return;
			// Clipping instead of scaling keeps the text laid out at its final size while the pane moves.
			const clipRight = Math.max(0, to.width - from.width);
			const clipBottom = Math.max(0, to.height - from.height);
			element.animate(
				[
					{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`, clipPath: `inset(0 ${clipRight}px ${clipBottom}px 0 round 10px)`, zIndex: element === moved ? 8 : 7 },
					{ transform: 'none', clipPath: 'inset(0 0 0 0 round 0)', zIndex: element === moved ? 8 : 7 }
				],
				{ duration: 300, easing: MOVE_EASING }
			);
		});
		shell?.querySelector('.pane-divider')?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: 300 });
	}

	// Scrolling either pane scrolls the other to the same part of the note.
	let outputBody = $state<HTMLElement>();
	let scrollDriver: Pane = 'rendered';
	let syncFrame = 0;
	const syncedTops = new WeakMap<Element, number>();

	function scrollerOf(pane: Pane): HTMLElement | undefined {
		if (pane === 'rendered') return renderedPaneElement;
		return (outputBody?.firstElementChild as HTMLElement | null) ?? undefined;
	}

	function proseAnchors(scroller: HTMLElement): ScrollAnchor[] {
		const article = scroller.querySelector('article.prose');
		return article ? elementAnchors(scroller, [...article.children].map((element, index) => [element, renderedBlockLines[index]])) : [];
	}

	function paneAnchors(pane: Pane, scroller: HTMLElement): ScrollAnchor[] {
		let points: ScrollAnchor[];
		if (pane === 'rendered') {
			points = !renderedReadOnly && liveEditorContainer
				? elementAnchors(
						scroller,
						[...liveEditorContainer.querySelectorAll<HTMLElement>('[data-live-line]')].map((element, index) => [element, { start: index, end: index + 1 }]),
					)
				: proseAnchors(scroller);
		} else if (scroller instanceof HTMLTextAreaElement) {
			points = textareaAnchors(scroller);
		} else {
			points = proseAnchors(scroller);
		}
		return scrollAnchors(points, markdownLines.length, scroller.scrollHeight);
	}

	// The following pane eases toward where it should be rather than jumping there every frame.
	const GLIDE_EASING = 0.3;
	let glide: { target: HTMLElement; top: number } | undefined;
	let glideFrame = 0;

	function stopGlide(): void {
		cancelAnimationFrame(glideFrame);
		glideFrame = 0;
		glide = undefined;
	}

	function setSyncedTop(target: HTMLElement, top: number): void {
		target.scrollTo({ top, behavior: 'instant' });
		// Browsers round the offset, so the echo is recognised by the value they settled on.
		syncedTops.set(target, target.scrollTop);
	}

	function stepGlide(): void {
		glideFrame = 0;
		if (!glide) return;
		const { target, top } = glide;
		const distance = top - target.scrollTop;
		if (Math.abs(distance) < 1) {
			setSyncedTop(target, top);
			glide = undefined;
			return;
		}
		const before = target.scrollTop;
		const step = distance * GLIDE_EASING;
		setSyncedTop(target, before + Math.sign(step) * Math.max(Math.abs(step), 1));
		// A pane pinned at its end cannot move any further.
		if (target.scrollTop === before) {
			glide = undefined;
			return;
		}
		glideFrame = requestAnimationFrame(stepGlide);
	}

	function syncScroll(from: Pane, smooth: boolean): void {
		const to: Pane = from === 'output' ? 'rendered' : 'output';
		const source = scrollerOf(from);
		const target = scrollerOf(to);
		if (!scrollSync || !bothPanesVisible || !source || !target) return;
		const top = syncedScrollTop(
			{ anchors: paneAnchors(from, source), scrollTop: source.scrollTop, scrollHeight: source.scrollHeight, clientHeight: source.clientHeight },
			{ anchors: paneAnchors(to, target), scrollHeight: target.scrollHeight, clientHeight: target.clientHeight }
		);
		if (smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
			glide = { target, top };
			glideFrame ||= requestAnimationFrame(stepGlide);
			return;
		}
		stopGlide();
		if (Math.abs(target.scrollTop - top) < 1) return;
		setSyncedTop(target, top);
	}

	let smoothSync = false;

	function queueScrollSync(from: Pane, smooth = false): void {
		if (from !== scrollDriver) stopGlide();
		scrollDriver = from;
		smoothSync = smooth;
		syncFrame ||= requestAnimationFrame(() => {
			syncFrame = 0;
			syncScroll(scrollDriver, smoothSync);
		});
	}

	// The pane being typed in keeps its place, and the other one catches up with it.
	function leadingPane(): Pane {
		if (outputPaneElement?.contains(document.activeElement)) return 'output';
		if (renderedPaneElement?.contains(document.activeElement)) return 'rendered';
		return scrollDriver;
	}

	function handlePaneScroll(event: Event, pane: Pane): void {
		const scroller = scrollerOf(pane);
		if (event.target !== scroller) return;
		const synced = syncedTops.get(scroller);
		syncedTops.delete(scroller);
		if (synced !== undefined && Math.abs(scroller.scrollTop - synced) <= 1) return;
		if (glide?.target === scroller) stopGlide();
		queueScrollSync(pane, true);
	}

	$effect(() => {
		if (!scrollSync) stopGlide();
		else tick().then(() => queueScrollSync(leadingPane()));
	});

	$effect(() => {
		void renderedReadOnly;
		tick().then(() => queueScrollSync('output'));
	});

	$effect(() => {
		void [markdown, renderedMarkdown, bothPanesVisible, stacked, contentWidth];
		tick().then(() => queueScrollSync(leadingPane()));
	});

	$effect(() => {
		void [markdown, renderedMarkdown, renderedReadOnly, contentWidth, markdownLines.length];
		if (renderedReadOnly || !liveEditorContainer) {
			liveLineRects = [];
			return;
		}
		measureLiveLines();
		const frame = requestAnimationFrame(measureLiveLines);
		return () => cancelAnimationFrame(frame);
	});

	$effect(() => {
		if (!liveEditorContainer || renderedReadOnly) return;
		const observer = new ResizeObserver(measureLiveLines);
		observer.observe(liveEditorContainer);
		return () => observer.disconnect();
	});

	$effect(() => {
		void [sourceFindActive, sourceFindMarkup, editor];
		void tick().then(() => syncSourceFindLayer());
	});

	$effect(() => {
		if (!liveEditorContainer || renderedReadOnly) return;
		const syncSelection = () => syncLiveSelectionDecorations();
		document.addEventListener('selectionchange', syncSelection);
		syncSelection();
		return () => document.removeEventListener('selectionchange', syncSelection);
	});

	$effect(() => {
		if (!shell) return;
		const observer = new ResizeObserver(() => queueScrollSync(leadingPane()));
		observer.observe(shell);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(syncFrame);
			syncFrame = 0;
			stopGlide();
		};
	});

	onMount(() => {
		const fontSet = document.fonts;
		if (!fontSet) return;
		const refreshAfterFontLoad = () => {
			measureLiveLines();
			queueScrollSync(leadingPane());
		};
		fontSet.addEventListener('loadingdone', refreshAfterFontLoad);
		return () => fontSet.removeEventListener('loadingdone', refreshAfterFontLoad);
	});
</script>

<svelte:window onkeydown={cancelPaneDrag} />

<main class="workspace">
	<button class="collapsed-sidebar-toggle" onpointerdown={onSidebarDragStart} aria-label="Show notes sidebar" title={`Show sidebar (${formatShortcut(shortcuts.toggleSidebar, primaryModifier)})`} onclick={onToggleSidebar}><PanelLeft size={19} /></button>
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

	<section bind:this={shell} class="editor-shell" class:output-hidden={!outputPaneVisible} class:rendered-hidden={!renderedPaneVisible} class:panes-stacked={stacked} class:panes-swapped={swapped} class:first-hidden={!firstPaneVisible} class:second-hidden={!secondPaneVisible} class:resizing class:pane-moving={drag?.moving} style={`--split: ${splitRatio}%; --content-width: ${contentWidth}px`}>
		<div bind:this={outputPaneElement} class="output-pane" class:dragged={drag?.moving && drag.pane === 'output'} data-output-theme={activeOutputTheme} data-color-theme={colorTheme} style={drag?.moving && drag.pane === 'output' ? `translate: ${drag.dx}px ${drag.dy}px; transform-origin: ${drag.originX}px ${drag.originY}px; --lift-scale: ${drag.scale}` : undefined}>
			<div class="output-switcher">
				<div class="output-views" role="tablist" aria-label="Output view">
					<button role="tab" class="active" aria-selected="true" title="Write and edit the Markdown source"><b class="output-format" aria-hidden="true">MD</b><span>Markdown</span></button>
				</div>
				<div class="output-actions">
					<button class="output-action" onclick={toggleOutputTheme} aria-label={activeOutputTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={activeOutputTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
						{#if activeOutputTheme === 'dark'}
							<Sun size={14} />
						{:else}
							<Moon size={14} />
						{/if}
						<span>{activeOutputTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
					</button>
					<button class="output-action" onclick={onCopy} disabled={!hasContent} title="Copy this note as Markdown"><Copy size={14} /><span>Copy</span></button>
					<button class="output-action" onclick={onDownload} disabled={!hasContent} title="Download this note as a Markdown file"><Download size={14} /><span>Download</span></button>
				</div>
			</div>
			<div class="output-body" bind:this={outputBody} onscrollcapture={(event) => handlePaneScroll(event, 'output')} onloadcapture={() => queueScrollSync(leadingPane())}>
					<textarea bind:this={editor} class:find-highlights-active={sourceFindActive} value={markdown} onfocus={onSourceFocus} onbeforeinput={onEditorBeforeInput} oncopy={onEditorCopy} oncut={onEditorCut} onpaste={onEditorPaste} ondragover={onEditorDragOver} ondrop={onEditorDrop} oninput={(event) => onMarkdownChange(event.currentTarget.value)} onscroll={syncSourceFindLayer} aria-label="Markdown editor" placeholder={'# Start with a title\n\nThen write. Onyx saves to this device as you go.'} spellcheck="true" disabled={saveState === 'loading' || transferState === 'working'}></textarea>
					{#if sourceFindActive}
						<div class="source-find-layer" aria-hidden="true"><div style={`transform: translate(${-sourceScrollLeft}px, ${-sourceScrollTop}px)`}>{@html sourceFindMarkup}</div></div>
					{/if}
			</div>
		</div>
		<div class="pane-divider">
			<button type="button" class="pane-resize" class:enabled={bothPanesVisible} aria-label={`Resize the panes, the ${firstPane} pane takes ${Math.round(splitRatio)} percent`} title="Drag to resize, double-click to even out" tabindex={bothPanesVisible ? 0 : -1} onpointerdown={startResize} onpointermove={trackResize} onpointerup={endResize} onpointercancel={endResize} onkeydown={nudgeResize} ondblclick={resetSplit}></button>
			{#if bothPanesVisible}
				<button type="button" class="pane-grip" class:grip-start={!swapped} aria-label="Move the output pane" title="Drag to move this pane, or use the arrow keys" onpointerdown={(event) => startPaneDrag(event, 'output')} onpointermove={trackPaneDrag} onpointerup={endPaneDrag} onpointercancel={endPaneDrag} onkeydown={(event) => nudgePane(event, 'output')}></button>
				<button type="button" class="pane-grip" class:grip-start={swapped} aria-label="Move the page pane" title="Drag to move this pane, or use the arrow keys" onpointerdown={(event) => startPaneDrag(event, 'rendered')} onpointermove={trackPaneDrag} onpointerup={endPaneDrag} onpointercancel={endPaneDrag} onkeydown={(event) => nudgePane(event, 'rendered')}></button>
			{/if}
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
		<div bind:this={renderedPaneElement} class="preview-pane" class:dragged={drag?.moving && drag.pane === 'rendered'} style={drag?.moving && drag.pane === 'rendered' ? `translate: ${drag.dx}px ${drag.dy}px; transform-origin: ${drag.originX}px ${drag.originY}px; --lift-scale: ${drag.scale}` : undefined} onscrollcapture={(event) => handlePaneScroll(event, 'rendered')} onloadcapture={() => queueScrollSync(leadingPane())}>
			<div class="rendered-switcher">
				<button class="rendered-mode-toggle" class:active={renderedReadOnly} type="button" aria-pressed={renderedReadOnly} onclick={() => onToggleRenderedReadOnly()} aria-label={renderedReadOnly ? 'Enable page editing' : 'Turn on read-only'} title={renderedReadOnly ? 'Enable page editing' : 'Turn on read-only'}>
					{#if renderedReadOnly}<Lock size={14} />{:else}<LockOpen size={14} />{/if}
					<span>{renderedReadOnly ? 'Read only' : 'Editing'}</span>
				</button>
			</div>
			{#if renderedReadOnly}
				{#if hasContent}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
					<article class="prose" onclick={onRenderedTaskClick}>{@html renderedMarkdown}</article>
				{:else}
					<div class="preview-empty"><PencilLine size={26} /><strong>Nothing here yet</strong><span>Start writing in the other pane, or unlock this one to begin.</span></div>
				{/if}
			{:else}
				<div class="live-editor prose" bind:this={liveEditorContainer} aria-label="Page editor">
					<div class="live-rendered-content" aria-hidden="true">{@html renderedMarkdown}</div>
					<div class="live-editing-overlay" contenteditable={saveState !== 'loading' && transferState !== 'working'} role="textbox" tabindex="-1" aria-label="Page editor" aria-multiline="true" spellcheck="true" onbeforeinput={onEditorBeforeInput} oncopy={onEditorCopy} oncut={onEditorCut} onpaste={onEditorPaste} ondragover={onEditorDragOver} ondrop={onEditorDrop} oninput={(event) => onRenderedInput(event as unknown as InputEvent)} onkeydown={onRenderedLineKeydown} onmousedown={onRenderedTaskClick}>
						{#each markdownLines as line, index}
							<div class="live-editable-line {liveLineKind(line, index)}" class:active={index === liveLine} style={liveLineStyle(index)} role="textbox" tabindex="0" aria-label={`Markdown line ${index + 1}`} aria-multiline="false" data-live-line={index} data-code-language={liveCodeLanguage(index) || undefined} onfocus={() => onLiveLineFocus(index)}>{@html renderEditableLine(line, index)}</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
		{#if dropSlot}
			<div class="pane-drop-slot" style={dropSlot} aria-hidden="true"></div>
		{/if}
	</section>
</main>
