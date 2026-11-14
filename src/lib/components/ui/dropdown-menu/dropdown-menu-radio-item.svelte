<script lang="ts">
    import { DropdownMenu as Primitive } from "bits-ui";
    import { cn } from "#lib/utils.js";
    let { ref = $bindable(null), class: className, ...restProps }: Primitive.RadioItemProps = $props();
  </script>
  <Primitive.RadioItem bind:ref class={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.25 py-1.75 outline-none data-[highlighted]:bg-subtle-strong data-[state=checked]:text-ink data-[state=checked]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)} {...restProps} />
