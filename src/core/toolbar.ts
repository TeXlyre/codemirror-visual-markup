import { EditorView } from '@codemirror/view';
import { Language } from './language';
import { EditorScope, scopeAt } from './scope';

export interface ToolbarItem {
  key: string;
  label: string;
  icon?: string;
  command: (view: EditorView) => boolean;
}

export interface ToolbarSplit {
  type: 'split';
}

export interface ToolbarSpace {
  type: 'space';
}

export type ToolbarEntry = ToolbarItem | ToolbarSplit | ToolbarSpace;

export const split: ToolbarSplit = { type: 'split' };
export const space: ToolbarSpace = { type: 'space' };

export const isToolbarButton = (entry: ToolbarEntry): entry is ToolbarItem => !('type' in entry);

export function wrapSelection(view: EditorView, before: string, after: string): boolean {
  const range = view.state.selection.main;
  const selected = view.state.doc.sliceString(range.from, range.to);

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${before}${selected}${after}` },
    selection: { anchor: range.from + before.length, head: range.from + before.length + selected.length }
  });

  view.focus();
  return true;
}

export function insertText(view: EditorView, text: string, cursorOffset = 0): boolean {
  const range = view.state.selection.main;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length + cursorOffset }
  });

  view.focus();
  return true;
}

export function insertBlock(view: EditorView, text: string): boolean {
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);

  if (range.empty && line.text.trim().length > 0) {
    view.dispatch({ selection: { anchor: line.to } });
    return insertText(view, `\n${text}`);
  }

  return insertText(view, text);
}

export function createWrapItem(language: Language, name: string, label: string): ToolbarItem | null {
  const wrap = language.commands.wrap[name];
  if (!wrap) return null;

  return {
    key: `${language.id}-${name}`,
    label,
    command: view => wrapSelection(view, wrap[0], wrap[1])
  };
}

export function createHeadingItem(language: Language, level: number): ToolbarItem {
  return {
    key: `${language.id}-heading${level}`,
    label: `H${level}`,
    command: view => {
      const range = view.state.selection.main;
      const selected = view.state.doc.sliceString(range.from, range.to);
      return insertBlock(view, language.commands.heading(level, selected || 'Heading'));
    }
  };
}

export function createListItem(language: Language, kind: 'bullet' | 'number'): ToolbarItem {
  return {
    key: `${language.id}-${kind}-list`,
    label: kind === 'bullet' ? '•' : '1.',
    command: view => {
      const range = view.state.selection.main;
      const selected = view.state.doc.sliceString(range.from, range.to);
      const items = selected.split('\n').map(line => line.trim()).filter(Boolean);
      return insertBlock(view, language.commands.list(kind, items.length ? items : ['Item']));
    }
  };
}

export function createTableItem(language: Language, rows = 3, cols = 3): ToolbarItem {
  return {
    key: `${language.id}-table`,
    label: '▦',
    command: view => insertBlock(view, language.commands.table(rows, cols))
  };
}

export function createColorItem(language: Language, kind: 'text' | 'background', color: string): ToolbarItem {
  return {
    key: `${language.id}-color-${kind}`,
    label: kind === 'text' ? 'A' : '▮',
    command: view => {
      const range = view.state.selection.main;
      const selected = view.state.doc.sliceString(range.from, range.to);
      return insertText(view, language.commands.color(kind, color, selected));
    }
  };
}

export function tableScopeEntries(language: Language, scope: EditorScope): ToolbarEntry[] {
  if (!scope.table || scope.tableEditable === false || !language.table?.locate) return [];

  const mutate = (key: string, label: string, apply: (cells: string[][], at: { row: number; col: number }) => void) => ({
    key: `${language.id}-table-${key}`,
    label,
    command: (view: EditorView) => editTable(view, language, apply)
  });

  return [
    split,
    mutate('row-before', '⤒', (cells, at) => cells.splice(at.row, 0, blankRow(cells))),
    mutate('row-after', '⤓', (cells, at) => cells.splice(at.row + 1, 0, blankRow(cells))),
    mutate('row-remove', '⊖', (cells, at) => {
      if (cells.length > 1) cells.splice(at.row, 1);
    }),
    split,
    mutate('col-before', '⇤', (cells, at) => cells.forEach(row => row.splice(at.col, 0, ''))),
    mutate('col-after', '⇥', (cells, at) => cells.forEach(row => row.splice(at.col + 1, 0, ''))),
    mutate('col-remove', '⊗', (cells, at) => {
      if (cells[0]?.length > 1) cells.forEach(row => row.splice(at.col, 1));
    })
  ];
}

export function toolbarEntries(language: Language, scope: EditorScope): ToolbarEntry[] {
  if (language.toolbar) return language.toolbar(scope);

  const format = ['bold', 'italic', 'underline', 'mono', 'smallcaps']
    .map(name => createWrapItem(language, name, WRAP_LABELS[name]))
    .filter((item): item is ToolbarItem => item !== null);

  const math = ['inlineMath', 'displayMath', 'quote']
    .map(name => createWrapItem(language, name, WRAP_LABELS[name]))
    .filter((item): item is ToolbarItem => item !== null);

  return [
    ...format,
    split,
    createHeadingItem(language, 1),
    createHeadingItem(language, 2),
    createHeadingItem(language, 3),
    split,
    ...math,
    split,
    createListItem(language, 'bullet'),
    createListItem(language, 'number'),
    createTableItem(language),
    ...tableScopeEntries(language, scope)
  ];
}

const WRAP_LABELS: Record<string, string> = {
  bold: 'B',
  italic: 'I',
  underline: 'U',
  mono: '</>',
  smallcaps: 'Sc',
  inlineMath: '$x$',
  displayMath: '$$',
  quote: '❝'
};

function blankRow(cells: string[][]): string[] {
  return new Array(cells[0]?.length ?? 1).fill('');
}

function editTable(
  view: EditorView,
  language: Language,
  apply: (cells: string[][], at: { row: number; col: number }) => void
): boolean {
  const adapter = language.table;
  if (!adapter?.locate) return false;

  const source = view.state.doc.toString();
  const scope = scopeAt(view.state, view.state.selection.main.head, language);
  if (!scope.table) return false;

  const at = adapter.locate(source, scope.table, view.state.selection.main.head);
  if (!at) return false;

  const cells = adapter.parse(source, scope.table);
  apply(cells, at);

  const text = source.slice(scope.table.from, scope.table.to);
  view.dispatch({
    changes: {
      from: scope.table.from,
      to: scope.table.to,
      insert: adapter.serialize(cells, scope.table, text)
    }
  });

  view.focus();
  return true;
}
