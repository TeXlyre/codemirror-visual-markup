import { Rule } from '../../core/language';
import { Range, Token } from '../../core/tokens';
import { inner, isEscaped, matchDelimited, matchFenced, matchLine, skipSpace } from '../../core/scanner';
import { ARGUMENT_COUNT, ESCAPABLE, HEADING_LEVELS, MATH_ENVIRONMENTS, VERBATIM_ENVIRONMENTS } from './commands';

const MATH_DELIMITERS: Array<[string, string, boolean]> = [
  ['$$', '$$', true],
  ['\\[', '\\]', true],
  ['\\(', '\\)', false],
  ['$', '$', false]
];

export const comment: Rule = (source, pos) => {
  if (source[pos] !== '%' || isEscaped(source, pos)) return null;
  const line = matchLine(source, pos);
  return { kind: 'comment', from: pos, to: line.to, body: { from: pos + 1, to: line.to } };
};

export const escape: Rule = (source, pos) => {
  if (source[pos] !== '\\') return null;
  const next = source[pos + 1];
  if (!next || !ESCAPABLE.has(next)) return null;
  return { kind: 'raw', from: pos, to: pos + 2 };
};

export const math: Rule = (source, pos, ctx) => {
  for (const [open, close, display] of MATH_DELIMITERS) {
    if (!source.startsWith(open, pos)) continue;
    if (open === '$' && source.startsWith('$$', pos)) continue;
    const range = matchFenced(source, pos, open, close);
    if (!range) continue;
    const body = inner(range, open.length, close.length);
    if (body.to <= body.from) continue;
    return { kind: 'math', from: range.from, to: range.to, display, body, meta: { open, close } };
  }
  return null;
};

export const environment: Rule = (source, pos, ctx) => {
  if (!source.startsWith('\\begin{', pos)) return null;

  const header = /^\\begin\{([^}\n]+)\}/.exec(source.slice(pos));
  if (!header) return null;

  const name = header[1];
  const end = findMatchingEnd(source, pos + header[0].length, name);
  if (end === -1) return null;

  const headerArgs = consumeArguments(source, pos + header[0].length);

  const token: Token = {
    kind: name === 'tabular' || name === 'tabularx' ? 'table' : 'container',
    name,
    from: pos,
    to: end + `\\end{${name}}`.length,
    body: { from: headerArgs.to, to: end },
    args: headerArgs.args
  };

  if (!VERBATIM_ENVIRONMENTS.has(name) && token.kind !== 'table') {
    token.children = ctx.parse(token.body!.from, token.body!.to);
  }
  if (MATH_ENVIRONMENTS.has(name)) {
    token.kind = 'math';
    token.display = true;
    token.children = undefined;
  }

  return token;
};

export const heading: Rule = (source, pos) => {
  if (source[pos] !== '\\') return null;

  const match = /^\\([a-zA-Z]+)\*?/.exec(source.slice(pos));
  if (!match) return null;

  const level = HEADING_LEVELS.get(match[1]);
  if (level === undefined) return null;

  const braces = matchDelimited(source, skipSpace(source, pos + match[0].length), '{');
  if (!braces) return null;

  return {
    kind: 'heading',
    name: match[1],
    level,
    from: pos,
    to: braces.to,
    body: inner(braces, 1, 1)
  };
};

export const item: Rule = (source, pos) => {
  if (!source.startsWith('\\item', pos)) return null;
  if (/[a-zA-Z]/.test(source[pos + 5] || '')) return null;

  let to = pos + 5;
  const label = matchDelimited(source, to, '[');
  if (label) to = label.to;

  return { kind: 'item', from: pos, to, body: label ? inner(label, 1, 1) : undefined };
};

export const command: Rule = (source, pos, ctx) => {
  if (source[pos] !== '\\') return null;

  const match = /^\\([a-zA-Z]+\*?)/.exec(source.slice(pos));
  if (!match) return null;

  const name = match[1];
  const { args, to } = consumeArguments(source, pos + match[0].length, ARGUMENT_COUNT.get(name));
  const body = args[args.length - 1];

  const token: Token = { kind: 'command', name, from: pos, to, body, args };
  if (body) token.children = ctx.parse(body.from, body.to);
  return token;
};

export const rules: Rule[] = [comment, math, environment, heading, item, escape, command];

function consumeArguments(source: string, pos: number, limit?: number): { args: Range[]; to: number } {
  const args: Range[] = [];
  let cursor = pos;

  while (limit === undefined || args.length < limit) {
    const next = skipSpace(source, cursor, true);
    const optional = matchDelimited(source, next, '[');
    if (optional) {
      cursor = optional.to;
      continue;
    }
    const braces = matchDelimited(source, next, '{');
    if (!braces) break;
    args.push(inner(braces, 1, 1));
    cursor = braces.to;
  }

  return { args, to: cursor };
}

function findMatchingEnd(source: string, from: number, name: string): number {
  const open = `\\begin{${name}}`;
  const close = `\\end{${name}}`;
  let depth = 1;
  let cursor = from;

  while (cursor < source.length && depth > 0) {
    const nextOpen = source.indexOf(open, cursor);
    const nextClose = source.indexOf(close, cursor);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      cursor = nextOpen + open.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      cursor = nextClose + close.length;
    }
  }

  return -1;
}
