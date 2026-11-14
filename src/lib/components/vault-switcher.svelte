<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { ChevronDown } from '@lucide/svelte';
	import type { VaultDescriptor } from '#lib/storage/registry.ts';

	interface Props {
		vaults: VaultDescriptor[];
		activeVaultId: string;
		disabled: boolean;
		onSelectVault: (id: string) => void;
		onCreateVault: () => void;
		onRenameVault: (id: string, name: string) => Promise<void>;
	}

	let { vaults, activeVaultId, disabled, onSelectVault, onCreateVault, onRenameVault }: Props = $props();

	let menuOpen = $state(false);
  let trigger: HTMLButtonElement | undefined = $state();
	let renaming = $state(false);
	let draftName = $state('');
	let renameInput = $state<HTMLInputElement>();
	let renameId: string | undefined;
	let renameBusy = $state(false);
	let renameError = $state('');
	let shownVaultId = untrack(() => activeVaultId);
	$effect(() => {
		const current = activeVaultId;
		if (current === shownVaultId && !disabled) return;
		shownVaultId = current;
		untrack(() => { menuOpen = false; renaming = false; renameError = ''; });
	});
	let activeName = $derived(vaults.find((vault) => vault.id === activeVaultId)?.name ?? 'Notes');

	async function startRename(): Promise<void> {
		if (disabled) return;
		menuOpen = false;
		renaming = true;
		renameId = activeVaultId;
		renameError = '';
		draftName = activeName;
		await tick();
		renameInput?.focus();
		renameInput?.select();
	}

	async function commitRename(): Promise<void> {
		const id = renameId;
		if (!renaming || renameBusy || !id) return;
		if (!draftName.trim() || draftName.trim() === activeName) { renaming = false; return; }
		renameBusy = true;
		try {
			await onRenameVault(id, draftName);
			if (id === renameId) renaming = false;
		} catch (error) {
			if (id === renameId && renaming) renameError = error instanceof Error ? error.message : 'The name could not be saved.';
		} finally {
			renameBusy = false;
			await tick();
			if (renaming && id === renameId) renameInput?.focus();
		}
	}

	function handleRenameKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitRename();
		} else if (event.key === 'Escape' && !renameBusy) {
			event.preventDefault();
			renaming = false;
		}
	}

	function select(id: string): void {
		menuOpen = false;
		if (id !== activeVaultId) onSelectVault(id);
	}

	function create(): void {
		menuOpen = false;
		onCreateVault();
	}
</script>

<div class="vault-switcher relative min-w-0">
	{#if renaming}
		<input class="vault-rename w-full py-0.5 px-1.5 border border-focus-border rounded-lg bg-surface text-ink [font-family:'Newsreader_Variable',_Georgia,_'Times_New_Roman',_serif] text-ui-24 font-medium [letter-spacing:-0.035em] outline-none" bind:this={renameInput} bind:value={draftName} aria-label="Repository name" maxlength="60" spellcheck="false" disabled={renameBusy} aria-invalid={Boolean(renameError)} title={renameError || undefined} onblur={commitRename} onkeydown={handleRenameKeydown} />
	{:else}
		<button bind:this={trigger} onkeydown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); menuOpen = true; } }} class="vault-trigger relative z-22 flex items-center gap-0.75 max-w-full py-0.5 px-1.5 border-0 rounded-lg bg-transparent text-muted cursor-pointer [transition:background_0.15s_ease] [&:hover:not(:disabled)]:bg-subtle-strong [&:disabled]:cursor-not-allowed [&_h1]:overflow-hidden [&_h1]:text-ellipsis [&_h1]:whitespace-nowrap" aria-haspopup="menu" aria-expanded={menuOpen} title="Switch repository, double-click to rename" {disabled} onclick={() => (menuOpen = !menuOpen)} ondblclick={() => void startRename()}>
			<h1>{activeName}</h1><ChevronDown size={16} />
		</button>
	{/if}
  {#if menuOpen && trigger}
    {#await Promise.all([import('./vault-menu.svelte'), import('#lib/lazy-styles.ts').then((styles) => styles.loadMenuStyles())]) then [{ default: VaultMenu }]}
      <VaultMenu {vaults} {activeVaultId} anchor={trigger} onSelect={select} onCreate={create} onClose={() => (menuOpen = false)} />
    {/await}
  {/if}
</div>
