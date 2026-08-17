import { EditorState, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { buildDecorations, revealFrom } from '../src/view/decorations';
import { setVisualState, visualExtension } from '../src/view/visual-editor';
import { latex } from '../src/languages/latex';
import '../src/view/widgets';

const DOC = 'intro $x^2$ tail and \\textbf{bold} end';
const MATH = { from: DOC.indexOf('$'), to: DOC.indexOf('$', DOC.indexOf('$') + 1) + 1 };

const marks = (from: number, to: number, cls = 'lsp-mark') =>
  StateField.define<DecorationSet>({
    create: () => Decoration.set([Decoration.mark({ class: cls }).range(from, to)]),
    update: value => value,
    provide: field => EditorView.decorations.from(field)
  });

const mount = (extensions: any[] = [], anchor = 0) => {
  const view = new EditorView({
    state: EditorState.create({ doc: DOC, selection: { anchor }, extensions: [visualExtension(), ...extensions] }),
    parent: document.body
  });
  view.dispatch({
    effects: setVisualState.of({ enabled: true, language: 'latex', showCommands: false, maxDepth: 12 })
  });
  return view;
};

const count = (view: EditorView, cls = 'lsp-mark') => view.contentDOM.querySelectorAll(`.${cls}`).length;

const atomicSpans = (anchor: number) => {
  const state = EditorState.create({ doc: DOC, selection: { anchor } });
  const { atomic } = buildDecorations(state, { language: latex, showCommands: false });
  const spans: string[] = [];
  const cursor = atomic.iter();
  while (cursor.value) {
    spans.push(`${cursor.from}..${cursor.to}`);
    cursor.next();
  }
  return spans;
};

describe('editor services under visual mode', () => {
  it('renders mark-based services over normal text and marked bodies', () => {
    expect(count(mount([marks(0, 5)]))).toBe(1);
    expect(count(mount([marks(DOC.indexOf('bold'), DOC.indexOf('bold') + 4)]))).toBe(1);
  });

  it('does not render them inside a collapsed widget', () => {
    expect(count(mount([marks(MATH.from + 1, MATH.to - 1)]))).toBe(0);
  });

  it('renders them once the caret is inside the construct', () => {
    expect(count(mount([marks(MATH.from + 1, MATH.to - 1)], MATH.from + 2))).toBe(1);
  });

  it('leaves the widget boundary reachable so the caret can step in', () => {
    expect(atomicSpans(MATH.from - 1)).toEqual([`${MATH.from}..${MATH.to}`]);
    expect(atomicSpans(MATH.from)).toEqual([]);
    expect(atomicSpans(MATH.to)).toEqual([]);
  });

  it('surfaces diagnostics inside widgets through revealFrom', () => {
    const diagnostics = StateField.define<{ from: number; to: number }[]>({
      create: () => [{ from: MATH.from + 1, to: MATH.to - 1 }],
      update: value => value
    });

    const plain = mount([diagnostics, marks(MATH.from + 1, MATH.to - 1)]);
    expect(count(plain)).toBe(0);

    const revealed = mount([
      diagnostics,
      marks(MATH.from + 1, MATH.to - 1),
      revealFrom([diagnostics], state => state.field(diagnostics))
    ]);
    expect(count(revealed)).toBe(1);
    expect(revealed.contentDOM.querySelectorAll('.cm-lv-math')).toHaveLength(0);
  });

  it('keeps the local caret able to reach table source', () => {
    const doc = ['intro', '', '\\begin{tabular}{ll}', '  one & two \\\\', '\\end{tabular}'].join('\n');
    const view = new EditorView({
      state: EditorState.create({ doc, selection: { anchor: 0 }, extensions: [visualExtension()] }),
      parent: document.body
    });
    view.dispatch({
      effects: setVisualState.of({ enabled: true, language: 'latex', showCommands: false, maxDepth: 12 })
    });

    expect(view.contentDOM.querySelectorAll('.cm-lv-table')).toHaveLength(1);

    view.dispatch({ selection: { anchor: doc.indexOf('two') } });
    expect(view.contentDOM.querySelectorAll('.cm-lv-table')).toHaveLength(0);
  });
});
