<script lang="ts">
  import { Check, Plus } from '@lucide/svelte';
  import * as Menu from '#lib/components/ui/dropdown-menu/index.js';
  import type { VaultDescriptor } from '#lib/storage/registry.ts';
  let { vaults, activeVaultId, anchor, onSelect, onCreate, onClose }: {
    vaults: VaultDescriptor[]; activeVaultId: string; anchor: HTMLElement;
    onSelect: (id: string) => void; onCreate: () => void; onClose: () => void;
  } = $props();
</script>
<Menu.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
  <Menu.Content class="vault-menu min-w-50 max-w-65" customAnchor={anchor} align="start" sideOffset={5}
    onInteractOutside={(event) => { if (event.target instanceof Node && anchor.contains(event.target)) event.preventDefault(); }}
    aria-label="Repositories" onCloseAutoFocus={(event) => { event.preventDefault(); if (document.activeElement === document.body) anchor.focus(); }}>
    <Menu.RadioGroup value={activeVaultId}>
    {#each vaults as vault (vault.id)}
      <Menu.RadioItem value={vault.id} class="justify-between" onSelect={() => onSelect(vault.id)}>
        <span class="min-w-0 flex-1 truncate">{vault.name}</span>{#if vault.id === activeVaultId}<Check size={15} />{/if}
      </Menu.RadioItem>
    {/each}
    </Menu.RadioGroup>
    <Menu.Separator />
    <Menu.Item class="vault-create text-muted" onSelect={onCreate}><Plus size={15} /><span>New repository</span></Menu.Item>
  </Menu.Content>
</Menu.Root>
