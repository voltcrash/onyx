<script lang="ts">
    import { DropdownMenu as Primitive } from "bits-ui";
    import { cn } from "#lib/utils.js";
    import Portal from "./dropdown-menu-portal.svelte";
    let { ref = $bindable(null), class: className, ...restProps }: Primitive.ContentProps = $props();
  </script>
  <Portal>
  <Primitive.Content bind:ref class={cn("z-50 min-w-48 overflow-y-auto rounded-xl border border-line bg-surface p-1 text-ink-body [box-shadow:var(--shadow-md)] text-ui-13 max-h-[var(--bits-dropdown-menu-content-available-height)]", className)} {...restProps} />
  </Portal>
