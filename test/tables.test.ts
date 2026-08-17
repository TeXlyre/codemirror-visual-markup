import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Tokenizer } from '../src/core/tokenizer';
import { Token, walk } from '../src/core/tokens';
import { scopeAt } from '../src/core/scope';
import { isToolbarButton, ToolbarItem, toolbarEntries } from '../src/core/toolbar';
import { latex } from '../src/languages/latex';
import { typst } from '../src/languages/typst';
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

const mount = (doc: string, anchor = 0, language: 'latex' | 'typst' = 'latex') => {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor }, extensions: [visualExtension()] }),
    parent: document.body
  });
  view.dispatch({
    effects: setVisualState.of({ enabled: true, language, showCommands: false, maxDepth: 12 })
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

  it('renders display math inside a cell without turning it into a block row', () => {
    const doc = ['intro', '', '\\begin{tabular}{ll}', '  a & $$x^2$$ \\\\', '\\end{tabular}'].join('\n');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const result = buildDecorations(state, { language: latex, showCommands: false });
    const display = flatten(result.tokens).find(token => token.kind === 'math' && token.display)!;
    const cursor = result.decorations.iter();
    let block: boolean | undefined;

    while (cursor.value) {
      const spec = cursor.value.spec as { block?: boolean; widget?: unknown };
      if (cursor.from === display.from && cursor.to === display.to && spec.widget) block = spec.block;
      cursor.next();
    }

    expect(display.meta?.tableInline).toBe('true');
    expect(display.meta?.tableStyle).toContain('--lv-cell-width:6ch');
    expect(block).toBe(false);

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
      if (spec.class?.includes('cm-lv-cell')) {
        const at = latex.table!.locate!(doc, table, cursor.from)!;
        const widths = byColumn.get(at.col) ?? new Set<string>();
        widths.add(spec.attributes!.style);
        byColumn.set(at.col, widths);
      }
      cursor.next();
    }

    expect(byColumn.size).toBe(2);
    expect([...byColumn.values()].every(widths => widths.size === 1)).toBe(true);
    expect([...byColumn.get(0)!].every(value => value.includes('--lv-cell-width:9ch'))).toBe(true);
    expect([...byColumn.get(1)!].every(value => value.includes('--lv-cell-width:8ch'))).toBe(true);
  });
});


