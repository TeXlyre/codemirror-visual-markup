import { TableAdapter, TableCellRange } from '../../core/language';
import { Range, Token } from '../../core/tokens';

export const table: TableAdapter = {
  parse(source, token) {
    return tableRanges(source, token).map(row =>
      row.map(cell => source.slice(cell.from, cell.to).trim())
    );
  },
  ranges: tableRanges,
  locate(source, token, pos) {
    const rows = tableRanges(source, token);
    for (let row = 0; row < rows.length; row++) {
      let col = 0;
      for (const cell of rows[row]) {
        col = cell.column ?? col;
        if (pos >= cell.from && pos <= cell.to) return { row, col };
        col += cell.colspan ?? 1;
      }
    }
    return null;
  },
  editable(source, token) {
    if (!token.body) return false;
    const parts = argumentsOf(source, token.body);
    const columns = parts
      .map(part => source.slice(part.from, part.to).trim())
      .find(text => /^columns\s*:/.test(text));
    if (columns && !/^columns\s*:\s*\d+$/.test(columns)) return false;

    return parts.every(part => {
      const text = source.slice(part.from, part.to).trim();
      return !text || namedArgument(text) || /^\[[\s\S]*\]$/.test(text);
    }) && !/(?:\b(?:table|grid)\.)?\b(?:cell|header|footer|hline|vline)\s*\(/.test(
      source.slice(token.body.from, token.body.to)
    );
  },
  serialize(cells, token, text) {
    const offset = token.from;
    const bodyFrom = (token.body?.from ?? token.to) - offset;
    const bodyTo = (token.body?.to ?? token.to) - offset;
    const prefix = text.slice(0, bodyFrom);
    const suffix = text.slice(bodyTo);
    const configs = argumentsOf(text, { from: bodyFrom, to: bodyTo })
      .map(range => text.slice(range.from, range.to).trim())
      .filter(value => namedArgument(value) && !/^columns\s*:/.test(value));
    const rows = cells.map(row => `  ${row.map(cell => `[${cell}]`).join(', ')},`).join('\n');
    const config = [`columns: ${cells[0]?.length ?? 1}`, ...configs];
    return `${prefix}\n  ${config.join(',\n  ')},\n${rows}\n${suffix}`;
  }
};

function tableRanges(source: string, token: Token): TableCellRange[][] {
  if (!token.body) return [];

  const args = argumentsOf(source, token.body);
  const columns = columnCount(source, args) ?? inferColumns(source, args);
  const cells: TableCellRange[] = [];

  for (const arg of args) {
    const range = trimRange(source, arg);
    if (range.to <= range.from) continue;
    const text = source.slice(range.from, range.to);
    if (namedArgument(text)) continue;
    cells.push(...cellsFromArgument(source, range));
  }

  return placeCells(cells, columns);
}

function cellsFromArgument(source: string, range: Range, header = false): TableCellRange[] {
  const text = source.slice(range.from, range.to).trim();
  const shift = source.slice(range.from, range.to).indexOf(text);
  const from = range.from + Math.max(0, shift);
  const normalized = { from, to: from + text.length };

  if (/^(?:(?:table|grid)\.)?(?:hline|vline)\s*\(/.test(text)) return [];

  const section = /^(?:(?:table|grid)\.)?(header|footer)\s*\(/.exec(text);
  if (section) {
    const paren = delimitedRange(source, normalized.from + section[0].length - 1, '(', ')', normalized.to);
    if (!paren) return [];
    const nested = argumentsOf(source, { from: paren.from + 1, to: paren.to - 1 });
    return nested.flatMap(arg => {
      const trimmed = trimRange(source, arg);
      const value = source.slice(trimmed.from, trimmed.to);
      return namedArgument(value)
        ? []
        : cellsFromArgument(source, trimmed, header || section[1] === 'header');
    });
  }

  const cellCall = /^(?:(?:table|grid)\.)?cell\s*\(/.exec(text);
  if (cellCall) {
    const paren = delimitedRange(source, normalized.from + cellCall[0].length - 1, '(', ')', normalized.to);
    if (!paren) return [];
    const options = source.slice(paren.from + 1, paren.to - 1);
    const contentStart = skipWhitespace(source, paren.to, normalized.to);
    const trailing = delimitedRange(source, contentStart, '[', ']', normalized.to);
    const positional = argumentsOf(source, { from: paren.from + 1, to: paren.to - 1 })
      .map(arg => trimRange(source, arg))
      .filter(arg => !namedArgument(source.slice(arg.from, arg.to)));
    const positionalContent = positional.length
      ? cellContentRange(source, positional[positional.length - 1])
      : null;
    const content = trailing
      ? { from: trailing.from + 1, to: trailing.to - 1 }
      : positionalContent?.content ?? null;
    if (!content) return [];
    return [{
      ...content,
      visualFrom: trailing?.from ?? positionalContent?.visual.from ?? normalized.from,
      visualTo: trailing?.to ?? positionalContent?.visual.to ?? normalized.to,
      colspan: numberArgument(options, 'colspan'),
      rowspan: numberArgument(options, 'rowspan'),
      column: numberArgument(options, 'x', true),
      row: numberArgument(options, 'y', true),
      header
    }];
  }

  if (source[normalized.from] === '[') {
    const content = delimitedRange(source, normalized.from, '[', ']', normalized.to);
    if (content?.to === normalized.to) {
      return [{
        from: content.from + 1,
        to: content.to - 1,
        visualFrom: content.from,
        visualTo: content.to,
        header
      }];
    }
  }

  return [{ ...normalized, header }];
}


function cellContentRange(
  source: string,
  range: Range
): { content: Range; visual: Range } {
  const trimmed = trimRange(source, range);
  if (source[trimmed.from] === '[') {
    const block = delimitedRange(source, trimmed.from, '[', ']', trimmed.to);
    if (block?.to === trimmed.to) {
      return {
        content: { from: block.from + 1, to: block.to - 1 },
        visual: block
      };
    }
  }
  return { content: trimmed, visual: trimmed };
}

function argumentsOf(source: string, range: Range): Range[] {
  const result: Range[] = [];
  let start = range.from;
  let cursor = start;
  const stack: string[] = [];
  let quote = '';

  while (cursor < range.to) {
    const char = source[cursor];

    if (quote) {
      if (char === '\\') cursor += 2;
      else {
        if (char === quote) quote = '';
        cursor++;
      }
      continue;
    }

    if (source.startsWith('//', cursor)) {
      const end = source.indexOf('\n', cursor + 2);
      const next = end === -1 || end >= range.to ? range.to : end + 1;
      if (stack.length === 0 && /^\s*$/.test(source.slice(start, cursor))) start = next;
      cursor = next;
      continue;
    }

    if (source.startsWith('/*', cursor)) {
      const end = source.indexOf('*/', cursor + 2);
      const next = end === -1 || end + 2 > range.to ? range.to : end + 2;
      if (stack.length === 0 && /^\s*$/.test(source.slice(start, cursor))) start = next;
      cursor = next;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      cursor++;
      continue;
    }

    if (char === '$') {
      const end = skipMath(source, cursor, range.to);
      if (end > cursor) {
        cursor = end;
        continue;
      }
    }

    const close = ({ '(': ')', '[': ']', '{': '}' } as Record<string, string>)[char];
    if (close) stack.push(close);
    else if (stack.length && char === stack[stack.length - 1]) stack.pop();
    else if (char === ',' && stack.length === 0) {
      result.push({ from: start, to: cursor });
      start = cursor + 1;
    }
    cursor++;
  }

  if (start < range.to) result.push({ from: start, to: range.to });
  return result;
}

function columnCount(source: string, args: Range[]): number | null {
  for (const arg of args) {
    const text = source.slice(arg.from, arg.to).trim();
    const match = /^columns\s*:\s*([\s\S]+)$/.exec(text);
    if (!match) continue;
    const value = match[1].trim();
    if (/^\d+$/.test(value)) return Math.max(1, Number(value));
    if (value.startsWith('(') && value.endsWith(')')) {
      const offset = source.slice(arg.from, arg.to).indexOf(value);
      const tuple = {
        from: arg.from + offset + 1,
        to: arg.from + offset + value.length - 1
      };
      const count = argumentsOf(source, tuple).filter(item => source.slice(item.from, item.to).trim()).length;
      if (count) return count;
    }
    if (value) return 1;
  }
  return null;
}

function placeCells(cells: TableCellRange[], initialColumns: number): TableCellRange[][] {
  let columns = Math.max(1, initialColumns);
  for (const cell of cells) {
    if (cell.column !== undefined) {
      columns = Math.max(columns, cell.column + Math.max(1, cell.colspan ?? 1));
    }
  }

  const rows: Array<TableCellRange[] | undefined> = [];
  const occupied = new Set<string>();
  let autoIndex = 0;

  const free = (row: number, column: number, colspan: number, rowspan: number) => {
    if (column < 0 || column + colspan > columns) return false;
    for (let y = row; y < row + rowspan; y++) {
      for (let x = column; x < column + colspan; x++) {
        if (occupied.has(`${x}:${y}`)) return false;
      }
    }
    return true;
  };

  const occupy = (row: number, column: number, colspan: number, rowspan: number) => {
    for (let y = row; y < row + rowspan; y++) {
      for (let x = column; x < column + colspan; x++) occupied.add(`${x}:${y}`);
    }
  };

  for (const cell of cells) {
    const colspan = Math.max(1, cell.colspan ?? 1);
    const rowspan = Math.max(1, cell.rowspan ?? 1);
    let row = cell.row;
    let column = cell.column;

    if (row !== undefined && column !== undefined) {
      // Explicit Typst position.
    } else if (column !== undefined) {
      row = 0;
      while (!free(row, column, colspan, rowspan)) row++;
    } else if (row !== undefined) {
      column = 0;
      while (column < columns && !free(row, column, colspan, rowspan)) column++;
      if (column + colspan > columns) continue;
    } else {
      let index = autoIndex;
      while (true) {
        const candidateRow = Math.floor(index / columns);
        const candidateColumn = index % columns;
        if (free(candidateRow, candidateColumn, colspan, rowspan)) {
          row = candidateRow;
          column = candidateColumn;
          autoIndex = index + colspan;
          break;
        }
        index++;
      }
    }

    if (row === undefined || column === undefined) continue;
    cell.row = row;
    cell.column = column;
    occupy(row, column, colspan, rowspan);
    (rows[row] ??= []).push(cell);
  }

  for (const row of rows) row?.sort((a, b) => (a.column ?? 0) - (b.column ?? 0) || a.from - b.from);
  return rows.filter((row): row is TableCellRange[] => Boolean(row?.length));
}

function inferColumns(source: string, args: Range[]): number {
  const counts = new Map<number, number>();
  for (const arg of args) {
    const range = trimRange(source, arg);
    if (range.to <= range.from || namedArgument(source.slice(range.from, range.to))) continue;
    const line = source.slice(0, range.from).split('\n').length;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return Math.max(1, ...counts.values());
}

function namedArgument(text: string): boolean {
  return /^[a-zA-Z][\w-]*\s*:/.test(text.trim());
}

function numberArgument(text: string, name: string, zeroBased = false): number | undefined {
  const match = new RegExp(`(?:^|,)\\s*${name}\\s*:\\s*(\\d+)`).exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  return zeroBased ? Math.max(0, value) : Math.max(1, value);
}

function trimRange(source: string, range: Range): Range {
  let { from, to } = range;
  while (from < to && /\s/.test(source[from])) from++;
  while (to > from && /\s/.test(source[to - 1])) to--;
  return { from, to };
}

function skipWhitespace(source: string, from: number, to: number): number {
  while (from < to && /\s/.test(source[from])) from++;
  return from;
}

function delimitedRange(source: string, from: number, open: string, close: string, limit: number): Range | null {
  if (source[from] !== open) return null;
  let depth = 1;
  let cursor = from + 1;
  let quote = '';

  while (cursor < limit && depth > 0) {
    const char = source[cursor];
    if (quote) {
      if (char === '\\') cursor += 2;
      else {
        if (char === quote) quote = '';
        cursor++;
      }
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === open) depth++;
    else if (char === close) depth--;
    cursor++;
  }
  return depth === 0 ? { from, to: cursor } : null;
}

function skipMath(source: string, from: number, limit: number): number {
  let cursor = from + 1;
  while (cursor < limit) {
    if (source[cursor] === '\\') cursor += 2;
    else if (source[cursor] === '$') return cursor + 1;
    else cursor++;
  }
  return from;
}
