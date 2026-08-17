import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { setVisualState, visualExtension } from '../src/view/visual-editor';
import '../src/languages/latex';
import '../src/view/widgets';

const mount = (doc: string) => {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: 0 }, extensions: [visualExtension()] }),
    parent: document.body
  });
  view.dispatch({
    effects: setVisualState.of({ enabled: true, language: 'latex', showCommands: false, maxDepth: 12 })
  });
  return view;
};

const container = (view: EditorView) => view.contentDOM.querySelector('.cm-lv-math') as HTMLElement;
const field = (view: EditorView) => container(view).firstElementChild as HTMLElement & { value: string };

const focusOut = (view: EditorView, relatedTarget: Node | null) =>
  container(view).dispatchEvent(new FocusEvent('focusout', { relatedTarget: relatedTarget as EventTarget, bubbles: true }));

describe('math widget editing', () => {
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
});
