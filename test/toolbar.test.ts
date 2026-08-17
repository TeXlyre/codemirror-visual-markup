import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { EMPTY_SCOPE, scopeAt } from '../src/core/scope';
import { Tokenizer } from '../src/core/tokenizer';
import { isToolbarButton, ToolbarItem, toolbarEntries } from '../src/core/toolbar';
import { latex } from '../src/languages/latex';
import { typst } from '../src/languages/typst';
import { Toolbar } from '../src/ui/toolbar';

const view = (doc: string, anchor = 0, head = anchor) =>
  new EditorView({ state: EditorState.create({ doc, selection: { anchor, head } }) });

const item = (entries: ReturnType<typeof toolbarEntries>, key: string): ToolbarItem =>
  entries.find(entry => isToolbarButton(entry) && entry.key === key) as ToolbarItem;

describe('toolbar contract', () => {
  it('uses namespaced keys and the plugin entry shape', () => {
    const entries = toolbarEntries(latex, EMPTY_SCOPE);

    expect(entries.some(entry => 'type' in entry && entry.type === 'split')).toBe(true);
    for (const entry of entries) {
      if (!isToolbarButton(entry)) continue;
      expect(entry.key.startsWith('latex-')).toBe(true);
      expect(typeof entry.command).toBe('function');
    }
  });

  it('wraps the selection and keeps it selected', () => {
    const editor = view('plain text', 0, 5);
    expect(item(toolbarEntries(latex, EMPTY_SCOPE), 'latex-bold').command(editor)).toBe(true);

    expect(editor.state.doc.toString()).toBe('\\textbf{plain} text');
    expect(editor.state.sliceDoc(editor.state.selection.main.from, editor.state.selection.main.to)).toBe('plain');
  });

  it('builds the same entries for a different language', () => {
    const editor = view('');
    item(toolbarEntries(typst, EMPTY_SCOPE), 'typst-heading2').command(editor);
    expect(editor.state.doc.toString()).toBe('== Heading');
  });

  it('starts a block construct on its own line', () => {
    const editor = view('existing', 8);
    item(toolbarEntries(latex, EMPTY_SCOPE), 'latex-bullet-list').command(editor);
    expect(editor.state.doc.toString()).toBe('existing\n\\begin{itemize}\n  \\item Item\n\\end{itemize}');
  });
});

describe('cursor scope', () => {
  const table = '\\begin{tabular}{ll}\n  a & b \\\\\n  c & d \\\\\n\\end{tabular}';

  it('detects table and colour scope', () => {
    const state = EditorState.create({ doc: table });
    expect(scopeAt(state, table.indexOf('c'), latex).inTable).toBe(true);
    expect(scopeAt(state, 0, latex).inTable).toBe(true);

    const colored = EditorState.create({ doc: '\\textcolor{red}{x}' });
    expect(scopeAt(colored, 16, latex).inColor).toBe(true);
    expect(scopeAt(colored, 0, typst).inColor).toBe(false);
  });

  it('adds table entries only while inside a table', () => {
    const inside = scopeAt(EditorState.create({ doc: table }), table.indexOf('& b'), latex);
    expect(toolbarEntries(latex, EMPTY_SCOPE).some(entry => isToolbarButton(entry) && entry.key.includes('row-after'))).toBe(false);
    expect(toolbarEntries(latex, inside).some(entry => isToolbarButton(entry) && entry.key.includes('row-after'))).toBe(true);
  });

  it('locates the cell under the cursor', () => {
    const [token] = new Tokenizer(latex).tokenize(table);

    const at = (cell: string) => latex.table!.locate!(table, token, table.indexOf(cell) + 1);

    expect(at('a & b')).toEqual({ row: 0, col: 0 });
    expect(at('& b')).toEqual({ row: 0, col: 1 });
    expect(at('& d')).toEqual({ row: 1, col: 1 });
    expect(latex.table!.locate!(table, token, 0)).toBeNull();
  });

  it('inserts and removes table rows and columns', () => {
    const editor = view(table);
    const cells = () => {
      const doc = editor.state.doc.toString();
      return latex.table!.parse(doc, new Tokenizer(latex).tokenize(doc)[0]);
    };
    const run = (key: string, cell: string) => {
      editor.dispatch({ selection: { anchor: editor.state.doc.toString().indexOf(cell) + 1 } });
      const scope = scopeAt(editor.state, editor.state.selection.main.head, latex);
      return item(toolbarEntries(latex, scope), key).command(editor);
    };

    expect(cells()).toEqual([['a', 'b'], ['c', 'd']]);

    expect(run('latex-table-row-after', 'a & b')).toBe(true);
    expect(cells()).toHaveLength(3);

    expect(run('latex-table-col-after', 'a & b')).toBe(true);
    expect(cells()[0]).toHaveLength(3);

    expect(run('latex-table-col-remove', 'a &')).toBe(true);
    expect(cells()[0]).toHaveLength(2);

    expect(run('latex-table-row-remove', 'd')).toBe(true);
    expect(cells()).toHaveLength(2);
  });
});

describe('rendered toolbar', () => {
  it('renders buttons and runs commands by key', () => {
    const editor = view('text', 0, 4);
    const host = document.createElement('div');
    const toolbar = new Toolbar(host, editor, { language: 'latex' });

    expect(host.querySelectorAll('button[data-item]').length).toBeGreaterThan(5);
    (host.querySelector('[data-item="latex-italic"]') as HTMLButtonElement).click();
    expect(editor.state.doc.toString()).toBe('\\textit{text}');

    toolbar.setLanguage('typst');
    expect(toolbar.getEntries().some(entry => isToolbarButton(entry) && entry.key === 'typst-bold')).toBe(true);

    toolbar.destroy();
    expect(host.innerHTML).toBe('');
  });
});
