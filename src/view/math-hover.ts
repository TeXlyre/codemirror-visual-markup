import { EditorState, Extension, StateEffect, StateField } from '@codemirror/state';
import { EditorView, hoverTooltip, Tooltip } from '@codemirror/view';
import { getLanguage } from '../core/language';
import { Tokenizer } from '../core/tokenizer';
import { Token, tokenAt } from '../core/tokens';
import { createEditableMath } from './math-field';

export const setMathHoverEnabled = StateEffect.define<boolean>();

const enabledField = StateField.define<boolean>({
  create: () => true,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMathHoverEnabled)) return effect.value;
    }
    return value;
  }
});

function findMath(state: EditorState, pos: number, language: string): Token | null {
  const tokens = new Tokenizer(getLanguage(language)).tokenize(state.doc.toString());
  const token = tokenAt(tokens, pos);
  return token && token.kind === 'math' ? token : null;
}

function renderTooltip(state: EditorState, token: Token): Tooltip {
  const content = state.doc.sliceString(token.body?.from ?? token.from, token.body?.to ?? token.to);

  return {
    pos: token.from,
    end: token.to,
    above: true,
    create: () => {
      const dom = document.createElement('div');
      dom.className = 'cm-lv-math-tooltip';
      dom.appendChild(createEditableMath(content.trim(), Boolean(token.display)));
      return { dom };
    }
  };
}

export function mathHover(language = 'latex'): Extension {
  return [
    enabledField,
    hoverTooltip((view, pos) => {
      if (!view.state.field(enabledField)) return null;
      const token = findMath(view.state, pos, language);
      return token ? renderTooltip(view.state, token) : null;
    })
  ];
}

export function createMathHoverExtension(language = 'latex'): Extension {
  return mathHover(language);
}

export class MathHoverManager {
  private view: EditorView;
  private enabled = true;

  constructor(view: EditorView) {
    this.view = view;
  }

  getEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.view.dispatch({ effects: setMathHoverEnabled.of(enabled) });
  }

  destroy(): void {
    this.setEnabled(false);
  }
}
