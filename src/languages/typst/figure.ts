import type { FigureAdapter, FigureImage, FigureModel, FigurePanel } from '../../core/language';
import type { Range, Token } from '../../core/tokens';

export const figure: FigureAdapter = {
  parse(source, token) {
    if (!token.body) return null;
    return token.name === 'subpar.grid' ? subparModel(source, token.body) : figureModel(source, token.body);
  }
};

export function prepareFigureToken(source: string, token: Token): void {
  if (!token.body || (token.name !== 'figure' && token.name !== 'subpar.grid')) return;
  token.meta = { ...token.meta, figure: 'true' };

  const entries = argumentEntries(source, token.body);
  if (token.name === 'subpar.grid') {
    token.meta.figureComposite = 'true';
    const caption = entries.find(entry => entry.name === 'caption')?.range;
    const bodyRange = caption ? captionBodyRange(source, caption) : null;
    if (bodyRange) markCaptionToken(token.children, bodyRange);
    return;
  }
  const scope = valueOf(source, entries, 'scope');
  if (/^\s*["']parent["']\s*$/.test(scope ?? '')) token.meta.figureWide = 'true';
  const captionEntry = entries.find(entry => entry.name === 'caption');
  if (captionEntry && /\bposition\s*:\s*top\b/.test(source.slice(captionEntry.range.from, captionEntry.range.to))) {
    token.meta.figureCaptionTop = 'true';
  }
  const body = entries.find(entry => !entry.name)?.range;
  if (body) {
    const text = source.slice(body.from, body.to).trim();
    if (/^(?:grid|stack|columns)\s*\(/.test(text) || countCalls(text, 'image') > 1 || countCalls(text, 'figure') > 0) {
      token.meta.figureComposite = 'true';
    }
  }

  const caption = entries.find(entry => entry.name === 'caption')?.range;
  const bodyRange = caption ? captionBodyRange(source, caption) : null;
  if (bodyRange) markCaptionToken(token.children, bodyRange);
}

export function typstImageStyle(source: string, token: Token): string | null {
  if (!token.body) return null;
  const entries = argumentEntries(source, token.body);
  const style: string[] = [];
  const width = dimension(valueOf(source, entries, 'width'));
  const height = dimension(valueOf(source, entries, 'height'));
  if (width) style.push(`width:${width}`);
  if (height) style.push(`height:${height}`);
  if (width || height) style.push('object-fit:contain');
  return style.length ? style.join(';') : null;
}

function figureModel(source: string, range: Range): FigureModel | null {
  const entries = argumentEntries(source, range);
  const body = entries.find(entry => !entry.name)?.range;
  if (!body) return null;

  const bodyText = source.slice(body.from, body.to).trim();
  const captionEntry = entries.find(entry => entry.name === 'caption');
  const caption = captionEntry ? captionText(source, captionEntry.range) : undefined;
  const captionPosition = captionEntry && /\bposition\s*:\s*top\b/.test(source.slice(captionEntry.range.from, captionEntry.range.to))
    ? 'top'
    : 'bottom';

  const panels = panelsFromExpression(source, bodyText);
  if (!panels.length) return null;

  const columns = columnsFromExpression(bodyText, panels.length);
  const scope = valueOf(source, entries, 'scope');
  return {
    panels,
    caption,
    captionPosition,
    columns,
    tracks: tracksFromExpression(bodyText),
    wide: /^\s*["']parent["']\s*$/.test(scope ?? ''),
    align: 'center'
  };
}


function subparModel(source: string, range: Range): FigureModel | null {
  const entries = argumentEntries(source, range);
  const panels: FigurePanel[] = [];
  for (const entry of entries) {
    if (entry.name) continue;
    const text = source.slice(entry.range.from, entry.range.to).trim();
    const nested = panelsFromExpression(source, text);
    panels.push(...nested);
  }
  if (!panels.length) return null;
  const captionEntry = entries.find(entry => entry.name === 'caption');
  const columnsValue = valueOf(source, entries, 'columns');
  let columns = Math.min(4, panels.length);
  if (columnsValue && /^\d+$/.test(columnsValue.trim())) columns = Math.max(1, Number(columnsValue));
  else if (columnsValue?.trim().startsWith('(') && columnsValue.trim().endsWith(')')) {
    columns = Math.max(1, splitArguments(columnsValue.trim().slice(1, -1)).filter(Boolean).length);
  }
  return {
    panels,
    caption: captionEntry ? captionText(source, captionEntry.range) : undefined,
    captionPosition: 'bottom',
    columns,
    tracks: trackList(columnsValue),
    align: 'center'
  };
}

function panelsFromExpression(source: string, expression: string): FigurePanel[] {
  const text = expression.trim();
  if (!text) return [];

  const image = parseCall(text, 'image');
  if (image) return [{ images: [imageFromCall(image)] }];

  const nestedFigure = parseCall(text, 'figure');
  if (nestedFigure) {
    const model = modelFromCall(nestedFigure);
    if (!model) return [];
    const images = model.panels.flatMap(panel => panel.images);
    return images.length ? [{ images, caption: model.caption }] : [];
  }

  const subfigure = parseCall(text, 'subfigure');
  if (subfigure) {
    const entries = argumentStrings(subfigure.args);
    const body = entries.find(entry => !entry.name)?.value ?? '';
    const caption = entries.find(entry => entry.name === 'caption')?.value;
    const nested = panelsFromExpression(source, unwrapContent(body));
    const images = nested.flatMap(panel => panel.images);
    return images.length ? [{ images, caption: caption ? plainCaption(caption) : undefined }] : [];
  }

  for (const name of ['grid', 'stack', 'columns']) {
    const call = parseCall(text, name);
    if (!call) continue;
    const parts = splitArguments(call.args);
    const panels: FigurePanel[] = [];
    for (const part of parts) {
      if (namedArgument(part)) continue;
      const nested = panelsFromExpression(source, unwrapContent(part));
      panels.push(...nested);
    }
    return panels;
  }

  if (text.startsWith('[') && text.endsWith(']')) {
    return scanCalls(text.slice(1, -1));
  }

  return scanCalls(text);
}

function scanCalls(text: string): FigurePanel[] {
  const panels: FigurePanel[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const match = /\b(image|figure|subfigure)\s*\(/g;
    match.lastIndex = cursor;
    const found = match.exec(text);
    if (!found) break;
    const call = parseCall(text.slice(found.index), found[1]);
    if (!call) {
      cursor = found.index + found[0].length;
      continue;
    }
    if (found[1] === 'image') panels.push({ images: [imageFromCall(call)] });
    else if (found[1] === 'subfigure') panels.push(...panelsFromExpression('', call.raw));
    else {
      const model = modelFromCall(call);
      if (model) {
        const images = model.panels.flatMap(panel => panel.images);
        if (images.length) panels.push({ images, caption: model.caption });
      }
    }
    cursor = found.index + call.raw.length;
  }
  return panels;
}

function modelFromCall(call: ParsedCall): FigureModel | null {
  const entries = argumentStrings(call.args);
  const body = entries.find(entry => !entry.name)?.value;
  if (!body) return null;
  const caption = entries.find(entry => entry.name === 'caption')?.value;
  const panels = panelsFromExpression('', body);
  return panels.length ? {
    panels,
    caption: caption ? plainCaption(caption) : undefined,
    columns: columnsFromExpression(body, panels.length),
    captionPosition: caption && /\bposition\s*:\s*top\b/.test(caption) ? 'top' : 'bottom'
  } : null;
}

function imageFromCall(call: ParsedCall): FigureImage {
  const entries = argumentStrings(call.args);
  const path = entries.find(entry => !entry.name)?.value ?? '';
  const src = unquote(path.trim());
  const style: string[] = [];
  const width = dimension(entries.find(entry => entry.name === 'width')?.value);
  const height = dimension(entries.find(entry => entry.name === 'height')?.value);
  if (width) style.push(`width:${width}`);
  if (height) style.push(`height:${height}`);
  if (width || height) style.push('object-fit:contain');
  return {
    src,
    alt: src.slice(src.lastIndexOf('/') + 1),
    style: style.length ? style.join(';') : undefined
  };
}


function tracksFromExpression(expression: string): string[] | undefined {
  const grid = parseCall(expression.trim(), 'grid');
  if (!grid) return undefined;
  const value = argumentStrings(grid.args).find(item => item.name === 'columns')?.value;
  return trackList(value);
}

function trackList(value?: string): string[] | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text.startsWith('(') || !text.endsWith(')')) return undefined;
  const tracks = splitArguments(text.slice(1, -1)).map(track => safeTrack(track.trim()));
  return tracks.every((track): track is string => Boolean(track)) ? tracks : undefined;
}

function safeTrack(value: string): string | null {
  if (value === 'auto') return 'auto';
  if (/^\d*\.?\d+fr$/.test(value)) return value;
  if (/^\d*\.?\d+(?:pt|pc|in|cm|mm|em|ex|px|%)$/.test(value)) return value;
  return null;
}

function columnsFromExpression(expression: string, fallback: number): number {
  const grid = parseCall(expression.trim(), 'grid');
  if (grid) {
    const entry = argumentStrings(grid.args).find(item => item.name === 'columns')?.value?.trim();
    if (entry && /^\d+$/.test(entry)) return Math.max(1, Number(entry));
    if (entry?.startsWith('(') && entry.endsWith(')')) {
      return Math.max(1, splitArguments(entry.slice(1, -1)).filter(Boolean).length);
    }
  }
  if (parseCall(expression.trim(), 'stack')) return 1;
  return Math.max(1, Math.min(4, fallback));
}

interface Entry { name?: string; range: Range }

function argumentEntries(source: string, range: Range): Entry[] {
  return splitRanges(source, range).map(item => {
    const trimmed = trimRange(source, item);
    const text = source.slice(trimmed.from, trimmed.to);
    const named = /^([a-zA-Z][\w-]*)\s*:/.exec(text);
    if (!named) return { range: trimmed };
    const offset = text.indexOf(':') + 1;
    const value = trimRange(source, { from: trimmed.from + offset, to: trimmed.to });
    return { name: named[1], range: value };
  });
}

function valueOf(source: string, entries: Entry[], name: string): string | undefined {
  const range = entries.find(entry => entry.name === name)?.range;
  return range ? source.slice(range.from, range.to).trim() : undefined;
}

function captionText(source: string, range: Range): string {
  return plainCaption(source.slice(range.from, range.to));
}

function captionBodyRange(source: string, range: Range): Range | null {
  const trimmed = trimRange(source, range);
  if (source[trimmed.from] === '[') {
    const block = delimitedRange(source, trimmed.from, '[', ']', trimmed.to);
    return block ? { from: block.from + 1, to: block.to - 1 } : null;
  }
  const raw = source.slice(trimmed.from, trimmed.to);
  const call = /^figure\.caption\s*\(/.exec(raw);
  if (!call) return null;
  const open = trimmed.from + call[0].lastIndexOf('(');
  const parens = delimitedRange(source, open, '(', ')', trimmed.to);
  if (!parens) return null;
  const entries = argumentEntries(source, { from: parens.from + 1, to: parens.to - 1 });
  const positional = entries.filter(entry => !entry.name);
  const last = positional[positional.length - 1]?.range;
  if (!last) return null;
  const value = trimRange(source, last);
  if (source[value.from] !== '[') return value;
  const block = delimitedRange(source, value.from, '[', ']', value.to);
  return block ? { from: block.from + 1, to: block.to - 1 } : value;
}

function markCaptionToken(tokens: Token[] | undefined, body: Range): boolean {
  if (!tokens) return false;
  for (const token of tokens) {
    if (token.body?.from === body.from && token.body.to === body.to) {
      token.meta = { ...token.meta, figureCaption: 'true' };
      return true;
    }
    if (markCaptionToken(token.children, body)) return true;
  }
  return false;
}

interface ParsedCall { name: string; args: string; raw: string }

function parseCall(text: string, name: string): ParsedCall | null {
  const match = new RegExp(`^${escapeRegExp(name)}\\s*\\(`).exec(text);
  if (!match) return null;
  const open = text.indexOf('(', match.index);
  const end = matching(text, open, '(', ')');
  if (end < 0) return null;
  return { name, args: text.slice(open + 1, end), raw: text.slice(0, end + 1) };
}

function argumentStrings(args: string): Array<{ name?: string; value: string }> {
  return splitArguments(args).map(part => {
    const trimmed = part.trim();
    const match = /^([a-zA-Z][\w-]*)\s*:\s*([\s\S]*)$/.exec(trimmed);
    return match ? { name: match[1], value: match[2] } : { value: trimmed };
  });
}

function splitArguments(value: string): string[] {
  const result: string[] = [];
  let start = 0;
  const stack: string[] = [];
  let quote = '';
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') stack.push(')');
    else if (char === '[') stack.push(']');
    else if (char === '{') stack.push('}');
    else if (stack.length && char === stack[stack.length - 1]) stack.pop();
    else if (char === ',' && stack.length === 0) {
      result.push(value.slice(start, index));
      start = index + 1;
    }
  }
  result.push(value.slice(start));
  return result;
}

function splitRanges(source: string, range: Range): Range[] {
  const result: Range[] = [];
  let start = range.from;
  const stack: string[] = [];
  let quote = '';
  for (let cursor = range.from; cursor < range.to; cursor++) {
    const char = source[cursor];
    if (quote) {
      if (char === '\\') cursor++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') stack.push(')');
    else if (char === '[') stack.push(']');
    else if (char === '{') stack.push('}');
    else if (stack.length && char === stack[stack.length - 1]) stack.pop();
    else if (char === ',' && stack.length === 0) {
      result.push({ from: start, to: cursor });
      start = cursor + 1;
    }
  }
  if (start < range.to) result.push({ from: start, to: range.to });
  return result;
}

function trimRange(source: string, range: Range): Range {
  let { from, to } = range;
  while (from < to && /\s/.test(source[from])) from++;
  while (to > from && /\s/.test(source[to - 1])) to--;
  return { from, to };
}

function delimitedRange(source: string, from: number, open: string, close: string, limit: number): Range | null {
  if (source[from] !== open) return null;
  let depth = 1;
  let quote = '';
  for (let cursor = from + 1; cursor < limit; cursor++) {
    const char = source[cursor];
    if (quote) {
      if (char === '\\') cursor++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === open) depth++;
    else if (char === close && --depth === 0) return { from, to: cursor + 1 };
  }
  return null;
}

function matching(text: string, from: number, open: string, close: string): number {
  let depth = 1;
  let quote = '';
  for (let cursor = from + 1; cursor < text.length; cursor++) {
    const char = text[cursor];
    if (quote) {
      if (char === '\\') cursor++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === open) depth++;
    else if (char === close && --depth === 0) return cursor;
  }
  return -1;
}

function namedArgument(value: string): boolean {
  return /^[a-zA-Z][\w-]*\s*:/.test(value.trim());
}

function unwrapContent(value: string): string {
  const text = value.trim();
  return text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text;
}

function countCalls(text: string, name: string): number {
  return (text.match(new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, 'g')) ?? []).length;
}

function dimension(value?: string): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (raw === 'auto') return null;
  if (/^\d*\.?\d+(?:pt|pc|in|cm|mm|em|ex|px|%)$/.test(raw)) return raw;
  return null;
}

function unquote(value: string): string {
  const text = value.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function plainCaption(value: string): string {
  let text = value.trim();
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  const nested = /^figure\.caption\s*\(([\s\S]*)\)$/.exec(text);
  if (nested) {
    const parts = argumentStrings(nested[1]).filter(entry => !entry.name);
    text = parts[parts.length - 1]?.value ?? text;
    if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  }
  return text
    .replace(/#(?:strong|emph|underline|smallcaps|text)\([^)]*\)?\[([\s\S]*?)\]/g, '$1')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
