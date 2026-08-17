import { EditorState } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { buildDecorations } from '../src/view/decorations';
import { Language } from '../src/core/language';
import { latex } from '../src/languages/latex';
import { typst } from '../src/languages/typst';
import '../src/view/widgets';

interface Emitted {
  from: number;
  to: number;
  class?: string;
  widget: boolean;
}

function decorate(source: string, options: { language?: Language; showCommands?: boolean; at?: number } = {}) {
  const state = EditorState.create({
    doc: source,
    selection: options.at === undefined ? undefined : { anchor: options.at }
  });

  const result = buildDecorations(state, {
    language: options.language ?? latex,
    showCommands: options.showCommands ?? false
  });

  const ranges: Emitted[] = [];
  const cursor = result.decorations.iter();

  while (cursor.value) {
    ranges.push({
      from: cursor.from,
      to: cursor.to,
      class: (cursor.value.spec as { class?: string }).class,
      widget: Boolean((cursor.value.spec as { widget?: unknown }).widget)
    });
    cursor.next();
  }

  return { ranges, atomic: result.atomic, tokens: result.tokens };
}

describe('decoration builder', () => {
  it('hides syntax and marks the body', () => {
    const source = 'a \\textbf{bold} b';
    const { ranges } = decorate(source);

    const marks = ranges.filter(range => range.class);
    expect(marks).toHaveLength(1);
    expect(source.slice(marks[0].from, marks[0].to)).toBe('bold');

    const hidden = ranges.filter(range => !range.class && !range.widget);
    expect(hidden.map(range => source.slice(range.from, range.to))).toEqual(['\\textbf{', '}']);
  });

  it('emits a mark for every nesting level', () => {
    const classes = decorate('\\textbf{a \\textit{b} c}')
      .ranges.filter(range => range.class)
      .map(range => range.class);

    expect(classes).toEqual(['cm-lv-bold', 'cm-lv-italic']);
  });

  it('keeps markup visible when showCommands is set', () => {
    const { ranges } = decorate('\\textbf{bold}', { showCommands: true });
    expect(ranges.every(range => range.class)).toBe(true);
  });

  it('uses line decorations for block constructs', () => {
    const line = decorate('\\section{Title}\n\ntext').ranges.find(range =>
      range.class?.includes('cm-lv-heading')
    )!;

    expect(line.from).toBe(0);
    expect(line.to).toBe(0);
  });

  it('replaces math atomically', () => {
    const source = 'text $x$ more';
    const { atomic } = decorate(source);

    expect(atomic.size).toBe(1);
    const cursor = atomic.iter();
    expect(cursor.from).toBe(source.indexOf('$'));
    expect(cursor.to).toBe(source.lastIndexOf('$') + 1);
  });

  it('reveals markup when the selection touches a construct', () => {
    const source = 'a \\textbf{bold} b';
    const away = decorate(source, { at: 0 }).ranges.length;
    const inside = decorate(source, { at: source.indexOf('bold') }).ranges.length;

    expect(inside).toBeLessThan(away);
  });

  it('renders typst through the same pipeline', () => {
    const source = '= Title\n\n*bold* text';
    const { ranges } = decorate(source, { language: typst });

    expect(ranges.some(range => range.class?.includes('cm-lv-h1'))).toBe(true);
    expect(ranges.some(range => range.class === 'cm-lv-bold')).toBe(true);
  });

  it('produces a decoration set CodeMirror accepts', () => {
    const source = '\\begin{itemize}\n  \\item $a$ and \\textbf{b}\n\\end{itemize}';
    const { ranges } = decorate(source);

    expect(() =>
      Decoration.set(
        ranges.map(range => Decoration.mark({ class: 'x' }).range(range.from, Math.max(range.to, range.from + 1))),
        true
      )
    ).not.toThrow();
  });
});
