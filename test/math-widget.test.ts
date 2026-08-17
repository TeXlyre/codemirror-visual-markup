import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { setVisualState, visualExtension } from '../src/view/visual-editor';
import { preloadMath } from '../src/view/math-field';
import '../src/languages/latex';
import '../src/languages/typst';
import '../src/view/widgets';

const mount = (doc: string, language = 'latex') => {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: 0 }, extensions: [visualExtension()] }),
    parent: document.body
  });
  view.dispatch({
    effects: setVisualState.of({ enabled: true, language, showCommands: false, maxDepth: 12 })
  });
  return view;
};

const container = (view: EditorView) => view.contentDOM.querySelector('.cm-lv-math') as HTMLElement;
type TestMathfield = HTMLElement & {
  value: string;
  lastSetValue?: string;
  lastSetValueFormat?: string;
  lastGetValueFormat?: string;
};

const field = (view: EditorView) => container(view).firstElementChild as TestMathfield;

const focusOut = (view: EditorView, relatedTarget: Node | null) =>
  container(view).dispatchEvent(new FocusEvent('focusout', { relatedTarget: relatedTarget as EventTarget, bubbles: true }));

describe('math widget editing', () => {
  beforeAll(async () => {
    await preloadMath();
  });
  it('commits an edit when focus leaves entirely', () => {
    const view = mount('text $x$ more');
    field(view).value = 'y^2';
    focusOut(view, null);

    expect(view.state.doc.toString()).toBe('text $y^2$ more');
  });

  it('does not commit when focus moves to the virtual keyboard', () => {
    const view = mount('text $x$ more');
    const keyboard = document.createElement('div');
    keyboard.className = 'ML__keyboard';
    document.body.appendChild(keyboard);

    const key = document.createElement('button');
    keyboard.appendChild(key);

    field(view).value = 'y^2';
    focusOut(view, key);

    expect(view.state.doc.toString()).toBe('text $x$ more');
    keyboard.remove();
  });

  it('does not commit when focus stays inside the widget', () => {
    const view = mount('text $x$ more');
    field(view).value = 'y^2';
    focusOut(view, field(view));

    expect(view.state.doc.toString()).toBe('text $x$ more');
  });

  it('leaves the document untouched when the value is unchanged', () => {
    const view = mount('text $x$ more');
    const before = view.state.doc.toString();
    focusOut(view, null);

    expect(view.state.doc.toString()).toBe(before);
  });

  it('never marks the field read-only, so the keyboard stays usable', () => {
    const view = mount('text $x$ more');
    container(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect((field(view) as unknown as { readOnly?: boolean }).readOnly).not.toBe(true);
  });

  it('commits on an explicit change event', () => {
    const view = mount('text $x$ more');
    field(view).value = 'z';
    container(view).dispatchEvent(new Event('change', { bubbles: true }));

    expect(view.state.doc.toString()).toBe('text $z$ more');
  });

  it('parses Typst math for MathLive and commits Typst output', () => {
    const view = mount('before\n$ integral_(-oo)^oo e^(-x^2) dif x = sqrt(pi) $\nafter', 'typst');
    const mathfield = field(view);

    expect(mathfield.lastSetValueFormat).toBe('ascii-math');
    expect(mathfield.lastSetValue).toBe('int_(-oo)^oo e^(-x^2) dx = sqrt(pi)');

    mathfield.value = 'integral_0^1 x dif x';
    container(view).dispatchEvent(new Event('change', { bubbles: true }));

    expect(mathfield.lastGetValueFormat).toBe('typst');
    expect(view.state.doc.toString()).toBe('before\n$ integral_0^1 x dif x $\nafter');

    const roundTrip = mount('before\n$ integral_(-infinity)^infinity e^(-x^2) dif x = sqrt(pi) $\nafter', 'typst');
    expect(field(roundTrip).lastSetValue).toBe('int_(-oo)^oo e^(-x^2) dx = sqrt(pi)');
  });
});
