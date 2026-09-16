<script lang="ts">
	import { ChevronDown, ChevronUp, Search, X } from '@lucide/svelte';
	import { formatShortcut, type PrimaryModifier } from '$lib/keyboard-shortcuts';

	interface Props {
		query: string;
		replacement: string;
		matchCase: boolean;
		wholeWord: boolean;
		matchCount: number;
		activeMatch: number;
		canEdit: boolean;
		primaryModifier: PrimaryModifier;
		findInput?: HTMLInputElement;
		replaceInput?: HTMLInputElement;
		onQueryChange: (value: string) => void;
		onReplacementChange: (value: string) => void;
		onMatchCaseChange: (value: boolean) => void;
		onWholeWordChange: (value: boolean) => void;
		onPrevious: () => void;
		onNext: () => void;
		onReplace: () => void;
		onReplaceAll: () => void;
		onClose: () => void;
	}

	let {
		query, replacement, matchCase, wholeWord, matchCount, activeMatch, canEdit, primaryModifier,
		findInput = $bindable(), replaceInput = $bindable(), onQueryChange, onReplacementChange,
		onMatchCaseChange, onWholeWordChange, onPrevious, onNext, onReplace, onReplaceAll, onClose
	}: Props = $props();

	function handleFindKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (event.shiftKey) onPrevious();
			else onNext();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
		}
	}

	function handleReplaceKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			onReplace();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
		}
	}

	const nextShortcut = $derived(formatShortcut({ key: 'g', primary: true }, primaryModifier));
	const previousShortcut = $derived(formatShortcut({ key: 'g', primary: true, shift: true }, primaryModifier));
</script>

<section class="sidebar-panel find-panel" role="search" aria-label="Find and replace">
	<div class="find-heading">
		<div class="find-title"><Search size={16} /><div><strong>Find in note</strong><span>Search the open note</span></div></div>
		<button class="icon-button find-close" type="button" aria-label="Close find and replace" title="Close find and replace (Esc)" onclick={onClose}><X size={17} /></button>
	</div>

	<div class="find-fields">
		<label class="find-field">
			<span class="visually-hidden">Find in note</span>
			<Search size={15} aria-hidden="true" />
			<input bind:this={findInput} type="search" value={query} placeholder="Find" aria-label="Find in note" autocomplete="off" spellcheck="false" oninput={(event) => onQueryChange(event.currentTarget.value)} onkeydown={handleFindKeydown} />
			{#if query}<button class="find-clear" type="button" aria-label="Clear find query" title="Clear find query" onclick={() => { onQueryChange(''); findInput?.focus(); }}><X size={13} /></button>{/if}
			<span class="find-count" aria-live="polite">{query ? matchCount ? `${activeMatch + 1} of ${matchCount}` : 'No matches' : 'Ready'}</span>
		</label>
		<div class="find-navigation" aria-label="Find navigation">
			<button type="button" aria-label="Previous match" title={`Previous match (${previousShortcut})`} disabled={!matchCount} onclick={onPrevious}><ChevronUp size={16} /></button>
			<button type="button" aria-label="Next match" title={`Next match (${nextShortcut})`} disabled={!matchCount} onclick={onNext}><ChevronDown size={16} /></button>
		</div>

		<label class="find-field replace-field">
			<span class="find-replace-glyph" aria-hidden="true">↔</span>
			<span class="visually-hidden">Replace with</span>
			<input bind:this={replaceInput} type="text" value={replacement} placeholder="Replace with" aria-label="Replace with" autocomplete="off" spellcheck="false" oninput={(event) => onReplacementChange(event.currentTarget.value)} onkeydown={handleReplaceKeydown} />
		</label>
	</div>

	<div class="find-options" aria-label="Find options">
		<button type="button" class:active={matchCase} aria-pressed={matchCase} onclick={() => onMatchCaseChange(!matchCase)}><span class="find-option-glyph">Aa</span><span>Match case</span></button>
		<button type="button" class:active={wholeWord} aria-pressed={wholeWord} onclick={() => onWholeWordChange(!wholeWord)}><span class="find-option-glyph">ab</span><span>Whole word</span></button>
	</div>

	<div class="find-replace-actions">
		<button type="button" disabled={!canEdit || !matchCount} onclick={onReplace}>Replace</button>
		<button type="button" disabled={!canEdit || !matchCount} onclick={onReplaceAll}>Replace all</button>
	</div>

	<div class="find-status" aria-live="polite">
		{#if !query}
			<span>Type a word or phrase to search this note.</span>
		{:else if !matchCount}
			<span>No matches in this note.</span>
		{:else}
			<span>Enter for next · Shift+Enter for previous</span>
		{/if}
	</div>
</section>
