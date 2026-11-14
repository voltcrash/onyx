<script lang="ts">
  import NoteCreationSettings from "./note-creation-settings.svelte";
  import type { NoteCreationPreferences } from "#lib/note-creation.ts";
  import BackupEncryptionSettings from "./backup-encryption-settings.svelte";
	import { untrack } from 'svelte';
	import {
		CloudDownload, CloudOff, CloudUpload, Code2, Copy, Database, Download, ExternalLink, FileArchive,
		FolderInput, FolderOutput, HardDrive, LoaderCircle, LogOut, Monitor, Moon, RefreshCw, ShieldCheck,
		Sun, Trash2, TriangleAlert, WifiOff, X
	} from '@lucide/svelte';
	import { listGithubRepositories, type GithubRepository, type GithubUser } from '#lib/github.ts';
	import { defaultFontChoices, fontCategories as fontCategoryOptions, fontOptionsFor, fontRoles, type FontCategories, type FontCategory, type FontChoices, type FontRole } from '#lib/fonts.ts';
	import { colorThemeOptions, type ColorTheme, type ResolvedTheme, type ThemePreference } from '#lib/theme.ts';
	import { persistenceDeniedMessage } from '#lib/browser-storage.ts';
	import {
		formatShortcut, shortcutActions, shortcutFromEvent, shortcutParts, shortcutsEqual,
		type KeyboardShortcut, type KeyboardShortcuts, type PrimaryModifier, type ShortcutAction
	} from '#lib/keyboard-shortcuts.ts';
	import type { Vault } from '#lib/storage/vault.ts';
	import type { GithubBackupState, VaultStorageUsage } from '#lib/storage/types.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import GithubIcon from './github-icon.svelte';
	import type { SettingsSection } from './settings-types';

	interface Props {
    creationPreferences: NoteCreationPreferences;
    onCreationPreferences: (value: NoteCreationPreferences) => void;
    onConfigureEncryption: (passphrase: string, enabled?: boolean) => Promise<void>;
		vault?: Vault;
		vaultName: string;
		isOnline: boolean;
		githubUser?: GithubUser;
		githubState: 'loading' | 'connected' | 'disconnected' | 'error';
		githubMessage: string;
		githubBackup?: GithubBackupState;
		pendingBackupCount: number;
		backupState: 'idle' | 'backing-up' | 'success' | 'error';
		backupMessage: string;
		backupCommitUrl: string;
		transferState: 'idle' | 'working' | 'error';
		theme: ThemePreference;
		resolvedTheme: ResolvedTheme;
		colorTheme: ColorTheme;
		fonts: FontChoices;
		fontCategories: FontCategories;
		attachmentFolder: string;
		attachmentsHidden: boolean;
		onAttachmentsHiddenChange: (hidden: boolean) => void;
		onRenameAttachmentFolder: (name: string) => Promise<boolean>;
		shortcuts: KeyboardShortcuts;
		primaryModifier: PrimaryModifier;
		section?: SettingsSection;
		onThemeChange: (preference: ThemePreference) => void;
		onColorThemeChange: (theme: ColorTheme) => void;
		onFontChange: (role: FontRole, id: string) => void;
		onFontCategoryChange: (role: FontRole, category: FontCategory) => void;
		onResetFonts: () => void;
		scrollSync: boolean;
		onToggleScrollSync: () => void;
		onShortcutChange: (action: ShortcutAction, shortcut: KeyboardShortcut | null) => void;
		onResetShortcuts: () => void;
		onClose: () => void;
		onConnectGithub: () => void;
		onDisconnectGithub: () => void;
		onSelectRepository: (state: Omit<GithubBackupState, 'updatedAt'>) => Promise<void>;
		onForgetRepository: () => void;
		onAutoBackupChange: (enabled: boolean) => void;
		onBackup: () => void;
		onRestore: () => void;
		onImportFolder: () => void;
		onImportZip: () => void;
		onExportFolder: () => void;
		onExportZip: () => void;
		onPrepareVaultDeletion: () => Promise<boolean>;
		onDeleteVault: (expectedVersion: number) => Promise<void>;
	}

	let {
		creationPreferences, onCreationPreferences, onConfigureEncryption, vault, vaultName, isOnline, githubUser, githubState, githubMessage, githubBackup, pendingBackupCount,
		backupState, backupMessage, backupCommitUrl, transferState, theme, resolvedTheme, colorTheme, fonts, fontCategories, attachmentFolder, attachmentsHidden, onAttachmentsHiddenChange, onRenameAttachmentFolder, scrollSync, onToggleScrollSync, shortcuts, primaryModifier,
		section = $bindable('editor'), onThemeChange, onColorThemeChange, onFontChange, onFontCategoryChange, onResetFonts, onShortcutChange, onResetShortcuts, onClose, onConnectGithub, onDisconnectGithub, onSelectRepository, onForgetRepository, onAutoBackupChange,
		onBackup, onRestore, onImportFolder, onImportZip, onExportFolder, onExportZip, onPrepareVaultDeletion, onDeleteVault
	}: Props = $props();

	let attachmentFolderDraft = $state(untrack(() => attachmentFolder));
	let renamingAttachmentFolder = $state(false);

	$effect(() => {
		attachmentFolderDraft = attachmentFolder;
	});

	async function renameAttachmentFolder(): Promise<void> {
		renamingAttachmentFolder = true;
		try {
			if (!(await onRenameAttachmentFolder(attachmentFolderDraft))) attachmentFolderDraft = attachmentFolder;
		} finally {
			renamingAttachmentFolder = false;
		}
	}

	const sections: Array<{ id: SettingsSection; label: string }> = [
		{ id: 'editor', label: 'Editor' },
		{ id: 'themes', label: 'Themes' },
		{ id: 'shortcuts', label: 'Keyboard shortcuts' },
		{ id: 'github', label: 'Backup & sync' },
		{ id: 'storage', label: 'Storage choices' },
		{ id: 'transfer', label: 'Import & export' },
		{ id: 'vault', label: 'Vault' }
	];

	let repositories = $state<GithubRepository[]>([]);
	let repositoryState = $state<'idle' | 'loading' | 'error'>('idle');
	let repositoryMessage = $state('');
	let repositoriesLoaded = $state(false);
	let repositoryGeneration = 0;
	let usageGeneration = 0;
	let applyingRepository = $state(false);
	let clearTarget: {vault:Vault;version:number} | undefined;
	let selectedRepository = $state('');
	let branch = $state('main');
	let directory = $state('vault');
	let usage = $state<VaultStorageUsage>();
	let usageState = $state<'idle' | 'loading' | 'error'>('idle');
	let usageMessage = $state('');
	let persistState = $state<'idle' | 'requesting'>('idle');
	let nativeStorageState = $state<'idle' | 'connecting' | 'disconnecting'>('idle');
	let clearState = $state<'idle' | 'preparing' | 'confirming' | 'clearing' | 'error'>('idle');
	let clearMessage = $state('');
	let recordingShortcut = $state<ShortcutAction>();
	let shortcutMessage = $state('');

	const connected = $derived(githubState === 'connected' && Boolean(githubUser));
	const modeOptions: Array<{ id: ThemePreference; label: string; hint: string }> = [
		{ id: 'light', label: 'Light', hint: 'Warm paper for bright rooms.' },
		{ id: 'dark', label: 'Dark', hint: 'Low-glare onyx for night writing.' },
		{ id: 'system', label: 'System', hint: 'Follow your operating system automatically.' }
	];
	function themePreviewStyle(option: (typeof colorThemeOptions)[number]): string {
		return `--theme-preview-border: ${option.preview.border}; --theme-preview-paper: ${option.preview.paper}; --theme-preview-light: ${option.preview.light}; --theme-preview-dark: ${option.preview.dark}; --theme-preview-accent: ${option.preview.accent};`;
	}
	const fontsAreDefault = $derived(
		fontRoles.every(({ id }) => fonts[id] === defaultFontChoices[id])
	);
	const usedFraction = $derived(
		usage?.quota && usage.usage !== undefined ? Math.min(1, usage.usage / usage.quota) : 0
	);

	$effect(() => {
      void githubUser?.id;
      untrack(() => { repositoryGeneration += 1; repositories = []; repositoriesLoaded = false; repositoryState = 'idle'; repositoryMessage = ''; });
    });
    $effect(() => {
      void vault;
      untrack(() => { usageGeneration += 1; usage = undefined; usageState = 'idle'; usageMessage = ''; clearTarget = undefined; clearState = 'idle'; });
    });

	$effect(() => {
		if (section === 'github' && connected && isOnline && !repositoriesLoaded) void loadRepositories();
		if (section === 'storage' && !usage && usageState === 'idle') void loadUsage();
	});

	$effect(() => {
		if (githubBackup) {
			selectedRepository = `${githubBackup.owner}/${githubBackup.repository}`;
			branch = githubBackup.branch;
			directory = githubBackup.directory;
		}
	});

	async function loadRepositories(): Promise<void> {
		if (!isOnline) return;
		const account = githubUser?.id;
        const generation = ++repositoryGeneration;
        repositoryState = 'loading';
		repositoryMessage = '';
		try {
			const loaded = await listGithubRepositories();
            if (account !== githubUser?.id || generation !== repositoryGeneration) return;
            repositories = loaded;
			repositoriesLoaded = true;
			repositoryState = 'idle';
			if (repositories.length === 0) repositoryMessage = 'No repositories with write access were found.';
		} catch (error) {
			if (account !== githubUser?.id || generation !== repositoryGeneration) return;
            repositoryState = 'error';
			repositoryMessage = error instanceof Error ? error.message : 'Repositories could not be loaded.';
		}
	}

	async function loadUsage(): Promise<void> {
		if (!vault) return;
		const opened = vault;
        const generation = ++usageGeneration;
        usageState = 'loading';
		usageMessage = '';
		try {
			const loaded = await opened.getStorageUsage();
            if (opened !== vault || generation !== usageGeneration) return;
            usage = loaded;
			usageState = 'idle';
		} catch (error) {
			if (opened !== vault || generation !== usageGeneration) return;
            usageState = 'error';
			usageMessage = error instanceof Error ? error.message : 'Storage usage is unavailable.';
		}
	}

	async function requestPersistence(): Promise<void> {
		if (!vault || persistState === 'requesting') return;
		persistState = 'requesting';
		try {
			const granted = await vault.requestPersistentStorage();
			await loadUsage();
			if (!granted) usageMessage = persistenceDeniedMessage();
		} finally {
			persistState = 'idle';
		}
	}

	async function connectNativeDirectory(): Promise<void> {
		if (!vault || nativeStorageState !== 'idle') return;
		nativeStorageState = 'connecting';
		usageMessage = '';
		try {
			await vault.connectNativeDirectory();
			await loadUsage();
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'AbortError')) {
				usageMessage = error instanceof Error ? error.message : 'The folder could not be connected.';
			}
		} finally {
			nativeStorageState = 'idle';
		}
	}

	async function disconnectNativeDirectory(): Promise<void> {
		if (!vault || nativeStorageState !== 'idle') return;
		nativeStorageState = 'disconnecting';
		usageMessage = '';
		try {
			await vault.disconnectNativeDirectory();
			await loadUsage();
		} catch (error) {
			usageMessage = error instanceof Error ? error.message : 'The folder could not be disconnected.';
		} finally {
			nativeStorageState = 'idle';
		}
	}

	async function applyRepository(): Promise<void> {
        if (applyingRepository) return;
		const repository = repositories.find((item) => `${item.owner}/${item.name}` === selectedRepository);
		if (!repository) return;
		applyingRepository = true;
        try { await onSelectRepository({
			githubAccountId: githubUser!.id,
			githubAccountLogin: githubUser!.login,
			owner: repository.owner,
			repository: repository.name,
			branch: branch.trim() || repository.branch,
			directory: directory.trim().replace(/^\/+|\/+$/g, '')
		}); } finally { applyingRepository = false; }
	}

	async function clearVault(): Promise<void> {
		if (!vault) return;
		if (clearState !== 'confirming') {
			clearState = 'preparing';
			clearMessage = '';
			const opened = vault;
            try {
            if (!(await onPrepareVaultDeletion())) {
				clearState = 'error';
				clearMessage = 'Save the current note before deleting the vault.';
				return;
			}
            const version = await opened.getVersion();
            if (opened !== vault) return;
            clearTarget = {vault:opened,version};
            clearState = 'confirming';
            } catch(error) { clearState = 'error'; clearMessage = error instanceof Error ? error.message : 'The vault could not be prepared.'; }
			return;
		}
		if (!clearTarget || clearTarget.vault !== vault) { clearState = 'idle'; return; }
        clearState = 'clearing';
		clearMessage = '';
		try {
			await onDeleteVault(clearTarget.version);
			clearState = 'idle';
			usage = undefined;
		} catch (error) {
			clearState = 'error';
			clearMessage = error instanceof Error ? error.message : 'The vault could not be cleared.';
		}
	}

	function formatBytes(value?: number): string {
		if (value === undefined) return 'Unknown';
		if (value < 1024) return `${value} B`;
		const units = ['KB', 'MB', 'GB', 'TB'];
		let size = value / 1024;
		let unit = 0;
		while (size >= 1024 && unit < units.length - 1) {
			size /= 1024;
			unit += 1;
		}
		return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
	}

	function formatDate(value?: string): string {
		if (!value) return 'Never';
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
	}

	function beginShortcutCapture(action: ShortcutAction): void {
		recordingShortcut = action;
		shortcutMessage = '';
	}

	function captureShortcut(event: KeyboardEvent, action: ShortcutAction): void {
		event.preventDefault();
		event.stopPropagation();
		if (event.key === 'Escape') { recordingShortcut = undefined; shortcutMessage = ''; return; }
        const shortcut = shortcutFromEvent(event, primaryModifier);
		if (!shortcut) return;
		const conflict = shortcutActions.find(({ id }) => id !== action && shortcutsEqual(shortcuts[id], shortcut));
		if (conflict) {
			shortcutMessage = `${formatShortcut(shortcut, primaryModifier)} is already assigned to ${conflict.label}.`;
			return;
		}
		onShortcutChange(action, shortcut);
		recordingShortcut = undefined;
		shortcutMessage = '';
	}

	function clearShortcut(action: ShortcutAction): void {
		onShortcutChange(action, null);
		recordingShortcut = undefined;
		shortcutMessage = '';
	}
