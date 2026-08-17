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
  constructor(
    private label: string,
    private className = 'cm-lv-marker'
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof MarkerWidget && other.label === this.label && other.className === this.className;
  }

  toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = this.className;
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
  const joinedBreaks = new Set<number>();
  const local: RevealRange[] = [...state.selection.ranges];
  const external = state.facet(revealRanges);

  const overlap = (list: readonly RevealRange[], from: number, to: number) =>
    list.filter(range => from <= range.to && to >= range.from);

  const isRevealed = (from: number, to: number) =>
    overlap(local, from, to).length > 0 || overlap(external, from, to).length > 0;

  const hide = (from: number, to: number) => {
    if (to <= from || options.showCommands) return;

    let start = from;
    while (start < to) {
      const line = state.doc.lineAt(start);
      const end = Math.min(to, line.to);
      if (end > start) concealed.push({ from: start, to: end });
      start = line.to + 1;
    }
  };

  const emit = (list: Token[]) => {
    for (const token of list) {
      const style = options.language.style(token);

      if (!style) {
        if (token.children) emit(token.children);
        continue;
      }

      const inScope = isRevealed(token.from, token.to);

      if (style.widget && !options.showCommands && !inScope) {
        const widget = createWidget(style.widget, {
          token,
          source,
          state,
          language: options.language
        });
        const spansLines = state.doc.lineAt(token.from).number !== state.doc.lineAt(token.to).number;
        const tableInline = token.meta?.tableInline === 'true';
        const block = Boolean(style.block && !tableInline);

        // Table cells are laid out as a single visual row even when the source
        // uses one physical line per cell. An inline table widget may therefore
        // legitimately replace line breaks (for example multiline display math).
        if (widget && (block || !spansLines || tableInline)) {
          const decoration = Decoration.replace({ widget, block, tableLayout: tableInline || undefined });
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

      if (token.kind === 'table' && !options.showCommands && !inScope) {
        layoutTable(state, source, options.language, token, decorations, hide, joinedBreaks);
      }

      if (token.children && !style.keepSyntax) emit(token.children);
    }
  };

  emit(tokens);

  const spans = subtract(merge(concealed), merge(replaced));

  for (const span of spans) {
    decorations.push(hidden.range(span.from, span.to));

    const line = state.doc.lineAt(span.from);
    if (
      span.from === line.from &&
      span.to === line.to &&
      line.length > 0 &&
      !joinedBreaks.has(line.to) &&
      !joinedBreaks.has(line.from - 1)
    ) {
      decorations.push(Decoration.line({ class: 'cm-lv-syntax-line' }).range(line.from));
    }
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
    const decoration = Decoration.line({ class: style.class, attributes: style.attributes });

    while (true) {
      decorations.push(decoration.range(line.from));
      if (line.number >= last.number) break;
      line = state.doc.line(line.number + 1);
    }
    return;
  }

  const body: Range = token.body ?? token;
  if (body.to > body.from) {
    decorations.push(
      Decoration.mark({ class: style.class, attributes: style.attributes }).range(body.from, body.to)
    );
  }
}

function layoutTable(
  state: EditorState,
  source: string,
  language: Language,
  token: Token,
  decorations: CMRange<Decoration>[],
  hide: (from: number, to: number) => void,
  joinedBreaks: Set<number>
): void {
  const rows = language.table?.ranges?.(source, token);
  if (!rows?.length || !token.body) return;

  const widths: number[] = [];
  const positions = new Map<Range, { row: number; cell: number; column: number }>();
  const occupied: number[] = [];
  let columnCount = 0;

  rows.forEach((row, rowIndex) => {
    let column = 0;
    row.forEach((cell, cellIndex) => {
      if (cell.column !== undefined) column = cell.column;
      else while ((occupied[column] ?? 0) > 0) column++;

      const colspan = Math.max(1, cell.colspan ?? 1);
      const rowspan = Math.max(1, cell.rowspan ?? 1);
      positions.set(cell, { row: rowIndex, cell: cellIndex, column });
      columnCount = Math.max(columnCount, column + colspan);

      if (rowspan > 1) {
        for (let offset = 0; offset < colspan; offset++) {
          occupied[column + offset] = Math.max(occupied[column + offset] ?? 0, rowspan);
        }
      }
      column += colspan;
    });

    for (let index = 0; index < occupied.length; index++) {
      if (occupied[index] > 0) occupied[index]--;
    }
  });

  const minWidth = tableMinColumnWidth(source, token, columnCount);
  rows.forEach(row => {
    row.forEach(cell => {
      const position = positions.get(cell);
      if (!position) return;
      const span = Math.max(1, cell.colspan ?? 1);
      const width = Math.max(minWidth, Math.ceil((measureCell(source, cell) + TABLE_CELL_CHROME) / span));
      for (let offset = 0; offset < span; offset++) {
        widths[position.column + offset] = Math.min(
          TABLE_MAX_COLUMN_WIDTH,
          Math.max(widths[position.column + offset] ?? minWidth, width)
        );
      }
    });
  });

  const cells = rows.flat();
  const protectedBreaks = tableProtectedRanges(language, token.children);

  rows.forEach((row, rowIndex) => {
    if (!row.length) return;
    const contentStarts = row
      .map(cell => trim(source, cell))
      .filter(cell => cell.length > 0)
      .map(cell => cell.from);
    const first = state.doc.lineAt(contentStarts.length ? Math.min(...contentStarts) : row[0].from);
    const header = row.every(cell => cell.header);
    const classes = [
      'cm-lv-table-row',
      rowIndex === 0 ? 'cm-lv-table-row-first' : '',
      rowIndex === rows.length - 1 ? 'cm-lv-table-row-last' : '',
      rowIndex % 2 === 1 ? 'cm-lv-table-row-alt' : '',
      header ? 'cm-lv-table-row-header' : ''
    ].filter(Boolean).join(' ');

    // Only the first physical source line owns the visual row. Hide line breaks
    // inside the logical row so source formatting such as
    //
    //   A &
    //   long description &
    //   42 \\
    //
    // remains one visual table row. CodeMirror explicitly supports direct
    // replace decorations over line breaks for layout-changing decorations.
    decorations.push(Decoration.line({ class: classes }).range(first.from));
    joinTableRowLines(source, row, cells, protectedBreaks, decorations, joinedBreaks);
  });

  let previous = token.body.from;

  const nextColumn = new Map<number, number>();
  for (const cell of cells) {
    if (cell.from > previous) hide(previous, cell.from);

    const content = trim(source, cell);
    if (content.from > cell.from) hide(cell.from, content.from);
    if (content.to < cell.to) hide(content.to, cell.to);

    const visual = {
      from: cell.visualFrom ?? content.from,
      to: cell.visualTo ?? content.to
    };
    if (visual.to > visual.from) {
      const position = positions.get(cell) ?? { row: 0, cell: 0, column: 0 };
      const row = rows[position.row];
      const span = Math.max(1, cell.colspan ?? 1);
      const width = widths
        .slice(position.column, position.column + span)
        .reduce((sum, value) => sum + (value ?? minWidth), 0);
      const before = nextColumn.get(position.row) ?? 0;
      const offset = widths
        .slice(before, position.column)
        .reduce((sum, value) => sum + (value ?? minWidth), 0);
      nextColumn.set(position.row, position.column + span);
      const classes = [
        'cm-lv-cell',
        cell.header ? 'cm-lv-cell-header' : '',
        position.cell === 0 ? 'cm-lv-cell-first' : '',
        position.cell === row.length - 1 ? 'cm-lv-cell-last' : '',
        offset > 0 ? 'cm-lv-cell-gap' : ''
      ].filter(Boolean).join(' ');
      const attributes = {
        style: `--lv-cell-width:${Math.max(minWidth, width)}ch;--lv-cell-offset:${offset}ch`,
        'data-lv-column': String(position.column),
        'data-lv-colspan': String(span),
        'data-lv-rowspan': String(Math.max(1, cell.rowspan ?? 1))
      };
      markTableWidgets(language, token.children, content);
      const replacement = exactReplacementToken(language, token.children, content);

      if (replacement) {
        replacement.meta = {
          ...replacement.meta,
          tableClass: classes,
          tableStyle: attributes.style,
          tableColumn: attributes['data-lv-column'],
          tableColspan: attributes['data-lv-colspan'],
          tableRowspan: attributes['data-lv-rowspan']
        };
      } else {
        decorations.push(Decoration.mark({ class: classes, attributes }).range(visual.from, visual.to));
      }
    }

    previous = Math.max(previous, cell.to);
  }

  hide(previous, token.body.to);
}


const tableLineJoin = Decoration.replace({ tableLayout: true });

function joinTableRowLines(
  source: string,
  row: readonly Range[],
  allCells: readonly Range[],
  protectedRanges: readonly Range[],
  decorations: CMRange<Decoration>[],
  joinedBreaks: Set<number>
): void {
  if (!row.length) return;

  const joinRanges: Range[] = [];
  const inRow = new Set(row);

  // Join line breaks that are genuinely inside a logical row. The first
  // cell often starts at the newline immediately after the previous row's
  // `\\`; that boundary must remain visible or two logical rows collapse
  // into one CodeMirror line.
  row.forEach((cell, index) => {
    const content = trim(source, cell);
    const from = index === 0 ? content.from : cell.from;
    if (from < cell.to) joinRanges.push({ from, to: cell.to });
  });

  // Typst cell ranges are trimmed, so their formatting newline usually lives
  // between adjacent arguments rather than inside a cell range. Join that gap
  // only when no cell belonging to another logical row sits between them.
  const ordered = [...row].sort((a, b) => a.from - b.from || a.to - b.to);
  for (let index = 1; index < ordered.length; index++) {
    const left = ordered[index - 1];
    const right = ordered[index];
    if (right.from <= left.to) continue;

    const crossesOtherRow = allCells.some(cell =>
      !inRow.has(cell) && cell.from < right.from && cell.to > left.to
    );
    if (!crossesOtherRow) joinRanges.push({ from: left.to, to: right.from });
  }

  const joined = new Set<number>();
  for (const range of joinRanges) {
    let cursor = source.indexOf('\n', range.from);
    while (cursor >= 0 && cursor < range.to) {
      const protectedBreak = protectedRanges.some(item => item.from <= cursor && item.to > cursor);
      if (!protectedBreak && !joined.has(cursor)) {
        decorations.push(tableLineJoin.range(cursor, cursor + 1));
        joined.add(cursor);
        joinedBreaks.add(cursor);
      }
      cursor = source.indexOf('\n', cursor + 1);
    }
  }
}

function tableProtectedRanges(language: Language, tokens: Token[] | undefined): Range[] {
  const ranges: Range[] = [];
  if (!tokens) return ranges;

  const visit = (items: Token[]) => {
    for (const token of items) {
      const style = language.style(token);
      if (token.kind === 'table' || style?.widget) ranges.push({ from: token.from, to: token.to });
      else if (token.children) visit(token.children);
    }
  };
  visit(tokens);
  return ranges;
}

// Reserve room for the cell's horizontal padding/borders in the monospace editor grid.
const TABLE_CELL_CHROME = 3;
const TABLE_MAX_COLUMN_WIDTH = 42;

function markTableWidgets(language: Language, tokens: Token[] | undefined, range: Range): void {
  if (!tokens) return;

  for (const token of tokens) {
    if (token.to <= range.from || token.from >= range.to) continue;
    if (token.from >= range.from && token.to <= range.to && language.style(token)?.widget) {
      token.meta = { ...token.meta, tableInline: 'true' };
    }
    markTableWidgets(language, token.children, range);
  }
}

function exactReplacementToken(language: Language, tokens: Token[] | undefined, range: Range): Token | null {
  if (!tokens) return null;

  for (const token of tokens) {
    if (token.to < range.from || token.from > range.to) continue;
    if (token.from === range.from && token.to === range.to && language.style(token)?.widget) return token;
    const child = exactReplacementToken(language, token.children, range);
    if (child) return child;
  }

  return null;
}

function tableMinColumnWidth(source: string, token: Token, columns: number): number {
  if (columns > 6) return 6;
  const wideLatex = new Set(['tabular*', 'tabularx', 'tabulary', 'xltabular', 'NiceTabular*', 'NiceTabularX']);
  if (wideLatex.has(token.name ?? '')) return 10;
  if ((token.name === 'table' || token.name === 'grid') && token.body) {
    const body = source.slice(token.body.from, token.body.to);
    if (/\bcolumns\s*:\s*\([^)]*\b(?:\d+(?:\.\d+)?)?fr\b/.test(body)) return 10;
  }
  return 6;
}

function measureCell(source: string, range: Range): number {
  const text = source
    .slice(range.from, range.to)
    .replace(/\\[a-zA-Z]+\*?/g, '')
    .replace(/[#{}\[\]*_$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Math.max(1, text.length);
}

function trim(source: string, range: Range): Range & { length: number } {
  let { from, to } = range;
  while (from < to && /\s/.test(source[from])) from++;
  while (to > from && /\s/.test(source[to - 1])) to--;
  return { from, to, length: to - from };
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
