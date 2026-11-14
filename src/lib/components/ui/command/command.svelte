<script lang="ts">
  import { Command as Primitive } from "bits-ui";
  import { cn } from "#lib/utils.js";
  let { ref = $bindable(null), value = $bindable(""), class: className, ...restProps }: Primitive.RootProps = $props();
</script>
<Primitive.Root bind:ref bind:value class={cn(className)} {...restProps} />