</script>

<Dialog.Root open onOpenChange={(open) => { if (!open && clearState !== 'clearing') onClose(); }}>
	<Dialog.Content id="settings-dialog" class="settings-dialog-surface settings-modal overflow-hidden border border-line-strong rounded-xl bg-paper [box-shadow:var(--shadow-lg)] [width:min(100%,_760px)]" aria-labelledby="settings-title" onEscapeKeydown={(event) => { if (clearState === 'clearing') event.preventDefault(); }} onInteractOutside={(event) => { if (clearState === 'clearing') event.preventDefault(); }}>
		<div class="modal-title flex items-start justify-between pt-5.5 px-5.5 pb-4.5 [border-bottom:1px_solid_var(--line-soft)] [&_span]:text-accent [&_span]:text-ui-10 [&_span]:font-bold [&_span]:[letter-spacing:0.13em] [&_span]:uppercase [&_h2]:mt-1.25 [&_h2]:mx-0 [&_h2]:mb-0 [&_h2]:[font-family:'Newsreader_Variable',_Georgia,_serif] [&_h2]:text-ui-24 [&_h2]:font-medium [&_h2]:[letter-spacing:-0.025em] [.settings-modal_&_h2]:mt-0">
			<div><h2 id="settings-title">Settings</h2></div>
			<button class="icon-button border-0 bg-transparent cursor-pointer w-8.5 h-8.5 grid place-items-center rounded-md text-muted [transition:background_0.15s_ease,_color_0.15s_ease] [&:hover]:bg-subtle-strong [&:hover]:text-ink [.sidebar-footer_&]:w-7 [.sidebar-footer_&]:h-7" aria-label="Close settings" disabled={clearState === 'clearing'} onclick={onClose}><X size={18} /></button>
		</div>

		<div class="settings-body grid [grid-template-columns:186px_minmax(0,_1fr)] [height:min(70vh,_560px)] [@media((max-width:_700px))]:[grid-template-columns:minmax(0,_1fr)]! [@media((max-width:_700px))]:[grid-template-rows:auto_minmax(0,_1fr)]! [@media((max-width:_700px))]:[height:min(76vh,_600px)]!">
			<nav class="settings-nav flex flex-col items-stretch gap-0.5 py-3.5 px-3 [border-right:1px_solid_var(--line-soft)] bg-sidebar overflow-y-auto [&_button]:flex-none [&_button]:py-2.25 [&_button]:px-2.75 [&_button]:border-0 [&_button]:rounded-md [&_button]:bg-transparent [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-13 [&_button]:text-left [&_button:hover]:bg-chip [&_button.active]:bg-surface [&_button.active]:text-ink [&_button.active]:font-semibold [&_button.active]:[box-shadow:var(--shadow-xs)] [@media((max-width:_700px))]:[flex-direction:row]! [@media((max-width:_700px))]:items-center! [@media((max-width:_700px))]:[overflow-x:auto]! [@media((max-width:_700px))]:p-2.5! [@media((max-width:_700px))]:[border-right:0]! [@media((max-width:_700px))]:[border-bottom:1px_solid_var(--line-soft)]! [@media((max-width:_700px))]:[&_button]:whitespace-nowrap!" aria-label="Settings sections">
				{#each sections as item (item.id)}
					<button class:active={section === item.id} aria-current={section === item.id ? 'page' : undefined} onclick={() => (section = item.id)}>{item.label}</button>
				{/each}
			</nav>

			<div class="settings-panel pt-5 px-5.5 pb-6 overflow-y-auto [&_h3]:mt-0 [&_h3]:mx-0 [&_h3]:mb-1 [&_h3]:[font-family:'Newsreader_Variable',_Georgia,_serif] [&_h3]:text-ui-16 [&_h3]:font-medium [&_h3]:[letter-spacing:-0.01em]">
				{#if !isOnline && section !== 'editor' && section !== 'themes' && section !== 'shortcuts' && section !== 'storage' && section !== 'transfer' && section !== 'vault'}
					<div class="settings-banner flex items-center gap-2 mb-3.5 py-2.25 px-2.75 border border-warn-border rounded-lg bg-warn-bg text-warn-text text-ui-12"><WifiOff size={15} /><span>GitHub settings are paused until your connection returns.</span></div>
				{/if}

				{#if section === 'editor'}
					<div class="settings-section-heading flex items-start justify-between gap-4.5 [&_>_div]:min-w-0 [@media((max-width:_700px))]:block!">
						<div><h3>Fonts</h3><p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Set the typefaces your notes are written in</p></div>
						{#if !fontsAreDefault}<button class="settings-secondary flex-none h-7.5 py-0 px-2.25 border border-line rounded-md bg-surface text-ink-soft cursor-pointer text-ui-11 [&:hover]:border-line-hover [&:hover]:text-ink [@media((max-width:_700px))]:[.settings-section-heading_&]:mb-3!" onclick={onResetFonts}>Restore default fonts</button>{/if}
					</div>

		<div class="type-specimen mb-5 pt-4.5 px-5 pb-5 border border-line-soft rounded-lg bg-paper [&_h4]:mt-0 [&_h4]:mx-0 [&_h4]:mb-4.5 [&_h4]:text-ink-strong [&_h4]:[font-family:var(--font-heading)] [&_h4]:text-ui-24 [&_h4]:font-medium [&_h4]:[letter-spacing:-0.03em] [&_h4]:[line-height:1.2] [&_blockquote]:mt-0 [&_blockquote]:mx-0 [&_blockquote]:mb-5 [&_blockquote]:pt-0.5 [&_blockquote]:pr-0 [&_blockquote]:pb-0.5 [&_blockquote]:pl-4.25 [&_blockquote]:[border-left:3px_solid_var(--line-hover)] [&_blockquote]:text-ink-body [&_blockquote]:[font-family:var(--font-content)] [&_blockquote]:text-ui-13 [&_blockquote]:[line-height:1.68]" aria-label="Typography preview">
			<div class="type-specimen-label inline-flex mb-4 text-ink-soft text-ui-10 font-bold [letter-spacing:0.12em] uppercase">Preview</div>
			<h4>The <code class="type-specimen-token [display:inline-block] [padding:0.08em_0.27em] rounded-sm bg-subtle-strong text-ink-strong [font:0.88em_var(--font-code)] [.type-specimen_blockquote_&]:[padding:0.04em_0.24em] [.type-specimen_blockquote_&]:[font-size:0.92em] [.type-specimen_code:not(&)]:m-0 [.type-specimen_code:not(&)]:p-0">?</code> Operator Shortcut</h4>
			<blockquote>“This pattern of propagating errors is so common in Rust that Rust provides the question mark operator <code class="type-specimen-token [display:inline-block] [padding:0.08em_0.27em] rounded-sm bg-subtle-strong text-ink-strong [font:0.88em_var(--font-code)] [.type-specimen_blockquote_&]:[padding:0.04em_0.24em] [.type-specimen_blockquote_&]:[font-size:0.92em] [.type-specimen_code:not(&)]:m-0 [.type-specimen_code:not(&)]:p-0">?</code> to make this easier.”</blockquote>
			<div class="type-specimen-code overflow-hidden border border-line-strong rounded-lg bg-code-bg text-code-text [&_pre]:[overflow-x:auto] [&_pre]:m-0 [&_pre]:pt-2.25 [&_pre]:px-3.5 [&_pre]:pb-3.75 [&_pre]:[font:13px_/_1.6_var(--font-code)] [&_pre]:[white-space:pre] [&_pre_code]:[font:inherit]" aria-label="Rust code example">
				<div class="type-specimen-code-header flex items-center justify-between pt-3 px-3.5 pb-2 text-code-text [font-family:var(--font-content)] text-ui-13 [&_>_span]:inline-flex [&_>_span]:items-center [&_>_span]:gap-2 [&_>_svg]:text-inverse-muted">
					<span><Code2 size={18} aria-hidden="true" /> Rust</span>
					<Copy size={24} aria-hidden="true" />
				</div>
				<pre><code><span class="type-specimen-code-keyword [color:#e79ab6]">let mut</span> <span class="type-specimen-code-variable [color:#b9a5ee]">username_file</span> = <span class="type-specimen-code-type text-code-text">File</span>::<span class="type-specimen-code-function [color:#b9a5ee]">open</span>(<span class="type-specimen-code-string [color:#8fcf9e]">"hello.txt"</span>)?;</code></pre>
			</div>
		</div>

					{#each fontRoles as role (role.id)}
						<div class="font-role grid [grid-template-columns:96px_minmax(0,_1fr)] [align-items:baseline] gap-2 mb-2.75 [&_label]:text-ink-soft [&_label]:text-ui-12 [&_label]:[font-weight:650] [&_select]:w-full [&_select]:h-9 [&_select]:py-0 [&_select]:px-2.5 [&_select]:border [&_select]:border-line [&_select]:rounded-md [&_select]:bg-surface [&_select]:text-ink [&_select]:cursor-pointer [&_select]:[appearance:auto] [&_select]:[-webkit-appearance:auto] [&_select]:[font-family:-apple-system,_BlinkMacSystemFont,_'Segoe_UI',_sans-serif] [&_select]:text-ui-13 [&_select:hover]:border-line-hover [&_select:focus-visible]:border-focus-border [&_select:focus-visible]:[box-shadow:0_0_0_2px_var(--focus-ring)] [&_select:focus-visible]:outline-none">
							<label for={`font-${role.id}`}>{role.label}</label>
							<div class="font-selects grid [grid-template-columns:minmax(118px,_5fr)_minmax(0,_8fr)] gap-2 min-w-0">
								<select id={`font-${role.id}-type`} aria-label={`${role.label} font type`} value={fontCategories[role.id]} onchange={(event) => onFontCategoryChange(role.id, event.currentTarget.value as FontCategory)}>
									{#each fontCategoryOptions as category (category.id)}
										<option value={category.id}>{category.label}</option>
									{/each}
								</select>
								<select id={`font-${role.id}`} aria-label={`${role.label} typeface`} value={fonts[role.id]} onchange={(event) => onFontChange(role.id, event.currentTarget.value)}>
									{#each fontOptionsFor(role.id, fontCategories[role.id]) as option (option.id)}
										<option value={option.id}>{option.name}</option>
									{/each}
								</select>
							</div>
						</div>
					{/each}
					<h3 class="settings-group-heading [.settings-panel_h3&]:mt-7 [.settings-panel_h3&]:mx-0 [.settings-panel_h3&]:mb-2">Attachments</h3>
					<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Pasted and dropped images and files are saved to this vault folder and linked with GitHub-style Markdown. Renaming it updates the links in your notes.</p>
					<div class="settings-field mb-3.25 [&_label]:block [&_label]:mb-1.5 [&_label]:text-ink-soft [&_label]:text-ui-12 [&_label]:font-semibold [&_input]:w-full [&_input]:h-9 [&_input]:py-0 [&_input]:px-2.25 [&_input]:border [&_input]:border-line [&_input]:rounded-md [&_input]:bg-surface [&_input]:text-ink [&_input]:text-ui-13 [&_select]:w-full [&_select]:h-9 [&_select]:py-0 [&_select]:px-2.25 [&_select]:border [&_select]:border-line [&_select]:rounded-md [&_select]:bg-surface [&_select]:text-ink [&_select]:text-ui-13">
						<label for="settings-attachment-folder">Folder</label>
						<form class="settings-row flex items-center gap-2 [&_input]:flex-1 [&_input]:min-w-0 [&_button]:[flex:none] [@media((max-width:_700px))]:flex-wrap!" onsubmit={(event) => { event.preventDefault(); void renameAttachmentFolder(); }}>
							<input id="settings-attachment-folder" bind:value={attachmentFolderDraft} autocomplete="off" spellcheck="false" placeholder="attachments" />
							<button class="settings-secondary flex-none h-7.5 py-0 px-2.25 border border-line rounded-md bg-surface text-ink-soft cursor-pointer text-ui-11 [&:hover]:border-line-hover [&:hover]:text-ink [@media((max-width:_700px))]:[.settings-section-heading_&]:mb-3!" type="submit" disabled={renamingAttachmentFolder || !attachmentFolderDraft.trim() || attachmentFolderDraft.trim() === attachmentFolder}>
								{#if renamingAttachmentFolder}<LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={14} />{/if}Rename
							</button>
						</form>
					</div>
					<label class="settings-toggle grid [align-items:start] gap-2.5 mt-3 text-ink text-ui-13 cursor-pointer [grid-template-columns:auto_minmax(0,_1fr)] [&_input]:[accent-color:var(--accent)] [&_input]:mt-0.75 [&_input]:mx-0 [&_input]:mb-0 [&_input]:cursor-pointer [&_span]:grid [&_span]:gap-0.5 [&_strong]:text-ink [&_strong]:text-ui-13 [&_strong]:font-semibold [&_small]:text-ink-soft [&_small]:text-ui-12">
						<input type="checkbox" checked={attachmentsHidden} onchange={(event) => onAttachmentsHiddenChange(event.currentTarget.checked)} />
						<span>Hide the attachments folder in the sidebar</span>
					</label>
					<h3 class="settings-group-heading [.settings-panel_h3&]:mt-7 [.settings-panel_h3&]:mx-0 [.settings-panel_h3&]:mb-2">Scrolling</h3>
					<label class="settings-toggle grid [align-items:start] gap-2.5 mt-3 text-ink text-ui-13 cursor-pointer [grid-template-columns:auto_minmax(0,_1fr)] [&_input]:[accent-color:var(--accent)] [&_input]:mt-0.75 [&_input]:mx-0 [&_input]:mb-0 [&_input]:cursor-pointer [&_span]:grid [&_span]:gap-0.5 [&_strong]:text-ink [&_strong]:text-ui-13 [&_strong]:font-semibold [&_small]:text-ink-soft [&_small]:text-ui-12">
						<input type="checkbox" checked={scrollSync} onchange={onToggleScrollSync} />
						<span><strong>Sync scrolling between panes</strong><small>Scrolling the page or the output keeps the other pane at the same part of the note.</small></span>
					</label>
				<NoteCreationSettings preferences={creationPreferences} onSave={onCreationPreferences} />
        {:else if section === 'themes'}
					<h3>Themes</h3>
					<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Choose how Onyx looks in this browser.</p>
					<div class="theme-mode-options grid [grid-template-columns:repeat(3,_minmax(0,_1fr))] gap-2.5 mb-5.5 [@media((max-width:_700px))]:[grid-template-columns:minmax(0,_1fr)]!" role="radiogroup" aria-label="Color mode">
						{#each modeOptions as option (option.id)}
							<button class="theme-mode-option [&_strong]:block [&_strong]:text-ui-13 [&_small]:block [&_small]:mt-0.75 [&_small]:text-muted [&_small]:text-ui-11 [&_small]:[line-height:1.4] [&_small]:[font-weight:400] flex items-start gap-2.5 min-w-0 p-3.25 border border-line rounded-lg bg-surface text-ink-soft cursor-pointer text-left [&_>_svg]:flex-none [&_>_svg]:mt-0.25 [&_>_svg]:text-muted [&:hover]:border-line-hover [&:hover]:text-ink [&:hover_>_svg]:text-accent [&.active_>_svg]:text-accent [&.active]:border-accent-border [&.active]:bg-accent-bg [&.active]:text-accent [&.active]:font-semibold" class:active={theme === option.id} role="radio" aria-checked={theme === option.id} aria-label={option.label} onclick={() => onThemeChange(option.id)}>
								{#if option.id === 'light'}<Sun size={18} />{:else if option.id === 'dark'}<Moon size={18} />{:else}<Monitor size={18} />{/if}
								<span><strong>{option.label}</strong><small>{option.id === 'system' ? `${option.hint} (currently ${resolvedTheme}).` : option.hint}</small></span>
							</button>
						{/each}
					</div>
					<h4 class="theme-section-title mt-0 mx-0 mb-2.25 text-ink-soft text-ui-12 [font-weight:650]">Color theme</h4>
					<div class="theme-options grid [grid-template-columns:repeat(2,_minmax(0,_1fr))] gap-2.5 mb-4 [&_strong]:block [&_strong]:text-ui-13 [&_button]:grid [&_button]:[grid-template-columns:58px_minmax(0,_1fr)] [&_button]:items-center [&_button]:gap-3 [&_button]:p-3.25 [&_button]:border [&_button]:border-line [&_button]:rounded-lg [&_button]:bg-surface [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:text-left [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button.active]:border-accent-border [&_button.active]:bg-accent-bg [&_button.active]:text-accent [&_button.active]:font-semibold [&_small]:block [&_small]:text-muted [&_small]:text-ui-11 [&_small]:[font-weight:400] [&_small]:[line-height:1.4] [@media((max-width:_700px))]:[grid-template-columns:minmax(0,_1fr)]!" role="radiogroup" aria-label="Color theme">
						{#each colorThemeOptions as option (option.id)}
							<button class:active={colorTheme === option.id} role="radio" aria-checked={colorTheme === option.id} onclick={() => onColorThemeChange(option.id)}>
								<span class="theme-preview relative grid [grid-template-columns:repeat(2,_minmax(0,_1fr))] [grid-template-rows:1fr] w-14.5 h-10.5 overflow-hidden border border-theme-preview-border rounded-md bg-theme-preview-paper [&_i:first-child]:[grid-column:1] [&_i:first-child]:[grid-row:1] [&_i:first-child]:bg-theme-preview-light [&_i:nth-child(2)]:[grid-column:2] [&_i:nth-child(2)]:[grid-row:1] [&_i:nth-child(2)]:bg-theme-preview-dark [&_i:last-child]:absolute [&_i:last-child]:right-1.75 [&_i:last-child]:bottom-1.75 [&_i:last-child]:w-4 [&_i:last-child]:h-1 [&_i:last-child]:m-0 [&_i:last-child]:rounded-none [&_i:last-child]:bg-theme-preview-accent" style={themePreviewStyle(option)} aria-hidden="true"><i></i><i></i><i></i></span>
								<span><strong>{option.label}</strong><small>{option.hint}</small></span>
							</button>
						{/each}
					</div>
				{:else if section === 'shortcuts'}
					<div class="settings-section-heading flex items-start justify-between gap-4.5 [&_>_div]:min-w-0 [@media((max-width:_700px))]:block!">
						<div><h3>Keyboard shortcuts</h3><p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Select a shortcut, then press a new key combination. Your primary modifier is detected automatically.</p></div>
						<button class="settings-secondary flex-none h-7.5 py-0 px-2.25 border border-line rounded-md bg-surface text-ink-soft cursor-pointer text-ui-11 [&:hover]:border-line-hover [&:hover]:text-ink [@media((max-width:_700px))]:[.settings-section-heading_&]:mb-3!" onclick={() => { onResetShortcuts(); recordingShortcut = undefined; shortcutMessage = ''; }}>Restore defaults</button>
					</div>
					{#if shortcutMessage}<p class="settings-hint error flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11 [.backup-notice&]:border-danger-border [.backup-notice&]:bg-danger-bg [.backup-notice&]:text-danger-strong [.settings-hint&]:text-danger [.restore-placeholder&]:text-danger-strong" role="alert">{shortcutMessage}</p>{/if}
					<div class="shortcut-list editable [max-height:min(52vh,_420px)] overflow-y-auto py-2.25 px-5.5 [&_>_div]:flex [&_>_div]:items-center [&_>_div]:justify-between [&_>_div]:gap-3.5 [&_>_div]:py-2.75 [&_>_div]:px-0 [&_>_div]:[border-bottom:1px_solid_var(--line-soft)] [&_>_div]:text-ink-soft [&_>_div]:text-ui-13 [&_>_div:last-child]:border-0 [&_kbd]:min-w-11 [&_kbd]:py-1.25 [&_kbd]:px-1.75 [&_kbd]:border [&_kbd]:border-line-strong [&_kbd]:[border-bottom-width:2px] [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11 [&_kbd]:text-center [&_kbd]:whitespace-nowrap [&_kbd]:[box-shadow:var(--shadow-xs)] [.settings-panel_&]:[max-height:none] [.settings-panel_&]:p-0 [.shortcut-list&_>_div]:gap-2.5">
						{#each shortcutActions as action (action.id)}
							{@const shortcut = shortcuts[action.id]}
							<div>
								<span>{action.label}</span>
								<div class="shortcut-controls flex items-center gap-1.5">
									<button
										class="shortcut-capture flex items-center justify-end min-w-33 p-0.75 border-0 rounded-md bg-transparent text-muted cursor-pointer [font:inherit] text-ui-11 whitespace-nowrap [&_kbd]:min-w-6.75 [&_kbd]:py-1.25 [&_kbd]:px-1.75 [&_kbd]:text-ink-soft [&_kbd_+_kbd]:ml-0.75 [&:hover]:text-ink [&:hover]:outline-none [&:focus-visible]:text-ink [&:focus-visible]:outline-none [&.recording]:text-ink [&.recording]:outline-none [&:hover_kbd]:border-accent [&:focus-visible_kbd]:border-accent [&.placeholder]:justify-center [&.placeholder]:min-h-7.75 [&.placeholder]:py-1.25 [&.placeholder]:px-2 [&.placeholder]:border [&.placeholder]:border-line-strong [&.placeholder]:bg-chip"
										class:recording={recordingShortcut === action.id}
										class:placeholder={recordingShortcut === action.id || !shortcut}
										aria-label={`Change ${action.label} shortcut`}
										onclick={() => beginShortcutCapture(action.id)}
										onkeydown={(event) => recordingShortcut === action.id && captureShortcut(event, action.id)}
										onblur={() => { if (recordingShortcut === action.id) recordingShortcut = undefined; }}
									>
										{#if recordingShortcut === action.id}
											Press keys…
										{:else if shortcut}
											{#each shortcutParts(shortcut, primaryModifier) as part, index}
												{#if primaryModifier === 'control' && index > 0}<span class="shortcut-separator my-0 mx-1.25 text-muted text-ui-13 font-semibold">+</span>{/if}
												<kbd>{part}</kbd>
											{/each}
										{:else}
											Not set
										{/if}
									</button>
									<button class="shortcut-clear border-0 bg-transparent text-muted cursor-pointer text-ui-11 [&:hover]:text-ink [&:disabled]:[cursor:default] [&:disabled]:opacity-35" aria-label={`Clear ${action.label} shortcut`} disabled={!shortcut} onclick={() => clearShortcut(action.id)}>Clear</button>
								</div>
							</div>
						{/each}
					</div>
				{:else if section === 'github'}
					<h3>Backup and sync with GitHub</h3>
					<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Sign-in is optional. It enables private backups that you can restore on another device; your working vault stays on this device.</p>
					{#if connected && githubUser}
						<div class="settings-account flex items-center gap-3 p-3.25 border border-line-soft rounded-lg bg-surface [&_>_svg]:flex-none [&_>_svg]:text-faint [&_>_span]:flex-1 [&_>_span]:min-w-0 [&_strong]:block [&_strong]:text-ui-13 [&_strong]:[font-weight:650] [&_small]:block [&_small]:mt-0.5 [&_small]:text-muted [&_small]:text-ui-12 [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50">
							<span class="github-avatar [.github-account_&]:w-5.75 [.github-account_&]:h-5.75 [.github-account_&]:grid [.github-account_&]:flex-none [.github-account_&]:place-items-center [.github-account_&]:rounded-sm [.github-account_&]:bg-accent-bg-strong [.github-account_&]:text-accent-quiet [.github-account_&]:text-ui-11 [.github-account_&]:font-bold [.github-account_&]:uppercase [.settings-account_>_&]:w-9.5 [.settings-account_>_&]:h-9.5 [.settings-account_>_&]:grid [.settings-account_>_&]:flex-none [.settings-account_>_&]:place-items-center [.settings-account_>_&]:rounded-full [.settings-account_>_&]:bg-accent-bg-strong [.settings-account_>_&]:text-accent-quiet [.settings-account_>_&]:text-ui-16 [.settings-account_>_&]:font-bold [.settings-account_>_&]:uppercase" aria-hidden="true">{githubUser.login.slice(0, 1)}</span>
							<span><strong>{githubUser.name || githubUser.login}</strong><small>@{githubUser.login}</small></span>
						<button disabled={!isOnline} onclick={onDisconnectGithub}><LogOut size={14} /> Disconnect</button>
						</div>
						{#if githubBackup}
							<h3 class="settings-group-heading [.settings-panel_h3&]:mt-7 [.settings-panel_h3&]:mx-0 [.settings-panel_h3&]:mb-2">Sync status</h3>
              <BackupEncryptionSettings enabled={Boolean(githubBackup.encryption)} busy={backupState === "backing-up"} onConfigure={onConfigureEncryption} />
							<dl class="settings-facts mt-0 mx-0 mb-3.5 border border-line-soft rounded-lg bg-surface [&_>_div]:flex [&_>_div]:items-center [&_>_div]:justify-between [&_>_div]:gap-3 [&_>_div]:py-2.5 [&_>_div]:px-3.25 [&_>_div]:[border-bottom:1px_solid_var(--line-soft)] [&_>_div]:text-ui-12 [&_>_div:last-child]:border-0 [&_dt]:text-muted [&_dd]:m-0 [&_dd]:text-ink [&_dd]:font-semibold [&_dd]:text-right [&_dd]:[overflow-wrap:anywhere]">
								<div><dt>Repository</dt><dd>{githubBackup.owner}/{githubBackup.repository}</dd></div>
								<div><dt>GitHub account</dt><dd>@{githubBackup.githubAccountLogin || 'Needs re-selection'}</dd></div>
								<div><dt>Branch</dt><dd>{githubBackup.branch}</dd></div>
								<div><dt>Directory</dt><dd>{githubBackup.directory || 'repository root'}</dd></div>
								<div><dt>Last backup</dt><dd>{formatDate(githubBackup.lastBackedUpAt)}</dd></div>
								<div><dt>Last commit</dt><dd>{githubBackup.lastCommitSha ? githubBackup.lastCommitSha.slice(0, 7) : 'None yet'}</dd></div>
								<div><dt>Pending changes</dt><dd>{pendingBackupCount === 0 ? 'Up to date' : `${pendingBackupCount} ${pendingBackupCount === 1 ? 'change' : 'changes'}`}</dd></div>
							</dl>
							<label class="settings-toggle grid [align-items:start] gap-2.5 mt-3 text-ink text-ui-13 cursor-pointer [grid-template-columns:auto_minmax(0,_1fr)] [&_input]:[accent-color:var(--accent)] [&_input]:mt-0.75 [&_input]:mx-0 [&_input]:mb-0 [&_input]:cursor-pointer [&_span]:grid [&_span]:gap-0.5 [&_strong]:text-ink [&_strong]:text-ui-13 [&_strong]:font-semibold [&_small]:text-ink-soft [&_small]:text-ui-12">
								<input type="checkbox" checked={githubBackup.autoBackup === true} disabled={!vault} onchange={(event) => onAutoBackupChange(event.currentTarget.checked)} />
								<span><strong>Back up automatically</strong><small>Commits pending changes two minutes after editing stops, whenever this device is online.</small></span>
							</label>
						{/if}
						<div class="settings-actions [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex flex-wrap gap-2 mt-1 [.settings-storage-option_>_&]:mt-0">
							<button class="settings-primary h-8 inline-flex items-center justify-center gap-1.5 py-0 px-2.75 border border-line rounded-md bg-accent [color:#fff] cursor-pointer text-ui-12 no-underline whitespace-nowrap border-accent-strong [&:hover]:bg-accent-strong [&:hover]:[color:#fff] [&:disabled]:cursor-not-allowed [&:disabled]:opacity-50 [&.disabled]:cursor-not-allowed [&.disabled]:opacity-50 [&.disabled]:pointer-events-none" disabled={!isOnline || !vault || backupState === 'backing-up'} onclick={onBackup}>
								{#if backupState === 'backing-up'}<LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={14} />{:else}<CloudUpload size={14} />{/if} Back up now
							</button>
							<button disabled={!isOnline || !vault} onclick={onRestore}><CloudDownload size={14} /> Restore a commit</button>
						</div>
						{#if backupMessage}
							<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11 [.settings-hint&.error]:[color:var(--danger)]" class:error={backupState === 'error'}>
								{backupMessage}
								{#if backupCommitUrl}<a href={backupCommitUrl} target="_blank" rel="noreferrer">View commit <ExternalLink size={12} /></a>{/if}
							</p>
						{/if}
						<h3 class="settings-group-heading [.settings-panel_h3&]:mt-7 [.settings-panel_h3&]:mx-0 [.settings-panel_h3&]:mb-2">Sync repository</h3>
						<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">“{vaultName}” backs up on its own. Only private repositories with write access can be used, and notes are written under the directory below.</p>
						<div class="settings-field mb-3.25 [&_label]:block [&_label]:mb-1.5 [&_label]:text-ink-soft [&_label]:text-ui-12 [&_label]:font-semibold [&_input]:w-full [&_input]:h-9 [&_input]:py-0 [&_input]:px-2.25 [&_input]:border [&_input]:border-line [&_input]:rounded-md [&_input]:bg-surface [&_input]:text-ink [&_input]:text-ui-13 [&_select]:w-full [&_select]:h-9 [&_select]:py-0 [&_select]:px-2.25 [&_select]:border [&_select]:border-line [&_select]:rounded-md [&_select]:bg-surface [&_select]:text-ink [&_select]:text-ui-13">
							<label for="settings-repository">Repository</label>
							<div class="settings-row flex items-center gap-2 [&_input]:flex-1 [&_input]:min-w-0 [&_button]:[flex:none] [@media((max-width:_700px))]:flex-wrap!">
								<select id="settings-repository" bind:value={selectedRepository} disabled={repositoryState === 'loading' || repositories.length === 0}>
									<option value="" disabled>Select a repository</option>
									{#each repositories as repository (`${repository.owner}/${repository.name}`)}
										<option value={`${repository.owner}/${repository.name}`}>{repository.owner}/{repository.name}</option>
									{/each}
								</select>
								<button class="settings-ghost h-8 inline-flex items-center justify-center gap-1.5 p-0 border border-line rounded-md bg-surface-soft text-ink-soft cursor-pointer text-ui-12 no-underline whitespace-nowrap flex-none w-8.5 [&:hover]:border-line-hover [&:hover]:text-ink [&:disabled]:cursor-not-allowed [&:disabled]:opacity-50" aria-label="Reload repositories" disabled={!isOnline || repositoryState === 'loading'} onclick={() => void loadRepositories()}>
									{#if repositoryState === 'loading'}<LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={14} />{:else}<RefreshCw size={14} />{/if}
								</button>
							</div>
						</div>
						<div class="settings-grid grid [grid-template-columns:1fr_1fr] gap-3 [@media((max-width:_700px))]:[grid-template-columns:minmax(0,_1fr)]!">
							<div class="settings-field mb-3.25 [&_label]:block [&_label]:mb-1.5 [&_label]:text-ink-soft [&_label]:text-ui-12 [&_label]:font-semibold [&_input]:w-full [&_input]:h-9 [&_input]:py-0 [&_input]:px-2.25 [&_input]:border [&_input]:border-line [&_input]:rounded-md [&_input]:bg-surface [&_input]:text-ink [&_input]:text-ui-13 [&_select]:w-full [&_select]:h-9 [&_select]:py-0 [&_select]:px-2.25 [&_select]:border [&_select]:border-line [&_select]:rounded-md [&_select]:bg-surface [&_select]:text-ink [&_select]:text-ui-13"><label for="settings-branch">Branch</label><input id="settings-branch" bind:value={branch} autocomplete="off" /></div>
							<div class="settings-field mb-3.25 [&_label]:block [&_label]:mb-1.5 [&_label]:text-ink-soft [&_label]:text-ui-12 [&_label]:font-semibold [&_input]:w-full [&_input]:h-9 [&_input]:py-0 [&_input]:px-2.25 [&_input]:border [&_input]:border-line [&_input]:rounded-md [&_input]:bg-surface [&_input]:text-ink [&_input]:text-ui-13 [&_select]:w-full [&_select]:h-9 [&_select]:py-0 [&_select]:px-2.25 [&_select]:border [&_select]:border-line [&_select]:rounded-md [&_select]:bg-surface [&_select]:text-ink [&_select]:text-ui-13"><label for="settings-directory">Directory</label><input id="settings-directory" bind:value={directory} autocomplete="off" placeholder="vault" /></div>
						</div>
						{#if repositoryMessage}<p class="settings-hint error flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11 [.backup-notice&]:border-danger-border [.backup-notice&]:bg-danger-bg [.backup-notice&]:text-danger-strong [.settings-hint&]:text-danger [.restore-placeholder&]:text-danger-strong">{repositoryMessage}</p>{/if}
						<div class="settings-actions [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex flex-wrap gap-2 mt-1 [.settings-storage-option_>_&]:mt-0">
							<button class="settings-primary h-8 inline-flex items-center justify-center gap-1.5 py-0 px-2.75 border border-line rounded-md bg-accent [color:#fff] cursor-pointer text-ui-12 no-underline whitespace-nowrap border-accent-strong [&:hover]:bg-accent-strong [&:hover]:[color:#fff] [&:disabled]:cursor-not-allowed [&:disabled]:opacity-50 [&.disabled]:cursor-not-allowed [&.disabled]:opacity-50 [&.disabled]:pointer-events-none" disabled={!isOnline || !selectedRepository || applyingRepository} onclick={applyRepository}>Use this repository</button>
						</div>
                        <p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Create a private repository on <a href="https://github.com/new" target="_blank" rel="noreferrer">GitHub</a>, then <a href="/api/github/install" target="_blank" rel="noreferrer">install the Onyx GitHub App</a> on it, or update your <a href="https://github.com/settings/installations" target="_blank" rel="noreferrer">GitHub App installations</a> and reload repositories. Onyx only needs contents access; it cannot create repositories.</p>
					{:else}
						<div class="settings-account empty flex items-center gap-3 p-3.25 border border-line-soft rounded-lg bg-surface [&_>_svg]:flex-none [&_>_svg]:text-faint [&_>_span]:flex-1 [&_>_span]:min-w-0 [&_strong]:block [&_strong]:text-ui-13 [&_strong]:[font-weight:650] [&_small]:block [&_small]:mt-0.5 [&_small]:text-muted [&_small]:text-ui-12 [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50">
							<CloudOff size={22} />
							<span><strong>Local only</strong><small>{githubMessage || 'Sign in with the Onyx GitHub App to enable backup. If you used the old sign-in, authorize the App and install it on your existing backup repository. Your saved repository, notes and backup history are kept.'}</small></span>
							<button class="settings-primary h-8 inline-flex items-center justify-center gap-1.5 py-0 px-2.75 border border-line rounded-md bg-accent [color:#fff] cursor-pointer text-ui-12 no-underline whitespace-nowrap border-accent-strong [&:hover]:bg-accent-strong [&:hover]:[color:#fff] [&:disabled]:cursor-not-allowed [&:disabled]:opacity-50 [&.disabled]:cursor-not-allowed [&.disabled]:opacity-50 [&.disabled]:pointer-events-none" disabled={!isOnline || githubState === 'loading'} onclick={onConnectGithub}>
								{#if githubState === 'loading'}<LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={14} />{:else}<GithubIcon size={14} />{/if} Sign in with GitHub
							</button>
						</div>
					{/if}
				{:else if section === 'storage'}
					<h3>Storage choices</h3>
					<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Onyx always keeps a working vault on this device. Add a folder for accessible local files or GitHub for an off-device backup you can restore elsewhere.</p>
					{#if usageState === 'loading' && !usage}
						<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11"><LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={14} /> Measuring vault storage…</p>
					{:else if usage}
						<div class="settings-meter h-2 overflow-hidden mb-2.5 rounded-3xl bg-line-soft [&_>_div]:h-full [&_>_div]:rounded-3xl [&_>_div]:bg-accent" aria-label="Browser storage used">
							<div style={`width: ${Math.max(2, Math.round(usedFraction * 100))}%`}></div>
						</div>
						<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">{formatBytes(usage.usage)} used{usage.quota ? ` of about ${formatBytes(usage.quota)} available to this site` : ''}.</p>
						<dl class="settings-facts mt-0 mx-0 mb-3.5 border border-line-soft rounded-lg bg-surface [&_>_div]:flex [&_>_div]:items-center [&_>_div]:justify-between [&_>_div]:gap-3 [&_>_div]:py-2.5 [&_>_div]:px-3.25 [&_>_div]:[border-bottom:1px_solid_var(--line-soft)] [&_>_div]:text-ui-12 [&_>_div:last-child]:border-0 [&_dt]:text-muted [&_dd]:m-0 [&_dd]:text-ink [&_dd]:font-semibold [&_dd]:text-right [&_dd]:[overflow-wrap:anywhere]">
							<div><dt>Notes</dt><dd>{usage.noteCount} · {formatBytes(usage.noteBytes)}</dd></div>
							<div><dt>Attachments</dt><dd>{usage.attachmentCount} · {formatBytes(usage.attachmentBytes)}</dd></div>
							<div><dt>Persistent storage</dt><dd>{usage.persistent ? 'Granted' : usage.persistentStorageAvailable ? 'Not granted' : 'Unavailable in this browser'}</dd></div>
							<div><dt>File storage</dt><dd>{usage.fileStorage.mode === 'native-directory' ? usage.fileStorage.nativeDirectoryName : 'Private browser storage (OPFS)'}</dd></div>
						</dl>
						<section class="settings-storage-option grid [gap:0.75rem] [margin-top:1rem] [padding:1rem] border border-line [border-radius:0.75rem] [&_>_div:first-child]:flex [&_>_div:first-child]:[gap:0.75rem] [&_>_div:first-child]:items-start [&_span]:block [&_strong]:block [&_strong]:text-ink [&_strong]:text-ui-13 [&_strong]:font-semibold [&_small]:block [&_small]:[margin-top:0.2rem] [&_small]:text-muted [&_small]:text-ui-12 [&_button]:[justify-self:start]">
							<div><Database size={18} /><span><strong>Private browser storage</strong><small>The default for every vault. It works offline and does not need an account.</small></span></div>
							<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">{usage.persistent ? 'This browser has granted protection from automatic storage cleanup.' : usage.persistentStorageAvailable ? 'The browser may remove this data when space is low unless persistent storage is granted.' : 'This browser cannot protect the vault from automatic storage cleanup.'}</p>
							{#if !usage.persistent && usage.persistentStorageAvailable}
								<div class="settings-actions [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex flex-wrap gap-2 mt-1 [.settings-storage-option_>_&]:mt-0"><button class="settings-primary h-8 inline-flex items-center justify-center gap-1.5 py-0 px-2.75 border border-line rounded-md bg-accent [color:#fff] cursor-pointer text-ui-12 no-underline whitespace-nowrap border-accent-strong [&:hover]:bg-accent-strong [&:hover]:[color:#fff] [&:disabled]:cursor-not-allowed [&:disabled]:opacity-50 [&.disabled]:cursor-not-allowed [&.disabled]:opacity-50 [&.disabled]:pointer-events-none" disabled={persistState === 'requesting'} onclick={() => void requestPersistence()}><ShieldCheck size={14} /> Request persistent storage</button></div>
							{/if}
						</section>
						<section class="settings-storage-option grid [gap:0.75rem] [margin-top:1rem] [padding:1rem] border border-line [border-radius:0.75rem] [&_>_div:first-child]:flex [&_>_div:first-child]:[gap:0.75rem] [&_>_div:first-child]:items-start [&_span]:block [&_strong]:block [&_strong]:text-ink [&_strong]:text-ui-13 [&_strong]:font-semibold [&_small]:block [&_small]:[margin-top:0.2rem] [&_small]:text-muted [&_small]:text-ui-12 [&_button]:[justify-self:start]">
							<div><HardDrive size={18} /><span><strong>User-selected folder</strong><small>OPFS remains the fallback. Onyx mirrors notes and attachments into a folder you choose.</small></span></div>
							{#if usage.fileStorage.nativeDirectoryAvailable}
								{#if usage.fileStorage.nativeDirectoryPermission === 'granted'}
									<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Connected to <strong>{usage.fileStorage.nativeDirectoryName}</strong>. Disconnecting leaves its files in place and continues in OPFS.</p>
									<div class="settings-actions [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex flex-wrap gap-2 mt-1 [.settings-storage-option_>_&]:mt-0"><button disabled={nativeStorageState !== 'idle'} onclick={() => void disconnectNativeDirectory()}>Disconnect folder</button></div>
								{:else}
									<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">{usage.fileStorage.nativeDirectoryName ? usage.fileStorage.nativeDirectoryPermission === 'error' ? `${usage.fileStorage.nativeDirectoryName} could not be updated. Onyx continues in OPFS; reconnect the folder to try again.` : `Access to ${usage.fileStorage.nativeDirectoryName} needs permission again. Until then, Onyx continues in OPFS.` : 'Choose a dedicated folder to keep accessible copies of this vault on your device.'}</p>
									<div class="settings-actions [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex flex-wrap gap-2 mt-1 [.settings-storage-option_>_&]:mt-0"><button class="settings-primary h-8 inline-flex items-center justify-center gap-1.5 py-0 px-2.75 border border-line rounded-md bg-accent [color:#fff] cursor-pointer text-ui-12 no-underline whitespace-nowrap border-accent-strong [&:hover]:bg-accent-strong [&:hover]:[color:#fff] [&:disabled]:cursor-not-allowed [&:disabled]:opacity-50 [&.disabled]:cursor-not-allowed [&.disabled]:opacity-50 [&.disabled]:pointer-events-none" disabled={nativeStorageState !== 'idle'} onclick={() => void connectNativeDirectory()}>{nativeStorageState === 'connecting' ? 'Connecting…' : usage.fileStorage.nativeDirectoryName ? 'Reconnect folder' : 'Choose folder'}</button></div>
								{/if}
							{:else}
								<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">This browser does not expose a persistent user-selected folder. Use OPFS with Import & export or upload/download workflows.</p>
							{/if}
						</section>
						<section class="settings-storage-option grid [gap:0.75rem] [margin-top:1rem] [padding:1rem] border border-line [border-radius:0.75rem] [&_>_div:first-child]:flex [&_>_div:first-child]:[gap:0.75rem] [&_>_div:first-child]:items-start [&_span]:block [&_strong]:block [&_strong]:text-ink [&_strong]:text-ui-13 [&_strong]:font-semibold [&_small]:block [&_small]:[margin-top:0.2rem] [&_small]:text-muted [&_small]:text-ui-12 [&_button]:[justify-self:start]">
							<div><CloudUpload size={18} /><span><strong>GitHub backup and sync</strong><small>Optional off-device history for restoring this vault on another device.</small></span></div>
							<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">{connected ? githubBackup ? `Backing up to ${githubBackup.owner}/${githubBackup.repository}.` : 'Signed in. Choose a private repository to finish setup.' : 'Not enabled. Your local vault continues to work normally.'}</p>
							<div class="settings-actions [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex flex-wrap gap-2 mt-1 [.settings-storage-option_>_&]:mt-0"><button onclick={() => (section = 'github')}>{connected ? 'View backup & sync' : 'Learn about GitHub sync'}</button></div>
						</section>
						<div class="settings-actions [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex flex-wrap gap-2 mt-1 [.settings-storage-option_>_&]:mt-0">
							<button disabled={usageState === 'loading'} onclick={() => void loadUsage()}><RefreshCw size={14} /> Refresh</button>
						</div>
					{/if}
					{#if usageMessage}<p class="settings-hint error flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11 [.backup-notice&]:border-danger-border [.backup-notice&]:bg-danger-bg [.backup-notice&]:text-danger-strong [.settings-hint&]:text-danger [.restore-placeholder&]:text-danger-strong">{usageMessage}</p>{/if}
				{:else if section === 'transfer'}
					<h3>Import & export</h3>
					<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">Existing notes stay in your vault. Imported paths are retained for the next folder or ZIP export.</p>
					<div class="transfer-options [.settings-panel_&]:p-0 grid gap-2.5 py-4.5 px-5.5 [&_section]:flex [&_section]:items-center [&_section]:gap-3 [&_section]:p-3 [&_section]:border [&_section]:border-line-soft [&_section]:rounded-lg [&_section]:bg-surface [&_section_>_svg]:flex-none [&_section_>_svg]:text-accent [&_section_>_div]:min-w-0 [&_section_>_div]:flex [&_section_>_div]:items-center [&_section_>_div]:gap-3 [&_section_>_div]:flex-1 [&_section_span]:block [&_strong]:block [&_strong]:text-ink [&_strong]:text-ui-13 [&_strong]:[font-weight:650] [&_small]:block [&_small]:mt-0.75 [&_small]:text-muted [&_small]:text-ui-12 [&_small]:[line-height:1.4] [&_button]:flex-none [&_button]:h-8 [&_button]:py-0 [&_button]:px-2.5 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-55">
						<section><div><FolderInput size={20} /><span><strong>Import folder</strong><small>Add every Markdown file and its attachments.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={onImportFolder}>Choose folder</button></section>
						<section><div><FileArchive size={20} /><span><strong>Import ZIP</strong><small>Unpack a Markdown archive without flattening paths.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={onImportZip}>Choose ZIP</button></section>
						<section><div><FolderOutput size={20} /><span><strong>Export folder</strong><small>Write notes and attachments into their original folders.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={onExportFolder}>Choose folder</button></section>
						<section><div><Download size={20} /><span><strong>Export ZIP</strong><small>Download a portable archive of the entire vault.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={onExportZip}>Download ZIP</button></section>
					</div>
				{:else}
					<h3>Vault management</h3>
					<div class="settings-danger [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex items-center gap-3 mb-2.5 p-3.25 border border-line-soft rounded-lg bg-surface [&_>_div]:flex-1 [&_>_div]:min-w-0 [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-2.75 [&_svg]:flex-none [&_svg]:text-faint [&_strong]:block [&_strong]:text-ui-13 [&_strong]:[font-weight:650] [&_small]:block [&_small]:mt-0.75 [&_small]:text-muted [&_small]:text-ui-12 [&_small]:[line-height:1.45]">
						<div><Database size={18} /><span><strong>Forget the backup repository</strong><small>Onyx stops targeting {githubBackup ? `${githubBackup.owner}/${githubBackup.repository}` : 'any repository'}. Nothing on GitHub is deleted.</small></span></div>
						<button disabled={!githubBackup} onclick={onForgetRepository}>Forget</button>
					</div>
					<div class="settings-danger critical [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex items-center gap-3 mb-2.5 p-3.25 border border-line-soft rounded-lg bg-surface [&_>_div]:flex-1 [&_>_div]:min-w-0 [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-2.75 [&_svg]:flex-none [&_svg]:text-faint [&_strong]:block [&_strong]:text-ui-13 [&_strong]:[font-weight:650] [&_small]:block [&_small]:mt-0.75 [&_small]:text-muted [&_small]:text-ui-12 [&_small]:[line-height:1.45] [.settings-danger&]:border-danger-border [.settings-danger&]:bg-danger-bg [.settings-danger&_svg]:text-accent-strong">
						<div><TriangleAlert size={18} /><span><strong>Delete every note on this device</strong><small>Notes and attachments are removed from this browser. A GitHub backup, if configured, keeps its history until the next backup.</small></span></div>
						<button class="danger [.file-context-menu_button&]:text-danger [.file-context-menu_button&:hover:not(:disabled)]:bg-danger-bg [.file-context-menu_button&:hover:not(:disabled)]:text-danger [.trash-icon-button&:hover:not(:disabled)]:bg-danger-bg [.trash-icon-button&:hover:not(:disabled)]:text-danger [.settings-danger_button&]:border-danger-border [.settings-danger_button&]:bg-surface [.settings-danger_button&]:text-danger [.settings-danger_button&:hover]:border-accent-strong [.settings-danger_button&:hover]:text-danger-strong [.modal-actions_button&]:border-danger-solid [.modal-actions_button&]:bg-danger-solid [.modal-actions_button&]:[color:#fff]" disabled={!vault || clearState === 'preparing' || clearState === 'clearing'} onclick={() => void clearVault()}>
							{#if clearState === 'preparing' || clearState === 'clearing'}<LoaderCircle class="spin [animation:spin_0.9s_linear_infinite]" size={14} />{:else}<Trash2 size={14} />{/if}
							{clearState === 'preparing' ? 'Checking changes…' : clearState === 'confirming' ? 'Click to confirm' : 'Delete all notes'}
						</button>
					</div>
					{#if clearState === 'confirming'}<p class="settings-hint flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11">{pendingBackupCount > 0 ? `${pendingBackupCount} pending ${pendingBackupCount === 1 ? 'change has' : 'changes have'} not been backed up to GitHub. ` : ''}This cannot be undone. Export a ZIP first if you want a copy.</p>{/if}
					{#if clearMessage}<p class="settings-hint error flex items-center gap-1.5 flex-wrap mt-0 mx-0 mb-3.5 text-muted text-ui-12 [line-height:1.55] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent [&_kbd]:py-0.5 [&_kbd]:px-1.25 [&_kbd]:border [&_kbd]:border-line [&_kbd]:rounded-sm [&_kbd]:bg-surface [&_kbd]:text-muted [&_kbd]:text-ui-11 [.backup-notice&]:border-danger-border [.backup-notice&]:bg-danger-bg [.backup-notice&]:text-danger-strong [.settings-hint&]:text-danger [.restore-placeholder&]:text-danger-strong">{clearMessage}</p>{/if}
					<div class="settings-danger [&_button]:h-8 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-2.75 [&_button]:border [&_button]:border-line [&_button]:rounded-md [&_button]:bg-surface-soft [&_button]:text-ink-soft [&_button]:cursor-pointer [&_button]:text-ui-12 [&_button]:no-underline [&_button]:whitespace-nowrap [&_button:hover]:border-line-hover [&_button:hover]:text-ink [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 flex items-center gap-3 mb-2.5 p-3.25 border border-line-soft rounded-lg bg-surface [&_>_div]:flex-1 [&_>_div]:min-w-0 [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-2.75 [&_svg]:flex-none [&_svg]:text-faint [&_strong]:block [&_strong]:text-ui-13 [&_strong]:[font-weight:650] [&_small]:block [&_small]:mt-0.75 [&_small]:text-muted [&_small]:text-ui-12 [&_small]:[line-height:1.45]">
						<div><HardDrive size={18} /><span><strong>Local-first by design</strong><small>Everything above happens on this device. Onyx never uploads notes anywhere except the repository you choose.</small></span></div>
					</div>
				{/if}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
