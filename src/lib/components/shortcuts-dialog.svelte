<script lang="ts">
	import { X } from '@lucide/svelte';
	import { manageModalFocus } from '$lib/modal-focus';

	interface Props { onClose: () => void; }
	let { onClose }: Props = $props();
</script>

<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
	<div id="shortcuts-dialog" class="shortcut-modal" role="dialog" aria-modal="true" aria-labelledby="shortcut-title" tabindex="-1" use:manageModalFocus>
		<div class="modal-title"><div><span>Reference</span><h2 id="shortcut-title">Keyboard shortcuts</h2></div><button class="icon-button" aria-label="Close shortcuts" onclick={onClose}><X size={18} /></button></div>
		<div class="shortcut-list">
			<div><span>Command palette</span><kbd>⌘ K</kbd></div>
			<div><span>Search all notes</span><kbd>⌘ ⇧ F</kbd></div>
			<div><span>New note</span><kbd>⌘ ⏎</kbd></div>
			<div><span>Save note</span><kbd>⌘ S</kbd></div>
			<div><span>Bold selection</span><kbd>⌘ B</kbd></div>
			<div><span>Italic selection</span><kbd>⌘ I</kbd></div>
			<div><span>Toggle preview</span><kbd>⌘ ⇧ P</kbd></div>
			<div><span>Toggle sidebar</span><kbd>⌘ \</kbd></div>
			<div><span>Cycle theme</span><kbd>⌘ ⇧ L</kbd></div>
			<div><span>Focus search</span><kbd>/</kbd></div>
			<div><span>Open this panel</span><kbd>?</kbd></div>
			<div><span>Close any panel</span><kbd>Esc</kbd></div>
		</div>
		<p>Use Ctrl instead of ⌘ on Windows and Linux.</p>
	</div>
</div>
