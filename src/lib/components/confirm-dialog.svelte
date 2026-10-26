<script lang="ts">
	import { manageModalFocus } from '#lib/modal-focus.ts';

	interface Props {
		eyebrow: string;
		title: string;
		message: string;
		confirmLabel: string;
		danger?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { eyebrow, title, message, confirmLabel, danger = false, onConfirm, onCancel }: Props = $props();

	// Escape answers the dialog alone, so panels underneath stay open.
	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		onCancel();
	}
</script>

<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
	<div class="shortcut-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" tabindex="-1" use:manageModalFocus onkeydown={handleKeydown}>
		<div class="modal-title"><div><span>{eyebrow}</span><h2 id="confirm-title">{title}</h2></div></div>
		<p id="confirm-message" class="confirm-message">{message}</p>
		<div class="modal-actions">
			<button type="button" onclick={onCancel}>Cancel</button>
			<button type="button" class="primary" class:danger onclick={onConfirm}>{confirmLabel}</button>
		</div>
	</div>
</div>
