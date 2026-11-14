<script lang="ts">
  import { Command as Primitive } from "bits-ui";
  import { cn } from "#lib/utils.js";
  let { ref = $bindable(null), class: className, children, ...restProps }: Primitive.ListProps = $props();
</script>
<Primitive.List bind:ref class={cn(className)} {...restProps}>
  <Primitive.Viewport>
    {@render children?.()}
  </Primitive.Viewport>
</Primitive.List>
