<script lang="ts">
    import { ContextMenu as Primitive } from "bits-ui";
    import { cn } from "#lib/utils.js";

    let { ref = $bindable(null), class: className, ...restProps }: Primitive.SubTriggerProps = $props();
  </script>

  <Primitive.SubTrigger bind:ref class={cn("flex cursor-pointer items-center gap-2.25 min-h-8 rounded-md px-2 py-1.25 [&_span]:flex-1 pointer-coarse:min-h-10.5 outline-none data-[highlighted]:bg-subtle-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&.danger]:text-danger", className)} {...restProps} />
