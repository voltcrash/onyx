export class VaultFilesystem {
  readonly #root: FileSystemDirectoryHandle;

  private constructor(root: FileSystemDirectoryHandle) {
    this.#root = root;
  }

  static async open(directoryName: string): Promise<VaultFilesystem> {
    if (!navigator.storage?.getDirectory) {
      throw new Error("Origin private file system is not available in this browser");
    }

    const storageRoot = await navigator.storage.getDirectory();
    const root = await storageRoot.getDirectoryHandle(directoryName, { create: true });
    await root.getDirectoryHandle("notes", { create: true });
    await root.getDirectoryHandle("attachments", { create: true });
    return new VaultFilesystem(root);
  }

  async writeText(path: string, contents: string): Promise<void> {
    await this.write(path, new Blob([contents], { type: "text/markdown;charset=utf-8" }));
  }

  async write(path: string, contents: Blob): Promise<void> {
    const { directory, name } = await this.#resolveParent(path, true);
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(contents);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
  }

  async readText(path: string): Promise<string> {
    return (await this.read(path)).text();
  }

  async read(path: string): Promise<File> {
    const { directory, name } = await this.#resolveParent(path, false);
    return (await directory.getFileHandle(name)).getFile();
  }

  async remove(
    path: string,
    options?: { recursive?: boolean; ignoreMissing?: boolean },
  ): Promise<void> {
    try {
      const { directory, name } = await this.#resolveParent(path, false);
      await directory.removeEntry(name, { recursive: options?.recursive });
    } catch (error) {
      if (options?.ignoreMissing && error instanceof DOMException && error.name === "NotFoundError")
        return;
      throw error;
    }
  }

  async replace(
    files: Array<{ contents: Blob; path: string }>,
    commit: () => Promise<void>,
  ): Promise<void> {
    const previousFiles = await this.#listFiles();
    try {
      await this.#replaceFiles(files);
      await commit();
    } catch (error) {
      try {
        await this.#replaceFiles(previousFiles);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Failed to restore the vault and roll back its files",
        );
      }
      throw error;
    }
  }

  async #replaceFiles(files: Array<{ contents: Blob; path: string }>): Promise<void> {
    await this.#root.removeEntry("notes", { recursive: true }).catch(ignoreMissing);
    await this.#root.removeEntry("attachments", { recursive: true }).catch(ignoreMissing);
    await this.#root.getDirectoryHandle("notes", { create: true });
    await this.#root.getDirectoryHandle("attachments", { create: true });
    for (const file of files) await this.write(file.path, file.contents);
  }

  async #listFiles(): Promise<Array<{ contents: Blob; path: string }>> {
    const files: Array<{ contents: Blob; path: string }> = [];
    for (const directoryName of ["notes", "attachments"]) {
      const directory = await this.#root.getDirectoryHandle(directoryName, { create: true });
      await collectFiles(directory, directoryName, files);
    }
    return files;
  }

  async #resolveParent(
    path: string,
    create: boolean,
  ): Promise<{ directory: FileSystemDirectoryHandle; name: string }> {
    const parts = path.split("/").filter(Boolean);
    const name = parts.pop();
    if (!name || [name, ...parts].some((part) => part === "." || part === "..")) {
      throw new Error(`Invalid vault path: ${path}`);
    }

    let directory = this.#root;
    for (const part of parts) {
      directory = await directory.getDirectoryHandle(part, { create });
    }
    return { directory, name };
  }
}

async function collectFiles(
  directory: FileSystemDirectoryHandle,
  prefix: string,
  files: Array<{ contents: Blob; path: string }>,
): Promise<void> {
  for await (const [name, handle] of directory.entries()) {
    const path = `${prefix}/${name}`;
    if (handle.kind === "file") {
      files.push({ contents: await handle.getFile(), path });
    } else {
      await collectFiles(handle, path, files);
    }
  }
}

function ignoreMissing(error: unknown): void {
  if (error instanceof DOMException && error.name === "NotFoundError") return;
  throw error;
}
