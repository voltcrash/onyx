<script lang="ts">
  import { Command as Primitive } from "bits-ui";
  import { cn } from "#lib/utils.js";
  let { ref = $bindable(null),  class: className, ...restProps }: Primitive.ItemProps = $props();
</script>
<Primitive.Item bind:ref  class={cn(className)} {...restProps} />
