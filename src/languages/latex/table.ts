import { TableAdapter, TableCellRange } from '../../core/language';
import { Range, Token } from '../../core/tokens';

const COLUMN_ARG = new Map([
  ['tabular', 0], ['tabular*', 1], ['tabularx', 1], ['tabulary', 1], ['xltabular', 1],
  ['longtable', 0], ['NiceTabular', 0], ['NiceTabular*', 1], ['NiceTabularX', 1]
]);
const SIMPLE_TABLES = new Set(COLUMN_ARG.keys());
const ROW_COMMANDS = new Set([
  'hline', 'toprule', 'midrule', 'bottomrule', 'addlinespace', 'cline', 'cmidrule',
  'hhline', 'specialrule', 'endfirsthead', 'endhead', 'endfoot', 'endlastfoot'
]);
const META_COMMANDS = new Set(['caption', 'caption*', 'label']);

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
        if (pos >= cell.from && pos <= cell.to) return { row, col };
        col += cell.colspan ?? 1;
      }
    }

    return null;
  },
  editable(source, token) {
    if (!SIMPLE_TABLES.has(token.name ?? '') || !token.body) return false;
    const body = source.slice(token.body.from, token.body.to);
    if (/\\(?:multicolumn|multirow|hline|toprule|midrule|bottomrule|addlinespace|cline|cmidrule|hhline|specialrule|endfirsthead|endhead|endfoot|endlastfoot|caption\*?|label)\b/.test(body)) return false;
    return columnSpec(source, token) !== null;
  },
  serialize(cells, token, text) {
    const offset = token.from;
    const bodyFrom = (token.body?.from ?? token.to) - offset;
    const bodyTo = (token.body?.to ?? token.to) - offset;
    let prefix = text.slice(0, bodyFrom);
    const suffix = text.slice(bodyTo);
    const columns = cells[0]?.length ?? 1;
    const spec = columnSpec(text, localToken(token, offset));
    if (spec) {
      const resized = resizeColumnSpec(spec.value, spec.atoms, columns);
      prefix = `${prefix.slice(0, spec.range.from)}${resized}${prefix.slice(spec.range.to)}`;
    }
    const body = cells.map(row => `  ${row.join(' & ')} \\\\`).join('\n');
    return `${prefix}\n${body}\n${suffix}`;
  }
};

interface ColumnSpec {
  range: Range;
  value: string;
  atoms: Range[];
}

function columnSpec(source: string, token: Token): ColumnSpec | null {
  const index = COLUMN_ARG.get(token.name ?? '');
  const range = index === undefined ? undefined : token.args?.[index];
  if (!range || range.from < token.from || range.to > token.to) return null;

  const value = source.slice(range.from, range.to);
  const atoms = columnAtoms(value);
  if (!atoms?.length) return null;
  return { range, value, atoms };
}

function columnAtoms(spec: string): Range[] | null {
  const atoms: Range[] = [];
  let cursor = 0;

  while (cursor < spec.length) {
    const char = spec[cursor];
    if (/\s|\|/.test(char)) {
      cursor++;
      continue;
    }
    if (/[lcrXLCJS]/.test(char)) {
      atoms.push({ from: cursor, to: cursor + 1 });
      cursor++;
      continue;
    }
    if (/[pmb]/.test(char) && spec[cursor + 1] === '{') {
      const end = skipBalanced(spec, cursor + 1, '{', '}', spec.length);
      if (end <= cursor + 2) return null;
      atoms.push({ from: cursor, to: end });
      cursor = end;
      continue;
    }
    if (/[wW]/.test(char) && spec[cursor + 1] === '{') {
      const align = skipBalanced(spec, cursor + 1, '{', '}', spec.length);
      if (spec[align] !== '{') return null;
      const end = skipBalanced(spec, align, '{', '}', spec.length);
      atoms.push({ from: cursor, to: end });
      cursor = end;
      continue;
    }
    if (char === 'D' && spec[cursor + 1] === '{') {
      let end = cursor + 1;
      for (let argument = 0; argument < 3; argument++) {
        if (spec[end] !== '{') return null;
        end = skipBalanced(spec, end, '{', '}', spec.length);
      }
      atoms.push({ from: cursor, to: end });
      cursor = end;
      continue;
    }
    if (/[>@<!]/.test(char) && spec[cursor + 1] === '{') {
      const end = skipBalanced(spec, cursor + 1, '{', '}', spec.length);
      if (end <= cursor + 2) return null;
      cursor = end;
      continue;
    }
    return null;
  }

  return atoms;
}

