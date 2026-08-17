import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createImageResolver, imageResolver, resolveImagePath } from '../src/view/images';
import { setVisualState, visualExtension } from '../src/view/visual-editor';
import { Tokenizer } from '../src/core/tokenizer';
import { latex } from '../src/languages/latex';
import { typst } from '../src/languages/typst';
import '../src/view/widgets';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const mount = (doc: string, language = 'latex', extensions: any[] = []) => {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: 0 }, extensions: [visualExtension(), ...extensions] }),
    parent: document.body
  });
  view.dispatch({ effects: setVisualState.of({ enabled: true, language, showCommands: false, maxDepth: 12 }) });
  return view;
};

const img = (view: EditorView) => view.contentDOM.querySelector('.cm-lv-image img') as HTMLImageElement | null;

describe('path resolution', () => {
  it.each([
    ['/doc/main.tex', 'fig.png', '/doc/fig.png'],
    ['/doc/main.tex', './img/fig.png', '/doc/img/fig.png'],
    ['/doc/ch/main.tex', '../fig.png', '/doc/fig.png'],
    ['/doc/ch/deep/main.tex', '../../a/b.png', '/doc/a/b.png'],
    ['/doc/main.tex', '/abs/fig.png', '/abs/fig.png'],
    ['main.tex', 'fig.png', '/fig.png']
  ])('resolves %s + %s', (current, src, expected) => {
    expect(resolveImagePath(current, src)).toBe(expected);
  });
});

describe('image widgets', () => {
  it('extracts the source path in both languages', () => {
    const tex = '\\includegraphics[width=0.5\\textwidth]{img/plot.png}';
    const [texToken] = new Tokenizer(latex).tokenize(tex);
    expect(latex.imageSrc!(tex, texToken)).toBe('img/plot.png');

    const typ = '#image("img/plot.png", width: 50%)';
    const [typToken] = new Tokenizer(typst).tokenize(typ);
    expect(typst.imageSrc!(typ, typToken)).toBe('img/plot.png');
  });

  it('renders external urls directly', () => {
    const view = mount('text \\includegraphics{https://example.com/a.png} end');
    expect(img(view)!.src).toBe('https://example.com/a.png');
  });

  it('resolves project-relative paths through the resolver', async () => {
    const seen: string[] = [];
    const resolver = createImageResolver(
      () => '/doc/ch/main.tex',
      async path => {
        seen.push(path);
        return 'blob:resolved';
      }
    );

    const view = mount('text \\includegraphics{../img/plot.png} end', 'latex', [imageResolver.of(resolver)]);
    await flush();

    expect(seen).toEqual(['/doc/img/plot.png']);
    expect(img(view)!.src).toBe('blob:resolved');
  });

  it('caches by resolved path across widgets', async () => {
    let calls = 0;
    const resolver = createImageResolver(() => '/main.tex', async () => {
      calls++;
      return 'blob:x';
    });

    mount('text \\includegraphics{a.png} and \\includegraphics{a.png}', 'latex', [imageResolver.of(resolver)]);
    await flush();

    expect(calls).toBe(1);
  });

  it('marks unresolvable images instead of failing', async () => {
    const resolver = createImageResolver(() => '/main.tex', async () => null);
    const view = mount('text \\includegraphics{missing.png}', 'latex', [imageResolver.of(resolver)]);
    await flush();

    expect(view.contentDOM.querySelector('.cm-lv-image-missing')).not.toBeNull();
  });

  it('renders typst images', async () => {
    const resolver = createImageResolver(() => '/main.typ', async () => 'blob:typ');
    const view = mount('text #image("plot.png", width: 50%)', 'typst', [imageResolver.of(resolver)]);
    await flush();

    expect(img(view)!.src).toBe('blob:typ');
  });

  it('reveals the source when the caret enters the construct', () => {
    const doc = 'text \\includegraphics{a.png} end';
    const view = mount(doc);
    expect(img(view)).not.toBeNull();

    view.dispatch({ selection: { anchor: doc.indexOf('a.png') } });
    expect(img(view)).toBeNull();
  });

  it('keeps a figure caption editable alongside the image', () => {
    const doc = ['\\begin{figure}', '  \\includegraphics{a.png}', '  \\caption{A caption}', '\\end{figure}'].join('\n');
    const view = mount(doc);

    expect(img(view)).not.toBeNull();
    expect(view.contentDOM.textContent).toContain('A caption');
  });

  it('revokes object urls on dispose', async () => {
    const revoke = jest.fn();
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, writable: true });

    const resolver = createImageResolver(() => '/main.tex', async () => 'blob:gone');
    mount('text \\includegraphics{a.png}', 'latex', [imageResolver.of(resolver)]);
    await flush();

    resolver.dispose!();
    await flush();

    expect(revoke).toHaveBeenCalledWith('blob:gone');
  });
});
