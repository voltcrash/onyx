<script lang="ts">
	import { tick } from 'svelte';
	import * as Dialog from '#lib/components/ui/alert-dialog/index.js';

	interface Props {
		eyebrow: string;
		title: string;
		message: string;
		confirmLabel: string;
		danger?: boolean;
    alternatives?: Array<{ label: string; action(): void }>;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { eyebrow, title, message, confirmLabel, danger = false, alternatives = [], onConfirm, onCancel }: Props = $props();

	let cancelButton = $state<HTMLButtonElement | null>(null);
</script>

<Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
	<Dialog.Content interactOutsideBehavior="close" class="confirm-dialog-surface confirm-modal [width:min(100%,_410px)] overflow-hidden border border-line-strong rounded-xl bg-paper [box-shadow:var(--shadow-lg)]" aria-labelledby="confirm-title" aria-describedby="confirm-message" onOpenAutoFocus={(event) => { event.preventDefault(); void tick().then(() => cancelButton?.focus()); }}>
		<div class="modal-title flex items-start justify-between pt-5.5 px-5.5 pb-4.5 [border-bottom:1px_solid_var(--line-soft)] [&_span]:text-accent [&_span]:text-ui-10 [&_span]:font-bold [&_span]:[letter-spacing:0.13em] [&_span]:uppercase [&_h2]:mt-1.25 [&_h2]:mx-0 [&_h2]:mb-0 [&_h2]:[font-family:'Newsreader_Variable',_Georgia,_serif] [&_h2]:text-ui-24 [&_h2]:font-medium [&_h2]:[letter-spacing:-0.025em] [.settings-modal_&_h2]:mt-0"><div><span>{eyebrow}</span><h2 id="confirm-title">{title}</h2></div></div>
		<p id="confirm-message" class="confirm-message m-0 py-4.5 px-5.5 text-muted text-ui-13 [line-height:1.55]">{message}</p>
		<div class="modal-actions flex justify-end gap-2 pt-3.5 px-5.5 pb-4.5 [border-top:1px_solid_var(--line-soft)] [&_button]:h-8.5 [&_button]:flex [&_button]:items-center [&_button]:gap-1.75 [&_button]:py-0 [&_button]:px-3 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-55">
      {#each alternatives as alternative}<button type="button" onclick={alternative.action}>{alternative.label}</button>{/each}
			<Dialog.Cancel bind:ref={cancelButton}>Cancel</Dialog.Cancel>
			<button type="button" class="primary [.modal-actions_button&]:border-solid-bg [.modal-actions_button&]:bg-solid-bg [.modal-actions_button&]:text-on-solid [.modal-actions_button&.danger]:border-danger-solid [.modal-actions_button&.danger]:bg-danger-solid [.modal-actions_button&.danger]:text-white" class:danger onclick={onConfirm}>{confirmLabel}</button>
		</div>
	</Dialog.Content>
</Dialog.Root>
