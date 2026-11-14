<script lang="ts">
	import { ChevronDown, ChevronUp, Replace, Search, X } from '@lucide/svelte';
	import { formatShortcut, type PrimaryModifier } from '#lib/keyboard-shortcuts.ts';

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

<section class="sidebar-panel find-panel flex-1 min-h-0 overflow-y-auto [margin-inline:-5px] pt-0.25 px-0 pb-4.5 [scrollbar-width:thin]" role="search" aria-label="Find and replace">
	<div class="find-fields grid [grid-template-columns:minmax(0,_1fr)_auto] gap-1.75">
		<label class="find-field min-w-0 h-9 flex items-center gap-1.75 py-0 px-2 border border-line rounded-md bg-surface text-faint [&:focus-within]:border-focus-border [&:focus-within]:[box-shadow:0_0_0_2px_var(--focus-ring)] [&_>_svg]:flex-none [&_input]:min-w-0 [&_input]:flex-1 [&_input]:border-0 [&_input]:outline-none [&_input]:bg-transparent [&_input]:text-ink [&_input]:text-ui-12 [&_input::placeholder]:text-faint [&_input::-webkit-search-cancel-button]:hidden">
			<span class="visually-hidden">Find in note</span>
			<Search size={15} aria-hidden="true" />
			<input bind:this={findInput} type="search" value={query} placeholder="Find" aria-label="Find in note" autocomplete="off" spellcheck="false" oninput={(event) => onQueryChange(event.currentTarget.value)} onkeydown={handleFindKeydown} />
			{#if query}<button class="find-clear w-4.5 h-5 grid flex-none place-items-center p-0 border-0 rounded-sm bg-transparent text-faint cursor-pointer [&:hover]:text-ink" type="button" aria-label="Clear find query" title="Clear find query" onclick={() => { onQueryChange(''); findInput?.focus(); }}><X size={13} /></button>{/if}
			<span class="find-count flex-none text-faint text-ui-10 [font-variant-numeric:tabular-nums] whitespace-nowrap" aria-live="polite">{query ? matchCount ? `${activeMatch + 1} of ${matchCount}` : 'No matches' : 'Ready'}</span>
		</label>
		<div class="find-navigation flex items-center gap-0.5 [&_button]:w-7.25 [&_button]:h-9 [&_button]:grid [&_button]:place-items-center [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:text-muted [&_button]:cursor-pointer [&_button:hover:not(:disabled)]:border-line-hover [&_button:hover:not(:disabled)]:text-ink [&_button:disabled]:text-faint [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-55" aria-label="Find navigation">
			<button type="button" aria-label="Previous match" title={`Previous match (${previousShortcut})`} disabled={!matchCount} onclick={onPrevious}><ChevronUp size={16} /></button>
			<button type="button" aria-label="Next match" title={`Next match (${nextShortcut})`} disabled={!matchCount} onclick={onNext}><ChevronDown size={16} /></button>
		</div>

		<label class="find-field replace-field min-w-0 h-9 flex items-center gap-1.75 py-0 px-2 border border-line rounded-md bg-surface text-faint [&:focus-within]:border-focus-border [&:focus-within]:[box-shadow:0_0_0_2px_var(--focus-ring)] [&_>_svg]:flex-none [&_input]:min-w-0 [&_input]:flex-1 [&_input]:border-0 [&_input]:outline-none [&_input]:bg-transparent [&_input]:text-ink [&_input]:text-ui-12 [&_input::placeholder]:text-faint [&_input::-webkit-search-cancel-button]:hidden [.find-fields_&]:[grid-column:1_/_-1]">
			<Replace size={15} aria-hidden="true" />
			<span class="visually-hidden">Replace with</span>
			<input bind:this={replaceInput} type="text" value={replacement} placeholder="Replace with" aria-label="Replace with" autocomplete="off" spellcheck="false" oninput={(event) => onReplacementChange(event.currentTarget.value)} onkeydown={handleReplaceKeydown} />
		</label>
	</div>

	<div class="find-options flex items-center gap-1.5 mt-2.75 [&_button]:min-w-0 [&_button]:flex-1 [&_button]:h-7.5 [&_button]:flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.25 [&_button]:py-0 [&_button]:px-1.25 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-transparent [&_button]:text-muted [&_button]:cursor-pointer [&_button]:text-ui-10 [&_button]:whitespace-nowrap [&_button:hover]:border-accent-border [&_button:hover]:bg-accent-bg [&_button:hover]:text-accent-quiet [&_button.active]:border-accent-border [&_button.active]:bg-accent-bg [&_button.active]:text-accent-quiet" aria-label="Find options">
		<button type="button" class:active={matchCase} aria-pressed={matchCase} onclick={() => onMatchCaseChange(!matchCase)}><span class="find-option-glyph [display:inline-grid] place-items-center flex-none text-muted text-ui-12 [font-weight:650] [.find-options_button.active_&]:text-accent">Aa</span><span>Match case</span></button>
		<button type="button" class:active={wholeWord} aria-pressed={wholeWord} onclick={() => onWholeWordChange(!wholeWord)}><span class="find-option-glyph [display:inline-grid] place-items-center flex-none text-muted text-ui-12 [font-weight:650] [.find-options_button.active_&]:text-accent">ab</span><span>Whole word</span></button>
	</div>

	<div class="find-replace-actions flex items-center gap-1.5 mt-2.25 [&_button]:min-w-0 [&_button]:flex-1 [&_button]:h-8 [&_button]:py-0 [&_button]:px-1.75 [&_button]:border [&_button]:border-line-strong [&_button]:rounded-md [&_button]:bg-surface [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-11 [&_button:first-child]:border-accent-border [&_button:first-child]:bg-accent-bg [&_button:first-child]:text-accent-quiet [&_button:hover:not(:disabled)]:border-line-hover [&_button:hover:not(:disabled)]:text-ink [&_button:first-child:hover:not(:disabled)]:border-accent [&_button:first-child:hover:not(:disabled)]:text-accent [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-45">
		<button type="button" disabled={!canEdit || !matchCount} onclick={onReplace}>Replace</button>
		<button type="button" disabled={!canEdit || !matchCount} onclick={onReplaceAll}>Replace all</button>
	</div>

	<div class="find-status mt-4.5 pt-3 px-1 pb-0 [border-top:1px_solid_var(--line-soft)] text-faint text-ui-10 [line-height:1.45]" aria-live="polite">
		{#if !query}
			<span>Type a word or phrase to search this note.</span>
		{:else if !matchCount}
			<span>No matches in this note.</span>
		{:else}
			<span>Enter for next · Shift+Enter for previous</span>
		{/if}
	</div>
</section>
