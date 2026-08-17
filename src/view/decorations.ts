import { EditorState, Extension, Facet, Range as CMRange, RangeSet } from '@codemirror/state';
import { Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { Language, TokenStyle } from '../core/language';
import { Tokenizer } from '../core/tokenizer';
import { Range, Token } from '../core/tokens';
import { createWidget } from './widget-registry';

export interface BuildOptions {
  language: Language;
  showCommands: boolean;
  maxDepth?: number;
}

export interface BuildResult {
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;
  tokens: Token[];
}

const hidden = Decoration.replace({});

export interface RevealRange extends Range {
  color?: string;
}

export const revealRanges = Facet.define<readonly RevealRange[], readonly RevealRange[]>({
  combine: values => values.flat()
});

export function revealAt(positions: readonly number[], color?: string): Extension {
  return revealRanges.of(positions.map(pos => ({ from: pos, to: pos, color })));
}

export function revealFrom(
  deps: Parameters<typeof revealRanges.compute>[0],
  compute: (state: EditorState) => readonly RevealRange[]
): Extension {
  return revealRanges.compute(deps, compute);
}

class MarkerWidget extends WidgetType {
  constructor(private label: string) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof MarkerWidget && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'cm-lv-marker';
    element.textContent = this.label;
    return element;
  }
}

export function buildDecorations(state: EditorState, options: BuildOptions): BuildResult {
  const source = state.doc.toString();
  const tokens = new Tokenizer(options.language, { maxDepth: options.maxDepth }).tokenize(source);

  const decorations: CMRange<Decoration>[] = [];
  const atomic: CMRange<Decoration>[] = [];
  const replaced: Range[] = [];
  const concealed: Range[] = [];
  const local: RevealRange[] = [...state.selection.ranges];
  const external = state.facet(revealRanges);

  const overlap = (list: readonly RevealRange[], from: number, to: number) =>
    list.filter(range => from <= range.to && to >= range.from);

  const isRevealed = (from: number, to: number) =>
    overlap(local, from, to).length > 0 || overlap(external, from, to).length > 0;

  const hide = (from: number, to: number) => {
    if (to <= from || options.showCommands) return;
    concealed.push(expandToLine(state, source, from, to));
  };

  const emit = (list: Token[]) => {
    for (const token of list) {
      const style = options.language.style(token);

      if (!style) {
        if (token.children) emit(token.children);
        continue;
      }

      const here = overlap(local, token.from, token.to);
      const remote = overlap(external, token.from, token.to);
      const inScope = here.length > 0 || remote.length > 0;
      const granular = Boolean(style.granular) && here.length === 0;

      if (style.widget && !options.showCommands && (!inScope || granular)) {
        const widget = createWidget(style.widget, {
          token,
          source,
          state,
          language: options.language,
          reveal: granular ? remote : []
        });
        if (widget) {
          const decoration = Decoration.replace({ widget, block: style.block });
          decorations.push(decoration.range(token.from, token.to));
          atomic.push(decoration.range(token.from, token.to));
          replaced.push({ from: token.from, to: token.to });
          continue;
        }
      }

      applyStyle(state, decorations, token, style);

      if (style.hidden) {
        if (!inScope) hide(token.from, token.to);
      } else if (style.replaceWith !== undefined) {
        if (!options.showCommands && !inScope) {
          const marker = Decoration.replace({ widget: new MarkerWidget(style.replaceWith) });
          const end = token.body?.from ?? token.to;
          decorations.push(marker.range(token.from, end));
          replaced.push({ from: token.from, to: end });
        }
      } else if (!style.keepSyntax && !inScope) {
        const body = token.body;
        if (body) {
          hide(token.from, body.from);
          hide(body.to, token.to);
        }
      }

      if (token.children && !style.keepSyntax) emit(token.children);
    }
  };

  emit(tokens);

  for (const span of subtract(merge(concealed), merge(replaced))) {
    decorations.push(hidden.range(span.from, span.to));
  }

  return {
    decorations: Decoration.set(decorations, true),
    atomic: RangeSet.of(atomic, true),
    tokens
  };
}

function applyStyle(
  state: EditorState,
  decorations: CMRange<Decoration>[],
  token: Token,
  style: TokenStyle
): void {
  if (!style.class) return;

  if (style.block) {
    const last = state.doc.lineAt(Math.max(token.from, Math.min(token.to, state.doc.length)));
    let line = state.doc.lineAt(token.from);
    const decoration = Decoration.line({ class: style.class });

    while (true) {
      decorations.push(decoration.range(line.from));
      if (line.number >= last.number) break;
      line = state.doc.line(line.number + 1);
    }
    return;
  }

  const body: Range = token.body ?? token;
  if (body.to > body.from) {
    decorations.push(Decoration.mark({ class: style.class }).range(body.from, body.to));
  }
}

function expandToLine(state: EditorState, source: string, from: number, to: number): Range {
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);

  const before = source.slice(first.from, from);
  const after = source.slice(to, last.to);

  if (/^\s*$/.test(before) && /^\s*$/.test(after) && last.to < source.length) {
    return { from: first.from, to: last.to + 1 };
  }

  return { from, to };
}

function merge(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Range[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }

  return merged;
}

function subtract(ranges: Range[], holes: Range[]): Range[] {
  const result: Range[] = [];

  for (const range of ranges) {
    let start = range.from;

    for (const hole of holes) {
      if (hole.to <= start || hole.from >= range.to) continue;
      if (hole.from > start) result.push({ from: start, to: hole.from });
      start = Math.max(start, hole.to);
    }

    if (start < range.to) result.push({ from: start, to: range.to });
  }

  return result;
}
