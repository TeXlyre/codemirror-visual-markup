import { cssColor } from '../../core/color';
import { registerLanguage, Language, LanguageCommands, TokenStyle } from '../../core/language';
import { Token } from '../../core/tokens';
import { ARGUMENT_COUNT, COMMAND_CLASSES, EDITABLE_COMMANDS, LIST_ENVIRONMENTS, VERBATIM_ENVIRONMENTS } from './commands';
import { rules } from './rules';
import { table } from './table';
import { figure, latexImageStyle } from './figure';


const HIDDEN_LAYOUT_COMMANDS = new Set([
  'centering', 'raggedleft', 'raggedright', 'hfill', 'hfil',
  'hspace', 'hspace*', 'vspace', 'vspace*', 'smallskip', 'medskip', 'bigskip'
]);

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
      if (token.meta?.figureComposite === 'true') return { widget: 'figure', block: true, keepSyntax: true };
      if (token.meta?.figure === 'true') {
        const classes = ['cm-lv-figure', 'cm-lv-figure-simple'];
        if (token.meta.figureWide === 'true') classes.push('cm-lv-figure-wide');
        if (token.meta.figureAlign) classes.push(`cm-lv-figure-${token.meta.figureAlign}`);
        return {
          class: classes.join(' '),
          block: true,
          attributes: token.meta.figureWidth ? { style: `width:${token.meta.figureWidth};max-width:100%` } : undefined
        };
      }
      return {
        class: LIST_ENVIRONMENTS.has(token.name!) ? 'cm-lv-list' : 'cm-lv-env',
        block: true,
        keepSyntax: VERBATIM_ENVIRONMENTS.has(token.name!)
      };
    case 'command': {
      if (token.name === 'includegraphics' || token.name === 'includegraphics*') return { widget: 'image' };
      if (HIDDEN_LAYOUT_COMMANDS.has(token.name ?? '')) return { hidden: true };
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
  figure,
  colorCommands: ['textcolor', 'colorbox', 'color', 'fcolorbox'],
  imageSrc(source, token) {
    return token.body ? source.slice(token.body.from, token.body.to).trim() : null;
  },
  imageStyle: latexImageStyle
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
