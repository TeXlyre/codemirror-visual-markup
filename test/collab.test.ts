import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { setVisualState, visualExtension } from '../src/view/visual-editor';
import { revealAt } from '../src/view/decorations';
import '../src/languages/latex';
import '../src/view/widgets';

class CaretWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'remote-caret';
    return el;
  }
}

const remoteCaretAt = (pos: number) =>
  StateField.define<DecorationSet>({
    create: () =>
      Decoration.set([
        Decoration.widget({ widget: new CaretWidget(), side: 10 }).range(pos),
        Decoration.mark({ class: 'remote-selection' }).range(pos, pos + 1)
      ]),
    update: value => value,
    provide: field => EditorView.decorations.from(field)
  });

const mount = (doc: string, caret: number, reveal = false) => {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [visualExtension(), remoteCaretAt(caret), ...(reveal ? [revealAt([caret])] : [])]
    }),
    parent: document.body
  });
  view.dispatch({
    effects: setVisualState.of({ enabled: true, language: 'latex', showCommands: false, maxDepth: 12 })
  });
  return view;
};

const rendered = (view: EditorView) => ({
  caret: view.contentDOM.querySelectorAll('.remote-caret').length,
  selection: view.contentDOM.querySelectorAll('.remote-selection').length
});

describe('remote presence under visual decorations', () => {
  it('shows remote carets inside marked bodies', () => {
    const doc = 'a \\textbf{bold} b';
    expect(rendered(mount(doc, doc.indexOf('bold') + 1))).toEqual({ caret: 1, selection: 1 });
  });

  it('shows remote carets on plain text', () => {
    expect(rendered(mount('plain text here', 3))).toEqual({ caret: 1, selection: 1 });
  });

  it('shows remote carets inside block environments', () => {
    const doc = '\\begin{itemize}\n  \\item first\n\\end{itemize}';
    expect(rendered(mount(doc, doc.indexOf('first') + 1))).toEqual({ caret: 1, selection: 1 });
  });

  it('hides remote carets inside hidden markup', () => {
    const doc = 'a \\textbf{bold} b';
    expect(rendered(mount(doc, doc.indexOf('\\textbf') + 3))).toEqual({ caret: 0, selection: 0 });
  });

  it('hides remote carets inside an atomic math widget', () => {
    const doc = 'formula $a^2$ here';
    expect(rendered(mount(doc, doc.indexOf('$') + 2))).toEqual({ caret: 0, selection: 0 });
  });

  it('shows remote carets adjacent to a math widget', () => {
    const doc = 'formula $a^2$ here';
    expect(rendered(mount(doc, doc.lastIndexOf('$') + 2)).caret).toBe(1);
  });

  it('hides remote carets inside a table widget', () => {
    const doc = ['intro', '', '\\begin{tabular}{ll}', '  one & two \\\\', '\\end{tabular}'].join('\n');
    expect(rendered(mount(doc, doc.indexOf('two')))).toEqual({ caret: 0, selection: 0 });
  });

  it('shows remote carets once their position is revealed', () => {
    const doc = 'formula $a^2$ here';
    const caret = doc.indexOf('$') + 2;

    expect(rendered(mount(doc, caret)).caret).toBe(0);
    expect(rendered(mount(doc, caret, true)).caret).toBe(1);
  });

  it('reveals hidden markup for a remote position', () => {
    const doc = 'a \\textbf{bold} b';
    const caret = doc.indexOf('\\textbf') + 3;

    expect(rendered(mount(doc, caret)).caret).toBe(0);
    expect(rendered(mount(doc, caret, true)).caret).toBe(1);
  });

  it('keeps a widget DOM node alive across unrelated remote edits', () => {
    const doc = 'formula $a^2$ here';
    const view = mount(doc, 0);
    const before = view.contentDOM.querySelector('.cm-lv-math');

    view.dispatch({ changes: { from: doc.length, insert: ' more text' } });
    const after = view.contentDOM.querySelector('.cm-lv-math');

    expect(before).not.toBeNull();
    expect(after).toBe(before);
  });
});

describe('per-cell table granularity', () => {
  const doc = ['intro', '', '\\begin{tabular}{ll}', '  one & two \\\\', '  three & four \\\\', '\\end{tabular}'].join('\n');

  const mountRevealed = (positions: number[], selection?: { anchor: number; head: number }) => {
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: selection ?? { anchor: 0 },
        extensions: [visualExtension(), revealAt(positions)]
      }),
      parent: document.body
    });
    view.dispatch({
      effects: setVisualState.of({ enabled: true, language: 'latex', showCommands: false, maxDepth: 12 })
    });
    return view;
  };

  const activeCells = (view: EditorView) =>
    Array.from(view.contentDOM.querySelectorAll('td.cm-lv-cell-active')).map(
      cell => (cell as HTMLElement).dataset.cell
    );

  it('keeps the table rendered when a caret is inside it', () => {
    const view = mountRevealed([doc.indexOf('two')]);
    expect(view.contentDOM.querySelector('.cm-lv-table')).not.toBeNull();
  });

  it('marks only the cell containing the caret', () => {
    expect(activeCells(mountRevealed([doc.indexOf('two')]))).toEqual(['0:1']);
    expect(activeCells(mountRevealed([doc.indexOf('three')]))).toEqual(['1:0']);
    expect(activeCells(mountRevealed([doc.indexOf('four')]))).toEqual(['1:1']);
  });

  it('marks several cells for several collaborators', () => {
    expect(activeCells(mountRevealed([doc.indexOf('one'), doc.indexOf('four')]))).toEqual(['0:0', '1:1']);
  });

  it('moves the highlight without rebuilding the table', () => {
    const view = mountRevealed([doc.indexOf('one')]);
    const before = view.contentDOM.querySelector('.cm-lv-table');
    expect(activeCells(view)).toEqual(['0:0']);

    view.dispatch({ effects: StateEffect.appendConfig.of(revealAt([doc.indexOf('four')])) });

    expect(view.contentDOM.querySelector('.cm-lv-table')).toBe(before);
    expect(activeCells(view)).toEqual(expect.arrayContaining(['1:1']));
  });

  it('still falls back to source for a real selection over the table', () => {
    const view = mountRevealed([], { anchor: doc.indexOf('one'), head: doc.indexOf('four') });
    expect(view.contentDOM.querySelector('.cm-lv-table')).toBeNull();
  });

  it('renders the table normally when nobody is inside it', () => {
    const view = mountRevealed([]);
    expect(view.contentDOM.querySelector('.cm-lv-table')).not.toBeNull();
    expect(activeCells(view)).toEqual([]);
  });
});

describe('collaborator colours', () => {
  const doc = ['intro', '', '\\begin{tabular}{ll}', '  one & two \\\\', '\\end{tabular}'].join('\n');

  it('applies each collaborator colour to their cell', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          visualExtension(),
          revealAt([doc.indexOf('one')], '#ff0000'),
          revealAt([doc.indexOf('two')], '#00ff00')
        ]
      }),
      parent: document.body
    });
    view.dispatch({
      effects: setVisualState.of({ enabled: true, language: 'latex', showCommands: false, maxDepth: 12 })
    });

    const cells = Array.from(view.contentDOM.querySelectorAll('td.cm-lv-cell-active')) as HTMLElement[];
    expect(cells.map(cell => cell.style.getPropertyValue('--lv-cell-color'))).toEqual(['#ff0000', '#00ff00']);
  });
});
