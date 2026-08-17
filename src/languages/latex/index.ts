import { cssColor } from '../../core/color';
import { registerLanguage, Language, LanguageCommands, TableAdapter, TokenStyle } from '../../core/language';
import { Range, Token } from '../../core/tokens';
import { ARGUMENT_COUNT, COMMAND_CLASSES, EDITABLE_COMMANDS, LIST_ENVIRONMENTS, VERBATIM_ENVIRONMENTS } from './commands';
import { rules } from './rules';

const commands: LanguageCommands = {
  wrap: {
    bold: ['\\textbf{', '}'],
    italic: ['\\textit{', '}'],
    underline: ['\\underline{', '}'],
    mono: ['\\texttt{', '}'],
    smallcaps: ['\\textsc{', '}'],
    inlineMath: ['$', '$'],
    displayMath: ['$$', '$$'],
    quote: ['\\begin{quote}\n', '\n\\end{quote}']
  },
  heading(level, text) {
    const name = level <= 1 ? 'section' : level === 2 ? 'subsection' : 'subsubsection';
    return `\\${name}{${text}}`;
  },
  list(kind, items) {
    const name = kind === 'number' ? 'enumerate' : 'itemize';
    const body = items.map(entry => `  \\item ${entry}`).join('\n');
    return `\\begin{${name}}\n${body}\n\\end{${name}}`;
  },
  table(rows, cols) {
    const alignment = 'l'.repeat(cols);
    const line = Array.from({ length: cols }, (_, index) => `Cell ${index + 1}`).join(' & ');
    const body = Array.from({ length: rows }, () => `  ${line} \\\\`).join('\n');
    return `\\begin{tabular}{${alignment}}\n${body}\n\\end{tabular}`;
  },
  color(kind, color, text) {
    const hex = /^#([0-9a-f]{6})$/i.exec(color);
    const value = hex ? `[HTML]{${hex[1].toUpperCase()}}` : `{${color}}`;
    return `\\${kind === 'text' ? 'textcolor' : 'colorbox'}${value}{${text}}`;
  }
};

const table: TableAdapter = {
  parse(source, token) {
    const body = token.body ? source.slice(token.body.from, token.body.to) : '';
    return body
      .split('\\\\')
      .map(row => row.replace(/\\hline/g, '').trim())
      .filter(Boolean)
      .map(row => row.split('&').map(cell => cell.trim()));
  },
  ranges(source, token) {
    if (!token.body) return [];

    const rows: Range[][] = [];
    let cells: Range[] = [];
    let cursor = token.body.from;
    let start = cursor;

    const push = (end: number) => cells.push({ from: start, to: end });

    while (cursor < token.body.to) {
      if (source.startsWith('\\\\', cursor)) {
        push(cursor);
        rows.push(cells);
        cells = [];
        cursor += 2;
        start = cursor;
        continue;
      }
      if (source[cursor] === '&') {
        push(cursor);
        cursor += 1;
        start = cursor;
        continue;
      }
      cursor += source[cursor] === '\\' ? 2 : 1;
    }

    if (cursor > start && source.slice(start, token.body.to).trim()) push(token.body.to);
    if (cells.length) rows.push(cells);

    return rows;
  },
  locate(source, token, pos) {
    const rows = table.ranges!(source, token);

    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < rows[row].length; col++) {
        if (pos >= rows[row][col].from && pos <= rows[row][col].to) return { row, col };
      }
    }

    return null;
  },
  serialize(cells, token, text) {
    const offset = token.from;
    const prefix = text.slice(0, (token.body?.from ?? token.to) - offset);
    const suffix = text.slice((token.body?.to ?? token.to) - offset);
    const body = cells.map(row => `  ${row.join(' & ')} \\\\`).join('\n');
    return `${prefix}\n${body}\n${suffix}`;
  }
};

function style(token: Token): TokenStyle | null {
  switch (token.kind) {
    case 'comment':
      return { class: 'cm-lv-comment' };
    case 'math':
      return { widget: 'math', block: token.display };
    case 'table':
      return { class: 'cm-lv-table', block: true };
    case 'heading':
      return { class: `cm-lv-heading cm-lv-h${token.level}`, block: true };
    case 'item':
      return { replaceWith: '•' };
    case 'container':
      return {
        class: LIST_ENVIRONMENTS.has(token.name!) ? 'cm-lv-list' : 'cm-lv-env',
        block: true,
        keepSyntax: VERBATIM_ENVIRONMENTS.has(token.name!)
      };
    case 'command': {
      if (token.name === 'includegraphics') return { widget: 'image' };
      const known = COMMAND_CLASSES.get(token.name!);
      if (known) {
        const color = cssColor(token.meta?.color);
        const border = cssColor(token.meta?.borderColor);
        const properties: string[] = [];
        if (color) properties.push(token.name === 'textcolor' ? `color:${color}` : `background-color:${color}`);
        if (border) properties.push(`box-shadow:inset 0 0 0 1px ${border}`);
        return {
          class: known,
          attributes: properties.length ? { style: properties.join(';') } : undefined
        };
      }
      if (EDITABLE_COMMANDS.has(token.name!)) return { class: 'cm-lv-cmd' };
      return { class: 'cm-lv-cmd-unknown', keepSyntax: true };
    }
    default:
      return null;
  }
}

export const latex: Language = {
  id: 'latex',
  name: 'LaTeX',
  rules,
  style,
  commands,
  table,
  colorCommands: ['textcolor', 'colorbox', 'color', 'fcolorbox'],
  imageSrc(source, token) {
    return token.body ? source.slice(token.body.from, token.body.to).trim() : null;
  }
};

export function setMacroSignatures(signatures: Record<string, { signature?: string } | number>): void {
  for (const name of Object.keys(signatures)) {
    const entry = signatures[name];
    const count = typeof entry === 'number' ? entry : countMandatory(entry.signature);
    if (count > 0) ARGUMENT_COUNT.set(name, count);
  }
}

function countMandatory(signature = ''): number {
  return (signature.match(/m/g) ?? []).length;
}

export { rules } from './rules';
export * from './commands';

registerLanguage(latex);
