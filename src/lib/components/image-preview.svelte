<script lang="ts">
	import { X } from '@lucide/svelte';
	import { manageModalFocus } from '$lib/modal-focus';

	interface Props {
		name: string;
		src: string;
		onClose: () => void;
	}

	let { name, src, onClose }: Props = $props();

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="image-preview-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
	<div class="image-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="image-preview-title" tabindex="-1" use:manageModalFocus>
		<div class="image-preview-header">
			<div class="image-preview-heading">
				<span>Image preview</span>
				<h2 id="image-preview-title">{name}</h2>
			</div>
			<button class="icon-button" type="button" aria-label="Close image preview" title="Close image preview (Esc)" onclick={onClose}><X size={18} /></button>
		</div>
		<div class="image-preview-body">
			<img src={src} alt={name} />
		</div>
	</div>
</div>

<style>
	.image-preview-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		padding: 20px;
		background: var(--overlay);
		backdrop-filter: blur(4px);
		animation: image-preview-fade 0.15s ease-out;
	}

	@keyframes image-preview-fade {
		from { opacity: 0; }
	}

	.image-preview-dialog {
		width: min(100%, 1080px);
		max-height: min(100%, 900px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--line-strong);
		border-radius: 13px;
		background: var(--paper);
		box-shadow: var(--shadow-lg);
	}

	.image-preview-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 18px 14px;
		border-bottom: 1px solid var(--line-soft);
	}

	.image-preview-heading {
		min-width: 0;
	}

	.image-preview-heading span {
		color: var(--accent);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.image-preview-heading h2 {
		margin: 4px 0 0;
		overflow: hidden;
		color: var(--ink);
		font-family: "Newsreader Variable", Georgia, serif;
		font-size: 21px;
		font-weight: 500;
		letter-spacing: -0.025em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.image-preview-body {
		min-height: 0;
		display: grid;
		place-items: center;
		overflow: auto;
		padding: 24px;
		background: var(--surface);
	}

	.image-preview-body img {
		display: block;
		max-width: 100%;
		max-height: calc(100dvh - 130px);
		object-fit: contain;
		border-radius: 5px;
	}

	@media (max-width: 600px) {
		.image-preview-backdrop {
			padding: 10px;
		}

		.image-preview-body {
			padding: 12px;
		}
	}
</style>
