<script lang="ts">
  import { Dialog as Primitive } from "bits-ui";
  import { cn } from "#lib/utils.js";
  import Overlay from "./dialog-overlay.svelte";
  import Portal from "./dialog-portal.svelte";
  let { ref = $bindable(null), class: className, ...restProps }: Primitive.ContentProps = $props();
</script>
<Portal>
  <Overlay />
  <Primitive.Content bind:ref class={cn("fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 max-w-[calc(100vw-40px)] max-h-[calc(100dvh-40px)] outline-none", className)} {...restProps} />
</Portal>
