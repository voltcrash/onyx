export interface EditorSelection {
  start: number;
  end: number;
}

export interface EditorHistoryEntry {
  markdown: string;
  selection?: EditorSelection;
}

/** Undo and redo stacks for the Markdown editor. */
export class EditorHistory {
  #undo: EditorHistoryEntry[] = [];
  #redo: EditorHistoryEntry[] = [];
  // The state just before an edit, so undo can restore the selection the edit started from.
  #pending: EditorHistoryEntry | undefined;

  constructor(readonly limit = 200) {}

  reset(): void {
    this.#undo = [];
    this.#redo = [];
    this.#pending = undefined;
  }

  /** Remembers `entry` as the state an upcoming edit starts from. */
  remember(entry: EditorHistoryEntry): void {
    this.#pending = entry;
  }

  /** Like `remember`, but keeps an earlier entry for the same text. */
  capture(entry: EditorHistoryEntry): void {
    if (this.#pending?.markdown !== entry.markdown) this.#pending = entry;
  }

  clearPending(): void {
    this.#pending = undefined;
  }

  /** Records an edit away from `current`, preferring the remembered entry when it matches. */
  record(current: EditorHistoryEntry): void {
    this.#undo.push(this.#pending?.markdown === current.markdown ? this.#pending : current);
    if (this.#undo.length > this.limit) this.#undo.shift();
    this.#redo = [];
    this.#pending = undefined;
  }

  /** Steps back from `current`, returning the entry to restore. */
  undo(current: EditorHistoryEntry): EditorHistoryEntry | undefined {
    const entry = this.#undo.pop();
    if (entry) this.#redo.push(current);
    return entry;
  }

  /** Steps forward from `current`, returning the entry to restore. */
  redo(current: EditorHistoryEntry): EditorHistoryEntry | undefined {
    const entry = this.#redo.pop();
    if (entry) this.#undo.push(current);
    return entry;
  }
}
