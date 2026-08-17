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

describe('presence inside tables', () => {
  const doc = ['intro', '', '\\begin{tabular}{ll}', '  one & two \\\\', '  three & four \\\\', '\\end{tabular}'].join('\n');

  it('renders a remote caret in the cell it occupies', () => {
    const view = mount(doc, doc.indexOf('four'));
    expect(rendered(view)).toEqual({ caret: 1, selection: 1 });
  });

  it('renders carets for several collaborators at once', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [visualExtension(), remoteCaretAt(doc.indexOf('one')), remoteCaretAt(doc.indexOf('four'))]
      }),
      parent: document.body
    });
    view.dispatch({
      effects: setVisualState.of({ enabled: true, language: 'latex', showCommands: false, maxDepth: 12 })
    });

    expect(view.contentDOM.querySelectorAll('.remote-caret')).toHaveLength(2);
  });

  it('keeps the table rendered while a collaborator edits it', () => {
    const view = mount(doc, doc.indexOf('four'));
    expect(view.contentDOM.querySelectorAll('.cm-lv-cell').length).toBeGreaterThan(0);
    expect(view.contentDOM.textContent).not.toContain('tabular');
  });
});