describe('table variants', () => {
  const latexTable = (doc: string) =>
    new Tokenizer(latex).tokenize(doc).find(token => token.kind === 'table')!;

  it.each([
    ['tabular*', ['\\begin{tabular*}{\\textwidth}{lc}', 'A & B \\\\', '\\end{tabular*}'].join('\n')],
    ['tabularx', ['\\begin{tabularx}{\\textwidth}{lX}', 'A & B \\\\', '\\end{tabularx}'].join('\n')],
    ['tabulary', ['\\begin{tabulary}{\\textwidth}{LJ}', 'A & B \\\\', '\\end{tabulary}'].join('\n')],
    ['xltabular', ['\\begin{xltabular}{\\textwidth}{lX}', 'A & B \\\\', '\\end{xltabular}'].join('\n')],
    ['longtable', ['\\begin{longtable}{lc}', 'A & B \\\\', '\\end{longtable}'].join('\n')],
    ['NiceTabular', ['\\begin{NiceTabular}{lc}', 'A & B \\\\', '\\end{NiceTabular}'].join('\n')],
    ['NiceTabular*', ['\\begin{NiceTabular*}{\\textwidth}{lc}', 'A & B \\\\', '\\end{NiceTabular*}'].join('\n')],
    ['NiceTabularX', ['\\begin{NiceTabularX}{\\textwidth}{lX}', 'A & B \\\\', '\\end{NiceTabularX}'].join('\n')],
    ['tblr', ['\\begin{tblr}{colspec={lX},width=\\linewidth}', 'A & B \\\\', '\\end{tblr}'].join('\n')],
    ['longtblr', ['\\begin{longtblr}{colspec={lX}}', 'A & B \\\\', '\\end{longtblr}'].join('\n')]
  ])('recognizes %s as a visual table', (_name, doc) => {
    const token = latexTable(doc);
    expect(token).toBeDefined();
    expect(latex.table!.parse(doc, token)).toEqual([['A', 'B']]);
  });

  it('ignores row-rule commands and respects nested or escaped separators', () => {
    const doc = [
      '\\begin{longtable}{ll}',
      '\\toprule',
      'Name & Note \\\\',
      '\\midrule',
      'A \\& B & \\textbf{left \\& right} \\\\',
      '\\bottomrule',
      '\\end{longtable}'
    ].join('\n');
    const token = latexTable(doc);

    expect(latex.table!.parse(doc, token)).toEqual([
      ['Name', 'Note'],
      ['A \\& B', '\\textbf{left \\& right}']
    ]);
  });

  it('treats longtable metadata as structure, not cell content', () => {
    const doc = [
      '\\begin{longtable}{ll}',
      '\\caption{Results}\\label{tab:results}\\\\',
      '\\toprule',
      'Name & Value \\\\',
      '\\midrule',
      'A & B \\\\',
      '\\bottomrule',
      '\\end{longtable}'
    ].join('\n');
    const token = latexTable(doc);
    const ranges = latex.table!.ranges!(doc, token);

    expect(latex.table!.parse(doc, token)).toEqual([
      ['Name', 'Value'],
      ['A', 'B']
    ]);
    expect(ranges[0].every(cell => cell.header)).toBe(true);
    expect(latex.table!.editable!(doc, token)).toBe(false);
  });

  it('marks a booktabs heading row without assuming every first row is a header', () => {
    const doc = [
      '\\begin{tabular}{ll}',
      '\\toprule',
      'Name & Value \\\\',
      '\\midrule',
      'A & B \\\\',
      '\\bottomrule',
      '\\end{tabular}'
    ].join('\n');
    const token = latexTable(doc);
    const ranges = latex.table!.ranges!(doc, token);

    expect(ranges[0].every(cell => cell.header)).toBe(true);
    expect(ranges[1].some(cell => cell.header)).toBe(false);
    expect(latex.table!.editable!(doc, token)).toBe(false);
  });

  it('keeps wide table families visually wider while retaining text cells', () => {
    const doc = ['intro', '', '\\begin{tabularx}{\\textwidth}{lX}', 'A & B \\\\', '\\end{tabularx}'].join('\n');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const { decorations } = buildDecorations(state, { language: latex, showCommands: false });
    const widths: string[] = [];
    const cursor = decorations.iter();

    while (cursor.value) {
      const spec = cursor.value.spec as { class?: string; attributes?: Record<string, string> };
      if (spec.class?.includes('cm-lv-cell')) widths.push(spec.attributes!.style);
      cursor.next();
    }

    expect(widths).toHaveLength(2);
    expect(widths.every(value => value.includes('--lv-cell-width:10ch'))).toBe(true);
  });

  it('resizes simple LaTeX column specifications when toolbar columns change', () => {
    const doc = ['\\begin{tabularx}{\\textwidth}{lX}', 'A & B \\\\', '\\end{tabularx}'].join('\n');
    const token = latexTable(doc);
    const cells = latex.table!.parse(doc, token);
    cells[0].push('C');

    const serialized = latex.table!.serialize(cells, token, doc.slice(token.from, token.to));
    expect(serialized).toContain('{lXX}');
    expect(serialized).toContain('A & B & C');
  });

  it('does not split an outer LaTeX cell on separators inside a nested environment', () => {
    const doc = [
      '\\begin{tabular}{ll}',
      'A & \\begin{tabular}{cc}x & y \\\\ z & q\\end{tabular} \\\\',
      'B & C \\\\',
      '\\end{tabular}'
    ].join('\n');
    const token = latexTable(doc);

    expect(latex.table!.parse(doc, token)).toEqual([
      ['A', '\\begin{tabular}{cc}x & y \\\\ z & q\\end{tabular}'],
      ['B', 'C']
    ]);
  });

  it('tracks multicolumn spans without enabling destructive table mutation', () => {
    const doc = [
      '\\begin{tabular}{lll}',
      '\\multicolumn{2}{c}{Wide} & C \\\\',
      'A & B & C \\\\',
      '\\end{tabular}'
    ].join('\n');
    const token = latexTable(doc);
    const ranges = latex.table!.ranges!(doc, token);

    expect(ranges[0][0].colspan).toBe(2);
    expect(latex.table!.editable!(doc, token)).toBe(false);
  });

  it('adds explicit row/cell decorations with consistent column widths', () => {
    const doc = ['intro', '', '\\begin{tabular}{ll}', 'A & Longer value \\\\', 'BBBB & C \\\\', '\\end{tabular}'].join('\n');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const { decorations } = buildDecorations(state, { language: latex, showCommands: false });
    const classes: string[] = [];
    const widths = new Map<number, Set<string>>();
    const token = latexTable(doc);
    const cursor = decorations.iter();

    while (cursor.value) {
      const spec = cursor.value.spec as { class?: string; attributes?: Record<string, string> };
      if (spec.class) classes.push(spec.class);
      if (spec.class?.includes('cm-lv-cell')) {
        const at = latex.table!.locate!(doc, token, cursor.from)!;
        const column = widths.get(at.col) ?? new Set<string>();
        column.add(spec.attributes!.style);
        widths.set(at.col, column);
      }
      cursor.next();
    }

    expect(classes.some(value => value.includes('cm-lv-table-row'))).toBe(true);
    expect(widths.size).toBe(2);
    expect([...widths.values()].every(value => value.size === 1)).toBe(true);
  });
  it('keeps multiline source cells in one visual LaTeX row', () => {
    const doc = [
      'intro',
      '',
      '\\begin{tabularx}{\\textwidth}{lXr}',
      '\\toprule',
      'Condition & Description & Result \\\\',
      '\\midrule',
      'A &',
      'A long description that belongs to the same logical row &',
      '82\\% \\\\',
      'B &',
      'Another description &',
      '91\\% \\\\',
      '\\bottomrule',
      '\\end{tabularx}'
    ].join('\n');
    const view = mount(doc);
    const rows = Array.from(view.contentDOM.querySelectorAll('.cm-lv-table-row'));

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.querySelectorAll('.cm-lv-cell')).toHaveLength(3);
    }
    expect(Array.from(rows[1].querySelectorAll('.cm-lv-cell'), cell => cell.textContent?.trim())).toEqual([
      'A',
      'A long description that belongs to the same logical row',
      '82\\%'
    ]);
  });

  it('keeps LaTeX source columns stable below multirow cells', () => {
    const doc = [
      '\\begin{tabular}{llcc}',
      '\\toprule',
      'Group & Condition & Trial 1 & Trial 2 \\\\',
      '\\midrule',
      '\\multirow{2}{*}{Human}',
      '&',
      'Visual &',
      '81 &',
      '86 \\\\',
      '&',
      'Auditory &',
      '77 &',
      '83 \\\\',
      '\\bottomrule',
      '\\end{tabular}'
    ].join('\n');
    const token = latexTable(doc);
    const ranges = latex.table!.ranges!(doc, token);

    expect(ranges[1].map(cell => cell.column)).toEqual([0, 1, 2, 3]);
    expect(ranges[2].map(cell => cell.column)).toEqual([0, 1, 2, 3]);

    const view = mount(`intro\n\n${doc}`);
    const auditory = Array.from(view.contentDOM.querySelectorAll('.cm-lv-cell'))
      .find(cell => cell.textContent?.trim() === 'Auditory') as HTMLElement;
    expect(auditory?.dataset.lvColumn).toBe('1');
  });

  it('keeps multiline image rows in one visual row', () => {
    const doc = [
      'intro',
      '',
      '\\begin{tabular}{lll}',
      '\\toprule',
      'Condition &',
      'Preview &',
      'Description \\\\',
      '\\midrule',
      'Alpha &',
      '\\includegraphics[width=2cm]{https://example.com/a.png} &',
      'First stimulus \\\\',
      '\\bottomrule',
      '\\end{tabular}'
    ].join('\n');
    const view = mount(doc);
    const rows = Array.from(view.contentDOM.querySelectorAll('.cm-lv-table-row'));

    expect(rows).toHaveLength(2);
    expect(rows[0].querySelectorAll('.cm-lv-cell')).toHaveLength(3);
    expect(rows[1].querySelectorAll('.cm-lv-cell')).toHaveLength(3);
    expect(rows[1].querySelector('.cm-lv-cell.cm-lv-image')).not.toBeNull();
  });

  it('keeps multiline display math inline with its table row', () => {
    const doc = [
      'intro',
      '',
      '\\begin{tabular}{lll}',
      'Symbol & Value & Note \\\\',
      '$$\\alpha$$ &',
      '$$',
      '\\frac{1}{2}',
      '$$ &',
      '\\textbf{bold cell} \\\\',
      '\\end{tabular}'
    ].join('\n');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const result = buildDecorations(state, { language: latex, showCommands: false });
    const display = flatten(result.tokens).find(token => token.kind === 'math' && token.display && token.from > doc.indexOf('Value'))!;
    let replacement: { block?: boolean; widget?: unknown } | undefined;
    const cursor = result.decorations.iter();

    while (cursor.value) {
      if (cursor.from === display.from && cursor.to === display.to) {
        replacement = cursor.value.spec as { block?: boolean; widget?: unknown };
        break;
      }
      cursor.next();
    }

    expect(display.meta?.tableInline).toBe('true');
    expect(replacement?.widget).toBeDefined();
    expect(replacement?.block).toBe(false);
  });
});

