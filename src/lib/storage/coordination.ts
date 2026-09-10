import type { VaultChangeEvent, VaultChangeKind } from "./types.js";

interface VaultChangeMessage {
  type: "vault-change";
  kind: VaultChangeKind;
  noteId?: string;
  occurredAt: string;
  sourceId: string;
}

type ChangeListener = (event: VaultChangeEvent) => void;

export class VaultCoordination {
  readonly #lockName: string;
  readonly #sourceId = createId("tab");
  readonly #channel?: BroadcastChannel;
  readonly #listeners = new Set<ChangeListener>();
  #queue: Promise<void> = Promise.resolve();

  constructor(databaseName: string, directoryName: string) {
    const scope = `${databaseName}:${directoryName}`;
    this.#lockName = `onyx-vault:${scope}`;
    if (typeof BroadcastChannel === "undefined") return;
    try {
      const channel = new BroadcastChannel(`onyx-vault:${scope}`);
      channel.onmessage = (event: MessageEvent<unknown>) => this.#receive(event.data);
      this.#channel = channel;
    } catch {
      // Some embedded browsers expose the constructor but disallow channels.
    }
  }

  subscribe(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.#queue;
    let release!: () => void;
    this.#queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await requestLock(this.#lockName, task);
    } finally {
      release();
    }
  }

  publish(change: Pick<VaultChangeEvent, "kind" | "noteId">): void {
    const message: VaultChangeMessage = {
      type: "vault-change",
      ...change,
      occurredAt: new Date().toISOString(),
      sourceId: this.#sourceId,
    };
    try {
      this.#channel?.postMessage(message);
    } catch {
      // A notification must never make a successful vault write fail.
    }
  }

  close(): void {
    if (this.#channel) {
      this.#channel.onmessage = null;
      this.#channel.close();
    }
    this.#listeners.clear();
  }

  #receive(value: unknown): void {
    if (!isVaultChangeMessage(value) || value.sourceId === this.#sourceId) return;
    const event: VaultChangeEvent = {
      kind: value.kind,
      noteId: value.noteId,
      occurredAt: value.occurredAt,
      sourceId: value.sourceId,
    };
    for (const listener of this.#listeners) listener(event);
  }
}

async function requestLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks || typeof locks.request !== "function") return task();
  return locks.request(name, { mode: "exclusive" }, task);
}

function isVaultChangeMessage(value: unknown): value is VaultChangeMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<VaultChangeMessage>;
  return (
    message.type === "vault-change" &&
    (message.kind === "backup" || message.kind === "note" || message.kind === "vault") &&
    typeof message.occurredAt === "string" &&
    typeof message.sourceId === "string"
  );
}

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
