import { Tokenizer } from '../src/core/tokenizer';
import { Token, tokenAt, walk } from '../src/core/tokens';
import { latex } from '../src/languages/latex';
import { typst } from '../src/languages/typst';

const tokenize = (language: typeof latex, source: string) => new Tokenizer(language).tokenize(source);
const slice = (source: string, token: Token) => source.slice(token.from, token.to);

const flatten = (tokens: Token[]): Token[] => {
  const out: Token[] = [];
  walk(tokens, token => out.push(token));
  return out;
};

describe('latex tokenizer', () => {
  it('produces absolute offsets that reconstruct the source', () => {
    const source = 'Intro $x^2$ and \\textbf{bold} end.';
    const tokens = tokenize(latex, source);

    expect(tokens.map(token => slice(source, token)).join('')).toBe(source);
    for (const token of flatten(tokens)) {
      expect(token.to).toBeGreaterThan(token.from);
      expect(token.to).toBeLessThanOrEqual(source.length);
    }
  });

  it('nests commands to arbitrary depth', () => {
    const source = '\\textbf{a \\textit{b \\underline{c \\texttt{d}}}}';
    const names: (string | undefined)[] = [];
    walk(tokenize(latex, source), token => {
      if (token.kind === 'command') names.push(token.name);
    });

    expect(names).toEqual(['textbf', 'textit', 'underline', 'texttt']);
  });

  it('matches the correct end tag for nested environments', () => {
    const source = '\\begin{itemize}\n\\item one\n\\begin{itemize}\n\\item inner\n\\end{itemize}\n\\end{itemize}';
    const [outer] = tokenize(latex, source);
    const containers = flatten([outer]).filter(token => token.kind === 'container');

    expect(slice(source, outer)).toBe(source);
    expect(containers).toHaveLength(2);
    expect(slice(source, containers[1])).toBe('\\begin{itemize}\n\\item inner\n\\end{itemize}');
  });

  it('finds math nested inside a command', () => {
    const source = '\\textbf{weight $E=mc^2$ here}';
    const math = flatten(tokenize(latex, source)).find(token => token.kind === 'math')!;

    expect(slice(source, math)).toBe('$E=mc^2$');
    expect(source.slice(math.body!.from, math.body!.to)).toBe('E=mc^2');
  });

  it('distinguishes display math from escaped dollars', () => {
    const source = 'cost \\$5 then $$\\int_0^1 x$$';
    const math = flatten(tokenize(latex, source)).filter(token => token.kind === 'math');

    expect(math).toHaveLength(1);
    expect(math[0].display).toBe(true);
    expect(slice(source, math[0])).toBe('$$\\int_0^1 x$$');
  });

  it.each(['$x', '\\begin{itemize}\n\\item a', '\\textbf{open'])(
    'leaves unterminated construct %p as plain text',
    source => {
      const tokens = tokenize(latex, source);
      expect(tokens.map(token => slice(source, token)).join('')).toBe(source);
      expect(tokens.every(token => token.kind !== 'container')).toBe(true);
    }
  );

  it('exposes the content argument of multi-argument commands', () => {
    const source = '\\textcolor{red}{warning}';
    const [token] = tokenize(latex, source);

    expect(token.args).toHaveLength(2);
    expect(source.slice(token.body!.from, token.body!.to)).toBe('warning');
  });

  it('does not tokenize verbatim content', () => {
    const [token] = tokenize(latex, '\\begin{verbatim}\n$not math$\n\\end{verbatim}');
    expect(token.children).toBeUndefined();
  });

  it('resolves the innermost token at a position', () => {
    const source = '\\textbf{a $x$ b}';
    const found = tokenAt(tokenize(latex, source), source.indexOf('$') + 1);
    expect(found!.kind).toBe('math');
  });
});

describe('typst tokenizer', () => {
  it('parses headings, emphasis, code and math', () => {
    const source = '= Title\n\nSome *bold _mixed_* text and #emph[call] plus $x^2$.';
    const tokens = flatten(tokenize(typst, source));

    const heading = tokens.find(token => token.kind === 'heading')!;
    expect(heading.level).toBe(1);
    expect(source.slice(heading.body!.from, heading.body!.to)).toBe('Title');

    expect(tokens.filter(token => token.kind === 'command').map(token => token.name)).toEqual([
      'strong',
      'emph',
      'emph'
    ]);
    expect(tokens.some(token => token.kind === 'math')).toBe(true);
  });

  it('treats raw blocks and comments as opaque', () => {
    const source = '```\n*not bold*\n```\n// note *not bold*\n';
    const tokens = tokenize(typst, source);

    expect(tokens.filter(token => token.kind === 'raw')).toHaveLength(1);
    expect(tokens.filter(token => token.kind === 'comment')).toHaveLength(1);
    expect(tokens.every(token => token.children === undefined)).toBe(true);
  });
});