describe('Typst tables and grids', () => {
  const typstTable = (doc: string) =>
    new Tokenizer(typst).tokenize(doc).find(token => token.kind === 'table')!;

  it('keeps one-cell-per-line Typst source in logical visual rows', () => {
    const doc = [
      'intro',
      '',
      '#table(',
      '  columns: 3,',
      '  [A],',
      '  [B],',
      '  [C],',
      '  [D],',
      '  [E],',
      '  [F],',
      ')'
    ].join('\n');
    const view = mount(doc, 0, 'typst');
    const rows = Array.from(view.contentDOM.querySelectorAll('.cm-lv-table-row'));

    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.querySelectorAll('.cm-lv-cell').length === 3)).toBe(true);
  });

  it('lays out a normal Typst table as editable visual cells', () => {
    const table = [
      '#table(',
      '  columns: 2,',
      '  [Name], [Value],',
      '  [Alpha], [$ beta $],',
      ')'
    ].join('\n');
    const doc = `intro\n\n${table}`;
    const token = typstTable(doc);

    expect(typst.table!.parse(doc, token)).toEqual([
      ['Name', 'Value'],
      ['Alpha', '$ beta $']
    ]);
    expect(typst.table!.editable!(doc, token)).toBe(true);

    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const result = buildDecorations(state, { language: typst, showCommands: false });
    const display = flatten(result.tokens).find(item => item.kind === 'math' && item.display)!;
    expect(display.meta?.tableInline).toBe('true');

    const view = mount(doc, 0, 'typst');
    expect(view.contentDOM.querySelectorAll('.cm-lv-cell')).toHaveLength(4);
    expect(view.contentDOM.querySelectorAll('.cm-lv-math')).toHaveLength(1);
    expect(view.contentDOM.textContent).not.toContain('columns: 2');
  });

  it('supports track-list columns, headers, and spanning cells', () => {
    const doc = [
      '#table(',
      '  columns: (1fr, auto, 2fr),',
      '  table.header([Name], [Age], [Score]),',
      '  [Ada], [36], [10],',
      '  table.cell(colspan: 2)[Total], [10],',
      ')'
    ].join('\n');
    const token = typstTable(doc);
    const ranges = typst.table!.ranges!(doc, token);

    expect(ranges).toHaveLength(3);
    expect(ranges[0].every(cell => cell.header)).toBe(true);
    expect(ranges[2][0].colspan).toBe(2);
    expect(typst.table!.editable!(doc, token)).toBe(false);
  });

  it('accepts Typst cell content passed as a positional function argument', () => {
    const doc = '#grid(columns: 3, grid.cell(colspan: 2, image("x.png")), [C])';
    const token = typstTable(doc);
    const ranges = typst.table!.ranges!(doc, token);

    expect(typst.table!.parse(doc, token)).toEqual([['image("x.png")', 'C']]);
    expect(ranges[0][0].colspan).toBe(2);
    expect(ranges[0][1].column).toBe(2);
  });

  it('honors manual Typst x/y cell placement', () => {
    const doc = '#table(columns: 2, table.cell(x: 1, y: 1, [X]), [A], [B])';
    const token = typstTable(doc);
    const ranges = typst.table!.ranges!(doc, token);

    expect(ranges[0].map(cell => cell.column)).toEqual([0, 1]);
    expect(ranges[1][0].column).toBe(1);
  });

  it('places cells after a rowspan in the next free visual column', () => {
    const table = [
      '#table(',
      '  columns: 2,',
      '  table.cell(rowspan: 2)[A], [B],',
      '  [C],',
      ')'
    ].join('\n');
    const doc = `intro\n\n${table}`;
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const { decorations } = buildDecorations(state, { language: typst, showCommands: false });
    const columns: string[] = [];
    const cursor = decorations.iter();

    while (cursor.value) {
      const spec = cursor.value.spec as { class?: string; attributes?: Record<string, string> };
      if (spec.class?.includes('cm-lv-cell')) columns.push(spec.attributes!['data-lv-column']);
      cursor.next();
    }

    expect(columns).toEqual(['0', '1', '1']);
  });

  it('supports Typst grid with the same visual table adapter', () => {
    const doc = ['#grid(', '  columns: 2,', '  [A], [B],', '  [C], [D],', ')'].join('\n');
    const token = typstTable(doc);

    expect(token.name).toBe('grid');
    expect(typst.table!.parse(doc, token)).toEqual([
      ['A', 'B'],
      ['C', 'D']
    ]);
  });

  it('preserves simple Typst table options while toolbar edits rows and columns', () => {
    const doc = ['#table(', '  columns: 2,', '  inset: 6pt,', '  [A], [B],', '  [C], [D],', ')'].join('\n');
    const token = typstTable(doc);
    const cells = typst.table!.parse(doc, token);
    cells[0].push('E');
    cells[1].push('F');

    const serialized = typst.table!.serialize(cells, token, doc.slice(token.from, token.to));
    expect(serialized).toContain('columns: 3');
    expect(serialized).toContain('inset: 6pt');
    expect(serialized).toContain('[A], [B], [E]');
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
