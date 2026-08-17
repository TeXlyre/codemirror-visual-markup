import { Range } from './tokens';

export const PAIRS: Record<string, string> = { '{': '}', '[': ']', '(': ')' };

export function skipSpace(source: string, pos: number, stopAtNewline = false): number {
  while (pos < source.length && /\s/.test(source[pos])) {
    if (stopAtNewline && source[pos] === '\n') break;
    pos++;
  }
  return pos;
}

export function isEscaped(source: string, pos: number): boolean {
  let slashes = 0;
  while (pos - slashes > 0 && source[pos - slashes - 1] === '\\') slashes++;
  return slashes % 2 === 1;
}

export function matchDelimited(source: string, pos: number, open: string): Range | null {
  const close = PAIRS[open];
  if (!close || source.slice(pos, pos + open.length) !== open) return null;

  let depth = 1;
  let cursor = pos + open.length;

  while (cursor < source.length && depth > 0) {
    const char = source[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === open) depth++;
    else if (char === close) depth--;
    cursor++;
  }

  return depth === 0 ? { from: pos, to: cursor } : null;
}

export function matchFenced(source: string, pos: number, open: string, close: string): Range | null {
  if (source.slice(pos, pos + open.length) !== open) return null;
  let cursor = pos + open.length;
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source.startsWith(close, cursor)) return { from: pos, to: cursor + close.length };
    cursor++;
  }
  return null;
}

export function matchLine(source: string, pos: number): Range {
  const end = source.indexOf('\n', pos);
  return { from: pos, to: end === -1 ? source.length : end };
}

export function lineStart(source: string, pos: number): number {
  const start = source.lastIndexOf('\n', pos - 1);
  return start + 1;
}

export function atLineStart(source: string, pos: number): boolean {
  return /^[ \t]*$/.test(source.slice(lineStart(source, pos), pos));
}

export function inner(range: Range, openLength: number, closeLength: number): Range {
  return { from: range.from + openLength, to: Math.max(range.from + openLength, range.to - closeLength) };
}
