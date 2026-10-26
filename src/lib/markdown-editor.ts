import { insertNewline, standardKeymap } from "@codemirror/commands";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  Annotation,
  Compartment,
  EditorSelection as Selection,
  EditorState,
  StateEffect,
  StateField,
  type ChangeSpec,
} from "@codemirror/state";
import { Decoration, EditorView, keymap, placeholder, type DecorationSet } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { EditorSelection } from "./editor-history.js";
import type { FindMatch } from "./find-replace.js";
import { continueListOnEnter, wrapSelectionWith } from "./markdown-utils.js";
import type { ScrollAnchor } from "./scroll-sync.js";

export interface MarkdownEditorOptions {
  doc: string;
  label: string;
  placeholder: string;
  /** A user edit, with the selection it started from so undo can restore it. */
  onChange: (value: string, before: EditorSelection) => void;
  /** Undo and redo requested through the browser, such as from the Edit menu. */
  onHistory: (direction: "undo" | "redo") => void;
  onSelectionChange: () => void;
  onLayout: () => void;
  onPaste: (event: ClipboardEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

// Marks changes made by code rather than the user, so they are not reported back as edits.
const programmatic = Annotation.define<boolean>();

const setFindMatches = StateEffect.define<{ matches: FindMatch[]; active: number }>();

const findHighlights = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(setFindMatches)) continue;
      const { matches, active } = effect.value;
      return Decoration.set(
        matches
          .filter((match) => match.end > match.start && match.end <= transaction.newDoc.length)
          .map((match, index) =>
            Decoration.mark({
              class: index === active ? "find-match find-match-current" : "find-match",
            }).range(match.start, match.end),
          ),
      );
    }
    return transaction.docChanged ? decorations.map(transaction.changes) : decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// Styles come from the source pane's theme variables, so the editor follows every color theme.
const markdownHighlighting = HighlightStyle.define([
  { tag: tags.heading, class: "md-heading" },
  { tag: [tags.strong], class: "md-strong" },
  { tag: [tags.emphasis], class: "md-emphasis" },
  { tag: tags.strikethrough, class: "md-strikethrough" },
  { tag: [tags.link, tags.url], class: "md-link" },
  { tag: [tags.monospace], class: "md-code" },
  { tag: tags.quote, class: "md-quote" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], class: "md-mark" },
  { tag: tags.list, class: "md-list" },
]);

let styleRoot: Document | undefined;

