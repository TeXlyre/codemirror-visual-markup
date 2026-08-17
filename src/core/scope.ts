import { EditorState } from '@codemirror/state';
import { Language } from './language';
import { Tokenizer } from './tokenizer';
import { Token } from './tokens';

export interface EditorScope {
  inTable: boolean;
  inColor: boolean;
  table?: Token;
  color?: Token;
}

export const EMPTY_SCOPE: EditorScope = { inTable: false, inColor: false };

export function scopeAt(state: EditorState, pos: number, language: Language): EditorScope {
  const tokens = new Tokenizer(language).tokenize(state.doc.toString());
  const scope: EditorScope = { inTable: false, inColor: false };
  const colors = language.colorCommands ?? [];

  const descend = (list: Token[]) => {
    for (const token of list) {
      if (pos < token.from || pos > token.to) continue;

      if (token.kind === 'table') {
        scope.inTable = true;
        scope.table = token;
      }
      if (token.kind === 'command' && token.name && colors.includes(token.name)) {
        scope.inColor = true;
        scope.color = token;
      }

      if (token.children) descend(token.children);
    }
  };

  descend(tokens);
  return scope;
}
