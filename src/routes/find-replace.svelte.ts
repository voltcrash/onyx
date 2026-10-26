import type { EditorSelection } from "#lib/editor-history.ts";
import { findTextMatches } from "#lib/find-replace.ts";
import type { MarkdownEditor } from "#lib/markdown-editor.ts";
import { tick } from "svelte";

export interface FindReplaceHost {
  markdown(): string;
  canEdit(): boolean;
  editor(): MarkdownEditor | undefined;
  editorSelection(): EditorSelection | undefined;
  rememberEditorState(selection: EditorSelection): void;
  updateMarkdown(value: string): void;
  /** Shows the source pane when a single-pane layout is showing the rendered one. */
  revealSource(): void;
  /** Opens the sidebar for the find panel and returns a callback that puts it back. */
  openSidebar(): () => void;
  restoreFocus(opener: HTMLElement | undefined): void;
}

/** Find and replace within the active note. */
export function createFindReplace(host: FindReplaceHost) {
  let open = $state(false);
  let query = $state("");
  let replacement = $state("");
  let matchCase = $state(false);
  let wholeWord = $state(false);
  let matchIndex = $state(-1);
  let input: HTMLInputElement | undefined = $state();
  let replaceInput: HTMLInputElement | undefined = $state();
  let opener: HTMLElement | undefined;
  let restoreSidebar: (() => void) | undefined;
  let navigationSequence = 0;

  const matches = $derived(findTextMatches(host.markdown(), query, { matchCase, wholeWord }));
  const activeMatch = $derived(
    matches.length > 0 ? Math.min(Math.max(matchIndex, 0), matches.length - 1) : -1,
  );

  function focusMatch(index: number, sequence = navigationSequence): void {
    if (!open || sequence !== navigationSequence) return;
    const match = matches[index];
    if (!match) return;

    host.revealSource();
    const target = host.editor();
    if (!target) {
      void tick().then(() => focusMatch(index, sequence));
      return;
    }

    target.revealRange(match.start, match.end);
  }

  function queueNavigation(): void {
    const sequence = ++navigationSequence;
    void tick().then(() => {
      if (sequence !== navigationSequence || !open || activeMatch < 0) return;
      focusMatch(activeMatch, sequence);
    });
  }

  function restartMatches(): void {
    matchIndex = query ? 0 : -1;
    queueNavigation();
  }

  function moveMatch(direction: 1 | -1): void {
    if (matches.length === 0) return;
    const current = activeMatch < 0 ? (direction > 0 ? -1 : 0) : activeMatch;
    matchIndex = (current + direction + matches.length) % matches.length;
    queueNavigation();
  }

  function openFind(): void {
    if (open) {
      requestAnimationFrame(() => {
        input?.focus();
        input?.select();
      });
      return;
    }
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const selection = host.editorSelection();
    if (selection && selection.start !== selection.end) {
      query = host.markdown().slice(selection.start, selection.end);
    }
    matchIndex = query ? 0 : -1;
    restoreSidebar = host.openSidebar();
    open = true;
    const sequence = ++navigationSequence;
    void tick().then(() => {
      if (sequence !== navigationSequence || !open) return;
      input?.focus();
      input?.select();
      if (activeMatch >= 0) focusMatch(activeMatch, sequence);
    });
  }

  function closeFind(): void {
    if (!open) return;
    const restore = restoreSidebar;
    restoreSidebar = undefined;
    open = false;
    navigationSequence += 1;
    restore?.();
    const previousOpener = opener;
    opener = undefined;
    host.restoreFocus(previousOpener);
  }

  function replace(): void {
    const match = matches[activeMatch];
    if (!match || !host.canEdit()) return;
    host.rememberEditorState({ start: match.start, end: match.end });
    const markdown = host.markdown();
    const nextValue = markdown.slice(0, match.start) + replacement + markdown.slice(match.end);
    const nextMatches = findTextMatches(nextValue, query, { matchCase, wholeWord });
    const nextIndex = nextMatches.findIndex(
      (candidate) => candidate.start >= match.start + replacement.length,
    );
    host.updateMarkdown(nextValue);
    matchIndex = nextMatches.length === 0 ? -1 : nextIndex >= 0 ? nextIndex : 0;
    queueNavigation();
  }

  function replaceAll(): void {
    if (matches.length === 0 || !host.canEdit()) return;
    const current = matches;
    host.rememberEditorState({ start: current[0]!.start, end: current.at(-1)!.end });
    let nextValue = host.markdown();
    for (let index = current.length - 1; index >= 0; index -= 1) {
      const match = current[index]!;
      nextValue = `${nextValue.slice(0, match.start)}${replacement}${nextValue.slice(match.end)}`;
    }
    const nextMatches = findTextMatches(nextValue, query, { matchCase, wholeWord });
    host.updateMarkdown(nextValue);
    matchIndex = nextMatches.length > 0 ? 0 : -1;
    queueNavigation();
  }

  return {
    get isOpen() {
      return open;
    },
    get query() {
      return query;
    },
    get replacement() {
      return replacement;
    },
    get matchCase() {
      return matchCase;
    },
    get wholeWord() {
      return wholeWord;
    },
    get matches() {
      return matches;
    },
    get activeMatch() {
      return activeMatch;
    },
    get input() {
      return input;
    },
    set input(value: HTMLInputElement | undefined) {
      input = value;
    },
    get replaceInput() {
      return replaceInput;
    },
    set replaceInput(value: HTMLInputElement | undefined) {
      replaceInput = value;
    },
    open: openFind,
    close: closeFind,
    toggle: () => (open ? closeFind() : openFind()),
    setQuery: (value: string) => {
      query = value;
      restartMatches();
    },
    setReplacement: (value: string) => {
      replacement = value;
    },
    setMatchCase: (value: boolean) => {
      matchCase = value;
      restartMatches();
    },
    setWholeWord: (value: boolean) => {
      wholeWord = value;
      restartMatches();
    },
    previous: () => moveMatch(-1),
    next: () => moveMatch(1),
    replace,
    replaceAll,
  };
}
