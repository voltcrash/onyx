<script lang="ts">
	import { Archive, Check, ChevronDown, ChevronRight, Cloud, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, GripVertical, MoreHorizontal, PanelLeft, PanelLeftClose, Pencil, Search, Settings, Trash2, X } from '@lucide/svelte';
	import { onMount } from 'svelte';

	type TreeNode = { id: string; name: string; type: 'folder' | 'file'; content?: string; children?: TreeNode[] };
	type FlatNode = { node: TreeNode; depth: number; parentId: string | null };

	const initialTree: TreeNode[] = [
		{ id: 'projects', name: 'Projects', type: 'folder', children: [
			{ id: 'atlas', name: 'Atlas', type: 'folder', children: [
				{ id: 'atlas-overview', name: 'Overview.md', type: 'file', content: '# Atlas\n\nA quiet system for keeping projects, decisions, and ideas close at hand.\n\n## This week\n\n- Refine the capture flow\n- Review offline storage behavior\n- Prepare the September release\n\n## Decisions\n\nKeep the writing surface simple. Structure should stay in the sidebar, not interrupt the note.' },
				{ id: 'research-notes', name: 'Research notes.md', type: 'file', content: '# Research notes\n\n## Local-first references\n\nCollect useful patterns here.' }
			] },
			{ id: 'onyx', name: 'Onyx', type: 'folder', children: [
				{ id: 'roadmap', name: 'Roadmap.md', type: 'file', content: '# Roadmap\n\n## Now\n\nA fast, keyboard-friendly file manager.' },
				{ id: 'design-notes', name: 'Design notes.md', type: 'file', content: '# Design notes\n\nLet the interface feel sturdy, quiet, and precise.' }
			] }
		] },
		{ id: 'areas', name: 'Areas', type: 'folder', children: [
			{ id: 'reading', name: 'Reading list.md', type: 'file', content: '# Reading list\n\n- Designing Data-Intensive Applications' },
			{ id: 'ideas', name: 'Ideas.md', type: 'file', content: '# Ideas\n\nSmall thoughts worth returning to.' }
		] },
		{ id: 'quick-notes', name: 'Quick notes.md', type: 'file', content: '# Quick notes\n\nCapture first. Organize later.' }
	];

	let tree = $state<TreeNode[]>(initialTree);
	let expanded = $state(new Set(['projects', 'atlas', 'onyx', 'areas']));
	let selectedId = $state('atlas-overview');
	let editingId = $state<string | null>(null);
	let editingName = $state('');
	let menuId = $state<string | null>(null);
	let searchQuery = $state('');
	let sidebarOpen = $state(true);
	let deleteTarget = $state<TreeNode | null>(null);
	let moveTarget = $state<TreeNode | null>(null);
	let draggedId = $state<string | null>(null);
	let saved = $state(true);

	const flatTree = $derived(flatten(tree, searchQuery));
	const selected = $derived(findNode(tree, selectedId));
	const folders = $derived(flattenAll(tree).filter(({ node }) => node.type === 'folder'));
	const headings = $derived((selected?.content ?? '').split('\n').filter((line) => /^#{1,3}\s/.test(line)).map((line) => ({ level: line.match(/^#+/)?.[0].length ?? 1, label: line.replace(/^#{1,3}\s/, '') })));

	onMount(() => {
		const stored = localStorage.getItem('onyx-tree');
		if (stored) {
			try { tree = JSON.parse(stored); } catch { localStorage.removeItem('onyx-tree'); }
		}
	});

	function flatten(nodes: TreeNode[], query: string, depth = 0, parentId: string | null = null): FlatNode[] {
		const result: FlatNode[] = [];
		const normalized = query.trim().toLowerCase();
		for (const node of nodes) {
			if (normalized) {
				if (node.type === 'file' && node.name.toLowerCase().includes(normalized)) result.push({ node, depth: 0, parentId });
				if (node.children) result.push(...flatten(node.children, query, 0, node.id));
			} else {
				result.push({ node, depth, parentId });
				if (node.children && expanded.has(node.id)) result.push(...flatten(node.children, query, depth + 1, node.id));
			}
		}
		return result;
	}

	function flattenAll(nodes: TreeNode[], depth = 0, parentId: string | null = null): FlatNode[] {
		return nodes.flatMap((node) => [{ node, depth, parentId }, ...(node.children ? flattenAll(node.children, depth + 1, node.id) : [])]);
	}

	function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
		for (const node of nodes) {
			if (node.id === id) return node;
			const found = node.children ? findNode(node.children, id) : undefined;
			if (found) return found;
		}
	}

	function findParent(nodes: TreeNode[], id: string, parent: TreeNode | null = null): TreeNode | null | undefined {
		for (const node of nodes) {
			if (node.id === id) return parent;
			const found = node.children ? findParent(node.children, id, node) : undefined;
			if (found !== undefined) return found;
		}
	}

	function persist(): void { localStorage.setItem('onyx-tree', JSON.stringify(tree)); }

	function toggleFolder(id: string): void {
		expanded = new Set(expanded);
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}

	function selectNode(node: TreeNode): void {
		menuId = null;
		if (node.type === 'folder') toggleFolder(node.id);
		else { selectedId = node.id; sidebarOpen = window.innerWidth > 760; }
	}

	function createNode(type: 'folder' | 'file'): void {
		const selectedNode = findNode(tree, selectedId);
		const parent = selectedNode?.type === 'folder' ? selectedNode : findParent(tree, selectedId);
		const base = type === 'folder' ? 'New folder' : 'Untitled.md';
		const id = crypto.randomUUID();
		const node: TreeNode = type === 'folder' ? { id, name: base, type, children: [] } : { id, name: base, type, content: '# Untitled\n\n' };
		if (parent) {
			parent.children ??= [];
			parent.children.push(node);
			expanded = new Set(expanded).add(parent.id);
		} else tree.push(node);
		tree = [...tree];
		selectedId = id;
		editingId = id;
		editingName = base;
		persist();
		setTimeout(() => document.querySelector<HTMLInputElement>('.rename-input')?.select());
	}

	function beginRename(node: TreeNode): void {
		editingId = node.id;
		editingName = node.name;
		menuId = null;
		setTimeout(() => document.querySelector<HTMLInputElement>('.rename-input')?.select());
	}

	function commitRename(): void {
		if (!editingId) return;
		const node = findNode(tree, editingId);
		const name = editingName.trim();
		if (node && name) {
			node.name = node.type === 'file' && !name.toLowerCase().endsWith('.md') ? `${name}.md` : name;
			tree = [...tree];
			persist();
		}
		editingId = null;
	}

	function removeFromTree(nodes: TreeNode[], id: string): TreeNode | undefined {
		const index = nodes.findIndex((node) => node.id === id);
		if (index >= 0) return nodes.splice(index, 1)[0];
		for (const node of nodes) {
			const removed = node.children ? removeFromTree(node.children, id) : undefined;
			if (removed) return removed;
		}
	}

	function confirmDelete(): void {
		if (!deleteTarget) return;
		const deletingSelected = deleteTarget.id === selectedId || Boolean(findNode(deleteTarget.children ?? [], selectedId));
		removeFromTree(tree, deleteTarget.id);
		tree = [...tree];
		if (deletingSelected) selectedId = flattenAll(tree).find(({ node }) => node.type === 'file')?.node.id ?? '';
		deleteTarget = null;
		persist();
	}

	function moveNode(nodeId: string, folderId: string | null): void {
		const node = findNode(tree, nodeId);
		if (!node || nodeId === folderId || (node.children && folderId && findNode(node.children, folderId))) return;
		const removed = removeFromTree(tree, nodeId);
		if (!removed) return;
		const folder = folderId ? findNode(tree, folderId) : undefined;
		if (folder?.type === 'folder') {
			folder.children ??= [];
			folder.children.push(removed);
			expanded = new Set(expanded).add(folder.id);
		} else tree.push(removed);
		tree = [...tree];
		moveTarget = null;
		persist();
	}

	function dropOn(target: TreeNode): void {
		if (!draggedId) return;
		const targetFolder = target.type === 'folder' ? target : findParent(tree, target.id);
		moveNode(draggedId, targetFolder?.id ?? null);
		draggedId = null;
	}

	function updateContent(value: string): void {
		if (!selected || selected.type !== 'file') return;
		selected.content = value;
		tree = [...tree];
		saved = false;
		window.setTimeout(() => { persist(); saved = true; }, 350);
	}
</script>

<svelte:head><title>Onyx — Notes</title><meta name="description" content="A focused, local-first home for Markdown notes." /></svelte:head>

<div class="app-shell" class:sidebar-collapsed={!sidebarOpen}>
	<header class="topbar">
		<div class="brand-block"><div class="brand-mark">O</div><div><strong>Onyx</strong><span>Personal vault</span></div></div>
		<div class="document-status"><Cloud size={15} /> {saved ? 'Saved locally' : 'Saving…'}</div>
		<div class="top-actions"><button class="icon-button" aria-label="Open settings"><Settings size={18} /></button><div class="avatar">LK</div></div>
	</header>

	<aside class="sidebar" aria-label="File manager">
		<div class="sidebar-header"><div><span class="eyebrow">Workspace</span><h1>Notes</h1></div><button class="icon-button close-sidebar" onclick={() => (sidebarOpen = false)} aria-label="Close sidebar"><PanelLeftClose size={18} /></button></div>
		<div class="search-wrap"><Search size={16} /><input bind:value={searchQuery} aria-label="Search notes" placeholder="Search notes" />{#if searchQuery}<button aria-label="Clear search" onclick={() => (searchQuery = '')}><X size={14} /></button>{/if}</div>
		<div class="tree-toolbar"><span>Files</span><div><button aria-label="New note" title="New note" onclick={() => createNode('file')}><FilePlus2 size={16} /></button><button aria-label="New folder" title="New folder" onclick={() => createNode('folder')}><FolderPlus size={16} /></button></div></div>

		<nav class="file-tree" aria-label="Notes and folders">
			{#each flatTree as item (item.node.id)}
				<div role="treeitem" aria-selected={item.node.id === selectedId} tabindex="-1" class="tree-row" class:selected={item.node.id === selectedId} class:dragging={item.node.id === draggedId} style={`--depth: ${item.depth}`} draggable="true" ondragstart={() => (draggedId = item.node.id)} ondragend={() => (draggedId = null)} ondragover={(event) => event.preventDefault()} ondrop={(event) => { event.preventDefault(); dropOn(item.node); }}>
					<button class="node-main" onclick={() => selectNode(item.node)}>
						<span class="chevron">{#if item.node.type === 'folder'}{#if expanded.has(item.node.id)}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}{/if}</span>
						{#if item.node.type === 'folder'}{#if expanded.has(item.node.id)}<FolderOpen class="node-icon folder-icon" size={17} />{:else}<Folder class="node-icon folder-icon" size={17} />{/if}{:else}<FileText class="node-icon" size={16} />{/if}
						{#if editingId === item.node.id}
							<input class="rename-input" bind:value={editingName} onclick={(event) => event.stopPropagation()} onblur={commitRename} onkeydown={(event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') editingId = null; }} />
						{:else}<span class="node-name">{item.node.name.replace(/\.md$/i, '')}</span>{/if}
					</button>
					<button class="row-menu" aria-label={`Actions for ${item.node.name}`} onclick={() => (menuId = menuId === item.node.id ? null : item.node.id)}><MoreHorizontal size={16} /></button>
					{#if menuId === item.node.id}<div class="context-menu"><button onclick={() => beginRename(item.node)}><Pencil size={14} /> Rename</button><button onclick={() => { moveTarget = item.node; menuId = null; }}><GripVertical size={14} /> Move to…</button><button class="danger" onclick={() => { deleteTarget = item.node; menuId = null; }}><Trash2 size={14} /> Delete</button></div>{/if}
				</div>
			{/each}
			{#if flatTree.length === 0}<div class="empty-tree">No notes match “{searchQuery}”</div>{/if}
		</nav>
		<div class="sidebar-footer"><button><Archive size={17} /><span>Archive</span><span class="count">3</span></button><div class="storage"><span><i></i>2.4 MB of 1 GB</span><div><i></i></div></div></div>
	</aside>

	<main class="workspace">
		<button class="sidebar-toggle" onclick={() => (sidebarOpen = true)} aria-label="Open sidebar"><PanelLeft size={19} /></button>
		{#if selected?.type === 'file'}
			<div class="editor-wrap">
				<div class="breadcrumb"><span>{findParent(tree, selected.id)?.name ?? 'Notes'}</span><ChevronRight size={13} /><strong>{selected.name}</strong></div>
				<input class="note-title" aria-label="Note title" value={selected.name.replace(/\.md$/i, '')} onchange={(event) => { editingId = selected.id; editingName = event.currentTarget.value; commitRename(); }} />
				<div class="note-meta"><span>Edited just now</span><span>·</span><span>Markdown</span><span class="private-pill"><Check size={12} /> Private</span></div>
				<textarea class="markdown-editor" aria-label="Markdown content" spellcheck="true" value={selected.content} oninput={(event) => updateContent(event.currentTarget.value)}></textarea>
			</div>
			<aside class="outline" aria-label="Note outline"><span class="eyebrow">On this page</span>{#each headings as heading}<a href={`#${heading.label.toLowerCase().replaceAll(' ', '-')}`} class:subheading={heading.level > 1}>{heading.label}</a>{/each}</aside>
		{:else}
			<div class="blank-state"><FileText size={28} /><h2>No note selected</h2><p>Choose a note from the sidebar or create a new one.</p><button onclick={() => createNode('file')}><FilePlus2 size={16} /> New note</button></div>
		{/if}
	</main>
</div>

{#if deleteTarget}
	<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) deleteTarget = null; }}><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" tabindex="-1"><div class="modal-icon danger-icon"><Trash2 size={20} /></div><h2 id="delete-title">Delete {deleteTarget.type}?</h2><p>“{deleteTarget.name}” {deleteTarget.type === 'folder' ? 'and everything inside it ' : ''}will be removed from this vault.</p><div class="modal-actions"><button class="secondary" onclick={() => (deleteTarget = null)}>Cancel</button><button class="destructive" onclick={confirmDelete}>Delete</button></div></div></div>
{/if}

{#if moveTarget}
	<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) moveTarget = null; }}><div class="modal move-modal" role="dialog" aria-modal="true" aria-labelledby="move-title" tabindex="-1"><div class="modal-icon"><FolderOpen size={20} /></div><h2 id="move-title">Move “{moveTarget.name.replace(/\.md$/i, '')}”</h2><p>Choose a new location in your vault.</p><div class="folder-picker"><button onclick={() => moveNode(moveTarget!.id, null)}><Folder size={16} /><span>Notes</span><small>Vault root</small></button>{#each folders.filter(({ node }) => node.id !== moveTarget?.id && !(moveTarget?.children && findNode(moveTarget.children, node.id))) as folder}<button style={`--depth: ${folder.depth}`} onclick={() => moveNode(moveTarget!.id, folder.node.id)}><Folder size={16} /><span>{folder.node.name}</span></button>{/each}</div><div class="modal-actions"><button class="secondary" onclick={() => (moveTarget = null)}>Cancel</button></div></div></div>
{/if}
