import type { FigureAdapter, FigureImage, FigureModel, FigurePanel } from '../../core/language';
import type { Range, Token } from '../../core/tokens';

export const FIGURE_ENVIRONMENTS = new Set([
  'figure', 'figure*', 'wrapfigure', 'wrapfigure*', 'sidewaysfigure', 'sidewaysfigure*',
  'SCfigure', 'SCfigure*', 'marginfigure', 'floatingfigure', 'subfigure'
]);

const PANEL_ENVIRONMENTS = new Set(['subfigure', 'minipage']);
const PANEL_COMMANDS = new Set(['subfloat', 'subfigure', 'subcaptionbox', 'ffigbox']);
const CAPTION_COMMANDS = new Set(['caption', 'caption*', 'subcaption', 'captionof']);

export const figure: FigureAdapter = {
  parse(source, token) {
    const body = token.body;
    if (!body) return null;

    const direct = token.children ?? [];
    const captionToken = direct.find(child => child.kind === 'command' && CAPTION_COMMANDS.has(child.name ?? ''));
    const caption = captionToken ? captionFromCommand(source, captionToken) : undefined;
    const panels: FigurePanel[] = [];
    const panelStarts: number[] = [];

    const candidates = panelTokens(direct);
    for (const child of candidates) {
      const panel = child.kind === 'container'
        ? panelFromRange(source, child, child.body ?? child)
        : panelFromCommand(source, child);
      if (panel.images.length) { panels.push(panel); panelStarts.push(child.from); }
    }

    if (!panels.length) {
      const images = imageTokens(direct).map(token => imageFromToken(source, token));
      if (images.length) {
        const rows = imageRows(source, imageTokens(direct));
        for (const image of images) panels.push({ images: [image] });
        const firstImage = Math.min(...imageTokens(direct).map(image => image.from));
        return decorateModel(source, token, {
          panels,
          caption,
          columns: Math.max(1, rows),
          captionPosition: captionToken && captionToken.from < firstImage ? 'top' : 'bottom'
        });
      }
    }

    if (!panels.length) return null;
    return decorateModel(source, token, {
      panels,
      caption,
      columns: inferredPanelColumns(source, panels, candidates),
      captionPosition: captionToken && panelStarts.length && captionToken.from < Math.min(...panelStarts) ? 'top' : 'bottom'
    });
  }
};

export function isCompositeFigure(source: string, token: Token): boolean {
  if (!token.body) return false;
  if (token.name === 'subfigure' || token.name === 'SCfigure' || token.name === 'SCfigure*') return true;
  const body = source.slice(token.body.from, token.body.to);
  if (/\\begin\{(?:subfigure|minipage)\}/.test(body)) return true;
  if (/\\(?:subfloat|subfigure|subcaptionbox|ffigbox)\b/.test(body)) return true;
  return imageTokens(token.children ?? []).length > 1;
}

export function latexImageStyle(source: string, token: Token): string | null {
  const raw = source.slice(token.from, token.to);
  const options = /^\\includegraphics\*?\s*\[([\s\S]*?)\]/.exec(raw)?.[1];
  if (!options) return null;

  const values = keyValues(options);
  const style: string[] = [];
  const width = latexDimension(values.get('width'));
  const height = latexDimension(values.get('height'));
  if (width) style.push(`width:${width}`);
  if (height) style.push(`height:${height}`);
  if (width || height) style.push('object-fit:contain');

  const angle = safeNumber(values.get('angle'));
  if (angle !== null && angle !== 0) style.push(`rotate:${angle}deg`);

  return style.length ? style.join(';') : null;
}

function decorateModel(source: string, token: Token, model: FigureModel): FigureModel {
  const name = token.name ?? '';
  const tracks = model.panels.map(panel => percent(panel.width));
  if (tracks.length > 1 && tracks.every((value): value is number => value !== null)) {
    model.tracks = tracks.map(value => `${Math.max(1, value)}fr`);
  }
  model.wide = name === 'figure*' || name === 'SCfigure*' || name === 'sidewaysfigure' || name === 'sidewaysfigure*';
  model.align = 'center';
  model.captionPosition = name.startsWith('SCfigure') ? 'side' : (model.captionPosition ?? 'bottom');

  if (name === 'wrapfigure' || name === 'wrapfigure*') {
    const side = token.args?.[0] ? source.slice(token.args[0].from, token.args[0].to).trim().toLowerCase() : '';
    model.align = /l/.test(side) ? 'left' : /r/.test(side) ? 'right' : 'center';
    const width = token.args?.[1] ? latexDimension(source.slice(token.args[1].from, token.args[1].to).trim()) : null;
    if (width) model.width = width;
  }

  return model;
}


function panelTokens(tokens: Token[]): Token[] {
  const result: Token[] = [];
  const visit = (items: Token[]) => {
    for (const token of items) {
      if (token.kind === 'container' && PANEL_ENVIRONMENTS.has(token.name ?? '')) result.push(token);
      else if (token.kind === 'command' && PANEL_COMMANDS.has(token.name ?? '')) result.push(token);
      else if (token.children) visit(token.children);
    }
  };
  visit(tokens);
  return result;
}

