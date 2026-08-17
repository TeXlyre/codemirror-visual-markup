export type TokenKind =
  | 'text'
  | 'break'
  | 'comment'
  | 'math'
  | 'heading'
  | 'container'
  | 'item'
  | 'command'
  | 'table'
  | 'raw';

export interface Range {
  from: number;
  to: number;
}

export interface Token extends Range {
  kind: TokenKind;
  name?: string;
  level?: number;
  display?: boolean;
  body?: Range;
  args?: Range[];
  children?: Token[];
  meta?: Record<string, string>;
}

export function textOf(source: string, range: Range): string {
  return source.slice(range.from, range.to);
}

export function walk(tokens: Token[], visit: (token: Token, depth: number) => void, depth = 0): void {
  for (const token of tokens) {
    visit(token, depth);
    if (token.children) walk(token.children, visit, depth + 1);
  }
}

export function tokenAt(tokens: Token[], pos: number): Token | null {
  for (const token of tokens) {
    if (pos < token.from || pos > token.to) continue;
    return (token.children && tokenAt(token.children, pos)) || token;
  }
  return null;
}
