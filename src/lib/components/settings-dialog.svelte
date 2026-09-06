<script module lang="ts">
	export type SettingsSection =
		| 'editor'
		| 'appearance'
		| 'github'
		| 'repository'
		| 'backup'
		| 'storage'
		| 'transfer'
		| 'vault';
	export type InlinePreviewBehavior = 'rendered' | 'source-line';
</script>

<script lang="ts">
	import {
		CloudDownload, CloudOff, CloudUpload, Database, Download, ExternalLink, FileArchive, FolderInput,
		FolderOutput, HardDrive, LoaderCircle, LogOut, Monitor, Moon, RefreshCw, ShieldCheck, Sun, Trash2,
		TriangleAlert, WifiOff, X
	} from '@lucide/svelte';
	import {
		listGithubRepositories, type GithubBackupState, type GithubRepository, type GithubUser,
		type ThemePreference, type Vault, type VaultStorageUsage
	} from '$lib';
	import { manageModalFocus } from '$lib/modal-focus';

	interface Props {
		vault?: Vault;
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
		inlinePreviewBehavior: InlinePreviewBehavior;
		section?: SettingsSection;
		onThemeChange: (preference: ThemePreference) => void;
		onInlinePreviewBehaviorChange: (behavior: InlinePreviewBehavior) => void;
		onClose: () => void;
		onDisconnectGithub: () => void;
		onCreateRepository: (name: string) => void;
		onSelectRepository: (state: Omit<GithubBackupState, 'updatedAt'>) => void;
		onForgetRepository: () => void;
		onBackup: () => void;
		onRestore: () => void;
		onImportFolder: () => void;
		onImportZip: () => void;
		onExportFolder: () => void;
		onExportZip: () => void;
		onVaultCleared: () => void;
	}

	let {
		vault, isOnline, githubUser, githubState, githubMessage, githubBackup, pendingBackupCount,
		backupState, backupMessage, backupCommitUrl, transferState, theme, inlinePreviewBehavior,
		section = $bindable('github'), onThemeChange, onInlinePreviewBehaviorChange, onClose, onDisconnectGithub, onCreateRepository, onSelectRepository, onForgetRepository,
		onBackup, onRestore, onImportFolder, onImportZip, onExportFolder, onExportZip, onVaultCleared
	}: Props = $props();

	const sections: Array<{ id: SettingsSection; label: string }> = [
		{ id: 'editor', label: 'Editor' },
		{ id: 'appearance', label: 'Appearance' },
		{ id: 'github', label: 'GitHub account' },
		{ id: 'repository', label: 'Repository' },
		{ id: 'backup', label: 'Backup status' },
		{ id: 'storage', label: 'Storage' },
		{ id: 'transfer', label: 'Import & export' },
		{ id: 'vault', label: 'Vault' }
	];

	let repositories = $state<GithubRepository[]>([]);
	let repositoryState = $state<'idle' | 'loading' | 'error'>('idle');
	let repositoryMessage = $state('');
	let repositoriesLoaded = $state(false);
	let selectedRepository = $state('');
	let branch = $state('main');
	let directory = $state('vault');
	let newRepositoryName = $state('onyx-vault');
	let usage = $state<VaultStorageUsage>();
	let usageState = $state<'idle' | 'loading' | 'error'>('idle');
	let usageMessage = $state('');
	let persistState = $state<'idle' | 'requesting'>('idle');
	let clearState = $state<'idle' | 'confirming' | 'clearing' | 'error'>('idle');
	let clearMessage = $state('');

	const connected = $derived(githubState === 'connected' && Boolean(githubUser));
	const themes: Array<{ id: ThemePreference; label: string; hint: string; icon: typeof Sun }> = [
		{ id: 'light', label: 'Light', hint: 'Warm paper, best in bright rooms.', icon: Sun },
		{ id: 'dark', label: 'Dark', hint: 'Low-glare onyx for night writing.', icon: Moon },
		{ id: 'system', label: 'System', hint: 'Follow the operating system setting.', icon: Monitor }
	];
	const usedFraction = $derived(
		usage?.quota && usage.usage !== undefined ? Math.min(1, usage.usage / usage.quota) : 0
	);

	$effect(() => {
		if (section === 'repository' && connected && isOnline && !repositoriesLoaded) void loadRepositories();
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
		repositoryState = 'loading';
		repositoryMessage = '';
		try {
			repositories = await listGithubRepositories();
			repositoriesLoaded = true;
			repositoryState = 'idle';
			if (repositories.length === 0) repositoryMessage = 'No repositories with write access were found.';
		} catch (error) {
			repositoryState = 'error';
			repositoryMessage = error instanceof Error ? error.message : 'Repositories could not be loaded.';
		}
	}

	async function loadUsage(): Promise<void> {
		if (!vault) return;
		usageState = 'loading';
		usageMessage = '';
		try {
			usage = await vault.getStorageUsage();
			usageState = 'idle';
		} catch (error) {
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
			if (!granted) usageMessage = 'Persistent storage was not granted. Your vault still works, but the browser may remove it when space is low.';
		} finally {
			persistState = 'idle';
		}
	}

	function applyRepository(): void {
		const repository = repositories.find((item) => `${item.owner}/${item.name}` === selectedRepository);
		if (!repository) return;
		onSelectRepository({
			githubAccountId: githubUser!.id,
			githubAccountLogin: githubUser!.login,
			owner: repository.owner,
			repository: repository.name,
			branch: branch.trim() || repository.branch,
			directory: directory.trim().replace(/^\/+|\/+$/g, '')
		});
	}

	async function clearVault(): Promise<void> {
		if (!vault) return;
		if (clearState !== 'confirming') {
			clearState = 'confirming';
			return;
		}
		clearState = 'clearing';
		clearMessage = '';
		try {
			await vault.clear();
			clearState = 'idle';
			usage = undefined;
			onVaultCleared();
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
</script>

<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget && clearState !== 'clearing') onClose(); }}>
	<div id="settings-dialog" class="shortcut-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1" use:manageModalFocus>
		<div class="modal-title">
			<div><span>Preferences</span><h2 id="settings-title">Settings</h2></div>
			<button class="icon-button" aria-label="Close settings" onclick={onClose}><X size={18} /></button>
		</div>

		<div class="settings-body">
			<nav class="settings-nav" aria-label="Settings sections">
				{#each sections as item (item.id)}
					<button class:active={section === item.id} aria-current={section === item.id ? 'page' : undefined} onclick={() => (section = item.id)}>{item.label}</button>
				{/each}
			</nav>

			<div class="settings-panel">
				{#if !isOnline && section !== 'editor' && section !== 'appearance' && section !== 'storage' && section !== 'transfer' && section !== 'vault'}
					<div class="settings-banner"><WifiOff size={15} /><span>GitHub settings are paused until your connection returns.</span></div>
				{/if}

				{#if section === 'editor'}
					<h3>Editor</h3>
					<p class="settings-hint">Choose how Markdown behaves while you write in inline preview. This preference is remembered in this browser.</p>
					<div class="preview-behavior-options" role="radiogroup" aria-label="Inline preview behavior">
						<button class:active={inlinePreviewBehavior === 'rendered'} role="radio" aria-checked={inlinePreviewBehavior === 'rendered'} onclick={() => onInlinePreviewBehaviorChange('rendered')}>
							<strong>Rendered editing</strong>
							<small>Keep the active line formatted and hide recognized Markdown markers as you type.</small>
						</button>
						<button class:active={inlinePreviewBehavior === 'source-line'} role="radio" aria-checked={inlinePreviewBehavior === 'source-line'} onclick={() => onInlinePreviewBehaviorChange('source-line')}>
							<strong>Reveal source line</strong>
							<small>Show the raw Markdown for the active line while the rest stays rendered.</small>
						</button>
					</div>
				{:else if section === 'appearance'}
					<h3>Appearance</h3>
					<p class="settings-hint">The theme applies to this browser and is remembered between visits. Press <kbd>⌘ ⇧ L</kbd> to cycle it from anywhere.</p>
					<div class="theme-options" role="radiogroup" aria-label="Theme">
						{#each themes as option (option.id)}
							<button class:active={theme === option.id} role="radio" aria-checked={theme === option.id} onclick={() => onThemeChange(option.id)}>
								<option.icon size={18} />
								{option.label}
								<small>{option.hint}</small>
							</button>
						{/each}
					</div>
				{:else if section === 'github'}
					<h3>GitHub account</h3>
					<p class="settings-hint">Onyx signs in with a GitHub App so backups go straight from this device to your repository.</p>
					{#if connected && githubUser}
						<div class="settings-account">
							<img src={githubUser.avatarUrl} alt="" />
							<span><strong>{githubUser.name || githubUser.login}</strong><small>@{githubUser.login}</small></span>
							<button disabled={!isOnline} onclick={onDisconnectGithub}><LogOut size={14} /> Disconnect</button>
						</div>
					{:else}
						<div class="settings-account empty">
							<CloudOff size={22} />
							<span><strong>Not connected</strong><small>{githubMessage || 'Connect GitHub to back up and restore this vault.'}</small></span>
							<a class="settings-primary" class:disabled={!isOnline} href="/auth/github/start">
								{#if githubState === 'loading'}<LoaderCircle class="spin" size={14} />{:else}<CloudUpload size={14} />{/if} Connect GitHub
							</a>
						</div>
					{/if}
				{:else if section === 'repository'}
					<h3>Backup repository</h3>
					{#if !connected}
						<p class="settings-hint">Connect GitHub first to choose a repository.</p>
					{:else}
						<p class="settings-hint">Only private repositories with write access can be used. Notes are written under the directory below.</p>
						<div class="settings-field">
							<label for="settings-repository">Repository</label>
							<div class="settings-row">
								<select id="settings-repository" bind:value={selectedRepository} disabled={repositoryState === 'loading' || repositories.length === 0}>
									<option value="" disabled>Select a repository</option>
									{#each repositories as repository (`${repository.owner}/${repository.name}`)}
										<option value={`${repository.owner}/${repository.name}`}>{repository.owner}/{repository.name}</option>
									{/each}
								</select>
								<button class="settings-ghost" aria-label="Reload repositories" disabled={!isOnline || repositoryState === 'loading'} onclick={() => void loadRepositories()}>
									{#if repositoryState === 'loading'}<LoaderCircle class="spin" size={14} />{:else}<RefreshCw size={14} />{/if}
								</button>
							</div>
						</div>
						<div class="settings-grid">
							<div class="settings-field"><label for="settings-branch">Branch</label><input id="settings-branch" bind:value={branch} autocomplete="off" /></div>
							<div class="settings-field"><label for="settings-directory">Directory</label><input id="settings-directory" bind:value={directory} autocomplete="off" placeholder="vault" /></div>
						</div>
						{#if repositoryMessage}<p class="settings-hint error">{repositoryMessage}</p>{/if}
						<div class="settings-actions">
							<button class="settings-primary" disabled={!isOnline || !selectedRepository} onclick={applyRepository}>Use this repository</button>
						</div>
						<div class="settings-separator"><span>or create a new one</span></div>
						<div class="settings-field">
							<label for="settings-new-repository">New private repository</label>
							<div class="settings-row">
								<div class="repository-field"><span>{githubUser?.login}/</span><input id="settings-new-repository" bind:value={newRepositoryName} pattern="[A-Za-z0-9._-]+" autocomplete="off" /></div>
								<button class="settings-primary" disabled={!isOnline || !newRepositoryName.trim()} onclick={() => onCreateRepository(newRepositoryName)}>Create and back up</button>
							</div>
						</div>
					{/if}
				{:else if section === 'backup'}
					<h3>Backup status</h3>
					{#if !githubBackup}
						<p class="settings-hint">No repository is configured yet. Choose one in the Repository section to enable backups.</p>
					{:else}
						<dl class="settings-facts">
							<div><dt>Repository</dt><dd>{githubBackup.owner}/{githubBackup.repository}</dd></div>
							<div><dt>GitHub account</dt><dd>@{githubBackup.githubAccountLogin || 'Needs re-selection'}</dd></div>
							<div><dt>Branch</dt><dd>{githubBackup.branch}</dd></div>
							<div><dt>Directory</dt><dd>{githubBackup.directory || 'repository root'}</dd></div>
							<div><dt>Last backup</dt><dd>{formatDate(githubBackup.lastBackedUpAt)}</dd></div>
							<div><dt>Last commit</dt><dd>{githubBackup.lastCommitSha ? githubBackup.lastCommitSha.slice(0, 7) : 'None yet'}</dd></div>
							<div><dt>Pending changes</dt><dd>{pendingBackupCount === 0 ? 'Up to date' : `${pendingBackupCount} ${pendingBackupCount === 1 ? 'change' : 'changes'}`}</dd></div>
						</dl>
					{/if}
					{#if backupMessage}
						<p class="settings-hint" class:error={backupState === 'error'}>
							{backupMessage}
							{#if backupCommitUrl}<a href={backupCommitUrl} target="_blank" rel="noreferrer">View commit <ExternalLink size={12} /></a>{/if}
						</p>
					{/if}
					<div class="settings-actions">
						<button class="settings-primary" disabled={!isOnline || !connected || !vault || backupState === 'backing-up'} onclick={onBackup}>
							{#if backupState === 'backing-up'}<LoaderCircle class="spin" size={14} />{:else}<CloudUpload size={14} />{/if} Back up now
						</button>
						<button disabled={!isOnline || !connected || !vault} onclick={onRestore}><CloudDownload size={14} /> Restore a commit</button>
					</div>
				{:else if section === 'storage'}
					<h3>Storage on this device</h3>
					{#if usageState === 'loading' && !usage}
						<p class="settings-hint"><LoaderCircle class="spin" size={14} /> Measuring vault storage…</p>
					{:else if usage}
						<div class="settings-meter" aria-label="Browser storage used">
							<div style={`width: ${Math.max(2, Math.round(usedFraction * 100))}%`}></div>
						</div>
						<p class="settings-hint">{formatBytes(usage.usage)} used{usage.quota ? ` of about ${formatBytes(usage.quota)} available to this site` : ''}.</p>
						<dl class="settings-facts">
							<div><dt>Notes</dt><dd>{usage.noteCount} · {formatBytes(usage.noteBytes)}</dd></div>
							<div><dt>Attachments</dt><dd>{usage.attachmentCount} · {formatBytes(usage.attachmentBytes)}</dd></div>
							<div><dt>Persistent storage</dt><dd>{usage.persistent ? 'Granted' : usage.persistentStorageAvailable ? 'Not granted' : 'Unavailable in this browser'}</dd></div>
						</dl>
						{#if !usage.persistent && usage.persistentStorageAvailable}
							<p class="settings-hint">Without persistent storage the browser may evict this vault when space runs low.</p>
						{:else if !usage.persistent}
							<p class="settings-hint">This browser cannot protect the vault from automatic storage cleanup. Keep a backup of important notes.</p>
						{/if}
						<div class="settings-actions">
							{#if !usage.persistent && usage.persistentStorageAvailable}
								<button class="settings-primary" disabled={persistState === 'requesting'} onclick={() => void requestPersistence()}><ShieldCheck size={14} /> Request persistent storage</button>
							{/if}
							<button disabled={usageState === 'loading'} onclick={() => void loadUsage()}><RefreshCw size={14} /> Refresh</button>
						</div>
					{/if}
					{#if usageMessage}<p class="settings-hint error">{usageMessage}</p>{/if}
				{:else if section === 'transfer'}
					<h3>Import & export</h3>
					<p class="settings-hint">Existing notes stay in your vault. Imported paths are retained for the next folder or ZIP export.</p>
					<div class="transfer-options">
						<section><div><FolderInput size={20} /><span><strong>Import folder</strong><small>Add every Markdown file and its attachments.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={onImportFolder}>Choose folder</button></section>
						<section><div><FileArchive size={20} /><span><strong>Import ZIP</strong><small>Unpack a Markdown archive without flattening paths.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={onImportZip}>Choose ZIP</button></section>
						<section><div><FolderOutput size={20} /><span><strong>Export folder</strong><small>Write notes and attachments into their original folders.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={onExportFolder}>Choose folder</button></section>
						<section><div><Download size={20} /><span><strong>Export ZIP</strong><small>Download a portable archive of the entire vault.</small></span></div><button disabled={!vault || transferState === 'working'} onclick={onExportZip}>Download ZIP</button></section>
					</div>
				{:else}
					<h3>Vault management</h3>
					<div class="settings-danger">
						<div><Database size={18} /><span><strong>Forget the backup repository</strong><small>Onyx stops targeting {githubBackup ? `${githubBackup.owner}/${githubBackup.repository}` : 'any repository'}. Nothing on GitHub is deleted.</small></span></div>
						<button disabled={!githubBackup} onclick={onForgetRepository}>Forget</button>
					</div>
					<div class="settings-danger critical">
						<div><TriangleAlert size={18} /><span><strong>Delete every note on this device</strong><small>Notes and attachments are removed from this browser. A GitHub backup, if configured, keeps its history until the next backup.</small></span></div>
						<button class="danger" disabled={!vault || clearState === 'clearing'} onclick={() => void clearVault()}>
							{#if clearState === 'clearing'}<LoaderCircle class="spin" size={14} />{:else}<Trash2 size={14} />{/if}
							{clearState === 'confirming' ? 'Click to confirm' : 'Delete all notes'}
						</button>
					</div>
					{#if clearState === 'confirming'}<p class="settings-hint">This cannot be undone. Export a ZIP first if you want a copy.</p>{/if}
					{#if clearMessage}<p class="settings-hint error">{clearMessage}</p>{/if}
					<div class="settings-danger">
						<div><HardDrive size={18} /><span><strong>Local-first by design</strong><small>Everything above happens on this device. Onyx never uploads notes anywhere except the repository you choose.</small></span></div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