function panelFromRange(source: string, token: Token, range: Range): FigurePanel {
  const images = imageTokens(token.children ?? []).map(image => imageFromToken(source, image));
  const captionToken = (token.children ?? []).find(child => child.kind === 'command' && CAPTION_COMMANDS.has(child.name ?? ''));
  const caption = captionToken ? captionFromCommand(source, captionToken) : undefined;
  const width = token.args?.[0] ? latexDimension(source.slice(token.args[0].from, token.args[0].to).trim()) ?? undefined : undefined;
  return { images, caption, width };
}

function panelFromCommand(source: string, token: Token): FigurePanel {
  const images = imageTokens(token.children ?? []).map(image => imageFromToken(source, image));
  let caption: string | undefined;

  if (token.name === 'subcaptionbox' && token.args?.[0]) {
    caption = plainCaption(source.slice(token.args[0].from, token.args[0].to));
  } else if (token.name === 'ffigbox' && token.args && token.args.length >= 2) {
    caption = plainCaption(source.slice(token.args[token.args.length - 2].from, token.args[token.args.length - 2].to));
  } else {
    const raw = source.slice(token.from, token.to);
    const optional = /^\\(?:subfloat|subfigure)\s*\[([\s\S]*?)\]/.exec(raw)?.[1];
    if (optional) caption = plainCaption(optional);
  }

  return { images, caption };
}

function captionFromCommand(source: string, token: Token): string | undefined {
  if (token.name === 'captionof' && token.args && token.args.length > 1) {
    const range = token.args[token.args.length - 1];
    return plainCaption(source.slice(range.from, range.to));
  }
  if (!token.body) return undefined;
  return plainCaption(source.slice(token.body.from, token.body.to));
}

function imageFromToken(source: string, token: Token): FigureImage {
  const src = token.body ? source.slice(token.body.from, token.body.to).trim() : '';
  return {
    src,
    alt: src.slice(src.lastIndexOf('/') + 1),
    style: latexImageStyle(source, token) ?? undefined
  };
}

function imageTokens(tokens: Token[]): Token[] {
  const result: Token[] = [];
  const visit = (items: Token[]) => {
    for (const token of items) {
      if (token.kind === 'command' && (token.name === 'includegraphics' || token.name === 'includegraphics*')) result.push(token);
      else if (token.children) visit(token.children);
    }
  };
  visit(tokens);
  return result;
}

function imageRows(source: string, images: Token[]): number {
  if (images.length <= 1) return 1;
  let current = 1;
  let max = 1;
  for (let index = 1; index < images.length; index++) {
    const between = source.slice(images[index - 1].to, images[index].from);
    if (/\n\s*\n|\\\\|\\(?:par|newline|linebreak)\b/.test(between)) current = 1;
    else current++;
    max = Math.max(max, current);
  }
  return max;
}

function inferredPanelColumns(source: string, panels: FigurePanel[], tokens: Token[]): number {
  if (panels.length <= 1) return 1;
  const widths = panels.map(panel => percent(panel.width)).filter((value): value is number => value !== null);
  if (widths.length === panels.length && widths[0] > 0) {
    return Math.max(1, Math.min(panels.length, Math.floor(100 / Math.max(...widths))));
  }
  if (tokens.length > 1) return panelRows(source, tokens);
  return Math.min(4, panels.length);
}

function panelRows(source: string, panels: Token[]): number {
  let current = 1;
  let max = 1;
  for (let index = 1; index < panels.length; index++) {
    const between = source.slice(panels[index - 1].to, panels[index].from);
    if (/\\\\|\\(?:par|newline|linebreak)\b|\n\s*\n/.test(between)) current = 1;
    else current++;
    max = Math.max(max, current);
  }
  return max;
}

function keyValues(options: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of splitTopLevel(options)) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    result.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return result;
}

function splitTopLevel(value: string): string[] {
  const result: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '{' || char === '[' || char === '(') depth++;
    else if (char === '}' || char === ']' || char === ')') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      result.push(value.slice(start, index));
      start = index + 1;
    }
  }
  result.push(value.slice(start));
  return result;
}

export function latexDimension(value?: string): string | null {
  if (!value) return null;
  const raw = value.trim();
  const relative = /^(?:0?(?:\.\d+)|\d+(?:\.\d+)?)\\(?:textwidth|linewidth|columnwidth)$/.exec(raw);
  if (relative) return `${Math.round(Number(relative[0].split('\\')[0]) * 10000) / 100}%`;
  if (/^\\(?:textwidth|linewidth|columnwidth)$/.test(raw)) return '100%';
  if (/^\d*\.?\d+(?:pt|pc|in|cm|mm|em|ex|px|%)$/.test(raw)) return raw;
  return null;
}

function percent(value?: string): number | null {
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)%$/.exec(value);
  return match ? Number(match[1]) : null;
}

function safeNumber(value?: string): number | null {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  return Number(value);
}

function plainCaption(value: string): string {
  let text = value.trim();
  for (let pass = 0; pass < 4; pass++) {
    text = text.replace(/\\(?:textbf|textit|emph|underline|texttt|textsc|textrm|textsf)\s*\{([^{}]*)\}/g, '$1');
  }
  text = text
    .replace(/\\label\s*\{[^{}]*\}/g, '')
    .replace(/\\(?:protect|centering)\b/g, '')
    .replace(/\\([%&#_$])/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}
