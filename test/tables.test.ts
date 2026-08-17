import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Tokenizer } from '../src/core/tokenizer';
import { Token, walk } from '../src/core/tokens';
import { scopeAt } from '../src/core/scope';
import { isToolbarButton, ToolbarItem, toolbarEntries } from '../src/core/toolbar';
import { latex } from '../src/languages/latex';
import { Toolbar } from '../src/ui/toolbar';
import { buildDecorations } from '../src/view/decorations';
import { setVisualState, visualExtension } from '../src/view/visual-editor';
import '../src/view/widgets';

const TABLE = [
  '\\begin{tabular}{ll}',
  '  Name & Value \\\\',
  '  $\\alpha$ & \\textbf{bold} \\\\',
  '\\end{tabular}'
].join('\n');

const flatten = (tokens: Token[]): Token[] => {
  const out: Token[] = [];
  walk(tokens, token => out.push(token));
  return out;
};

const mount = (doc: string, anchor = 0) => {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor }, extensions: [visualExtension()] }),
    parent: document.body
  });
  view.dispatch({
    effects: setVisualState.of({ enabled: true, language: 'latex', showCommands: false, maxDepth: 12 })
  });
  return view;
};

describe('table content nesting', () => {
  it('parses children inside a tabular', () => {
    const tokens = flatten(new Tokenizer(latex).tokenize(TABLE));

    expect(tokens.some(token => token.kind === 'math')).toBe(true);
    expect(tokens.some(token => token.name === 'textbf')).toBe(true);
  });

  it('renders math and formatting inside cells', () => {
    const view = mount(`intro\n\n${TABLE}`);

    expect(view.contentDOM.querySelectorAll('.cm-lv-math')).toHaveLength(1);
    expect(view.contentDOM.querySelectorAll('.cm-lv-bold')).toHaveLength(1);
    expect(view.contentDOM.textContent).toContain('bold');
  });

  it('renders display math inside a cell', () => {
    const doc = ['intro', '', '\\begin{tabular}{ll}', '  a & $$x^2$$ \\\\', '\\end{tabular}'].join('\n');
    const view = mount(doc);

    expect(view.contentDOM.querySelectorAll('.cm-lv-math')).toHaveLength(1);
  });

  it('hides the environment header, separators and row ends', () => {
    const view = mount(`intro\n\n${TABLE}`);
    const text = view.contentDOM.textContent ?? '';

    expect(text).not.toContain('begin{tabular}');
    expect(text).not.toContain('end{tabular}');
    expect(text).not.toContain('&');
    expect(text).not.toContain('\\\\');
    expect(text).toContain('Name');
    expect(text).toContain('Value');
  });

  it('aligns columns by their widest cell', () => {
    const doc = ['intro', '', '\\begin{tabular}{ll}', '  a & Value \\\\', '  Longer & b \\\\', '\\end{tabular}'].join('\n');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const { decorations } = buildDecorations(state, { language: latex, showCommands: false });

    const table = new Tokenizer(latex).tokenize(doc).find(token => token.kind === 'table')!;
    const byColumn = new Map<number, Set<string>>();
    const cursor = decorations.iter();

    while (cursor.value) {
      const spec = cursor.value.spec as { class?: string; attributes?: Record<string, string> };
      if (spec.class === 'cm-lv-cell') {
        const at = latex.table!.locate!(doc, table, cursor.from)!;
        const widths = byColumn.get(at.col) ?? new Set<string>();
        widths.add(spec.attributes!.style);
        byColumn.set(at.col, widths);
      }
      cursor.next();
    }

    expect(byColumn.size).toBe(2);
    expect([...byColumn.values()].every(widths => widths.size === 1)).toBe(true);
    expect(byColumn.get(0)!.has('min-width:6ch')).toBe(true);
    expect(byColumn.get(1)!.has('min-width:5ch')).toBe(true);
  });
});

describe('table editing from the toolbar', () => {
  const item = (entries: ReturnType<typeof toolbarEntries>, key: string) =>
    entries.find(entry => isToolbarButton(entry) && entry.key === key) as ToolbarItem;

  const cells = (view: EditorView) => {
    const doc = view.state.doc.toString();
    return latex.table!.parse(doc, new Tokenizer(latex).tokenize(doc).find(t => t.kind === 'table')!);
  };

  it('exposes row and column controls when the caret is in a table', () => {
    const doc = `intro\n\n${TABLE}`;
    const view = mount(doc, doc.indexOf('Name'));
    const host = document.createElement('div');
    const toolbar = new Toolbar(host, view, { language: 'latex' });

    expect(host.querySelector('[data-item="latex-table-row-after"]')).toBeNull();

    toolbar.update({ selectionSet: true, docChanged: false } as never);
    expect(host.querySelector('[data-item="latex-table-row-after"]')).not.toBeNull();
    expect(host.querySelector('[data-item="latex-table-col-remove"]')).not.toBeNull();

    toolbar.destroy();
  });

  it('hides the controls again when the caret leaves', () => {
    const doc = `intro\n\n${TABLE}`;
    const view = mount(doc, doc.indexOf('Name'));
    const host = document.createElement('div');
    const toolbar = new Toolbar(host, view, { language: 'latex' });

    toolbar.update({ selectionSet: true, docChanged: false } as never);
    expect(host.querySelector('[data-item="latex-table-row-after"]')).not.toBeNull();

    view.dispatch({ selection: { anchor: 0 } });
    toolbar.update({ selectionSet: true, docChanged: false } as never);
    expect(host.querySelector('[data-item="latex-table-row-after"]')).toBeNull();

    toolbar.destroy();
  });

  it('adds and removes rows and columns through the buttons', () => {
    const doc = `intro\n\n${TABLE}`;
    const view = mount(doc, doc.indexOf('Name'));
    const host = document.createElement('div');
    const toolbar = new Toolbar(host, view, { language: 'latex' });

    const click = (key: string, cell: string) => {
      view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf(cell) } });
      toolbar.update({ selectionSet: true, docChanged: false } as never);
      (host.querySelector(`[data-item="${key}"]`) as HTMLButtonElement).click();
    };

    expect(cells(view)).toHaveLength(2);

    click('latex-table-row-after', 'Name');
    expect(cells(view)).toHaveLength(3);

    click('latex-table-col-after', 'Name');
    expect(cells(view)[0]).toHaveLength(3);

    click('latex-table-col-remove', 'Value');
    expect(cells(view)[0]).toHaveLength(2);

    click('latex-table-row-remove', 'Name');
    expect(cells(view)).toHaveLength(2);

    toolbar.destroy();
  });
});
