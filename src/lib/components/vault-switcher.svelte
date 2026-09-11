<script lang="ts">
	import { Check, ChevronDown, Plus } from '@lucide/svelte';
	import type { VaultDescriptor } from '$lib';

	interface Props {
		vaults: VaultDescriptor[];
		activeVaultId: string;
		disabled: boolean;
		onSelectVault: (id: string) => void;
		onCreateVault: () => void;
	}

	let { vaults, activeVaultId, disabled, onSelectVault, onCreateVault }: Props = $props();

	let menuOpen = $state(false);
	let activeName = $derived(vaults.find((vault) => vault.id === activeVaultId)?.name ?? 'Notes');

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
	<button class="vault-trigger" aria-haspopup="menu" aria-expanded={menuOpen} title="Switch repository" {disabled} onclick={() => (menuOpen = !menuOpen)}>
		<h1>{activeName}</h1><ChevronDown size={16} />
	</button>
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
