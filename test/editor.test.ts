import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DualLatexEditor, DualVisualEditor, latexVisualKeymap } from '../src/ui/dual-editor';
import { setVisualState, visualExtension } from '../src/view/visual-editor';
import { setMacroSignatures } from '../src/languages/latex';
import { Tokenizer } from '../src/core/tokenizer';
import { latex } from '../src/languages/latex';
import '../src/languages/typst';

const SOURCE = [
  '\\section{Intro}',
  '',
  'Text with $x^2$ and \\textbf{bold \\textit{nested}}.',
  '',
  '\\begin{itemize}',
  '  \\item first',
  '  \\item second $a+b$',
  '\\end{itemize}'
].join('\n');

const mount = (doc = SOURCE, options = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const view = new EditorView({ state: EditorState.create({ doc }) });
  return { host, view, editor: new DualLatexEditor(host, view, options) };
};

const decorationCount = (view: EditorView) => {
  let total = 0;
  for (const source of view.state.facet(EditorView.decorations)) {
    const set = typeof source === 'function' ? source(view) : source;
    total += set.size;
  }
  return total;
};

describe('dual editor', () => {
  it('mounts, switches mode and tears down', () => {
    const { host, editor } = mount();

    expect(host.querySelector('.lv-dual-editor')).not.toBeNull();
    expect(host.querySelector('.lv-mode-bar')).not.toBeNull();
    expect(host.querySelector('.lv-toolbar')).not.toBeNull();

    editor.setMode('visual');
    editor.setMode('source');
    editor.destroy();

    expect(host.querySelector('.lv-dual-editor')).toBeNull();
  });

  it('toggles command visibility and toolbar state', () => {
    const { editor } = mount();

    expect(editor.getConfig().showCommands).toBe(false);
    editor.toggleCommandVisibility();
    expect(editor.getConfig().showCommands).toBe(true);

    editor.toggleToolbar();
    expect(editor.getConfig().showToolbar).toBe(false);

    expect(latexVisualKeymap(editor)).toBeDefined();
    editor.destroy();
  });

  it('switches language and rejects unknown ones', () => {
    const host = document.createElement('div');
    const view = new EditorView({ state: EditorState.create({ doc: '= Title\n\n*bold*' }) });
    const editor = new DualVisualEditor(host, view, { language: 'typst', initialMode: 'visual' });

    expect(editor.getLanguage()).toBe('typst');
    editor.setLanguage('latex');
    expect(editor.getLanguage()).toBe('latex');
    expect(() => editor.setLanguage('nope')).toThrow();

    editor.destroy();
  });
});

describe('visual extension', () => {
  it('adds decorations only while enabled', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: SOURCE, extensions: [visualExtension()] })
    });

    expect(decorationCount(view)).toBe(0);

    view.dispatch({
      effects: setVisualState.of({ enabled: true, language: 'latex', showCommands: false, maxDepth: 12 })
    });
    expect(decorationCount(view)).toBeGreaterThan(0);

    view.dispatch({ effects: setVisualState.of({ enabled: false }) });
    expect(decorationCount(view)).toBe(0);
  });
});

describe('optional macro signatures', () => {
  it('accepts unified-latex style records without a dependency', () => {
    setMacroSignatures({ mycmd: { signature: 'm m' }, other: 3 });

    const source = '\\mycmd{a}{b}';
    const [token] = new Tokenizer(latex).tokenize(source);

    expect(token.args).toHaveLength(2);
    expect(source.slice(token.body!.from, token.body!.to)).toBe('b');
  });
});
