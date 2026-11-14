import { createBackupKey, unlockBackupKey, type BackupEncryption } from "#lib/backup-crypto.ts";
import type { ConfirmationOptions, ConfirmationRequest } from "./confirmation.svelte.ts";
import type {
  BackupState,
  GithubState,
  RestoreState,
  SaveState,
} from "#lib/components/app-types.ts";
import type { SettingsSection } from "#lib/components/settings-types.ts";
import { suggestedRepositoryName, Vault, type VaultDescriptor } from "#lib/storage/index.ts";
import type { GithubBackupCommit, GithubUser } from "#lib/github.ts";
import { githubTargetKey } from "#lib/storage/types.ts";
import type { AttachmentMetadata, FolderMetadata, GithubBackupState } from "#lib/storage/types.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";
interface ControllerHost {
  disposed: boolean;
  authenticationRequest: number;
  githubRestoreTimer: number | undefined;
  activeVaultId: string;
  activeNoteId: string;
  isOnline: boolean;
  loadGithubModule: () => Promise<typeof import("#lib/github.ts")>;
  authenticationCleanup: (() => void) | undefined;
  vault: Vault | undefined;
  settleDraft: () => Promise<boolean>;
  openSettings: (target?: SettingsSection) => Promise<void>;
  settingsSection: SettingsSection;
  settingsOpen: boolean;
  pendingBackupCount: number;
  AUTO_BACKUP_DELAY_MS: number;
  workspaceOperation: string | undefined;
  confirmation: {
    readonly request: ConfirmationRequest | undefined;
    ask: (options: ConfirmationOptions) => Promise<boolean>;
    confirm: () => void;
    cancel: () => void;
    dispose: () => void;
  };
  markdown: string;
  lastSavedMarkdown: string;
  saveDraft: () => Promise<boolean>;
  activeVault: VaultDescriptor;
  loadDialogStyles: () => Promise<void>;
  saveState: SaveState;
  saveTimer: number | undefined;
  searchTimer: number | undefined;
  searchSequence: number;
  folders: FolderMetadata[];
  searchQuery: string;
  loadNote: (id: string) => Promise<void>;
  resetActiveNote: () => void;
  vaultAttachments: AttachmentMetadata[];
  runSearch: (query: string) => Promise<void>;
}
export function createGithubController(host: ControllerHost) {
  let githubUser = $state<GithubUser>();

  let githubState = $state<GithubState>("disconnected");

  let githubMessage = $state("");

  let githubBackup = $state<GithubBackupState>();

  let backupState = $state<BackupState>("idle");

  let backupSequence = 0;

  let backupMessage = $state("");

  let backupCommitUrl = $state("");

  let autoBackupTimer: number | undefined;

  let autoBackupPaused = $state(false);

  let restoreModalOpen = $state(false);

  let restoreSequence = 0;

  let restoreSource: { configuration: GithubBackupState; version: number } | undefined;

  let restoreState = $state<RestoreState>("idle");

  let restoreMessage = $state("");

  let restoreCommits = $state<GithubBackupCommit[]>([]);

  let selectedRestoreSha = $state("");

  let restoreOwner = $state("");

  let restoreRepository = $state("onyx-vault");

  let restoreBranch = $state("main");

  let restoreDirectory = $state("vault");
  let restorePassphrase = $state("");

  let mergeUnlock = $state(false);
  let pendingUnlock:
    | { encryption: BackupEncryption; resolve: (passphrase: string | undefined) => void }
    | undefined;

  async function requestMergePassphrase(encryption: BackupEncryption): Promise<string | undefined> {
    await host.loadDialogStyles();
    restorePassphrase = "";
    restoreMessage = "Enter the passphrase for this backup to continue merging.";
    restoreState = "idle";
    mergeUnlock = true;
    restoreModalOpen = true;
    return new Promise((resolve) => {
      pendingUnlock = { encryption, resolve };
    });
  }

  async function submitMergeUnlock(): Promise<void> {
    const pending = pendingUnlock;
    if (!pending || restoreState === "restoring") return;
    restoreState = "restoring";
    const passphrase = restorePassphrase;
    restorePassphrase = "";
    try {
      await unlockBackupKey(pending.encryption, passphrase);
      pendingUnlock = undefined;
      mergeUnlock = false;
      restoreModalOpen = false;
      restoreState = "idle";
      pending.resolve(passphrase);
    } catch (error) {
      restoreState = "error";
      restoreMessage = error instanceof Error ? error.message : "The backup could not be unlocked.";
    }
  }

  async function configureEncryption(passphrase: string, enabled = true): Promise<void> {
    const opened = host.vault,
      configuration = githubBackup;
    if (!opened || !configuration || backupState === "backing-up") return;
    const encryption = enabled
      ? (configuration.encryption ?? (await createBackupKey(passphrase)).encryption)
      : undefined;
    if (enabled && configuration.encryption)
      await unlockBackupKey(configuration.encryption, passphrase);
    if (opened !== host.vault || configuration !== githubBackup) return;
    await opened.saveGithubBackupState({ ...configuration, encryption });
    githubBackup = await opened.getGithubBackupState();
    backupMessage = enabled
      ? "Encrypted backups are enabled and unlocked for this session. Back up now to upload every file encrypted."
      : "The next backup will upload unencrypted files.";
  }

  async function restoreGitHub(): Promise<void> {
    if (host.disposed || githubState === "loading") return;
    const request = ++host.authenticationRequest;
    if (host.githubRestoreTimer !== undefined) {
      window.clearTimeout(host.githubRestoreTimer);
      host.githubRestoreTimer = undefined;
    }
    const result = new URLSearchParams(location.search).get("github");
    if (result) {
      try {
        await goto(`${location.pathname}${location.hash}`, {
          shallow: true,
          replace: true,
          reset: false,
          state: {
            onyxVaultId: host.activeVaultId,
            onyxNoteId: page.state.onyxNoteId ?? host.activeNoteId,
          },
        });
      } catch {
        // History is best-effort; the callback can still be handled.
      }
    }
    if (result && result !== "connected") {
      githubMessage =
        result === "configuration"
          ? "GitHub authentication has not been configured for this deployment."
          : result === "denied"
            ? "GitHub authorization was cancelled."
            : result === "invalid"
              ? "The GitHub authorization response could not be verified. Please try again."
              : "GitHub authentication failed. Please try again.";
    }
    if (!host.isOnline) {
      githubState = githubUser ? "connected" : "disconnected";
      return;
    }
    githubState = "loading";
    try {
      const github = await host.loadGithubModule();
      if (host.disposed || request !== host.authenticationRequest) return;
      host.authenticationCleanup ??= github.subscribeGithubAuthentication((user) => {
        if (!host.disposed) {
          githubUser = user;
          githubState = user ? "connected" : "disconnected";
        }
      });
      const user = await github.restoreGithubSession();
      if (host.disposed || request !== host.authenticationRequest) return;
      githubUser = user;
      githubState = githubUser ? "connected" : githubMessage ? "error" : "disconnected";
    } catch (error) {
      if (host.disposed || request !== host.authenticationRequest) return;
      githubState = "error";
      githubMessage = error instanceof Error ? error.message : "GitHub authentication failed.";
    }
  }

  async function disconnectGitHub(): Promise<void> {
    if (!host.isOnline) return;
    host.authenticationRequest += 1;
    githubUser = undefined;
    githubState = "disconnected";
    try {
      await (await host.loadGithubModule()).disconnectGithub();
      githubUser = undefined;
      githubState = "disconnected";
      githubMessage = "";
    } catch (error) {
      githubState = "error";
      githubMessage = error instanceof Error ? error.message : "GitHub could not be disconnected.";
    }
  }

  async function connectGitHub(): Promise<void> {
    if (!host.isOnline || githubState === "loading") return;
    githubState = "loading";
    githubMessage = "";
    try {
      await (await host.loadGithubModule()).connectGithub();
    } catch (error) {
      githubState = "error";
      githubMessage =
        error instanceof Error ? error.message : "GitHub sign-in could not be started.";
    }
  }

  async function beginBackup(): Promise<void> {
    if (!host.isOnline || !host.vault || backupState === "backing-up") return;
    if (!(await host.settleDraft())) return;
    if (!githubBackup) {
      void host.openSettings("github").catch(() => undefined);
      return;
    }
    await runBackup(githubBackup);
  }

  async function selectBackupRepository(
    state: Omit<GithubBackupState, "updatedAt">,
  ): Promise<void> {
    if (!host.vault) return;
    try {
      await (
        await host.loadGithubModule()
      ).validateGithubBackupRepository({
        ...state,
        updatedAt: new Date().toISOString(),
      });
      const current = await host.vault.getGithubBackupState();
      const target = { ...state, updatedAt: new Date().toISOString() };
      await host.vault.saveGithubBackupState(
        current && githubTargetKey(current) === githubTargetKey(target)
          ? { ...current, ...state }
          : state,
      );
      githubBackup = await host.vault.getGithubBackupState();
      backupState = "idle";
      backupCommitUrl = "";
      backupMessage = `Backups now target ${state.owner}/${state.repository}.`;
      host.settingsSection = "github";
    } catch (error) {
      showBackupError(error);
    }
  }

  async function forgetBackupRepository(): Promise<void> {
    if (!host.vault) return;
    try {
      await host.vault.clearGithubBackupState();
      githubBackup = undefined;
      backupCommitUrl = "";
      backupState = "idle";
      backupMessage = "Onyx is no longer backing up to a repository.";
    } catch (error) {
      showBackupError(error);
    }
  }

  async function createBackupRepository(name: string): Promise<void> {
    if (!host.isOnline || !host.vault || !name.trim() || !(await host.settleDraft())) return;
    backupState = "backing-up";
    backupMessage = "Creating your private repository…";
    host.settingsOpen = false;
    try {
      const configuration = await (
        await host.loadGithubModule()
      ).createPrivateGithubRepository(name);
      await host.vault.saveGithubBackupState(configuration);
      githubBackup = configuration;
      backupState = "idle";
      await runBackup(configuration);
    } catch (error) {
      showBackupError(error);
    }
  }

  async function runBackup(
    configuration: GithubBackupState,
    options: { replaceNewerBackup?: boolean; mergeNewerBackup?: boolean; automatic?: boolean } = {},
  ): Promise<void> {
    if (host.disposed || !host.isOnline || !host.vault || backupState === "backing-up") return;
    const opened = host.vault;
    const sequence = ++backupSequence;
    const { automatic = false, ...backupOptions } = options;
    backupState = "backing-up";
    if (!automatic) {
      autoBackupPaused = false;
      backupMessage = "Preparing one GitHub commit…";
      backupCommitUrl = "";
    }
    let github: Awaited<ReturnType<typeof host.loadGithubModule>> | undefined;
    try {
      github = await host.loadGithubModule();
      const result = await github.backupVaultToGithub(opened, configuration, {
        ...backupOptions,
        requestPassphrase: requestMergePassphrase,
      });
      if (options.mergeNewerBackup && host.activeNoteId) {
        await host.loadNote(host.activeNoteId);
        await host.runSearch(host.searchQuery);
        host.folders = await opened.listFolders();
        host.vaultAttachments = await opened.listAttachments();
      }
      const pending = await opened.countPendingBackupOperations();
      if (host.disposed || opened !== host.vault || sequence !== backupSequence) return;
      githubBackup = result.state;
      host.pendingBackupCount = pending;
      if (automatic) {
        backupState = "idle";
        return;
      }
      backupState = "success";
      backupCommitUrl = result.commitUrl ?? "";
      backupMessage = result.commitUrl
        ? `Backed up ${result.fileCount} ${result.fileCount === 1 ? "file" : "files"} in one commit.`
        : "Your GitHub backup is already up to date.";
    } catch (error) {
      if (host.disposed || opened !== host.vault || sequence !== backupSequence) return;
      if (automatic) {
        autoBackupPaused = true;
        backupState = "error";
        backupCommitUrl = "";
        backupMessage =
          github && error instanceof github.GithubBackupConflictError
            ? "Automatic backup paused because GitHub has a newer backup. Restore it from Settings → Backup & sync, or back up now to replace it."
            : `Automatic backup paused: ${error instanceof Error ? error.message : "the GitHub backup failed."} Back up now to try again.`;
        return;
      }
      if (github && error instanceof github.GithubBackupConflictError) {
        await resolveBackupConflict(configuration);
        return;
      }
      showBackupError(error);
    }
  }

  function scheduleAutoBackup(due: boolean): void {
    window.clearTimeout(autoBackupTimer);
    autoBackupTimer = due
      ? window.setTimeout(() => void runAutoBackup(), host.AUTO_BACKUP_DELAY_MS)
      : undefined;
  }

  async function runAutoBackup(): Promise<void> {
    autoBackupTimer = undefined;
    const configuration = githubBackup;
    if (
      host.disposed ||
      !configuration?.autoBackup ||
      !host.vault ||
      !host.isOnline ||
      githubState !== "connected" ||
      autoBackupPaused ||
      host.workspaceOperation ||
      restoreModalOpen ||
      host.confirmation.request ||
      backupState === "backing-up"
    )
      return;
    if (host.markdown !== host.lastSavedMarkdown && !(await host.saveDraft())) return;
    await runBackup(configuration, { automatic: true });
  }

  async function setAutoBackup(enabled: boolean): Promise<void> {
    if (!host.vault || !githubBackup) return;
    try {
      githubBackup = await host.vault.setAutoBackup(enabled);
      if (enabled) autoBackupPaused = false;
    } catch (error) {
      showBackupError(error);
    }
  }

  async function resolveBackupConflict(configuration: GithubBackupState): Promise<void> {
    const opened = host.vault;
    backupState = "idle";
    backupMessage = "";
    let choice: "merge" | "restore" | undefined;
    const replace = await host.confirmation.ask({
      eyebrow: "Backup & sync",
      title: "GitHub has a newer backup",
      message: `Another device backed up to ${configuration.owner}/${configuration.repository} after this device last backed up or restored. Merge to combine both devices and preserve conflicts as sibling notes. Restore that backup to bring its notes here, which replaces the notes on this device. Or back up anyway to make this device's notes the latest backup; the other backup stays in the repository history.`,
      alternatives: [
        {
          label: "Merge (recommended)",
          action: () => {
            choice = "merge";
            host.confirmation.cancel();
          },
        },
        {
          label: "Restore",
          action: () => {
            choice = "restore";
            host.confirmation.cancel();
          },
        },
      ],
      confirmLabel: "Back up anyway",
      danger: true,
    });
    if (
      host.disposed ||
      opened !== host.vault ||
      !githubBackup ||
      githubTargetKey(githubBackup) !== githubTargetKey(configuration)
    )
      return;
    if (choice === "merge") {
      await runBackup(configuration, { mergeNewerBackup: true });
      return;
    }
    if (choice === "restore") {
      await openRestore();
      return;
    }
    if (replace) {
      await runBackup(configuration, { replaceNewerBackup: true });
      return;
    }
    backupState = "error";
    backupMessage =
      "Backup paused because GitHub has a newer backup. Restore it from Settings → Backup & sync, or back up again to replace it.";
  }

  function showBackupError(error: unknown): void {
    backupState = "error";
    backupMessage = isGithubStatus(error, 422)
      ? "GitHub could not create that repository or update its branch. Check the name and try again."
      : error instanceof Error
        ? error.message
        : "The GitHub backup failed.";
  }

  function isGithubStatus(error: unknown, status: number): boolean {
    return (
      error instanceof Error &&
      "status" in error &&
      (error as Error & { status?: unknown }).status === status
    );
  }

  async function openRestore(): Promise<void> {
    if (!host.isOnline || !githubUser || restoreState === "restoring") return;
    if (!(await host.settleDraft())) return;
    restorePassphrase = "";
    restoreOwner = githubBackup?.owner ?? githubUser.login;
    restoreRepository = githubBackup?.repository ?? suggestedRepositoryName(host.activeVault);
    restoreBranch = githubBackup?.branch ?? "main";
    restoreDirectory = githubBackup?.directory ?? "vault";
    restoreCommits = [];
    selectedRestoreSha = "";
    restoreMessage = "";
    await host.loadDialogStyles();
    restoreModalOpen = true;
    await loadRestoreCommits();
  }

  function restoreConfiguration(): GithubBackupState {
    if (!githubUser) throw new Error("Sign in with GitHub before restoring a backup");
    return {
      githubAccountId: githubUser.id,
      githubAccountLogin: githubUser.login,
      owner: restoreOwner.trim(),
      repository: restoreRepository.trim(),
      branch: restoreBranch.trim(),
      directory: restoreDirectory.trim().replace(/^\/+|\/+$/g, ""),
      updatedAt: new Date().toISOString(),
    };
  }

  function invalidateRestoreSource(): void {
    restoreSequence += 1;
    restoreSource = undefined;
    selectedRestoreSha = "";
    restoreCommits = [];
    restoreState = "idle";
  }

  async function loadRestoreCommits(): Promise<void> {
    if (
      !host.isOnline ||
      !host.vault ||
      restoreState === "restoring" ||
      !restoreOwner.trim() ||
      !restoreRepository.trim() ||
      !restoreBranch.trim()
    )
      return;
    const opened = host.vault;
    const sequence = ++restoreSequence;
    restoreState = "loading";
    restoreMessage = "";
    selectedRestoreSha = "";
    restoreSource = undefined;
    try {
      const configuration = restoreConfiguration();
      const commits = await (await host.loadGithubModule()).listGithubBackupCommits(configuration);
      const version = await opened.getVersion();
      if (host.disposed || sequence !== restoreSequence || opened !== host.vault) return;
      restoreSource = { configuration, version };
      restoreCommits = commits;
      selectedRestoreSha = commits[0]?.sha ?? "";
      restoreMessage = commits.length
        ? ""
        : "No backup commits were found in this repository and directory.";
      restoreState = "idle";
    } catch (error) {
      if (host.disposed || sequence !== restoreSequence || opened !== host.vault) return;
      restoreCommits = [];
      restoreState = "error";
      restoreMessage =
        error instanceof Error ? error.message : "GitHub backups could not be loaded.";
    }
  }

  async function restoreSelectedCommit(): Promise<void> {
    if (
      !host.isOnline ||
      !host.vault ||
      !restoreSource ||
      !selectedRestoreSha ||
      restoreState === "restoring"
    )
      return;
    const opened = host.vault;
    const source = restoreSource;
    const sha = selectedRestoreSha;
    if (!(await host.settleDraft())) return;
    const previousSaveState = host.saveState;
    if (host.saveTimer) window.clearTimeout(host.saveTimer);
    if (host.searchTimer) window.clearTimeout(host.searchTimer);
    host.saveTimer = undefined;
    host.searchTimer = undefined;
    host.searchSequence += 1;
    host.saveState = "loading";
    restoreState = "restoring";
    restoreMessage = "Downloading and rebuilding your local vault…";
    try {
      const passphrase = restorePassphrase || undefined;
      restorePassphrase = "";
      const result = await (
        await host.loadGithubModule()
      ).restoreVaultFromGithub(opened, source.configuration, sha, {
        expectedVersion: source.version,
        passphrase,
      });
      if (host.disposed || opened !== host.vault) return;
      githubBackup = result.state;
      host.pendingBackupCount = await host.vault.countPendingBackupOperations();
      const notes = await host.vault.listNotes();
      host.folders = await host.vault.listFolders();
      host.searchQuery = "";
      if (notes[0]) await host.loadNote(notes[0].id);
      else host.resetActiveNote();
      host.vaultAttachments = await host.vault.listAttachments();
      await host.runSearch("");
      restoreModalOpen = false;
      restoreState = "idle";
      backupState = "success";
      backupMessage = `Restored ${result.noteCount} ${result.noteCount === 1 ? "note" : "notes"} and ${result.attachmentCount} ${result.attachmentCount === 1 ? "attachment" : "attachments"} from GitHub.`;
      backupCommitUrl = restoreCommits.find((commit) => commit.sha === sha)?.url ?? "";
    } catch (error) {
      host.saveState = previousSaveState;
      restoreState = "error";
      restoreMessage =
        error instanceof Error ? error.message : "The GitHub backup could not be restored.";
    }
  }
  return {
    submitMergeUnlock,
    get mergeUnlock() {
      return mergeUnlock;
    },
    configureEncryption,
    get restorePassphrase() {
      return restorePassphrase;
    },
    set restorePassphrase(value: string) {
      restorePassphrase = value;
    },
    restoreGitHub,
    disconnectGitHub,
    connectGitHub,
    beginBackup,
    selectBackupRepository,
    forgetBackupRepository,
    createBackupRepository,
    runBackup,
    scheduleAutoBackup,
    runAutoBackup,
    setAutoBackup,
    resolveBackupConflict,
    showBackupError,
    isGithubStatus,
    openRestore,
    restoreConfiguration,
    invalidateRestoreSource,
    loadRestoreCommits,
    restoreSelectedCommit,
    get githubUser() {
      return githubUser;
    },
    set githubUser(value) {
      githubUser = value;
    },
    get githubState() {
      return githubState;
    },
    set githubState(value) {
      githubState = value;
    },
    get githubMessage() {
      return githubMessage;
    },
    set githubMessage(value) {
      githubMessage = value;
    },
    get githubBackup() {
      return githubBackup;
    },
    set githubBackup(value) {
      githubBackup = value;
    },
    get backupState() {
      return backupState;
    },
    set backupState(value) {
      backupState = value;
    },
    get backupSequence() {
      return backupSequence;
    },
    set backupSequence(value) {
      backupSequence = value;
    },
    get backupMessage() {
      return backupMessage;
    },
    set backupMessage(value) {
      backupMessage = value;
    },
    get backupCommitUrl() {
      return backupCommitUrl;
    },
    set backupCommitUrl(value) {
      backupCommitUrl = value;
    },
    get autoBackupTimer() {
      return autoBackupTimer;
    },
    set autoBackupTimer(value) {
      autoBackupTimer = value;
    },
    get autoBackupPaused() {
      return autoBackupPaused;
    },
    set autoBackupPaused(value) {
      autoBackupPaused = value;
    },
    get restoreModalOpen() {
      return restoreModalOpen;
    },
    set restoreModalOpen(value) {
      restoreModalOpen = value;
      if (!value && pendingUnlock) {
        pendingUnlock.resolve(undefined);
        pendingUnlock = undefined;
        mergeUnlock = false;
        restorePassphrase = "";
      }
    },
    get restoreSequence() {
      return restoreSequence;
    },
    set restoreSequence(value) {
      restoreSequence = value;
    },
    get restoreSource() {
      return restoreSource;
    },
    set restoreSource(value) {
      restoreSource = value;
    },
    get restoreState() {
      return restoreState;
    },
    set restoreState(value) {
      restoreState = value;
    },
    get restoreMessage() {
      return restoreMessage;
    },
    set restoreMessage(value) {
      restoreMessage = value;
    },
    get restoreCommits() {
      return restoreCommits;
    },
    set restoreCommits(value) {
      restoreCommits = value;
    },
    get selectedRestoreSha() {
      return selectedRestoreSha;
    },
    set selectedRestoreSha(value) {
      selectedRestoreSha = value;
    },
    get restoreOwner() {
      return restoreOwner;
    },
    set restoreOwner(value) {
      restoreOwner = value;
    },
    get restoreRepository() {
      return restoreRepository;
    },
    set restoreRepository(value) {
      restoreRepository = value;
    },
    get restoreBranch() {
      return restoreBranch;
    },
    set restoreBranch(value) {
      restoreBranch = value;
    },
    get restoreDirectory() {
      return restoreDirectory;
    },
    set restoreDirectory(value) {
      restoreDirectory = value;
    },
  };
}
