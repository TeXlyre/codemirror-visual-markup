import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Tokenizer } from '../src/core/tokenizer';
import { Token, walk } from '../src/core/tokens';
import { typst } from '../src/languages/typst';
import { createImageResolver, imageResolver } from '../src/view/images';
import { setVisualState, visualExtension } from '../src/view/visual-editor';
import '../src/view/widgets';

const tokenize = (source: string) => new Tokenizer(typst).tokenize(source);

const flatten = (tokens: Token[]): Token[] => {
  const out: Token[] = [];
  walk(tokens, token => out.push(token));
  return out;
};

const mount = async (doc: string) => {
  const resolver = createImageResolver(() => '/main.typ', async () => 'blob:img');
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: 0 },
      extensions: [visualExtension(), imageResolver.of(resolver)]
    }),
    parent: document.body
  });
  view.dispatch({
    effects: setVisualState.of({ enabled: true, language: 'typst', showCommands: false, maxDepth: 12 })
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return view;
};

describe('typst code arguments', () => {
  it('parses a figure into a call, arguments and a content block', () => {
    const source = '#figure(image("plot.png"), caption: [A *nice* plot])';
    const [figure] = tokenize(source);

    expect(figure.name).toBe('figure');
    expect(source.slice(figure.from, figure.to)).toBe(source);

    const kinds = figure.children!.map(child => `${child.kind}/${child.name ?? ''}`);
    expect(kinds).toEqual([
      'command/image',
      'raw/separator',
      'raw/argument',
      'raw/separator',
      'container/content'
    ]);

    const strong = flatten(figure.children!).find(child => child.name === 'strong')!;
    expect(source.slice(strong.from, strong.to)).toBe('*nice*');
  });

  it('reads the image path from a nested call', () => {
    const source = '#figure(image("img/plot.png"), caption: [x])';
    const image = flatten(tokenize(source)).find(token => token.name === 'image')!;

    expect(typst.imageSrc!(source, image)).toBe('img/plot.png');
  });

  it('renders the figure as an image plus an editable caption', async () => {
    const view = await mount('intro\n\n#figure(image("plot.png"), caption: [A *nice* plot])');

    expect(view.contentDOM.querySelectorAll('.cm-lv-image img')).toHaveLength(1);
    expect(view.contentDOM.textContent).toContain('A nice plot');
    expect(view.contentDOM.textContent).not.toContain('caption:');
    expect(view.contentDOM.textContent).not.toContain('#figure');
  });

  it('handles a multi-line figure', async () => {
    const view = await mount(['intro', '', '#figure(', '  image("plot.png"),', '  caption: [Wide],', ')'].join('\n'));

    expect(view.contentDOM.querySelectorAll('.cm-lv-image img')).toHaveLength(1);
    expect(view.contentDOM.textContent).toContain('Wide');
  });

  it('leaves content-block commands parsing their content as markup', () => {
    const source = '#text(fill: red)[a *b*]';
    const [token] = tokenize(source);

    expect(source.slice(token.body!.from, token.body!.to)).toBe('a *b*');
    expect(token.children!.some(child => child.name === 'strong')).toBe(true);
    expect(token.meta?.args).toBeUndefined();
  });

  it('keeps statements opaque', () => {
    const [token] = tokenize('#let x = (1, 2)\nrest');

    expect(token.meta?.statement).toBe('true');
    expect(token.children).toBeUndefined();
    expect(typst.style(token)).toEqual({ class: 'cm-lv-cmd-unknown', keepSyntax: true });
  });

  it('renders table constructs as visual cells instead of keeping their syntax opaque', async () => {
    const view = await mount('intro\n\n#table(columns: 2, [a], [b])');
    expect(view.contentDOM.querySelectorAll('.cm-lv-cell')).toHaveLength(2);
    expect(view.contentDOM.textContent).not.toContain('#table');
    expect(view.contentDOM.textContent).toContain('a');
    expect(view.contentDOM.textContent).toContain('b');
  });

  it('round-trips unbalanced and empty argument lists', () => {
    for (const source of ['#figure(', '#figure()', '#image(', '#figure(image(', 'caption:', '#link("u")[t]']) {
      const tokens = tokenize(source);
      expect(tokens.map(token => source.slice(token.from, token.to)).join('')).toBe(source);
    }
  });

  it('reveals the whole call when the caret is inside it', async () => {
    const doc = 'intro\n\n#figure(image("plot.png"), caption: [x])';
    const view = await mount(doc);
    expect(view.contentDOM.querySelectorAll('.cm-lv-image img')).toHaveLength(1);

    view.dispatch({ selection: { anchor: doc.indexOf('caption') } });
    expect(view.contentDOM.textContent).toContain('caption:');
  });

  it('nests calls without losing offsets', () => {
    const source = '#figure(figure(image("a.png")))';
    const names = flatten(tokenize(source))
      .filter(token => token.kind === 'command')
      .map(token => token.name);

    expect(names).toEqual(['figure', 'figure', 'image']);
    expect(tokenize(source).map(token => source.slice(token.from, token.to)).join('')).toBe(source);
  });
});
