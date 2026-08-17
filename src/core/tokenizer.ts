import { Language, ParseMode, RuleContext } from './language';
import { Token } from './tokens';

export interface TokenizeOptions {
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 12;

export class Tokenizer {
  private language: Language;
  private maxDepth: number;

  constructor(language: Language, options: TokenizeOptions = {}) {
    this.language = language;
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  }

  tokenize(source: string, from = 0, to = source.length, mode: ParseMode = 'markup'): Token[] {
    return this.run(source, from, to, 0, mode);
  }

  private run(source: string, from: number, to: number, depth: number, mode: ParseMode): Token[] {
    const tokens: Token[] = [];
    if (depth > this.maxDepth || from >= to) return tokens;

    const context: RuleContext = {
      source,
      depth: depth + 1,
      mode,
      parse: (childFrom, childTo, childMode) =>
        this.run(source, childFrom, childTo, depth + 1, childMode ?? mode)
    };

    let pos = from;
    let textFrom = from;

    const flushText = (end: number) => {
      if (end > textFrom) tokens.push({ kind: 'text', from: textFrom, to: end });
    };

    while (pos < to) {
      const token = this.matchAt(source, pos, to, context);

      if (!token) {
        pos++;
        continue;
      }

      flushText(token.from);
      tokens.push(token);
      pos = token.to;
      textFrom = pos;
    }

    flushText(to);
    return tokens;
  }

  private matchAt(source: string, pos: number, limit: number, context: RuleContext): Token | null {
    for (const rule of this.language.rules) {
      const token = rule(source, pos, context);
      if (!token) continue;
      if (token.to <= token.from || token.to > limit) continue;
      return token;
    }
    return null;
  }
}
