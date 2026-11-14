<script lang="ts">
  import { Command as Primitive } from "bits-ui";
  import { cn } from "#lib/utils.js";
  let { ref = $bindable(null), value = $bindable(""), class: className, ...restProps }: Primitive.InputProps = $props();
</script>
<Primitive.Input bind:ref bind:value class={cn(className)} {...restProps} />
