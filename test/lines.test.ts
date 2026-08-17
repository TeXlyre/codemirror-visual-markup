import { EditorState } from '@codemirror/state';
import { buildDecorations } from '../src/view/decorations';
import { latex } from '../src/languages/latex';
import { typst } from '../src/languages/typst';
import '../src/view/widgets';

const spans = (doc: string, language = latex, anchor = 0) => {
  const state = EditorState.create({ doc, selection: { anchor } });
  const { decorations } = buildDecorations(state, { language, showCommands: false });
  const out: { from: number; to: number; spec: Record<string, unknown> }[] = [];
  const cursor = decorations.iter();

  while (cursor.value) {
    out.push({ from: cursor.from, to: cursor.to, spec: cursor.value.spec as Record<string, unknown> });
    cursor.next();
  }

  return out;
};

const crossesNewline = (doc: string, language = latex) =>
  spans(doc, language)
    .filter(span => span.to > span.from)
    .some(span => doc.slice(span.from, span.to).includes('\n'));

describe('line integrity', () => {
  const cases: [string, string][] = [
    ['itemize', '\\begin{itemize}\n  \\item one\n  \\item two\n\\end{itemize}'],
    ['nested lists', '\\begin{itemize}\n  \\item a\n  \\begin{enumerate}\n    \\item b\n  \\end{enumerate}\n\\end{itemize}'],
    ['lstlisting', '\\begin{lstlisting}\nint main() {}\n\\end{lstlisting}'],
    ['tabular', '\\begin{tabular}{ll}\n  a & b \\\\\n  c & d \\\\\n\\end{tabular}'],
    ['figure', '\\begin{figure}\n  \\includegraphics{a.png}\n  \\caption{Cap}\n\\end{figure}'],
    ['sections', '\\section{One}\n\ntext\n\n\\subsection{Two}\n\nmore']
  ];

  it.each(cases)('no decoration spans a line break: %s', (_name, doc) => {
    expect(crossesNewline(doc)).toBe(false);
  });

  it('no decoration spans a line break in typst', () => {
    const doc = '= Title\n\n- one\n- two\n\n#figure(\n  image("a.png"),\n  caption: [Cap],\n)';
    expect(crossesNewline(doc, typst)).toBe(false);
  });

  it('every document position keeps its own line', () => {
    const doc = '\\begin{itemize}\n  \\item one\n\\end{itemize}';
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const { decorations } = buildDecorations(state, { language: latex, showCommands: false });

    for (let line = 1; line <= state.doc.lines; line++) {
      const info = state.doc.line(line);
      let replacedInside = false;

      decorations.between(info.from, info.to, (from, to, value) => {
        const spec = value.spec as { class?: string };
        if (spec.class === undefined && (from < info.from || to > info.to)) replacedInside = true;
      });

      expect(replacedInside).toBe(false);
    }
  });

  it('marks fully hidden lines so they can be collapsed by css', () => {
    const doc = 'intro\n\n\\begin{itemize}\n  \\item one\n\\end{itemize}';
    const lines = spans(doc)
      .filter(span => (span.spec as { class?: string }).class === 'cm-lv-syntax-line')
      .map(span => doc.slice(span.from, doc.indexOf('\n', span.from) === -1 ? undefined : doc.indexOf('\n', span.from)));

    expect(lines).toEqual(['\\begin{itemize}', '\\end{itemize}']);
  });
});

describe('inline math boundaries', () => {
  it('does not treat a blank line as inline math content', () => {
    const doc = 'cost $5 and\n\nlater $10 more';
    const tokens = spans(doc).filter(span => (span.spec as { widget?: unknown }).widget);

    expect(tokens).toHaveLength(0);
  });

  it('still matches inline math on one line', () => {
    expect(spans('a $x^2$ b').some(span => (span.spec as { widget?: unknown }).widget)).toBe(true);
  });

  it('allows inline math to wrap a single line break', () => {
    const doc = 'a $x +\ny$ b';
    expect(crossesNewline(doc)).toBe(false);
  });

  it('keeps display math as a block replacement', () => {
    const doc = 'intro\n\n\\begin{align}\n  x &= 1\n\\end{align}';
    const block = spans(doc).find(span => (span.spec as { block?: boolean }).block === true);

    expect(block).toBeDefined();
    expect(doc.slice(block!.from, block!.to)).toContain('align');
  });
});
