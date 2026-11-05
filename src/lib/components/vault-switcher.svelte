<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { Check, ChevronDown, Plus } from '@lucide/svelte';
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

<div class="vault-switcher">
	{#if renaming}
		<input class="vault-rename" bind:this={renameInput} bind:value={draftName} aria-label="Repository name" maxlength="60" spellcheck="false" disabled={renameBusy} aria-invalid={Boolean(renameError)} title={renameError || undefined} onblur={commitRename} onkeydown={handleRenameKeydown} />
	{:else}
		<button class="vault-trigger" aria-haspopup="menu" aria-expanded={menuOpen} title="Switch repository, double-click to rename" {disabled} onclick={() => (menuOpen = !menuOpen)} ondblclick={() => void startRename()}>
			<h1>{activeName}</h1><ChevronDown size={16} />
		</button>
	{/if}
	{#if menuOpen}
		<button class="vault-backdrop" tabindex="-1" aria-hidden="true" onclick={() => (menuOpen = false)}></button>
		<div class="vault-menu" role="menu" aria-label="Repositories">
			{#each vaults as vault (vault.id)}
				<button role="menuitemradio" aria-checked={vault.id === activeVaultId} class:active={vault.id === activeVaultId} onclick={() => select(vault.id)}>
					<span>{vault.name}</span>{#if vault.id === activeVaultId}<Check size={15} />{/if}
				</button>
			{/each}
			<div class="vault-menu-divider"></div>
			<button role="menuitem" class="vault-create" onclick={create}><Plus size={15} /><span>New repository</span></button>
		</div>
	{/if}
</div>
