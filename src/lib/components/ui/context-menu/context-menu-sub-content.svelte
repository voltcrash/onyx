<script lang="ts">
    import { ContextMenu as Primitive } from "bits-ui";
    import { cn } from "#lib/utils.js";
    import Portal from "./context-menu-portal.svelte";
    let { ref = $bindable(null), class: className, ...restProps }: Primitive.SubContentProps = $props();
  </script>
  <Portal>
  <Primitive.SubContent bind:ref class={cn("z-50 min-w-48 overflow-y-auto rounded-lg border border-line bg-surface p-1.25 text-ink-body [box-shadow:var(--shadow-md)] text-ui-12 max-h-[var(--bits-context-menu-content-available-height)]", className)} {...restProps} />
  </Portal>
