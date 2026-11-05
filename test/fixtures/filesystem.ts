interface Directory {
  directories: Map<string, Directory>;
  files: Map<string, Blob>;
}
export function memoryDirectory(name = "vault"): FileSystemDirectoryHandle {
  function handle(directory: Directory, name: string): FileSystemDirectoryHandle {
    return {
      kind: "directory",
      name,
      async getDirectoryHandle(child: string, options?: { create?: boolean }) {
        if (!directory.directories.has(child)) {
          if (!options?.create) throw new DOMException("Missing", "NotFoundError");
          directory.directories.set(child, { directories: new Map(), files: new Map() });
        }
        return handle(directory.directories.get(child)!, child);
      },
      async getFileHandle(child: string, options?: { create?: boolean }) {
        if (!directory.files.has(child)) {
          if (!options?.create) throw new DOMException("Missing", "NotFoundError");
          directory.files.set(child, new Blob());
        }
        return {
          kind: "file",
          name: child,
          getFile: async () => directory.files.get(child),
          createWritable: async () => {
            let next: Blob | undefined;
            return {
              write: async (value: Blob) => {
                next = value;
              },
              close: async () => {
                if (next) directory.files.set(child, next);
              },
              abort: async () => undefined,
            };
          },
        };
      },
      async removeEntry(child: string) {
        if (!directory.files.delete(child) && !directory.directories.delete(child))
          throw new DOMException("Missing", "NotFoundError");
      },
      async *entries() {
        for (const child of directory.directories.keys())
          yield [child, handle(directory.directories.get(child)!, child)];
        for (const child of directory.files.keys())
          yield [child, await handle(directory, name).getFileHandle(child)];
      },
    } as unknown as FileSystemDirectoryHandle;
  }
  return handle({ directories: new Map(), files: new Map() }, name);
}
