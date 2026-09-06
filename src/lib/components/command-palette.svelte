<script module lang="ts">
	import type { LucideIcon } from '@lucide/svelte';

	export interface PaletteItem {
		id: string;
		group: string;
		label: string;
		hint?: string;
		keywords?: string;
		shortcut?: string;
		icon: LucideIcon;
		disabled?: boolean;
		run: () => void;
	}
</script>

<script lang="ts">
	import { CornerDownLeft, Search } from '@lucide/svelte';
	import { manageModalFocus } from '$lib/modal-focus';

	interface Props {
		items: PaletteItem[];
		onClose: () => void;
	}

	let { items, onClose }: Props = $props();

	let query = $state('');
	let activeIndex = $state(0);
	let input: HTMLInputElement | undefined = $state();
	let list: HTMLElement | undefined = $state();

	const filtered = $derived(
		query.trim()
			? items
					.map((item) => ({ item, score: score(item, query.trim().toLowerCase()) }))
					.filter((entry) => entry.score > 0)
					.sort((a, b) => b.score - a.score)
					.map((entry) => entry.item)
			: items
	);
	const groups = $derived(
		filtered.reduce<Array<{ name: string; items: PaletteItem[] }>>((accumulator, item) => {
			const group = accumulator.find((candidate) => candidate.name === item.group);
			if (group) group.items.push(item);
			else accumulator.push({ name: item.group, items: [item] });
			return accumulator;
		}, [])
	);
	// Flattened in render order so arrow navigation and the active index always agree.
	const matches = $derived(groups.flatMap((group) => group.items));

	$effect(() => {
		const first = matches.findIndex((item) => !item.disabled);
		activeIndex = first === -1 ? 0 : first;
	});

	$effect(() => {
		input?.focus();
	});

	function score(item: PaletteItem, needle: string): number {
		const haystack = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase();
		const label = item.label.toLowerCase();
		if (label.startsWith(needle)) return 1000 - label.length;
		if (label.includes(needle)) return 500 - label.length;
		if (haystack.includes(needle)) return 250;
		let index = -1;
		for (const character of needle) {
			index = haystack.indexOf(character, index + 1);
			if (index === -1) return 0;
		}
		return 100;
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
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const item = matches[activeIndex];
			if (item) choose(item);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') onClose(); }} />

<div class="palette-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
	<div id="command-palette" class="palette" role="dialog" aria-modal="true" aria-label="Command palette" tabindex="-1" use:manageModalFocus>
		<div class="palette-field">
			<Search size={17} />
			<input
				bind:this={input}
				bind:value={query}
				type="text"
				role="combobox"
				aria-expanded="true"
				aria-controls="palette-list"
				aria-activedescendant={matches[activeIndex] ? `palette-${matches[activeIndex].id}` : undefined}
				aria-label="Search notes and commands"
				placeholder="Jump to a note or run a command…"
				autocomplete="off"
				spellcheck="false"
				onkeydown={onKeydown}
			/>
			<kbd>Esc</kbd>
		</div>

		<div class="palette-list" id="palette-list" role="listbox" aria-label="Results" bind:this={list}>
			{#each groups as group (group.name)}
				<div class="palette-group">{group.name}</div>
				{#each group.items as item (item.id)}
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
						<span><strong>{item.label}</strong>{#if item.hint}<small>{item.hint}</small>{/if}</span>
						{#if item.shortcut}<kbd>{item.shortcut}</kbd>{/if}
					</button>
				{/each}
			{:else}
				<div class="palette-empty">
					<Search size={22} />
					<strong>No matches for “{query}”</strong>
					<span>Search by note title, or try a command such as “new note”, “dark”, or “export”.</span>
				</div>
			{/each}
		</div>

		<div class="palette-footer">
			<span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
			<span><kbd><CornerDownLeft size={10} /></kbd> Open</span>
			<span><kbd>Esc</kbd> Dismiss</span>
		</div>
	</div>
</div>
