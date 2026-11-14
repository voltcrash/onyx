<script lang="ts">
  import { Dialog as Primitive } from "bits-ui";
  import { cn } from "#lib/utils.js";
  let { ref = $bindable(null), class: className, ...restProps }: Primitive.OverlayProps = $props();
</script>
<Primitive.Overlay bind:ref class={cn("modal-backdrop fixed inset-0 z-50 bg-(--overlay) backdrop-blur-sm", className)} {...restProps} />
