<script module lang="ts">
	import type { LucideIcon } from '@lucide/svelte';

	export interface PaletteItem {
		id: string;
		group: string;
		label: string;
		hint?: string;
		keywords?: string;
		aliases?: string[];
		shortcut?: string;
		icon: LucideIcon;
		disabled?: boolean;
		run: () => void;
	}

	export interface PaletteControl {
		id: string;
		group: string;
		label: string;
		keywords?: string;
		hint?: string;
		icon: LucideIcon;
		control: 'range';
		value: number;
		min: number;
		max: number;
		step: number;
		onChange: (value: number) => void;
	}

	type PaletteEntry = PaletteItem | PaletteControl;
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { nextEnabledIndex } from '#lib/palette-navigation.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import { LoaderCircle, Search } from '@lucide/svelte';

	interface Props {
		items: PaletteItem[];
		controls?: PaletteControl[];
		query: string;
		loading?: boolean;
		error?: string;
		searchInput?: HTMLInputElement;
		onQueryChange: (value: string) => void;
		onClose: () => void;
	}

	let { items, controls = [], query, loading = false, error = '', searchInput = $bindable(), onQueryChange, onClose }: Props = $props();



	let selected = $state('');
	let listRef = $state<HTMLElement | null>(null);
	let inputRef = $state<HTMLElement | null>(null);

	const entries = $derived<PaletteEntry[]>([...items, ...controls]);
	const filtered = $derived(
		query.trim()
			? entries
					.map((item) => ({ item, score: score(item, query.trim()) }))
					.filter((entry) => entry.score > 0)
					.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
					.map((entry) => entry.item)
			: entries
	);
	const groups = $derived(
		filtered.reduce<Array<{ name: string; items: PaletteEntry[] }>>((accumulator, item) => {
			const group = accumulator.find((candidate) => candidate.name === item.group);
			if (group) group.items.push(item);
			else accumulator.push({ name: item.group, items: [item] });
			return accumulator;
		}, [])
	);
	// The result count excludes inline controls.
	const matches = $derived(groups.flatMap((group) => group.items).filter(isPaletteItem));

	$effect(() => {
		searchInput = inputRef instanceof HTMLInputElement ? inputRef : undefined;
		searchInput?.focus();
	});

	function isPaletteItem(item: PaletteEntry): item is PaletteItem {
		return !('control' in item);
	}

	function score(item: PaletteEntry, rawQuery: string): number {
		const needle = rawQuery.trim().toLowerCase();
		const label = item.label.toLowerCase();
		const aliases = 'aliases' in item ? item.aliases ?? [] : [];
		const haystack = `${label} ${item.hint ?? ''} ${item.keywords ?? ''} ${aliases.join(' ')}`.toLowerCase();
		const terms = needle.split(/\s+/).filter(Boolean);
		if (!terms.every((term) => haystack.includes(term) || fuzzyMatch(haystack, term))) return 0;
		if (label === needle) return 1400;
		if (label.startsWith(needle)) return 1200 - label.length;
		if (label.includes(needle)) return 1000 - label.length;
		const labelTermMatches = terms.filter((term) => label.includes(term)).length;
		if (labelTermMatches > 0) return 800 + labelTermMatches * 30 - label.length;
		if (terms.every((term) => haystack.includes(term))) return 500 - haystack.indexOf(terms[0]);
		return 200;
	}

	function fuzzyMatch(value: string, needle: string): boolean {
		let index = -1;
		for (const character of needle) {
			index = value.indexOf(character, index + 1);
			if (index === -1) return false;
		}
		return true;
	}

	function highlightedLabel(label: string, rawQuery: string): Array<{ text: string; match: boolean }> {
		const terms = rawQuery.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
		if (terms.length === 0) return [{ text: label, match: false }];
		const parts = label.split(new RegExp(`(${terms.join('|')})`, 'ig'));
		return parts.filter(Boolean).map((text) => ({ text, match: terms.some((term) => new RegExp(`^${term}$`, 'i').test(text)) }));
	}

	function escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

  async function movePage(event: KeyboardEvent): Promise<void> {
    if (event.key !== 'PageDown' && event.key !== 'PageUp') return;
    event.preventDefault();
    const pageSize = Math.max(1, Math.floor((listRef?.clientHeight ?? 320) / 40));
    const index = matches.findIndex((item) => item.id === selected);
    const next = nextEnabledIndex(matches, index, event.key === 'PageDown' ? pageSize : -pageSize);
    selected = matches[next]?.id ?? '';
    await tick();
    document.getElementById(`palette-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }

	function choose(item: PaletteItem): void {
		if (item.disabled) return;
		onClose();
		item.run();
	}

</script>

	<section id="command-palette" class="palette-panel flex-1 min-w-0 min-h-0 flex overflow-hidden [margin-inline:-5px] pt-0.25 px-0 pb-0" role="search" aria-label="Command palette" aria-busy={loading}>
	<Command.Root bind:value={selected} class="palette w-full flex-1 min-h-0 flex flex-col overflow-hidden" shouldFilter={false} loop>
		<label class="search-box palette-search-box h-8.5 flex items-center gap-1.75 my-0 mx-1 py-0 px-2 border border-line rounded-md bg-surface text-faint [&:focus-within]:border-focus-border [&:focus-within]:[box-shadow:0_0_0_2px_var(--focus-ring)] [&_input]:min-w-0 [&_input]:flex-1 [&_input]:border-0 [&_input]:outline-none [&_input]:bg-transparent [&_input]:text-ink [&_input]:text-ui-12 [&_>_button]:grid [&_>_button]:place-items-center [&_>_button]:p-0 [&_>_button]:border-0 [&_>_button]:bg-transparent [&_>_button]:cursor-pointer [&_>_button:hover_kbd]:text-ink [&_input::placeholder]:text-faint [&_input::-webkit-search-cancel-button]:hidden [&_kbd]:text-faint [&_kbd]:text-ui-10 [&_kbd]:whitespace-nowrap mt-0 mx-0 mb-0.5 [&_kbd]:py-0.75 [&_kbd]:px-1.5 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm">
			<span class="visually-hidden">Search notes and commands</span>
			<Search size={15} aria-hidden="true" />
			<Command.Input
				bind:ref={inputRef}
				value={query}
				type="search"
				role="combobox"
				aria-expanded="true"
				aria-controls="palette-list"
				aria-describedby="palette-result-count"
				aria-label="Search notes and commands"
				placeholder="Search notes or commands…"
				autocomplete="off"
				spellcheck="false"
				oninput={(event) => onQueryChange(event.currentTarget.value)}
        onkeydown={(event) => void movePage(event)}
			/>
			<button type="button" class="palette-dismiss flex-none p-0 border-0 rounded-sm bg-transparent [color:inherit] cursor-pointer [&:hover_kbd]:border-line-hover [&:hover_kbd]:text-ink" aria-label="Close command palette" title="Close command palette (Esc)" onclick={onClose}><kbd>Esc</kbd></button>
		</label>
		<div id="palette-result-count" class="visually-hidden" role="status" aria-live="polite">
			{#if loading && query.trim()}
				Searching notes…
			{:else if query.trim()}
				{matches.length} result{matches.length === 1 ? '' : 's'}
			{:else}
				All commands and notes
			{/if}
		</div>

		<Command.List bind:ref={listRef} class="palette-list flex-1 min-h-0 overflow-y-auto pt-1.25 px-0 pb-0 [scrollbar-width:thin]" id="palette-list" aria-label="Results">
			{#if error}<div class="palette-empty flex flex-col items-center gap-1.5 py-11 px-5 text-faint text-center [&_strong]:text-muted [&_strong]:text-ui-13 [&_span]:text-ui-11 [&_span]:[line-height:1.5]" role="alert">Search failed: {error}</div>{/if}
			{#each groups as group (group.name)}
				<div class="palette-group pt-2.5 px-1.75 pb-1.25 text-faint text-ui-10 [font-weight:650] [letter-spacing:0.1em] uppercase">{group.name}</div>
				{#each group.items as item (item.id)}
					{#if !isPaletteItem(item)}
						<div class="palette-control grid gap-2.25 my-1 mx-0 pt-2.25 px-1.75 pb-2.5 border-0 rounded-md bg-subtle text-muted [&_strong]:block [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-ink-soft [&_strong]:text-ui-12 [&_strong]:[font-weight:550] [&_small]:block [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_small]:mt-0.5 [&_small]:text-faint [&_small]:text-ui-11 [&_output]:text-faint [&_output]:text-ui-11 [&_output]:[font-variant-numeric:tabular-nums]" role="group" aria-label={item.label} id={`palette-${item.id}`}>
							<div class="palette-control-header flex items-center gap-2 [&_>_svg]:flex-none [&_>_svg]:text-accent [&_>_span]:min-w-0 [&_>_span]:flex-1">
								<item.icon size={16} />
								<span><strong>{item.label}</strong>{#if item.hint}<small>{item.hint}</small>{/if}</span>
								<output>{item.value}px</output>
							</div>
							<input class="palette-control-input w-full [accent-color:var(--accent)]" type="range" min={item.min} max={item.max} step={item.step} value={item.value} aria-label={item.label} oninput={(event) => item.onChange(Number(event.currentTarget.value))} />
						</div>
					{:else}
						<Command.Item
							class="palette-item w-full flex items-center gap-2 py-2.25 px-2.5 border-0 rounded-md bg-transparent text-ink-soft cursor-pointer text-ui-13 text-left [&[data-disabled]]:cursor-not-allowed [&[data-disabled]]:opacity-45 [&_>_svg]:flex-none [&_>_svg]:text-muted [&[data-selected]]:bg-selected [&[data-selected]]:text-ink [&[data-selected]_>_svg]:text-accent [&_>_span]:min-w-0 [&_>_span]:flex-1 [&_strong]:block [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-ui-13 [&_strong]:[font-weight:550] [&_small]:block [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_small]:mt-0.5 [&_small]:text-faint [&_small]:text-ui-11 [&_mark]:[color:inherit] [&_mark]:[background:color-mix(in_srgb,_var(--accent)_24%,_transparent)] [&_mark]:rounded-sm [&_mark]:py-0 [&_mark]:px-0.25 [&_kbd]:flex-none [&_kbd]:py-0.75 [&_kbd]:px-1.5 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-10 [&_kbd]:whitespace-nowrap" value={item.id}
							id={`palette-${item.id}`}
							role="option"
							disabled={item.disabled}
							onSelect={() => choose(item)}
						>
							<item.icon size={16} />
							<span><strong>{#each highlightedLabel(item.label, query) as part}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}</strong>{#if item.hint}<small>{item.hint}</small>{/if}</span>
							{#if item.shortcut}<kbd>{item.shortcut}</kbd>{/if}
						</Command.Item>
					{/if}
				{/each}
			{/each}
			{#if groups.length === 0 && loading}
				<div class="palette-empty flex flex-col items-center gap-1.5 py-11 px-5 text-faint text-center [&_strong]:text-muted [&_strong]:text-ui-13 [&_span]:text-ui-11 [&_span]:[line-height:1.5]" role="status">
					<LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={22} />
					<strong>Searching notes…</strong>
					<span>Checking every title and every word.</span>
				</div>
			{:else if groups.length === 0}
				<div class="palette-empty flex flex-col items-center gap-1.5 py-11 px-5 text-faint text-center [&_strong]:text-muted [&_strong]:text-ui-13 [&_span]:text-ui-11 [&_span]:[line-height:1.5]">
					<Search size={22} />
					<strong>No matches for “{query}”</strong>
					<span>Search note titles and Markdown content, or try a command such as “new note”, “dark”, or “export”.</span>
				</div>
			{/if}
		</Command.List>
	</Command.Root>
</section>
