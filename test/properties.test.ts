import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { setVisualState, visualExtension } from '../src/view/visual-editor';
import { buildDecorations } from '../src/view/decorations';
import { Language } from '../src/core/language';
import { Tokenizer } from '../src/core/tokenizer';
import { Token, walk } from '../src/core/tokens';
import { latex } from '../src/languages/latex';
import { typst } from '../src/languages/typst';
import '../src/view/widgets';

const FRAGMENTS = [
  '\\section{A}', '\\subsection*{B}', '$x^2$', '$$\\int_0^1$$', '\\[y\\]', '\\(z\\)',
  '\\textbf{', '}', '\\begin{itemize}', '\\end{itemize}', '\\item', '\\begin{tabular}{ll}',
  '\\end{tabular}', 'a & b \\\\', '% comment\n', '\\%', '\\$', '\\\\', '\n\n', ' plain ',
  '\\textcolor{red}{x}', '\\begin{verbatim}$no$\\end{verbatim}', '\\unknown', '{', '$',
  '= Heading\n', '*bold*', '_em_', '#emph[x]', '`raw`', '```\nblock\n```', '// note\n',
  '/* block */', '- item\n', '+ item\n', '<label>', '@ref', '#let x = 1\n',
  '#figure(image("a.png"), caption: [A *cap*])', '#table(columns: 2, [a], [b])',
  '#image("a.png", width: 50%)', '#text(fill: red)[x]', '#emph[', 'caption:', ',,,',
  '"unterminated', '#figure(', ')', '[', ']', '#link("u")[t]', '#figure(\n  image("a"),\n)'
];

const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const randomSource = (random: () => number, parts: number) =>
  Array.from({ length: parts }, () => FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]).join('');

function checkTree(source: string, tokens: Token[], parent: Token | null): void {
  let previous = parent ? parent.from : 0;

  for (const token of tokens) {
    expect(token.from).toBeGreaterThanOrEqual(previous);
    expect(token.to).toBeGreaterThan(token.from);
    expect(token.to).toBeLessThanOrEqual(source.length);

    if (parent) {
      expect(token.from).toBeGreaterThanOrEqual(parent.from);
      expect(token.to).toBeLessThanOrEqual(parent.to);
    }
    if (token.body) {
      expect(token.body.from).toBeGreaterThanOrEqual(token.from);
      expect(token.body.to).toBeLessThanOrEqual(token.to);
    }
    if (token.children) checkTree(source, token.children, token);

    previous = token.to;
  }
}

describe.each([
  ['latex', latex],
  ['typst', typst]
])('%s invariants', (_name, language: Language) => {
  it('tokenizes losslessly over random input', () => {
    const random = mulberry(20260817);

    for (let iteration = 0; iteration < 400; iteration++) {
      const source = randomSource(random, 1 + Math.floor(random() * 25));
      const tokens = new Tokenizer(language).tokenize(source);

      expect(tokens.map(token => source.slice(token.from, token.to)).join('')).toBe(source);
      checkTree(source, tokens, null);
    }
  });

  it('keeps decorations inside the document and never overlaps replacements', () => {
    const random = mulberry(7);

    for (let iteration = 0; iteration < 400; iteration++) {
      const source = randomSource(random, 1 + Math.floor(random() * 15));
      const anchor = Math.floor(random() * (source.length + 1));
      const state = EditorState.create({ doc: source, selection: { anchor } });

      for (const showCommands of [false, true]) {
        const { decorations } = buildDecorations(state, { language, showCommands });
        const cursor = decorations.iter();
        let lastReplaceEnd = -1;

        while (cursor.value) {
          expect(cursor.from).toBeGreaterThanOrEqual(0);
          expect(cursor.to).toBeLessThanOrEqual(source.length);
          expect(cursor.to).toBeGreaterThanOrEqual(cursor.from);

          if ((cursor.value.spec as { class?: string }).class === undefined) {
            expect(cursor.from).toBeGreaterThanOrEqual(lastReplaceEnd);
            lastReplaceEnd = cursor.to;
          }
          cursor.next();
        }
      }
    }
  });

  it('produces decoration sets CodeMirror accepts', () => {
    const random = mulberry(99);

    for (let iteration = 0; iteration < 60; iteration++) {
      const source = randomSource(random, 1 + Math.floor(random() * 12));
      const view = new EditorView({
        state: EditorState.create({ doc: source, selection: { anchor: 0 }, extensions: [visualExtension()] }),
        parent: document.body
      });

      expect(() => {
        view.dispatch({
          effects: setVisualState.of({ enabled: true, language: language.id, showCommands: false, maxDepth: 12 })
        });
        view.dispatch({ selection: { anchor: Math.min(3, source.length) } });
        view.dispatch({ changes: { from: 0, insert: 'x' } });
      }).not.toThrow();

      view.destroy();
    }
  });

  it('never hides a line break outside a block replacement', () => {
    const random = mulberry(4242);

    for (let iteration = 0; iteration < 200; iteration++) {
      const source = randomSource(random, 1 + Math.floor(random() * 15));
      const state = EditorState.create({
        doc: source,
        selection: { anchor: Math.floor(random() * (source.length + 1)) }
      });

      const { decorations } = buildDecorations(state, { language, showCommands: false });
      const cursor = decorations.iter();

      while (cursor.value) {
        const spec = cursor.value.spec as { class?: string; block?: boolean };
        const isInlineReplace = spec.class === undefined && spec.block !== true;

        if (isInlineReplace && cursor.to > cursor.from) {
          expect(source.slice(cursor.from, cursor.to)).not.toContain('\n');
        }
        cursor.next();
      }
    }
  });

  it('bounds nesting depth without losing text', () => {
    const open = language.id === 'latex' ? '\\textbf{' : '#emph[';
    const close = language.id === 'latex' ? '}' : ']';
    const source = open.repeat(80) + 'x' + close.repeat(80);

    const tokens = new Tokenizer(language, { maxDepth: 6 }).tokenize(source);
    let depth = 0;
    walk(tokens, (_token, level) => {
      depth = Math.max(depth, level);
    });

    expect(depth).toBeLessThanOrEqual(7);
    expect(tokens.map(token => source.slice(token.from, token.to)).join('')).toBe(source);
  });
});
