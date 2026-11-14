<script module lang="ts">
  import type { LucideIcon } from '@lucide/svelte';
  export interface MenuEntry {
    label?: string;
    icon?: LucideIcon;
    action?: () => void;
    disabled?: boolean;
    checked?: boolean;
    radio?: boolean;
    danger?: boolean;
    children?: MenuEntry[];
    iconGrid?: boolean;
  }
</script>
<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronRight } from '@lucide/svelte';
  import * as Menu from '#lib/components/ui/context-menu/index.js';
  let { x, y, label, entries, onClose }: {
    x: number; y: number; label: string; entries: MenuEntry[]; onClose: () => void;
  } = $props();
  let trigger: HTMLElement | null = $state(null);
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  onMount(() => {
    trigger?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  });
</script>
{#snippet items(values: MenuEntry[], icons = false)}
  {#each values as item}
    {#if !item.label}<Menu.Separator class="file-context-divider" />
    {:else if item.children}
      <Menu.Sub>
        <Menu.SubTrigger disabled={item.disabled}>
          {#if item.icon}<item.icon size={15} />{/if}<span>{item.label}</span><ChevronRight size={14} />
        </Menu.SubTrigger>
        <Menu.SubContent class={item.iconGrid ? "file-context-menu file-context-submenu grid grid-cols-4" : "file-context-menu file-context-submenu"} aria-label={item.iconGrid ? "Set folder icon" : item.label}>
          {@render items(item.children, item.iconGrid)}
        </Menu.SubContent>
      </Menu.Sub>
    {:else if item.radio}
      <Menu.RadioGroup value={item.checked ? 'selected' : ''}>
        <Menu.RadioItem value="selected" disabled={item.disabled} aria-label={icons ? item.label : undefined} title={icons ? item.label : undefined} onSelect={() => item.action?.()}>
          {#if item.icon}<item.icon size={15} />{/if}{#if !icons}<span>{item.label}</span>{/if}
        </Menu.RadioItem>
      </Menu.RadioGroup>
    {:else if item.checked !== undefined}
      <Menu.CheckboxItem checked={item.checked} disabled={item.disabled} onSelect={() => item.action?.()}>
        {#if item.icon}<item.icon size={15} />{/if}<span>{item.label}</span>
      </Menu.CheckboxItem>
    {:else}
      <Menu.Item disabled={item.disabled} class={item.danger ? 'danger' : undefined} onSelect={() => item.action?.()}>
        {#if item.icon}<item.icon size={15} />{/if}<span>{item.label}</span>
      </Menu.Item>
    {/if}
  {/each}
{/snippet}
<Menu.Root onOpenChange={(open) => { if (!open) onClose(); }}>
  <Menu.Trigger bind:ref={trigger} class="fixed size-px pointer-events-none" style={`left: ${x}px; top: ${y}px`} tabindex={-1} aria-hidden="true" />
  <Menu.Content class="file-context-menu" aria-label={label}
    onCloseAutoFocus={(event) => { event.preventDefault(); if (document.activeElement === document.body) opener?.focus(); }}>
    {@render items(entries)}
  </Menu.Content>
</Menu.Root>