function resizeColumnSpec(spec: string, atoms: Range[], columns: number): string {
  if (columns === atoms.length) return spec;
  if (columns > atoms.length) {
    const last = atoms[atoms.length - 1];
    const repeat = spec.slice(last.from, last.to).repeat(columns - atoms.length);
    return `${spec.slice(0, last.to)}${repeat}${spec.slice(last.to)}`;
  }

  const remove = atoms.slice(columns);
  let result = spec;
  for (let index = remove.length - 1; index >= 0; index--) {
    const atom = remove[index];
    result = `${result.slice(0, atom.from)}${result.slice(atom.to)}`;
  }
  return result;
}

function localToken(token: Token, offset: number): Token {
  return {
    ...token,
    from: token.from - offset,
    to: token.to - offset,
    body: token.body ? { from: token.body.from - offset, to: token.body.to - offset } : undefined,
    args: token.args?.map(arg => ({ from: arg.from - offset, to: arg.to - offset }))
  };
}

function tableRanges(source: string, token: Token): TableCellRange[][] {
  if (!token.body) return [];

  const rows: TableCellRange[][] = [];
  let cells: TableCellRange[] = [];
  let start = token.body.from;
  let cursor = start;
  let braces = 0;
  let brackets = 0;

  const pushCell = (end: number) => {
    const range = cleanCell(source, { from: start, to: end });
    cells.push({ ...range, ...cellSpan(source, range) });
  };

  const pushRow = () => {
    if (cells.length) rows.push(cells);
    cells = [];
  };

  while (cursor < token.body.to) {
    const char = source[cursor];

    if (char === '%' && braces === 0 && brackets === 0) {
      const lineEnd = source.indexOf('\n', cursor);
      cursor = lineEnd === -1 ? token.body.to : lineEnd;
      continue;
    }

    if (char === '$') {
      const end = skipDollarMath(source, cursor, token.body.to);
      if (end > cursor) {
        cursor = end;
        continue;
      }
    }

    if (char === '\\') {
      if (braces === 0 && brackets === 0) {
        if (source.startsWith('\\\\', cursor)) {
          pushCell(cursor);
          pushRow();
          cursor = skipRowBreak(source, cursor + 2, token.body.to);
          start = cursor;
          continue;
        }

        const nested = skipEnvironment(source, cursor, token.body.to);
        if (nested > cursor) {
          cursor = nested;
          continue;
        }

        const command = /^\\([a-zA-Z]+\*?)/.exec(source.slice(cursor));
        if (command?.[1] === 'tabularnewline' || command?.[1] === 'cr') {
          pushCell(cursor);
          pushRow();
          cursor = skipRowBreak(source, cursor + command[0].length, token.body.to);
          start = cursor;
          continue;
        }

        if (command && (ROW_COMMANDS.has(command[1]) || META_COMMANDS.has(command[1])) && /^\s*$/.test(source.slice(start, cursor))) {
          cursor = skipCommand(source, cursor + command[0].length, token.body.to);
          start = cursor;
          continue;
        }
      }

      cursor += 2;
      continue;
    }

    if (char === '{') braces++;
    else if (char === '}' && braces > 0) braces--;
    else if (char === '[') brackets++;
    else if (char === ']' && brackets > 0) brackets--;
    else if (char === '&' && braces === 0 && brackets === 0) {
      pushCell(cursor);
      cursor++;
      start = cursor;
      continue;
    }

    cursor++;
  }

  if (source.slice(start, token.body.to).trim() || cells.length) pushCell(token.body.to);
  pushRow();

  const result = rows.filter(row => row.some(cell => cell.to > cell.from));
  markHeaders(source, token, result);
  return result;
}