// style-mod adopts a constructable stylesheet for roots without a head, preserving the app's CSP.
function constructableStyleRoot(): Document {
  return (styleRoot ??= new Proxy(document, {
    get(target, property) {
      if (property === "head") return undefined;
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set: (target, property, value) => Reflect.set(target, property, value),
  }));
}

/** The smallest change that turns `before` into `after`. */
export function textChange(before: string, after: string): ChangeSpec | undefined {
  if (before === after) return;
  let start = 0;
  const shortest = Math.min(before.length, after.length);
  while (start < shortest && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
  let end = 0;
  while (
    end < shortest - start &&
    before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)
  ) {
    end += 1;
  }
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}

export class MarkdownEditor {
  readonly view: EditorView;
  readonly #editable = new Compartment();

  constructor(parent: HTMLElement, options: MarkdownEditorOptions) {
    const selectionOf = (state: EditorState): EditorSelection => ({
      start: state.selection.main.from,
      end: state.selection.main.to,
    });
    const replaceWith = (view: EditorView, value: string, start: number, end = start) => {
      const changes = textChange(view.state.doc.toString(), value);
      view.dispatch({
        changes,
        selection: Selection.single(start, end),
        scrollIntoView: true,
        userEvent: "input",
      });
    };

    this.view = new EditorView({
      parent,
      root: constructableStyleRoot(),
      state: EditorState.create({
        doc: options.doc,
        extensions: [
          this.#editable.of([EditorView.editable.of(true), EditorState.readOnly.of(false)]),
          markdownLanguage({ addKeymap: false }),
          syntaxHighlighting(markdownHighlighting),
          EditorView.lineWrapping,
          placeholder(options.placeholder),
          EditorView.contentAttributes.of({
            "aria-label": options.label,
            "aria-multiline": "true",
            role: "textbox",
            spellcheck: "true",
            autocapitalize: "sentences",
          }),
          findHighlights,
          keymap.of([
            {
              key: "Enter",
              run: (view) => {
                if (view.state.readOnly) return true;
                const { from, to } = view.state.selection.main;
                const continued =
                  from === to ? continueListOnEnter(view.state.doc.toString(), from) : undefined;
                if (!continued) return insertNewline(view);
                replaceWith(view, continued.value, continued.caret);
                return true;
              },
            },
            ...standardKeymap.filter((binding) => binding.key !== "Enter"),
          ]),
          EditorView.inputHandler.of((view, from, to, text) => {
            if (from === to || view.composing) return false;
            const wrapped = wrapSelectionWith(view.state.doc.toString(), from, to, text);
            if (!wrapped) return false;
            replaceWith(view, wrapped.value, wrapped.start, wrapped.end);
            return true;
          }),
          EditorView.domEventHandlers({
            paste: (event) => {
              if (this.view.state.readOnly) return true;
              options.onPaste(event);
              return event.defaultPrevented;
            },
            dragover: (event) => {
              options.onDragOver(event);
              return event.defaultPrevented;
            },
            drop: (event) => {
              if (this.view.state.readOnly) return true;
              options.onDrop(event);
              return event.defaultPrevented;
            },
            beforeinput: (event) => {
              if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") {
                return false;
              }
              event.preventDefault();
              if (this.view.state.readOnly) return true;
              options.onHistory(event.inputType === "historyUndo" ? "undo" : "redo");
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet) options.onSelectionChange();
            if (update.geometryChanged) options.onLayout();
            if (!update.docChanged) return;
            if (update.transactions.some((transaction) => transaction.annotation(programmatic))) {
              return;
            }
            options.onChange(update.state.doc.toString(), selectionOf(update.startState));
          }),
        ],
      }),
    });
    // Lets end-to-end tests reach the whole note, which CodeMirror only renders in part.
    Object.defineProperty(this.view.contentDOM, "markdownEditor", { value: this });
  }

  get value(): string {
    return this.view.state.doc.toString();
  }

  /** Replaces the text without reporting it as an edit, keeping the selection where it can. */
  set value(next: string) {
    const changes = textChange(this.value, next);
    if (changes) this.view.dispatch({ changes, annotations: programmatic.of(true) });
  }

  get selectionStart(): number {
    return this.view.state.selection.main.from;
  }

  get selectionEnd(): number {
    return this.view.state.selection.main.to;
  }

  setSelectionRange(start: number, end: number): void {
    const length = this.view.state.doc.length;
    this.view.dispatch({
      selection: Selection.single(Math.min(start, length), Math.min(end, length)),
      scrollIntoView: true,
    });
  }

  select(): void {
    this.setSelectionRange(0, this.view.state.doc.length);
  }

  focus(): void {
    this.view.focus();
  }

  get hasFocus(): boolean {
    return this.view.hasFocus;
  }

  contains(node: Node): boolean {
    return this.view.dom.contains(node);
  }

  get scrollDOM(): HTMLElement {
    return this.view.scrollDOM;
  }

  get disabled(): boolean {
    return this.view.state.readOnly;
  }

  set disabled(disabled: boolean) {
    this.view.dispatch({
      effects: this.#editable.reconfigure([
        EditorView.editable.of(!disabled),
        EditorState.readOnly.of(disabled),
      ]),
    });
    this.view.contentDOM.setAttribute("aria-disabled", String(disabled));
  }

  /** The text offset under a viewport point, such as where files were dropped. */
  positionAt(x: number, y: number): number | undefined {
    return this.view.posAtCoords({ x, y }) ?? undefined;
  }

  highlightMatches(matches: FindMatch[], active: number): void {
    this.view.dispatch({ effects: setFindMatches.of({ matches, active }) });
  }

  /** Selects a range and scrolls it to the middle of the pane. */
  revealRange(start: number, end: number): void {
    this.view.dispatch({
      selection: Selection.single(start, end),
      effects: EditorView.scrollIntoView(start, { y: "center" }),
    });
  }

  /** Where each source line starts within the scrolling element, for synced scrolling. */
  lineAnchors(): ScrollAnchor[] {
    const { view } = this;
    const offset = view.documentTop - view.scrollDOM.getBoundingClientRect().top;
    const top = offset + view.scrollDOM.scrollTop;
    const doc = view.state.doc;
    const anchors: ScrollAnchor[] = [];
    for (let line = 1; line <= doc.lines; line += 1) {
      anchors.push({ line: line - 1, top: top + view.lineBlockAt(doc.line(line).from).top });
    }
    anchors.push({ line: doc.lines, top: top + view.contentHeight });
    return anchors;
  }

  destroy(): void {
    this.view.destroy();
  }
}
