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
	import { LoaderCircle, Search, X } from '@lucide/svelte';

	interface Props {
		items: PaletteItem[];
		controls?: PaletteControl[];
		query: string;
		embedded?: boolean;
		loading?: boolean;
		searchInput?: HTMLInputElement;
		onQueryChange: (value: string) => void;
		onClose: () => void;
	}

	let { items, controls = [], query, embedded = false, loading = false, searchInput = $bindable(), onQueryChange, onClose }: Props = $props();

	let activeIndex = $state(0);
	let list: HTMLElement | undefined = $state();

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
	// Flattened in render order so arrow navigation and the active index always agree.
	const matches = $derived(groups.flatMap((group) => group.items).filter(isPaletteItem));

	$effect(() => {
		const first = matches.findIndex((item) => !item.disabled);
		activeIndex = first === -1 ? 0 : first;
	});

	$effect(() => {
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

	function move(delta: number): void {
		if (matches.length === 0) return;
		let next = activeIndex;
		for (let step = 0; step < matches.length; step += 1) {
			next = (next + delta + matches.length) % matches.length;
			if (!matches[next]?.disabled) break;
		}
		activeIndex = next;
		scrollActiveIntoView();
	}

	function movePage(direction: number): void {
		const pageSize = Math.max(1, Math.floor((list?.clientHeight ?? 320) / 40));
		move(direction * pageSize);
	}

	function scrollActiveIntoView(): void {
		requestAnimationFrame(() => {
			list?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
		});
	}

	function choose(item: PaletteItem): void {
		if (item.disabled) return;
		onClose();
		item.run();
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			move(-1);
		} else if (event.key === 'Home') {
			event.preventDefault();
			activeIndex = -1;
			move(1);
		} else if (event.key === 'End') {
			event.preventDefault();
			activeIndex = matches.length;
			move(-1);
		} else if (event.key === 'PageDown') {
			event.preventDefault();
			movePage(1);
		} else if (event.key === 'PageUp') {
			event.preventDefault();
			movePage(-1);
		} else if (event.key.toLowerCase() === 'n' && event.ctrlKey && !event.metaKey) {
			event.preventDefault();
			move(1);
		} else if (event.key.toLowerCase() === 'p' && event.ctrlKey && !event.metaKey) {
			event.preventDefault();
			move(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const item = matches[activeIndex];
			if (item) choose(item);
		}
	}
</script>

	<section id="command-palette" class="palette-panel" class:palette-inline={embedded} role="search" aria-label={embedded ? 'Search notes and commands' : 'Command palette'} aria-busy={loading}>
	<div class="palette">
		{#if !embedded}
			<div class="palette-heading">
				<div class="palette-title"><Search size={16} /><div><strong id="command-palette-title">Command palette</strong><span id="command-palette-description">Search notes or run a command</span></div></div>
				<button class="icon-button palette-close" type="button" aria-label="Close command palette" title="Close command palette (Esc)" onclick={onClose}><X size={17} /></button>
			</div>
		{/if}

		<label class="search-box palette-search-box">
			<span class="visually-hidden">Search notes and commands</span>
			<Search size={15} aria-hidden="true" />
			<input
				bind:this={searchInput}
				value={query}
				type="search"
				role="combobox"
				aria-expanded="true"
				aria-controls="palette-list"
				aria-labelledby={embedded ? undefined : 'command-palette-title'}
				aria-describedby={embedded ? 'palette-result-count' : 'command-palette-description palette-result-count'}
				aria-activedescendant={matches[activeIndex] ? `palette-${matches[activeIndex].id}` : undefined}
				aria-label="Search notes and commands"
				placeholder="Search notes or commands…"
				autocomplete="off"
				spellcheck="false"
				oninput={(event) => onQueryChange(event.currentTarget.value)}
				onkeydown={onKeydown}
			/>
			<button type="button" class="palette-dismiss" aria-label="Close command palette" title="Close command palette (Esc)" onclick={onClose}><kbd>Esc</kbd></button>
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

		<div class="palette-list" id="palette-list" role="listbox" aria-label="Results" bind:this={list}>
			{#each groups as group (group.name)}
				<div class="palette-group">{group.name}</div>
				{#each group.items as item (item.id)}
					{#if !isPaletteItem(item)}
						<div class="palette-control" role="group" aria-label={item.label} id={`palette-${item.id}`}>
							<div class="palette-control-header">
								<item.icon size={16} />
								<span><strong>{item.label}</strong>{#if item.hint}<small>{item.hint}</small>{/if}</span>
								<output>{item.value}px</output>
							</div>
							<input class="palette-control-input" type="range" min={item.min} max={item.max} step={item.step} value={item.value} aria-label={item.label} oninput={(event) => item.onChange(Number(event.currentTarget.value))} />
						</div>
					{:else}
						{@const index = matches.indexOf(item)}
						<button
							class="palette-item"
							class:active={index === activeIndex}
							id={`palette-${item.id}`}
							type="button"
							role="option"
							aria-selected={index === activeIndex}
							disabled={item.disabled}
							onmousemove={() => (activeIndex = index)}
							onclick={() => choose(item)}
						>
							<item.icon size={16} />
							<span><strong>{#each highlightedLabel(item.label, query) as part}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}</strong>{#if item.hint}<small>{item.hint}</small>{/if}</span>
							{#if item.shortcut}<kbd>{item.shortcut}</kbd>{/if}
						</button>
					{/if}
				{/each}
			{/each}
			{#if groups.length === 0 && loading}
				<div class="palette-empty" role="status">
					<LoaderCircle class="spin" size={22} />
					<strong>Searching notes…</strong>
					<span>Checking every title and every word.</span>
				</div>
			{:else if groups.length === 0}
				<div class="palette-empty">
					<Search size={22} />
					<strong>No matches for “{query}”</strong>
					<span>Search note titles and Markdown content, or try a command such as “new note”, “dark”, or “export”.</span>
				</div>
			{/if}
		</div>
	</div>
</section>
