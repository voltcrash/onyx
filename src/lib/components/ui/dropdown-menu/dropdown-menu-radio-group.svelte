<script lang="ts">
    import { DropdownMenu as Primitive } from "bits-ui";
    import { cn } from "#lib/utils.js";
    let { ref = $bindable(null), class: className, ...restProps }: Primitive.RadioGroupProps = $props();
  </script>
  <Primitive.RadioGroup bind:ref class={cn("", className)} {...restProps} />
