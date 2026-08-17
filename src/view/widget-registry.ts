import { EditorState } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';
import { Language, WidgetKind } from '../core/language';
import { Token } from '../core/tokens';
import { RevealRange } from './decorations';

export interface WidgetContext {
  token: Token;
  source: string;
  state: EditorState;
  language: Language;
  reveal: readonly RevealRange[];
}

export type WidgetFactory = (context: WidgetContext) => WidgetType | null;

const factories = new Map<WidgetKind, WidgetFactory>();

export function registerWidget(kind: WidgetKind, factory: WidgetFactory): void {
  factories.set(kind, factory);
}

export function createWidget(kind: WidgetKind, context: WidgetContext): WidgetType | null {
  const factory = factories.get(kind);
  return factory ? factory(context) : null;
}

export function replaceRange(view: EditorView, dom: HTMLElement, original: string, replacement: string): boolean {
  if (original === replacement) return false;

  const pos = view.posAtDOM(dom);
  if (pos < 0 || view.state.doc.sliceString(pos, pos + original.length) !== original) return false;

  view.dispatch({ changes: { from: pos, to: pos + original.length, insert: replacement } });
  return true;
}
