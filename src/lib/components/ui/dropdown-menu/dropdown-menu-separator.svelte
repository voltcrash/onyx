<script lang="ts">
    import { DropdownMenu as Primitive } from "bits-ui";
    import { cn } from "#lib/utils.js";

    let { ref = $bindable(null), class: className, ...restProps }: Primitive.SeparatorProps = $props();
  </script>

  <Primitive.Separator bind:ref class={cn("my-1 h-px bg-line-soft", className)} {...restProps} />
