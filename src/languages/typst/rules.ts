import { ParseMode, Rule, RuleContext } from '../../core/language';
import { Range, Token } from '../../core/tokens';
import { atLineStart, inner, matchDelimited, matchFenced, matchLine } from '../../core/scanner';

const CODE_KEYWORDS = new Set(['let', 'set', 'show', 'import', 'include', 'if', 'else', 'for', 'while']);

export const comment: Rule = (source, pos) => {
  if (source.startsWith('//', pos)) {
    const line = matchLine(source, pos);
    return { kind: 'comment', from: pos, to: line.to, body: { from: pos + 2, to: line.to } };
  }
  const block = matchFenced(source, pos, '/*', '*/');
  return block ? { kind: 'comment', from: block.from, to: block.to, body: inner(block, 2, 2) } : null;
};

export const escape: Rule = (source, pos) => {
  if (source[pos] !== '\\' || !source[pos + 1]) return null;
  return { kind: 'raw', from: pos, to: pos + 2 };
};

export const heading: Rule = (source, pos) => {
  if (source[pos] !== '=' || !atLineStart(source, pos)) return null;

  const match = /^(=+)[ \t]+/.exec(source.slice(pos));
  if (!match) return null;

  const line = matchLine(source, pos);
  return {
    kind: 'heading',
    level: match[1].length,
    from: pos,
    to: line.to,
    body: { from: pos + match[0].length, to: line.to }
  };
};

export const raw: Rule = (source, pos) => {
  const block = matchFenced(source, pos, '```', '```');
  if (block) return { kind: 'raw', name: 'block', from: block.from, to: block.to, body: inner(block, 3, 3) };

  if (source[pos] !== '`') return null;
  const span = matchFenced(source, pos, '`', '`');
  return span ? { kind: 'raw', name: 'inline', from: span.from, to: span.to, body: inner(span, 1, 1) } : null;
};

export const math: Rule = (source, pos) => {
  if (source[pos] !== '$') return null;
  const range = matchFenced(source, pos, '$', '$');
  if (!range) return null;

  const body = inner(range, 1, 1);
  if (body.to <= body.from) return null;

  const display = /^\s/.test(source.slice(body.from, body.from + 1)) && /\s$/.test(source.slice(body.to - 1, body.to));
  return { kind: 'math', from: range.from, to: range.to, display, body, meta: { open: '$', close: '$' } };
};

export const emphasis: Rule = (source, pos, ctx) => {
  const marker = source[pos];
  if (marker !== '*' && marker !== '_') return null;
  if (/[\w]/.test(source[pos - 1] || '')) return null;

  const range = matchFenced(source, pos, marker, marker);
  if (!range) return null;

  const body = inner(range, 1, 1);
  if (body.to <= body.from || /^\s|\s$/.test(source.slice(body.from, body.to))) return null;

  return {
    kind: 'command',
    name: marker === '*' ? 'strong' : 'emph',
    from: range.from,
    to: range.to,
    body,
    children: ctx.parse(body.from, body.to)
  };
};

export const item: Rule = (source, pos) => {
  if (!atLineStart(source, pos)) return null;
  const match = /^([-+]|\/)[ \t]+/.exec(source.slice(pos));
  if (!match) return null;
  return { kind: 'item', name: match[1] === '+' ? 'number' : 'bullet', from: pos, to: pos + match[0].length };
};

function callToken(source: string, pos: number, ctx: RuleContext, prefix: number): Token | null {
  const match = /^([a-zA-Z][\w.-]*)/.exec(source.slice(pos + prefix));
  if (!match) return null;

  const name = match[1];
  let cursor = pos + prefix + match[0].length;

  const args: Range[] = [];
  let content: Range | undefined;

  const parens = matchDelimited(source, cursor, '(');
  if (parens) {
    args.push(inner(parens, 1, 1));
    cursor = parens.to;
  }

  const brackets = matchDelimited(source, cursor, '[');
  if (brackets) {
    content = inner(brackets, 1, 1);
    args.push(content);
    cursor = brackets.to;
  }

  const body = content ?? args[0];
  const token: Token = {
    kind: name === 'table' || name === 'grid' ? 'table' : 'command',
    name,
    from: pos,
    to: cursor,
    args,
    body
  };

  if (content) {
    token.children = ctx.parse(content.from, content.to, 'markup');
  } else if (args[0]) {
    token.children = ctx.parse(args[0].from, args[0].to, 'code');
    token.meta = { args: 'code' };
  }

  return token;
}

export const code: Rule = (source, pos, ctx) => {
  if (source[pos] !== '#') return null;

  const keyword = /^#([a-zA-Z][\w.-]*)/.exec(source.slice(pos));
  if (keyword && CODE_KEYWORDS.has(keyword[1])) {
    const line = matchLine(source, pos);
    return { kind: 'command', name: keyword[1], from: pos, to: line.to, meta: { statement: 'true' } };
  }

  return callToken(source, pos, ctx, 1);
};

export const call: Rule = (source, pos, ctx) => {
  if (!/[a-zA-Z]/.test(source[pos]) || /[\w.-]/.test(source[pos - 1] ?? '')) return null;
  return callToken(source, pos, ctx, 0);
};

export const stringLiteral: Rule = (source, pos) => {
  const quote = source[pos];
  if (quote !== '"' && quote !== "'") return null;

  const range = matchFenced(source, pos, quote, quote);
  return range ? { kind: 'raw', name: 'string', from: range.from, to: range.to, body: inner(range, 1, 1) } : null;
};

export const namedArgument: Rule = (source, pos) => {
  const match = /^[a-zA-Z][\w-]*[ \t]*:/.exec(source.slice(pos));
  return match ? { kind: 'raw', name: 'argument', from: pos, to: pos + match[0].length } : null;
};

export const separator: Rule = (source, pos) => {
  const match = /^[\s,]+/.exec(source.slice(pos));
  return match ? { kind: 'raw', name: 'separator', from: pos, to: pos + match[0].length } : null;
};

export const contentBlock: Rule = (source, pos, ctx) => {
  const range = matchDelimited(source, pos, '[');
  if (!range) return null;

  const body = inner(range, 1, 1);
  return {
    kind: 'container',
    name: 'content',
    from: range.from,
    to: range.to,
    body,
    children: ctx.parse(body.from, body.to, 'markup')
  };
};

export const reference: Rule = (source, pos) => {
  if (source[pos] === '@') {
    const match = /^@[\w:.-]+/.exec(source.slice(pos));
    return match ? { kind: 'command', name: 'ref', from: pos, to: pos + match[0].length } : null;
  }
  if (source[pos] === '<') {
    const match = /^<[\w:.-]+>/.exec(source.slice(pos));
    return match ? { kind: 'command', name: 'label', from: pos, to: pos + match[0].length } : null;
  }
  return null;
};

function inMode(mode: ParseMode, rule: Rule): Rule {
  return (source, pos, ctx) => (ctx.mode === mode ? rule(source, pos, ctx) : null);
}

export const rules: Rule[] = [
  comment,
  escape,
  inMode('code', stringLiteral),
  inMode('code', namedArgument),
  inMode('code', separator),
  inMode('code', contentBlock),
  inMode('code', call),
  inMode('markup', raw),
  inMode('markup', heading),
  inMode('markup', math),
  inMode('markup', code),
  inMode('markup', emphasis),
  inMode('markup', item),
  inMode('markup', reference)
];
