<script lang="ts">
	import { Trash2, X } from '@lucide/svelte';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	interface Props {
		name: string;
		src: string;
		onClose: () => void;
		onDelete: () => void;
	}

	let { name, src, onClose, onDelete }: Props = $props();

</script>


<Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
	<Dialog.Content class="image-preview-dialog [width:min(100%,_1080px)] [max-height:min(100%,_900px)] flex flex-col overflow-hidden border border-line-strong rounded-xl bg-paper [box-shadow:var(--shadow-lg)]" aria-labelledby="image-preview-title">
		<div class="image-preview-header flex items-start justify-between gap-4 pt-4 px-4.5 pb-3.5 [border-bottom:1px_solid_var(--line-soft)]">
			<div class="image-preview-heading min-w-0 [&_span]:text-accent [&_span]:text-ui-10 [&_span]:font-bold [&_span]:[letter-spacing:0.13em] [&_span]:uppercase [&_h2]:mt-1 [&_h2]:mx-0 [&_h2]:mb-0 [&_h2]:overflow-hidden [&_h2]:text-ink [&_h2]:[font-family:'Newsreader_Variable',_Georgia,_serif] [&_h2]:text-ui-20 [&_h2]:font-medium [&_h2]:[letter-spacing:-0.025em] [&_h2]:text-ellipsis [&_h2]:whitespace-nowrap">
				<span>Image preview</span>
				<h2 id="image-preview-title">{name}</h2>
			</div>
			<div class="image-preview-actions flex items-center gap-1">
				<button class="image-preview-delete flex items-center gap-1.5 py-1.75 px-2.25 border-0 rounded-md bg-transparent text-danger cursor-pointer text-ui-12 [&:hover]:bg-danger-bg" type="button" aria-label={`Delete ${name}`} title={`Delete ${name}`} onclick={onDelete}><Trash2 size={15} /><span>Delete</span></button>
				<button class="icon-button border-0 bg-transparent cursor-pointer w-8.5 h-8.5 grid place-items-center rounded-md text-muted [transition:background_0.15s_ease,_color_0.15s_ease] [&:hover]:bg-subtle-strong [&:hover]:text-ink [.sidebar-footer_&]:w-7 [.sidebar-footer_&]:h-7" type="button" aria-label="Close image preview" title="Close image preview (Esc)" onclick={onClose}><X size={18} /></button>
			</div>
		</div>
		<div class="image-preview-body min-h-0 grid place-items-center overflow-auto p-6 bg-surface [&_img]:block [&_img]:max-w-full [&_img]:[max-height:calc(100dvh_-_130px)] [&_img]:[object-fit:contain] [&_img]:rounded-sm [@media((max-width:_600px))]:p-3!">
			<img src={src} alt={name} />
		</div>
	</Dialog.Content>
</Dialog.Root>