function markHeaders(source: string, token: Token, rows: TableCellRange[][]): void {
  if (!rows.length) return;

  if (rows.length > 1) {
    const firstEnd = rows[0][rows[0].length - 1]?.to ?? rows[0][0].to;
    const secondStart = rows[1][0]?.from ?? firstEnd;
    if (/\\midrule\b/.test(source.slice(firstEnd, secondStart))) {
      rows[0].forEach(cell => { cell.header = true; });
    }
  }

  if (token.name === 'longtable' && token.body) {
    const endHead = source.indexOf('\\endhead', token.body.from);
    if (endHead >= token.body.from && endHead < token.body.to) {
      for (const row of rows) {
        if ((row[row.length - 1]?.to ?? token.body.to) >= endHead) break;
        row.forEach(cell => { cell.header = true; });
      }
    }
  }
}

function cleanCell(source: string, range: Range): Range {
  let { from, to } = trimRange(source, range);

  while (from < to) {
    const command = /^\\([a-zA-Z]+\*?)/.exec(source.slice(from, to));
    if (!command || !ROW_COMMANDS.has(command[1])) break;
    from = skipCommand(source, from + command[0].length, to);
    from = trimRange(source, { from, to }).from;
  }

  return { from, to };
}

function cellSpan(source: string, range: Range): Pick<TableCellRange, 'colspan' | 'rowspan'> {
  const text = source.slice(range.from, range.to);
  const colspan = /^\\multicolumn\s*\{(\d+)\}/.exec(text)?.[1];
  const rowspan = /^\\multirow\s*\{(\d+)\}/.exec(text)?.[1];
  return {
    colspan: colspan ? Math.max(1, Number(colspan)) : undefined,
    rowspan: rowspan ? Math.max(1, Number(rowspan)) : undefined
  };
}

function trimRange(source: string, range: Range): Range {
  let { from, to } = range;
  while (from < to && /\s/.test(source[from])) from++;
  while (to > from && /\s/.test(source[to - 1])) to--;
  return { from, to };
}


function skipEnvironment(source: string, from: number, limit: number): number {
  const open = /^\\begin\{([^}\n]+)\}/.exec(source.slice(from, limit));
  if (!open) return from;

  const begin = `\\begin{${open[1]}}`;
  const end = `\\end{${open[1]}}`;
  let depth = 1;
  let cursor = from + open[0].length;

  while (cursor < limit) {
    const nextBegin = source.indexOf(begin, cursor);
    const nextEnd = source.indexOf(end, cursor);
    if (nextEnd === -1 || nextEnd >= limit) return from;
    if (nextBegin !== -1 && nextBegin < nextEnd && nextBegin < limit) {
      depth++;
      cursor = nextBegin + begin.length;
    } else {
      depth--;
      cursor = nextEnd + end.length;
      if (depth === 0) return cursor;
    }
  }
  return from;
}

function skipDollarMath(source: string, from: number, limit: number): number {
  const marker = source.startsWith('$$', from) ? '$$' : '$';
  let cursor = from + marker.length;
  while (cursor < limit) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source.startsWith(marker, cursor)) return cursor + marker.length;
    cursor++;
  }
  return from;
}

function skipRowBreak(source: string, from: number, limit: number): number {
  let cursor = from;
  if (source[cursor] === '*') cursor++;
  while (cursor < limit && /[ \t]/.test(source[cursor])) cursor++;
  if (source[cursor] === '[') cursor = skipBalanced(source, cursor, '[', ']', limit);
  return cursor;
}

function skipCommand(source: string, from: number, limit: number): number {
  let cursor = from;
  while (cursor < limit) {
    while (cursor < limit && /\s/.test(source[cursor])) cursor++;
    if (source[cursor] === '[') cursor = skipBalanced(source, cursor, '[', ']', limit);
    else if (source[cursor] === '{') cursor = skipBalanced(source, cursor, '{', '}', limit);
    else if (source[cursor] === '(') cursor = skipBalanced(source, cursor, '(', ')', limit);
    else break;
  }
  return cursor;
}

function skipBalanced(source: string, from: number, open: string, close: string, limit: number): number {
  let depth = 1;
  let cursor = from + 1;
  while (cursor < limit && depth > 0) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === open) depth++;
    else if (source[cursor] === close) depth--;
    cursor++;
  }
  return cursor;
}
