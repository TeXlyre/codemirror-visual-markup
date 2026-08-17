import { cssColor } from '../../core/color';
import { registerLanguage, Language, LanguageCommands, TokenStyle } from '../../core/language';
import { Token } from '../../core/tokens';
import { rules } from './rules';
import { table } from './table';
import { figure, typstImageStyle } from './figure';

const CLASSES = new Map([
  ['strong', 'cm-lv-bold'],
  ['emph', 'cm-lv-italic'],
  ['underline', 'cm-lv-underline'],
  ['ref', 'cm-lv-cmd'],
  ['label', 'cm-lv-cmd']
]);

const commands: LanguageCommands = {
  wrap: {
    bold: ['*', '*'],
    italic: ['_', '_'],
    underline: ['#underline[', ']'],
    mono: ['`', '`'],
    smallcaps: ['#smallcaps[', ']'],
    inlineMath: ['$', '$'],
    displayMath: ['$ ', ' $'],
    quote: ['#quote[', ']']
  },
  heading(level, text) {
    return `${'='.repeat(Math.max(1, level))} ${text}`;
  },
  list(kind, items) {
    const marker = kind === 'number' ? '+' : '-';
    return items.map(entry => `${marker} ${entry}`).join('\n');
  },
  table(rows, cols) {
    const cells = Array.from({ length: rows * cols }, (_, index) => `[Cell ${index + 1}]`);
    const lines: string[] = [];
    for (let row = 0; row < rows; row++) {
      lines.push(`  ${cells.slice(row * cols, row * cols + cols).join(', ')},`);
    }
    return `#table(\n  columns: ${cols},\n${lines.join('\n')}\n)`;
  },
  color(kind, color, text) {
    const value = /^#[0-9a-f]{6}$/i.test(color) ? `rgb("${color}")` : color;
    return kind === 'text' ? `#text(fill: ${value})[${text}]` : `#highlight(fill: ${value})[${text}]`;
  }
};


function style(token: Token): TokenStyle | null {
  switch (token.kind) {
    case 'comment':
      return { class: 'cm-lv-comment' };
    case 'math':
      return { widget: 'math', block: token.display };
    case 'heading':
      return { class: `cm-lv-heading cm-lv-h${Math.min(token.level ?? 1, 3)}`, block: true };
    case 'item':
      return { replaceWith: token.name === 'number' ? '1.' : '•' };
    case 'raw':
      if (token.name === 'argument' || token.name === 'separator') return { hidden: true };
      if (token.name === 'string') return { class: 'cm-lv-string' };
      return token.name ? { class: 'cm-lv-mono', keepSyntax: token.name === 'block' } : null;
    case 'container':
      if (token.meta?.figureCaption === 'true') return { class: 'cm-lv-caption' };
      return { class: 'cm-lv-content' };
    case 'table':
      return { class: 'cm-lv-table', block: true };
    case 'command': {
      if (token.name === 'image') return { widget: 'image' };
      if (token.meta?.figureComposite === 'true') return { widget: 'figure', block: true, keepSyntax: true };
      if (token.meta?.figure === 'true') {
        const classes = ['cm-lv-figure', 'cm-lv-figure-simple'];
        if (token.meta.figureWide === 'true') classes.push('cm-lv-figure-wide');
        if (token.meta.figureCaptionTop === 'true') classes.push('cm-lv-figure-caption-top');
        return { class: classes.join(' '), block: true };
      }
      if (token.meta?.statement) return { class: 'cm-lv-cmd-unknown', keepSyntax: true };
      if (token.meta?.args === 'code') return {};
      if (token.name === 'text' || token.name === 'highlight') {
        const color = cssColor(token.meta?.color);
        if (color) {
          const property = token.name === 'text' ? 'color' : 'background-color';
          return {
            class: token.name === 'text' ? 'cm-lv-colored' : 'cm-lv-colorbox',
            attributes: { style: `${property}:${color}` }
          };
        }
      }
      const known = CLASSES.get(token.name!);
      return known ? { class: known } : { class: 'cm-lv-cmd', keepSyntax: !token.body };
    }
    default:
      return null;
  }
}

export const typst: Language = {
  id: 'typst',
  name: 'Typst',
  rules,
  style,
  commands,
  table,
  figure,
  colorCommands: ['text', 'highlight'],
  imageSrc(source, token) {
    const args = token.args?.[0];
    if (!args) return null;

    const match = /^\s*["']([^"']+)["']/.exec(source.slice(args.from, args.to));
    return match ? match[1] : null;
  },
  imageStyle: typstImageStyle
};

export { rules } from './rules';

registerLanguage(typst);
