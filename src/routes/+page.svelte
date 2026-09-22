<script lang="ts">
	import MarkdownWorkspace from '$lib/components/markdown-workspace.svelte';
	import NotesSidebar from '$lib/components/notes-sidebar.svelte';
	import StatusNotices from '$lib/components/status-notices.svelte';
	import { createPageController } from './page-controller.svelte.js';

	const page = createPageController();
</script>

<svelte:head>
	<title>onyx - a quiet place to think in markdown</title>
	<meta name="description" content="A fast, local-first Markdown editor with full-text search that works offline." />
</svelte:head>

<div class="app" class:sidebar-open={page.sidebarOpen} class:sidebar-collapsed={page.sidebarCollapsed} class:sidebar-right={page.sidebarSide === 'right'} class:sidebar-dragging={page.sidebarDropSide !== undefined} class:palette-open={page.paletteOpen} inert={page.settingsOpen || page.restoreModalOpen}>
	<NotesSidebar
		vaults={page.vaults}
		activeVaultId={page.activeVaultId}
		activeNoteId={page.activeNoteId}
		results={page.results}
		visibleResults={page.visibleResults}
		folders={page.folders}
		attachments={page.vaultAttachments}
		attachmentFolder={page.attachmentFolder}
		attachmentsHidden={page.attachmentsHidden}
		onOpenAttachment={(id) => void page.openAttachment(id)}
		searchQuery={page.searchQuery}
		findOpen={page.findOpen}
		findQuery={page.findQuery}
		findReplacement={page.findReplacement}
		findMatchCase={page.findMatchCase}
		findWholeWord={page.findWholeWord}
		findMatchCount={page.findMatchCount}
		activeFindMatch={page.activeFindMatch}
		findCanEdit={page.findCanEdit}
		notePage={page.notePage}
		notePageCount={page.notePageCount}
		saveState={page.saveState}
		notesLoaded={page.notesLoaded}
		transferState={page.transferState}
		storageError={page.storageError}
		paletteOpen={page.paletteOpen}
		searchPending={page.searchPending}
		paletteItems={page.paletteItems}
		settingsOpen={page.settingsOpen}
		isOnline={page.isOnline}
		githubState={page.githubState}
		githubUser={page.githubUser}
		githubMessage={page.githubMessage}
		shortcuts={page.shortcuts}
		primaryModifier={page.primaryModifier}
		wordCount={page.wordCount}
		readingMinutes={page.readingMinutes}
		contentWidth={page.contentWidth}
		bind:searchInput={page.searchInput}
		bind:findInput={page.findInput}
		bind:findReplaceInput={page.findReplaceInput}
		bind:noteList={page.noteList}
		onToggleSidebar={page.toggleSidebar}
		onSidebarDragStart={page.startSidebarDrag}
		sidebarSide={page.sidebarSide}
		onSidebarSideChange={page.setSidebarSide}
		onSelectVault={(id) => void page.selectVault(id)}
		onCreateVault={() => void page.createVault()}
		onRenameVault={page.renameVault}
		onCreateNote={() => void page.createNote()}
		onCreateFile={(folder, name) => void page.createFile(folder, name)}
		onCreateFolder={(folder, name) => void page.createFolder(folder, name)}
		onDeleteAttachment={(id) => void page.deleteAttachment(id)}
		onRenameFile={(id, name) => void page.renameFile(id, name)}
		onRenameFolder={(path, name) => void page.renameFolder(path, name)}
		onMoveFile={(id, folder) => void page.moveFile(id, folder)}
		onMoveFolder={(path, parent) => void page.moveFolder(path, parent)}
		onDeleteFile={(id) => void page.deleteFile(id)}
		onDeleteFolder={(path) => void page.deleteFolder(path)}
		trashedNotes={page.trashedNotes}
		trashOpen={page.trashOpen}
		onToggleTrash={page.toggleTrash}
		onRestoreFile={(id) => void page.restoreFile(id)}
		onPurgeFile={(id) => void page.purgeFile(id)}
		onEmptyTrash={() => void page.emptyTrash()}
		onCopyFilePath={(path) => void page.copyFilePath(path)}
		onCopyFileAs={(id, format) => void page.copyNoteAs(id, format)}
		onExportFileAs={(id, format) => void page.exportNoteAs(id, format)}
		onSearch={page.queueSearch}
		onFindQueryChange={page.setFindQuery}
		onFindReplacementChange={page.setFindReplacement}
		onFindMatchCaseChange={page.setFindMatchCase}
		onFindWholeWordChange={page.setFindWholeWord}
		onFindPrevious={page.previousFindMatch}
		onFindNext={page.nextFindMatch}
		onFindReplace={page.replaceFind}
		onFindReplaceAll={page.replaceAllFind}
		onCloseFind={page.closeFind}
		onOpenPalette={page.openPalette}
		onClosePalette={page.closePalette}
		onOpenSettings={() => page.openSettings('editor')}
		onOpenStorageSettings={() => page.openSettings('storage')}
		onMoveNoteFocus={page.moveNoteFocus}
		onSelectNote={(id) => void page.selectNote(id)}
		onChangePage={page.changeNotePage}
		onContentWidthChange={page.setContentWidth}
	/>

	<MarkdownWorkspace
		storageNotice={page.storageNotice}
		storageError={page.storageError}
		sourcePaneVisible={page.sourcePaneVisible}
		renderedPaneVisible={page.renderedPaneVisible}
		paneLayout={page.paneLayout}
		paneOrder={page.paneOrder}
		renderedBlockLines={page.renderedBlockLines}
		scrollSync={page.scrollSync}
		markdown={page.markdown}
		markdownLines={page.markdownLines}
		findOpen={page.findOpen}
		findQuery={page.findQuery}
		findMatches={page.findMatches}
		activeFindMatch={page.activeFindMatch}
		saveState={page.saveState}
		transferState={page.transferState}
		hasContent={page.hasContent}
		renderedMarkdown={page.renderedMarkdown}
		shortcuts={page.shortcuts}
		primaryModifier={page.primaryModifier}
		bind:editor={page.editor}
		onRetryStorage={() => void (page.vault ? page.saveDraft() : page.openVault())}
		onDismissStorageNotice={page.dismissStorageNotice}
		onToggleSidebar={page.toggleSidebar}
		onSidebarDragStart={page.startSidebarDrag}
		splitRatio={page.splitRatio}
		contentWidth={page.contentWidth}
		onToggleSourcePane={page.toggleSourcePane}
		resolvedTheme={page.resolvedTheme}
		colorTheme={page.colorTheme}
		onToggleRenderedPane={page.toggleRenderedPane}
		onResize={page.setSplitRatio}
		onResizeEnd={page.saveSplitRatio}
		onPlacePane={page.placePane}
		onReload={() => location.reload()}
		onMarkdownChange={page.updateMarkdown}
		onEditorBeforeInput={page.handleEditorBeforeInput}
		onEditorCopy={page.handleEditorCopy}
		onEditorCut={page.handleEditorCut}
		onEditorPaste={page.handleEditorPaste}
		onEditorDragOver={page.handleEditorDragOver}
		onEditorDrop={page.handleEditorDrop}
	/>
	{#if page.sidebarDropSide}<div class="sidebar-drop-target" data-side={page.sidebarDropSide} aria-hidden="true"></div>{/if}
</div>

<div class="print-document paper-surface" aria-hidden="true"><article class="prose">{@html page.renderedMarkdown}</article></div>

<StatusNotices
	backupMessage={page.backupMessage}
	backupState={page.backupState}
	backupCommitUrl={page.backupCommitUrl}
	onDismissBackup={page.dismissBackupMessage}
/>

{#if page.settingsOpen}
	{#await import('$lib/components/settings-dialog.svelte') then { default: SettingsDialog }}
		<SettingsDialog
			vault={page.vault}
			vaultName={page.vaultName}
			suggestedRepositoryName={page.suggestedRepositoryName}
			isOnline={page.isOnline}
			githubUser={page.githubUser}
			githubState={page.githubState}
			githubMessage={page.githubMessage}
			githubBackup={page.githubBackup}
			pendingBackupCount={page.pendingBackupCount}
			backupState={page.backupState}
			backupMessage={page.backupMessage}
			backupCommitUrl={page.backupCommitUrl}
			transferState={page.transferState}
			theme={page.theme}
			resolvedTheme={page.resolvedTheme}
			colorTheme={page.colorTheme}
			fonts={page.fonts}
			fontCategories={page.fontCategories}
			attachmentFolder={page.attachmentFolder}
			attachmentsHidden={page.attachmentsHidden}
			onAttachmentsHiddenChange={page.setAttachmentsHidden}
			onRenameAttachmentFolder={page.renameAttachmentFolder}
			shortcuts={page.shortcuts}
			primaryModifier={page.primaryModifier}
			onThemeChange={page.setTheme}
			onColorThemeChange={page.setColorTheme}
			onFontChange={page.setFont}
			onFontCategoryChange={page.setFontCategory}
			onResetFonts={page.resetFonts}
			scrollSync={page.scrollSync}
			onToggleScrollSync={page.toggleScrollSync}
			onShortcutChange={page.setShortcut}
			onResetShortcuts={page.resetShortcuts}
			bind:section={page.settingsSection}
			onClose={page.closeSettings}
			onConnectGithub={() => void page.connectGitHub()}
			onDisconnectGithub={() => void page.disconnectGitHub()}
			onCreateRepository={(name) => void page.createBackupRepository(name)}
			onSelectRepository={(state) => void page.selectBackupRepository(state)}
			onForgetRepository={() => void page.forgetBackupRepository()}
			onBackup={() => void page.beginBackup()}
			onRestore={() => { page.settingsOpen = false; void page.openRestore(); }}
			onImportFolder={() => page.folderInput?.click()}
			onImportZip={() => page.zipInput?.click()}
			onExportFolder={() => void page.exportFolder()}
			onExportZip={() => void page.exportZip()}
			onPrepareVaultDeletion={page.prepareVaultDeletion}
			onDeleteVault={page.clearVault}
		/>
	{/await}
{/if}

<input class="transfer-input" bind:this={page.folderInput} type="file" webkitdirectory multiple onchange={(event) => void page.importFolder(event.currentTarget.files)} />
<input class="transfer-input" bind:this={page.attachmentInput} type="file" multiple onchange={(event) => void page.attachSelectedFiles(event.currentTarget.files)} />
<input class="transfer-input" bind:this={page.zipInput} type="file" accept=".zip,application/zip" onchange={(event) => void page.importZip(event.currentTarget.files)} />

{#if page.restoreModalOpen}
	{#await import('$lib/components/restore-dialog.svelte') then { default: RestoreDialog }}
		<RestoreDialog
			isOnline={page.isOnline}
			restoreState={page.restoreState}
			restoreMessage={page.restoreMessage}
			restoreCommits={page.restoreCommits}
			pendingBackupCount={page.pendingBackupCount}
			bind:selectedRestoreSha={page.selectedRestoreSha}
			bind:restoreOwner={page.restoreOwner}
			bind:restoreRepository={page.restoreRepository}
			bind:restoreBranch={page.restoreBranch}
			bind:restoreDirectory={page.restoreDirectory}
			onClose={() => (page.restoreModalOpen = false)}
			onLoadCommits={() => void page.loadRestoreCommits()}
			onRestore={() => void page.restoreSelectedCommit()}
			formatCommitDate={page.formatCommitDate}
		/>
	{/await}
{/if}
